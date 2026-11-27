import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './config';
import {
  CompanySettings,
  Invoice,
  Order,
  PreOrder,
  Product,
  SubBrand,
  UserProfile,
} from '../types';
import {
  DEFAULT_PARENT_CREDIT_LINE,
  DEFAULT_SELLING_SUB_BRANDS,
  PARENT_COMPANY_ID,
  PARENT_COMPANY_NAME,
  PARENT_LEGACY_INVOICE_PREFIX,
  getRegistrySubBrandsSync,
  getSellingSubBrands,
  isLegacySatCode,
  isValidHexColor,
  mergeDefaultsWithCompanySettings,
  normalizeSubBrandCode,
  productNeedsBrandAssignment,
  sanitizeHexColor,
  setRegistrySubBrandsCache,
} from '../utils/subBrands';
import { perfTrackRead, perfTrackWrite } from '../utils/perfLogger';
import { invalidatePreOrderStatsSummaryCache } from './preOrderBootstrap';

const SUB_BRANDS_TTL_MS = 5 * 60 * 1000;
let lastSubBrandsFetchedAt = 0;
let seedInFlight: Promise<SubBrand[]> | null = null;
const subscribers = new Set<(list: SubBrand[]) => void>();

function sanitizeFirestorePayload<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function notifySubscribers(list: SubBrand[]): void {
  subscribers.forEach((cb) => {
    try {
      cb(list);
    } catch {}
  });
}

