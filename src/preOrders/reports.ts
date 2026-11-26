import {
  AccountingPosting,
  PreOrder,
  PreOrderAuditEntry,
  PreOrderPayment,
  PreOrderPrivateCost,
  PreOrderStatus,
  PreOrderSupplierPayment,
  Supplier,
} from '../types';
import {
  PRE_ORDER_NOT_OVERDUE_STATUSES,
  PRE_ORDER_STATUSES,
  computeItemCostMap,
  formatPreOrderProductLabel,
  getTodayIsoDate,
  isPreOrderOverdue,
  normalizeBdPhone,
  normalizePreOrderItems,
} from './constants';
import {
  calculateActualShippingCost,
  calculatePerOrderSupplierSummary,
  calculatePreOrderFinancials,
  fromPaisa,
  roundMoney,
  toPaisa,
} from './calculations';

export type ReportDatePreset = 'today' | 'week' | 'month' | 'custom' | 'all';

export interface ReportFilterState {
  datePreset: ReportDatePreset;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  subBrand: 'ALL' | 'SAT' | 'GZ' | 'RTX';
  statuses: PreOrderStatus[];
  supplierId: string; // 'ALL' | id
  customerQuery: string;
  productQuery: string;
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
}

export function resolveReportDateRange(
  preset: ReportDatePreset,
  customFrom: string = '',
  customTo: string = ''
): { dateFrom: string; dateTo: string } {
  const today = getTodayIsoDate();
  if (preset === 'all') {
    return { dateFrom: '', dateTo: '' };
  }
  if (preset === 'today') {
    return { dateFrom: today, dateTo: today };
  }
  if (preset === 'week') {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 6);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return { dateFrom: `${y}-${m}-${day}`, dateTo: today };
  }
  if (preset === 'month') {
    return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
  }
  return { dateFrom: customFrom || '', dateTo: customTo || '' };
}

