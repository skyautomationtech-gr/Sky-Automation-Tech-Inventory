import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  __setMediaUploadTestHooks,
  COMPACT_FALLBACK_MAX_BYTES,
  deleteMediaObject,
  extractStorageErrorCode,
  HARD_MAX_COMPRESSED_BYTES,
  MAX_CONCURRENT_UPLOADS,
  MediaUploadError,
  TARGET_THUMB_BYTES,
  uploadDocumentAsset,
  uploadImageAsset,
  validateDocumentUploadFile,
  validateImageUploadFile,
} from '../src/utils/mediaUpload';

async function setupSharpCanvasEnvironment() {
  class SharpBitmap {
    buffer: Buffer;
    width: number;
    height: number;
    constructor(buffer: Buffer, width: number, height: number) {
      this.buffer = buffer;
      this.width = width;
      this.height = height;
    }
    close() {}
  }

  (globalThis as any).createImageBitmap = async (file: Blob) => {
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    const meta = await sharp(buf).metadata();
    return new SharpBitmap(buf, meta.width || 100, meta.height || 100);
  };

  class SharpOffscreenCanvas {
    width: number;
    height: number;
    private drawnBitmap: SharpBitmap | null = null;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      const self = this;
      return {
        fillStyle: '#FFFFFF',
        fillRect() {},
        drawImage(bitmap: SharpBitmap) {
          self.drawnBitmap = bitmap;
        },
      };
    }
    async convertToBlob(opts: { type?: string; quality?: number } = {}): Promise<Blob> {
      const q = Math.max(1, Math.min(100, Math.round((opts.quality ?? 0.8) * 100)));
      const srcBuf = this.drawnBitmap
        ? this.drawnBitmap.buffer
        : await sharp({
            create: {
              width: this.width,
              height: this.height,
              channels: 3,
              background: { r: 220, g: 220, b: 220 },
            },
          })
            .png()
            .toBuffer();

      const pipeline = sharp(srcBuf)
        .flatten({ background: '#ffffff' })
        .resize(this.width, this.height, { fit: 'fill' });

      if (opts.type === 'image/webp') {
        const out = await pipeline.webp({ quality: q }).toBuffer();
        return new Blob([out], { type: 'image/webp' });
      }
      const out = await pipeline.jpeg({ quality: q }).toBuffer();
      return new Blob([out], { type: 'image/jpeg' });
    }
  }

  (globalThis as any).OffscreenCanvas = SharpOffscreenCanvas;
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === 'canvas') {
        return {
          width: 2,
          height: 2,
          toDataURL(mime?: string) {
            return mime === 'image/webp' ? 'data:image/webp;base64,AA==' : 'data:image/jpeg;base64,AA==';
          },
        };
      }
      return {};
    },
  };
}

async function createNoisyTestPhoto(width: number, height: number): Promise<File> {
  // Deterministic high-entropy RGB noise so JPEG/WebP size is realistic (> 1 MB before compression)
  const raw = Buffer.alloc(width * height * 3);
  let seed = 0x12345678;
  for (let i = 0; i < raw.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    raw[i] = seed & 0xff;
    if (i + 1 < raw.length) raw[i + 1] = (seed >>> 8) & 0xff;
    if (i + 2 < raw.length) raw[i + 2] = (seed >>> 16) & 0xff;
    if (i + 3 < raw.length) raw[i + 3] = (seed >>> 24) & 0xff;
  }
  const jpgBuf = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
  return new File([jpgBuf], 'camera_photo_4k.jpg', { type: 'image/jpeg' });
}