export function subscribeSubBrandsChange(cb: (list: SubBrand[]) => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function invalidateSubBrandsCache(): void {
  lastSubBrandsFetchedAt = 0;
}

export async function getSubBrands(options?: {
  forceRefresh?: boolean;
  companySettings?: CompanySettings | null;
}): Promise<SubBrand[]> {
  const cached = getRegistrySubBrandsSync(options?.companySettings);
  if (
    !options?.forceRefresh &&
    lastSubBrandsFetchedAt > 0 &&
    Date.now() - lastSubBrandsFetchedAt < SUB_BRANDS_TTL_MS &&
    cached.length > 0
  ) {
    return cached;
  }

  if (!auth?.currentUser) {
    return cached;
  }

  try {
    const snap = await getDocs(collection(db, 'subBrands'));
    perfTrackRead('subBrands', snap.size || 1);
    if (!snap.empty) {
      const list = snap.docs
        .map((d) => {
          const data = d.data() as Partial<SubBrand>;
          const shortCode = normalizeSubBrandCode(data.shortCode || d.id);
          return {
            ...data,
            id: shortCode,
            shortCode,
            name: String(data.name || shortCode),
            invoicePrefix: String(data.invoicePrefix || `${shortCode}-INV`),
            skuPrefix: String(data.skuPrefix || shortCode),
            accentColor: sanitizeHexColor(data.accentColor, shortCode === 'RTX' ? '#C2410C' : '#0F766E'),
            active: data.active !== false,
            isSellingBrand: data.isSellingBrand !== false && !isLegacySatCode(shortCode),
            createdAt: Number(data.createdAt || 0),
            updatedAt: Number(data.updatedAt || 0),
          } as SubBrand;
        })
        .filter((sb) => sb.shortCode && !isLegacySatCode(sb.shortCode));

      if (list.length > 0) {
        setRegistrySubBrandsCache(list);
        lastSubBrandsFetchedAt = Date.now();
        notifySubscribers(list);
        return list;
      }
    }

    const fallback = mergeDefaultsWithCompanySettings(options?.companySettings);
    setRegistrySubBrandsCache(fallback);
    lastSubBrandsFetchedAt = Date.now();
    return fallback;
  } catch (err) {
    console.warn('getSubBrands fallback to local defaults:', err);
    return cached;
  }
}

/**
 * Idempotent bootstrap: seeds `subBrands/GZ` and `subBrands/RTX`, sets parent company metadata on `settings/company`,
 * and initializes `settings/invoiceCounters.countersByBrand` from `gzCounter`/`rtxCounter` without resetting anything.
 */
export async function ensureSubBrandsSeeded(
  companySettings?: CompanySettings | null,
  userRole?: string | null
): Promise<SubBrand[]> {
  if (!auth?.currentUser) {
    return getRegistrySubBrandsSync(companySettings);
  }
  if (seedInFlight) return seedInFlight;

  seedInFlight = (async () => {
    try {
      const snap = await getDocs(collection(db, 'subBrands'));
      perfTrackRead('subBrands(seedCheck)', snap.size || 1);

      const isAdminRole =
        userRole === 'superadmin' || userRole === 'super_admin' || userRole === 'admin';

      if (snap.empty && isAdminRole) {
        const defaults = mergeDefaultsWithCompanySettings(companySettings);
        const now = Date.now();
        const batch = writeBatch(db);
        for (const sb of defaults) {
          const payload: SubBrand = {
            ...sb,
            id: sb.shortCode,
            shortCode: sb.shortCode,
            isSellingBrand: true,
            active: true,
            createdAt: sb.createdAt || now,
            updatedAt: now,
          };
          batch.set(doc(db, 'subBrands', sb.shortCode), sanitizeFirestorePayload(payload), { merge: true });
        }

        // Preserve gzCounter & rtxCounter into countersByBrand; retire satCounter cleanly without deleting it
        try {
          const counterSnap = await getDoc(doc(db, 'settings', 'invoiceCounters'));
          const cData = counterSnap.exists() ? counterSnap.data() : {};
          const existingByBrand = (cData.countersByBrand || {}) as Record<string, number>;
          batch.set(
            doc(db, 'settings', 'invoiceCounters'),
            {
              satCounter: Number(cData.satCounter || 0),
              gzCounter: Number(cData.gzCounter || 0),
              rtxCounter: Number(cData.rtxCounter || 0),
              satCounterRetired: true,
              countersByBrand: {
                GZ: Number(existingByBrand.GZ ?? cData.gzCounter ?? 0),
                RTX: Number(existingByBrand.RTX ?? cData.rtxCounter ?? 0),
                ...existingByBrand,
              },
            },
            { merge: true }
          );
        } catch (counterErr) {
          console.warn('Could not sync invoiceCounters during subBrand seed:', counterErr);
        }

        await batch.commit();
        perfTrackWrite('subBrands(seedBatch)', defaults.length);

        // Update settings/company if superadmin
        if (userRole === 'superadmin' || userRole === 'super_admin') {
          try {
            const mergedSubBrandIds = defaults.map((d) => d.shortCode);
            const nextPrefixes: Record<string, string> = {
              ...(companySettings?.prefixes || {}),
            };
            defaults.forEach((d) => {
              nextPrefixes[d.shortCode] = d.invoicePrefix;
            });
            await setDoc(
              doc(db, 'settings', 'company'),
              sanitizeFirestorePayload({
                companyName: companySettings?.companyName || PARENT_COMPANY_NAME,
                legalName: companySettings?.legalName || PARENT_COMPANY_NAME,
                isParent: true,
                isSellingBrand: false,
                parentCreditLine: companySettings?.parentCreditLine || DEFAULT_PARENT_CREDIT_LINE,
                showParentCreditLine: companySettings?.showParentCreditLine ?? true,
                subBrandsSeeded: true,
                subBrands: mergedSubBrandIds,
                prefixes: nextPrefixes,
              }),
              { merge: true }
            );
          } catch (compErr) {
            console.warn('Could not patch settings/company parent flags:', compErr);
          }
        }

        setRegistrySubBrandsCache(defaults);
        lastSubBrandsFetchedAt = Date.now();
        notifySubscribers(defaults);
        return defaults;
      }

      return await getSubBrands({ forceRefresh: true, companySettings });
    } finally {
      seedInFlight = null;
    }
  })();

  return seedInFlight;
}

async function syncSubBrandToCompanySettings(
  brand: SubBrand,
  allBrands: SubBrand[]
): Promise<void> {
  try {
    const companyRef = doc(db, 'settings', 'company');
    const snap = await getDoc(companyRef);
    const current = snap.exists() ? (snap.data() as Partial<CompanySettings>) : {};
    const nextPrefixes: Record<string, string> = {
      ...(current.prefixes || {}),
      [brand.shortCode]: brand.invoicePrefix,
    };
    const nextDetails = {
      ...(current.subBrandDetails || {}),
      [brand.shortCode]: {
        companyName: brand.name,
        address: brand.address || '',
        phone: brand.phone || '',
        whatsapp: brand.whatsapp || '',
        email: brand.email || '',
        website: brand.website || '',
        socialLinks: brand.socialLinks || {},
        logoUrl: brand.logoUrl || '',
        accentColor: brand.accentColor,
        invoiceTerms: brand.invoiceTerms || '',
        invoiceFooterNote: brand.invoiceFooterNote || '',
        warrantyPolicyText: brand.warrantyPolicyText || '',
        tagline: brand.tagline || '',
      },
    };
    const activeCodes = getSellingSubBrands(allBrands, { includeInactive: false }).map(
      (b) => b.shortCode
    );
    await setDoc(
      companyRef,
      sanitizeFirestorePayload({
        isParent: true,
        isSellingBrand: false,
        subBrandsSeeded: true,
        subBrands: activeCodes,
        prefixes: nextPrefixes,
        subBrandDetails: nextDetails,
      }),
      { merge: true }
    );
  } catch (err) {
    // Non-fatal if user is admin without superadmin write on settings/company
    console.warn('syncSubBrandToCompanySettings skipped:', err);
  }
}

export interface CreateSubBrandInput {
  name: string;
  shortCode: string;
  invoicePrefix: string;
  skuPrefix?: string;
  logoUrl?: string;
  accentColor: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  website?: string;
  socialLinks?: SubBrand['socialLinks'];
  tagline?: string;
  invoiceTerms?: string;
  invoiceFooterNote?: string;
  warrantyPolicyText?: string;
  active?: boolean;
}

export async function createSubBrand(input: CreateSubBrandInput): Promise<SubBrand> {
  const code = normalizeSubBrandCode(input.shortCode);
  const name = (input.name || '').trim();
  const prefix = (input.invoicePrefix || '').trim().toUpperCase().replace(/\s+/g, '-');
  const skuPrefix = normalizeSubBrandCode(input.skuPrefix || code) || code;

  if (!name) throw new Error('Sub-brand name is required.');
  if (!code || code.length < 2 || code.length > 20) {
    throw new Error('Short code must be 2–20 uppercase letters/numbers (e.g. GZ, RTX, NOVA).');
  }
  if (
    isLegacySatCode(code) ||
    code === 'ALL' ||
    code === 'LEGACY_SAT' ||
    code === 'SHARED' ||
    code === 'PARENT'
  ) {
    throw new Error(`"${code}" is reserved for Parent / System use and cannot be used as a selling brand.`);
  }
  if (!prefix || prefix.length < 2 || prefix.length > 24) {
    throw new Error('Invoice prefix is required (2–24 characters, e.g. NOVA-INV).');
  }
  if (prefix === PARENT_LEGACY_INVOICE_PREFIX || prefix.startsWith('SAT-')) {
    throw new Error('Invoice prefix cannot start with SAT- (reserved for retired Parent Company invoices).');
  }
  if (!isValidHexColor(input.accentColor)) {
    throw new Error('Accent color must be a valid 6-digit hex color (e.g. #0F766E).');
  }

  const existing = await getSubBrands({ forceRefresh: true });
  if (existing.some((b) => b.shortCode.toUpperCase() === code || b.id.toUpperCase() === code)) {
    throw new Error(`Short code "${code}" already exists.`);
  }
  if (existing.some((b) => b.invoicePrefix.trim().toUpperCase() === prefix)) {
    throw new Error(`Invoice prefix "${prefix}" is already in use by another sub-brand.`);
  }

  const now = Date.now();
  const brandDoc: SubBrand = {
    id: code,
    name,
    shortCode: code,
    invoicePrefix: prefix,
    skuPrefix,
    logoUrl: (input.logoUrl || '').trim(),
    accentColor: sanitizeHexColor(input.accentColor, '#1D4ED8'),
    phone: (input.phone || '').trim(),
    whatsapp: (input.whatsapp || '').trim(),
    email: (input.email || '').trim(),
    address: (input.address || '').trim(),
    website: (input.website || '').trim(),
    socialLinks: input.socialLinks || {},
    tagline: (input.tagline || '').trim(),
    invoiceTerms: (input.invoiceTerms || '').trim(),
    invoiceFooterNote: (input.invoiceFooterNote || '').trim(),
    warrantyPolicyText: (input.warrantyPolicyText || '').trim(),
    active: input.active !== false,
    isSellingBrand: true,
    sortOrder: existing.length + 1,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(doc(db, 'subBrands', code), sanitizeFirestorePayload(brandDoc));
  perfTrackWrite('subBrands', 1);

  // Initialize sequential invoice counter slot at 0 for this brand without disturbing any existing counters
  try {
    const countersRef = doc(db, 'settings', 'invoiceCounters');
    const cSnap = await getDoc(countersRef);
    const cData = cSnap.exists() ? cSnap.data() : {};
    const byBrand = { ...(cData.countersByBrand || {}) } as Record<string, number>;
    if (byBrand[code] === undefined) {
      byBrand[code] = 0;
      await setDoc(countersRef, { countersByBrand: byBrand }, { merge: true });
    }
  } catch (err) {
    console.warn('Could not initialize invoiceCounters slot:', err);
  }

  const nextAll = [...existing, brandDoc];
  setRegistrySubBrandsCache(nextAll);
  lastSubBrandsFetchedAt = Date.now();
  notifySubscribers(nextAll);
  await syncSubBrandToCompanySettings(brandDoc, nextAll);
  return brandDoc;
}

export async function updateSubBrand(
  brandId: string,
  patch: Partial<Omit<SubBrand, 'id' | 'shortCode' | 'createdAt'>>
): Promise<SubBrand> {
  const code = normalizeSubBrandCode(brandId);
  if (!code || isLegacySatCode(code)) {
    throw new Error('Invalid sub-brand ID.');
  }

  const existing = await getSubBrands({ forceRefresh: true });
  const target = existing.find((b) => b.shortCode === code || b.id === code);
  if (!target) {
    throw new Error(`Sub-brand "${code}" not found.`);
  }

  const nextPrefix =
    patch.invoicePrefix !== undefined
      ? patch.invoicePrefix.trim().toUpperCase().replace(/\s+/g, '-')
      : target.invoicePrefix;
  if (!nextPrefix || nextPrefix.length < 2 || nextPrefix.length > 24) {
    throw new Error('Invoice prefix must be 2–24 characters.');
  }
  if (nextPrefix === PARENT_LEGACY_INVOICE_PREFIX || nextPrefix.startsWith('SAT-')) {
    throw new Error('Invoice prefix cannot start with SAT-.');
  }
  if (
    existing.some(
      (b) => b.shortCode !== code && b.invoicePrefix.trim().toUpperCase() === nextPrefix
    )
  ) {
    throw new Error(`Invoice prefix "${nextPrefix}" is already used by another sub-brand.`);
  }

  const nextAccent =
    patch.accentColor !== undefined ? patch.accentColor.trim() : target.accentColor;
  if (!isValidHexColor(nextAccent)) {
    throw new Error('Accent color must be a valid 6-digit hex code (#RRGGBB).');
  }

  if (patch.active === false) {
    const otherActive = existing.filter((b) => b.shortCode !== code && b.active !== false);
    if (otherActive.length === 0) {
      throw new Error('At least one selling sub-brand must remain active.');
    }
  }

  const updated: SubBrand = {
    ...target,
    ...patch,
    id: code,
    shortCode: code,
    name: (patch.name ?? target.name).trim(),
    invoicePrefix: nextPrefix,
    skuPrefix: normalizeSubBrandCode(patch.skuPrefix ?? target.skuPrefix ?? code) || code,
    accentColor: sanitizeHexColor(nextAccent, target.accentColor),
    isSellingBrand: true,
    updatedAt: Date.now(),
  };

  if (!updated.name) {
    throw new Error('Sub-brand name cannot be empty.');
  }

  await setDoc(doc(db, 'subBrands', code), sanitizeFirestorePayload(updated), { merge: true });
  perfTrackWrite('subBrands', 1);

  const nextAll = existing.map((b) => (b.shortCode === code ? updated : b));
  setRegistrySubBrandsCache(nextAll);
  lastSubBrandsFetchedAt = Date.now();
  notifySubscribers(nextAll);
  await syncSubBrandToCompanySettings(updated, nextAll);
  return updated;
}

export async function toggleSubBrandActive(brandId: string, active: boolean): Promise<SubBrand> {
  return updateSubBrand(brandId, { active });
}

export async function countSubBrandReferences(brandId: string): Promise<{
  products: number;
  orders: number;
  invoices: number;
  preOrders: number;
  total: number;
}> {
  const code = normalizeSubBrandCode(brandId);
  const [prodSnap, ordSnap, invSnap, poSnap] = await Promise.all([
    getDocs(query(collection(db, 'products'), where('subBrand', '==', code), limit(100))),
    getDocs(query(collection(db, 'orders'), where('subBrand', '==', code), limit(100))),
    getDocs(query(collection(db, 'invoices'), where('subBrand', '==', code), limit(100))),
    getDocs(query(collection(db, 'preOrders'), where('subBrand', '==', code), limit(100))),
  ]);
  const products = prodSnap.size;
  const orders = ordSnap.size;
  const invoices = invSnap.size;
  const preOrders = poSnap.size;
  return {
    products,
    orders,
    invoices,
    preOrders,
    total: products + orders + invoices + preOrders,
  };
}

export async function deleteUnusedSubBrand(brandId: string): Promise<void> {
  const code = normalizeSubBrandCode(brandId);
  const refs = await countSubBrandReferences(code);
  if (refs.total > 0) {
    throw new Error(
      `Cannot delete ${code}: referenced by ${refs.total} record(s) (Products: ${refs.products}, Orders: ${refs.orders}, Invoices: ${refs.invoices}, Pre-Orders: ${refs.preOrders}). Deactivate it instead.`
    );
  }
  const existing = await getSubBrands({ forceRefresh: true });
  if (existing.filter((b) => b.active !== false && b.shortCode !== code).length === 0) {
    throw new Error('Cannot delete the last active selling sub-brand.');
  }
  await deleteDoc(doc(db, 'subBrands', code));
  const nextAll = existing.filter((b) => b.shortCode !== code);
  setRegistrySubBrandsCache(nextAll);
  lastSubBrandsFetchedAt = Date.now();
  notifySubscribers(nextAll);
}

/**
 * One-time safe migration: strips 'SAT' from users.subBrandAccess & requestedSubBrandAccess.
 * - Admins/SuperAdmins receive all active selling sub-brands.
 * - Non-admins who had 'SAT' have 'SAT' replaced with all active selling sub-brands (preserving any other brands they already had, deduplicated).
 */
export async function migrateUsersSatAccess(): Promise<{
  totalScanned: number;
  updatedCount: number;
  details: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    before: string[];
    after: string[];
  }>;
}> {
  const subBrands = await getSubBrands({ forceRefresh: true });
  const activeIds = getSellingSubBrands(subBrands, { includeInactive: false }).map((b) => b.shortCode);
  const safeIds = activeIds.length > 0 ? activeIds : DEFAULT_SELLING_SUB_BRANDS.map((b) => b.shortCode);

  const usersSnap = await getDocs(collection(db, 'users'));
  const details: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    before: string[];
    after: string[];
  }> = [];

  const batch = writeBatch(db);
  let updatesInBatch = 0;

  usersSnap.docs.forEach((uDoc) => {
    const u = uDoc.data() as Partial<UserProfile>;
    const before = Array.isArray(u.subBrandAccess) ? [...u.subBrandAccess] : [];
    const reqBefore = Array.isArray(u.requestedSubBrandAccess) ? [...u.requestedSubBrandAccess] : [];
    const hasSat = before.some((b) => isLegacySatCode(b));
    const hasReqSat = reqBefore.some((b) => isLegacySatCode(b));
    const isAdminOrOwner =
      u.role === 'superadmin' ||
      u.role === 'admin' ||
      (u.email || '').trim().toLowerCase() === 'skyautomationtech@gmail.com';

    let after = before
      .map((b) => normalizeSubBrandCode(b))
      .filter((b) => Boolean(b) && !isLegacySatCode(b));

    if (isAdminOrOwner) {
      after = Array.from(new Set([...safeIds, ...after]));
    } else if (hasSat || after.length === 0) {
      after = Array.from(new Set([...safeIds, ...after]));
    } else {
      after = Array.from(new Set(after));
    }

    const reqAfter = reqBefore
      .map((b) => normalizeSubBrandCode(b))
      .filter((b) => Boolean(b) && !isLegacySatCode(b));
    const finalReq =
      hasReqSat || (reqBefore.length > 0 && reqAfter.length === 0)
        ? Array.from(new Set([...safeIds, ...reqAfter]))
        : Array.from(new Set(reqAfter));

    const accessChanged = JSON.stringify(before) !== JSON.stringify(after);
    const reqChanged = JSON.stringify(reqBefore) !== JSON.stringify(finalReq);

    if (accessChanged || reqChanged) {
      batch.update(doc(db, 'users', uDoc.id), {
        subBrandAccess: after,
        ...(reqBefore.length > 0 ? { requestedSubBrandAccess: finalReq } : {}),
        updatedAt: Date.now(),
      });
      updatesInBatch++;
      details.push({
        id: uDoc.id,
        name: u.name || u.email || uDoc.id,
        email: u.email || '',
        role: u.role || 'staff',
        before,
        after,
      });
    }
  });

  if (updatesInBatch > 0) {
    await batch.commit();
    perfTrackWrite('users(satAccessMigration)', updatesInBatch);
  }

  return {
    totalScanned: usersSnap.size,
    updatedCount: details.length,
    details,
  };
}

