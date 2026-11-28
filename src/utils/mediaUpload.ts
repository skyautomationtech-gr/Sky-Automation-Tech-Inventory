import {
  ref,
  uploadBytesResumable,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { auth, authPersistenceReady, storage } from '../firebase/config';
import { perfEndTimer, perfStartTimer } from './perfLogger';

export const MAX_RAW_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB original photo cap
export const MAX_RAW_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB PDF / doc cap
export const TARGET_IMAGE_BYTES = 250 * 1024; // ~250 KB ideal target
export const HARD_MAX_COMPRESSED_BYTES = 300 * 1024; // < 300 KB hard ceiling
export const TARGET_THUMB_BYTES = 30 * 1024; // < 30 KB thumbnail
export const COMPACT_FALLBACK_MAX_BYTES = 30 * 1024; // ~30 KB binary => ~40 KB base64 string
export const MAX_CONCURRENT_UPLOADS = 3;
export const STALL_TIMEOUT_MS = 15_000; // 15s no-progress stall threshold
export const OVERALL_UPLOAD_TIMEOUT_MS = 60_000; // 60s overall hard deadline

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
  'image/bmp',
]);

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'heic',
  'heif',
  'avif',
  'bmp',
]);

export interface CompressedMediaResult {
  blob: Blob;
  dataUrl: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface MediaUploadResult {
  url: string;
  thumbUrl?: string;
  storagePath?: string;
  thumbStoragePath?: string;
  storageUploaded: boolean;
  fallbackUsed: boolean;
  sizeBytes: number;
  originalSizeBytes: number;
  thumbSizeBytes?: number;
  errorCode?: string;
  errorMessage?: string;
}

export class MediaUploadError extends Error {
  code: string;
  isTerminalStorageUnavailable: boolean;
  constructor(code: string, message: string, isTerminalStorageUnavailable = false) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
    this.isTerminalStorageUnavailable = isTerminalStorageUnavailable;
  }
}

export function formatBytesCompact(bytes?: number): string {
  const n = Number(bytes || 0);
  if (!n || n <= 0) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateImageUploadFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeAllowed = ALLOWED_IMAGE_MIME_TYPES.has(mime) || mime.startsWith('image/');
  const extAllowed = ALLOWED_IMAGE_EXTENSIONS.has(ext);
  if (!mimeAllowed && !extAllowed) {
    return `"${file.name}" is not a valid image file (only JPG, PNG, WebP, GIF, or HEIC images up to 8 MB are allowed).`;
  }
  if (file.size <= 0) {
    return `"${file.name}" appears to be empty.`;
  }
  if (file.size > MAX_RAW_IMAGE_BYTES) {
    return `"${file.name}" (${formatBytesCompact(file.size)}) exceeds the 8 MB maximum image size.`;
  }
  return null;
}

export function validateDocumentUploadFile(file: File): string | null {
  const mime = (file.type || '').toLowerCase();
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isPdf = mime === 'application/pdf' || ext === 'pdf';
  if (isPdf) {
    if (file.size > MAX_RAW_DOCUMENT_BYTES) {
      return `"${file.name}" exceeds the 5 MB PDF limit.`;
    }
    return null;
  }
  return validateImageUploadFile(file);
}

// ==========================================
// CONCURRENCY LIMITER (MAX 3 PARALLEL UPLOADS)
// ==========================================

let activeUploadCount = 0;
const uploadWaitQueue: Array<() => void> = [];

async function acquireUploadSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) {
    throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
  }
  if (activeUploadCount < MAX_CONCURRENT_UPLOADS) {
    activeUploadCount += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        activeUploadCount = Math.max(0, activeUploadCount - 1);
        const next = uploadWaitQueue.shift();
        if (next) next();
      }
    };
  }

  return new Promise<() => void>((resolve, reject) => {
    const onAbort = () => {
      const idx = uploadWaitQueue.indexOf(grant);
      if (idx >= 0) uploadWaitQueue.splice(idx, 1);
      reject(new MediaUploadError('storage/canceled', 'Upload cancelled.'));
    };

    const grant = () => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        const next = uploadWaitQueue.shift();
        if (next) next();
        reject(new MediaUploadError('storage/canceled', 'Upload cancelled.'));
        return;
      }
      activeUploadCount += 1;
      let released = false;
      resolve(() => {
        if (!released) {
          released = true;
          activeUploadCount = Math.max(0, activeUploadCount - 1);
          const next = uploadWaitQueue.shift();
          if (next) next();
        }
      });
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    uploadWaitQueue.push(grant);
  });
}

