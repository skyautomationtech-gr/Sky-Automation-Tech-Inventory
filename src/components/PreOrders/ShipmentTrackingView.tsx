import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckSquare,
  ExternalLink,
  Kanban,
  Layers,
  List,
  Plane,
  RefreshCw,
  Search,
  Ship,
  Truck,
} from 'lucide-react';
import {
  Category,
  CompanySettings,
  PreOrder,
  PreOrderStatus,
  RolePermissionsMap,
  SubBrand,
  Supplier,
  UserProfile,
} from '../../types';
import {
  getSellingSubBrands,
  getUserAllowedSubBrandIds,
  matchesGlobalBrandFilter,
} from '../../utils/subBrands';
import {
  formatPreOrderProductLabel,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderOverdue,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import {
  actorFromUser,
  batchUpdatePreOrderShipments,
  queryShipmentTrackingOrders,
} from '../../firebase/preOrderDb';
import { getSuppliers } from '../../firebase/db';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  useToast,
} from '../../design-system';
import PreOrderDetailDrawer from './PreOrderDetailDrawer';

const SHIPMENT_STAGES: PreOrderStatus[] = [
  'Ordered from China',
  'China Warehouse',
  'International Shipment',
  'Customs Clearance',
  'Arrived in Bangladesh',
];

function getDaysDeltaBadge(eta?: string, status?: PreOrderStatus, stockReceived?: boolean) {
  if (!eta) return null;
  const today = new Date();
  const todayMidnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const parts = eta.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const etaMidnight = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const diffDays = Math.round((etaMidnight - todayMidnight) / (1000 * 60 * 60 * 24));

  const terminal =
    stockReceived ||
    status === 'Delivered' ||
    status === 'Cancelled' ||
    status === 'Refunded' ||
    status === 'Arrived in Bangladesh';

  if (diffDays < 0 && !terminal) {
    return {
      label: `${Math.abs(diffDays)}d overdue`,
      variant: 'danger' as const,
      isOverdue: true,
    };
  }
  if (diffDays === 0 && !terminal) {
    return { label: 'Due today', variant: 'warning' as const, isOverdue: false };
  }
  if (diffDays > 0 && !terminal) {
    return { label: `${diffDays}d left`, variant: 'neutral' as const, isOverdue: false };
  }
  return { label: eta, variant: 'neutral' as const, isOverdue: false };
}

export interface ShipmentTrackingViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  suppliers?: Supplier[];
  companySettings?: CompanySettings | null;
  subBrands?: SubBrand[];
  globalBrandFilter?: string;
}

