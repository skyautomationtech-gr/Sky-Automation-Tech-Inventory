import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  MessageCircle,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  Brand,
  Category,
  CompanySettings,
  PreOrder,
  PreOrderPayment,
  PreOrderPaymentMethod,
  PreOrderPaymentStatus,
  PreOrderPaymentType,
  Product,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_PAYMENT_METHODS,
  formatBDT,
  formatPreOrderProductLabel,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderSuperAdmin,
  normalizeBdPhone,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import { getSuppliers } from '../../firebase/db';
import {
  BackfillPaymentTxnLocksResult,
  EnrichedPreOrderPayment,
  PreOrderPaymentsSummaryKPIs,
  actorFromUser,
  backfillPaymentTxnLocks,
  getPreOrderById,
  getPreOrderPaymentsSummary,
  markPreOrderPaymentAsDuplicate,
  queryPreOrderDueList,
  queryPreOrderPaymentsGroup,
  verifyPreOrderPayment,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  Tabs,
  useToast,
} from '../../design-system';
import { PreOrderStatusBadge, SubBrandBadge } from './PreOrderStatusBadge';
import PreOrderDetailDrawer from './PreOrderDetailDrawer';
import {
  CollectPaymentModal,
  RejectPaymentModal,
  ReversePaymentModal,
  SuperAdminSelfVerifyModal,
} from './PreOrderPaymentModals';
import PreOrderPaymentReceiptModal from './PreOrderPaymentReceiptModal';

export interface PaymentManagementViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  brands?: Brand[];
  products?: Product[];
  companySettings?: CompanySettings | null;
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
}

type PaymentPageTab = 'ledger' | 'pending' | 'due_list';

function formatDateTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildWhatsAppHref(rawPhone: string): string {
  const norm = normalizeBdPhone(rawPhone);
  const digits = norm.startsWith('01') ? `88${norm}` : norm;
  return `https://wa.me/${digits}`;
}

