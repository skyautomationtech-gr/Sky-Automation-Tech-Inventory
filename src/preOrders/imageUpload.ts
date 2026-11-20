import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_RAW_SIZE_BYTES = 10 * 1024 * 1024; // 10MB raw limit prior to compression

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
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

export async function compressImageFile(
  file: File,
  maxDimension: number = 900,
  quality: number = 0.78
): Promise<CompressedImageResult> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas compression unavailable in this browser.'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image.'));
              return;
            }
            resolve({ blob, dataUrl, sizeBytes: blob.size });
          },
          'image/jpeg',
          quality
        );
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image client-side and uploads it to Firebase Storage.
 * Falls back gracefully to the compact compressed JPEG data URL if Storage
 * permissions are restricted in the environment.
 */
export async function uploadPreOrderImage(
  file: File,
  folder: 'products' | 'receipts'
): Promise<{ url: string; storageUploaded: boolean }> {
  const compressed = await compressImageFile(file, folder === 'receipts' ? 1000 : 880, 0.75);

  if (storage) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 48);
      const storageRef = ref(storage, `preOrders/${folder}/${Date.now()}_${safeName}.jpg`);
      const snap = await uploadBytes(storageRef, compressed.blob, {
        contentType: 'image/jpeg',
      });
      const downloadUrl = await getDownloadURL(snap.ref);
      return { url: downloadUrl, storageUploaded: true };
    } catch (storageErr) {
      console.warn('Firebase Storage upload fell back to compressed inline asset:', storageErr);
    }
  }

  // Ensure inline fallback remains compact (<180KB) for Firestore document safety
  if (compressed.sizeBytes > 180 * 1024) {
    const tight = await compressImageFile(file, 640, 0.65);
    return { url: tight.dataUrl, storageUploaded: false };
  }

  return { url: compressed.dataUrl, storageUploaded: false };
}
