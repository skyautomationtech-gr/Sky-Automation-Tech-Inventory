import { ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { perfEndTimer, perfStartTimer } from '../utils/perfLogger';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_RAW_SIZE_BYTES = 10 * 1024 * 1024; // 10MB raw limit prior to compression
const TARGET_MAX_BYTES = 250 * 1024;

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    return 'Unsupported file format. Please upload a JPG, PNG, or WebP image.';
  }
  if (file.size > MAX_RAW_SIZE_BYTES) {
    return 'Image file exceeds 10MB maximum limit.';
  }
  return null;
}

let cachedWebpSupport: boolean | null = null;
function supportsWebpEncode(): boolean {
  if (cachedWebpSupport !== null) return cachedWebpSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    cachedWebpSupport = c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    cachedWebpSupport = false;
  }
  return cachedWebpSupport;
}

async function decodeImageSource(
  file: File
): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        cleanup: () => {
          try {
            bitmap.close();
          } catch {}
        },
      };
    } catch {
      // Fallback to HTMLImageElement
    }
  }

  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(objectUrl),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Invalid or corrupted image file.'));
    };
    img.src = objectUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to encode image asset.'));
    reader.readAsDataURL(blob);
  });
}

async function encodeCanvasBlob(
  drawFn: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void,
  width: number,
  height: number,
  mimeType: string,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const off = new OffscreenCanvas(width, height);
      const ctx = off.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        drawFn(ctx, width, height);
        return await off.convertToBlob({ type: mimeType, quality });
      }
    } catch {
      // Fallback to DOM canvas
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas compression unavailable in this browser.');
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  drawFn(ctx, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('Failed to compress image.'));
        else resolve(b);
      },
      mimeType,
      quality
    );
  });
}

export async function compressImageFile(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.8
): Promise<CompressedImageResult> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);

  const decoded = await decodeImageSource(file);
  try {
    let { width, height } = decoded;
    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }
    width = Math.max(1, width);
    height = Math.max(1, height);

    const preferWebp = supportsWebpEncode();
    const mimeType = preferWebp ? 'image/webp' : 'image/jpeg';

    let blob = await encodeCanvasBlob(decoded.draw, width, height, mimeType, quality);
    if (blob.size > TARGET_MAX_BYTES && quality > 0.68) {
      blob = await encodeCanvasBlob(decoded.draw, width, height, mimeType, 0.7);
    }
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, mimeType, sizeBytes: blob.size };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Compresses an image client-side (<= 1280px, WebP/JPEG ~0.8, target <250KB)
 * and uploads it to Firebase Storage with optional progress tracking.
 */
