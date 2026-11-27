import { ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { Product, ProductEditChange, Variant } from '../types';
import { perfEndTimer, perfStartTimer } from './perfLogger';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_RAW_SIZE_BYTES = 15 * 1024 * 1024; // 15MB raw upload limit prior to compression
const TARGET_MAX_BYTES = 250 * 1024;

export function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) {
    return false;
  }
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/') ||
    lower.startsWith('blob:') ||
    trimmed.startsWith('/')
  );
}

function extractImageEntry(item: unknown): string | null {
  if (typeof item === 'string') {
    const trimmed = item.trim();
    return isSafeImageSrc(trimmed) ? trimmed : null;
  }
  if (item && typeof item === 'object') {
    const obj = item as Record<string, unknown>;
    const candidate = obj.url ?? obj.downloadUrl ?? obj.src ?? obj.imageUrl;
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      return isSafeImageSrc(trimmed) ? trimmed : null;
    }
  }
  return null;
}

/**
 * Normalizes product image lists across `images`, `imageUrls`, `imageUrl`, `image`, and `productImage`,
 * deduplicating while preserving primary cover order.
 */
export function normalizeProductImages(data: any): string[] {
  if (!data || typeof data !== 'object') return [];
  const rawList: unknown[] = [];

  if (Array.isArray(data.images)) rawList.push(...data.images);
  else if (typeof data.images === 'string') rawList.push(data.images);

  if (Array.isArray(data.imageUrls)) rawList.push(...data.imageUrls);
  else if (typeof data.imageUrls === 'string') rawList.push(data.imageUrls);

  if (data.imageUrl) rawList.push(data.imageUrl);
  if (data.image) rawList.push(data.image);
  if (data.productImage) rawList.push(data.productImage);

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawList) {
    const extracted = extractImageEntry(item);
    if (extracted && !seen.has(extracted)) {
      seen.add(extracted);
      result.push(extracted);
    }
  }
  return result;
}

export function validateProductImageFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const validExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  if (!ALLOWED_IMAGE_TYPES.includes(mime) && !validExt) {
    return `"${file.name}" is not a supported image format (use JPG, PNG, WebP, or GIF).`;
  }
  if (file.size > MAX_RAW_SIZE_BYTES) {
    return `"${file.name}" exceeds the 15MB maximum file size.`;
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

async function decodeProductImageSource(file: File): Promise<{
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void;
  cleanup: () => void;
}> {
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
      reject(new Error(`"${file.name}" could not be decoded as an image.`));
    };
    img.src = objectUrl;
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read encoded image.'));
    reader.readAsDataURL(blob);
  });
}

async function encodeProductCanvasBlob(
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
    throw new Error('Image compression canvas is unavailable in this browser.');
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

export async function compressProductImageFile(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.8
): Promise<{ blob: Blob; dataUrl: string; mimeType: string; sizeBytes: number }> {
  const validationErr = validateProductImageFile(file);
  if (validationErr) throw new Error(validationErr);

  const decoded = await decodeProductImageSource(file);
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

    const mimeType = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
    let blob = await encodeProductCanvasBlob(decoded.draw, width, height, mimeType, quality);
    if (blob.size > TARGET_MAX_BYTES && quality > 0.68) {
      blob = await encodeProductCanvasBlob(decoded.draw, width, height, mimeType, 0.7);
    }
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, mimeType, sizeBytes: blob.size };
  } finally {
    decoded.cleanup();
  }
}

/**
 * Compresses the product photo (<= 1280px, WebP/JPEG ~0.8, target <250KB) plus a ~200px thumbnail,
 * and uploads both to Firebase Storage (`products/{key}/...`) with progress reporting.
 */
export async function uploadProductImage(
  file: File,
  skuOrKey?: string,
  options?: { onProgress?: (pct: number) => void }
): Promise<{ url: string; thumbUrl?: string; storageUploaded: boolean }> {
  perfStartTimer('photo_upload_product');
  options?.onProgress?.(10);

  const [compressed, thumb] = await Promise.all([
    compressProductImageFile(file, 1280, 0.8),
    compressProductImageFile(file, 200, 0.72).catch(() => null),
  ]);
  options?.onProgress?.(35);

  if (storage) {
    try {
      const safeFolder =
        (skuOrKey || 'catalog')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40) || 'catalog';
      const safeName =
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 40) || 'photo';
      const ext = compressed.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const storageRef = ref(
        storage,
        `products/${safeFolder}/${stamp}_${safeName}.${ext}`
      );

      const uploadTask = uploadBytesResumable(storageRef, compressed.blob, {
        contentType: compressed.mimeType,
        cacheControl: 'public,max-age=31536000',
      });

      const downloadUrl = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
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
              const dl = await getDownloadURL(uploadTask.snapshot.ref);
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
          const thumbRef = ref(
            storage,
            `products/${safeFolder}/thumbs/${stamp}_${safeName}_thumb.${thumbExt}`
          );
          const thumbSnap = await uploadBytes(thumbRef, thumb.blob, {
            contentType: thumb.mimeType,
            cacheControl: 'public,max-age=31536000',
          });
          thumbUrl = await getDownloadURL(thumbSnap.ref);
        } catch {
          // Optional thumbnail upload failed safely
        }
      }

      options?.onProgress?.(100);
      perfEndTimer('photo_upload_product', `${(compressed.sizeBytes / 1024).toFixed(1)}KB`);
      return { url: downloadUrl, thumbUrl, storageUploaded: true };
    } catch (storageErr) {
      console.warn('Product Storage upload fell back to compact inline image:', storageErr);
    }
  }

  // Keep inline fallback strictly compact (<= 115KB) so up to 6-8 photos still stay under Firestore's 1 MiB limit
  let fallbackUrl = compressed.dataUrl;
  if (compressed.sizeBytes > 115 * 1024) {
    const tight = await compressProductImageFile(file, 720, 0.65);
    fallbackUrl = tight.dataUrl;
    if (tight.sizeBytes > 125 * 1024) {
      const extraTight = await compressProductImageFile(file, 560, 0.55);
      fallbackUrl = extraTight.dataUrl;
    }
  }
  options?.onProgress?.(100);
  perfEndTimer('photo_upload_product', 'inline-fallback');
  return { url: fallbackUrl, thumbUrl: thumb?.dataUrl, storageUploaded: false };
}

