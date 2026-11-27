import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './config';
import { PreOrderStats, RolePermissionsMap } from '../types';
import { mergeWithDefaultRolePermissions } from '../preOrders/constants';
import { createEmptyPreOrderStats } from '../preOrders/stats';
import { perfTrackRead } from '../utils/perfLogger';

const ROLE_PERMISSIONS_CACHE_KEY = 'sat_cache_role_permissions';
const ROLE_PERMISSIONS_TTL_MS = 5 * 60 * 1000;
const STATS_SUMMARY_TTL_MS = 60 * 1000;

let rolePermsMemory: { data: RolePermissionsMap; ts: number } | null = null;
let statsSummaryMemory: { data: PreOrderStats | null; ts: number } | null = null;

export function invalidateRolePermissionsCache(): void {
  rolePermsMemory = null;
  try {
    localStorage.removeItem(ROLE_PERMISSIONS_CACHE_KEY);
  } catch {}
}

export function invalidatePreOrderStatsSummaryCache(): void {
  statsSummaryMemory = null;
}

export function getCachedRolePermissionsSync(): RolePermissionsMap | null {
  if (rolePermsMemory) return rolePermsMemory.data;
  try {
    const raw = localStorage.getItem(ROLE_PERMISSIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data) {
      return mergeWithDefaultRolePermissions(parsed.data as RolePermissionsMap);
    }
  } catch {}
  return null;
}

export async function getRolePermissions(options?: { forceRefresh?: boolean }): Promise<RolePermissionsMap> {
  if (!options?.forceRefresh && rolePermsMemory && Date.now() - rolePermsMemory.ts < ROLE_PERMISSIONS_TTL_MS) {
    return rolePermsMemory.data;
  }

  const cachedSync = getCachedRolePermissionsSync();
  if (!auth?.currentUser) {
    return cachedSync || mergeWithDefaultRolePermissions(null);
  }

  try {
    const ref = doc(db, 'settings', 'rolePermissions');
    const snap = await getDoc(ref);
    perfTrackRead('settings/rolePermissions', 1);
    const resolved = snap.exists()
      ? mergeWithDefaultRolePermissions(snap.data() as RolePermissionsMap)
      : mergeWithDefaultRolePermissions(null);
    rolePermsMemory = { data: resolved, ts: Date.now() };
    try {
      localStorage.setItem(ROLE_PERMISSIONS_CACHE_KEY, JSON.stringify({ data: resolved, ts: Date.now() }));
    } catch {}
    return resolved;
  } catch (err) {
    console.warn('getRolePermissions fallback to defaults:', err);
    return cachedSync || mergeWithDefaultRolePermissions(null);
  }
}

export async function getPreOrderStatsSummary(options?: { forceRefresh?: boolean }): Promise<PreOrderStats | null> {
  if (!auth?.currentUser) return null;
  if (!options?.forceRefresh && statsSummaryMemory && Date.now() - statsSummaryMemory.ts < STATS_SUMMARY_TTL_MS) {
    return statsSummaryMemory.data;
  }
  try {
    const snap = await getDoc(doc(db, 'preOrderStats', 'summary'));
    perfTrackRead('preOrderStats/summary', 1);
    if (!snap.exists()) {
      statsSummaryMemory = { data: null, ts: Date.now() };
      return null;
    }
    const base = createEmptyPreOrderStats();
    const raw = snap.data() as Partial<PreOrderStats>;
    const normalized: PreOrderStats = {
      ...base,
      ...raw,
      statusCounts: { ...base.statusCounts, ...(raw.statusCounts || {}) },
      subBrandStats: {
        SAT: { ...base.subBrandStats.SAT, ...(raw.subBrandStats?.SAT || {}) },
        GZ: { ...base.subBrandStats.GZ, ...(raw.subBrandStats?.GZ || {}) },
        RTX: { ...base.subBrandStats.RTX, ...(raw.subBrandStats?.RTX || {}) },
      },
    };
    statsSummaryMemory = { data: normalized, ts: Date.now() };
    return normalized;
  } catch (err) {
    console.warn('getPreOrderStatsSummary fallback:', err);
    return statsSummaryMemory?.data || null;
  }
}
