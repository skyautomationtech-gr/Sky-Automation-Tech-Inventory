import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Link2,
  Lock,
  Power,
  QrCode,
  RefreshCw,
  RotateCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Category,
  CompanySettings,
  PreOrder,
  PreOrderStatus,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_STATUSES,
  formatPreOrderProductLabel,
  hasPermission,
  isPreOrderAdminRole,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import {
  buildPublicTrackingUrl,
  isSafeTrackingTokenFormat,
  isValidHttpsUrl,
} from '../../preOrders/tracking';
import { getSuppliers } from '../../firebase/db';
import {
  actorFromUser,
  checkAndExpireCompletedTrackingLinks,
  generateMissingTrackingLinks,
  queryPreOrdersPage,
  regeneratePublicTrackingToken,
  syncPublicTracking,
  togglePublicTrackingEnabled,
  updatePreOrderCourierVisibility,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  Modal,
  SearchInput,
  Select,
  Skeleton,
  useToast,
} from '../../design-system';
import { PreOrderStatusBadge, SubBrandBadge } from './PreOrderStatusBadge';
import PreOrderDetailDrawer from './PreOrderDetailDrawer';
import TrackingLinkShareModal from './TrackingLinkShareModal';

export interface CustomerTrackingLinksViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  companySettings?: CompanySettings | null;
  onNavigateSettings?: () => void;
}

type LinkStatusFilter = 'ALL' | 'active' | 'disabled' | 'expired' | 'missing';

function resolveLinkState(
  order: PreOrder,
  companySettings?: CompanySettings | null
): 'active' | 'disabled' | 'expired' | 'missing' {
  const token = (order.trackingToken || order.trackingTokenId || '').trim();
  if (!token || !isSafeTrackingTokenFormat(token)) return 'missing';
  if (order.trackingEnabled === false) {
    const lastEvt = order.trackingHistory?.[order.trackingHistory.length - 1];
    if (lastEvt?.action === 'expired') return 'expired';
    // Also mark visually expired if auto-expiry rule applies to completed order
    if (
      companySettings?.trackingAutoExpiryEnabled &&
      ['Delivered', 'Cancelled', 'Refunded'].includes(order.status)
    ) {
      return 'expired';
    }
    return 'disabled';
  }
  return 'active';
}

function formatShortDateTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CustomerTrackingLinksView: React.FC<CustomerTrackingLinksViewProps> = ({
  user,
  rolePermissions,
  categories,
  companySettings,
  onNavigateSettings,
}) => {
  const toast = useToast();

  const canView = hasPermission(user, rolePermissions, 'preOrderView');
  const isAdmin = isPreOrderAdminRole(user.role);
  const canManageTracking = hasPermission(user, rolePermissions, 'preOrderManageTracking') || isAdmin;

  const allowedSubBrands = useMemo<Array<'SAT' | 'GZ' | 'RTX'>>(() => {
    const isSuper = user.role === 'superadmin' || (user.role as string) === 'super_admin';
    if (isSuper || !user.subBrandAccess || user.subBrandAccess.length === 0) {
      return ['SAT', 'GZ', 'RTX'];
    }
    const valid = user.subBrandAccess.filter(
      (b): b is 'SAT' | 'GZ' | 'RTX' => b === 'SAT' || b === 'GZ' || b === 'RTX'
    );
    return valid.length > 0 ? valid : ['SAT'];
  }, [user.role, user.subBrandAccess]);

  const baseUrlValid = isValidHttpsUrl(companySettings?.publicAppUrl);

  // Filters & pagination
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [linkFilter, setLinkFilter] = useState<LinkStatusFilter>('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'ALL' | PreOrderStatus>('ALL');
  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');
  const [pageSize] = useState<25 | 50>(25);
  const [cursorHistory, setCursorHistory] = useState<
    Array<QueryDocumentSnapshot<DocumentData> | null>
  >([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [items, setItems] = useState<PreOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [indexNotice, setIndexNotice] = useState('');

  // Row / modal states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [shareOrder, setShareOrder] = useState<PreOrder | null>(null);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [autoExpireDoneOnce, setAutoExpireDoneOnce] = useState(false);

  // Confirm modals for sensitive admin actions
  const [regenTarget, setRegenTarget] = useState<PreOrder | null>(null);
  const [regenReason, setRegenReason] = useState('');
  const [regenSubmitting, setRegenSubmitting] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<{ order: PreOrder; enable: boolean } | null>(null);
  const [toggleReason, setToggleReason] = useState('');
  const [toggleSubmitting, setToggleSubmitting] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    getSuppliers()
      .then((list) => setSuppliers(list.filter((s) => s.status !== 'inactive')))
      .catch(() => {});
  }, []);

  const fetchSeqRef = useRef(0);

  const fetchPage = useCallback(
    async (targetPageIdx = pageIndex, explicitCursors = cursorHistory) => {
      if (!canView) {
        setLoading(false);
        return;
      }
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      setIndexNotice('');

      try {
        const cursor = explicitCursors[targetPageIdx] || null;
        const res = await queryPreOrdersPage({
          pageSize,
          cursor,
          subBrand: subBrandFilter,
          allowedSubBrands,
          statuses: orderStatusFilter === 'ALL' ? undefined : [orderStatusFilter],
          searchTerm: debouncedSearch,
          sortField: 'createdAt',
          sortDir: 'desc',
        });

        if (seq !== fetchSeqRef.current) return;
        setItems(res.items);
        setNextCursor(res.lastDoc);
        setHasMore(res.hasMore);
        if (res.indexNotice) setIndexNotice(res.indexNotice);

        // Admin auto-expiry sweep on completed orders older than configured days
        if (
          isAdmin &&
          !autoExpireDoneOnce &&
          companySettings?.trackingAutoExpiryEnabled &&
          res.items.length > 0
        ) {
          setAutoExpireDoneOnce(true);
          checkAndExpireCompletedTrackingLinks(res.items, actorFromUser(user), companySettings)
            .then((expRes) => {
              if (expRes.expiredCount > 0) {
                toast.info(
                  `Auto-expired ${expRes.expiredCount} completed order tracking link(s) older than ${
                    companySettings.trackingAutoExpiryDays || 90
                  } days.`
                );
                // Refresh visible rows cleanly
                fetchPage(targetPageIdx, explicitCursors);
              }
            })
            .catch(() => {});
        }
      } catch (err: any) {
        if (seq !== fetchSeqRef.current) return;
        toast.error(err?.message || 'Failed to load tracking links.');
      } finally {
        if (seq === fetchSeqRef.current) setLoading(false);
      }
    },
    [
      canView,
      pageIndex,
      cursorHistory,
      pageSize,
      subBrandFilter,
      allowedSubBrands,
      orderStatusFilter,
      debouncedSearch,
      isAdmin,
      autoExpireDoneOnce,
      companySettings,
      user,
      toast,
    ]
  );

  // Reset pagination when filters change
  useEffect(() => {
    const resetCursors = [null];
    setCursorHistory(resetCursors);
    setPageIndex(0);
    fetchPage(0, resetCursors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subBrandFilter, orderStatusFilter, debouncedSearch, canView]);

  const filteredItems = useMemo(() => {
    if (linkFilter === 'ALL') return items;
    return items.filter((ord) => resolveLinkState(ord, companySettings) === linkFilter);
  }, [items, linkFilter, companySettings]);

  const handleCopyLink = async (order: PreOrder) => {
    const token = (order.trackingToken || order.trackingTokenId || '').trim();
    const url = buildPublicTrackingUrl(companySettings?.publicAppUrl, token);
    if (!url) {
      toast.error('Configure a valid https:// Public Tracking Base URL in Company Settings first.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(order.id);
      toast.success(`Copied tracking link for ${order.preOrderNumber}`);
      window.setTimeout(() => setCopiedId((prev) => (prev === order.id ? null : prev)), 1800);
    } catch {
      toast.error('Failed to copy link to clipboard.');
    }
  };

  const handleResyncOrder = async (order: PreOrder) => {
    if (!canManageTracking || busyOrderId) return;
    setBusyOrderId(order.id);
    try {
      const res = await syncPublicTracking(order.id, {
        companySettings,
        actor: actorFromUser(user),
        logAudit: true,
      });
      if (res.ok) {
        toast.success(`Resynced public tracking data for ${order.preOrderNumber}.`);
        await fetchPage();
      } else {
        toast.error(res.error || 'Failed to resync tracking link.');
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleToggleCourierVisibility = async (order: PreOrder) => {
    if (!canManageTracking || busyOrderId) return;
    const current = Boolean(
      order.showCourierTrackingToCustomer ?? companySettings?.defaultShowCourierTracking ?? false
    );
    setBusyOrderId(order.id);
    try {
      const res = await updatePreOrderCourierVisibility(
        order.id,
        !current,
        actorFromUser(user),
        companySettings
      );
      if (res.ok) {
        toast.success(
          !current
            ? `Courier tracking is now visible to customer on ${order.preOrderNumber}.`
            : `Courier tracking hidden from customer on ${order.preOrderNumber}.`
        );
        await fetchPage();
      } else {
        toast.warning(res.error || 'Updated flag, but failed to sync public snapshot.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update courier visibility.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleConfirmRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regenTarget || !isAdmin || regenSubmitting) return;
    setRegenSubmitting(true);
    try {
      await regeneratePublicTrackingToken(
        regenTarget.id,
        actorFromUser(user),
        regenReason.trim(),
        companySettings
      );
      toast.success(
        `Generated a new tracking link for ${regenTarget.preOrderNumber}. Previous link has been invalidated.`
      );
      setRegenTarget(null);
      setRegenReason('');
      await fetchPage();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to regenerate tracking link.');
    } finally {
      setRegenSubmitting(false);
    }
  };

  const handleConfirmToggleEnabled = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toggleTarget || !isAdmin || toggleSubmitting) return;
    setToggleSubmitting(true);
    try {
      await togglePublicTrackingEnabled(
        toggleTarget.order.id,
        toggleTarget.enable,
        actorFromUser(user),
        {
          reason: toggleReason.trim(),
          companySettings,
        }
      );
      toast.success(
        toggleTarget.enable
          ? `Re-enabled customer tracking link for ${toggleTarget.order.preOrderNumber}.`
          : `Disabled tracking link and stripped public snapshot for ${toggleTarget.order.preOrderNumber}.`
      );
      setToggleTarget(null);
      setToggleReason('');
      await fetchPage();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update tracking link state.');
    } finally {
      setToggleSubmitting(false);
    }
  };

  const handleBulkGenerateMissing = async () => {
    if (!isAdmin || bulkGenerating) return;
    setBulkGenerating(true);
    try {
      const res = await generateMissingTrackingLinks(actorFromUser(user), companySettings);
      toast.success(
        `Scanned ${res.scanned} pre-orders: ${res.generated} generated, ${res.synced} synced${
          res.failed > 0 ? `, ${res.failed} failed` : ''
        }.`
      );
      await fetchPage(0, [null]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to generate missing tracking links.');
    } finally {
      setBulkGenerating(false);
    }
  };

  if (!canView) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-5 h-5" />
        </div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Access Restricted
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Your role does not have permission to view Pre-Order Customer Tracking Links.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Link2 className="w-5 h-5 text-[#D4AF37]" />
            Customer Tracking Links
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage secret 256-bit customer portal links, QR codes, courier visibility, and link expiry.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={bulkGenerating}
              leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />}
              onClick={handleBulkGenerateMissing}
            >
              Generate links for existing pre-orders
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => fetchPage()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Warning if publicAppUrl not configured */}
      {!baseUrlValid && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex flex-wrap items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Public Tracking Base URL is missing or invalid HTTPS URL.</strong> Copy, QR
              sharing, and live Preview are disabled until a valid <span className="font-mono">https://</span>{' '}
              base URL is saved in Company Settings.
            </div>
          </div>
          {onNavigateSettings && user.role === 'superadmin' && (
            <Button type="button" variant="danger" size="xs" onClick={onNavigateSettings}>
              Configure in Settings
            </Button>
          )}
        </div>
      )}

      {indexNotice && (
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
          {indexNotice}
        </div>
      )}

      {/* Filters Card */}
      <Card padding="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <SearchInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onClear={() => setSearchInput('')}
            placeholder="Search PO-xxxx, phone, customer, product..."
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Link States' },
              { value: 'active', label: 'Active' },
              { value: 'disabled', label: 'Disabled' },
              { value: 'expired', label: 'Expired' },
              { value: 'missing', label: 'Missing Token' },
            ]}
            value={linkFilter}
            onChange={(val) => setLinkFilter(val as LinkStatusFilter)}
            searchable={false}
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Order Statuses' },
              ...PRE_ORDER_STATUSES.map((st) => ({ value: st, label: st })),
            ]}
            value={orderStatusFilter}
            onChange={(val) => setOrderStatusFilter(val as 'ALL' | PreOrderStatus)}
            searchable={false}
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Sub-Brands' },
              ...allowedSubBrands.map((b) => ({ value: b, label: b })),
            ]}
            value={subBrandFilter}
            onChange={(val) => setSubBrandFilter(val as 'ALL' | 'SAT' | 'GZ' | 'RTX')}
            searchable={false}
          />
        </div>
      </Card>

      {/* Links Table Card */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Customer &amp; Product</th>
                <th className="py-3 px-4">Order Status</th>
                <th className="py-3 px-4">Link Status &amp; Courier Visibility</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="p-4">
                      <Skeleton className="h-9 w-full rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No pre-orders match your current filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((order) => {
                  const linkState = resolveLinkState(order, companySettings);
                  const token = (order.trackingToken || order.trackingTokenId || '').trim();
                  const trackingUrl = buildPublicTrackingUrl(companySettings?.publicAppUrl, token);
                  const courierVisible = Boolean(
                    order.showCourierTrackingToCustomer ??
                      companySettings?.defaultShowCourierTracking ??
                      false
                  );
                  const isBusy = busyOrderId === order.id;

                  return (
                    <tr
                      key={order.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDrawerOrderId(order.id)}
                          className="font-mono font-bold text-[#93741E] dark:text-[#E2C255] hover:underline cursor-pointer"
                        >
                          {order.preOrderNumber}
                        </button>
                        <div className="flex items-center gap-1.5 mt-1">
                          <SubBrandBadge subBrand={order.subBrand} />
                          <span className="text-[11px] font-mono text-slate-400">
                            {order.orderDate || ''}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {order.customerName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {order.customerPhone}
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-1">
                          {formatPreOrderProductLabel(order)} &times;
                          {order.totalQty ??
                            normalizePreOrderItems(order).reduce((s, it) => s + it.qty, 0)}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top">
                        <PreOrderStatusBadge status={order.status} size="xs" />
                        <div className="text-[11px] text-slate-400 mt-1 font-mono">
                          Sync: {formatShortDateTime(order.updatedAt)}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={
                              linkState === 'active'
                                ? 'success'
                                : linkState === 'expired'
                                ? 'warning'
                                : linkState === 'disabled'
                                ? 'neutral'
                                : 'danger'
                            }
                            size="xs"
                          >
                            {linkState === 'active'
                              ? 'Active'
                              : linkState === 'expired'
                              ? 'Expired'
                              : linkState === 'disabled'
                              ? 'Disabled'
                              : 'Missing'}
                          </Badge>

                          {canManageTracking ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleCourierVisibility(order)}
                              title="Toggle whether customer sees courier name & tracking number"
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border cursor-pointer transition-colors disabled:opacity-50 ${
                                courierVisible
                                  ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                              }`}
                            >
                              {courierVisible ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  Courier Shown
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  Courier Hidden
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {courierVisible ? 'Courier shown' : 'Courier hidden'}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 align-top text-right">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={!baseUrlValid || linkState !== 'active'}
                            leftIcon={
                              copiedId === order.id ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )
                            }
                            onClick={() => handleCopyLink(order)}
                          >
                            {copiedId === order.id ? 'Copied' : 'Copy'}
                          </Button>

                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            disabled={!token}
                            leftIcon={<QrCode className="w-3 h-3 text-[#D4AF37]" />}
                            onClick={() => setShareOrder(order)}
                          >
                            Share / QR
                          </Button>

                          {trackingUrl && linkState === 'active' && (
                            <a
                              href={trackingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-semibold hover:border-[#D4AF37]/60"
                              title="Open Customer Tracking Portal in a new tab"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Preview
                            </a>
                          )}

                          {canManageTracking && linkState !== 'missing' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              isLoading={isBusy}
                              leftIcon={<RotateCw className="w-3 h-3" />}
                              onClick={() => handleResyncOrder(order)}
                              title="Resync public snapshot"
                            >
                              Resync
                            </Button>
                          )}

                          {isAdmin && linkState !== 'missing' && (
                            <>
                              <Button
                                type="button"
                                variant={linkState === 'active' ? 'ghost' : 'secondary'}
                                size="xs"
                                leftIcon={<Power className="w-3 h-3" />}
                                onClick={() => {
                                  setToggleReason('');
                                  setToggleTarget({
                                    order,
                                    enable: linkState !== 'active',
                                  });
                                }}
                              >
                                {linkState === 'active' ? 'Disable' : 'Enable'}
                              </Button>

                              <Button
                                type="button"
                                variant="danger"
                                size="xs"
                                onClick={() => {
                                  setRegenReason('');
                                  setRegenTarget(order);
                                }}
                              >
                                Regenerate
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between text-xs">
          <span className="font-mono text-slate-500">
            Showing {filteredItems.length} order(s) (Page {pageIndex + 1})
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={pageIndex === 0 || loading}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              onClick={() => {
                if (pageIndex === 0) return;
                const prevIdx = pageIndex - 1;
                setPageIndex(prevIdx);
                fetchPage(prevIdx, cursorHistory);
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={!hasMore || loading}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              onClick={() => {
                if (!hasMore || !nextCursor) return;
                const nextIdx = pageIndex + 1;
                const updatedCursors = [...cursorHistory];
                updatedCursors[nextIdx] = nextCursor;
                setCursorHistory(updatedCursors);
                setPageIndex(nextIdx);
                fetchPage(nextIdx, updatedCursors);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Share & QR Modal */}
      <TrackingLinkShareModal
        isOpen={Boolean(shareOrder)}
        onClose={() => setShareOrder(null)}
        order={shareOrder}
        companySettings={companySettings}
      />

      {/* Detail Drawer */}
      <PreOrderDetailDrawer
        preOrderId={drawerOrderId}
        isOpen={Boolean(drawerOrderId)}
        onClose={() => setDrawerOrderId(null)}
        user={user}
        rolePermissions={rolePermissions}
        categories={categories}
        suppliers={suppliers}
        companySettings={companySettings}
        onUpdated={() => fetchPage()}
      />

      {/* Regenerate Link Confirmation Modal */}
      <Modal
        isOpen={Boolean(regenTarget)}
        onClose={() => !regenSubmitting && setRegenTarget(null)}
        title="Regenerate Customer Tracking Link"
        subtitle={regenTarget ? `${regenTarget.preOrderNumber} • ${regenTarget.customerName}` : ''}
        size="sm"
      >
        <form onSubmit={handleConfirmRegenerate} className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Old link will immediately stop working.</strong> A new 256-bit secret link
              will be generated and the previous URL will return "Unavailable / Expired".
            </span>
          </div>

          <FormField label="Reason (Optional)">
            <Input
              value={regenReason}
              onChange={(e) => setRegenReason(e.target.value)}
              placeholder="e.g. Link forwarded to wrong contact, customer requested new link"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={regenSubmitting}
              onClick={() => setRegenTarget(null)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" isLoading={regenSubmitting}>
              Confirm Regenerate
            </Button>
          </div>
        </form>
      </Modal>

      {/* Disable / Enable Confirmation Modal */}
      <Modal
        isOpen={Boolean(toggleTarget)}
        onClose={() => !toggleSubmitting && setToggleTarget(null)}
        title={
          toggleTarget?.enable
            ? 'Enable Customer Tracking Link'
            : 'Disable Customer Tracking Link'
        }
        subtitle={
          toggleTarget
            ? `${toggleTarget.order.preOrderNumber} • ${toggleTarget.order.customerName}`
            : ''
        }
        size="sm"
      >
        <form onSubmit={handleConfirmToggleEnabled} className="space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
            {toggleTarget?.enable
              ? 'Re-enabling will rebuild the sanitized tracking snapshot and allow anyone with the link to view live status and verified payment totals.'
              : 'Disabling immediately strips all order & customer details from the public document, leaving only { enabled: false }.'}
          </div>

          <FormField label="Note / Reason (Optional)">
            <Input
              value={toggleReason}
              onChange={(e) => setToggleReason(e.target.value)}
              placeholder={
                toggleTarget?.enable
                  ? 'e.g. Customer requested reactivation'
                  : 'e.g. Link temporarily paused or completed'
              }
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={toggleSubmitting}
              onClick={() => setToggleTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={toggleTarget?.enable ? 'primary' : 'danger'}
              isLoading={toggleSubmitting}
            >
              {toggleTarget?.enable ? 'Enable Link' : 'Disable Link'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CustomerTrackingLinksView;