export const ShipmentTrackingView: React.FC<ShipmentTrackingViewProps> = ({
  user,
  rolePermissions,
  categories,
  suppliers: suppliersProp,
  companySettings,
  subBrands,
  globalBrandFilter,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const canManageTracking = hasPermission(user, rolePermissions, 'preOrderManageTracking') || isAdmin;
  const canBatchAction = isAdmin && canManageTracking;

  const [internalSuppliers, setInternalSuppliers] = useState<Supplier[]>(suppliersProp || []);
  const suppliers = suppliersProp && suppliersProp.length > 0 ? suppliersProp : internalSuppliers;

  useEffect(() => {
    if (!suppliersProp) {
      getSuppliers().then(setInternalSuppliers).catch(() => {});
    }
  }, [suppliersProp]);

  const sellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: true, companySettings }),
    [subBrands, companySettings]
  );

  const allowedSubBrands = useMemo<string[] | undefined>(() => {
    if (isAdmin) return undefined;
    const ids = getUserAllowedSubBrandIds(user, subBrands, {
      includeInactive: true,
      companySettings,
    });
    return ids.length > 0 ? ids : sellingSubBrands.map((sb) => sb.shortCode);
  }, [isAdmin, user, subBrands, companySettings, sellingSubBrands]);

  const [orders, setOrders] = useState<PreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [forwarderFilter, setForwarderFilter] = useState('ALL');
  const [customsFilter, setCustomsFilter] = useState('ALL');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [etaFrom, setEtaFrom] = useState('');
  const [etaTo, setEtaTo] = useState('');

  // Drawer & Selection
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Batch Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [bMethod, setBMethod] = useState('');
  const [bForwarder, setBForwarder] = useState('');
  const [bForwarderContact, setBForwarderContact] = useState('');
  const [bTracking, setBTracking] = useState('');
  const [bTrackingUrl, setBTrackingUrl] = useState('');
  const [bDispatchDate, setBDispatchDate] = useState('');
  const [bEta, setBEta] = useState('');
  const [bCustoms, setBCustoms] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const list = await queryShipmentTrackingOrders({
        allowedSubBrands,
        limitCount: 200,
      });
      setOrders(list);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load shipment pipeline.');
    } finally {
      setLoading(false);
    }
  }, [allowedSubBrands, toast]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // All orders within the 5 China/International shipping stages
  const pipelineOrders = useMemo(
    () => orders.filter((o) => SHIPMENT_STAGES.includes(o.status)),
    [orders]
  );

  const forwarderOptions = useMemo(() => {
    const unique = Array.from(
      new Set(
        pipelineOrders
          .map((o) => (o.freightForwarder || o.courier || '').trim())
          .filter(Boolean)
      )
    );
    return [
      { value: 'ALL', label: 'All Forwarders' },
      ...unique.map((f) => ({ value: f, label: f })),
    ];
  }, [pipelineOrders]);

  const filteredOrders = useMemo(() => {
    return pipelineOrders.filter((o) => {
      if (globalBrandFilter && globalBrandFilter !== 'ALL' && !matchesGlobalBrandFilter(o.subBrand, globalBrandFilter)) {
        return false;
      }
      if (supplierFilter !== 'ALL' && o.supplierId !== supplierFilter) return false;
      if (methodFilter !== 'ALL' && o.shippingMethod !== methodFilter) return false;
      if (
        forwarderFilter !== 'ALL' &&
        (o.freightForwarder || o.courier || '') !== forwarderFilter
      ) {
        return false;
      }
      if (customsFilter !== 'ALL' && (o.customsStatus || 'Not started') !== customsFilter) {
        return false;
      }
      const overdue = isPreOrderOverdue(o.estimatedDeliveryDate, o.status, o.stockReceived);
      if (delayedOnly && !overdue && !o.isDelayed) return false;
      if (etaFrom && (!o.estimatedDeliveryDate || o.estimatedDeliveryDate < etaFrom)) return false;
      if (etaTo && (!o.estimatedDeliveryDate || o.estimatedDeliveryDate > etaTo)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const itemsText = normalizePreOrderItems(o)
          .flatMap((it) => [it.productName, it.sku, it.model, it.variant, it.color])
          .filter(Boolean);
        const hay = [
          o.preOrderNumber,
          o.productName,
          ...itemsText,
          ...(o.searchKeywords || []),
          o.trackingNumber,
          o.supplierOrderRef,
          o.supplierName,
          o.freightForwarder,
          o.customerName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    pipelineOrders,
    globalBrandFilter,
    supplierFilter,
    methodFilter,
    forwarderFilter,
    customsFilter,
    delayedOnly,
    etaFrom,
    etaTo,
    searchTerm,
  ]);

  const summary = useMemo(() => {
    let inChina = 0;
    let inTransit = 0;
    let atCustoms = 0;
    let arrived = 0;
    let delayed = 0;

    for (const o of pipelineOrders) {
      if (o.status === 'Ordered from China' || o.status === 'China Warehouse') inChina++;
      else if (o.status === 'International Shipment') inTransit++;
      else if (o.status === 'Customs Clearance') atCustoms++;
      else if (o.status === 'Arrived in Bangladesh') arrived++;

      const overdue = isPreOrderOverdue(o.estimatedDeliveryDate, o.status, o.stockReceived);
      if (overdue || o.isDelayed) delayed++;
    }
    return { inChina, inTransit, atCustoms, arrived, delayed };
  }, [pipelineOrders]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedOrdersList = useMemo(
    () => filteredOrders.filter((o) => selectedIds.has(o.id)),
    [filteredOrders, selectedIds]
  );

  const openBatchModal = () => {
    setBMethod('');
    setBForwarder('');
    setBForwarderContact('');
    setBTracking('');
    setBTrackingUrl('');
    setBDispatchDate('');
    setBEta('');
    setBCustoms('');
    setShowBatchModal(true);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canBatchAction || savingBatch || selectedOrdersList.length === 0) return;

    setSavingBatch(true);
    try {
      const count = await batchUpdatePreOrderShipments(
        selectedOrdersList,
        {
          shippingMethod: bMethod || undefined,
          freightForwarder: bForwarder.trim() || undefined,
          forwarderContact: bForwarderContact.trim() || undefined,
          trackingNumber: bTracking.trim() || undefined,
          carrierTrackingUrl: bTrackingUrl.trim() || undefined,
          shippedFromChinaAt: bDispatchDate || undefined,
          estimatedArrivalDate: bEta || undefined,
          customsStatus: bCustoms || undefined,
        },
        actorFromUser(user)
      );
      toast.success(`Applied batch shipment update to ${count} Pre-Order(s).`);
      setShowBatchModal(false);
      setSelectedIds(new Set());
      await loadOrders();
    } catch (err: any) {
      toast.error(err?.message || 'Batch shipment update failed.');
    } finally {
      setSavingBatch(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
            Shipment Tracking
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track China orders, international air/sea freight, customs clearance, arrival ETAs, and batch logistics updates.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canBatchAction && selectedOrdersList.length > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              leftIcon={<Layers className="w-4 h-4" />}
              onClick={openBatchModal}
            >
              Batch Update ({selectedOrdersList.length})
            </Button>
          )}
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" /> Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <List className="w-3.5 h-3.5" /> Table
            </button>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={loadOrders}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* 5 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            In China
          </div>
          <div className="text-xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
            {summary.inChina}
          </div>
          <div className="text-[11px] text-slate-400">Ordered / China WH</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            In Transit
          </div>
          <div className="text-xl font-mono font-bold text-indigo-700 dark:text-indigo-400 mt-1">
            {summary.inTransit}
          </div>
          <div className="text-[11px] text-slate-400">International Shipment</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            At Customs
          </div>
          <div className="text-xl font-mono font-bold text-amber-700 dark:text-amber-400 mt-1">
            {summary.atCustoms}
          </div>
          <div className="text-[11px] text-slate-400">Customs Clearance</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            Arrived BD
          </div>
          <div className="text-xl font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {summary.arrived}
          </div>
          <div className="text-[11px] text-slate-400">Arrived in Bangladesh</div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/50 rounded-xl p-3.5">
          <div className="text-[11px] font-semibold text-rose-500 uppercase tracking-wide">
            Delayed
          </div>
          <div className="text-xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-1">
            {summary.delayed}
          </div>
          <div className="text-[11px] text-slate-400">Overdue or pushed ETA</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search PO#, Tracking No, Supplier Order ID, Product..."
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
            />
          </div>

          <Select
            options={[
              { value: 'ALL', label: 'All Suppliers' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
            value={supplierFilter}
            onChange={(val) => setSupplierFilter(String(val))}
            searchable
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Methods' },
              { value: 'Air', label: 'Air' },
              { value: 'Sea', label: 'Sea' },
              { value: 'Express courier', label: 'Express courier' },
            ]}
            value={methodFilter}
            onChange={(val) => setMethodFilter(String(val))}
            searchable={false}
          />

          <Select
            options={[
              { value: 'ALL', label: 'All Customs' },
              { value: 'Not started', label: 'Not started' },
              { value: 'In progress', label: 'In progress' },
              { value: 'Cleared', label: 'Cleared' },
              { value: 'Held/Issue', label: 'Held/Issue' },
            ]}
            value={customsFilter}
            onChange={(val) => setCustomsFilter(String(val))}
            searchable={false}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="w-44">
            <Select
              options={forwarderOptions}
              value={forwarderFilter}
              onChange={(val) => setForwarderFilter(String(val))}
              searchable={false}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">ETA From:</span>
            <Input
              type="date"
              value={etaFrom}
              onChange={(e) => setEtaFrom(e.target.value)}
              className="w-36 h-9"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">To:</span>
            <Input
              type="date"
              value={etaTo}
              onChange={(e) => setEtaTo(e.target.value)}
              className="w-36 h-9"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={delayedOnly}
              onChange={(e) => setDelayedOnly(e.target.checked)}
              className="rounded border-slate-300 text-[#D4AF37]"
            />
            <span className="font-semibold text-rose-600 dark:text-rose-400">Delayed Only</span>
          </label>

          {(supplierFilter !== 'ALL' ||
            methodFilter !== 'ALL' ||
            forwarderFilter !== 'ALL' ||
            customsFilter !== 'ALL' ||
            delayedOnly ||
            etaFrom ||
            etaTo ||
            searchTerm) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setSupplierFilter('ALL');
                setMethodFilter('ALL');
                setForwarderFilter('ALL');
                setCustomsFilter('ALL');
                setDelayedOnly(false);
                setEtaFrom('');
                setEtaTo('');
                setSearchTerm('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {SHIPMENT_STAGES.map((st) => (
            <Skeleton key={st} className="h-72 rounded-2xl" />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={<Truck className="w-6 h-6" />}
          title="No shipments in selected filters"
          description="Move confirmed pre-orders into 'Ordered from China' via the Status Workflow or adjust your active filters."
        />
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD (NO DRAG-AND-DROP BYPASS) */
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
          {SHIPMENT_STAGES.map((stage) => {
            const stageItems = filteredOrders.filter((o) => o.status === stage);
            return (
              <div
                key={stage}
                className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-2.5 space-y-2.5 min-h-[260px]"
              >
                <div className="flex items-center justify-between px-1.5 pt-1">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {stage}
                  </span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200">
                    {stageItems.length}
                  </span>
                </div>

                {stageItems.length === 0 ? (
                  <div className="p-4 text-center text-[11px] text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    Empty
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stageItems.map((ord) => {
                      const etaBadge = getDaysDeltaBadge(
                        ord.estimatedDeliveryDate,
                        ord.status,
                        ord.stockReceived
                      );
                      const checked = selectedIds.has(ord.id);
                      const orderItems = normalizePreOrderItems(ord);
                      const totalQty =
                        ord.totalQty ?? orderItems.reduce((s, it) => s + it.qty, 0);
                      return (
                        <div
                          key={ord.id}
                          onClick={() => setDrawerOrderId(ord.id)}
                          className={`bg-white dark:bg-slate-900 border rounded-xl p-3 space-y-2 cursor-pointer transition-all hover:border-[#D4AF37]/80 ${
                            checked
                              ? 'border-[#D4AF37] ring-1 ring-[#D4AF37]/30'
                              : 'border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {canBatchAction && (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={() => toggleSelect(ord.id)}
                                  className="rounded border-slate-300 text-[#D4AF37]"
                                />
                              )}
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
                                {ord.preOrderNumber}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono font-semibold text-slate-500">
                              {orderItems.length > 1 ? `${orderItems.length} items · ` : ''}
                              Qty {totalQty}
                            </span>
                          </div>

                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                            {formatPreOrderProductLabel(ord)}
                          </div>

                          <div className="text-[11px] text-slate-500 space-y-0.5">
                            <div className="truncate">
                              Supplier: <span className="text-slate-700 dark:text-slate-300">{ord.supplierName || '—'}</span>
                            </div>
                            <div className="truncate font-mono">
                              Track: {ord.trackingNumber || 'Pending'}
                            </div>
                            <div className="truncate">
                              Forwarder: {ord.freightForwarder || ord.courier || '—'}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px]">
                            <Badge
                              variant={
                                ord.customsStatus === 'Cleared'
                                  ? 'success'
                                  : ord.customsStatus === 'Held/Issue'
                                  ? 'danger'
                                  : 'neutral'
                              }
                              size="xs"
                            >
                              {ord.customsStatus || 'Not started'}
                            </Badge>
                            {etaBadge && (
                              <Badge variant={etaBadge.variant} size="xs">
                                {etaBadge.label}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {canBatchAction && (
                    <th className="px-3 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          filteredOrders.length > 0 &&
                          filteredOrders.every((o) => selectedIds.has(o.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(filteredOrders.map((o) => o.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                        className="rounded border-slate-300 text-[#D4AF37]"
                      />
                    </th>
                  )}
                  <th className="px-3.5 py-3 font-semibold">Pre-Order</th>
                  <th className="px-3.5 py-3 font-semibold">Product</th>
                  <th className="px-3.5 py-3 font-semibold">Supplier</th>
                  <th className="px-3.5 py-3 font-semibold">Forwarder / Method</th>
                  <th className="px-3.5 py-3 font-semibold">Tracking No</th>
                  <th className="px-3.5 py-3 font-semibold">Dispatch Date</th>
                  <th className="px-3.5 py-3 font-semibold">Expected Arrival</th>
                  <th className="px-3.5 py-3 font-semibold">Customs</th>
                  <th className="px-3.5 py-3 font-semibold">Stage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                {filteredOrders.map((ord) => {
                  const etaBadge = getDaysDeltaBadge(
                    ord.estimatedDeliveryDate,
                    ord.status,
                    ord.stockReceived
                  );
                  const checked = selectedIds.has(ord.id);
                  return (
                    <tr
                      key={ord.id}
                      onClick={() => setDrawerOrderId(ord.id)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      {canBatchAction && (
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(ord.id)}
                            className="rounded border-slate-300 text-[#D4AF37]"
                          />
                        </td>
                      )}
                      <td className="px-3.5 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                        {ord.preOrderNumber}
                      </td>
                      <td className="px-3.5 py-3">
                        {(() => {
                          const orderItems = normalizePreOrderItems(ord);
                          const totalQty =
                            ord.totalQty ?? orderItems.reduce((s, it) => s + it.qty, 0);
                          return (
                            <>
                              <div className="font-medium text-slate-900 dark:text-slate-100 max-w-[220px] truncate">
                                {formatPreOrderProductLabel(ord)}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {orderItems.length > 1
                                  ? `${orderItems.length} items · Qty ${totalQty}`
                                  : `Qty ${totalQty}`}
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td className="px-3.5 py-3">{ord.supplierName || '—'}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-medium">{ord.freightForwarder || ord.courier || '—'}</div>
                        <div className="text-[11px] text-slate-400">{ord.shippingMethod || '—'}</div>
                      </td>
                      <td className="px-3.5 py-3 font-mono">{ord.trackingNumber || '—'}</td>
                      <td className="px-3.5 py-3 font-mono">{ord.shippedFromChinaAt || '—'}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-mono">{ord.estimatedDeliveryDate || '—'}</div>
                        {etaBadge && (
                          <Badge variant={etaBadge.variant} size="xs">
                            {etaBadge.label}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3.5 py-3">
                        <Badge
                          variant={
                            ord.customsStatus === 'Cleared'
                              ? 'success'
                              : ord.customsStatus === 'Held/Issue'
                              ? 'danger'
                              : 'neutral'
                          }
                          size="xs"
                        >
                          {ord.customsStatus || 'Not started'}
                        </Badge>
                      </td>
                      <td className="px-3.5 py-3">
                        <Badge variant="info" size="xs">{ord.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BATCH SHIPMENT UPDATE MODAL (ADMIN / SUPER ADMIN + preOrderManageTracking) */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => !savingBatch && setShowBatchModal(false)}
        title={`Batch Shipment Update (${selectedOrdersList.length} selected)`}
        subtitle="Leave any field blank to keep each pre-order's existing value. Does not change workflow statuses."
        size="md"
      >
        <form onSubmit={handleBatchSubmit} className="space-y-4">
          <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            {selectedOrdersList.map((o) => (
              <span
                key={o.id}
                className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-bold"
              >
                {o.preOrderNumber}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Shipping Method">
              <Select
                options={[
                  { value: '', label: 'Keep existing' },
                  { value: 'Air', label: 'Air' },
                  { value: 'Sea', label: 'Sea' },
                  { value: 'Express courier', label: 'Express courier' },
                ]}
                value={bMethod}
                onChange={(val) => setBMethod(String(val))}
                searchable={false}
              />
            </FormField>

            <FormField label="Customs Status">
              <Select
                options={[
                  { value: '', label: 'Keep existing' },
                  { value: 'Not started', label: 'Not started' },
                  { value: 'In progress', label: 'In progress' },
                  { value: 'Cleared', label: 'Cleared' },
                  { value: 'Held/Issue', label: 'Held/Issue' },
                ]}
                value={bCustoms}
                onChange={(val) => setBCustoms(String(val))}
                searchable={false}
              />
            </FormField>

            <FormField label="Freight Forwarder">
              <Input
                value={bForwarder}
                onChange={(e) => setBForwarder(e.target.value)}
                placeholder="Keep existing"
              />
            </FormField>

            <FormField label="Forwarder Contact">
              <Input
                value={bForwarderContact}
                onChange={(e) => setBForwarderContact(e.target.value)}
                placeholder="Keep existing"
              />
            </FormField>

            <FormField label="Common Tracking Number">
              <Input
                value={bTracking}
                onChange={(e) => setBTracking(e.target.value)}
                placeholder="Keep existing"
                className="font-mono"
              />
            </FormField>

            <FormField label="Carrier Tracking URL">
              <Input
                value={bTrackingUrl}
                onChange={(e) => setBTrackingUrl(e.target.value)}
                placeholder="Keep existing"
              />
            </FormField>

            <FormField label="China Dispatch Date">
              <Input
                type="date"
                value={bDispatchDate}
                onChange={(e) => setBDispatchDate(e.target.value)}
              />
            </FormField>

            <FormField label="Expected Arrival Date (ETA)">
              <Input
                type="date"
                value={bEta}
                onChange={(e) => setBEta(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              disabled={savingBatch}
              onClick={() => setShowBatchModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={savingBatch}>
              Apply to {selectedOrdersList.length} Order(s)
            </Button>
          </div>
        </form>
      </Modal>

      {/* PRE-ORDER DETAIL DRAWER OPENING ON SHIPMENT TAB */}
      <PreOrderDetailDrawer
        preOrderId={drawerOrderId}
        isOpen={Boolean(drawerOrderId)}
        onClose={() => setDrawerOrderId(null)}
        user={user}
        rolePermissions={rolePermissions}
        categories={categories}
        suppliers={suppliers}
        companySettings={companySettings}
        subBrands={subBrands}
        initialTab="shipment"
        onUpdated={loadOrders}
      />
    </div>
  );
};

export default ShipmentTrackingView;
