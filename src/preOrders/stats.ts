import {
  AccountingPosting,
  PreOrder,
  PreOrderNotification,
  PreOrderPayment,
  PreOrderPrivateCost,
  PreOrderSettings,
  PreOrderStats,
  PreOrderStatsRebuildDiff,
  PreOrderStatus,
  PreOrderSupplierPayment,
} from '../types';
import {
  PRE_ORDER_NOT_OVERDUE_STATUSES,
  PRE_ORDER_STATUSES,
  computeItemCostMap,
  formatPreOrderProductLabel,
  getTodayIsoDate,
  isPreOrderOverdue,
  normalizePreOrderItems,
} from './constants';
import { calculatePerOrderSupplierSummary, fromPaisa, roundMoney, toPaisa } from './calculations';

export function createEmptyPreOrderStats(): PreOrderStats {
  const statusCounts = {} as Record<PreOrderStatus, number>;
  PRE_ORDER_STATUSES.forEach((st) => {
    statusCounts[st] = 0;
  });

  return {
    id: 'summary',
    totalOrders: 0,
    activeOrders: 0,
    chinaOrders: 0,
    internationalShipments: 0,
    customsClearance: 0,
    arrivedProducts: 0,
    receivedInStock: 0,
    readyForDelivery: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    refundedOrders: 0,
    convertedOrders: 0,
    overdueOrders: 0,
    totalOrderValue: 0,
    totalAdvanceCollected: 0,
    totalCustomerDue: 0,
    totalRefunded: 0,
    pendingPaymentAmount: 0,
    pendingPaymentCount: 0,
    customerAdvancesLiability: 0,
    supplierPayableEstimate: 0,
    statusCounts,
    subBrandStats: {
      GZ: { count: 0, totalAmount: 0, advancePaid: 0, dueAmount: 0 },
      RTX: { count: 0, totalAmount: 0, advancePaid: 0, dueAmount: 0 },
    },
    lastUpdatedAt: Date.now(),
  };
}

export function isActivePreOrderStatus(status: PreOrderStatus): boolean {
  return status !== 'Delivered' && status !== 'Cancelled' && status !== 'Refunded';
}

