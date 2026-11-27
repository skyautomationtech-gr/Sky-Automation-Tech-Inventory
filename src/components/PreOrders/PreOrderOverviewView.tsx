import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Boxes,
  CheckCircle2,
  Clock,
  CreditCard,
  FileBarChart2,
  Link2Off,
  PackageCheck,
  Plane,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  PreOrder,
  PreOrderAuditEntry,
  PreOrderListFilterPreset,
  PreOrderSettings,
  PreOrderStats,
  PreOrderStatsRebuildDiff,
  PreOrderStatus,
  RolePermissionsMap,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_STATUSES,
  formatBDT,
  getTodayIsoDate,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderOverdue,
} from '../../preOrders/constants';
import { toPaisa } from '../../preOrders/calculations';
import {
  computeNeedsAttentionBuckets,
  computePreOrderStatsFromData,
  createEmptyPreOrderStats,
} from '../../preOrders/stats';
import { DEFAULT_PRE_ORDER_SETTINGS } from '../../preOrders/templates';
import { getPreOrderDay, toIsoDayFromTimestamp } from '../../preOrders/reports';
import {
  PreOrderDashboardData,
  actorFromUser,
  loadMorePreOrderAuditFeed,
  loadPreOrderDashboardData,
  rebuildPreOrderStats,
  savePreOrderSettings,
} from '../../firebase/preOrderDb';
import { auth } from '../../firebase/config';
import {
  Button,
  Card,
  Modal,
  Select,
  Skeleton,
  useToast,
} from '../../design-system';

export interface PreOrderOverviewViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  onNavigate: (tab: string, subAction?: string, initialId?: string | null) => void;
  onOpenPreOrderList: (preset: PreOrderListFilterPreset) => void;
  onOpenOrderDetail?: (preOrderId: string) => void;
}

type DateRangeMode = '7d' | '30d' | '90d' | 'all' | 'custom';

function useCountUp(target: number, durationMs: number = 420): number {
  const [val, setVal] = useState(target);
  useEffect(() => {
    const startVal = 0;
    if (!Number.isFinite(target) || target === 0) {
      setVal(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = startVal + (target - startVal) * eased;
      setVal(Number.isInteger(target) ? Math.round(next) : Math.round(next * 100) / 100);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return val;
}

interface KpiCardProps {
  label: string;
  value: number;
  isCurrency?: boolean;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClass: string;
  onClick?: () => void;
}

const AnimatedKpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  isCurrency = false,
  subtitle,
  icon: Icon,
  accentClass,
  onClick,
}) => {
  const animated = useCountUp(value);
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400/70 dark:hover:border-amber-500/60 shadow-xs transition-all cursor-pointer group flex flex-col justify-between min-h-[96px]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-tight">
          {label}
        </span>
        <div className={`p-1.5 rounded-xl shrink-0 ${accentClass}`}>
          <Icon size={15} />
        </div>
      </div>
      <div className="mt-2">
        <div className="text-lg font-extrabold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
          {isCurrency ? formatBDT(animated) : animated.toLocaleString('en-US')}
        </div>
        {subtitle && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate flex items-center justify-between gap-1">
            <span className="truncate">{subtitle}</span>
            <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 text-amber-500 transition-opacity shrink-0" />
          </div>
        )}
      </div>
    </button>
  );
};

const PreOrderOverviewCharts = React.lazy(() => import('./PreOrderOverviewCharts'));