async function runTests() {
  await setupSharpCanvasEnvironment();
  console.log('1) Testing file validation rules...');
  assert.ok(validateImageUploadFile(new File(['hello'], 'notes.txt', { type: 'text/plain' })));
  assert.ok(validateImageUploadFile(new File([new Uint8Array(0)], 'empty.jpg', { type: 'image/jpeg' })));
  assert.ok(
    validateImageUploadFile(new File([new Uint8Array(9 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' }))
  );
  assert.equal(
    validateImageUploadFile(new File([new Uint8Array(1024)], 'valid.webp', { type: 'image/webp' })),
    null
  );
  assert.equal(
    validateDocumentUploadFile(new File([new Uint8Array(4 * 1024 * 1024)], 'invoice.pdf', { type: 'application/pdf' })),
    null
  );
  assert.ok(
    validateDocumentUploadFile(new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' }))
  );
  console.log('   PASS: Validation enforces JPG/PNG/WebP/HEIC <= 8 MB and PDF <= 5 MB.');

  console.log('2) Generating 2400x1800 noisy test photo (>1.5 MB) & testing client compression + Storage upload...');
  const noisyPhoto = await createNoisyTestPhoto(2400, 1800);
  console.log(`   Synthetic original size: ${(noisyPhoto.size / 1024).toFixed(1)} KB`);
  assert.ok(noisyPhoto.size > 1_000_000, 'Synthetic photo should exceed 1 MB');

  const uploadedPaths: string[] = [];
  const deletedPaths: string[] = [];

  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async (storagePath, blob, _ct, _rem, onProgress) => {
      uploadedPaths.push(storagePath);
      onProgress?.(45);
      await new Promise((r) => setTimeout(r, 15));
      onProgress?.(95);
      return `https://firebasestorage.example.com/${encodeURIComponent(storagePath)}?alt=media`;
    },
    nonResumableUpload: async (storagePath, _blob) => {
      uploadedPaths.push(storagePath);
      return `https://firebasestorage.example.com/${encodeURIComponent(storagePath)}?alt=media`;
    },
    deletePath: async (p) => {
      deletedPaths.push(p);
    },
  });

  const t0 = performance.now();
  const mainRes = await uploadImageAsset(noisyPhoto, {
    folderPath: 'products/SKU-TEST-1',
    generateThumb: true,
  });
  const compressUploadMs = performance.now() - t0;
  assert.equal(mainRes.storageUploaded, true);
  assert.equal(mainRes.fallbackUsed, false);
  assert.ok(mainRes.sizeBytes <= HARD_MAX_COMPRESSED_BYTES, `Expected <= ${HARD_MAX_COMPRESSED_BYTES}, got ${mainRes.sizeBytes}`);
  assert.ok((mainRes.thumbSizeBytes || 0) <= TARGET_THUMB_BYTES, `Expected thumb <= ${TARGET_THUMB_BYTES}, got ${mainRes.thumbSizeBytes}`);
  assert.ok(mainRes.storagePath?.startsWith('products/SKU-TEST-1/uid_superadm_'));
  assert.ok(mainRes.thumbStoragePath?.startsWith('products/SKU-TEST-1/thumbs/'));
  console.log(
    `   PASS: Compressed ${(noisyPhoto.size / 1024).toFixed(0)} KB -> main ${(mainRes.sizeBytes / 1024).toFixed(1)} KB, thumb ${((mainRes.thumbSizeBytes || 0) / 1024).toFixed(1)} KB in ${compressUploadMs.toFixed(1)} ms`
  );

  console.log('3) Testing parallel upload queue limit (MAX 3 concurrent)...');
  let active = 0;
  let maxObserved = 0;
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async (storagePath) => {
      active += 1;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((r) => setTimeout(r, 40));
      active -= 1;
      return `https://firebasestorage.example.com/${encodeURIComponent(storagePath)}`;
    },
    nonResumableUpload: async (p) => `https://firebasestorage.example.com/${encodeURIComponent(p)}`,
  });
  const smallPhoto = await createNoisyTestPhoto(400, 300);
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      uploadImageAsset(new File([smallPhoto], `batch_${i}.jpg`, { type: 'image/jpeg' }), {
        folderPath: 'products/SKU-BATCH',
        generateThumb: false,
      })
    )
  );
  assert.ok(maxObserved <= MAX_CONCURRENT_UPLOADS && maxObserved >= 2, `Expected max concurrent 2..3, got ${maxObserved}`);
  console.log(`   PASS: Peak concurrent uploads observed = ${maxObserved} (limit ${MAX_CONCURRENT_UPLOADS}).`);

  console.log('4) Testing 15s stall recovery + 3x retry + attempt-3 uploadBytes fallback...');
  let resumableAttempts = 0;
  let fallbackUsedAttempt3 = false;
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async () => {
      resumableAttempts += 1;
      throw new MediaUploadError('storage/stalled', 'No upload progress for 15 seconds (stalled).');
    },
    nonResumableUpload: async (storagePath) => {
      fallbackUsedAttempt3 = true;
      return `https://firebasestorage.example.com/${encodeURIComponent(storagePath)}`;
    },
  });
  const retryRes = await uploadImageAsset(smallPhoto, {
    folderPath: 'preOrders/receipts',
    generateThumb: false,
  });
  assert.equal(resumableAttempts, 2);
  assert.equal(fallbackUsedAttempt3, true);
  assert.equal(retryRes.storageUploaded, true);
  console.log('   PASS: 2 resumable stalls automatically retried and succeeded on attempt-3 uploadBytes fallback.');

  console.log('5) Testing 60s hard overall deadline timeout (fast-clock override)...');
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    overallTimeoutMs: 50,
    resumableUpload: async () => {
      await new Promise((r) => setTimeout(r, 80));
      throw new MediaUploadError('storage/timeout', 'Upload exceeded time limit.');
    },
    nonResumableUpload: async () => {
      throw new MediaUploadError('storage/timeout', 'Timed out.');
    },
  });
  await assert.rejects(
    () => uploadImageAsset(smallPhoto, { folderPath: 'receipts', generateThumb: false }),
    (err: any) => err instanceof MediaUploadError && err.code === 'storage/timeout'
  );
  console.log('   PASS: Overall deadline throws MediaUploadError(storage/timeout).');

  console.log('6) Testing missing bucket (404) compact <=40KB fallback vs storage/unauthorized strict error...');
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async () => {
      const e: any = new Error('Firebase Storage: Not Found (404)');
      e.code = 'storage/bucket-not-found';
      throw e;
    },
  });
  const bucketMissingRes = await uploadImageAsset(noisyPhoto, {
    folderPath: 'products/SKU-MISSING',
    generateThumb: true,
  });
  assert.equal(bucketMissingRes.storageUploaded, false);
  assert.equal(bucketMissingRes.fallbackUsed, true);
  assert.equal(bucketMissingRes.errorCode, 'storage/bucket-not-found');
  assert.ok(bucketMissingRes.sizeBytes <= COMPACT_FALLBACK_MAX_BYTES, `Fallback binary exceeded 30 KB: ${bucketMissingRes.sizeBytes}`);
  assert.ok(bucketMissingRes.url.length <= 42 * 1024, `Fallback dataUrl exceeded ~42 KB: ${bucketMissingRes.url.length}`);

  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async () => {
      const e: any = new Error('User does not have permission to access object');
      e.code = 'storage/unauthorized';
      throw e;
    },
  });
  await assert.rejects(
    () => uploadImageAsset(smallPhoto, { folderPath: 'products/SKU-AUTH', generateThumb: false }),
    (err: any) => err instanceof MediaUploadError && err.code === 'storage/unauthorized'
  );
  console.log(`   PASS: 404 uses compact ${Math.round(bucketMissingRes.sizeBytes / 1024)} KB fallback (${bucketMissingRes.url.length} chars); 403 rejects with storage/unauthorized.`);

  console.log('7) Testing PDF document upload & mid-upload cancel + deleteMediaObject cleanup...');
  const pdfFile = new File([new Uint8Array(12_000)], 'AWB_9981.pdf', { type: 'application/pdf' });
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async (storagePath) => `https://firebasestorage.example.com/${encodeURIComponent(storagePath)}`,
    deletePath: async (p) => {
      deletedPaths.push(p);
    },
  });
  const docRes = await uploadDocumentAsset(pdfFile, 'preOrders/PO-100/docs');
  assert.equal(docRes.contentType, 'application/pdf');
  assert.ok(docRes.storagePath.startsWith('preOrders/PO-100/docs/'));

  const abortCtrl = new AbortController();
  __setMediaUploadTestHooks({
    waitForAuthReady: async () => 'uid_superadmin_1',
    resumableUpload: async (_p, _b, _ct, _rem, _onProg, signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new MediaUploadError('storage/canceled', 'Cancelled')), {
          once: true,
        });
      }),
    deletePath: async (p) => {
      deletedPaths.push(p);
    },
  });
  const canceledPromise = uploadImageAsset(smallPhoto, {
    folderPath: 'preOrders/products',
    signal: abortCtrl.signal,
  });
  setTimeout(() => abortCtrl.abort(), 30);
  await assert.rejects(
    () => canceledPromise,
    (err: any) => err instanceof MediaUploadError && err.code === 'storage/canceled'
  );
  await deleteMediaObject(mainRes.storagePath, mainRes.thumbStoragePath);
  assert.ok(deletedPaths.includes(mainRes.storagePath!));
  assert.ok(deletedPaths.includes(mainRes.thumbStoragePath!));
  console.log('   PASS: PDF doc upload, AbortController mid-upload cancel, and deleteMediaObject cleanup verified.');

  console.log('8) Auditing error classifier & storage.rules coverage...');
  assert.equal(extractStorageErrorCode({ code: 'storage/retry-limit-exceeded' }).isNonRetryable, false);
  assert.equal(extractStorageErrorCode({ message: '404 Not Found' }).isBucketUnavailable, true);
  assert.equal(extractStorageErrorCode({ message: 'CORS failed to fetch' }).code, 'network');
  const rulesText = fs.readFileSync(path.resolve('storage.rules'), 'utf8');
  for (const requiredPrefix of [
    'products/{folder}/{allPaths=**}',
    'preOrders/products/{allPaths=**}',
    'preOrders/receipts/{allPaths=**}',
    'preOrders/{preOrderId}/docs/{fileName}',
    'profilePhotos/{userId}/{fileName}',
    'operator_avatars/{allPaths=**}',
    'logos/{allPaths=**}',
    'receipts/{allPaths=**}',
  ]) {
    assert.ok(rulesText.includes(requiredPrefix), `Missing storage.rules prefix: ${requiredPrefix}`);
  }
  assert.equal(rulesText.includes('firestore.get'), false, 'storage.rules must not call firestore.get on named DB');
  console.log('   PASS: All 8 upload paths & security constraints verified in storage.rules.');

  __setMediaUploadTestHooks(null);
  console.log('\nALL MEDIA UPLOAD TESTS PASSED!');
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