export function computePreOrderStatsFromData(params: {
  preOrders: PreOrder[];
  pendingPayments?: PreOrderPayment[];
  supplierPayments?: PreOrderSupplierPayment[];
  privateCostsByOrder?: Record<string, PreOrderPrivateCost | null>;
  postings?: AccountingPosting[];
  rebuiltBy?: string;
}): PreOrderStats {
  const stats = createEmptyPreOrderStats();
  const now = Date.now();

  let totalValuePaisa = 0;
  let totalAdvancePaisa = 0;
  let totalDuePaisa = 0;
  let totalRefundedPaisa = 0;
  let supplierPayablePaisa = 0;

  for (const po of params.preOrders || []) {
    if (!po) continue;
    stats.totalOrders += 1;
    stats.statusCounts[po.status] = (stats.statusCounts[po.status] || 0) + 1;

    if (isActivePreOrderStatus(po.status)) stats.activeOrders += 1;
    if (po.status === 'Ordered from China' || po.status === 'China Warehouse') stats.chinaOrders += 1;
    if (po.status === 'International Shipment') stats.internationalShipments += 1;
    if (po.status === 'Customs Clearance') stats.customsClearance += 1;
    if (po.status === 'Arrived in Bangladesh') stats.arrivedProducts += 1;
    if (po.status === 'Received in Stock') stats.receivedInStock += 1;
    if (po.status === 'Ready for Delivery') stats.readyForDelivery += 1;
    if (po.status === 'Delivered') stats.deliveredOrders += 1;
    if (po.status === 'Cancelled') stats.cancelledOrders += 1;
    if (po.status === 'Refunded') stats.refundedOrders += 1;
    if (po.convertedSaleId || po.convertedOrderId) stats.convertedOrders += 1;
    if (isPreOrderOverdue(po.estimatedDeliveryDate, po.status, po.stockReceived)) {
      stats.overdueOrders += 1;
    }

    const totalPaisa = toPaisa(po.totalAmount);
    const advPaisa = toPaisa(po.advancePaid);
    const refPaisa = toPaisa(po.refundedAmount);
    const duePaisa =
      po.status === 'Cancelled' || po.status === 'Refunded'
        ? 0
        : Math.max(0, toPaisa(po.dueAmount));

    if (po.status !== 'Cancelled' && po.status !== 'Refunded') {
      totalValuePaisa += totalPaisa;
    }
    totalAdvancePaisa += advPaisa;
    totalDuePaisa += duePaisa;
    totalRefundedPaisa += refPaisa;

    const sb = (po.subBrand || 'SAT').trim().toUpperCase() || 'SAT';
    if (!stats.subBrandStats[sb]) {
      stats.subBrandStats[sb] = { count: 0, totalAmount: 0, advancePaid: 0, dueAmount: 0 };
    }
    stats.subBrandStats[sb].count += 1;
    if (po.status !== 'Cancelled' && po.status !== 'Refunded') {
      stats.subBrandStats[sb].totalAmount = fromPaisa(toPaisa(stats.subBrandStats[sb].totalAmount) + totalPaisa);
    }
    stats.subBrandStats[sb].advancePaid = fromPaisa(toPaisa(stats.subBrandStats[sb].advancePaid) + advPaisa);
    stats.subBrandStats[sb].dueAmount = fromPaisa(toPaisa(stats.subBrandStats[sb].dueAmount) + duePaisa);

    // Optional private-cost supplier payable calculation (Admin rebuild only)
    const priv = params.privateCostsByOrder?.[po.id];
    if (priv && po.status !== 'Cancelled' && po.status !== 'Refunded') {
      const items = normalizePreOrderItems(po);
      const costMap = computeItemCostMap(po, priv);
      const supSum = calculatePerOrderSupplierSummary({
        qty: po.totalQty || po.qty,
        chinaUnitCost: priv.chinaUnitCost || 0,
        items: items.map((it) => ({
          qty: it.qty,
          chinaUnitCost: costMap[it.itemId]?.chinaUnitCost ?? priv.chinaUnitCost ?? 0,
        })),
        preOrderId: po.id,
        supplierPayments: params.supplierPayments || [],
      });
      supplierPayablePaisa += toPaisa(supSum.supplierDue);
    }
  }

  let pendingAmountPaisa = 0;
  let pendingCount = 0;
  if (Array.isArray(params.pendingPayments) && params.pendingPayments.length > 0) {
    for (const pay of params.pendingPayments) {
      if (pay.status === 'pending' && pay.type !== 'refund' && pay.type !== 'reversal') {
        pendingCount += 1;
        pendingAmountPaisa += Math.max(0, toPaisa(pay.amount));
      }
    }
  } else {
    for (const po of params.preOrders || []) {
      const pAmtP = Math.max(0, toPaisa(po.pendingAmount));
      if (pAmtP > 0) {
        pendingAmountPaisa += pAmtP;
        pendingCount += 1;
      }
    }
  }

  let customerAdvanceLiabilityPaisa = 0;
  if (Array.isArray(params.postings) && params.postings.length > 0) {
    customerAdvanceLiabilityPaisa = params.postings.reduce(
      (s, pst) => s + toPaisa(pst.customerAdvanceDelta),
      0
    );
  } else {
    // Fallback before postings load: active unconverted orders net advance
    for (const po of params.preOrders || []) {
      if (!po.convertedSaleId && !po.convertedOrderId && po.status !== 'Delivered') {
        customerAdvanceLiabilityPaisa += Math.max(0, toPaisa(po.advancePaid) - toPaisa(po.refundedAmount));
      }
    }
  }

  stats.totalOrderValue = fromPaisa(totalValuePaisa);
  stats.totalAdvanceCollected = fromPaisa(totalAdvancePaisa);
  stats.totalCustomerDue = fromPaisa(totalDuePaisa);
  stats.totalRefunded = fromPaisa(totalRefundedPaisa);
  stats.pendingPaymentAmount = fromPaisa(pendingAmountPaisa);
  stats.pendingPaymentCount = pendingCount;
  stats.customerAdvancesLiability = fromPaisa(Math.max(0, customerAdvanceLiabilityPaisa));
  stats.supplierPayableEstimate = fromPaisa(supplierPayablePaisa);
  stats.lastUpdatedAt = now;
  if (params.rebuiltBy) {
    stats.lastRebuiltAt = now;
    stats.rebuiltBy = params.rebuiltBy;
  }

  return stats;
}