export function buildCategoryPathLabel(product: {
  mainCategory?: string;
  subCategory?: string;
  childCategory?: string;
  category?: string;
}): string {
  const parts = [
    product.mainCategory || product.category || '',
    product.subCategory || '',
    product.childCategory || '',
  ]
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' → ') : 'Uncategorized';
}

function formatVariantsSummary(variants: Variant[] = []): string {
  if (!variants.length) return 'None';
  return variants
    .map((v) => `${v.color || 'Default'} / ${v.model || 'Standard'}: ${Number(v.stock) || 0} pcs`)
    .join('; ');
}

/**
 * Generates structured before/after field diffs between an existing Product and an updated payload.
 */
export function buildProductFieldDiff(
  before: Product,
  after: Partial<Product>,
  includeCostPrice: boolean
): ProductEditChange[] {
  const changes: ProductEditChange[] = [];

  const pushIfChanged = (
    field: string,
    label: string,
    prevVal: string,
    nextVal: string
  ) => {
    if (prevVal !== nextVal) {
      changes.push({
        field,
        label,
        before: prevVal || '—',
        after: nextVal || '—',
      });
    }
  };

  if (after.name !== undefined) {
    pushIfChanged('name', 'Product Name', before.name || '', after.name || '');
  }
  if (after.sku !== undefined) {
    pushIfChanged('sku', 'SKU', before.sku || '', after.sku || '');
  }
  if (after.subBrand !== undefined) {
    pushIfChanged('subBrand', 'Sub-Brand', before.subBrand || '', after.subBrand || '');
  }

  const prevCat = buildCategoryPathLabel(before);
  const nextCat = buildCategoryPathLabel({
    mainCategory: after.mainCategory ?? before.mainCategory,
    subCategory: after.subCategory ?? before.subCategory,
    childCategory: after.childCategory ?? before.childCategory,
    category: after.category ?? before.category,
  });
  pushIfChanged('category', 'Category', prevCat, nextCat);

  if (after.brand !== undefined) {
    pushIfChanged('brand', 'Brand', before.brand || '', after.brand || '');
  }
  if (after.description !== undefined) {
    pushIfChanged(
      'description',
      'Description',
      (before.description || '').trim(),
      (after.description || '').trim()
    );
  }
  if (after.notes !== undefined) {
    pushIfChanged(
      'notes',
      'Notes',
      (before.notes || '').trim(),
      (after.notes || '').trim()
    );
  }
  if (includeCostPrice && after.costPrice !== undefined) {
    if (Number(before.costPrice) !== Number(after.costPrice)) {
      changes.push({
        field: 'costPrice',
        label: 'Purchase Price',
        before: `৳${Number(before.costPrice || 0).toLocaleString()}`,
        after: `৳${Number(after.costPrice || 0).toLocaleString()}`,
      });
    }
  }
  if (after.sellingPrice !== undefined) {
    if (Number(before.sellingPrice) !== Number(after.sellingPrice)) {
      changes.push({
        field: 'sellingPrice',
        label: 'Selling Price',
        before: `৳${Number(before.sellingPrice || 0).toLocaleString()}`,
        after: `৳${Number(after.sellingPrice || 0).toLocaleString()}`,
      });
    }
  }
  if (after.reorderThreshold !== undefined) {
    if (Number(before.reorderThreshold) !== Number(after.reorderThreshold)) {
      changes.push({
        field: 'reorderThreshold',
        label: 'Reorder Threshold',
        before: `${Number(before.reorderThreshold ?? 0)} pcs`,
        after: `${Number(after.reorderThreshold ?? 0)} pcs`,
      });
    }
  }

  if (after.images !== undefined) {
    const prevImgs = before.images || [];
    const nextImgs = after.images || [];
    const sameImages =
      prevImgs.length === nextImgs.length &&
      prevImgs.every((u, idx) => u === nextImgs[idx]);
    if (!sameImages) {
      const detail =
        prevImgs.length === nextImgs.length
          ? `${prevImgs.length} photo(s) (reordered/updated)`
          : `${prevImgs.length} photo(s) → ${nextImgs.length} photo(s)`;
      changes.push({
        field: 'images',
        label: 'Photos',
        before: `${prevImgs.length} photo(s)`,
        after: detail,
      });
    }
  }

  if (after.variants !== undefined) {
    const prevSummary = formatVariantsSummary(before.variants || []);
    const nextSummary = formatVariantsSummary(after.variants || []);
    if (prevSummary !== nextSummary) {
      changes.push({
        field: 'variants',
        label: 'Variants & Stock',
        before: prevSummary,
        after: nextSummary,
      });
    }
  }

  return changes;
}
