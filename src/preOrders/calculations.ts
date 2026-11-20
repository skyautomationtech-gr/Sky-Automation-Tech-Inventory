import { PreOrderPayment, PreOrderPaymentState, PreOrderStatus } from '../types';
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
  qty: number;
  sellingUnitPrice: number;
  deliveryCharge?: number;
  discount?: number;
  chinaUnitCost?: number;
  shippingCost?: number;
  payments?: Array<Pick<PreOrderPayment, 'type' | 'status' | 'amount'>>;
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
 *   subtotal              = sellingUnitPrice * qty
 *   totalAmount           = subtotal + deliveryCharge - discount
 *   verifiedCollected     = sum(payments where status === 'verified' && type in ['advance','installment','additional'])
 *   verifiedRefunded      = sum(payments where status === 'verified' && type === 'refund')
 *   verifiedNetPaid       = verifiedCollected - verifiedRefunded
 *   dueAmount             = totalAmount - verifiedCollected + verifiedRefunded
 *   expectedProfit        = totalAmount - deliveryCharge - (chinaUnitCost * qty) - shippingCost
 *   expectedProfitPercent = netProductRevenue > 0 ? (expectedProfit / netProductRevenue) * 100 : 0
 */
export function calculatePreOrderFinancials(input: PreOrderCalculationInput): PreOrderFinancialSummary {
  const safeQty = Math.max(0, Math.round(Number(input.qty) || 0));
  const unitPricePaisa = Math.max(0, toPaisa(input.sellingUnitPrice));
  const deliveryPaisa = Math.max(0, toPaisa(input.deliveryCharge));
  const discountPaisa = Math.max(0, toPaisa(input.discount));
  const chinaCostPaisa = Math.max(0, toPaisa(input.chinaUnitCost));
  const shippingCostPaisa = Math.max(0, toPaisa(input.shippingCost));

  const subtotalPaisa = safeQty * unitPricePaisa;
  const totalAmountPaisa = Math.max(0, subtotalPaisa + deliveryPaisa - discountPaisa);

  let verifiedCollectedPaisa = 0;
  let verifiedRefundedPaisa = 0;
  let pendingCollectedPaisa = 0;

  for (const p of input.payments || []) {
    const pPaisa = Math.max(0, toPaisa(p.amount));
    if (p.status === 'verified') {
      if (p.type === 'refund') {
        verifiedRefundedPaisa += pPaisa;
      } else {
        verifiedCollectedPaisa += pPaisa;
      }
    } else if (p.status === 'pending' && p.type !== 'refund') {
      pendingCollectedPaisa += pPaisa;
    }
  }

  const verifiedNetPaidPaisa = verifiedCollectedPaisa - verifiedRefundedPaisa;
  const dueAmountPaisa = totalAmountPaisa - verifiedCollectedPaisa + verifiedRefundedPaisa;

  const totalChinaCostPaisa = safeQty * chinaCostPaisa;
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
 * - Requires verifiedNetPaid > 0 to transition from 'Cancelled' -> 'Refunded'
 */
export function canTransitionPreOrderStatus(
  fromStatus: PreOrderStatus,
  toStatus: PreOrderStatus,
  verifiedNetPaid: number = 0
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
    if (roundMoney(verifiedNetPaid) <= 0) {
      return {
        allowed: false,
        reason: 'Refunded status requires a verified net paid balance greater than zero.',
      };
    }
  }

  return { allowed: true };
}