export function diffPreOrderStats(
  before: PreOrderStats | null | undefined,
  after: PreOrderStats
): PreOrderStatsRebuildDiff[] {
  const b = before || createEmptyPreOrderStats();
  const fields: Array<{ key: keyof PreOrderStats; label: string }> = [
    { key: 'totalOrders', label: 'Total Pre-Orders' },
    { key: 'activeOrders', label: 'Active Orders' },
    { key: 'totalAdvanceCollected', label: 'Advance Collected (৳)' },
    { key: 'totalCustomerDue', label: 'Customer Due (৳)' },
    { key: 'pendingPaymentCount', label: 'Pending Payments Count' },
    { key: 'pendingPaymentAmount', label: 'Pending Payments Amount (৳)' },
    { key: 'deliveredOrders', label: 'Delivered Orders' },
    { key: 'cancelledOrders', label: 'Cancelled Orders' },
    { key: 'overdueOrders', label: 'Overdue Orders' },
    { key: 'customerAdvancesLiability', label: 'Customer Advances Liability (৳)' },
  ];

  const diffs: PreOrderStatsRebuildDiff[] = [];
  for (const item of fields) {
    const prevVal = roundMoney(Number(b[item.key] || 0));
    const nextVal = roundMoney(Number(after[item.key] || 0));
    const delta = roundMoney(nextVal - prevVal);
    if (delta !== 0) {
      diffs.push({
        field: String(item.key),
        label: item.label,
        before: prevVal,
        after: nextVal,
        diff: delta,
      });
    }
  }
  return diffs;
}

export interface NeedsAttentionBuckets {
  overdueArrivals: PreOrder[];
  pendingVerifications: PreOrder[];
  duePastDays: PreOrder[];
  refundRequired: PreOrder[];
  arrivedNotReceived: PreOrder[];
  receivedNotDelivered: PreOrder[];
  trackingDisabledOrFailed: PreOrder[];
  totalAlerts: number;
}