export function toIsoDayFromTimestamp(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return getTodayIsoDate();
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getPreOrderDay(po: Pick<PreOrder, 'orderDate' | 'createdAt'>): string {
  return po.orderDate || toIsoDayFromTimestamp(po.createdAt);
}

export function filterPreOrdersForReport(
  preOrders: PreOrder[],
  filters: ReportFilterState
): PreOrder[] {
  const { dateFrom, dateTo } = resolveReportDateRange(
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo
  );
  const custQ = filters.customerQuery.trim().toLowerCase();
  const custNormPhone = normalizeBdPhone(filters.customerQuery);
  const prodQ = filters.productQuery.trim().toLowerCase();

  return (preOrders || []).filter((po) => {
    if (!po) return false;
    if (
      filters.allowedSubBrands &&
      filters.allowedSubBrands.length > 0 &&
      !filters.allowedSubBrands.includes(po.subBrand)
    ) {
      return false;
    }
    if (filters.subBrand && filters.subBrand !== 'ALL' && po.subBrand !== filters.subBrand) {
      return false;
    }
    if (filters.statuses.length > 0 && !filters.statuses.includes(po.status)) {
      return false;
    }
    if (filters.supplierId && filters.supplierId !== 'ALL' && po.supplierId !== filters.supplierId) {
      return false;
    }

    const day = getPreOrderDay(po);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;

    if (custQ) {
      const custHay = `${po.customerName || ''} ${po.customerCode || ''} ${po.customerPhone || ''} ${po.preOrderNumber || ''}`.toLowerCase();
      const phoneMatch =
        custNormPhone.length >= 4 && normalizeBdPhone(po.customerPhone).includes(custNormPhone);
      if (!custHay.includes(custQ) && !phoneMatch) return false;
    }

    if (prodQ) {
      const items = normalizePreOrderItems(po);
      const itemHay = items
        .map((it) => `${it.productName || ''} ${it.sku || ''} ${it.model || ''} ${it.variant || ''} ${it.color || ''}`)
        .join(' ');
      const kwHay = (po.searchKeywords || []).join(' ');
      const prodHay = `${po.productName || ''} ${po.sku || ''} ${po.model || ''} ${po.variant || ''} ${po.color || ''} ${itemHay} ${kwHay}`.toLowerCase();
      if (!prodHay.includes(prodQ)) return false;
    }

    return true;
  });
}

export interface ReportColumnMeta {
  key: string;
  header: string;
  numeric?: boolean;
  requiresProfit?: boolean;
  requiresSupplier?: boolean;
  width?: number;
}

export interface BuiltReportResult<T extends Record<string, any> = Record<string, any>> {
  columns: ReportColumnMeta[];
  rows: T[];
  kpis: Array<{ label: string; value: string; requiresProfit?: boolean; requiresSupplier?: boolean }>;
}

// ==========================================
// 1. PERIOD SUMMARY (DAILY / WEEKLY / MONTHLY)
// ==========================================
export function buildPeriodSummaryReport(
  filteredOrders: PreOrder[],
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>
): BuiltReportResult {
  const byDay = new Map<
    string,
    {
      date: string;
      ordersCount: number;
      qtyTotal: number;
      orderValue: number;
      advanceCollected: number;
      dueAmount: number;
      refundedAmount: number;
      deliveredCount: number;
      cancelledCount: number;
      expectedProfit: number;
    }
  >();

  let totalValuePaisa = 0;
  let totalAdvPaisa = 0;
  let totalDuePaisa = 0;
  let totalRefundPaisa = 0;
  let totalExpectedProfitPaisa = 0;

  for (const po of filteredOrders) {
    const day = getPreOrderDay(po);
    if (!byDay.has(day)) {
      byDay.set(day, {
        date: day,
        ordersCount: 0,
        qtyTotal: 0,
        orderValue: 0,
        advanceCollected: 0,
        dueAmount: 0,
        refundedAmount: 0,
        deliveredCount: 0,
        cancelledCount: 0,
        expectedProfit: 0,
      });
    }
    const bucket = byDay.get(day)!;
    const isVoid = po.status === 'Cancelled' || po.status === 'Refunded';
    const valP = isVoid ? 0 : toPaisa(po.totalAmount);
    const advP = toPaisa(po.advancePaid);
    const dueP = isVoid ? 0 : Math.max(0, toPaisa(po.dueAmount));
    const refP = toPaisa(po.refundedAmount);
    const priv = privateCostsByOrder[po.id];
    const profP = isVoid ? 0 : toPaisa(priv?.expectedProfit || 0);

    bucket.ordersCount += 1;
    bucket.qtyTotal += Number(po.totalQty ?? po.qty ?? 0);
    bucket.orderValue = fromPaisa(toPaisa(bucket.orderValue) + valP);
    bucket.advanceCollected = fromPaisa(toPaisa(bucket.advanceCollected) + advP);
    bucket.dueAmount = fromPaisa(toPaisa(bucket.dueAmount) + dueP);
    bucket.refundedAmount = fromPaisa(toPaisa(bucket.refundedAmount) + refP);
    if (po.status === 'Delivered') bucket.deliveredCount += 1;
    if (isVoid) bucket.cancelledCount += 1;
    bucket.expectedProfit = fromPaisa(toPaisa(bucket.expectedProfit) + profP);

    totalValuePaisa += valP;
    totalAdvPaisa += advP;
    totalDuePaisa += dueP;
    totalRefundPaisa += refP;
    totalExpectedProfitPaisa += profP;
  }

  const rows = Array.from(byDay.values()).sort((a, b) => b.date.localeCompare(a.date));

  return {
    columns: [
      { key: 'date', header: 'Date', width: 14 },
      { key: 'ordersCount', header: 'Pre-Orders', numeric: true, width: 12 },
      { key: 'qtyTotal', header: 'Units', numeric: true, width: 10 },
      { key: 'orderValue', header: 'Order Value (৳)', numeric: true, width: 18 },
      { key: 'advanceCollected', header: 'Verified Advance (৳)', numeric: true, width: 20 },
      { key: 'dueAmount', header: 'Remaining Due (৳)', numeric: true, width: 18 },
      { key: 'refundedAmount', header: 'Refunded (৳)', numeric: true, width: 15 },
      { key: 'deliveredCount', header: 'Delivered', numeric: true, width: 12 },
      { key: 'cancelledCount', header: 'Cancelled/Ref.', numeric: true, width: 14 },
      { key: 'expectedProfit', header: 'Expected Profit (৳)', numeric: true, requiresProfit: true, width: 20 },
    ],
    rows,
    kpis: [
      { label: 'Pre-Orders', value: String(filteredOrders.length) },
      { label: 'Order Value', value: `৳${fromPaisa(totalValuePaisa).toLocaleString()}` },
      { label: 'Verified Advance', value: `৳${fromPaisa(totalAdvPaisa).toLocaleString()}` },
      { label: 'Outstanding Due', value: `৳${fromPaisa(totalDuePaisa).toLocaleString()}` },
      { label: 'Refunded', value: `৳${fromPaisa(totalRefundPaisa).toLocaleString()}` },
      { label: 'Expected Profit', value: `৳${fromPaisa(totalExpectedProfitPaisa).toLocaleString()}`, requiresProfit: true },
    ],
  };
}

// ==========================================
// 2. STATUS-WISE PRE-ORDER REPORT
// ==========================================
export function buildStatusOrdersReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const totalCount = filteredOrders.length;
  const map = new Map<
    PreOrderStatus,
    {
      status: PreOrderStatus;
      orderCount: number;
      totalQty: number;
      totalValue: number;
      advancePaid: number;
      dueAmount: number;
      sharePercent: number;
    }
  >();

  PRE_ORDER_STATUSES.forEach((st) => {
    map.set(st, {
      status: st,
      orderCount: 0,
      totalQty: 0,
      totalValue: 0,
      advancePaid: 0,
      dueAmount: 0,
      sharePercent: 0,
    });
  });

  for (const po of filteredOrders) {
    const row = map.get(po.status);
    if (!row) continue;
    const isVoid = po.status === 'Cancelled' || po.status === 'Refunded';
    row.orderCount += 1;
    row.totalQty += Number(po.totalQty ?? po.qty ?? 0);
    row.totalValue = fromPaisa(toPaisa(row.totalValue) + toPaisa(po.totalAmount));
    row.advancePaid = fromPaisa(toPaisa(row.advancePaid) + toPaisa(po.advancePaid));
    row.dueAmount = fromPaisa(toPaisa(row.dueAmount) + (isVoid ? 0 : Math.max(0, toPaisa(po.dueAmount))));
  }

  const rows = Array.from(map.values()).map((r) => ({
    ...r,
    sharePercent: totalCount > 0 ? Math.round((r.orderCount / totalCount) * 1000) / 10 : 0,
  }));

  const activeCount = filteredOrders.filter(
    (o) => o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Refunded'
  ).length;

  return {
    columns: [
      { key: 'status', header: 'Workflow Status', width: 24 },
      { key: 'orderCount', header: 'Orders', numeric: true, width: 12 },
      { key: 'sharePercent', header: 'Share (%)', numeric: true, width: 12 },
      { key: 'totalQty', header: 'Units', numeric: true, width: 12 },
      { key: 'totalValue', header: 'Order Value (৳)', numeric: true, width: 18 },
      { key: 'advancePaid', header: 'Verified Advance (৳)', numeric: true, width: 20 },
      { key: 'dueAmount', header: 'Active Due (৳)', numeric: true, width: 18 },
    ],
    rows,
    kpis: [
      { label: 'Total Orders', value: String(totalCount) },
      { label: 'Active Pipeline', value: String(activeCount) },
      {
        label: 'Statuses Active',
        value: String(rows.filter((r) => r.orderCount > 0).length),
      },
    ],
  };
}

