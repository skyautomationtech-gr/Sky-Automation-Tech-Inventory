import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { Product, ProductEditChange, Variant } from '../types';

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];
const MAX_RAW_SIZE_BYTES = 15 * 1024 * 1024; // 15MB raw upload limit prior to compression

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

export async function compressProductImageFile(
  file: File,
  maxDimension: number = 1100,
  quality: number = 0.8
): Promise<{ blob: Blob; dataUrl: string; sizeBytes: number }> {
  const validationErr = validateProductImageFile(file);
  if (validationErr) throw new Error(validationErr);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read "${file.name}".`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`"${file.name}" could not be decoded as an image.`));
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
          reject(new Error('Image compression canvas is unavailable in this browser.'));
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
 * Compresses the product photo and uploads to Firebase Storage (`products/{key}/...`).
 * Falls back cleanly to a compact JPEG data URL (<120KB) if Firebase Storage rules or
 * network block the bucket upload, preventing Firestore's 1 MiB document size overflow.
 */
export async function uploadProductImage(
  file: File,
  skuOrKey?: string
): Promise<{ url: string; storageUploaded: boolean }> {
  const compressed = await compressProductImageFile(file, 1100, 0.8);

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
      const storageRef = ref(
        storage,
        `products/${safeFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safeName}.jpg`
      );
      const snap = await uploadBytes(storageRef, compressed.blob, {
        contentType: 'image/jpeg',
      });
      const downloadUrl = await getDownloadURL(snap.ref);
      return { url: downloadUrl, storageUploaded: true };
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
  return { url: fallbackUrl, storageUploaded: false };
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