export interface LegacySatReassignmentPreview {
  products: Product[];
  orders: Order[];
  invoices: Invoice[];
  preOrders: PreOrder[];
}

export async function getLegacySatReassignmentPreview(): Promise<LegacySatReassignmentPreview> {
  const subBrands = await getSubBrands({ forceRefresh: true });
  const [prodSnap, ordSnap, invSnap, poSnap] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(query(collection(db, 'orders'), where('subBrand', '==', PARENT_COMPANY_ID))),
    getDocs(query(collection(db, 'invoices'), where('subBrand', '==', PARENT_COMPANY_ID))),
    getDocs(query(collection(db, 'preOrders'), where('subBrand', '==', PARENT_COMPANY_ID))),
  ]);

  const products = prodSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) } as Product))
    .filter((p) => productNeedsBrandAssignment(p, subBrands));

  const orders = ordSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Order));
  const invoices = invSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Invoice));
  const preOrders = poSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as PreOrder));

  return { products, orders, invoices, preOrders };
}

/**
 * Bulk-assigns selling brand tag on products (NEVER changes existing sku or barcodeValue).
 */
export async function applyBulkProductBrandAssignment(params: {
  productIds: string[];
  targetSubBrandId: string;
  actor: { id: string; name: string; role: string };
}): Promise<number> {
  const target = normalizeSubBrandCode(params.targetSubBrandId);
  if (!target || isLegacySatCode(target)) {
    throw new Error('Target must be a valid selling sub-brand (never SAT).');
  }
  const uniqueIds = Array.from(new Set(params.productIds.filter(Boolean)));
  if (uniqueIds.length === 0) return 0;

  const CHUNK = 400;
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const slice = uniqueIds.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    slice.forEach((pid) => {
      batch.update(doc(db, 'products', pid), {
        subBrand: target,
        subBrandId: target,
        updatedAt: Date.now(),
      });
    });
    await batch.commit();
  }

  // Audit log entry
  try {
    await setDoc(doc(collection(db, 'auditLogs')), {
      action: 'UPDATE',
      targetType: 'Product',
      targetId: uniqueIds.slice(0, 5).join(','),
      targetName: `${uniqueIds.length} product(s) -> ${target}`,
      details: `Bulk assigned selling sub-brand "${target}" to ${uniqueIds.length} product(s) without modifying SKU or barcode values.`,
      userId: params.actor.id,
      userName: params.actor.name,
      userRole: params.actor.role,
      timestamp: Date.now(),
    });
  } catch {}

  perfTrackWrite('products(bulkBrandAssign)', uniqueIds.length);
  return uniqueIds.length;
}