// ==========================================
// 3. PAYMENT COLLECTION REPORT (METHOD & STATUS)
// ==========================================
export function buildPaymentCollectionReport(
  payments: PreOrderPayment[],
  filteredOrderIds: Set<string>,
  filters: ReportFilterState
): BuiltReportResult {
  const { dateFrom, dateTo } = resolveReportDateRange(
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo
  );
  const custQ = filters.customerQuery.trim().toLowerCase();

  const matching = (payments || []).filter((p) => {
    if (!p) return false;
    if (
      filters.allowedSubBrands &&
      filters.allowedSubBrands.length > 0 &&
      p.subBrand &&
      !filters.allowedSubBrands.includes(p.subBrand)
    ) {
      return false;
    }
    if (filters.subBrand && filters.subBrand !== 'ALL' && p.subBrand && p.subBrand !== filters.subBrand) {
      return false;
    }
    if (
      (filters.statuses.length > 0 || filters.supplierId !== 'ALL' || filters.productQuery.trim()) &&
      !filteredOrderIds.has(p.preOrderId)
    ) {
      return false;
    }
    const day = toIsoDayFromTimestamp(p.receivedAt || p.createdAt);
    if (dateFrom && day < dateFrom) return false;
    if (dateTo && day > dateTo) return false;
    if (custQ) {
      const hay = `${p.customerName || ''} ${p.customerPhone || ''} ${p.preOrderNumber || ''} ${p.referenceNo || ''}`.toLowerCase();
      if (!hay.includes(custQ)) return false;
    }
    return true;
  });

  let verifiedPaisa = 0;
  let pendingPaisa = 0;
  let refundedPaisa = 0;

  const rows = matching
    .sort((a, b) => (b.receivedAt || b.createdAt) - (a.receivedAt || a.createdAt))
    .map((p) => {
      const amtP = toPaisa(p.amount);
      if (p.status === 'verified') {
        if (p.type === 'refund') refundedPaisa += amtP;
        else if (p.type === 'reversal') {
          if (p.reversedPaymentType === 'refund') refundedPaisa -= amtP;
          else verifiedPaisa -= amtP;
        } else verifiedPaisa += amtP;
      } else if (p.status === 'pending' && p.type !== 'refund' && p.type !== 'reversal') {
        pendingPaisa += amtP;
      }
      return {
        date: toIsoDayFromTimestamp(p.receivedAt || p.createdAt),
        preOrderNumber: p.preOrderNumber || p.preOrderId,
        subBrand: p.subBrand || '—',
        customerName: p.customerName || '—',
        customerPhone: p.customerPhone || '—',
        type: p.type,
        method: p.method,
        status: p.status,
        amount: roundMoney(p.amount),
        referenceNo: p.referenceNo || '—',
        recordedByName: p.recordedByName || '—',
        verifiedByName: p.verifiedByName || '—',
      };
    });

  return {
    columns: [
      { key: 'date', header: 'Date', width: 13 },
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 14 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'customerName', header: 'Customer', width: 20 },
      { key: 'customerPhone', header: 'Phone', width: 15 },
      { key: 'type', header: 'Type', width: 12 },
      { key: 'method', header: 'Method', width: 14 },
      { key: 'status', header: 'Status', width: 11 },
      { key: 'amount', header: 'Amount (৳)', numeric: true, width: 14 },
      { key: 'referenceNo', header: 'Txn / Ref ID', width: 18 },
      { key: 'recordedByName', header: 'Recorded By', width: 16 },
      { key: 'verifiedByName', header: 'Verified By', width: 16 },
    ],
    rows,
    kpis: [
      { label: 'Ledger Entries', value: String(rows.length) },
      { label: 'Verified Collected', value: `৳${fromPaisa(Math.max(0, verifiedPaisa)).toLocaleString()}` },
      { label: 'Pending Approval', value: `৳${fromPaisa(pendingPaisa).toLocaleString()}` },
      { label: 'Verified Refunded', value: `৳${fromPaisa(Math.max(0, refundedPaisa)).toLocaleString()}` },
    ],
  };
}

// ==========================================
// 4. CUSTOMER DUE & AGING REPORT
// ==========================================
export function buildCustomerDueAgingReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const now = Date.now();
  const rows = filteredOrders
    .filter(
      (po) =>
        po.status !== 'Cancelled' &&
        po.status !== 'Refunded' &&
        toPaisa(po.dueAmount) > 0
    )
    .map((po) => {
      const ageDays = Math.max(0, Math.floor((now - (po.createdAt || now)) / 86400000));
      const bucket =
        ageDays <= 7 ? '0–7 days' : ageDays <= 15 ? '8–15 days' : ageDays <= 30 ? '16–30 days' : '30+ days';
      return {
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        customerName: po.customerName,
        customerPhone: po.customerPhone,
        productName: formatPreOrderProductLabel(po),
        status: po.status,
        orderDate: getPreOrderDay(po),
        estimatedDeliveryDate: po.estimatedDeliveryDate || 'TBA',
        ageDays,
        agingBucket: bucket,
        totalAmount: roundMoney(po.totalAmount),
        advancePaid: roundMoney(po.advancePaid),
        pendingAmount: roundMoney(po.pendingAmount),
        dueAmount: roundMoney(po.dueAmount),
      };
    })
    .sort((a, b) => b.dueAmount - a.dueAmount);

  const totalDuePaisa = rows.reduce((s, r) => s + toPaisa(r.dueAmount), 0);
  const thirtyPlusPaisa = rows
    .filter((r) => r.ageDays > 30)
    .reduce((s, r) => s + toPaisa(r.dueAmount), 0);

  return {
    columns: [
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 13 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'customerName', header: 'Customer', width: 20 },
      { key: 'customerPhone', header: 'Phone', width: 14 },
      { key: 'productName', header: 'Product', width: 22 },
      { key: 'status', header: 'Status', width: 18 },
      { key: 'ageDays', header: 'Age (Days)', numeric: true, width: 11 },
      { key: 'agingBucket', header: 'Aging Bucket', width: 13 },
      { key: 'estimatedDeliveryDate', header: 'Expected ETA', width: 13 },
      { key: 'totalAmount', header: 'Order Total (৳)', numeric: true, width: 15 },
      { key: 'advancePaid', header: 'Verified Paid (৳)', numeric: true, width: 16 },
      { key: 'dueAmount', header: 'Due Amount (৳)', numeric: true, width: 15 },
    ],
    rows,
    kpis: [
      { label: 'Orders with Due', value: String(rows.length) },
      { label: 'Total Customer Due', value: `৳${fromPaisa(totalDuePaisa).toLocaleString()}` },
      { label: '30+ Days Overdue Due', value: `৳${fromPaisa(thirtyPlusPaisa).toLocaleString()}` },
    ],
  };
}