export const PaymentManagementView: React.FC<PaymentManagementViewProps> = ({
  user,
  rolePermissions,
  categories,
  brands,
  products,
  companySettings,
  onNavigate,
}) => {
  const toast = useToast();

  const canView = hasPermission(user, rolePermissions, 'preOrderView');
  const canCollect = hasPermission(user, rolePermissions, 'preOrderCollectPayment');
  const canVerify = hasPermission(user, rolePermissions, 'preOrderVerifyPayment');
  const isAdmin = isPreOrderAdminRole(user.role);
  const isSuperAdmin = isPreOrderSuperAdmin(user);

  const allowedSubBrands = useMemo<Array<'SAT' | 'GZ' | 'RTX'>>(() => {
    const isSuper = isPreOrderSuperAdmin(user);
    if (isSuper || !user.subBrandAccess || user.subBrandAccess.length === 0) {
      return ['SAT', 'GZ', 'RTX'];
    }
    const valid = user.subBrandAccess.filter(
      (b): b is 'SAT' | 'GZ' | 'RTX' => b === 'SAT' || b === 'GZ' || b === 'RTX'
    );
    return valid.length > 0 ? valid : ['SAT'];
  }, [user]);

  const [activeTab, setActiveTab] = useState<PaymentPageTab>('ledger');

  // KPIs
  const [kpis, setKpis] = useState<PreOrderPaymentsSummaryKPIs>({
    totalVerifiedAdvance: 0,
    totalPendingVerification: 0,
    totalCustomerDue: 0,
    totalRefunded: 0,
    pendingCountApprox: 0,
    dueOrdersCount: 0,
  });

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PreOrderPaymentStatus>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | PreOrderPaymentType>('ALL');
  const [methodFilter, setMethodFilter] = useState<'ALL' | PreOrderPaymentMethod>('ALL');
  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Cursor pagination (ledger / pending)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [cursorHistory, setCursorHistory] = useState<
    Array<QueryDocumentSnapshot<DocumentData> | null>
  >([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Table Data
  const [ledgerRows, setLedgerRows] = useState<EnrichedPreOrderPayment[]>([]);
  const [dueRows, setDueRows] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [indexNotice, setIndexNotice] = useState('');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const verifyInFlightRef = useRef(false);

  // Supporting state for drawer & modals
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'overview' | 'payments'>('payments');
  const [rejectTarget, setRejectTarget] = useState<PreOrderPayment | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PreOrderPayment | null>(null);
  const [selfVerifyTarget, setSelfVerifyTarget] = useState<{
    payment: PreOrderPayment;
    decision: 'verified' | 'rejected';
  } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<PreOrderPayment | null>(null);
  const [markingDuplicate, setMarkingDuplicate] = useState(false);
  const [backfillingLocks, setBackfillingLocks] = useState(false);
  const [backfillReport, setBackfillReport] = useState<BackfillPaymentTxnLocksResult | null>(null);
  const [collectOrder, setCollectOrder] = useState<PreOrder | null>(null);
  const [receiptData, setReceiptData] = useState<{
    order: PreOrder;
    payment: PreOrderPayment;
  } | null>(null);

  useEffect(() => {
    getSuppliers()
      .then((list) => setSuppliers(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setCursorHistory([null]);
    setPageIndex(0);
  }, [
    activeTab,
    debouncedSearch,
    statusFilter,
    typeFilter,
    methodFilter,
    subBrandFilter,
    dateFrom,
    dateTo,
    pageSize,
  ]);

  const currentCursor = cursorHistory[pageIndex] ?? null;

  const loadSummary = useCallback(async () => {
    if (!canView) return;
    try {
      const summary = await getPreOrderPaymentsSummary(allowedSubBrands, subBrandFilter);
      setKpis(summary);
    } catch (err) {
      console.warn('Payment KPI summary load failed:', err);
    }
  }, [canView, allowedSubBrands, subBrandFilter]);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    setIndexNotice('');

    try {
      if (activeTab === 'due_list') {
        const res = await queryPreOrderDueList({
          pageSize,
          cursor: currentCursor,
          subBrand: subBrandFilter,
          allowedSubBrands,
          searchTerm: debouncedSearch || undefined,
        });
        setDueRows(res.items);
        setNextCursor(res.lastDoc);
        setHasMore(res.hasMore);
        if (res.indexNotice) setIndexNotice(res.indexNotice);
      } else {
        const effectiveStatus = activeTab === 'pending' ? 'pending' : statusFilter;
        const res = await queryPreOrderPaymentsGroup({
          pageSize,
          cursor: currentCursor,
          status: effectiveStatus,
          type: typeFilter,
          method: methodFilter,
          subBrand: subBrandFilter,
          allowedSubBrands,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          searchTerm: debouncedSearch || undefined,
        });
        setLedgerRows(res.items);
        setNextCursor(res.lastDoc);
        setHasMore(res.hasMore);
        if (res.indexNotice) setIndexNotice(res.indexNotice);
      }
    } catch (err: any) {
      console.error('Failed to load payment management data:', err);
      setError(err?.message || 'Unable to load payment records.');
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    activeTab,
    pageSize,
    currentCursor,
    statusFilter,
    typeFilter,
    methodFilter,
    subBrandFilter,
    allowedSubBrands,
    dateFrom,
    dateTo,
    debouncedSearch,
  ]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadSummary(), loadData()]);
  }, [loadSummary, loadData]);

  const handleQuickVerify = async (p: PreOrderPayment) => {
    if (!canVerify || verifyingId || verifyInFlightRef.current) return;
    if (p.recordedBy === user.id) {
      if (isSuperAdmin) {
        setSelfVerifyTarget({ payment: p, decision: 'verified' });
      } else {
        toast.error('Staff and Admin cannot verify their own payment entry.');
      }
      return;
    }
    verifyInFlightRef.current = true;
    setVerifyingId(p.id);
    try {
      await verifyPreOrderPayment(p.preOrderId, p.id, 'verified', actorFromUser(user));
      toast.success(`Verified ${formatBDT(p.amount)} on ${p.preOrderNumber}.`);
      await refreshAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify payment.');
    } finally {
      verifyInFlightRef.current = false;
      setVerifyingId(null);
    }
  };

  const handleConfirmMarkDuplicate = async () => {
    if (!duplicateTarget || !isAdmin || markingDuplicate) return;
    setMarkingDuplicate(true);
    try {
      const res = await markPreOrderPaymentAsDuplicate(
        duplicateTarget.preOrderId,
        duplicateTarget.id,
        actorFromUser(user)
      );
      toast.success(
        `Marked ${duplicateTarget.preOrderNumber} (${formatBDT(duplicateTarget.amount)}) as duplicate and rejected.`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      setDuplicateTarget(null);
      await refreshAll();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark payment as duplicate.');
    } finally {
      setMarkingDuplicate(false);
    }
  };

  const handleRunBackfillLocks = async () => {
    if (!isAdmin || backfillingLocks) return;
    setBackfillingLocks(true);
    try {
      const res = await backfillPaymentTxnLocks(actorFromUser(user));
      setBackfillReport(res);
      if (res.conflicts.length > 0) {
        toast.warning(
          `Backfill finished: ${res.created} lock(s) created, ${res.conflicts.length} duplicate conflict(s) found.`
        );
      } else {
        toast.success(
          `Backfill complete: ${res.created} created, ${res.updated} updated, ${res.alreadyLocked} already locked.`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to backfill transaction ID locks.');
    } finally {
      setBackfillingLocks(false);
    }
  };

  const handleOpenReceipt = async (p: PreOrderPayment) => {
    try {
      const ord = await getPreOrderById(p.preOrderId);
      if (!ord) {
        toast.error('Parent pre-order could not be loaded.');
        return;
      }
      setReceiptData({ order: ord, payment: p });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to open receipt.');
    }
  };

  if (!canView) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Access Restricted
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your role does not currently have permission to view Pre-Order Payments (`preOrderView`).
        </p>
      </Card>
    );
  }

  const tabs = [
    { id: 'ledger' as PaymentPageTab, label: 'All Ledger Entries', icon: <CreditCard className="w-3.5 h-3.5" /> },
    ...(canVerify
      ? [
          {
            id: 'pending' as PaymentPageTab,
            label: 'Pending Verification',
            badge: kpis.pendingCountApprox > 0 ? kpis.pendingCountApprox : undefined,
            icon: <Clock className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    {
      id: 'due_list' as PaymentPageTab,
      label: 'Customer Due List',
      badge: kpis.dueOrdersCount > 0 ? kpis.dueOrdersCount : undefined,
      icon: <Wallet className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            Pre-Order Payment Management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Append-only customer deposit ledger, payment verification queue, reversals, refunds & customer due tracking
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={backfillingLocks}
              disabled={backfillingLocks}
              onClick={handleRunBackfillLocks}
              leftIcon={<Database className="w-3.5 h-3.5 text-[#D4AF37]" />}
            >
              Backfill Txn Locks
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={refreshAll}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh Ledger
          </Button>
        </div>
      </div>

      {/* Top 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Verified Advance"
          value={kpis.totalVerifiedAdvance}
          prefix="৳"
          variant="success"
          helperText="Customer liability deposits verified"
          icon={<CheckCircle2 className="w-5 h-5" />}
        />
        <StatCard
          label="Pending Verification"
          value={kpis.totalPendingVerification}
          prefix="৳"
          variant="gold"
          helperText={`${kpis.pendingCountApprox} pending ledger entr${kpis.pendingCountApprox === 1 ? 'y' : 'ies'} (excluded from due)`}
          icon={<Clock className="w-5 h-5" />}
          onClick={canVerify ? () => setActiveTab('pending') : undefined}
        />
        <StatCard
          label="Total Customer Due"
          value={kpis.totalCustomerDue}
          prefix="৳"
          variant="danger"
          helperText={`${kpis.dueOrdersCount} active pre-order${kpis.dueOrdersCount === 1 ? '' : 's'} with due`}
          icon={<Wallet className="w-5 h-5" />}
          onClick={() => setActiveTab('due_list')}
        />
        <StatCard
          label="Total Refunded"
          value={kpis.totalRefunded}
          prefix="৳"
          variant="info"
          helperText="Verified customer refunds issued"
          icon={<RotateCcw className="w-5 h-5" />}
        />
      </div>

      {/* View Mode Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={(t) => setActiveTab(t)}
          variant="segmented"
          size="sm"
        />
      </div>

      {/* Filters Toolbar */}
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
          <div className="lg:col-span-4">
            <SearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => setSearchInput('')}
              placeholder={
                activeTab === 'due_list'
                  ? 'Search PO-0001, customer name, phone, product...'
                  : 'Search Transaction ID, PO-0001, customer name, phone...'
              }
              sizeVariant="md"
              isSoftUI={false}
            />
          </div>

          <div className="lg:col-span-2">
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

          {activeTab !== 'due_list' && (
            <>
              {activeTab === 'ledger' && (
                <div className="lg:col-span-2">
                  <Select
                    options={[
                      { value: 'ALL', label: 'All Statuses' },
                      { value: 'pending', label: 'Pending' },
                      { value: 'verified', label: 'Verified' },
                      { value: 'rejected', label: 'Rejected' },
                    ]}
                    value={statusFilter}
                    onChange={(val) => setStatusFilter(val as 'ALL' | PreOrderPaymentStatus)}
                    searchable={false}
                  />
                </div>
              )}

              <div className="lg:col-span-2">
                <Select
                  options={[
                    { value: 'ALL', label: 'All Types' },
                    { value: 'advance', label: 'Advance' },
                    { value: 'installment', label: 'Installment' },
                    { value: 'additional', label: 'Additional' },
                    { value: 'refund', label: 'Refund' },
                    { value: 'reversal', label: 'Reversal' },
                  ]}
                  value={typeFilter}
                  onChange={(val) => setTypeFilter(val as 'ALL' | PreOrderPaymentType)}
                  searchable={false}
                />
              </div>

              <div className="lg:col-span-2">
                <Select
                  options={[
                    { value: 'ALL', label: 'All Methods' },
                    ...PRE_ORDER_PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
                  ]}
                  value={methodFilter}
                  onChange={(val) => setMethodFilter(val as 'ALL' | PreOrderPaymentMethod)}
                  searchable={false}
                />
              </div>
            </>
          )}
        </div>

        {activeTab !== 'due_list' && (
          <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
            <span className="font-medium">Payment Date:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              sizeVariant="sm"
              className="w-36"
            />
            <span>to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              sizeVariant="sm"
              className="w-36"
            />
          </div>
        )}
      </Card>

      {indexNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{indexNotice}</span>
        </div>
      )}

      {error && (
        <Card padding="md" className="border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/20">
          <div className="flex items-center justify-between gap-3 text-sm text-rose-800 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <Button size="xs" variant="secondary" onClick={refreshAll}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* TABLE: LEDGER & PENDING VERIFICATION */}
      {activeTab !== 'due_list' ? (
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[1180px]">
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 whitespace-nowrap">Pre-Order No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Amount</th>
                  <th className="px-4 py-3 whitespace-nowrap">Method</th>
                  <th className="px-4 py-3 whitespace-nowrap">Transaction ID</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Collected By</th>
                  <th className="px-4 py-3 whitespace-nowrap">Verified By</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={11} className="px-4 py-2.5">
                        <Skeleton variant="table-row" />
                      </td>
                    </tr>
                  ))
                ) : ledgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-slate-500">
                      {activeTab === 'pending'
                        ? 'No payments are currently awaiting verification.'
                        : 'No matching pre-order payment entries found.'}
                    </td>
                  </tr>
                ) : (
                  ledgerRows.map((p) => {
                    const isSelfRecorded = p.recordedBy === user.id;
                    const canVerifyOther = canVerify && p.status === 'pending' && !isSelfRecorded;
                    const canSelfVerifySuper =
                      canVerify && p.status === 'pending' && isSelfRecorded && isSuperAdmin;
                    const canMarkDuplicate =
                      isAdmin && p.status === 'pending' && (!isSelfRecorded || isSuperAdmin);
                    const canReverseThis =
                      isAdmin && p.status === 'verified' && p.type !== 'reversal' && !p.isReversed;

                    return (
                      <tr
                        key={`${p.preOrderId}_${p.id}`}
                        className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400">
                          {formatDateTime(p.receivedAt || p.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerInitialTab('payments');
                                setDrawerOrderId(p.preOrderId);
                              }}
                              className="font-mono font-bold text-[#93741E] dark:text-[#E2C255] hover:underline cursor-pointer"
                            >
                              {p.preOrderNumber}
                            </button>
                            {p.subBrand && <SubBrandBadge subBrand={p.subBrand} />}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px]">
                            {p.customerName || '—'}
                          </div>
                          {p.customerPhone && (
                            <div className="text-[11px] font-mono text-slate-500">
                              {p.customerPhone}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap capitalize font-medium text-slate-700 dark:text-slate-200">
                          {p.type}
                        </td>
                        <td
                          className={`px-4 py-3 whitespace-nowrap text-right font-mono font-bold tabular-nums ${
                            p.type === 'refund' || p.type === 'reversal'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {p.type === 'refund' || p.type === 'reversal' ? '-' : ''}
                          {formatBDT(p.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{p.method}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                          {p.referenceNo || '—'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge
                              variant={
                                p.status === 'verified'
                                  ? 'success'
                                  : p.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                              }
                              size="xs"
                            >
                              {p.status}
                            </Badge>
                            {p.selfVerified && (
                              <Badge variant="gold" size="xs" title={p.verifyNote || 'Self-verified by Super Admin'}>
                                Self-verified
                              </Badge>
                            )}
                            {p.isReversed && (
                              <Badge variant="neutral" size="xs">
                                Reversed
                              </Badge>
                            )}
                          </div>
                          {p.status === 'rejected' && p.rejectionReason && (
                            <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5 truncate max-w-[160px]" title={p.rejectionReason}>
                              {p.rejectionReason}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          {p.recordedByName || p.recordedBy}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                          <div>{p.verifiedByName || '—'}</div>
                          {p.verifyNote && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[140px]" title={p.verifyNote}>
                              {p.verifyNote}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {p.status === 'pending' && canVerify && isSelfRecorded && !isSuperAdmin && (
                              <span
                                title="Staff and Admin cannot verify their own entry — another verifier must review it"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                Own entry
                              </span>
                            )}
                            {canSelfVerifySuper && (
                              <>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() =>
                                    setSelfVerifyTarget({ payment: p, decision: 'verified' })
                                  }
                                  leftIcon={<ShieldCheck className="w-3 h-3" />}
                                >
                                  Verify (Self)
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() =>
                                    setSelfVerifyTarget({ payment: p, decision: 'rejected' })
                                  }
                                  leftIcon={<XCircle className="w-3 h-3" />}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {canVerifyOther && (
                              <>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="xs"
                                  isLoading={verifyingId === p.id}
                                  disabled={Boolean(verifyingId)}
                                  onClick={() => handleQuickVerify(p)}
                                  leftIcon={<CheckCircle2 className="w-3 h-3" />}
                                >
                                  Verify
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() => setRejectTarget(p)}
                                  leftIcon={<XCircle className="w-3 h-3" />}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {canMarkDuplicate && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={Boolean(verifyingId) || markingDuplicate}
                                onClick={() => setDuplicateTarget(p)}
                                title="Reject pending entry as Duplicate entry and release its Transaction ID lock"
                                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                              >
                                Mark duplicate
                              </Button>
                            )}
                            {canReverseThis && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => setReverseTarget(p)}
                                leftIcon={<RotateCcw className="w-3 h-3" />}
                              >
                                Reverse
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => handleOpenReceipt(p)}
                              leftIcon={<Receipt className="w-3 h-3" />}
                            >
                              Receipt
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Cursor Pagination */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-500">
              <span>Rows:</span>
              <div className="w-20">
                <Select
                  options={[
                    { value: 25, label: '25' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100' },
                  ]}
                  value={pageSize}
                  onChange={(val) => setPageSize(Number(val) as 25 | 50 | 100)}
                  searchable={false}
                  size="sm"
                />
              </div>
              <span className="font-mono ml-1">Page {pageIndex + 1}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={pageIndex === 0 || loading}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                disabled={!hasMore || loading}
                onClick={() => {
                  if (!hasMore || !nextCursor) return;
                  setCursorHistory((prev) => [...prev.slice(0, pageIndex + 1), nextCursor]);
                  setPageIndex((i) => i + 1);
                }}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        /* TAB 3: CUSTOMER DUE LIST (SORTED OLDEST FIRST) */
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto max-h-[65vh] scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[1080px]">
              <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Pre-Order No</th>
                  <th className="px-4 py-3 whitespace-nowrap">Order Date (Oldest First)</th>
                  <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                  <th className="px-4 py-3 whitespace-nowrap">Product</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Total</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Verified Paid</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Remaining Due</th>
                  <th className="px-4 py-3 whitespace-nowrap text-right">Follow-Up & Collect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {loading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={9} className="px-4 py-2.5">
                        <Skeleton variant="table-row" />
                      </td>
                    </tr>
                  ))
                ) : dueRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      No open pre-orders currently have a remaining due balance.
                    </td>
                  </tr>
                ) : (
                  dueRows.map((ord) => (
                    <tr
                      key={ord.id}
                      onClick={() => {
                        setDrawerInitialTab('payments');
                        setDrawerOrderId(ord.id);
                      }}
                      className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[#93741E] dark:text-[#E2C255]">
                            {ord.preOrderNumber}
                          </span>
                          <SubBrandBadge subBrand={ord.subBrand} />
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                        {ord.orderDate || new Date(ord.createdAt).toLocaleDateString('en-GB')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {ord.customerName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">{ord.customerPhone}</div>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const orderItems = normalizePreOrderItems(ord);
                          const totalQty =
                            ord.totalQty ?? orderItems.reduce((s, it) => s + it.qty, 0);
                          return (
                            <>
                              <div className="truncate max-w-[220px] font-medium text-slate-800 dark:text-slate-200">
                                {formatPreOrderProductLabel(ord)}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {orderItems.length > 1
                                  ? `${orderItems.length} items · Qty: ${totalQty}`
                                  : `Qty: ${totalQty}`}
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PreOrderStatusBadge status={ord.status} size="xs" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono tabular-nums">
                        {formatBDT(ord.totalAmount)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatBDT(ord.advancePaid)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                        {formatBDT(ord.dueAmount)}
                      </td>
                      <td
                        className="px-4 py-3 whitespace-nowrap text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <a
                            href={`tel:${normalizeBdPhone(ord.customerPhone)}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title={`Call ${ord.customerPhone}`}
                          >
                            <Phone className="w-3 h-3 text-blue-500" />
                            Call
                          </a>
                          <a
                            href={buildWhatsAppHref(ord.customerWhatsapp || ord.customerPhone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3" />
                            WhatsApp
                          </a>
                          {ord.convertedSaleId || ord.convertedOrderId ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => onNavigate?.('receivables')}
                            >
                              Via Due Payments ({ord.convertedInvoiceNumber || 'Invoice'})
                            </Button>
                          ) : (
                            canCollect && (
                              <Button
                                type="button"
                                variant="primary"
                                size="xs"
                                onClick={() => setCollectOrder(ord)}
                                leftIcon={<Banknote className="w-3 h-3" />}
                              >
                                Collect
                              </Button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail Drawer */}
      <PreOrderDetailDrawer
        preOrderId={drawerOrderId}
        isOpen={Boolean(drawerOrderId)}
        initialTab={drawerInitialTab}
        onClose={() => setDrawerOrderId(null)}
        user={user}
        rolePermissions={rolePermissions}
        categories={categories}
        brands={brands}
        products={products}
        suppliers={suppliers}
        companySettings={companySettings}
        onNavigate={onNavigate}
        onUpdated={refreshAll}
      />

      {/* Collect Payment from Due List */}
      <CollectPaymentModal
        isOpen={Boolean(collectOrder)}
        onClose={() => setCollectOrder(null)}
        order={collectOrder}
        user={user}
        onSuccess={(payment, updatedOrder) => {
          setReceiptData({ order: updatedOrder, payment });
          refreshAll();
        }}
      />

      {/* Reject & Reverse Modals */}
      <RejectPaymentModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        payment={rejectTarget}
        user={user}
        onSuccess={refreshAll}
      />

      <ReversePaymentModal
        isOpen={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        payment={reverseTarget}
        user={user}
        onSuccess={refreshAll}
      />

      <SuperAdminSelfVerifyModal
        isOpen={Boolean(selfVerifyTarget)}
        onClose={() => setSelfVerifyTarget(null)}
        payment={selfVerifyTarget?.payment || null}
        initialDecision={selfVerifyTarget?.decision || 'verified'}
        user={user}
        onSuccess={refreshAll}
      />

      <ConfirmDialog
        isOpen={Boolean(duplicateTarget)}
        onClose={() => !markingDuplicate && setDuplicateTarget(null)}
        onConfirm={handleConfirmMarkDuplicate}
        title="Mark pending payment as duplicate?"
        message={
          duplicateTarget
            ? `Reject ${duplicateTarget.preOrderNumber} (${formatBDT(duplicateTarget.amount)} via ${duplicateTarget.method}${
                duplicateTarget.referenceNo ? `, TrxID ${duplicateTarget.referenceNo}` : ''
              }) with reason "Duplicate entry"? It will stay visible in history, be excluded from totals, and release any lock held by this entry.`
            : ''
        }
        confirmLabel="Mark as Duplicate"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={markingDuplicate}
      />

      <Modal
        isOpen={Boolean(backfillReport)}
        onClose={() => setBackfillReport(null)}
        title="Transaction ID Lock Backfill Summary"
        subtitle="Global payments_txn_locks synchronization report"
        size="md"
      >
        {backfillReport && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-400">Scanned</div>
                <div className="font-mono font-bold text-sm mt-0.5">{backfillReport.scanned}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <div className="text-emerald-700 dark:text-emerald-300">Locks Created</div>
                <div className="font-mono font-bold text-sm mt-0.5">{backfillReport.created}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <div className="text-blue-700 dark:text-blue-300">Already Locked</div>
                <div className="font-mono font-bold text-sm mt-0.5">{backfillReport.alreadyLocked}</div>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="text-amber-700 dark:text-amber-300">Conflicts</div>
                <div className="font-mono font-bold text-sm mt-0.5">{backfillReport.conflicts.length}</div>
              </div>
            </div>

            {backfillReport.conflicts.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4" />
                  Duplicate Transaction IDs Detected ({backfillReport.conflicts.length})
                </div>
                <p className="text-slate-500">
                  Use <strong>Mark duplicate</strong> on duplicate pending entries, then re-verify the valid entry or re-run Backfill.
                </p>
                <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  {backfillReport.conflicts.map((c, idx) => (
                    <div
                      key={`${c.lockId}_${idx}`}
                      className="p-2.5 rounded-lg bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/70"
                    >
                      <div className="font-mono font-bold text-rose-800 dark:text-rose-200">
                        {c.method} · {c.referenceNo} ({c.lockId})
                      </div>
                      <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                        Locked by: <strong>{c.primaryPreOrderNumber}</strong> ({c.primaryPaymentId}, {c.primaryStatus})
                      </div>
                      <div className="text-rose-700 dark:text-rose-300">
                        Duplicate: <strong>{c.conflictPreOrderNumber}</strong> ({c.conflictPaymentId}, {formatBDT(c.conflictAmount)}, {c.conflictStatus})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>All eligible non-cash payment Transaction IDs are uniquely locked with zero duplicate conflicts.</span>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button type="button" variant="primary" size="sm" onClick={() => setBackfillReport(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* B&W Receipt + PDF Modal */}
      <PreOrderPaymentReceiptModal
        isOpen={Boolean(receiptData)}
        onClose={() => setReceiptData(null)}
        order={receiptData?.order || null}
        payment={receiptData?.payment || null}
        companySettings={companySettings}
      />
    </div>
  );
};

export default PaymentManagementView;
