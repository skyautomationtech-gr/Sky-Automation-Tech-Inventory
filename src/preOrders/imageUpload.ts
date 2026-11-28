import {
  compressSingleImage,
  deleteMediaObject,
  MediaUploadResult,
  uploadDocumentAsset,
  uploadImageAsset,
  validateDocumentUploadFile,
  validateImageUploadFile,
} from '../utils/mediaUpload';

export interface CompressedImageResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
}

export function validateImageFile(file: File): string | null {
  return validateImageUploadFile(file);
}

export async function compressImageFile(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.8
): Promise<CompressedImageResult> {
  return compressSingleImage(file, maxDimension, quality);
}

/**
 * Compresses an image client-side (<= 1280px, WebP/JPEG ~0.8, target <250KB)
 * and uploads it to Firebase Storage (`preOrders/{folder}/...`) with stall detection,
 * 3x retry + non-resumable fallback, 60s timeout, and <=40KB fallback when Storage is unavailable.
 */
export async function uploadPreOrderImage(
  file: File,
  folder: 'products' | 'receipts',
  options?: {
    onProgress?: (pct: number) => void;
    onPhase?: (phase: 'preparing' | 'uploading') => void;
    generateThumb?: boolean;
    signal?: AbortSignal;
  }
): Promise<MediaUploadResult> {
  return uploadImageAsset(file, {
    folderPath: `preOrders/${folder}`,
    maxDimension: 1280,
    quality: 0.8,
    generateThumb: options?.generateThumb ?? folder === 'products',
    onPhase: options?.onPhase,
    onProgress: options?.onProgress,
    signal: options?.signal,
  });
}

export function validatePreOrderDocumentFile(file: File): string | null {
  return validateDocumentUploadFile(file);
}

export interface UploadedPreOrderDocument {
  url: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  fileName: string;
  fallbackUsed?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validates (JPG/PNG/WebP/HEIC/PDF), compresses images (<= 1280px, <250KB),
 * and uploads to Firebase Storage under preOrders/{preOrderId}/docs/...
 */
export async function uploadPreOrderDocument(
  preOrderId: string,
  file: File,
  options?: {
    onProgress?: (pct: number) => void;
    onPhase?: (phase: 'preparing' | 'uploading') => void;
    signal?: AbortSignal;
  }
): Promise<UploadedPreOrderDocument> {
  return uploadDocumentAsset(file, `preOrders/${preOrderId}/docs`, options);
}

export { deleteMediaObject };