// ==========================================
// 5. SUPPLIER PAYMENTS & BALANCES REPORT (requires preOrderSupplier)
// ==========================================
export function buildSupplierPaymentsReport(
  filteredOrders: PreOrder[],
  suppliers: Supplier[],
  supplierPayments: PreOrderSupplierPayment[],
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>
): BuiltReportResult {
  const bySupplier = new Map<
    string,
    {
      supplierId: string;
      supplierName: string;
      platform: string;
      linkedOrders: number;
      activeOrders: number;
      chinaCostTotal: number;
      paidBdt: number;
      payableDue: number;
      lastPaymentDate: string;
    }
  >();

  suppliers.forEach((s) => {
    bySupplier.set(s.id, {
      supplierId: s.id,
      supplierName: s.name,
      platform: s.platform || '—',
      linkedOrders: 0,
      activeOrders: 0,
      chinaCostTotal: 0,
      paidBdt: 0,
      payableDue: 0,
      lastPaymentDate: '—',
    });
  });

  filteredOrders.forEach((po) => {
    if (!po.supplierId) return;
    if (!bySupplier.has(po.supplierId)) {
      bySupplier.set(po.supplierId, {
        supplierId: po.supplierId,
        supplierName: po.supplierName || po.supplierId,
        platform: '—',
        linkedOrders: 0,
        activeOrders: 0,
        chinaCostTotal: 0,
        paidBdt: 0,
        payableDue: 0,
        lastPaymentDate: '—',
      });
    }
    const row = bySupplier.get(po.supplierId)!;
    row.linkedOrders += 1;
    if (po.status !== 'Delivered' && po.status !== 'Cancelled' && po.status !== 'Refunded') {
      row.activeOrders += 1;
    }
    const priv = privateCostsByOrder[po.id];
    if (priv && po.status !== 'Cancelled' && po.status !== 'Refunded') {
      const items = normalizePreOrderItems(po);
      const costMap = computeItemCostMap(po, priv);
      const supCalc = calculatePerOrderSupplierSummary({
        qty: po.totalQty ?? po.qty,
        chinaUnitCost: priv.chinaUnitCost || 0,
        items: items.map((it) => ({
          qty: it.qty,
          chinaUnitCost: costMap[it.itemId]?.chinaUnitCost ?? priv.chinaUnitCost ?? 0,
        })),
        preOrderId: po.id,
        supplierPayments,
      });
      row.chinaCostTotal = fromPaisa(toPaisa(row.chinaCostTotal) + toPaisa(supCalc.chinaCostTotal));
    }
  });

  for (const sp of supplierPayments || []) {
    if (!sp.supplierId) continue;
    const row = bySupplier.get(sp.supplierId);
    if (!row) continue;
    const amtP = toPaisa(sp.amountBdt);
    const nextPaidP = sp.type === 'reversal' ? toPaisa(row.paidBdt) - amtP : toPaisa(row.paidBdt) + amtP;
    row.paidBdt = fromPaisa(Math.max(0, nextPaidP));
    if (sp.date && (row.lastPaymentDate === '—' || sp.date > row.lastPaymentDate)) {
      row.lastPaymentDate = sp.date;
    }
  }

  const rows = Array.from(bySupplier.values())
    .map((r) => ({
      ...r,
      payableDue: fromPaisa(Math.max(0, toPaisa(r.chinaCostTotal) - toPaisa(r.paidBdt))),
    }))
    .filter((r) => r.linkedOrders > 0 || r.paidBdt > 0)
    .sort((a, b) => b.payableDue - a.payableDue || b.paidBdt - a.paidBdt);

  const totalCostP = rows.reduce((s, r) => s + toPaisa(r.chinaCostTotal), 0);
  const totalPaidP = rows.reduce((s, r) => s + toPaisa(r.paidBdt), 0);
  const totalDueP = rows.reduce((s, r) => s + toPaisa(r.payableDue), 0);

  return {
    columns: [
      { key: 'supplierName', header: 'Supplier', requiresSupplier: true, width: 22 },
      { key: 'platform', header: 'Platform', requiresSupplier: true, width: 14 },
      { key: 'linkedOrders', header: 'Linked Orders', numeric: true, requiresSupplier: true, width: 14 },
      { key: 'activeOrders', header: 'Active Orders', numeric: true, requiresSupplier: true, width: 13 },
      { key: 'chinaCostTotal', header: 'Total Purchase (৳)', numeric: true, requiresSupplier: true, width: 18 },
      { key: 'paidBdt', header: 'Paid BDT (৳)', numeric: true, requiresSupplier: true, width: 16 },
      { key: 'payableDue', header: 'Balance Payable (৳)', numeric: true, requiresSupplier: true, width: 18 },
      { key: 'lastPaymentDate', header: 'Last Payment', requiresSupplier: true, width: 14 },
    ],
    rows,
    kpis: [
      { label: 'Active Suppliers', value: String(rows.length), requiresSupplier: true },
      { label: 'Total China Purchase', value: `৳${fromPaisa(totalCostP).toLocaleString()}`, requiresSupplier: true },
      { label: 'Total Disbursed', value: `৳${fromPaisa(totalPaidP).toLocaleString()}`, requiresSupplier: true },
      { label: 'Net Supplier Payable', value: `৳${fromPaisa(totalDueP).toLocaleString()}`, requiresSupplier: true },
    ],
  };
}

