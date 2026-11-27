import type { CompanySettings, SubBrand, UserProfile } from '../types';

export const PARENT_COMPANY_ID = 'SAT';
export const PARENT_COMPANY_NAME = 'Sky Automation Tech';
export const PARENT_LEGACY_INVOICE_PREFIX = 'SAT-INV';
export const DEFAULT_PARENT_CREDIT_LINE = 'A concern of Sky Automation Tech';
export const SHARED_ACCOUNTING_TAG = 'parent/shared';

export const SUB_BRAND_ACCENT_PALETTE: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#0F766E', label: 'Teal' },
  { hex: '#C2410C', label: 'Burnt Orange' },
  { hex: '#1D4ED8', label: 'Royal Blue' },
  { hex: '#6D28D9', label: 'Violet' },
  { hex: '#BE123C', label: 'Crimson' },
  { hex: '#15803D', label: 'Emerald' },
  { hex: '#0369A1', label: 'Ocean' },
  { hex: '#9333EA', label: 'Amethyst' },
  { hex: '#B45309', label: 'Amber' },
  { hex: '#0F172A', label: 'Slate' },
];

export const DEFAULT_SELLING_SUB_BRANDS: SubBrand[] = [
  {
    id: 'GZ',
    name: 'GadgetZu',
    shortCode: 'GZ',
    invoicePrefix: 'GZ-INV',
    skuPrefix: 'GZ',
    logoUrl: '/gz_logo.jpg',
    accentColor: '#0F766E',
    phone: '01577351518',
    whatsapp: '01577351518',
    email: 'gadgetzubd@gmail.com',
    address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
    website: '',
    socialLinks: {},
    tagline: 'Smart Gadgets & Accessories',
    invoiceTerms: 'Goods once sold are non-refundable. Please verify items upon delivery.',
    invoiceFooterNote: 'Thank you for shopping with GadgetZu!',
    warrantyPolicyText: 'Standard seller warranty applies as noted on your invoice.',
    active: true,
    isSellingBrand: true,
    sortOrder: 1,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'RTX',
    name: 'RTX Gadget',
    shortCode: 'RTX',
    invoicePrefix: 'RTX-INV',
    skuPrefix: 'RTX',
    logoUrl: '/rtx_logo.jpg',
    accentColor: '#C2410C',
    phone: '01577351518',
    whatsapp: '01577351518',
    email: 'rtxgadget@gmail.com',
    address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
    website: '',
    socialLinks: {},
    tagline: 'Next-Gen Electronics & Tech Gear',
    invoiceTerms: 'Goods once sold are non-refundable. Please verify items upon delivery.',
    invoiceFooterNote: 'Thank you for choosing RTX Gadget!',
    warrantyPolicyText: 'Standard seller warranty applies as noted on your invoice.',
    active: true,
    isSellingBrand: true,
    sortOrder: 2,
    createdAt: 0,
    updatedAt: 0,
  },
];

const SUB_BRANDS_STORAGE_KEY = 'sat_cache_sub_brands_registry';

let inMemorySubBrands: SubBrand[] | null = null;

export function isValidHexColor(color?: string | null): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color.trim());
}

