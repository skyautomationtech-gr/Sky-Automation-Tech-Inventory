import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Filter,
  MessageCircle,
  Phone,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import {
  PreOrderStatus,
  RolePermissionsMap,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_STATUSES,
  hasPermission,
  isPreOrderAdminRole,
  normalizeBdPhone,
} from '../../preOrders/constants';
import {
  BuiltReportResult,
  ReportDatePreset,
  ReportFilterState,
  buildCustomerDueAgingReport,
  buildCustomerWiseReport,
  buildDelayReport,
  buildDeliveredAndCancelledReport,
  buildExpectedVsActualProfitReport,
  buildPaymentCollectionReport,
  buildPeriodSummaryReport,
  buildProductWiseReport,
  buildShippingCostReport,
  buildStatusOrdersReport,
  buildSupplierPaymentsReport,
  buildUnifiedHistoryFeed,
  filterPreOrdersForReport,
  resolveReportDateRange,
} from '../../preOrders/reports';
import {
  exportReportToExcel,
  exportReportToPdf,
  filterPermittedReportColumns,
} from '../../preOrders/exports';
import {
  PreOrderReportsDataset,
  loadPreOrderReportsDataset,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  ProgressBar,
  Select,
  Skeleton,
  useToast,
} from '../../design-system';

export interface PreOrderReportsViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
}

type ReportId =
  | 'period_summary'
  | 'status_orders'
  | 'payment_collection'
  | 'customer_due'
  | 'supplier_payments'
  | 'shipping_cost'
  | 'delivered_cancelled'
  | 'product_wise'
  | 'customer_wise'
  | 'expected_vs_actual_profit'
  | 'delay_report'
  | 'history_audit';

interface ReportTabMeta {
  id: ReportId;
  label: string;
  requiresSupplier?: boolean;
  requiresProfit?: boolean;
  adminOnly?: boolean;
}

const REPORT_TABS: ReportTabMeta[] = [
  { id: 'period_summary', label: '1. Period Summary' },
  { id: 'status_orders', label: '2. Status-Wise Orders' },
  { id: 'payment_collection', label: '3. Payment Collection' },
  { id: 'customer_due', label: '4. Customer Due & Aging' },
  { id: 'supplier_payments', label: '5. Supplier Balances', requiresSupplier: true },
  { id: 'shipping_cost', label: '6. Shipping Cost', requiresSupplier: true },
  { id: 'delivered_cancelled', label: '7. Delivered & Cancelled' },
  { id: 'product_wise', label: '8. Product Demand' },
  { id: 'customer_wise', label: '9. Customer History' },
  { id: 'expected_vs_actual_profit', label: '10. Profit Analysis', requiresProfit: true },
  { id: 'delay_report', label: '11. Delays & Overdue' },
  { id: 'history_audit', label: '12. Audit & History Feed', adminOnly: true },
];

const ROWS_PER_PAGE = 50;