// ==========================================
// 6. SHIPPING COST REPORT (ESTIMATED VS ACTUAL) (requires preOrderSupplier)
// ==========================================
export function buildShippingCostReport(
  filteredOrders: PreOrder[],
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>
): BuiltReportResult {
  const rows = filteredOrders.map((po) => {
    const priv = privateCostsByOrder[po.id];
    const exp = priv?.shippingExpenses;
    const estShipping = roundMoney(priv?.shippingCost || 0);
    const intlFreight = roundMoney(exp?.internationalFreight || 0);
    const customsDuty = roundMoney(exp?.customsDuty || 0);
    const localTrans = roundMoney(exp?.localTransport || 0);
    const handling = roundMoney(exp?.handlingOther || 0);
    const actualTotal = roundMoney(
      priv?.actualShippingCost ?? calculateActualShippingCost(exp) ?? 0
    );
    const variance = fromPaisa(toPaisa(actualTotal) - toPaisa(estShipping));

    return {
      preOrderNumber: po.preOrderNumber,
      subBrand: po.subBrand,
      productName: formatPreOrderProductLabel(po),
      qty: po.totalQty ?? po.qty,
      shippingMethod: po.shippingMethod || '—',
      freightForwarder: po.freightForwarder || '—',
      estShipping,
      intlFreight,
      customsDuty,
      localTrans,
      handling,
      actualTotal,
      variance,
      unitLandedCost: roundMoney(po.unitLandedCost || 0),
    };
  });

  const estSumP = rows.reduce((s, r) => s + toPaisa(r.estShipping), 0);
  const actSumP = rows.reduce((s, r) => s + toPaisa(r.actualTotal), 0);
  const customsSumP = rows.reduce((s, r) => s + toPaisa(r.customsDuty), 0);

  return {
    columns: [
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 13 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'productName', header: 'Product', width: 22 },
      { key: 'qty', header: 'Qty', numeric: true, width: 7 },
      { key: 'shippingMethod', header: 'Method', width: 10 },
      { key: 'freightForwarder', header: 'Forwarder', requiresSupplier: true, width: 18 },
      { key: 'estShipping', header: 'Est. Ship (৳)', numeric: true, requiresSupplier: true, width: 14 },
      { key: 'intlFreight', header: 'Int. Freight (৳)', numeric: true, requiresSupplier: true, width: 15 },
      { key: 'customsDuty', header: 'Customs (৳)', numeric: true, requiresSupplier: true, width: 13 },
      { key: 'localTrans', header: 'Local BD (৳)', numeric: true, requiresSupplier: true, width: 13 },
      { key: 'actualTotal', header: 'Actual Total (৳)', numeric: true, requiresSupplier: true, width: 15 },
      { key: 'variance', header: 'Variance (৳)', numeric: true, requiresSupplier: true, width: 14 },
      { key: 'unitLandedCost', header: 'Landed/Unit (৳)', numeric: true, requiresProfit: true, width: 15 },
    ],
    rows,
    kpis: [
      { label: 'Est. Shipping Pool', value: `৳${fromPaisa(estSumP).toLocaleString()}`, requiresSupplier: true },
      { label: 'Actual Logistics Paid', value: `৳${fromPaisa(actSumP).toLocaleString()}`, requiresSupplier: true },
      { label: 'Customs Duty Paid', value: `৳${fromPaisa(customsSumP).toLocaleString()}`, requiresSupplier: true },
      {
        label: 'Net Shipping Variance',
        value: `৳${fromPaisa(actSumP - estSumP).toLocaleString()}`,
        requiresSupplier: true,
      },
    ],
  };
}

// ==========================================
// 7. DELIVERED & CANCELLED SUMMARY
// ==========================================
export function buildDeliveredAndCancelledReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const rows = filteredOrders
    .filter((po) => ['Delivered', 'Cancelled', 'Refunded'].includes(po.status))
    .map((po) => ({
      preOrderNumber: po.preOrderNumber,
      subBrand: po.subBrand,
      customerName: po.customerName,
      customerPhone: po.customerPhone,
      productName: formatPreOrderProductLabel(po),
      qty: po.totalQty ?? po.qty,
      status: po.status,
      totalAmount: roundMoney(po.totalAmount),
      advancePaid: roundMoney(po.advancePaid),
      refundedAmount: roundMoney(po.refundedAmount),
      retainedCharge: roundMoney(po.cancellation?.retainedChargeAmount || 0),
      stockResolution: po.cancellation?.stockResolution || (po.convertedInvoiceNumber ? 'Sold / Invoiced' : '—'),
      invoiceNumber: po.convertedInvoiceNumber || '—',
      reason: po.cancellation?.reason || po.cancellationReason || 'Fulfilled',
      updatedDate: toIsoDayFromTimestamp(po.cancelledAt || po.updatedAt || po.createdAt),
    }));

  const delivered = rows.filter((r) => r.status === 'Delivered');
  const cancelledOrRef = rows.filter((r) => r.status !== 'Delivered');
  const deliveredValP = delivered.reduce((s, r) => s + toPaisa(r.totalAmount), 0);
  const refundedValP = cancelledOrRef.reduce((s, r) => s + toPaisa(r.refundedAmount), 0);
  const retainedValP = cancelledOrRef.reduce((s, r) => s + toPaisa(r.retainedCharge), 0);

  return {
    columns: [
      { key: 'updatedDate', header: 'Closed Date', width: 13 },
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 13 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'customerName', header: 'Customer', width: 19 },
      { key: 'productName', header: 'Product', width: 22 },
      { key: 'status', header: 'Final Status', width: 13 },
      { key: 'totalAmount', header: 'Order Value (৳)', numeric: true, width: 15 },
      { key: 'advancePaid', header: 'Collected (৳)', numeric: true, width: 14 },
      { key: 'refundedAmount', header: 'Refunded (৳)', numeric: true, width: 14 },
      { key: 'retainedCharge', header: 'Retained Fee (৳)', numeric: true, width: 15 },
      { key: 'invoiceNumber', header: 'Invoice #', width: 15 },
      { key: 'reason', header: 'Outcome / Reason', width: 24 },
    ],
    rows,
    kpis: [
      { label: 'Delivered Orders', value: String(delivered.length) },
      { label: 'Delivered Sales Value', value: `৳${fromPaisa(deliveredValP).toLocaleString()}` },
      { label: 'Cancelled / Refunded', value: String(cancelledOrRef.length) },
      { label: 'Total Refunded', value: `৳${fromPaisa(refundedValP).toLocaleString()}` },
      { label: 'Retained Charges', value: `৳${fromPaisa(retainedValP).toLocaleString()}` },
    ],
  };
}