// ==========================================
// CLIENT COMPRESSION (WEB WORKER + OFFSCREENCANVAS + FALLBACK)
// ==========================================

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

async function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    const ab = await blob.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    return `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to encode compressed image.'));
    reader.readAsDataURL(blob);
  });
}

function computeTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number
): { width: number; height: number } {
  let width = Math.max(1, srcWidth);
  let height = Math.max(1, srcHeight);
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

// Inline Web Worker code for non-blocking resize & quality loop using createImageBitmap + OffscreenCanvas
const WORKER_SCRIPT = `
self.onmessage = async (ev) => {
  const { id, file, specs } = ev.data;
  try {
    const bitmap = await createImageBitmap(file);
    const out = [];
    for (const spec of specs) {
      let maxDim = spec.maxDimension;
      let width = Math.max(1, bitmap.width);
      let height = Math.max(1, bitmap.height);
      const fit = (dim) => {
        let w = Math.max(1, bitmap.width);
        let h = Math.max(1, bitmap.height);
        if (w > dim || h > dim) {
          if (w >= h) { h = Math.round((h * dim) / w); w = dim; }
          else { w = Math.round((w * dim) / h); h = dim; }
        }
        return { w: Math.max(1, w), h: Math.max(1, h) };
      };
      const encodeAt = async (w, h, q) => {
        const off = new OffscreenCanvas(w, h);
        const ctx = off.getContext('2d');
        if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(bitmap, 0, 0, w, h);
        return await off.convertToBlob({ type: spec.mimeType, quality: q });
      };
      let dims = fit(maxDim);
      let q = spec.initialQuality;
      let blob = await encodeAt(dims.w, dims.h, q);
      while (blob.size > spec.hardMaxBytes && q > 0.42) {
        q = Math.max(0.42, Number((q - 0.1).toFixed(2)));
        blob = await encodeAt(dims.w, dims.h, q);
      }
      if (blob.size > spec.hardMaxBytes && maxDim > 720) {
        dims = fit(Math.round(maxDim * 0.72));
        blob = await encodeAt(dims.w, dims.h, 0.62);
      }
      if (blob.size > spec.hardMaxBytes && maxDim > 360) {
        dims = fit(Math.max(240, Math.round(maxDim * 0.5)));
        blob = await encodeAt(dims.w, dims.h, 0.5);
      }
      out.push({ blob, mimeType: blob.type || spec.mimeType, sizeBytes: blob.size, width: dims.w, height: dims.h });
    }
    bitmap.close();
    self.postMessage({ id, ok: true, results: out });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
`;

let sharedWorker: Worker | null | undefined = undefined;
let workerJobSeq = 0;

function getCompressionWorker(): Worker | null {
  if (sharedWorker !== undefined) return sharedWorker;
  if (
    typeof window === 'undefined' ||
    typeof Worker === 'undefined' ||
    typeof OffscreenCanvas === 'undefined' ||
    typeof createImageBitmap !== 'function'
  ) {
    sharedWorker = null;
    return null;
  }
  try {
    const workerBlob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    sharedWorker = new Worker(workerUrl);
    return sharedWorker;
  } catch {
    sharedWorker = null;
    return null;
  }
}

interface CompressionSpec {
  maxDimension: number;
  initialQuality: number;
  hardMaxBytes: number;
  mimeType: string;
}

async function compressBatchViaWorker(
  file: File,
  specs: CompressionSpec[]
): Promise<Array<{ blob: Blob; mimeType: string; sizeBytes: number; width: number; height: number }>> {
  const worker = getCompressionWorker();
  if (!worker) throw new Error('Web Worker unavailable');

  const id = ++workerJobSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Image compression worker timed out'));
    }, 15_000);

    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.id !== id) return;
      cleanup();
      if (ev.data?.ok && Array.isArray(ev.data.results)) {
        resolve(ev.data.results);
      } else {
        reject(new Error(ev.data?.error || 'Worker compression failed'));
      }
    };

    const onError = (err: ErrorEvent) => {
      cleanup();
      reject(new Error(err.message || 'Worker error'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ id, file, specs });
  });
}

async function decodeImageMainThread(file: File): Promise<{
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
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isHeic = ext === 'heic' || ext === 'heif' || file.type.toLowerCase().includes('heic') || file.type.toLowerCase().includes('heif');
      reject(
        new Error(
          isHeic
            ? `"${file.name}" is a HEIC/HEIF photo that this browser cannot decode directly. Please convert to JPG/PNG or switch iPhone Camera format to "Most Compatible".`
            : `"${file.name}" could not be decoded as a valid image.`
        )
      );
    };
    img.src = objectUrl;
  });
}

async function encodeCanvasMainThread(
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
  if (!ctx) throw new Error('Image compression canvas is unavailable in this browser.');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);
  drawFn(ctx, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to compress image.'))),
      mimeType,
      quality
    );
  });
}

async function compressBatchMainThread(
  file: File,
  specs: CompressionSpec[]
): Promise<Array<{ blob: Blob; mimeType: string; sizeBytes: number; width: number; height: number }>> {
  const decoded = await decodeImageMainThread(file);
  try {
    const out: Array<{ blob: Blob; mimeType: string; sizeBytes: number; width: number; height: number }> = [];
    for (const spec of specs) {
      let dims = computeTargetDimensions(decoded.width, decoded.height, spec.maxDimension);
      let q = spec.initialQuality;
      let blob = await encodeCanvasMainThread(decoded.draw, dims.width, dims.height, spec.mimeType, q);
      while (blob.size > spec.hardMaxBytes && q > 0.42) {
        q = Math.max(0.42, Number((q - 0.1).toFixed(2)));
        blob = await encodeCanvasMainThread(decoded.draw, dims.width, dims.height, spec.mimeType, q);
      }
      if (blob.size > spec.hardMaxBytes && spec.maxDimension > 720) {
        dims = computeTargetDimensions(decoded.width, decoded.height, Math.round(spec.maxDimension * 0.72));
        blob = await encodeCanvasMainThread(decoded.draw, dims.width, dims.height, spec.mimeType, 0.62);
      }
      if (blob.size > spec.hardMaxBytes && spec.maxDimension > 360) {
        dims = computeTargetDimensions(decoded.width, decoded.height, Math.max(240, Math.round(spec.maxDimension * 0.5)));
        blob = await encodeCanvasMainThread(decoded.draw, dims.width, dims.height, spec.mimeType, 0.5);
      }
      out.push({
        blob,
        mimeType: blob.type || spec.mimeType,
        sizeBytes: blob.size,
        width: dims.width,
        height: dims.height,
      });
    }
    return out;
  } finally {
    decoded.cleanup();
  }
}

export async function compressImageVariants(
  file: File,
  options?: { maxDimension?: number; quality?: number; includeThumb?: boolean; includeCompactFallback?: boolean }
): Promise<{
  main: CompressedMediaResult;
  thumb?: CompressedMediaResult;
  compactFallback?: CompressedMediaResult;
}> {
  const validationErr = validateImageUploadFile(file);
  if (validationErr) throw new Error(validationErr);

  const mimeType = supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
  const specs: CompressionSpec[] = [
    {
      maxDimension: options?.maxDimension ?? 1280,
      initialQuality: options?.quality ?? 0.8,
      hardMaxBytes: HARD_MAX_COMPRESSED_BYTES,
      mimeType,
    },
  ];
  if (options?.includeThumb) {
    specs.push({
      maxDimension: 200,
      initialQuality: 0.72,
      hardMaxBytes: TARGET_THUMB_BYTES,
      mimeType,
    });
  }
  if (options?.includeCompactFallback) {
    specs.push({
      maxDimension: 420,
      initialQuality: 0.6,
      hardMaxBytes: COMPACT_FALLBACK_MAX_BYTES,
      mimeType,
    });
  }

  let rawResults: Array<{ blob: Blob; mimeType: string; sizeBytes: number; width: number; height: number }>;
  try {
    rawResults = await compressBatchViaWorker(file, specs);
  } catch {
    rawResults = await compressBatchMainThread(file, specs);
  }

  const mainRaw = rawResults[0];
  const main: CompressedMediaResult = {
    ...mainRaw,
    dataUrl: await blobToDataUrl(mainRaw.blob),
  };

  let idx = 1;
  let thumb: CompressedMediaResult | undefined;
  if (options?.includeThumb && rawResults[idx]) {
    const tr = rawResults[idx++];
    thumb = { ...tr, dataUrl: await blobToDataUrl(tr.blob) };
  }

  let compactFallback: CompressedMediaResult | undefined;
  if (options?.includeCompactFallback && rawResults[idx]) {
    const cr = rawResults[idx++];
    compactFallback = { ...cr, dataUrl: await blobToDataUrl(cr.blob) };
  }

  return { main, thumb, compactFallback };
}

export async function compressSingleImage(
  file: File,
  maxDimension: number = 1280,
  quality: number = 0.8
): Promise<CompressedMediaResult> {
  const { main } = await compressImageVariants(file, {
    maxDimension,
    quality,
    includeThumb: false,
    includeCompactFallback: false,
  });
  return main;
}

// ==========================================
// STORAGE ERROR CLASSIFICATION & HELPERS
// ==========================================

export function extractStorageErrorCode(err: any): {
  code: string;
  message: string;
  isBucketUnavailable: boolean;
  isNonRetryable: boolean;
} {
  const rawCode = String(err?.code || '').trim();
  const rawMsg = String(err?.message || err || 'Upload failed');
  const serverResp = String(err?.serverResponse || '');
  const combined = `${rawCode} ${rawMsg} ${serverResp}`.toLowerCase();

  if (
    rawCode === 'storage/bucket-not-found' ||
    rawCode === 'storage/project-not-found' ||
    (combined.includes('404') && combined.includes('not found')) ||
    combined.includes('bucket-not-found') ||
    combined.includes('no default bucket')
  ) {
    return {
      code: 'storage/bucket-not-found',
      message: 'Firebase Storage bucket was not found (404). Enable Storage in Firebase Console or check storageBucket config.',
      isBucketUnavailable: true,
      isNonRetryable: true,
    };
  }

  if (rawCode === 'storage/unauthorized' || combined.includes('403') || combined.includes('permission')) {
    return {
      code: 'storage/unauthorized',
      message: 'Permission denied by Firebase Storage rules (storage/unauthorized). Publish storage.rules in Firebase Console.',
      isBucketUnavailable: false,
      isNonRetryable: true,
    };
  }

  if (rawCode === 'storage/unauthenticated') {
    return {
      code: 'storage/unauthenticated',
      message: 'Authentication session is not ready (storage/unauthenticated). Please sign in again.',
      isBucketUnavailable: false,
      isNonRetryable: true,
    };
  }

  if (rawCode === 'storage/canceled') {
    return {
      code: 'storage/canceled',
      message: 'Upload was cancelled.',
      isBucketUnavailable: false,
      isNonRetryable: true,
    };
  }

  if (rawCode === 'storage/retry-limit-exceeded') {
    return {
      code: 'storage/retry-limit-exceeded',
      message: 'Upload retry limit exceeded (storage/retry-limit-exceeded). Check network connection.',
      isBucketUnavailable: false,
      isNonRetryable: false,
    };
  }

  if (rawCode === 'storage/stalled') {
    return {
      code: 'storage/stalled',
      message: 'Upload stalled for 15 seconds with no byte progress.',
      isBucketUnavailable: false,
      isNonRetryable: false,
    };
  }

  if (rawCode === 'storage/timeout') {
    return {
      code: 'storage/timeout',
      message: 'Upload exceeded the 60 second maximum timeout.',
      isBucketUnavailable: false,
      isNonRetryable: true,
    };
  }

  if (
    combined.includes('network') ||
    combined.includes('offline') ||
    combined.includes('failed to fetch') ||
    combined.includes('cors') ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return {
      code: 'network',
      message: 'Network error during upload. Check internet connection or Storage CORS.',
      isBucketUnavailable: false,
      isNonRetryable: false,
    };
  }

  return {
    code: rawCode || 'storage/unknown',
    message: rawMsg,
    isBucketUnavailable: false,
    isNonRetryable: false,
  };
}

async function waitForAuthReady(timeoutMs = 3000): Promise<string> {
  if (testAdapterOverrides?.waitForAuthReady) {
    return testAdapterOverrides.waitForAuthReady();
  }
  try {
    await Promise.race([
      authPersistenceReady,
      new Promise<void>((r) => setTimeout(r, timeoutMs)),
    ]);
    if (typeof (auth as any)?.authStateReady === 'function') {
      await Promise.race([
        (auth as any).authStateReady(),
        new Promise<void>((r) => setTimeout(r, timeoutMs)),
      ]);
    }
  } catch {
    // proceed to check currentUser
  }
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    throw new MediaUploadError(
      'storage/unauthenticated',
      'User authentication is not ready. Please sign in and retry.',
      false
    );
  }
  return uid;
}

function buildUniqueFilename(uid: string, originalName: string, ext: string): string {
  const safeUid = (uid || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'user';
  const safeBase =
    originalName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 32) || 'file';
  const rand = Math.random().toString(36).slice(2, 8);
  const cleanExt = ext.replace(/^\./, '');
  return `${safeUid}_${Date.now()}_${rand}_${safeBase}.${cleanExt}`;
}

async function uploadBlobResumableWithStallWatchdog(
  storagePath: string,
  blob: Blob,
  contentType: string,
  remainingMs: number,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, blob, {
    contentType,
    cacheControl: 'public,max-age=31536000',
  });

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let lastBytes = -1;
    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let overallTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (stallTimer) clearTimeout(stallTimer);
      if (overallTimer) clearTimeout(overallTimer);
      signal?.removeEventListener('abort', onAbort);
    };

    const failWith = (err: any) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const resetStallTimer = () => {
      if (stallTimer) clearTimeout(stallTimer);
      const waitMs = Math.min(STALL_TIMEOUT_MS, Math.max(1000, remainingMs));
      stallTimer = setTimeout(() => {
        try {
          task.cancel();
        } catch {}
        failWith(
          new MediaUploadError(
            'storage/stalled',
            'No upload progress for 15 seconds (stalled).'
          )
        );
      }, waitMs);
    };

    const onAbort = () => {
      try {
        task.cancel();
      } catch {}
      failWith(new MediaUploadError('storage/canceled', 'Upload cancelled.'));
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    overallTimer = setTimeout(() => {
      try {
        task.cancel();
      } catch {}
      failWith(
        new MediaUploadError(
          'storage/timeout',
          'Upload exceeded the 60 second time limit.'
        )
      );
    }, Math.max(500, remainingMs));

    resetStallTimer();

    task.on(
      'state_changed',
      (snapshot) => {
        if (settled) return;
        if (snapshot.bytesTransferred > lastBytes) {
          lastBytes = snapshot.bytesTransferred;
          resetStallTimer();
        }
        if (snapshot.totalBytes > 0) {
          const ratio = snapshot.bytesTransferred / snapshot.totalBytes;
          const pct = Math.min(95, Math.max(18, Math.round(18 + ratio * 77)));
          onProgress?.(pct);
        }
      },
      (err) => {
        failWith(err);
      },
      async () => {
        if (settled) return;
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          settled = true;
          cleanup();
          resolve(url);
        } catch (dlErr) {
          failWith(dlErr);
        }
      }
    );
  });
}

export interface MediaUploadAdapterOverrides {
  waitForAuthReady?: () => Promise<string>;
  resumableUpload?: typeof uploadBlobResumableWithStallWatchdog;
  nonResumableUpload?: typeof uploadBlobNonResumableWithTimeout;
  deletePath?: (path: string) => Promise<void>;
  stallTimeoutMs?: number;
  overallTimeoutMs?: number;
}

let testAdapterOverrides: MediaUploadAdapterOverrides | null = null;
export function __setMediaUploadTestHooks(hooks: MediaUploadAdapterOverrides | null): void {
  testAdapterOverrides = hooks;
}

async function uploadBlobNonResumableWithTimeout(
  storagePath: string,
  blob: Blob,
  contentType: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  if (signal?.aborted) {
    throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
  }
  const storageRef = ref(storage, storagePath);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbortRef: (() => void) | null = null;

  try {
    return await Promise.race([
      (async () => {
        const snap = await uploadBytes(storageRef, blob, {
          contentType,
          cacheControl: 'public,max-age=31536000',
        });
        if (signal?.aborted) {
          try {
            await deleteObject(snap.ref);
          } catch {}
          throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
        }
        return getDownloadURL(snap.ref);
      })(),
      new Promise<string>((_, reject) => {
        const onAbort = () => {
          reject(new MediaUploadError('storage/canceled', 'Upload cancelled.'));
        };
        onAbortRef = onAbort;
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          reject(
            new MediaUploadError(
              'storage/timeout',
              'Direct upload fallback timed out.'
            )
          );
        }, Math.max(1000, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbortRef) signal?.removeEventListener('abort', onAbortRef);
  }
}

async function uploadWithRetriesAndFallback(params: {
  storagePath: string;
  blob: Blob;
  contentType: string;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { storagePath, blob, contentType, onProgress, signal } = params;
  const startedAt = Date.now();
  const maxAttempts = 3;
  const overallTimeoutMs = testAdapterOverrides?.overallTimeoutMs ?? OVERALL_UPLOAD_TIMEOUT_MS;
  const resumableFn = testAdapterOverrides?.resumableUpload ?? uploadBlobResumableWithStallWatchdog;
  const nonResumableFn = testAdapterOverrides?.nonResumableUpload ?? uploadBlobNonResumableWithTimeout;
  let lastErr: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
    }
    const elapsed = Date.now() - startedAt;
    const remaining = overallTimeoutMs - elapsed;
    if (remaining <= 500) {
      throw new MediaUploadError(
        'storage/timeout',
        'Upload exceeded the 60 second overall limit.'
      );
    }

    try {
      if (attempt < maxAttempts) {
        return await resumableFn(
          storagePath,
          blob,
          contentType,
          remaining,
          onProgress,
          signal
        );
      } else {
        // Attempt 3: non-resumable uploadBytes fallback
        onProgress?.(60);
        const url = await nonResumableFn(
          storagePath,
          blob,
          contentType,
          Math.min(remaining, 20_000),
          signal
        );
        onProgress?.(95);
        return url;
      }
    } catch (err: any) {
      lastErr = err;
      const classified = extractStorageErrorCode(err);
      if (!testAdapterOverrides) {
        console.error(`[MediaUpload] Attempt ${attempt}/${maxAttempts} failed (${classified.code}):`, {
          path: storagePath,
          bucket: storage?.app?.options?.storageBucket,
          message: classified.message,
          err,
        });
      }

      if (classified.isNonRetryable || signal?.aborted) {
        throw new MediaUploadError(
          classified.code,
          classified.message,
          classified.isBucketUnavailable
        );
      }

      if (attempt < maxAttempts) {
        const rawBackoff = testAdapterOverrides ? 20 : 800 * Math.pow(2, attempt - 1);
        const backoffMs = Math.min(rawBackoff, Math.max(0, overallTimeoutMs - (Date.now() - startedAt) - 100));
        if (backoffMs > 0) {
          onProgress?.(18);
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(resolve, backoffMs);
            signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(t);
                reject(new MediaUploadError('storage/canceled', 'Upload cancelled.'));
              },
              { once: true }
            );
          });
        }
      }
    }
  }

  const finalClassified = extractStorageErrorCode(lastErr);
  throw new MediaUploadError(
    finalClassified.code,
    finalClassified.message,
    finalClassified.isBucketUnavailable
  );
}

// ==========================================
// PUBLIC UPLOAD & DELETE API
// ==========================================

export interface UploadMediaOptions {
  /** Base folder path without trailing slash, e.g. "products/SKU-1" or "preOrders/products" */
  folderPath: string;
  /** Optional subfolder for thumbnails; defaults to `${folderPath}/thumbs` */
  thumbFolderPath?: string;
  maxDimension?: number;
  quality?: number;
  generateThumb?: boolean;
  onPhase?: (phase: 'preparing' | 'uploading') => void;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export async function uploadImageAsset(
  file: File,
  options: UploadMediaOptions
): Promise<MediaUploadResult> {
  const perfKey = `upload_${options.folderPath.split('/')[0] || 'media'}`;
  perfStartTimer(perfKey);
  options.onPhase?.('preparing');
  options.onProgress?.(5);

  const { main, thumb, compactFallback } = await compressImageVariants(file, {
    maxDimension: options.maxDimension ?? 1280,
    quality: options.quality ?? 0.8,
    includeThumb: Boolean(options.generateThumb),
    includeCompactFallback: true,
  });

  if (options.signal?.aborted) {
    throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
  }

  options.onPhase?.('uploading');
  options.onProgress?.(15);

  const releaseSlot = await acquireUploadSlot(options.signal);
  try {
    if (!storage) {
      const compact = compactFallback || main;
      options.onProgress?.(100);
      perfEndTimer(perfKey, 'fallback-no-storage');
      return {
        url: compact.dataUrl,
        thumbUrl: thumb?.dataUrl || compact.dataUrl,
        storageUploaded: false,
        fallbackUsed: true,
        sizeBytes: compact.sizeBytes,
        originalSizeBytes: file.size,
        thumbSizeBytes: thumb?.sizeBytes,
        errorCode: 'storage/bucket-not-found',
        errorMessage: 'Firebase Storage is not initialized. Saved compact ~40KB thumbnail fallback.',
      };
    }

    const uid = await waitForAuthReady();
    const ext = main.mimeType === 'image/webp' ? 'webp' : 'jpg';
    const fileName = buildUniqueFilename(uid, file.name, ext);
    const cleanFolder = options.folderPath.replace(/^\/+|\/+$/g, '');
    const storagePath = `${cleanFolder}/${fileName}`;

    try {
      const url = await uploadWithRetriesAndFallback({
        storagePath,
        blob: main.blob,
        contentType: main.mimeType,
        onProgress: options.onProgress,
        signal: options.signal,
      });

      let thumbUrl: string | undefined;
      let thumbStoragePath: string | undefined;
      if (thumb && !options.signal?.aborted) {
        try {
          const thumbExt = thumb.mimeType === 'image/webp' ? 'webp' : 'jpg';
          const thumbFileName = buildUniqueFilename(uid, `${file.name}_thumb`, thumbExt);
          const cleanThumbFolder = (options.thumbFolderPath || `${cleanFolder}/thumbs`).replace(/^\/+|\/+$/g, '');
          thumbStoragePath = `${cleanThumbFolder}/${thumbFileName}`;
          const nonResumableThumbFn = testAdapterOverrides?.nonResumableUpload ?? uploadBlobNonResumableWithTimeout;
          thumbUrl = await nonResumableThumbFn(
            thumbStoragePath,
            thumb.blob,
            thumb.mimeType,
            12_000,
            options.signal
          );
        } catch (thumbErr) {
          console.warn('[MediaUpload] Optional thumbnail upload failed:', thumbErr);
          thumbStoragePath = undefined;
        }
      }

      if (options.signal?.aborted) {
        await deleteMediaObject(storagePath, thumbStoragePath);
        throw new MediaUploadError('storage/canceled', 'Upload cancelled.');
      }

      options.onProgress?.(100);
      perfEndTimer(perfKey, `${formatBytesCompact(main.sizeBytes)}`);
      return {
        url,
        thumbUrl,
        storagePath,
        thumbStoragePath,
        storageUploaded: true,
        fallbackUsed: false,
        sizeBytes: main.sizeBytes,
        originalSizeBytes: file.size,
        thumbSizeBytes: thumb?.sizeBytes,
      };
    } catch (err: any) {
      const classified =
        err instanceof MediaUploadError
          ? {
              code: err.code,
              message: err.message,
              isBucketUnavailable: err.isTerminalStorageUnavailable,
            }
          : extractStorageErrorCode(err);

      // ONLY fall back to <=40KB compact thumbnail when Storage bucket itself is unavailable/not provisioned
      if (classified.isBucketUnavailable && !options.signal?.aborted) {
        const compact = compactFallback || main;
        options.onProgress?.(100);
        perfEndTimer(perfKey, `fallback-${classified.code}`);
        return {
          url: compact.dataUrl,
          thumbUrl: thumb?.dataUrl || compact.dataUrl,
          storageUploaded: false,
          fallbackUsed: true,
          sizeBytes: compact.sizeBytes,
          originalSizeBytes: file.size,
          thumbSizeBytes: thumb?.sizeBytes,
          errorCode: classified.code,
          errorMessage: `${classified.code}: Firebase Storage bucket unavailable; stored compact ${formatBytesCompact(compact.sizeBytes)} thumbnail fallback (no full-size image, 1MB doc limit applies).`,
        };
      }

      throw new MediaUploadError(classified.code, classified.message, classified.isBucketUnavailable);
    }
  } finally {
    releaseSlot();
  }
}

export async function uploadDocumentAsset(
  file: File,
  folderPath: string,
  options?: {
    onPhase?: (phase: 'preparing' | 'uploading') => void;
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  }
): Promise<{
  url: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
  fileName: string;
  fallbackUsed: boolean;
  errorCode?: string;
  errorMessage?: string;
}> {
  const err = validateDocumentUploadFile(file);
  if (err) throw new Error(err);

  const isPdf =
    file.type.toLowerCase() === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    const imgRes = await uploadImageAsset(file, {
      folderPath,
      maxDimension: 1280,
      quality: 0.8,
      generateThumb: false,
      onPhase: options?.onPhase,
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
    return {
      url: imgRes.url,
      storagePath: imgRes.storagePath || '',
      contentType: imgRes.storageUploaded ? 'image/webp' : 'image/jpeg',
      fileSize: imgRes.sizeBytes,
      fileName: file.name,
      fallbackUsed: imgRes.fallbackUsed,
      errorCode: imgRes.errorCode,
      errorMessage: imgRes.errorMessage,
    };
  }

  options?.onPhase?.('uploading');
  options?.onProgress?.(15);

  if (!storage) {
    throw new MediaUploadError(
      'storage/bucket-not-found',
      'Firebase Storage bucket is unavailable to upload PDF documents.',
      true
    );
  }

  const releaseSlot = await acquireUploadSlot(options?.signal);
  try {
    const uid = await waitForAuthReady();
    const cleanFolder = folderPath.replace(/^\/+|\/+$/g, '');
    const storagePath = `${cleanFolder}/${buildUniqueFilename(uid, file.name, 'pdf')}`;
    const url = await uploadWithRetriesAndFallback({
      storagePath,
      blob: file,
      contentType: 'application/pdf',
      onProgress: options?.onProgress,
      signal: options?.signal,
    });
    options?.onProgress?.(100);
    return {
      url,
      storagePath,
      contentType: 'application/pdf',
      fileSize: file.size,
      fileName: file.name,
      fallbackUsed: false,
    };
  } finally {
    releaseSlot();
  }
}

export async function deleteMediaObject(
  storagePath?: string | null,
  thumbStoragePath?: string | null
): Promise<void> {
  if (testAdapterOverrides?.deletePath) {
    const ops: Promise<void>[] = [];
    if (storagePath && !storagePath.startsWith('data:')) {
      ops.push(testAdapterOverrides.deletePath(storagePath));
    }
    if (thumbStoragePath && !thumbStoragePath.startsWith('data:')) {
      ops.push(testAdapterOverrides.deletePath(thumbStoragePath));
    }
    await Promise.all(ops);
    return;
  }
  if (!storage) return;
  const tasks: Promise<void>[] = [];
  if (storagePath && !storagePath.startsWith('data:')) {
    tasks.push(
      deleteObject(ref(storage, storagePath)).catch((err) => {
        console.warn('[MediaUpload] Cleanup deleteObject warning:', storagePath, err?.code || err);
      })
    );
  }
  if (thumbStoragePath && !thumbStoragePath.startsWith('data:')) {
    tasks.push(
      deleteObject(ref(storage, thumbStoragePath)).catch((err) => {
        console.warn('[MediaUpload] Cleanup thumb deleteObject warning:', thumbStoragePath, err?.code || err);
      })
    );
  }
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
}