/**
 * Historical SAT record reassignment (SuperAdmin/Admin tool):
 * Only updates reporting `subBrand` / `subBrandId` tags and `customer.brandIds`.
 * NEVER touches existing invoiceNumber, preOrderNumber, sku, barcodeValue, or invoiceCounters.satCounter.
 */
export async function applyHistoricalBrandReassignment(params: {
  productIds: string[];
  orderIds: string[];
  invoiceIds: string[];
  preOrderIds: string[];
  targetSubBrandId: string;
  actor: { id: string; name: string; role: string };
}): Promise<{ products: number; orders: number; invoices: number; preOrders: number }> {
  const target = normalizeSubBrandCode(params.targetSubBrandId);
  if (!target || isLegacySatCode(target)) {
    throw new Error('Target must be an active selling sub-brand.');
  }

  const now = Date.now();
  const commitPairs = async (
    collName: 'products' | 'orders' | 'invoices' | 'preOrders',
    ids: string[]
  ): Promise<number> => {
    const clean = Array.from(new Set(ids.filter(Boolean)));
    if (clean.length === 0) return 0;
    const customerIdsToTag = new Set<string>();

    for (let i = 0; i < clean.length; i += 350) {
      const slice = clean.slice(i, i + 350);
      const batch = writeBatch(db);
      for (const id of slice) {
        if (collName === 'orders' || collName === 'preOrders') {
          const snap = await getDoc(doc(db, collName, id));
          const cId = snap.exists() ? (snap.data()?.customerId as string | undefined) : undefined;
          if (cId) customerIdsToTag.add(cId);
        }
        batch.update(doc(db, collName, id), {
          subBrand: target,
          subBrandId: target,
          updatedAt: now,
        });
      }
      await batch.commit();
    }

    if (customerIdsToTag.size > 0) {
      const custArr = Array.from(customerIdsToTag);
      for (let i = 0; i < custArr.length; i += 350) {
        const batch = writeBatch(db);
        custArr.slice(i, i + 350).forEach((cId) => {
          batch.update(doc(db, 'customers', cId), {
            brandIds: arrayUnion(target),
          });
        });
        await batch.commit();
      }
    }
    return clean.length;
  };

  const [products, orders, invoices, preOrders] = await Promise.all([
    commitPairs('products', params.productIds),
    commitPairs('orders', params.orderIds),
    commitPairs('invoices', params.invoiceIds),
    commitPairs('preOrders', params.preOrderIds),
  ]);

  if (preOrders > 0) {
    invalidatePreOrderStatsSummaryCache();
  }

  try {
    await setDoc(doc(collection(db, 'auditLogs')), {
      action: 'UPDATE',
      targetType: 'Order',
      targetId: `LEGACY_SAT_REASSIGN_${target}`,
      targetName: `Historical Legacy (SAT) -> ${target}`,
      details: `Reassigned reporting subBrand tags to "${target}" (Products: ${products}, Orders: ${orders}, Invoices: ${invoices}, Pre-Orders: ${preOrders}). Invoice/PO numbers, SKUs, barcodes, and satCounter left untouched.`,
      userId: params.actor.id,
      userName: params.actor.name,
      userRole: params.actor.role,
      timestamp: now,
    });
  } catch {}

  return { products, orders, invoices, preOrders };
}