// ==========================================
// 8. PRODUCT-WISE PRE-ORDER DEMAND REPORT
// ==========================================
export function buildProductWiseReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const byProd = new Map<
    string,
    {
      productKey: string;
      productName: string;
      sku: string;
      orderCount: number;
      totalQty: number;
      receivedGoodQty: number;
      damagedQty: number;
      grossValue: number;
      collectedValue: number;
      dueValue: number;
    }
  >();

  const orderSeenByProduct = new Map<string, Set<string>>();

  for (const po of filteredOrders) {
    const items = normalizePreOrderItems(po);
    const isVoid = po.status === 'Cancelled' || po.status === 'Refunded';
    const orderSubtotalP = items.reduce((s, it) => s + Math.max(0, toPaisa(it.lineTotal)), 0);
    const orderAdvP = Math.max(0, toPaisa(po.advancePaid));
    const orderDueP = isVoid ? 0 : Math.max(0, toPaisa(po.dueAmount));

    for (const item of items) {
      const key = (item.sku || item.productName || 'Unnamed Product').trim().toLowerCase();
      if (!byProd.has(key)) {
        byProd.set(key, {
          productKey: key,
          productName: item.productName,
          sku: item.sku || item.model || '—',
          orderCount: 0,
          totalQty: 0,
          receivedGoodQty: 0,
          damagedQty: 0,
          grossValue: 0,
          collectedValue: 0,
          dueValue: 0,
        });
        orderSeenByProduct.set(key, new Set());
      }
      const row = byProd.get(key)!;
      const seenSet = orderSeenByProduct.get(key)!;
      if (!seenSet.has(po.id)) {
        seenSet.add(po.id);
        row.orderCount += 1;
      }

      row.totalQty += Math.max(0, Number(item.qty) || 0);
      row.receivedGoodQty += Math.max(0, Number(item.receivedQty) || 0);
      row.damagedQty += Math.max(0, Number(item.damagedQty) || 0);

      const itemLineP = Math.max(0, toPaisa(item.lineTotal));
      const shareRatio =
        orderSubtotalP > 0 ? itemLineP / orderSubtotalP : 1 / Math.max(1, items.length);

      if (!isVoid) {
        row.grossValue = fromPaisa(toPaisa(row.grossValue) + itemLineP);
        row.dueValue = fromPaisa(toPaisa(row.dueValue) + Math.round(orderDueP * shareRatio));
      }
      row.collectedValue = fromPaisa(toPaisa(row.collectedValue) + Math.round(orderAdvP * shareRatio));
    }
  }

  const rows = Array.from(byProd.values()).sort((a, b) => b.totalQty - a.totalQty || b.grossValue - a.grossValue);
  const totalUnits = rows.reduce((s, r) => s + r.totalQty, 0);

  return {
    columns: [
      { key: 'productName', header: 'Product Name', width: 28 },
      { key: 'sku', header: 'SKU / Model', width: 16 },
      { key: 'orderCount', header: 'Pre-Orders', numeric: true, width: 12 },
      { key: 'totalQty', header: 'Units Ordered', numeric: true, width: 14 },
      { key: 'receivedGoodQty', header: 'Received Good', numeric: true, width: 14 },
      { key: 'damagedQty', header: 'Damaged', numeric: true, width: 11 },
      { key: 'grossValue', header: 'Active Value (৳)', numeric: true, width: 16 },
      { key: 'collectedValue', header: 'Advance Paid (৳)', numeric: true, width: 16 },
      { key: 'dueValue', header: 'Due Balance (৳)', numeric: true, width: 16 },
    ],
    rows,
    kpis: [
      { label: 'Unique Products', value: String(rows.length) },
      { label: 'Total Units Demanded', value: String(totalUnits) },
    ],
  };
}