export const PreOrderOverviewView: React.FC<PreOrderOverviewViewProps> = ({
  user,
  rolePermissions,
  onNavigate,
  onOpenPreOrderList,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const canCreate = hasPermission(user, rolePermissions, 'preOrderCreate');
  const canViewReports = hasPermission(user, rolePermissions, 'preOrderReports');
  const canViewProfit = hasPermission(user, rolePermissions, 'preOrderViewProfit');
  const canViewSupplier = hasPermission(user, rolePermissions, 'preOrderSupplier') || isAdmin;

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<PreOrderDashboardData | null>(null);
  const [activity, setActivity] = useState<PreOrderAuditEntry[]>([]);
  const [activityCursor, setActivityCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [loadingMoreActivity, setLoadingMoreActivity] = useState(false);

  const [dateRangeMode, setDateRangeMode] = useState<DateRangeMode>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');

  const [settings, setSettings] = useState<PreOrderSettings>(DEFAULT_PRE_ORDER_SETTINGS);
  const [editingRecDays, setEditingRecDays] = useState(3);
  const [savingRecDays, setSavingRecDays] = useState(false);

  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildDiffModal, setRebuildDiffModal] = useState<{
    open: boolean;
    diffs: PreOrderStatsRebuildDiff[];
    scannedCount: number;
  }>({ open: false, diffs: [], scannedCount: 0 });

  const fetchDashboard = useCallback(async () => {
    if (!auth?.currentUser || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await loadPreOrderDashboardData({
        canViewProfit,
        canViewSupplier,
        allowedSubBrands,
      });
      setData(res);
      setActivity(res.activity);
      setActivityCursor(res.activityLastDoc);
      setActivityHasMore(res.activityHasMore);
      setSettings(res.settings);
      setEditingRecDays(res.settings.receivedNotConvertedDays || 3);
    } catch (err: any) {
      setError(err?.message || 'Failed to load pre-order dashboard analytics.');
    } finally {
      setLoading(false);
    }
  }, [canViewProfit, canViewSupplier, allowedSubBrands, user?.id]);

  useEffect(() => {
    if (!auth?.currentUser || !user?.id) return;
    fetchDashboard();
  }, [fetchDashboard, user?.id]);

  const resolvedWindow = useMemo(() => {
    const today = getTodayIsoDate();
    if (dateRangeMode === 'all') return { from: '', to: '' };
    if (dateRangeMode === 'custom') return { from: customFrom, to: customTo };
    const days = dateRangeMode === '7d' ? 6 : dateRangeMode === '30d' ? 29 : 89;
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { from: `${y}-${m}-${day}`, to: today };
  }, [dateRangeMode, customFrom, customTo]);

  const isFilteredScope =
    dateRangeMode !== 'all' ||
    subBrandFilter !== 'ALL' ||
    allowedSubBrands.length < 3;

  const scopedOrders = useMemo(() => {
    if (!data) return [];
    return data.orders.filter((po) => {
      if (subBrandFilter !== 'ALL' && po.subBrand !== subBrandFilter) return false;
      const day = getPreOrderDay(po);
      if (resolvedWindow.from && day < resolvedWindow.from) return false;
      if (resolvedWindow.to && day > resolvedWindow.to) return false;
      return true;
    });
  }, [data, subBrandFilter, resolvedWindow]);

  const scopedPayments = useMemo(() => {
    if (!data) return [];
    return data.payments.filter((p) => {
      if (subBrandFilter !== 'ALL' && p.subBrand && p.subBrand !== subBrandFilter) return false;
      const day = toIsoDayFromTimestamp(p.receivedAt || p.createdAt);
      if (resolvedWindow.from && day < resolvedWindow.from) return false;
      if (resolvedWindow.to && day > resolvedWindow.to) return false;
      return true;
    });
  }, [data, subBrandFilter, resolvedWindow]);

  // Use preOrderStats/summary directly when viewing full unfiltered brand scope (1-doc read accuracy),
  // and recompute dynamically when user slices by sub-brand or date range.
  const effectiveStats = useMemo<PreOrderStats>(() => {
    if (!data) return createEmptyPreOrderStats();
    if (!isFilteredScope && data.hasSummaryDoc) {
      return data.stats;
    }
    return computePreOrderStatsFromData({
      preOrders: scopedOrders,
      pendingPayments: scopedPayments.filter((p) => p.status === 'pending'),
      supplierPayments: data.supplierPayments,
      privateCostsByOrder: data.privateCostsByOrder,
      postings: data.postings,
    });
  }, [data, isFilteredScope, scopedOrders, scopedPayments]);

  const needsAttention = useMemo(
    () =>
      computeNeedsAttentionBuckets(
        data?.orders.filter((o) => subBrandFilter === 'ALL' || o.subBrand === subBrandFilter) || [],
        settings
      ),
    [data?.orders, subBrandFilter, settings]
  );

  // Chart 1: Pre-Orders by Status
  const statusChartData = useMemo(() => {
    return PRE_ORDER_STATUSES.map((st) => ({
      name: st.replace('International ', 'Int. ').replace('Arrived in ', 'Arrived '),
      fullStatus: st,
      count: effectiveStats.statusCounts[st] || 0,
    })).filter((r) => r.count > 0);
  }, [effectiveStats]);

  // Chart 2: Daily Pre-Orders & Verified Advance Trend
  const dailyTrendData = useMemo(() => {
    const map = new Map<string, { date: string; orders: number; advance: number }>();
    scopedOrders.forEach((po) => {
      const day = getPreOrderDay(po);
      if (!map.has(day)) map.set(day, { date: day, orders: 0, advance: 0 });
      const b = map.get(day)!;
      b.orders += 1;
      b.advance += Number(po.advancePaid || 0);
    });
    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-21);
  }, [scopedOrders]);

  // Chart 3: Payment Collection by Method
  const paymentMethodData = useMemo(() => {
    const map = new Map<string, number>();
    scopedPayments.forEach((p) => {
      if (p.status !== 'verified' || p.type === 'refund' || p.type === 'reversal') return;
      const m = p.method || 'Cash';
      map.set(m, (map.get(m) || 0) + Number(p.amount || 0));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
      .filter((x) => x.value > 0);
  }, [scopedPayments]);

  // Chart 4: Sub-Brand Split
  const subBrandChartData = useMemo(() => {
    return (['SAT', 'GZ', 'RTX'] as const)
      .filter((sb) => allowedSubBrands.includes(sb))
      .map((sb) => ({
        name: sb,
        orders: effectiveStats.subBrandStats[sb]?.count || 0,
        orderValue: Math.round(effectiveStats.subBrandStats[sb]?.totalAmount || 0),
        advance: Math.round(effectiveStats.subBrandStats[sb]?.advancePaid || 0),
      }));
  }, [effectiveStats, allowedSubBrands]);

  // Chart 5: China Procurement & Shipment Pipeline Funnel
  const pipelineChartData = useMemo(() => {
    return [
      { stage: 'China Orders', count: effectiveStats.chinaOrders },
      { stage: 'In Transit', count: effectiveStats.internationalShipments },
      { stage: 'Customs', count: effectiveStats.customsClearance },
      { stage: 'Arrived BD', count: effectiveStats.arrivedProducts },
      { stage: 'In Stock', count: effectiveStats.receivedInStock },
      { stage: 'Ready/Deliv.', count: effectiveStats.readyForDelivery + effectiveStats.deliveredOrders },
    ];
  }, [effectiveStats]);

  // Chart 6: Revenue vs Expected Profit vs Actual Recognized Profit (Permission-gated)
  const profitComparisonData = useMemo(() => {
    if (!canViewProfit || !data) return [];
    const byMonth = new Map<string, { month: string; revenue: number; expectedProfit: number; actualProfit: number }>();
    const postingsProfitByOrder = new Map<string, number>();
    data.postings.forEach((pst) => {
      if (pst.preOrderId && pst.profitDelta) {
        postingsProfitByOrder.set(
          pst.preOrderId,
          (postingsProfitByOrder.get(pst.preOrderId) || 0) + Number(pst.profitDelta || 0)
        );
      }
    });

    scopedOrders.forEach((po) => {
      if (po.status === 'Cancelled' || po.status === 'Refunded') return;
      const month = getPreOrderDay(po).slice(0, 7);
      if (!byMonth.has(month)) {
        byMonth.set(month, { month, revenue: 0, expectedProfit: 0, actualProfit: 0 });
      }
      const bucket = byMonth.get(month)!;
      const priv = data.privateCostsByOrder[po.id];
      const netRev = Math.max(0, Number(po.totalAmount || 0) - Number(po.deliveryCharge || 0));
      bucket.revenue += netRev;
      bucket.expectedProfit += Number(priv?.expectedProfit || 0);
      bucket.actualProfit += Number(postingsProfitByOrder.get(po.id) || 0);
    });

    return Array.from(byMonth.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6)
      .map((m) => ({
        month: m.month,
        revenue: Math.round(m.revenue),
        expectedProfit: Math.round(m.expectedProfit),
        actualProfit: Math.round(m.actualProfit),
      }));
  }, [canViewProfit, data, scopedOrders]);

  const handleRebuildStats = async () => {
    if (!isAdmin) return;
    setRebuilding(true);
    try {
      const res = await rebuildPreOrderStats(actorFromUser(user));
      setRebuildDiffModal({
        open: true,
        diffs: res.diffs,
        scannedCount: res.stats.totalOrders,
      });
      await fetchDashboard();
      toast.success('Stats Rebuilt', 'Summary metrics verified against real Firestore records.');
    } catch (err: any) {
      toast.error('Rebuild Failed', err?.message || 'Could not rebuild stats.');
    } finally {
      setRebuilding(false);
    }
  };

  const handleSaveReceivedDays = async () => {
    const clean = Math.max(1, Math.round(Number(editingRecDays) || 3));
    setSavingRecDays(true);
    try {
      const saved = await savePreOrderSettings(
        { ...settings, receivedNotConvertedDays: clean },
        actorFromUser(user)
      );
      setSettings(saved);
      setEditingRecDays(saved.receivedNotConvertedDays);
      toast.success('Threshold Updated', `Alerting when received stock waits ≥ ${clean} days.`);
    } catch (err: any) {
      toast.error('Save Failed', err?.message || 'Could not save settings.');
    } finally {
      setSavingRecDays(false);
    }
  };

  const handleLoadMoreActivity = async () => {
    if (!activityCursor || loadingMoreActivity) return;
    setLoadingMoreActivity(true);
    try {
      const more = await loadMorePreOrderAuditFeed(activityCursor, 20);
      setActivity((prev) => [...prev, ...more.items]);
      setActivityCursor(more.lastDoc);
      setActivityHasMore(more.hasMore);
    } catch {
      toast.error('Load Failed', 'Could not fetch older activity logs.');
    } finally {
      setLoadingMoreActivity(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, idx) => (
            <Skeleton key={idx} className="h-24 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center max-w-lg mx-auto">
        <AlertCircle size={32} className="text-rose-500 mx-auto mb-3" />
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Unable to Load Pre-Order Overview
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">{error}</p>
        <Button onClick={fetchDashboard} leftIcon={<RefreshCw size={14} />}>
          Retry Loading
        </Button>
      </Card>
    );
  }

  const readyAndStockCount =
    (effectiveStats.receivedInStock || 0) + (effectiveStats.readyForDelivery || 0);
  const cancelledAndRefundedCount =
    (effectiveStats.cancelledOrders || 0) + (effectiveStats.refundedOrders || 0);
  const customsAndTransitCount =
    (effectiveStats.internationalShipments || 0) + (effectiveStats.customsClearance || 0);

  return (
    <div className="space-y-5">
      {/* Header + Filters + Quick Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Pre-Order Overview Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isFilteredScope
              ? `Filtered scope (${scopedOrders.length} orders matched)`
              : data?.hasSummaryDoc
              ? `Synced summary cache (1-doc read) · Updated ${new Date(
                  effectiveStats.lastUpdatedAt || Date.now()
                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Live computed summary from real pre-order records'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={dateRangeMode}
            searchable={false}
            options={[
              { value: 'all', label: 'All Time' },
              { value: '7d', label: 'Last 7 Days' },
              { value: '30d', label: 'Last 30 Days' },
              { value: '90d', label: 'Last 90 Days' },
              { value: 'custom', label: 'Custom Range' },
            ]}
            onChange={(val) => setDateRangeMode(val as DateRangeMode)}
            className="w-36 text-xs"
          />

          {dateRangeMode === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <span className="text-xs text-slate-400">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>
          )}

          {allowedSubBrands.length > 1 && (
            <Select
              value={subBrandFilter}
              searchable={false}
              options={[
                { value: 'ALL', label: 'All Brands' },
                ...allowedSubBrands.map((sb) => ({ value: sb, label: sb })),
              ]}
              onChange={(val) => setSubBrandFilter(val as any)}
              className="w-32 text-xs"
            />
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchDashboard}
            leftIcon={<RefreshCw size={13} />}
          >
            Refresh
          </Button>

          {isAdmin && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRebuildStats}
              disabled={rebuilding}
              leftIcon={<RotateCcw size={13} className={rebuilding ? 'animate-spin' : ''} />}
            >
              {rebuilding ? 'Rebuilding...' : 'Rebuild stats'}
            </Button>
          )}
        </div>
      </div>

      {/* Quick Actions Strip */}
      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
        {canCreate && (
          <Button
            size="sm"
            onClick={() => onNavigate('preorder_create')}
            leftIcon={<Plus size={14} />}
          >
            New Pre-Order
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNavigate('preorder_payments')}
          leftIcon={<CreditCard size={14} />}
        >
          Collect / Verify Payment
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNavigate('preorder_tracking')}
          leftIcon={<Truck size={14} />}
        >
          Update Tracking
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNavigate('preorder_reminders')}
          leftIcon={<Bell size={14} />}
        >
          Reminders ({needsAttention.totalAlerts})
        </Button>
        {canViewReports && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('preorder_reports')}
            leftIcon={<FileBarChart2 size={14} />}
          >
            Reports &amp; Export
          </Button>
        )}
      </div>

      {/* 13 Core KPI Cards + Permitted Admin Finance Liability Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <AnimatedKpiCard
          label="Total Pre-Orders"
          value={effectiveStats.totalOrders}
          subtitle="All statuses"
          icon={Boxes}
          accentClass="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          onClick={() => onOpenPreOrderList({ subBrand: subBrandFilter, label: 'All Pre-Orders' })}
        />
        <AnimatedKpiCard
          label="Active Orders"
          value={effectiveStats.activeOrders}
          subtitle="In pipeline"
          icon={Activity}
          accentClass="bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: PRE_ORDER_STATUSES.filter(
                (s) => s !== 'Delivered' && s !== 'Cancelled' && s !== 'Refunded'
              ) as PreOrderStatus[],
              label: 'Active Pre-Orders',
            })
          }
        />
        <AnimatedKpiCard
          label="Total Order Value"
          value={effectiveStats.totalOrderValue}
          isCurrency
          subtitle="Excl. cancelled"
          icon={Wallet}
          accentClass="bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
          onClick={() => onOpenPreOrderList({ subBrand: subBrandFilter, label: 'All Pre-Orders Value' })}
        />
        <AnimatedKpiCard
          label="Total Advance Collected"
          value={effectiveStats.totalAdvanceCollected}
          isCurrency
          subtitle="Verified deposits"
          icon={CheckCircle2}
          accentClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              paymentState: 'partially_paid',
              label: 'Orders with Advances',
            })
          }
        />
        <AnimatedKpiCard
          label="Total Customer Due"
          value={effectiveStats.totalCustomerDue}
          isCurrency
          subtitle="Active balance due"
          icon={Clock}
          accentClass="bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              paymentState: 'unpaid',
              label: 'Unpaid / Due Pre-Orders',
            })
          }
        />

        <AnimatedKpiCard
          label="Pending Verification"
          value={effectiveStats.pendingPaymentCount}
          subtitle={formatBDT(effectiveStats.pendingPaymentAmount) + ' awaiting'}
          icon={ShieldAlert}
          accentClass="bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          onClick={() => onNavigate('preorder_payments')}
        />
        <AnimatedKpiCard
          label="Ordered from China / WH"
          value={effectiveStats.chinaOrders}
          subtitle="Procurement stage"
          icon={Boxes}
          accentClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['Ordered from China', 'China Warehouse'],
              label: 'China Stage Pre-Orders',
            })
          }
        />
        <AnimatedKpiCard
          label="Int'l Transit & Customs"
          value={customsAndTransitCount}
          subtitle={`${effectiveStats.internationalShipments} ship · ${effectiveStats.customsClearance} customs`}
          icon={Plane}
          accentClass="bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['International Shipment', 'Customs Clearance'],
              label: 'International Transit & Customs',
            })
          }
        />
        <AnimatedKpiCard
          label="Arrived in Bangladesh"
          value={effectiveStats.arrivedProducts}
          subtitle="Awaiting stock intake"
          icon={Truck}
          accentClass="bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['Arrived in Bangladesh'],
              label: 'Arrived in Bangladesh',
            })
          }
        />
        <AnimatedKpiCard
          label="In Stock & Ready"
          value={readyAndStockCount}
          subtitle={`${effectiveStats.receivedInStock} stocked · ${effectiveStats.readyForDelivery} ready`}
          icon={PackageCheck}
          accentClass="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['Received in Stock', 'Ready for Delivery'],
              label: 'In Stock & Ready for Delivery',
            })
          }
        />

        <AnimatedKpiCard
          label="Delivered Orders"
          value={effectiveStats.deliveredOrders}
          subtitle={`${effectiveStats.convertedOrders} invoiced`}
          icon={CheckCircle2}
          accentClass="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['Delivered'],
              label: 'Delivered Pre-Orders',
            })
          }
        />
        <AnimatedKpiCard
          label="Cancelled / Refunded"
          value={cancelledAndRefundedCount}
          subtitle={`Refunded: ${formatBDT(effectiveStats.totalRefunded)}`}
          icon={AlertTriangle}
          accentClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              statuses: ['Cancelled', 'Refunded'],
              label: 'Cancelled & Refunded',
            })
          }
        />
        <AnimatedKpiCard
          label="Overdue Arrivals"
          value={effectiveStats.overdueOrders}
          subtitle="Past expected ETA"
          icon={AlertCircle}
          accentClass="bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
          onClick={() =>
            onOpenPreOrderList({
              subBrand: subBrandFilter,
              overdueOnly: true,
              label: 'Overdue Pre-Orders',
            })
          }
        />

        {(isAdmin || canViewProfit) && (
          <AnimatedKpiCard
            label="Customer Advance Liability"
            value={effectiveStats.customerAdvancesLiability}
            isCurrency
            subtitle="Unconverted deposits held"
            icon={Wallet}
            accentClass="bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400"
            onClick={() => onNavigate('preorder_reports')}
          />
        )}

        {canViewSupplier && (
          <AnimatedKpiCard
            label="Supplier Payable Est."
            value={effectiveStats.supplierPayableEstimate}
            isCurrency
            subtitle="China balance estimate"
            icon={TrendingUp}
            accentClass="bg-orange-50 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"
            onClick={() => onNavigate('preorder_suppliers')}
          />
        )}
      </div>

      {/* Empty Dataset Helper */}
      {data && data.orders.length === 0 ? (
        <Card className="p-8 text-center">
          <Boxes size={36} className="mx-auto text-slate-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            No Pre-Orders Recorded Yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Create your first customer pre-order to populate live analytics, charts, and workflow queues.
          </p>
          {canCreate && (
            <Button onClick={() => onNavigate('preorder_create')} leftIcon={<Plus size={14} />}>
              Create First Pre-Order
            </Button>
          )}
        </Card>
      ) : (
        <>
          {/* 6 Real-Data Charts Grid (Lazy-loaded Recharts) */}
          <Suspense
            fallback={
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <Card key={idx} className="p-4">
                    <Skeleton className="h-4 w-40 mb-3" />
                    <Skeleton className="h-60 w-full rounded-xl" />
                  </Card>
                ))}
              </div>
            }
          >
            <PreOrderOverviewCharts
              scopedOrdersCount={scopedOrders.length}
              statusChartData={statusChartData}
              dailyTrendData={dailyTrendData}
              paymentMethodData={paymentMethodData}
              subBrandChartData={subBrandChartData}
              pipelineChartData={pipelineChartData}
              profitComparisonData={profitComparisonData}
              canViewProfit={canViewProfit}
            />
          </Suspense>

          {/* Needs Attention (7 Buckets) + Recent Activity */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            {/* Needs Attention */}
            <Card className="xl:col-span-6 p-4 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Needs Attention ({needsAttention.totalAlerts})
                  </h2>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>Stocked &gt;</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={editingRecDays}
                      onChange={(e) => setEditingRecDays(Math.max(1, Number(e.target.value) || 1))}
                      className="w-12 px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-center font-mono text-xs text-slate-900 dark:text-white"
                    />
                    <span>d alert</span>
                    {editingRecDays !== settings.receivedNotConvertedDays && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleSaveReceivedDays}
                        disabled={savingRecDays}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {[
                  {
                    key: 'overdue',
                    label: 'Overdue expected arrivals',
                    count: needsAttention.overdueArrivals.length,
                    badge: 'Urgent',
                    badgeCls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
                    onClick: () =>
                      onOpenPreOrderList({ overdueOnly: true, subBrand: subBrandFilter, label: 'Overdue Arrivals' }),
                  },
                  {
                    key: 'pendingPay',
                    label: 'Pending payment verifications',
                    count: needsAttention.pendingVerifications.length,
                    badge: formatBDT(effectiveStats.pendingPaymentAmount),
                    badgeCls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
                    onClick: () => onNavigate('preorder_payments'),
                  },
                  {
                    key: 'duePast',
                    label: `Orders with unpaid due ≥ ${settings.dueReminderDays} days`,
                    count: needsAttention.duePastDays.length,
                    badge: 'Follow-up',
                    badgeCls: 'bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
                    onClick: () =>
                      onOpenPreOrderList({
                        paymentState: 'partially_paid',
                        subBrand: subBrandFilter,
                        label: 'Due Follow-Up Needed',
                      }),
                  },
                  {
                    key: 'refundReq',
                    label: 'Cancelled orders requiring customer refund',
                    count: needsAttention.refundRequired.length,
                    badge: 'Action Required',
                    badgeCls: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
                    onClick: () =>
                      onOpenPreOrderList({
                        statuses: ['Cancelled'],
                        subBrand: subBrandFilter,
                        label: 'Cancelled Orders Awaiting Refund',
                      }),
                  },
                  {
                    key: 'arrivedNotRec',
                    label: 'Arrived in Bangladesh but stock not received',
                    count: needsAttention.arrivedNotReceived.length,
                    badge: 'Warehouse',
                    badgeCls: 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
                    onClick: () =>
                      onOpenPreOrderList({
                        statuses: ['Arrived in Bangladesh'],
                        subBrand: subBrandFilter,
                        label: 'Arrived — Receive Stock Pending',
                      }),
                  },
                  {
                    key: 'recNotConv',
                    label: `Received in stock ≥ ${settings.receivedNotConvertedDays} days, not converted/delivered`,
                    count: needsAttention.receivedNotDelivered.length,
                    badge: 'Convert / Bill',
                    badgeCls: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300',
                    onClick: () =>
                      onOpenPreOrderList({
                        statuses: ['Received in Stock'],
                        subBrand: subBrandFilter,
                        label: 'Received Stock Waiting Conversion',
                      }),
                  },
                  {
                    key: 'trackingMissing',
                    label: 'Active orders with tracking link disabled / missing',
                    count: needsAttention.trackingDisabledOrFailed.length,
                    badge: 'Portal Link',
                    badgeCls: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                    onClick: () => onNavigate('preorder_links'),
                  },
                ].map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={row.onClick}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-lg font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          row.count > 0
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                        }`}
                      >
                        {row.count}
                      </span>
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {row.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${row.badgeCls}`}>
                        {row.badge}
                      </span>
                      <ArrowRight size={13} className="text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Recent Activity Feed */}
            <Card className="xl:col-span-6 p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Recent Activity Feed
                  </h2>
                </div>
                <span className="text-[11px] font-mono text-slate-400">Latest {activity.length} events</span>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {activity.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-400">
                    No recent pre-order activity logged yet.
                  </div>
                ) : (
                  activity.map((entry) => (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                            {entry.preOrderNumber || entry.preOrderId}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            {entry.action}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 leading-snug">
                          {entry.summary}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          By {entry.userName} ({entry.userRole})
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 shrink-0 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {activityHasMore && (
                <div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleLoadMoreActivity}
                    disabled={loadingMoreActivity}
                  >
                    {loadingMoreActivity ? 'Loading...' : 'Load 20 More Events'}
                  </Button>
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Rebuild Stats Diff Modal */}
      <Modal
        isOpen={rebuildDiffModal.open}
        onClose={() => setRebuildDiffModal({ open: false, diffs: [], scannedCount: 0 })}
        title="Stats Rebuild Verification Report"
        description={`Scanned ${rebuildDiffModal.scannedCount} pre-order documents from Firestore.`}
        size="md"
      >
        <div className="space-y-3">
          {rebuildDiffModal.diffs.length === 0 ? (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>All cached summary KPIs already matched real Firestore totals (0 differences).</span>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-2.5 text-left">Metric</th>
                    <th className="p-2.5 text-right">Before</th>
                    <th className="p-2.5 text-right">After</th>
                    <th className="p-2.5 text-right">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {rebuildDiffModal.diffs.map((d) => (
                    <tr key={d.field}>
                      <td className="p-2.5 font-medium text-slate-900 dark:text-white">{d.label}</td>
                      <td className="p-2.5 text-right font-mono text-slate-500">{d.before.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {d.after.toLocaleString()}
                      </td>
                      <td
                        className={`p-2.5 text-right font-mono font-bold ${
                          d.diff > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {d.diff > 0 ? `+${d.diff.toLocaleString()}` : d.diff.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setRebuildDiffModal({ open: false, diffs: [], scannedCount: 0 })}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PreOrderOverviewView;