export async function uploadPreOrderImage(
  file: File,
  folder: 'products' | 'receipts',
  options?: { onProgress?: (pct: number) => void; generateThumb?: boolean }
): Promise<{ url: string; thumbUrl?: string; storageUploaded: boolean }> {
  perfStartTimer('photo_upload_preorder');
  options?.onProgress?.(10);

  const maxDim = folder === 'receipts' ? 1280 : 1280;
  const [compressed, thumb] = await Promise.all([
    compressImageFile(file, maxDim, 0.8),
    options?.generateThumb ? compressImageFile(file, 200, 0.72).catch(() => null) : Promise.resolve(null),
  ]);
  options?.onProgress?.(35);

  if (storage) {
    try {
      const ext = compressed.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const storageRef = ref(storage, `preOrders/${folder}/${stamp}_${safeName}.${ext}`);

      const mainUploadTask = uploadBytesResumable(storageRef, compressed.blob, {
        contentType: compressed.mimeType,
        cacheControl: 'public,max-age=31536000',
      });

      const url = await new Promise<string>((resolve, reject) => {
        mainUploadTask.on(
          'state_changed',
          (snapshot) => {
            if (snapshot.totalBytes > 0) {
              const pct = 35 + Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 55);
              options?.onProgress?.(Math.min(95, pct));
            }
          },
          reject,
          async () => {
            try {
              const dl = await getDownloadURL(mainUploadTask.snapshot.ref);
              resolve(dl);
            } catch (e) {
              reject(e);
            }
          }
        );
      });

      let thumbUrl: string | undefined;
      if (thumb) {
        try {
          const thumbExt = thumb.mimeType === 'image/webp' ? 'webp' : 'jpg';
          const thumbRef = ref(storage, `preOrders/${folder}/thumbs/${stamp}_${safeName}_thumb.${thumbExt}`);
          const thumbSnap = await uploadBytes(thumbRef, thumb.blob, {
            contentType: thumb.mimeType,
            cacheControl: 'public,max-age=31536000',
          });
          thumbUrl = await getDownloadURL(thumbSnap.ref);
        } catch {
          // Optional thumbnail
        }
      }

      options?.onProgress?.(100);
      perfEndTimer('photo_upload_preorder', `${(compressed.sizeBytes / 1024).toFixed(1)}KB`);
      return { url, thumbUrl, storageUploaded: true };
    } catch (storageErr) {
      console.warn('Firebase Storage upload fell back to compressed inline asset:', storageErr);
    }
  }

  // Ensure inline fallback remains compact (<180KB) for Firestore document safety
  let fallbackUrl = compressed.dataUrl;
  if (compressed.sizeBytes > 180 * 1024) {
    const tight = await compressImageFile(file, 640, 0.65);
    fallbackUrl = tight.dataUrl;
  }
  options?.onProgress?.(100);
  perfEndTimer('photo_upload_preorder', 'inline-fallback');
  return { url: fallbackUrl, thumbUrl: thumb?.dataUrl, storageUploaded: false };
}

const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024; // 5MB strict limit

export function validatePreOrderDocumentFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const validExt = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext);
  if (!ALLOWED_DOC_TYPES.includes(mime) && !validExt) {
    return 'Unsupported file type. Allowed formats: JPG, PNG, WebP, or PDF.';
  }
  if (file.size > MAX_DOC_SIZE_BYTES) {
    return 'File size exceeds the 5MB maximum limit.';
  }
  return null;
}

export interface UploadedPreOrderDocument {
  url: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  fileName: string;
}

/**
 * Validates (JPG/PNG/WebP/PDF, <= 5MB), compresses images if > 400KB,
 * and uploads to Firebase Storage under preOrders/{preOrderId}/docs/{timestamp}_{safeName}.
 */
export async function uploadPreOrderDocument(
  preOrderId: string,
  file: File
): Promise<UploadedPreOrderDocument> {
  const err = validatePreOrderDocumentFile(file);
  if (err) throw new Error(err);
  if (!storage) {
    throw new Error('Firebase Storage is not initialized.');
  }

  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'document';
  const isPdf =
    file.type.toLowerCase() === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  let uploadBody: Blob = file;
  let contentType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');
  let finalName = safeBase;
  let finalSize = file.size;

  if (!isPdf && file.size > 400 * 1024) {
    const compressed = await compressImageFile(file, 1280, 0.8);
    uploadBody = compressed.blob;
    contentType = compressed.mimeType;
    finalSize = compressed.sizeBytes;
    const targetExt = contentType === 'image/webp' ? '.webp' : '.jpg';
    finalName = `${finalName.replace(/\.[^.]+$/, '')}${targetExt}`;
  }

  const storagePath = `preOrders/${preOrderId}/docs/${Date.now()}_${finalName}`;
  const storageRef = ref(storage, storagePath);
  const snap = await uploadBytes(storageRef, uploadBody, {
    contentType,
    cacheControl: 'public,max-age=31536000',
  });
  const url = await getDownloadURL(snap.ref);

  return {
    url,
    storagePath,
    contentType,
    fileSize: finalSize,
    fileName: file.name,
  };
}