// ==========================================
// 9. CUSTOMER-WISE PRE-ORDER HISTORY REPORT
// ==========================================
export function buildCustomerWiseReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const byCust = new Map<
    string,
    {
      customerKey: string;
      customerCode: string;
      customerName: string;
      customerPhone: string;
      totalOrders: number;
      activeOrders: number;
      deliveredOrders: number;
      cancelledOrders: number;
      totalValue: number;
      totalAdvance: number;
      totalDue: number;
    }
  >();

  for (const po of filteredOrders) {
    const key = normalizeBdPhone(po.customerPhone) || po.customerId || po.customerName;
    if (!byCust.has(key)) {
      byCust.set(key, {
        customerKey: key,
        customerCode: po.customerCode || '—',
        customerName: po.customerName,
        customerPhone: po.customerPhone,
        totalOrders: 0,
        activeOrders: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        totalValue: 0,
        totalAdvance: 0,
        totalDue: 0,
      });
    }
    const row = byCust.get(key)!;
    const isVoid = po.status === 'Cancelled' || po.status === 'Refunded';
    row.totalOrders += 1;
    if (po.status === 'Delivered') row.deliveredOrders += 1;
    else if (isVoid) row.cancelledOrders += 1;
    else row.activeOrders += 1;

    if (!isVoid) {
      row.totalValue = fromPaisa(toPaisa(row.totalValue) + toPaisa(po.totalAmount));
      row.totalDue = fromPaisa(toPaisa(row.totalDue) + Math.max(0, toPaisa(po.dueAmount)));
    }
    row.totalAdvance = fromPaisa(toPaisa(row.totalAdvance) + toPaisa(po.advancePaid));
  }

  const rows = Array.from(byCust.values()).sort((a, b) => b.totalValue - a.totalValue);
  const repeatCount = rows.filter((r) => r.totalOrders > 1).length;

  return {
    columns: [
      { key: 'customerCode', header: 'Cust. ID', width: 12 },
      { key: 'customerName', header: 'Customer Name', width: 22 },
      { key: 'customerPhone', header: 'Phone', width: 15 },
      { key: 'totalOrders', header: 'Orders', numeric: true, width: 10 },
      { key: 'activeOrders', header: 'Active', numeric: true, width: 10 },
      { key: 'deliveredOrders', header: 'Delivered', numeric: true, width: 11 },
      { key: 'cancelledOrders', header: 'Cancelled', numeric: true, width: 11 },
      { key: 'totalValue', header: 'Total Value (৳)', numeric: true, width: 16 },
      { key: 'totalAdvance', header: 'Paid Advance (৳)', numeric: true, width: 16 },
      { key: 'totalDue', header: 'Active Due (৳)', numeric: true, width: 16 },
    ],
    rows,
    kpis: [
      { label: 'Unique Customers', value: String(rows.length) },
      { label: 'Repeat Pre-Order Customers', value: String(repeatCount) },
    ],
  };
}

// ==========================================
// 10. EXPECTED VS ACTUAL PROFIT REPORT (requires preOrderViewProfit)
// ==========================================
export function buildExpectedVsActualProfitReport(
  filteredOrders: PreOrder[],
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>,
  postings: AccountingPosting[]
): BuiltReportResult {
  const recognizedProfitByOrder = new Map<string, number>();
  (postings || []).forEach((p) => {
    if (!p.preOrderId || !p.profitDelta) return;
    const prev = recognizedProfitByOrder.get(p.preOrderId) || 0;
    recognizedProfitByOrder.set(p.preOrderId, fromPaisa(toPaisa(prev) + toPaisa(p.profitDelta)));
  });

  const rows = filteredOrders.map((po) => {
    const priv = privateCostsByOrder[po.id];
    const items = normalizePreOrderItems(po);
    const costMap = computeItemCostMap(po, priv);
    const itemsWithCosts = items.map((it) => ({
      ...it,
      chinaUnitCost: costMap[it.itemId]?.chinaUnitCost ?? priv?.chinaUnitCost ?? 0,
    }));
    const calc = calculatePreOrderFinancials({
      items: itemsWithCosts,
      qty: po.totalQty ?? po.qty,
      sellingUnitPrice: po.sellingUnitPrice,
      deliveryCharge: po.deliveryCharge,
      discount: po.discount,
      chinaUnitCost: priv?.chinaUnitCost || 0,
      shippingCost: priv?.shippingCost || 0,
    });

    const chinaTotal = fromPaisa(
      itemsWithCosts.reduce(
        (s, it) => s + Math.max(0, Math.round(Number(it.qty) || 0)) * toPaisa(it.chinaUnitCost),
        0
      )
    );
    const estShip = roundMoney(priv?.shippingCost || 0);
    const actShip = roundMoney(
      priv?.actualShippingCost ?? calculateActualShippingCost(priv?.shippingExpenses) ?? 0
    );
    const netRevenue = fromPaisa(toPaisa(po.totalAmount) - toPaisa(po.deliveryCharge));
    const expectedProfit = roundMoney(priv?.expectedProfit ?? calc.expectedProfit);

    const postedProfit = recognizedProfitByOrder.get(po.id);
    const actualProfit =
      postedProfit !== undefined
        ? roundMoney(postedProfit)
        : po.status === 'Cancelled' || po.status === 'Refunded'
        ? 0
        : fromPaisa(toPaisa(netRevenue) - toPaisa(chinaTotal) - toPaisa(actShip > 0 ? actShip : estShip));
    const variance = fromPaisa(toPaisa(actualProfit) - toPaisa(expectedProfit));
    const marginPercent = netRevenue > 0 ? Math.round((actualProfit / netRevenue) * 1000) / 10 : 0;

    return {
      preOrderNumber: po.preOrderNumber,
      subBrand: po.subBrand,
      productName: formatPreOrderProductLabel(po),
      status: po.status,
      netRevenue,
      chinaTotal,
      estShip,
      actShip,
      expectedProfit,
      actualProfit,
      variance,
      marginPercent,
    };
  });

  const expSumP = rows.reduce((s, r) => s + toPaisa(r.expectedProfit), 0);
  const actSumP = rows.reduce((s, r) => s + toPaisa(r.actualProfit), 0);

  return {
    columns: [
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 13 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'productName', header: 'Product', width: 22 },
      { key: 'status', header: 'Status', width: 17 },
      { key: 'netRevenue', header: 'Net Product Rev (৳)', numeric: true, requiresProfit: true, width: 18 },
      { key: 'chinaTotal', header: 'China Cost (৳)', numeric: true, requiresProfit: true, width: 15 },
      { key: 'estShip', header: 'Est. Ship (৳)', numeric: true, requiresProfit: true, width: 13 },
      { key: 'actShip', header: 'Act. Ship (৳)', numeric: true, requiresProfit: true, width: 13 },
      { key: 'expectedProfit', header: 'Expected Profit (৳)', numeric: true, requiresProfit: true, width: 18 },
      { key: 'actualProfit', header: 'Actual/Realized (৳)', numeric: true, requiresProfit: true, width: 18 },
      { key: 'variance', header: 'Variance (৳)', numeric: true, requiresProfit: true, width: 14 },
      { key: 'marginPercent', header: 'Margin (%)', numeric: true, requiresProfit: true, width: 11 },
    ],
    rows,
    kpis: [
      { label: 'Total Expected Profit', value: `৳${fromPaisa(expSumP).toLocaleString()}`, requiresProfit: true },
      { label: 'Total Actual / Est. Realized', value: `৳${fromPaisa(actSumP).toLocaleString()}`, requiresProfit: true },
      { label: 'Net Variance', value: `৳${fromPaisa(actSumP - expSumP).toLocaleString()}`, requiresProfit: true },
    ],
  };
}

