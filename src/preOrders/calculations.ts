import { PreOrderPayment, PreOrderPaymentState, PreOrderStatus, PreOrderItem } from '../types';
import { PRE_ORDER_ALLOWED_TRANSITIONS } from './constants';

/**
 * Integer-safe currency helpers (convert Taka to integer Paisa = 1/100 BDT)
 * Avoids IEEE-754 floating-point drift during sums/subtractions.
 */
export function toPaisa(amount: number | string | undefined | null): number {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromPaisa(paisa: number): number {
  return Math.round(paisa) / 100;
}

export function roundMoney(amount: number | string | undefined | null): number {
  return fromPaisa(toPaisa(amount));
}

export interface PreOrderCalculationInput {
  items?: PreOrderItem[];
  qty?: number;
  sellingUnitPrice?: number;
  deliveryCharge?: number;
  discount?: number;
  chinaUnitCost?: number;
  shippingCost?: number;
  payments?: Array<Pick<PreOrderPayment, 'type' | 'status' | 'amount' | 'reversedPaymentType'>>;
}

export interface PreOrderFinancialSummary {
  qty: number;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  totalAmount: number;
  verifiedCollected: number;
  verifiedRefunded: number;
  verifiedNetPaid: number;
  pendingCollected: number;
  dueAmount: number;
  expectedProfit: number;
  expectedProfitPercent: number;
}

/**
 * Pure integer-safe Pre-Order financial calculation helper.
 *
 * Formulas:
 *   subtotal              = sum(item.qty * item.sellingUnitPrice)
 *   totalAmount           = subtotal + deliveryCharge - discount
 *   verifiedCollected     = sum(verified non-refund collections) - sum(verified reversals of collections)
 *   verifiedRefunded      = sum(verified refunds) - sum(verified reversals of refunds)
 *   verifiedNetPaid       = verifiedCollected - verifiedRefunded
 *   dueAmount             = totalAmount - verifiedCollected + verifiedRefunded
 *   expectedProfit        = totalAmount - deliveryCharge - sum(item.qty * item.chinaUnitCost) - shippingCost
 *   expectedProfitPercent = netProductRevenue > 0 ? (expectedProfit / netProductRevenue) * 100 : 0
 */
export function calculatePreOrderFinancials(input: PreOrderCalculationInput): PreOrderFinancialSummary {
  let subtotalPaisa = 0;
  let totalChinaCostPaisa = 0;
  let totalQty = 0;

  if (Array.isArray(input.items) && input.items.length > 0) {
    for (const item of input.items) {
      const q = Math.max(0, Math.round(Number(item.qty) || 0));
      const up = Math.max(0, toPaisa(item.sellingUnitPrice));
      const cp = Math.max(0, toPaisa(item.chinaUnitCost));
      subtotalPaisa += q * up;
      totalChinaCostPaisa += q * cp;
      totalQty += q;
    }
  } else {
    totalQty = Math.max(0, Math.round(Number(input.qty) || 0));
    const unitPricePaisa = Math.max(0, toPaisa(input.sellingUnitPrice));
    const chinaCostPaisa = Math.max(0, toPaisa(input.chinaUnitCost));
    subtotalPaisa = totalQty * unitPricePaisa;
    totalChinaCostPaisa = totalQty * chinaCostPaisa;
  }

  const safeQty = totalQty;
  const deliveryPaisa = Math.max(0, toPaisa(input.deliveryCharge));
  const discountPaisa = Math.max(0, toPaisa(input.discount));
  const shippingCostPaisa = Math.max(0, toPaisa(input.shippingCost));

  const totalAmountPaisa = Math.max(0, subtotalPaisa + deliveryPaisa - discountPaisa);

  let verifiedCollectedPaisa = 0;
  let verifiedRefundedPaisa = 0;
  let pendingCollectedPaisa = 0;
  let reversedCollectionPaisa = 0;
  let reversedRefundPaisa = 0;

  for (const p of input.payments || []) {
    const pPaisa = Math.max(0, toPaisa(p.amount));
    if (p.status === 'verified') {
      if (p.type === 'refund') {
        verifiedRefundedPaisa += pPaisa;
      } else if (p.type === 'reversal') {
        if (p.reversedPaymentType === 'refund') {
          reversedRefundPaisa += pPaisa;
        } else {
          reversedCollectionPaisa += pPaisa;
        }
      } else {
        verifiedCollectedPaisa += pPaisa;
      }
    } else if (p.status === 'pending' && p.type !== 'refund' && p.type !== 'reversal') {
      pendingCollectedPaisa += pPaisa;
    }
  }

  verifiedCollectedPaisa = Math.max(0, verifiedCollectedPaisa - reversedCollectionPaisa);
  verifiedRefundedPaisa = Math.max(0, verifiedRefundedPaisa - reversedRefundPaisa);

  const verifiedNetPaidPaisa = verifiedCollectedPaisa - verifiedRefundedPaisa;
  const dueAmountPaisa = totalAmountPaisa - verifiedCollectedPaisa + verifiedRefundedPaisa;

  const netRevenuePaisa = totalAmountPaisa - deliveryPaisa;
  const expectedProfitPaisa =
    netRevenuePaisa - totalChinaCostPaisa - shippingCostPaisa;
  const expectedProfitPercent =
    netRevenuePaisa > 0
      ? Math.round((expectedProfitPaisa / netRevenuePaisa) * 10000) / 100
      : 0;

  return {
    qty: safeQty,
    subtotal: fromPaisa(subtotalPaisa),
    deliveryCharge: fromPaisa(deliveryPaisa),
    discount: fromPaisa(discountPaisa),
    totalAmount: fromPaisa(totalAmountPaisa),
    verifiedCollected: fromPaisa(verifiedCollectedPaisa),
    verifiedRefunded: fromPaisa(verifiedRefundedPaisa),
    verifiedNetPaid: fromPaisa(verifiedNetPaidPaisa),
    pendingCollected: fromPaisa(pendingCollectedPaisa),
    dueAmount: fromPaisa(dueAmountPaisa),
    expectedProfit: fromPaisa(expectedProfitPaisa),
    expectedProfitPercent,
  };
}

/**
 * Default start status rule:
 * - When initial advance > 0 -> "Advance Received"
 * - When initial advance == 0 -> "Order Confirmed"
 */
export function getInitialPreOrderStatus(advanceAmount: number): PreOrderStatus {
  return toPaisa(advanceAmount) > 0 ? 'Advance Received' : 'Order Confirmed';
}

export function derivePreOrderPaymentState(
  totalAmount: number,
  verifiedCollected: number,
  verifiedRefunded: number,
  status?: PreOrderStatus
): PreOrderPaymentState {
  if (status === 'Refunded' || (toPaisa(verifiedRefunded) > 0 && toPaisa(verifiedCollected) <= toPaisa(verifiedRefunded))) {
    return 'refunded';
  }
  const netPaidPaisa = Math.max(0, toPaisa(verifiedCollected) - toPaisa(verifiedRefunded));
  const totalPaisa = Math.max(0, toPaisa(totalAmount));
  if (netPaidPaisa <= 0) return 'unpaid';
  if (netPaidPaisa >= totalPaisa) return 'fully_paid';
  return 'partially_paid';
}

export interface StatusTransitionValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates whether transitioning from `fromStatus` to `toStatus` is permitted.
 * - Rejects transitions to the same status
 * - Enforces PRE_ORDER_ALLOWED_TRANSITIONS map
 * - Requires verifiedRefunded > 0 to transition from 'Cancelled' -> 'Refunded'
 */
export function canTransitionPreOrderStatus(
  fromStatus: PreOrderStatus,
  toStatus: PreOrderStatus,
  _verifiedNetPaid: number = 0,
  verifiedRefunded: number = 0
): StatusTransitionValidation {
  if (fromStatus === toStatus) {
    return { allowed: false, reason: `Pre-order is already in "${toStatus}" status.` };
  }

  const allowedTargets = PRE_ORDER_ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowedTargets.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition pre-order from "${fromStatus}" to "${toStatus}".`,
    };
  }

  if (toStatus === 'Refunded') {
    if (fromStatus !== 'Cancelled') {
      return {
        allowed: false,
        reason: 'Pre-order must be Cancelled before transitioning to Refunded.',
      };
    }
    if (roundMoney(verifiedRefunded) <= 0) {
      return {
        allowed: false,
        reason: 'Record the customer refund in the Payments tab before marking the order as Refunded.',
      };
    }
  }

  return { allowed: true };
}

export interface ShippingExpensesInput {
  internationalFreight?: number;
  customsDuty?: number;
  localTransport?: number;
  handlingOther?: number;
}

export function calculateActualShippingCost(input?: ShippingExpensesInput | null): number {
  if (!input) return 0;
  const sumPaisa =
    Math.max(0, toPaisa(input.internationalFreight)) +
    Math.max(0, toPaisa(input.customsDuty)) +
    Math.max(0, toPaisa(input.localTransport)) +
    Math.max(0, toPaisa(input.handlingOther));
  return fromPaisa(sumPaisa);
}

export interface SupplierPaymentLike {
  id: string;
  type?: 'payment' | 'reversal';
  preOrderId: string;
  allocations?: Array<{ preOrderId: string; amountBdt: number }>;
  amountBdt: number;
  reversesPaymentId?: string;
}

export interface PerOrderSupplierSummary {
  chinaCostTotal: number;
  paidToSupplier: number;
  supplierDue: number;
}

export function calculatePerOrderSupplierSummary(input: {
  qty: number;
  chinaUnitCost: number;
  preOrderId: string;
  supplierPayments: SupplierPaymentLike[];
  items?: Array<{ qty: number; chinaUnitCost?: number }>;
}): PerOrderSupplierSummary {
  let chinaCostTotalPaisa = 0;
  if (Array.isArray(input.items) && input.items.length > 0) {
    for (const item of input.items) {
      const q = Math.max(0, Math.round(Number(item.qty) || 0));
      const cp = Math.max(0, toPaisa(item.chinaUnitCost ?? input.chinaUnitCost));
      chinaCostTotalPaisa += q * cp;
    }
  } else {
    const safeQty = Math.max(0, Math.round(Number(input.qty) || 0));
    const unitCostPaisa = Math.max(0, toPaisa(input.chinaUnitCost));
    chinaCostTotalPaisa = safeQty * unitCostPaisa;
  }

  const extractOrderAllocatedPaisa = (p: SupplierPaymentLike): number => {
    if (Array.isArray(p.allocations) && p.allocations.length > 0) {
      return p.allocations
        .filter((a) => a.preOrderId === input.preOrderId)
        .reduce((acc, a) => acc + Math.max(0, toPaisa(a.amountBdt)), 0);
    }
    return p.preOrderId === input.preOrderId ? Math.max(0, toPaisa(p.amountBdt)) : 0;
  };

  let paidPaisa = 0;
  for (const p of input.supplierPayments || []) {
    const portionPaisa = extractOrderAllocatedPaisa(p);
    if (portionPaisa <= 0) continue;
    if (p.type === 'reversal') {
      paidPaisa -= portionPaisa;
    } else {
      paidPaisa += portionPaisa;
    }
  }

  const netPaidPaisa = Math.max(0, paidPaisa);
  const duePaisa = Math.max(0, chinaCostTotalPaisa - netPaidPaisa);

  return {
    chinaCostTotal: fromPaisa(chinaCostTotalPaisa),
    paidToSupplier: fromPaisa(netPaidPaisa),
    supplierDue: fromPaisa(duePaisa),
  };
}

export function isCashDrawerMethod(method?: string | null): boolean {
  const m = String(method || '').trim().toLowerCase();
  return m === 'cash' || m === 'cash on delivery' || m === 'cod';
}

export interface ShippingAllocationInputItem {
  itemId: string;
  qty: number;
  chinaUnitCost: number;
}

export interface ShippingAllocationResult {
  itemId: string;
  allocatedTotalShipping: number;
  allocatedPerUnitShipping: number;
}

/**
 * Integer-safe largest-remainder shipping allocation across order line items.
 * Weighted by item value (qty * chinaUnitCost), falling back to qty when all weights are zero.
 * Guarantee: sum(allocatedTotalShipping) === roundMoney(totalShippingCost) with zero drift.
 */
export function allocateShippingAcrossItems(
  items: ShippingAllocationInputItem[],
  totalShippingCost: number
): Record<string, ShippingAllocationResult> {
  const result: Record<string, ShippingAllocationResult> = {};
  if (!Array.isArray(items) || items.length === 0) return result;

  const poolPaisa = Math.max(0, toPaisa(totalShippingCost));
  const rawWeights = items.map((item) => {
    const q = Math.max(1, Math.round(Number(item.qty) || 1));
    const c = Math.max(0, toPaisa(item.chinaUnitCost));
    return q * c;
  });
  const useQtyFallback = rawWeights.reduce((a, b) => a + b, 0) <= 0;
  const weights = items.map((item, idx) =>
    useQtyFallback ? Math.max(1, Math.round(Number(item.qty) || 1)) : rawWeights[idx]
  );
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  if (totalWeight <= 0 || poolPaisa === 0) {
    for (const item of items) {
      result[item.itemId] = {
        itemId: item.itemId,
        allocatedTotalShipping: 0,
        allocatedPerUnitShipping: 0,
      };
    }
    return result;
  }

  const exactShares = weights.map((w) => (poolPaisa * w) / totalWeight);
  const floors = exactShares.map((s) => Math.floor(s));
  const remainders = exactShares.map((s, idx) => ({ idx, rem: s - floors[idx] }));
  let remainingPaisa = poolPaisa - floors.reduce((a, b) => a + b, 0);

  remainders.sort((a, b) => {
    if (b.rem !== a.rem) return b.rem - a.rem;
    return a.idx - b.idx;
  });

  for (let i = 0; i < remainingPaisa; i++) {
    floors[remainders[i % remainders.length].idx] += 1;
  }

  items.forEach((item, idx) => {
    const q = Math.max(1, Math.round(Number(item.qty) || 1));
    const totalShipPaisa = floors[idx];
    const perUnitShipPaisa = Math.round(totalShipPaisa / q);
    result[item.itemId] = {
      itemId: item.itemId,
      allocatedTotalShipping: fromPaisa(totalShipPaisa),
      allocatedPerUnitShipping: fromPaisa(perUnitShipPaisa),
    };
  });

  return result;
}

export interface ReceiptLandedCostInput {
  orderedQty: number;
  receivedGoodQty: number;
  damagedQty: number;
  chinaUnitCost: number;
  actualShippingCost?: number;
  estimatedShippingCost?: number;
  alreadyAllocatedShippingCost?: number;
}

export interface ReceiptLandedCostResult {
  totalUnitsThisReceipt: number;
  chinaUnitCost: number;
  totalShippingPool: number;
  shippingCostPerUnit: number;
  shippingCostPortion: number;
  unitLandedCost: number;
  totalGoodLandedCost: number;
  damagedCostLoss: number;
}

/**
 * Pure integer-safe landed cost breakdown for partial or full pre-order stock receipts.
 * Uses actualShippingCost when > 0, otherwise falls back to estimatedShippingCost.
 */
export function calculatePreOrderReceiptCost(input: ReceiptLandedCostInput): ReceiptLandedCostResult {
  const orderedQty = Math.max(1, Math.round(Number(input.orderedQty) || 1));
  const goodQty = Math.max(0, Math.round(Number(input.receivedGoodQty) || 0));
  const damagedQty = Math.max(0, Math.round(Number(input.damagedQty) || 0));
  const totalUnits = goodQty + damagedQty;

  const chinaUnitPaisa = Math.max(0, toPaisa(input.chinaUnitCost));
  const actualShipPaisa = Math.max(0, toPaisa(input.actualShippingCost));
  const estShipPaisa = Math.max(0, toPaisa(input.estimatedShippingCost));
  const totalShippingPoolPaisa = actualShipPaisa > 0 ? actualShipPaisa : estShipPaisa;

  const shippingPerUnitPaisa = Math.round(totalShippingPoolPaisa / orderedQty);
  const unitLandedPaisa = chinaUnitPaisa + shippingPerUnitPaisa;
  const totalGoodLandedPaisa = goodQty * unitLandedPaisa;
  const damagedLossPaisa = damagedQty * unitLandedPaisa;
  const shippingPortionPaisa = totalUnits * shippingPerUnitPaisa;

  return {
    totalUnitsThisReceipt: totalUnits,
    chinaUnitCost: fromPaisa(chinaUnitPaisa),
    totalShippingPool: fromPaisa(totalShippingPoolPaisa),
    shippingCostPerUnit: fromPaisa(shippingPerUnitPaisa),
    shippingCostPortion: fromPaisa(shippingPortionPaisa),
    unitLandedCost: fromPaisa(unitLandedPaisa),
    totalGoodLandedCost: fromPaisa(totalGoodLandedPaisa),
    damagedCostLoss: fromPaisa(damagedLossPaisa),
  };
}

export interface MultiItemReceiptLineInput {
  itemId: string;
  orderedQty: number;
  receivedGoodQty: number;
  damagedQty: number;
  chinaUnitCost: number;
}

export interface MultiItemReceiptLineResult extends ReceiptLandedCostResult {
  itemId: string;
  allocatedOrderShippingTotal: number;
}

export interface MultiItemReceiptCostSummary {
  totalShippingPool: number;
  totalGoodQty: number;
  totalDamagedQty: number;
  totalGoodLandedCost: number;
  totalDamagedCostLoss: number;
  totalShippingPortion: number;
  byItemId: Record<string, MultiItemReceiptLineResult>;
}

export function calculateMultiItemReceiptCosts(input: {
  allItems: ShippingAllocationInputItem[];
  receiptLines: MultiItemReceiptLineInput[];
  actualShippingCost?: number;
  estimatedShippingCost?: number;
}): MultiItemReceiptCostSummary {
  const actualShipPaisa = Math.max(0, toPaisa(input.actualShippingCost));
  const estShipPaisa = Math.max(0, toPaisa(input.estimatedShippingCost));
  const totalShippingPool = fromPaisa(actualShipPaisa > 0 ? actualShipPaisa : estShipPaisa);

  const allocations = allocateShippingAcrossItems(input.allItems, totalShippingPool);
  const byItemId: Record<string, MultiItemReceiptLineResult> = {};

  let totalGoodQty = 0;
  let totalDamagedQty = 0;
  let totalGoodLandedPaisa = 0;
  let totalDamagedLossPaisa = 0;
  let totalShippingPortionPaisa = 0;

  for (const line of input.receiptLines) {
    const alloc = allocations[line.itemId]?.allocatedTotalShipping ?? 0;
    const single = calculatePreOrderReceiptCost({
      orderedQty: line.orderedQty,
      receivedGoodQty: line.receivedGoodQty,
      damagedQty: line.damagedQty,
      chinaUnitCost: line.chinaUnitCost,
      actualShippingCost: alloc,
      estimatedShippingCost: alloc,
    });
    byItemId[line.itemId] = {
      ...single,
      itemId: line.itemId,
      allocatedOrderShippingTotal: alloc,
    };
    totalGoodQty += Math.max(0, Math.round(Number(line.receivedGoodQty) || 0));
    totalDamagedQty += Math.max(0, Math.round(Number(line.damagedQty) || 0));
    totalGoodLandedPaisa += toPaisa(single.totalGoodLandedCost);
    totalDamagedLossPaisa += toPaisa(single.damagedCostLoss);
    totalShippingPortionPaisa += toPaisa(single.shippingCostPortion);
  }

  return {
    totalShippingPool,
    totalGoodQty,
    totalDamagedQty,
    totalGoodLandedCost: fromPaisa(totalGoodLandedPaisa),
    totalDamagedCostLoss: fromPaisa(totalDamagedLossPaisa),
    totalShippingPortion: fromPaisa(totalShippingPortionPaisa),
    byItemId,
  };
}

export interface SaleConversionItemBreakdown {
  itemId: string;
  qty: number;
  sellingUnitPrice: number;
  lineTotal: number;
  unitCostPrice: number;
  lineCogs: number;
}

export interface SaleConversionBreakdown {
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  totalAmount: number;
  advanceApplied: number;
  remainingDue: number;
  unitCostPrice: number;
  totalCogs: number;
  recognizedProfit: number;
  itemBreakdowns?: SaleConversionItemBreakdown[];
}

export function calculateSaleConversionBreakdown(input: {
  items?: PreOrderItem[];
  qty: number;
  sellingUnitPrice: number;
  deliveryCharge?: number;
  discount?: number;
  verifiedNetPaid: number;
  unitLandedCost?: number;
  unitLandedCostsByItemId?: Record<string, number>;
  itemChinaCostsByItemId?: Record<string, number>;
  fallbackChinaUnitCost?: number;
  fallbackShippingCost?: number;
}): SaleConversionBreakdown {
  const hasItems = Array.isArray(input.items) && input.items.length > 0;
  const fallbackShipTotal = Math.max(0, Number(input.fallbackShippingCost) || 0);

  if (hasItems) {
    const lineItems = input.items!;
    const shippingAllocs = allocateShippingAcrossItems(
      lineItems.map((it) => ({
        itemId: it.itemId,
        qty: Math.max(0, Math.round(Number(it.qty) || 0)),
        chinaUnitCost:
          input.itemChinaCostsByItemId?.[it.itemId] ??
          it.chinaUnitCost ??
          input.fallbackChinaUnitCost ??
          0,
      })),
      fallbackShipTotal
    );

    let subtotalPaisa = 0;
    let totalCogsPaisa = 0;
    let totalQty = 0;
    const itemBreakdowns: SaleConversionItemBreakdown[] = [];

    for (const it of lineItems) {
      const q = Math.max(0, Math.round(Number(it.qty) || 0));
      const spPaisa = Math.max(0, toPaisa(it.sellingUnitPrice));
      const lineTotalPaisa = q * spPaisa;
      subtotalPaisa += lineTotalPaisa;
      totalQty += q;

      const explicitUnitLanded =
        input.unitLandedCostsByItemId?.[it.itemId] ?? it.unitLandedCost ?? 0;
      const explicitUnitLandedPaisa = Math.max(0, toPaisa(explicitUnitLanded));
      const itemChinaPaisa = Math.max(
        0,
        toPaisa(
          input.itemChinaCostsByItemId?.[it.itemId] ??
            it.chinaUnitCost ??
            input.fallbackChinaUnitCost ??
            0
        )
      );
      const itemShipPerUnitPaisa = Math.max(
        0,
        toPaisa(shippingAllocs[it.itemId]?.allocatedPerUnitShipping ?? 0)
      );
      const unitCostPaisa =
        explicitUnitLandedPaisa > 0
          ? explicitUnitLandedPaisa
          : itemChinaPaisa + itemShipPerUnitPaisa;

      const lineCogsPaisa = unitCostPaisa * q;
      totalCogsPaisa += lineCogsPaisa;

      itemBreakdowns.push({
        itemId: it.itemId,
        qty: q,
        sellingUnitPrice: fromPaisa(spPaisa),
        lineTotal: fromPaisa(lineTotalPaisa),
        unitCostPrice: fromPaisa(unitCostPaisa),
        lineCogs: fromPaisa(lineCogsPaisa),
      });
    }

    const deliveryPaisa = Math.max(0, toPaisa(input.deliveryCharge));
    const discountPaisa = Math.max(0, toPaisa(input.discount));
    const totalAmountPaisa = Math.max(0, subtotalPaisa + deliveryPaisa - discountPaisa);
    const paidPaisa = Math.min(totalAmountPaisa, Math.max(0, toPaisa(input.verifiedNetPaid)));
    const remainingDuePaisa = Math.max(0, totalAmountPaisa - paidPaisa);
    const profitPaisa = totalAmountPaisa - totalCogsPaisa;
    const avgUnitCostPaisa = totalQty > 0 ? Math.round(totalCogsPaisa / totalQty) : 0;

    return {
      subtotal: fromPaisa(subtotalPaisa),
      deliveryCharge: fromPaisa(deliveryPaisa),
      discount: fromPaisa(discountPaisa),
      totalAmount: fromPaisa(totalAmountPaisa),
      advanceApplied: fromPaisa(paidPaisa),
      remainingDue: fromPaisa(remainingDuePaisa),
      unitCostPrice: fromPaisa(avgUnitCostPaisa),
      totalCogs: fromPaisa(totalCogsPaisa),
      recognizedProfit: fromPaisa(profitPaisa),
      itemBreakdowns,
    };
  }

  const summary = calculatePreOrderFinancials({
    qty: input.qty,
    sellingUnitPrice: input.sellingUnitPrice,
    deliveryCharge: input.deliveryCharge,
    discount: input.discount,
  });

  const safeQty = Math.max(1, summary.qty || 1);
  const explicitUnitLandedPaisa = Math.max(0, toPaisa(input.unitLandedCost));
  const fallbackUnitPaisa =
    Math.max(0, toPaisa(input.fallbackChinaUnitCost)) +
    Math.round(Math.max(0, toPaisa(input.fallbackShippingCost)) / safeQty);
  const unitCostPaisa = explicitUnitLandedPaisa > 0 ? explicitUnitLandedPaisa : fallbackUnitPaisa;

  const totalCogsPaisa = unitCostPaisa * safeQty;
  const totalAmountPaisa = toPaisa(summary.totalAmount);
  const paidPaisa = Math.min(totalAmountPaisa, Math.max(0, toPaisa(input.verifiedNetPaid)));
  const remainingDuePaisa = Math.max(0, totalAmountPaisa - paidPaisa);
  const profitPaisa = totalAmountPaisa - totalCogsPaisa;

  return {
    subtotal: summary.subtotal,
    deliveryCharge: summary.deliveryCharge,
    discount: summary.discount,
    totalAmount: summary.totalAmount,
    advanceApplied: fromPaisa(paidPaisa),
    remainingDue: fromPaisa(remainingDuePaisa),
    unitCostPrice: fromPaisa(unitCostPaisa),
    totalCogs: fromPaisa(totalCogsPaisa),
    recognizedProfit: fromPaisa(profitPaisa),
  };
}



