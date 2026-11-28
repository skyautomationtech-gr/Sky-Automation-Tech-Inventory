import {
  Product,
  RolePermissionsMap,
  UserProfile,
  Variant,
} from '../types';
import { hasPermission } from '../preOrders/constants';

export const MAX_VARIANTS_PER_PRODUCT = 100;

export function normalizeAttributeName(value?: string | null): string {
  return (value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeAttributeCompareKey(value?: string | null): string {
  return normalizeAttributeName(value).toLowerCase();
}

export function buildVariantUniquenessKey(variant: {
  color?: string | null;
  model?: string | null;
  variantNote?: string | null;
}): string {
  const c = normalizeAttributeCompareKey(variant.color);
  const m = normalizeAttributeCompareKey(variant.model);
  const n = normalizeAttributeCompareKey(variant.variantNote);
  return `${c}::${m}::${n}`;
}

export function formatVariantLabel(
  variant: Pick<Variant, 'color' | 'model' | 'variantNote'> | undefined | null
): string {
  if (!variant) return 'Standard';
  const base = `${variant.color || 'Default'} - ${variant.model || 'Standard'}`;
  const note = (variant.variantNote || '').trim();
  return note ? `${base} (${note})` : base;
}

export function isVariantActive(variant: Partial<Variant> | undefined | null): boolean {
  return Boolean(variant && !variant.inactive);
}

export function getActiveVariants(product: Pick<Product, 'variants'> | undefined | null): Variant[] {
  const list = Array.isArray(product?.variants) ? product!.variants : [];
  const active = list.filter((v) => !v.inactive);
  return active.length > 0 ? active : list;
}

/**
 * Resolves the effective selling price for a variant.
 * Legacy variants (no sellingPrice or sameAsProductPrice !== false) dynamically inherit product.sellingPrice.
 */
export function resolveVariantSellingPrice(
  product: Pick<Product, 'sellingPrice'> | number | undefined | null,
  variant?: Pick<Variant, 'sellingPrice' | 'sameAsProductPrice'> | null
): number {
  const productPrice =
    typeof product === 'number'
      ? Number(product || 0)
      : Number(product?.sellingPrice || 0);
  if (!variant) return Math.max(0, Number.isFinite(productPrice) ? productPrice : 0);
  const inheritsProduct = variant.sameAsProductPrice !== false;
  if (!inheritsProduct && typeof variant.sellingPrice === 'number' && Number.isFinite(variant.sellingPrice)) {
    return Math.max(0, variant.sellingPrice);
  }
  if (
    variant.sameAsProductPrice === undefined &&
    typeof variant.sellingPrice === 'number' &&
    Number.isFinite(variant.sellingPrice) &&
    variant.sellingPrice !== productPrice
  ) {
    return Math.max(0, variant.sellingPrice);
  }
  return Math.max(0, Number.isFinite(productPrice) ? productPrice : 0);
}

/**
 * Resolves the effective purchase/cost price for a variant.
 * Legacy variants (no costPrice or sameAsProductPrice !== false) dynamically inherit product.costPrice.
 */
export function resolveVariantCostPrice(
  product: Pick<Product, 'costPrice'> | number | undefined | null,
  variant?: Pick<Variant, 'costPrice' | 'sameAsProductPrice'> | null
): number {
  const productCost =
    typeof product === 'number'
      ? Number(product || 0)
      : Number(product?.costPrice || 0);
  if (!variant) return Math.max(0, Number.isFinite(productCost) ? productCost : 0);
  const inheritsProduct = variant.sameAsProductPrice !== false;
  if (!inheritsProduct && typeof variant.costPrice === 'number' && Number.isFinite(variant.costPrice)) {
    return Math.max(0, variant.costPrice);
  }
  if (
    variant.sameAsProductPrice === undefined &&
    typeof variant.costPrice === 'number' &&
    Number.isFinite(variant.costPrice) &&
    variant.costPrice !== productCost
  ) {
    return Math.max(0, variant.costPrice);
  }
  return Math.max(0, Number.isFinite(productCost) ? productCost : 0);
}

export function resolveVariantReorderThreshold(
  product: Pick<Product, 'reorderThreshold'> | number | undefined | null,
  variant?: Pick<Variant, 'reorderThreshold'> | null
): number {
  if (
    variant &&
    typeof variant.reorderThreshold === 'number' &&
    Number.isFinite(variant.reorderThreshold) &&
    variant.reorderThreshold >= 0
  ) {
    return variant.reorderThreshold;
  }
  const prodThresh =
    typeof product === 'number'
      ? Number(product ?? 5)
      : Number(product?.reorderThreshold ?? 5);
  return Math.max(0, Number.isFinite(prodThresh) ? prodThresh : 5);
}

export function getProductSellingPriceRange(
  product: Pick<Product, 'sellingPrice' | 'variants'> | undefined | null
): { min: number; max: number; isRange: boolean } {
  if (!product) return { min: 0, max: 0, isRange: false };
  const activeVariants = (product.variants || []).filter((v) => !v.inactive);
  const list = activeVariants.length > 0 ? activeVariants : product.variants || [];
  if (list.length === 0) {
    const p = Math.max(0, Number(product.sellingPrice) || 0);
    return { min: p, max: p, isRange: false };
  }
  const prices = list.map((v) => resolveVariantSellingPrice(product, v));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { min, max, isRange: min !== max };
}

export function getProductCostPriceRange(
  product: Pick<Product, 'costPrice' | 'variants'> | undefined | null
): { min: number; max: number; isRange: boolean } {
  if (!product) return { min: 0, max: 0, isRange: false };
  const activeVariants = (product.variants || []).filter((v) => !v.inactive);
  const list = activeVariants.length > 0 ? activeVariants : product.variants || [];
  if (list.length === 0) {
    const c = Math.max(0, Number(product.costPrice) || 0);
    return { min: c, max: c, isRange: false };
  }
  const costs = list.map((v) => resolveVariantCostPrice(product, v));
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  return { min, max, isRange: min !== max };
}

export function formatPriceRange(
  range: { min: number; max: number; isRange: boolean },
  currencySymbol: string = '৳'
): string {
  const minStr = `${currencySymbol}${Number(range.min || 0).toLocaleString()}`;
  if (!range.isRange) return minStr;
  const maxStr = `${currencySymbol}${Number(range.max || 0).toLocaleString()}`;
  return `${minStr} - ${maxStr}`;
}

export function computeVariantProfitMargin(
  sellingPrice: number,
  costPrice: number
): { profit: number; marginPercent: number; isLoss: boolean } {
  const sp = Number(sellingPrice) || 0;
  const cp = Number(costPrice) || 0;
  const profit = sp - cp;
  const marginPercent = sp > 0 ? Math.round((profit / sp) * 100) : 0;
  return {
    profit,
    marginPercent,
    isLoss: sp > 0 && sp < cp,
  };
}

export function generateNextVariantSku(
  productSku: string,
  existingVariants: Array<Pick<Variant, 'variantSku'>> = [],
  explicitIndex?: number
): string {
  const baseSku = (productSku || 'SKU').trim().toUpperCase();
  const used = new Set(
    existingVariants
      .map((v) => (v.variantSku || '').trim().toUpperCase())
      .filter(Boolean)
  );
  let num = Math.max(1, explicitIndex ?? existingVariants.length + 1);
  while (used.has(`${baseSku}-V${num}`)) {
    num += 1;
  }
  return `${baseSku}-V${num}`;
}

export function resolveVariantByOrderItem(
  product: Pick<Product, 'variants'> | undefined | null,
  variantId?: string | null
): Variant | undefined {
  if (!product || !Array.isArray(product.variants)) return undefined;
  if (variantId) {
    const exact = product.variants.find((v) => v.id === variantId);
    if (exact) return exact;
  }
  return product.variants.find((v) => !v.inactive) || product.variants[0];
}

export function computeProductInventoryValue(
  product: Pick<Product, 'costPrice' | 'variants' | 'totalStock'> | undefined | null
): number {
  if (!product) return 0;
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, v) => {
      const qty = Math.max(0, Number(v.stock) || 0);
      const unitCost = resolveVariantCostPrice(product, v);
      return sum + qty * unitCost;
    }, 0);
  }
  return Math.max(0, Number(product.totalStock) || 0) * Math.max(0, Number(product.costPrice) || 0);
}