// ==========================================
// 11. SHIPMENT DELAY & OVERDUE REPORT
// ==========================================
export function buildDelayReport(filteredOrders: PreOrder[]): BuiltReportResult {
  const today = getTodayIsoDate();
  const rows = filteredOrders
    .filter((po) => {
      const overdue = isPreOrderOverdue(po.estimatedDeliveryDate, po.status, po.stockReceived);
      const flaggedDelay =
        Boolean(po.isDelayed) &&
        !PRE_ORDER_NOT_OVERDUE_STATUSES.includes(po.status);
      return overdue || flaggedDelay;
    })
    .map((po) => {
      const eta = po.estimatedDeliveryDate || '';
      let daysOverdue = 0;
      if (eta && eta < today) {
        const diff = new Date(`${today}T00:00:00Z`).getTime() - new Date(`${eta}T00:00:00Z`).getTime();
        daysOverdue = Math.max(0, Math.round(diff / 86400000));
      }
      return {
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        customerName: po.customerName,
        customerPhone: po.customerPhone,
        productName: formatPreOrderProductLabel(po),
        status: po.status,
        previousEta: po.previousEstimatedArrivalDate || '—',
        currentEta: eta || 'TBA',
        daysOverdue,
        freightForwarder: po.freightForwarder || po.courier || '—',
        trackingNumber: po.trackingNumber || '—',
        dueAmount: roundMoney(po.dueAmount),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    columns: [
      { key: 'preOrderNumber', header: 'Pre-Order #', width: 13 },
      { key: 'subBrand', header: 'Brand', width: 8 },
      { key: 'customerName', header: 'Customer', width: 19 },
      { key: 'customerPhone', header: 'Phone', width: 14 },
      { key: 'productName', header: 'Product', width: 22 },
      { key: 'status', header: 'Stage', width: 18 },
      { key: 'previousEta', header: 'Prev ETA', width: 12 },
      { key: 'currentEta', header: 'Current ETA', width: 12 },
      { key: 'daysOverdue', header: 'Days Late', numeric: true, width: 11 },
      { key: 'freightForwarder', header: 'Forwarder', width: 17 },
      { key: 'trackingNumber', header: 'Tracking No', width: 16 },
      { key: 'dueAmount', header: 'Due (৳)', numeric: true, width: 13 },
    ],
    rows,
    kpis: [
      { label: 'Delayed / Overdue Orders', value: String(rows.length) },
      {
        label: 'Max Days Overdue',
        value: rows.length > 0 ? `${Math.max(...rows.map((r) => r.daysOverdue))}d` : '0d',
      },
    ],
  };
}

// ==========================================
// 12. UNIFIED ACTIVITY & AUDIT HISTORY FEED
// ==========================================
export function buildUnifiedHistoryFeed(
  auditLogs: PreOrderAuditEntry[],
  filters: ReportFilterState,
  allowedOrderIds?: Set<string>
): BuiltReportResult {
  const { dateFrom, dateTo } = resolveReportDateRange(
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo
  );
  const custQ = filters.customerQuery.trim().toLowerCase();
  const prodQ = filters.productQuery.trim().toLowerCase();

  const rows = (auditLogs || [])
    .filter((entry) => {
      if (!entry) return false;
      if (allowedOrderIds && entry.preOrderId && !entry.preOrderId.startsWith('SUPPLIER_') && entry.preOrderId !== 'STATS') {
        // Only filter out restricted orders when user has subBrand restrictions and an active filter set is passed
        if (filters.subBrand !== 'ALL' || filters.statuses.length > 0 || filters.supplierId !== 'ALL') {
          if (!allowedOrderIds.has(entry.preOrderId)) return false;
        }
      }
      const day = toIsoDayFromTimestamp(entry.timestamp);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (custQ) {
        const hay = `${entry.preOrderNumber || ''} ${entry.summary || ''} ${entry.userName || ''} ${entry.action || ''}`.toLowerCase();
        if (!hay.includes(custQ)) return false;
      }
      if (prodQ) {
        const hay = `${entry.summary || ''} ${entry.action || ''}`.toLowerCase();
        if (!hay.includes(prodQ)) return false;
      }
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((entry) => ({
      dateTime: new Date(entry.timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      preOrderNumber: entry.preOrderNumber || entry.preOrderId || '—',
      action: entry.action,
      summary: entry.summary,
      userName: entry.userName || 'System',
      userRole: entry.userRole || '—',
    }));

  return {
    columns: [
      { key: 'dateTime', header: 'Date & Time', width: 20 },
      { key: 'preOrderNumber', header: 'Ref / Order #', width: 15 },
      { key: 'action', header: 'Action', width: 24 },
      { key: 'summary', header: 'Audit Description', width: 42 },
      { key: 'userName', header: 'Actor', width: 18 },
      { key: 'userRole', header: 'Role', width: 12 },
    ],
    rows,
    kpis: [
      { label: 'Audit Events Shown', value: String(rows.length) },
    ],
  };
}