export const PreOrderReportsView: React.FC<PreOrderReportsViewProps> = ({
  user,
  rolePermissions,
  onNavigate,
}) => {
  const toast = useToast();
  const canViewReports = hasPermission(user, rolePermissions, 'preOrderReports');
  const isAdmin = isPreOrderAdminRole(user.role);
  const canViewProfit = hasPermission(user, rolePermissions, 'preOrderViewProfit');
  const canViewSupplier =
    hasPermission(user, rolePermissions, 'preOrderSupplier') || isAdmin;

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

  const permittedTabs = useMemo(
    () =>
      REPORT_TABS.filter((tab) => {
        if (tab.adminOnly && !isAdmin) return false;
        if (tab.requiresSupplier && !canViewSupplier) return false;
        if (tab.requiresProfit && !canViewProfit) return false;
        return true;
      }),
    [isAdmin, canViewSupplier, canViewProfit]
  );

  const [activeReport, setActiveReport] = useState<ReportId>('period_summary');
  const [dataset, setDataset] = useState<PreOrderReportsDataset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Shared filters
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('month');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [subBrand, setSubBrand] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');
  const [statuses, setStatuses] = useState<PreOrderStatus[]>([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const [supplierId, setSupplierId] = useState('ALL');
  const [customerQuery, setCustomerQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [page, setPage] = useState(1);

  // Export states
  const [exportingType, setExportingType] = useState<'excel' | 'pdf' | null>(null);
  const [exportProgress, setExportProgress] = useState(0);
  const [pendingLargeExport, setPendingLargeExport] = useState<'excel' | 'pdf' | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!permittedTabs.some((t) => t.id === activeReport)) {
      setActiveReport(permittedTabs[0]?.id || 'period_summary');
    }
  }, [permittedTabs, activeReport]);

  const fetchDataset = useCallback(async () => {
    if (!canViewReports) return;
    setLoading(true);
    setError('');
    try {
      const data = await loadPreOrderReportsDataset({
        canViewProfit,
        canViewSupplier,
        allowedSubBrands,
      });
      setDataset(data);
    } catch (err: any) {
      console.error('Failed to load pre-order reports dataset:', err);
      setError(err?.message || 'Unable to load reports dataset.');
    } finally {
      setLoading(false);
    }
  }, [canViewReports, canViewProfit, canViewSupplier, allowedSubBrands]);

  useEffect(() => {
    fetchDataset();
  }, [fetchDataset]);

  const filterState: ReportFilterState = useMemo(() => {
    const resolved = resolveReportDateRange(datePreset, customDateFrom, customDateTo);
    return {
      datePreset,
      dateFrom: resolved.dateFrom,
      dateTo: resolved.dateTo,
      subBrand,
      statuses,
      supplierId: canViewSupplier ? supplierId : 'ALL',
      customerQuery,
      productQuery,
      allowedSubBrands,
    };
  }, [
    datePreset,
    customDateFrom,
    customDateTo,
    subBrand,
    statuses,
    canViewSupplier,
    supplierId,
    customerQuery,
    productQuery,
    allowedSubBrands,
  ]);

  const filteredOrders = useMemo(
    () => (dataset ? filterPreOrdersForReport(dataset.preOrders, filterState) : []),
    [dataset, filterState]
  );

  const filteredOrderIds = useMemo(
    () => new Set(filteredOrders.map((o) => o.id)),
    [filteredOrders]
  );

  const builtReport: BuiltReportResult = useMemo(() => {
    if (!dataset) return { columns: [], rows: [], kpis: [] };
    switch (activeReport) {
      case 'period_summary':
        return buildPeriodSummaryReport(filteredOrders, dataset.privateCostsByOrder);
      case 'status_orders':
        return buildStatusOrdersReport(filteredOrders);
      case 'payment_collection':
        return buildPaymentCollectionReport(dataset.payments, filteredOrderIds, filterState);
      case 'customer_due':
        return buildCustomerDueAgingReport(filteredOrders);
      case 'supplier_payments':
        return buildSupplierPaymentsReport(
          filteredOrders,
          dataset.suppliers,
          dataset.supplierPayments,
          dataset.privateCostsByOrder
        );
      case 'shipping_cost':
        return buildShippingCostReport(filteredOrders, dataset.privateCostsByOrder);
      case 'delivered_cancelled':
        return buildDeliveredAndCancelledReport(filteredOrders);
      case 'product_wise':
        return buildProductWiseReport(filteredOrders);
      case 'customer_wise':
        return buildCustomerWiseReport(filteredOrders);
      case 'expected_vs_actual_profit':
        return buildExpectedVsActualProfitReport(
          filteredOrders,
          dataset.privateCostsByOrder,
          dataset.postings
        );
      case 'delay_report':
        return buildDelayReport(filteredOrders);
      case 'history_audit':
        return buildUnifiedHistoryFeed(dataset.auditLogs, filterState, filteredOrderIds);
      default:
        return { columns: [], rows: [], kpis: [] };
    }
  }, [dataset, activeReport, filteredOrders, filteredOrderIds, filterState]);

  const permittedColumns = useMemo(
    () =>
      filterPermittedReportColumns(builtReport.columns, {
        canViewProfit,
        canViewSupplier,
      }),
    [builtReport.columns, canViewProfit, canViewSupplier]
  );

  const visibleKpis = useMemo(
    () =>
      builtReport.kpis.filter((k) => {
        if (k.requiresProfit && !canViewProfit) return false;
        if (k.requiresSupplier && !canViewSupplier) return false;
        return true;
      }),
    [builtReport.kpis, canViewProfit, canViewSupplier]
  );

  useEffect(() => {
    setPage(1);
  }, [activeReport, filterState]);

  const totalPages = Math.max(1, Math.ceil(builtReport.rows.length / ROWS_PER_PAGE));
  const pagedRows = useMemo(
    () => builtReport.rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE),
    [builtReport.rows, page]
  );

  const activeTabMeta =
    permittedTabs.find((t) => t.id === activeReport) || REPORT_TABS[0];

  const filterSummaryText = useMemo(() => {
    const parts: string[] = [];
    if (filterState.dateFrom || filterState.dateTo) {
      parts.push(`Date: ${filterState.dateFrom || '...'} to ${filterState.dateTo || '...'}`);
    } else {
      parts.push('Date: All Time');
    }
    if (subBrand !== 'ALL') parts.push(`Sub-Brand: ${subBrand}`);
    if (statuses.length > 0) parts.push(`Statuses: ${statuses.join(', ')}`);
    if (canViewSupplier && supplierId !== 'ALL') parts.push(`Supplier ID: ${supplierId}`);
    if (customerQuery.trim()) parts.push(`Customer: "${customerQuery.trim()}"`);
    if (productQuery.trim()) parts.push(`Product: "${productQuery.trim()}"`);
    return parts.join(' | ');
  }, [filterState, subBrand, statuses, canViewSupplier, supplierId, customerQuery, productQuery]);

  const runExport = async (kind: 'excel' | 'pdf') => {
    setPendingLargeExport(null);
    setExportingType(kind);
    setExportProgress(5);
    const slug = `preorder_${activeReport}_${new Date().toISOString().slice(0, 10)}`;
    const title = `Pre-Order Report: ${activeTabMeta.label.replace(/^\d+\.\s*/, '')}`;
    const subBrandLabel =
      subBrand !== 'ALL' ? subBrand : allowedSubBrands.join(' / ');

    try {
      if (kind === 'excel') {
        await exportReportToExcel({
          title,
          filename: slug,
          subBrandLabel,
          filterSummary: filterSummaryText,
          columns: builtReport.columns,
          rows: builtReport.rows,
          permissions: { canViewProfit, canViewSupplier },
          onProgress: (p) => setExportProgress(p),
        });
        toast.success('Excel Exported', `${builtReport.rows.length} rows saved as .xlsx`);
      } else {
        await exportReportToPdf({
          title,
          filename: slug,
          subBrandLabel,
          filterSummary: filterSummaryText,
          columns: builtReport.columns,
          rows: builtReport.rows,
          permissions: { canViewProfit, canViewSupplier },
          onProgress: (p) => setExportProgress(p),
        });
        toast.success('PDF Exported', `${builtReport.rows.length} rows saved as paginated A4 PDF`);
      }
    } catch (err: any) {
      toast.error('Export Failed', err?.message || 'Unable to generate report file.');
    } finally {
      setExportingType(null);
      setExportProgress(0);
    }
  };

  const requestExport = (kind: 'excel' | 'pdf') => {
    if (builtReport.rows.length === 0) {
      toast.info('No Data', 'Apply broader filters to export rows.');
      return;
    }
    if (builtReport.rows.length > 2000) {
      setPendingLargeExport(kind);
      return;
    }
    runExport(kind);
  };

  const resetFilters = () => {
    setDatePreset('month');
    setCustomDateFrom('');
    setCustomDateTo('');
    setSubBrand('ALL');
    setStatuses([]);
    setSupplierId('ALL');
    setCustomerQuery('');
    setProductQuery('');
  };

  if (!canViewReports) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Access Restricted</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your role does not currently have permission to view Pre-Order Reports (`preOrderReports`).
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#D4AF37]" />
            <span>Pre-Order Reports &amp; Audit History</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Role-scoped analytics across orders, payments, aging dues, supplier payables, shipping variance, profit &amp; audit logs
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={fetchDataset}
          >
            Reload Data
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={exportingType === 'excel'}
            disabled={loading || builtReport.rows.length === 0 || exportingType !== null}
            leftIcon={<Download className="w-3.5 h-3.5 text-emerald-600" />}
            onClick={() => requestExport('excel')}
          >
            Export Excel (.xlsx)
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={exportingType === 'pdf'}
            disabled={loading || builtReport.rows.length === 0 || exportingType !== null}
            leftIcon={<FileText className="w-3.5 h-3.5" />}
            onClick={() => requestExport('pdf')}
          >
            Export PDF
          </Button>
        </div>
      </div>

      {/* Export Progress Bar */}
      {exportingType && (
        <Card padding="sm" className="border-[#D4AF37]/40">
          <ProgressBar
            value={exportProgress}
            label={`Preparing ${exportingType.toUpperCase()} export (${builtReport.rows.length} rows)...`}
            showPercentage
            variant="gold"
          />
        </Card>
      )}

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {permittedTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveReport(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeReport === tab.id
                ? 'bg-[#D4AF37] text-slate-950 shadow-2xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Shared Filters Card */}
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Date Period
            </label>
            <Select
              value={datePreset}
              searchable={false}
              options={[
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'Last 7 Days' },
                { value: 'month', label: 'This Month' },
                { value: 'custom', label: 'Custom Range' },
                { value: 'all', label: 'All Time' },
              ]}
              onChange={(val) => setDatePreset(val as ReportDatePreset)}
            />
          </div>

          {datePreset === 'custom' && (
            <>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  From Date
                </label>
                <Input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                  To Date
                </label>
                <Input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Sub-Brand
            </label>
            <Select
              value={subBrand}
              searchable={false}
              options={[
                { value: 'ALL', label: 'All Sub-Brands' },
                ...allowedSubBrands.map((b) => ({ value: b, label: b })),
              ]}
              onChange={(val) => setSubBrand(val as 'ALL' | 'SAT' | 'GZ' | 'RTX')}
            />
          </div>

          {/* Multi-Select Statuses */}
          <div className="lg:col-span-2 relative" ref={statusMenuRef}>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Statuses
            </label>
            <button
              type="button"
              onClick={() => setStatusMenuOpen((o) => !o)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer hover:border-slate-300 dark:hover:border-slate-600"
            >
              <span className="truncate flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {statuses.length === 0 ? 'All Statuses' : `${statuses.length} Selected`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
            {statusMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-64 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase text-slate-400">
                    Filter Statuses
                  </span>
                  {statuses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setStatuses([])}
                      className="text-[11px] font-semibold text-[#B89628] hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {PRE_ORDER_STATUSES.map((st) => {
                  const checked = statuses.includes(st);
                  return (
                    <label
                      key={st}
                      className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setStatuses((prev) =>
                            prev.includes(st) ? prev.filter((s) => s !== st) : [...prev, st]
                          )
                        }
                      />
                      <span>{st}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {canViewSupplier && (
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                Supplier
              </label>
              <Select
                value={supplierId}
                searchable
                options={[
                  { value: 'ALL', label: 'All Suppliers' },
                  ...(dataset?.suppliers || []).map((s) => ({
                    value: s.id,
                    label: s.name,
                  })),
                ]}
                onChange={(val) => setSupplierId(String(val))}
              />
            </div>
          )}

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Customer / Order Search
            </label>
            <Input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Name, phone, PO#..."
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Product / SKU
            </label>
            <Input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Product or SKU..."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span>
            Active Scope: <strong className="text-slate-700 dark:text-slate-200">{filterSummaryText}</strong>
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 font-semibold text-[#B89628] hover:underline cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Filters</span>
          </button>
        </div>
      </Card>

      {/* KPI Summary Cards */}
      {!loading && visibleKpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {visibleKpis.map((kpi) => (
            <Card key={kpi.label} padding="sm" className="space-y-1">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                {kpi.label}
              </p>
              <p className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {kpi.value}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Report Data Table */}
      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">{error}</p>
            <Button variant="secondary" size="sm" onClick={fetchDataset}>
              Retry
            </Button>
          </div>
        ) : builtReport.rows.length === 0 ? (
          <div className="py-14 text-center space-y-1.5">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No records match the selected filters
            </p>
            <p className="text-xs text-slate-400">
              Try changing Date Period to All Time or resetting active filters.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {permittedColumns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-3.5 py-2.5 whitespace-nowrap ${
                          col.numeric ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col.header}
                      </th>
                    ))}
                    {(activeReport === 'customer_due' || onNavigate) && (
                      <th className="px-3.5 py-2.5 text-right whitespace-nowrap">Quick Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pagedRows.map((row, idx) => {
                    const phoneNorm = row.customerPhone
                      ? normalizeBdPhone(String(row.customerPhone))
                      : '';
                    const waNum = phoneNorm.startsWith('01') ? `88${phoneNorm}` : phoneNorm;

                    return (
                      <tr
                        key={`${page}-${idx}`}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {permittedColumns.map((col) => {
                          const raw = row[col.key];
                          let formatted = '—';
                          if (raw !== null && raw !== undefined && raw !== '') {
                            if (col.numeric) {
                              const n = Number(raw);
                              formatted = Number.isFinite(n)
                                ? n.toLocaleString('en-US', {
                                    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
                                    maximumFractionDigits: 2,
                                  })
                                : '0';
                            } else {
                              formatted = String(raw);
                            }
                          }
                          return (
                            <td
                              key={col.key}
                              className={`px-3.5 py-2.5 whitespace-nowrap ${
                                col.numeric
                                  ? 'text-right font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {col.key === 'subBrand' && raw && raw !== '—' ? (
                                <Badge variant="subBrand" size="xs">
                                  {String(raw)}
                                </Badge>
                              ) : (
                                <span className="max-w-[260px] truncate inline-block align-bottom" title={formatted}>
                                  {formatted}
                                </span>
                              )}
                            </td>
                          );
                        })}

                        {(activeReport === 'customer_due' || onNavigate) && (
                          <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {activeReport === 'customer_due' && phoneNorm && (
                                <>
                                  <a
                                    href={`tel:${phoneNorm}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
                                    title={`Call ${phoneNorm}`}
                                  >
                                    <Phone className="w-3 h-3" />
                                    Call
                                  </a>
                                  <a
                                    href={`https://wa.me/${waNum}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800"
                                    title={`WhatsApp ${phoneNorm}`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                    WhatsApp
                                  </a>
                                </>
                              )}
                              {onNavigate &&
                                row.preOrderNumber &&
                                String(row.preOrderNumber).startsWith('PO-') && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const match = dataset?.preOrders.find(
                                        (o) => o.preOrderNumber === row.preOrderNumber
                                      );
                                      onNavigate('preorder_list', undefined, match?.id || null);
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-[#B89628] hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Open
                                  </button>
                                )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-slate-900/60 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Showing {(page - 1) * ROWS_PER_PAGE + 1}–
                {Math.min(page * ROWS_PER_PAGE, builtReport.rows.length)} of{' '}
                <strong>{builtReport.rows.length}</strong> rows
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={page <= 1}
                  leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="font-mono px-2">
                  Page {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  disabled={page >= totalPages}
                  rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* > 2,000 Row Large Export Confirmation */}
      <ConfirmDialog
        isOpen={pendingLargeExport !== null}
        onClose={() => setPendingLargeExport(null)}
        onConfirm={() => pendingLargeExport && runExport(pendingLargeExport)}
        variant="warning"
        title="Large Report Export Confirmation"
        message={`This report currently contains ${builtReport.rows.length.toLocaleString()} rows. Exporting more than 2,000 rows may take a few seconds in your browser. Continue?`}
        confirmLabel={`Export ${pendingLargeExport === 'pdf' ? 'PDF' : 'Excel'}`}
      />
    </div>
  );
};

export default PreOrderReportsView;
