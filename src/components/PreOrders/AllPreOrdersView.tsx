import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  Filter,
  MoreVertical,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  Brand,
  Category,
  CompanySettings,
  PreOrder,
  PreOrderPaymentState,
  PreOrderStatus,
  Product,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_STATUSES,
  formatBDT,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderOverdue,
} from '../../preOrders/constants';
import { getSuppliers } from '../../firebase/db';
import { PreOrderSortField, queryPreOrdersPage } from '../../firebase/preOrderDb';
import {
  Button,
  Card,
  Input,
  SearchInput,
  Select,
  Skeleton,
} from '../../design-system';
import {
  OverdueTag,
  PreOrderStatusBadge,
  SubBrandBadge,
} from './PreOrderStatusBadge';
import PreOrderDetailDrawer from './PreOrderDetailDrawer';
import PreOrderStatusDialog from './PreOrderStatusDialog';
import PreOrderIntegrityModal from './PreOrderIntegrityModal';

export interface AllPreOrdersViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  brands?: Brand[];
  products?: Product[];
  companySettings?: CompanySettings | null;
  onCreateNew: () => void;
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
  initialSelectedPreOrderId?: string | null;
  onClearInitialSelected?: () => void;
}

export const AllPreOrdersView: React.FC<AllPreOrdersViewProps> = ({
  user,
  rolePermissions,
  categories,
  brands,
  products,
  companySettings,
  onCreateNew,
  onNavigate,
  initialSelectedPreOrderId,
  onClearInitialSelected,
}) => {
  const isAdmin = isPreOrderAdminRole(user.role);
  const canView = hasPermission(user, rolePermissions, 'preOrderView');
  const canCreate = hasPermission(user, rolePermissions, 'preOrderCreate');

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

  // Filter & Search States
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<PreOrderStatus[]>([]);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');
  const [supplierFilter, setSupplierFilter] = useState<string>('ALL');
  const [paymentStateFilter, setPaymentStateFilter] = useState<'ALL' | PreOrderPaymentState>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Sorting & Cursor Pagination
  const [sortField, setSortField] = useState<PreOrderSortField>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [cursorHistory, setCursorHistory] = useState<
    Array<QueryDocumentSnapshot<DocumentData> | null>
  >([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [nextCursor, setNextCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);

  // Data States
  const [items, setItems] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [indexNotice, setIndexNotice] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [activeDrawerId, setActiveDrawerId] = useState<string | null>(
    initialSelectedPreOrderId || null
  );
  const [drawerEditMode, setDrawerEditMode] = useState(false);
  const [openMenuRowId, setOpenMenuRowId] = useState<string | null>(null);
  const [statusTargetOrder, setStatusTargetOrder] = useState<PreOrder | null>(null);
  const [showIntegrityModal, setShowIntegrityModal] = useState(false);

  const canEdit = hasPermission(user, rolePermissions, 'preOrderEdit');
  const canUpdateStatus = hasPermission(user, rolePermissions, 'preOrderUpdateStatus');

  // Sync external initial selection (e.g. immediately after creating a Pre-Order)
  useEffect(() => {
    if (initialSelectedPreOrderId) {
      setActiveDrawerId(initialSelectedPreOrderId);
    }
  }, [initialSelectedPreOrderId]);

  // Close multi-select status dropdown & row actions menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
      setOpenMenuRowId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load suppliers for dropdown filter & detail drawer
  useEffect(() => {
    getSuppliers()
      .then((list) => setSuppliers(list))
      .catch(() => {});
  }, []);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset cursor stack whenever filters/sort/pageSize change
  useEffect(() => {
    setCursorHistory([null]);
    setPageIndex(0);
  }, [
    debouncedSearch,
    selectedStatuses,
    subBrandFilter,
    supplierFilter,
    paymentStateFilter,
    dateFrom,
    dateTo,
    overdueOnly,
    sortField,
    sortDir,
    pageSize,
  ]);

  const currentCursor = cursorHistory[pageIndex] ?? null;

  const fetchPage = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    setIndexNotice('');
    try {
      const res = await queryPreOrdersPage({
        pageSize,
        cursor: currentCursor,
        statuses: selectedStatuses,
        subBrand: subBrandFilter,
        allowedSubBrands,
        supplierId: supplierFilter,
        paymentState: paymentStateFilter,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        overdueOnly,
        searchTerm: debouncedSearch || undefined,
        sortField,
        sortDir,
      });
      setItems(res.items);
      setNextCursor(res.lastDoc);
      setHasMore(res.hasMore);
      if (res.indexNotice) setIndexNotice(res.indexNotice);
    } catch (err: any) {
      console.error('Failed to query Pre-Orders:', err);
      setError(err?.message || 'Unable to load Pre-Orders.');
    } finally {
      setLoading(false);
    }
  }, [
    canView,
    pageSize,
    currentCursor,
    selectedStatuses,
    subBrandFilter,
    allowedSubBrands,
    supplierFilter,
    paymentStateFilter,
    dateFrom,
    dateTo,
    overdueOnly,
    debouncedSearch,
    sortField,
    sortDir,
  ]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleSort = (field: PreOrderSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'estimatedDeliveryDate' || field === 'preOrderNumber' ? 'asc' : 'desc');
    }
  };

  const renderSortIcon = (field: PreOrderSortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    }
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#D4AF37]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#D4AF37]" />
    );
  };

  const toggleStatusFilter = (status: PreOrderStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const hasActiveFilters = Boolean(
    debouncedSearch ||
      selectedStatuses.length > 0 ||
      subBrandFilter !== 'ALL' ||
      supplierFilter !== 'ALL' ||
      paymentStateFilter !== 'ALL' ||
      dateFrom ||
      dateTo ||
      overdueOnly
  );

  const resetFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSelectedStatuses([]);
    setSubBrandFilter('ALL');
    setSupplierFilter('ALL');
    setPaymentStateFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setOverdueOnly(false);
  };

  const handleNextPage = () => {
    if (!hasMore || !nextCursor) return;
    setCursorHistory((prev) => {
      const copy = prev.slice(0, pageIndex + 1);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex((p) => p + 1);
  };

  const handlePrevPage = () => {
    if (pageIndex <= 0) return;
    setPageIndex((p) => p - 1);
  };

  if (!canView) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Access Restricted
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your role does not currently have permission to view Pre-Orders (`preOrderView`).
        </p>
      </Card>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            All Pre-Orders
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track customer pre-orders, advance deposits, remaining dues, and supplier procurement
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {isAdmin && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowIntegrityModal(true)}
              leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />}
            >
              Integrity Check
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={fetchPage}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          {canCreate && (
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={onCreateNew}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Create Pre-Order
            </Button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <Card padding="sm" className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
          {/* Search */}
          <div className="lg:col-span-4">
            <SearchInput
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onClear={() => setSearchInput('')}
              placeholder="Search PO-0001, phone, customer, product, SKU, supplier ref..."
              sizeVariant="md"
              isSoftUI={false}
            />
          </div>

          {/* Status Multi-Select */}
          <div className="lg:col-span-2 relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => setStatusMenuOpen((o) => !o)}
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer hover:border-slate-300 dark:hover:border-slate-600"
            >
              <span className="truncate flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {selectedStatuses.length === 0
                  ? 'All Statuses'
                  : `${selectedStatuses.length} Status${selectedStatuses.length > 1 ? 'es' : ''}`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {statusMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-64 z-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2 space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
                <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Filter Statuses
                  </span>
                  {selectedStatuses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedStatuses([])}
                      className="text-[11px] font-semibold text-[#B89628] hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {PRE_ORDER_STATUSES.map((st) => {
                  const checked = selectedStatuses.includes(st);
                  return (
                    <label
                      key={st}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatusFilter(st)}
                        className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <span className="truncate">{st}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sub-Brand */}
          <div className="lg:col-span-2">
            <Select
              options={[
                { value: 'ALL', label: 'All Sub-Brands' },
                ...allowedSubBrands.map((b) => ({ value: b, label: b })),
              ]}
              value={subBrandFilter}
              onChange={(val) =>
                setSubBrandFilter(val as 'ALL' | 'SAT' | 'GZ' | 'RTX')
              }
              searchable={false}
            />
          </div>

          {/* Payment State */}
          <div className="lg:col-span-2">
            <Select
              options={[
                { value: 'ALL', label: 'All Payment States' },
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'partially_paid', label: 'Partially Paid' },
                { value: 'fully_paid', label: 'Fully Paid' },
                { value: 'refunded', label: 'Refunded' },
              ]}
              value={paymentStateFilter}
              onChange={(val) =>
                setPaymentStateFilter(val as 'ALL' | PreOrderPaymentState)
              }
              searchable={false}
            />
          </div>

          {/* Overdue Toggle */}
          <div className="lg:col-span-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOverdueOnly((v) => !v)}
              className={`flex-1 h-9 px-3 rounded-lg border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                overdueOnly
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-300'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Overdue Only
            </button>
          </div>
        </div>

        {/* Second row: Supplier, Date From, Date To, Reset */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="w-56">
            <Select
              options={[
                { value: 'ALL', label: 'All Suppliers' },
                ...suppliers.map((s) => ({
                  value: s.id,
                  label: s.name,
                  sublabel: s.supplierCode,
                })),
              ]}
              value={supplierFilter}
              onChange={(val) => setSupplierFilter(String(val || 'ALL'))}
              searchable
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="font-medium">Order Date:</span>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              sizeVariant="sm"
              className="w-36"
              aria-label="Order date from"
            />
            <span>to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              sizeVariant="sm"
              className="w-36"
              aria-label="Order date to"
            />
          </div>

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              className="ml-auto"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Optional Index Fallback Notice */}
      {indexNotice && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{indexNotice}</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card padding="md" className="border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm text-rose-800 dark:text-rose-200">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={fetchPage}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* Wide Data Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh] scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[1160px]">
            <thead className="sticky top-0 z-20 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('preOrderNumber')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Pre-Order No {renderSortIcon('preOrderNumber')}
                  </button>
                </th>
                <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                <th className="px-4 py-3 whitespace-nowrap">Product</th>
                <th className="px-4 py-3 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('totalAmount')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer ml-auto"
                  >
                    Total {renderSortIcon('totalAmount')}
                  </button>
                </th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Advance Paid</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('dueAmount')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer ml-auto"
                  >
                    Due {renderSortIcon('dueAmount')}
                  </button>
                </th>
                <th className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('estimatedDeliveryDate')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Expected Arrival {renderSortIcon('estimatedDeliveryDate')}
                  </button>
                </th>
                <th className="px-4 py-3 whitespace-nowrap">Supplier</th>
                <th className="px-4 py-3 whitespace-nowrap">Brand</th>
                <th className="px-4 py-3 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    Created {renderSortIcon('createdAt')}
                  </button>
                </th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {loading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={idx}>
                    <td colSpan={12} className="px-4 py-2.5">
                      <Skeleton variant="table-row" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-14 text-center">
                    <div className="max-w-sm mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                        <Package className="w-6 h-6" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {hasActiveFilters
                          ? 'No matching Pre-Orders found'
                          : 'No Pre-Orders created yet'}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {hasActiveFilters
                          ? 'Try adjusting your search keywords, date range, or status filters.'
                          : 'Create your first customer pre-order to begin tracking China imports and advance deposits.'}
                      </p>
                      <div className="pt-1 flex items-center justify-center gap-2">
                        {hasActiveFilters && (
                          <Button variant="secondary" size="sm" onClick={resetFilters}>
                            Clear Filters
                          </Button>
                        )}
                        {canCreate && (
                          <Button
                            variant="primary"
                            size="sm"
                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                            onClick={onCreateNew}
                          >
                            Create Pre-Order
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const overdue = isPreOrderOverdue(
                    row.estimatedDeliveryDate,
                    row.status,
                    row.stockReceived
                  );

                  return (
                    <tr
                      key={row.id}
                      onClick={() => setActiveDrawerId(row.id)}
                      className="hover:bg-slate-50/90 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDrawerId(row.id);
                          }}
                          className="font-mono font-bold text-[#93741E] dark:text-[#E2C255] hover:underline cursor-pointer"
                        >
                          {row.preOrderNumber}
                        </button>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[160px]">
                          {row.customerName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {row.customerPhone}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
                          {row.productImage ? (
                            <img
                              src={row.productImage}
                              alt={row.productName}
                              className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {row.productName}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              Qty: <span className="font-mono font-bold">{row.qty}</span>
                              {row.sku ? ` • ${row.sku}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <PreOrderStatusBadge status={row.status} size="xs" />
                          {row.convertedInvoiceNumber && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800">
                              {row.convertedInvoiceNumber}
                            </span>
                          )}
                          {!row.convertedSaleId && (row.stockReceivedQty || 0) > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800">
                              Reserved: {row.stockReceivedQty}/{row.qty}
                            </span>
                          )}
                          {row.status === 'Cancelled' &&
                            (row.advancePaid || 0) - (row.refundedAmount || 0) > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800">
                                Refund required
                              </span>
                            )}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatBDT(row.totalAmount)}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono tabular-nums">
                        <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatBDT(row.advancePaid)}
                        </div>
                        {(row.pendingAmount || 0) > 0 && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400">
                            +{formatBDT(row.pendingAmount)} pending
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold tabular-nums">
                        <span
                          className={
                            row.dueAmount > 0
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-400'
                          }
                        >
                          {formatBDT(row.dueAmount)}
                        </span>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {row.estimatedDeliveryDate || '—'}
                          </span>
                          {overdue && <OverdueTag />}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                          {row.supplierName || '—'}
                        </div>
                        {row.supplierOrderRef && (
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                            {row.supplierOrderRef}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <SubBrandBadge subBrand={row.subBrand} />
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400">
                        {new Date(row.createdAt).toLocaleDateString('en-GB', {
                          day: '2-digit',
                          month: 'short',
                          year: '2-digit',
                        })}
                      </td>

                      <td
                        className="px-4 py-3 whitespace-nowrap text-right relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            leftIcon={<Eye className="w-3.5 h-3.5" />}
                            onClick={() => {
                              setDrawerEditMode(false);
                              setActiveDrawerId(row.id);
                            }}
                          >
                            View
                          </Button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuRowId((prev) => (prev === row.id ? null : row.id));
                            }}
                            className="w-7 h-7 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label={`Actions for ${row.preOrderNumber}`}
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {openMenuRowId === row.id && (
                          <div
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute right-4 top-11 z-40 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1 text-left"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuRowId(null);
                                setDrawerEditMode(false);
                                setActiveDrawerId(row.id);
                              }}
                              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-400" />
                              View Details
                            </button>
                            {canEdit &&
                              !['Delivered', 'Cancelled', 'Refunded'].includes(row.status) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuRowId(null);
                                    setDrawerEditMode(true);
                                    setActiveDrawerId(row.id);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  Edit Pre-Order
                                </button>
                              )}
                            {canUpdateStatus &&
                              row.status !== 'Delivered' &&
                              row.status !== 'Refunded' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuRowId(null);
                                    setStatusTargetOrder(row);
                                  }}
                                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5 text-sky-600" />
                                  Update Status
                                </button>
                              )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Cursor Pagination Footer */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span>Rows per page:</span>
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
            <span className="ml-2 font-mono">
              Showing {items.length} record{items.length === 1 ? '' : 's'} (Page{' '}
              {pageIndex + 1})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={pageIndex === 0 || loading}
              onClick={handlePrevPage}
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={!hasMore || loading}
              onClick={handleNextPage}
              rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Slide-Over Detail & Edit Drawer */}
      <PreOrderDetailDrawer
        preOrderId={activeDrawerId}
        isOpen={Boolean(activeDrawerId)}
        initialEditMode={drawerEditMode}
        onClose={() => {
          setActiveDrawerId(null);
          setDrawerEditMode(false);
          onClearInitialSelected?.();
        }}
        user={user}
        rolePermissions={rolePermissions}
        categories={categories}
        brands={brands}
        products={products}
        suppliers={suppliers}
        companySettings={companySettings}
        onNavigate={onNavigate}
        onUpdated={fetchPage}
      />

      {/* Quick Update Status Dialog */}
      <PreOrderStatusDialog
        isOpen={Boolean(statusTargetOrder)}
        onClose={() => setStatusTargetOrder(null)}
        order={statusTargetOrder}
        user={user}
        onUpdated={fetchPage}
      />

      {/* Admin Integrity Check Modal */}
      {isAdmin && (
        <PreOrderIntegrityModal
          isOpen={showIntegrityModal}
          onClose={() => setShowIntegrityModal(false)}
          onSelectPreOrder={(poId) => {
            setDrawerEditMode(false);
            setActiveDrawerId(poId);
          }}
        />
      )}
    </div>
  );
};

export default AllPreOrdersView;