export function sanitizeHexColor(color?: string | null, fallback = '#0F766E'): string {
  const trimmed = (color || '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
    const r = trimmed[1];
    const g = trimmed[2];
    const b = trimmed[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

export function normalizeSubBrandCode(raw?: string | null): string {
  return (raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}

export function isLegacySatCode(code?: string | null): boolean {
  const key = normalizeSubBrandCode(code);
  return key === PARENT_COMPANY_ID || key === 'SKYAUTOMATIONTECH';
}

export function isSharedAccountingTag(code?: string | null): boolean {
  const clean = (code || '').trim().toLowerCase();
  return clean === SHARED_ACCOUNTING_TAG || clean === 'shared' || clean === 'all' || clean === 'parent';
}

export function getRegistrySubBrandsSync(companySettings?: CompanySettings | null): SubBrand[] {
  if (inMemorySubBrands && inMemorySubBrands.length > 0) {
    return inMemorySubBrands;
  }

  try {
    const raw = localStorage.getItem(SUB_BRANDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed?.data) ? (parsed.data as SubBrand[]) : Array.isArray(parsed) ? (parsed as SubBrand[]) : null;
      if (list && list.length > 0) {
        inMemorySubBrands = list;
        return list;
      }
    }
  } catch {
    // ignore storage errors
  }

  // Merge any custom fields stored inside companySettings before remote Firestore fetch resolves
  return mergeDefaultsWithCompanySettings(companySettings);
}

export function setRegistrySubBrandsCache(subBrands: SubBrand[]): void {
  const sorted = [...subBrands].sort(
    (a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name)
  );
  inMemorySubBrands = sorted;
  try {
    localStorage.setItem(
      SUB_BRANDS_STORAGE_KEY,
      JSON.stringify({ data: sorted, timestamp: Date.now() })
    );
  } catch {
    // ignore storage quota
  }
}

export function clearRegistrySubBrandsCache(): void {
  inMemorySubBrands = null;
  try {
    localStorage.removeItem(SUB_BRANDS_STORAGE_KEY);
  } catch {}
}

export function mergeDefaultsWithCompanySettings(companySettings?: CompanySettings | null): SubBrand[] {
  const resultMap = new Map<string, SubBrand>();
  for (const def of DEFAULT_SELLING_SUB_BRANDS) {
    const custom = companySettings?.subBrandDetails?.[def.shortCode];
    const customPrefix = companySettings?.prefixes?.[def.shortCode];
    resultMap.set(def.shortCode, {
      ...def,
      name: custom?.companyName || def.name,
      invoicePrefix: customPrefix || def.invoicePrefix,
      logoUrl: custom?.logoUrl || def.logoUrl,
      accentColor: sanitizeHexColor(custom?.accentColor, def.accentColor),
      phone: custom?.phone || companySettings?.phone || def.phone,
      whatsapp: custom?.whatsapp || companySettings?.paymentMethodsInfo?.whatsappContact || def.whatsapp,
      email: custom?.email || def.email,
      address: custom?.address || companySettings?.address || def.address,
      website: custom?.website || def.website,
      socialLinks: custom?.socialLinks || def.socialLinks,
      tagline: custom?.tagline || def.tagline,
      invoiceTerms: custom?.invoiceTerms || companySettings?.invoiceTerms || def.invoiceTerms,
      invoiceFooterNote: custom?.invoiceFooterNote || def.invoiceFooterNote,
      warrantyPolicyText: custom?.warrantyPolicyText || def.warrantyPolicyText,
    });
  }

  const extraCodes = companySettings?.subBrands || [];
  for (const rawCode of extraCodes) {
    const code = normalizeSubBrandCode(rawCode);
    if (!code || isLegacySatCode(code) || resultMap.has(code)) continue;
    const custom = companySettings?.subBrandDetails?.[code];
    resultMap.set(code, {
      id: code,
      name: custom?.companyName || code,
      shortCode: code,
      invoicePrefix: companySettings?.prefixes?.[code] || `${code}-INV`,
      skuPrefix: code,
      logoUrl: custom?.logoUrl || '',
      accentColor: sanitizeHexColor(custom?.accentColor, '#1D4ED8'),
      phone: custom?.phone || companySettings?.phone || '',
      whatsapp: custom?.whatsapp || companySettings?.paymentMethodsInfo?.whatsappContact || '',
      email: custom?.email || companySettings?.email || '',
      address: custom?.address || companySettings?.address || '',
      website: custom?.website || '',
      socialLinks: custom?.socialLinks || {},
      tagline: custom?.tagline || '',
      invoiceTerms: custom?.invoiceTerms || companySettings?.invoiceTerms || '',
      invoiceFooterNote: custom?.invoiceFooterNote || '',
      warrantyPolicyText: custom?.warrantyPolicyText || '',
      active: true,
      isSellingBrand: true,
      sortOrder: resultMap.size + 1,
      createdAt: 0,
      updatedAt: 0,
    });
  }

  return Array.from(resultMap.values());
}

/**
 * Returns selling sub-brands (never SAT).
 * By default filters to `active === true && isSellingBrand !== false`.
 */
export function getSellingSubBrands(
  subBrands?: SubBrand[] | null,
  options?: { includeInactive?: boolean; companySettings?: CompanySettings | null }
): SubBrand[] {
  const source =
    subBrands && subBrands.length > 0
      ? subBrands
      : getRegistrySubBrandsSync(options?.companySettings);

  return source
    .filter((sb) => {
      if (!sb || !sb.shortCode) return false;
      if (isLegacySatCode(sb.shortCode)) return false;
      if (sb.isSellingBrand === false) return false;
      if (!options?.includeInactive && sb.active === false) return false;
      return true;
    })
    .sort((a, b) => (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.name.localeCompare(b.name));
}

export function isSellingSubBrandCode(
  code?: string | null,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): boolean {
  const key = normalizeSubBrandCode(code);
  if (!key || isLegacySatCode(key) || isSharedAccountingTag(key)) return false;
  const selling = getSellingSubBrands(subBrands, { includeInactive: true, companySettings });
  return selling.some((sb) => sb.shortCode === key || sb.id === key);
}

export function isActiveSellingSubBrandCode(
  code?: string | null,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): boolean {
  const key = normalizeSubBrandCode(code);
  if (!key || isLegacySatCode(key) || isSharedAccountingTag(key)) return false;
  const selling = getSellingSubBrands(subBrands, { includeInactive: false, companySettings });
  return selling.some((sb) => sb.shortCode === key || sb.id === key);
}

export function resolveSubBrandMeta(
  code?: string | null,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): SubBrand | null {
  const key = normalizeSubBrandCode(code);
  if (!key) return null;
  const all = getSellingSubBrands(subBrands, { includeInactive: true, companySettings });
  const found = all.find(
    (sb) =>
      sb.shortCode.toUpperCase() === key ||
      sb.id.toUpperCase() === key ||
      sb.name.toUpperCase() === key
  );
  if (found) return found;

  if (key === 'GADGETZU') return all.find((sb) => sb.shortCode === 'GZ') || null;
  if (key === 'RTXGADGET') return all.find((sb) => sb.shortCode === 'RTX') || null;
  return null;
}

export interface BrandBadgeMeta {
  code: string;
  label: string;
  shortLabel: string;
  isLegacySat: boolean;
  isShared: boolean;
  isNeedsAssignment: boolean;
  isInactive: boolean;
  accentColor: string;
  badgeStyle: {
    backgroundColor: string;
    color: string;
    borderColor: string;
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = sanitizeHexColor(hex, '#0F172A').slice(1);
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatBrandBadgeMeta(
  code?: string | null,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): BrandBadgeMeta {
  const trimmed = (code || '').trim();
  if (!trimmed) {
    return {
      code: '',
      label: 'Needs Assignment',
      shortLabel: 'UNASSIGNED',
      isLegacySat: false,
      isShared: false,
      isNeedsAssignment: true,
      isInactive: false,
      accentColor: '#B45309',
      badgeStyle: {
        backgroundColor: '#FEF3C7',
        color: '#92400E',
        borderColor: '#F59E0B',
      },
    };
  }

  if (isSharedAccountingTag(trimmed)) {
    return {
      code: SHARED_ACCOUNTING_TAG,
      label: 'Parent / Shared',
      shortLabel: 'SHARED',
      isLegacySat: false,
      isShared: true,
      isNeedsAssignment: false,
      isInactive: false,
      accentColor: '#475569',
      badgeStyle: {
        backgroundColor: '#F1F5F9',
        color: '#334155',
        borderColor: '#CBD5E1',
      },
    };
  }

  if (isLegacySatCode(trimmed)) {
    return {
      code: PARENT_COMPANY_ID,
      label: 'Legacy (SAT)',
      shortLabel: 'Legacy (SAT)',
      isLegacySat: true,
      isShared: false,
      isNeedsAssignment: false,
      isInactive: true,
      accentColor: '#64748B',
      badgeStyle: {
        backgroundColor: '#F1F5F9',
        color: '#475569',
        borderColor: '#CBD5E1',
      },
    };
  }

  const found = resolveSubBrandMeta(trimmed, subBrands, companySettings);
  if (found) {
    const hex = sanitizeHexColor(found.accentColor, '#0F766E');
    return {
      code: found.shortCode,
      label: found.active ? found.name : `${found.name} (Inactive)`,
      shortLabel: found.shortCode,
      isLegacySat: false,
      isShared: false,
      isNeedsAssignment: false,
      isInactive: found.active === false,
      accentColor: hex,
      badgeStyle: {
        backgroundColor: hexToRgba(hex, 0.12),
        color: hex,
        borderColor: hexToRgba(hex, 0.35),
      },
    };
  }

  const upper = normalizeSubBrandCode(trimmed) || trimmed;
  return {
    code: upper,
    label: upper,
    shortLabel: upper,
    isLegacySat: false,
    isShared: false,
    isNeedsAssignment: false,
    isInactive: false,
    accentColor: '#334155',
    badgeStyle: {
      backgroundColor: '#F8FAFC',
      color: '#334155',
      borderColor: '#CBD5E1',
    },
  };
}

/**
 * Resolves the list of selling sub-brand IDs a user is allowed to operate on.
 * - Super Admin / Admin: ALL active selling sub-brands automatically (including future added ones).
 * - Other roles: intersection of user.subBrandAccess with selling sub-brands (stripping 'SAT').
 * - Legacy fallback: if a user only has ['SAT'] or empty list, falls back to active selling brands only for admin; empty for non-admin unless active selling brands specified via options.
 */
export function getUserAllowedSubBrandIds(
  user?: Pick<UserProfile, 'role' | 'subBrandAccess' | 'email'> | null,
  subBrands?: SubBrand[] | null,
  options?: { includeInactive?: boolean; companySettings?: CompanySettings | null }
): string[] {
  const selling = getSellingSubBrands(subBrands, {
    includeInactive: options?.includeInactive ?? false,
    companySettings: options?.companySettings,
  });
  const sellingIds = selling.map((s) => s.shortCode);

  if (!user) return sellingIds;
  const role = (user.role || '').toLowerCase();
  const isOwner = (user.email || '').trim().toLowerCase() === 'skyautomationtech@gmail.com';
  if (isOwner || role === 'superadmin' || role === 'super_admin' || role === 'admin') {
    return sellingIds;
  }

  const rawAccess = (user.subBrandAccess || [])
    .map((b) => normalizeSubBrandCode(b))
    .filter((b) => Boolean(b) && !isLegacySatCode(b));

  const valid = rawAccess.filter((b) =>
    getSellingSubBrands(subBrands, { includeInactive: true, companySettings: options?.companySettings }).some(
      (s) => s.shortCode === b
    )
  );

  if (valid.length > 0) return Array.from(new Set(valid));
  // Legacy safety fallback for staff accounts previously saved with ['SAT'] only
  if ((user.subBrandAccess || []).some((b) => isLegacySatCode(b))) {
    return sellingIds;
  }
  return [];
}

/**
 * Picks the default selling sub-brand code for creation forms (never 'SAT').
 */
export function resolveDefaultSellingSubBrand(
  options: {
    globalBrandFilter?: string | null;
    user?: Pick<UserProfile, 'role' | 'subBrandAccess' | 'email'> | null;
    subBrands?: SubBrand[] | null;
    companySettings?: CompanySettings | null;
  } = {}
): string {
  const activeSelling = getSellingSubBrands(options.subBrands, {
    includeInactive: false,
    companySettings: options.companySettings,
  });
  const activeIds = activeSelling.map((s) => s.shortCode);
  const userAllowed = getUserAllowedSubBrandIds(options.user, options.subBrands, {
    includeInactive: false,
    companySettings: options.companySettings,
  }).filter((id) => activeIds.includes(id));

  const filterCode = normalizeSubBrandCode(options.globalBrandFilter);
  if (
    filterCode &&
    filterCode !== 'ALL' &&
    !isLegacySatCode(filterCode) &&
    !isSharedAccountingTag(filterCode) &&
    activeIds.includes(filterCode) &&
    (userAllowed.length === 0 || userAllowed.includes(filterCode))
  ) {
    return filterCode;
  }

  if (userAllowed.length > 0) return userAllowed[0];
  if (activeIds.length > 0) return activeIds[0];
  return 'GZ';
}

/**
 * Checks whether a record's subBrand matches the current Global Brand Filter.
 * Supports: 'ALL', specific selling brand code (e.g. 'GZ'), or 'LEGACY_SAT'.
 */
export function matchesGlobalBrandFilter(
  recordSubBrand?: string | null,
  globalBrandFilter?: string | null
): boolean {
  const filter = (globalBrandFilter || 'ALL').trim().toUpperCase();
  if (!filter || filter === 'ALL') return true;
  const normalized = normalizeSubBrandCode(recordSubBrand);
  if (filter === 'LEGACY_SAT' || filter === 'SAT') {
    return isLegacySatCode(normalized);
  }
  if (filter === 'SHARED' || filter === 'PARENT/SHARED') {
    return isSharedAccountingTag(recordSubBrand) || !normalized;
  }
  return normalized === filter;
}

/**
 * Product-level filter: products without a selling sub-brand or tagged 'SAT' can appear
 * under Legacy/Needs Assignment or All Brands, and only matching brand otherwise.
 */
export function productNeedsBrandAssignment(
  product?: { subBrand?: string | null } | null,
  subBrands?: SubBrand[] | null,
  companySettings?: CompanySettings | null
): boolean {
  const code = normalizeSubBrandCode(product?.subBrand);
  if (!code || isLegacySatCode(code)) return true;
  return !isSellingSubBrandCode(code, subBrands, companySettings);
}