function diffDaysFromIso(isoDate: string, todayIso: string): number {
  const a = new Date(`${isoDate}T00:00:00Z`).getTime();
  const b = new Date(`${todayIso}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function computeNeedsAttentionBuckets(
  preOrders: PreOrder[],
  settings: PreOrderSettings,
  todayIso: string = getTodayIsoDate(),
  nowMs: number = Date.now()
): NeedsAttentionBuckets {
  const overdueArrivals: PreOrder[] = [];
  const pendingVerifications: PreOrder[] = [];
  const duePastDays: PreOrder[] = [];
  const refundRequired: PreOrder[] = [];
  const arrivedNotReceived: PreOrder[] = [];
  const receivedNotDelivered: PreOrder[] = [];
  const trackingDisabledOrFailed: PreOrder[] = [];

  const dueThresholdMs = Math.max(1, settings.dueReminderDays || 7) * 86400000;
  const recNotConvThresholdMs = Math.max(1, settings.receivedNotConvertedDays || 3) * 86400000;

  for (const po of preOrders || []) {
    if (!po) continue;
    const isTerminal = po.status === 'Delivered' || po.status === 'Cancelled' || po.status === 'Refunded';

    if (isPreOrderOverdue(po.estimatedDeliveryDate, po.status, po.stockReceived)) {
      overdueArrivals.push(po);
    }

    if (Number(po.pendingAmount || 0) > 0) {
      pendingVerifications.push(po);
    }

    if (!isTerminal && Number(po.dueAmount || 0) > 0 && nowMs - (po.createdAt || nowMs) >= dueThresholdMs) {
      duePastDays.push(po);
    }

    if (po.status === 'Cancelled' && toPaisa(po.advancePaid) - toPaisa(po.refundedAmount) > 0) {
      refundRequired.push(po);
    }

    if (po.status === 'Arrived in Bangladesh' && !po.stockReceived) {
      arrivedNotReceived.push(po);
    }

    if (
      po.stockReceived &&
      !isTerminal &&
      po.stockReceivedAt &&
      nowMs - po.stockReceivedAt >= recNotConvThresholdMs
    ) {
      receivedNotDelivered.push(po);
    }

    if (!isTerminal && (po.trackingEnabled === false || !po.trackingToken)) {
      trackingDisabledOrFailed.push(po);
    }
  }

  return {
    overdueArrivals,
    pendingVerifications,
    duePastDays,
    refundRequired,
    arrivedNotReceived,
    receivedNotDelivered,
    trackingDisabledOrFailed,
    totalAlerts:
      overdueArrivals.length +
      pendingVerifications.length +
      duePastDays.length +
      refundRequired.length +
      arrivedNotReceived.length +
      receivedNotDelivered.length +
      trackingDisabledOrFailed.length,
  };
}

/**
 * Pure deterministic time-based reminder evaluator.
 * Produces one deterministic ID per (preOrderId + reminderType + YYYYMMDD) so client refreshes
 * never create duplicate notifications.
 */
export function evaluateTimeBasedReminderCandidates(
  preOrders: PreOrder[],
  settings: PreOrderSettings,
  todayIso: string = getTodayIsoDate(),
  nowMs: number = Date.now()
): PreOrderNotification[] {
  const dayKey = todayIso.replace(/-/g, '');
  const list: PreOrderNotification[] = [];

  for (const po of preOrders || []) {
    if (!po) continue;
    const isTerminal = po.status === 'Delivered' || po.status === 'Cancelled' || po.status === 'Refunded';
    if (isTerminal) continue;
    const productLabel = formatPreOrderProductLabel(po);

    // 1 & 2 & 3. Arrival soon, arrival today, shipment delay
    if (po.estimatedDeliveryDate && !po.stockReceived && !PRE_ORDER_NOT_OVERDUE_STATUSES.includes(po.status)) {
      const daysUntilArrival = diffDaysFromIso(todayIso, po.estimatedDeliveryDate); // positive = future
      const daysLate = diffDaysFromIso(po.estimatedDeliveryDate, todayIso); // positive = past

      if (settings.enableArrivalTodayReminder && daysUntilArrival === 0) {
        const id = `REM_${po.id}_arrival_today_${dayKey}`;
        list.push({
          id,
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          subBrand: po.subBrand,
          type: 'arrival_today',
          category: 'reminder',
          severity: 'warning',
          title: `Expected Arrival Today · ${po.preOrderNumber}`,
          message: `${productLabel} for ${po.customerName} is scheduled to arrive today (${po.estimatedDeliveryDate}).`,
          targetTab: 'preorder_tracking',
          forRoles: ['superadmin', 'admin', 'manager', 'staff'],
          readBy: [],
          dayKey,
          reminderType: 'arrival_today',
          customerPhone: po.customerPhone,
          customerName: po.customerName,
          dueAmount: po.dueAmount,
          estimatedArrivalDate: po.estimatedDeliveryDate,
          preOrderStatus: po.status,
          createdAt: nowMs,
          createdBy: 'system_reminder',
        });
      } else if (
        settings.enableArrivalSoonReminder &&
        daysUntilArrival > 0 &&
        daysUntilArrival <= settings.arrivalReminderDays
      ) {
        const id = `REM_${po.id}_arrival_soon_${dayKey}`;
        list.push({
          id,
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          subBrand: po.subBrand,
          type: 'arrival_soon',
          category: 'reminder',
          severity: 'info',
          title: `Arrival in ${daysUntilArrival} day(s) · ${po.preOrderNumber}`,
          message: `${productLabel} for ${po.customerName} is expected on ${po.estimatedDeliveryDate}.`,
          targetTab: 'preorder_tracking',
          forRoles: ['superadmin', 'admin', 'manager', 'staff'],
          readBy: [],
          dayKey,
          reminderType: 'arrival_soon',
          customerPhone: po.customerPhone,
          customerName: po.customerName,
          dueAmount: po.dueAmount,
          estimatedArrivalDate: po.estimatedDeliveryDate,
          preOrderStatus: po.status,
          createdAt: nowMs,
          createdBy: 'system_reminder',
        });
      } else if (settings.enableDelayReminder && daysLate > settings.delayGraceDays) {
        const id = `REM_${po.id}_shipment_delayed_${dayKey}`;
        list.push({
          id,
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          subBrand: po.subBrand,
          type: 'shipment_delayed',
          category: 'reminder',
          severity: 'urgent',
          title: `Shipment Delayed (${daysLate}d late) · ${po.preOrderNumber}`,
          message: `${productLabel} (${po.status}) missed ETA ${po.estimatedDeliveryDate}. Notify customer or update ETA.`,
          targetTab: 'preorder_tracking',
          forRoles: ['superadmin', 'admin', 'manager', 'staff'],
          readBy: [],
          dayKey,
          reminderType: 'shipment_delayed',
          customerPhone: po.customerPhone,
          customerName: po.customerName,
          dueAmount: po.dueAmount,
          estimatedArrivalDate: po.estimatedDeliveryDate,
          preOrderStatus: po.status,
          createdAt: nowMs,
          createdBy: 'system_reminder',
        });
      }
    }

    // 4. Due payment reminder
    const ageDays = Math.floor((nowMs - (po.createdAt || nowMs)) / 86400000);
    if (
      settings.enableDueReminder &&
      toPaisa(po.dueAmount) > 0 &&
      (po.status === 'Arrived in Bangladesh' ||
        po.status === 'Received in Stock' ||
        po.status === 'Ready for Delivery' ||
        ageDays >= settings.dueReminderDays)
    ) {
      const id = `REM_${po.id}_due_payment_${dayKey}`;
      list.push({
        id,
        preOrderId: po.id,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        type: 'due_payment_reminder',
        category: 'reminder',
        severity: po.status === 'Ready for Delivery' ? 'urgent' : 'warning',
        title: `Due Payment Reminder · ${po.preOrderNumber}`,
        message: `${po.customerName} has ৳${Number(po.dueAmount || 0).toLocaleString()} remaining due (${po.status}).`,
        targetTab: 'preorder_payments',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        dayKey,
        reminderType: 'due_payment',
        customerPhone: po.customerPhone,
        customerName: po.customerName,
        dueAmount: po.dueAmount,
        estimatedArrivalDate: po.estimatedDeliveryDate,
        preOrderStatus: po.status,
        createdAt: nowMs,
        createdBy: 'system_reminder',
      });
    }

    // 5. Ready for delivery waiting too long
    const lastStageTs = (po as any).lastStatusChangeAt || po.updatedAt || po.createdAt || nowMs;
    const daysAtReady = Math.floor((nowMs - lastStageTs) / 86400000);
    if (
      settings.enableReadyDeliveryReminder &&
      po.status === 'Ready for Delivery' &&
      daysAtReady >= settings.readyWaitingDays
    ) {
      const id = `REM_${po.id}_ready_waiting_${dayKey}`;
      list.push({
        id,
        preOrderId: po.id,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        type: 'ready_for_delivery',
        category: 'reminder',
        severity: 'warning',
        title: `Ready for Delivery Waiting (${daysAtReady}d) · ${po.preOrderNumber}`,
        message: `${productLabel} for ${po.customerName} has been Ready for Delivery for ${daysAtReady} day(s).`,
        targetTab: 'preorder_list',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        dayKey,
        reminderType: 'ready_waiting',
        customerPhone: po.customerPhone,
        customerName: po.customerName,
        dueAmount: po.dueAmount,
        estimatedArrivalDate: po.estimatedDeliveryDate,
        preOrderStatus: po.status,
        createdAt: nowMs,
        createdBy: 'system_reminder',
      });
    }
  }

  return list;
}