export function isProductOrAnyVariantLowStock(
  product: Pick<Product, 'variants' | 'reorderThreshold' | 'totalStock' | 'reservedQty' | 'archived' | 'status'> | undefined | null
): boolean {
  if (!product || product.archived || product.status === 'pending_review' || product.status === 'rejected') {
    return false;
  }
  const activeVariants = (product.variants || []).filter((v) => !v.inactive);
  if (activeVariants.length > 0) {
    return activeVariants.some((v) => {
      const avail = Math.max(0, (Number(v.stock) || 0) - Math.max(0, Number(v.reservedQty) || 0));
      const thresh = resolveVariantReorderThreshold(product, v);
      return avail <= thresh;
    });
  }
  const totalAvail = Math.max(
    0,
    (Number(product.totalStock) || 0) - Math.max(0, Number(product.reservedQty) || 0)
  );
  return totalAvail <= Math.max(0, Number(product.reorderThreshold ?? 5));
}

export function isVariantLowStock(
  product: Pick<Product, 'reorderThreshold'> | undefined | null,
  variant: Pick<Variant, 'stock' | 'reservedQty' | 'reorderThreshold' | 'inactive'> | undefined | null
): boolean {
  if (!variant || variant.inactive) return false;
  const avail = Math.max(0, (Number(variant.stock) || 0) - Math.max(0, Number(variant.reservedQty) || 0));
  const thresh = resolveVariantReorderThreshold(product, variant);
  return avail <= thresh;
}

export function doesProductMatchQuery(
  product: Product,
  rawQuery: string
): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (
    (product.name || '').toLowerCase().includes(q) ||
    (product.sku || '').toLowerCase().includes(q) ||
    (product.brand || '').toLowerCase().includes(q) ||
    (product.category || '').toLowerCase().includes(q) ||
    (product.barcodeValue || '').toLowerCase().includes(q)
  ) {
    return true;
  }
  return (product.variants || []).some(
    (v) =>
      (v.color || '').toLowerCase().includes(q) ||
      (v.model || '').toLowerCase().includes(q) ||
      (v.variantNote || '').toLowerCase().includes(q) ||
      (v.variantSku || '').toLowerCase().includes(q) ||
      (v.barcodeValue || '').toLowerCase().includes(q)
  );
}

/**
 * Checks whether the current user is permitted to see product purchase/cost price and profit margins.
 * Defaults to false for 'staff' unless explicitly overridden to true, and true for admin/superadmin/manager.
 */
export function canViewProductCost(
  user?: UserProfile | null,
  rolePermissions?: RolePermissionsMap | null
): boolean {
  if (!user) return false;
  return hasPermission(user, rolePermissions, 'viewProductCost');
}
