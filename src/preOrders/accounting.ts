import {
  AccountingPosting,
  AccountingPostingType,
  Invoice,
  Order,
  PreOrder,
  PreOrderIntegrityIssue,
  PreOrderIntegrityReport,
  PreOrderPayment,
  PreOrderPrivateCost,
  PreOrderReceipt,
  PreOrderSupplierPayment,
  Product,
} from '../types';
import {
  calculateActualShippingCost,
  calculatePerOrderSupplierSummary,
  calculatePreOrderFinancials,
  fromPaisa,
  isCashDrawerMethod,
  roundMoney,
  toPaisa,
} from './calculations';

export interface PostingActorContext {
  actorId: string;
  actorName: string;
  timestamp?: number;
}

function makeBasePosting(params: {
  id: string;
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  type: AccountingPostingType;
  direction?: 'normal' | 'reversal';
  reversesPostingId?: string;
  sourceDocId?: string;
  method?: string;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  return {
    id: params.id,
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: params.type,
    direction: params.direction || 'normal',
    ...(params.reversesPostingId ? { reversesPostingId: params.reversesPostingId } : {}),
    ...(params.sourceDocId ? { sourceDocId: params.sourceDocId } : {}),
    ...(params.method ? { method: params.method } : {}),
    isCashDrawer: params.method ? isCashDrawerMethod(params.method) : false,
    cashDelta: 0,
    bankMfsDelta: 0,
    customerAdvanceDelta: 0,
    inventoryInTransitDelta: 0,
    inventoryStockDelta: 0,
    salesIncomeDelta: 0,
    cogsDelta: 0,
    profitDelta: 0,
    otherIncomeDelta: 0,
    receivableDelta: 0,
    lossDelta: 0,
    ...(params.note ? { note: params.note } : {}),
    actorId: params.actor.actorId,
    actorName: params.actor.actorName,
    timestamp: params.actor.timestamp || Date.now(),
  };
}

// A1. Verified customer advance / installment / additional payment
export function getAdvanceVerifiedPostingId(preOrderId: string, paymentId: string): string {
  return `po_${preOrderId}_pay_${paymentId}`;
}

export function buildAdvanceVerifiedPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  paymentId: string;
  amount: number;
  method: string;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.amount));
  const isCash = isCashDrawerMethod(params.method);
  const base = makeBasePosting({
    id: getAdvanceVerifiedPostingId(params.preOrderId, params.paymentId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'advance_verified',
    sourceDocId: params.paymentId,
    method: params.method,
    note: params.note || `Verified customer pre-order payment (${params.method})`,
    actor: params.actor,
  });
  return {
    ...base,
    cashDelta: isCash ? amt : 0,
    bankMfsDelta: isCash ? 0 : amt,
    customerAdvanceDelta: amt,
  };
}

// A2. China supplier payment (per allocated pre-order)
export function getSupplierPaymentPostingId(preOrderId: string, supplierPaymentId: string): string {
  return `po_${preOrderId}_suppay_${supplierPaymentId}`;
}

export function buildSupplierPaymentPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  supplierPaymentId: string;
  amountBdt: number;
  method: string;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.amountBdt));
  const isCash = isCashDrawerMethod(params.method);
  const base = makeBasePosting({
    id: getSupplierPaymentPostingId(params.preOrderId, params.supplierPaymentId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'supplier_payment',
    sourceDocId: params.supplierPaymentId,
    method: params.method,
    note: params.note || `Supplier disbursement (${params.method})`,
    actor: params.actor,
  });
  return {
    ...base,
    cashDelta: isCash ? -amt : 0,
    bankMfsDelta: isCash ? 0 : -amt,
    inventoryInTransitDelta: amt,
  };
}

// A3. Shipping & customs expense delta posting
export function getShippingExpensePostingId(preOrderId: string, expenseSeqOrId: string | number): string {
  return `po_${preOrderId}_shipexp_${expenseSeqOrId}`;
}

export function buildShippingExpensePosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  expenseSeqOrId: string | number;
  deltaAmount: number;
  method: string;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const delta = roundMoney(params.deltaAmount);
  const isCash = isCashDrawerMethod(params.method);
  const base = makeBasePosting({
    id: getShippingExpensePostingId(params.preOrderId, params.expenseSeqOrId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'shipping_expense',
    sourceDocId: String(params.expenseSeqOrId),
    method: params.method,
    note: params.note || `Pre-order shipping & customs cost (${params.method})`,
    actor: params.actor,
  });
  return {
    ...base,
    cashDelta: isCash ? -delta : 0,
    bankMfsDelta: isCash ? 0 : -delta,
    inventoryInTransitDelta: delta,
  };
}

// A4. Stock received into warehouse inventory
export function getInventoryReceivedPostingId(preOrderId: string, receiptId: string): string {
  return `po_${preOrderId}_receipt_${receiptId}`;
}

export function buildInventoryReceivedPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  receiptId: string;
  goodLandedCost: number;
  damagedLossCost?: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const good = roundMoney(Math.max(0, params.goodLandedCost));
  const damaged = roundMoney(Math.max(0, params.damagedLossCost || 0));
  const totalOutOfTransit = roundMoney(good + damaged);
  const base = makeBasePosting({
    id: getInventoryReceivedPostingId(params.preOrderId, params.receiptId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'inventory_received',
    sourceDocId: params.receiptId,
    note: params.note || 'Pre-order stock received in warehouse',
    actor: params.actor,
  });
  return {
    ...base,
    inventoryInTransitDelta: -totalOutOfTransit,
    inventoryStockDelta: good,
    lossDelta: damaged,
  };
}

// A5. Convert Pre-Order to Sale & Invoice
export function getConvertToSalePostingId(preOrderId: string): string {
  return `po_${preOrderId}_convert`;
}

export function buildConvertToSalePosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  orderId: string;
  invoiceNumber: string;
  advanceApplied: number;
  totalSaleAmount: number;
  totalLandedCogs: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const advance = roundMoney(Math.max(0, params.advanceApplied));
  const sale = roundMoney(Math.max(0, params.totalSaleAmount));
  const cogs = roundMoney(Math.max(0, params.totalLandedCogs));
  const profit = roundMoney(sale - cogs);
  const base = makeBasePosting({
    id: getConvertToSalePostingId(params.preOrderId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'convert_to_sale',
    sourceDocId: params.orderId,
    note: params.note || `Converted to Sales Order & Invoice ${params.invoiceNumber}`,
    actor: params.actor,
  });
  return {
    ...base,
    customerAdvanceDelta: -advance,
    inventoryStockDelta: -cogs,
    salesIncomeDelta: sale,
    cogsDelta: cogs,
    profitDelta: profit,
  };
}

// A6a. Customer refund on cancelled pre-order
export function getCustomerRefundPostingId(preOrderId: string, paymentId: string): string {
  return `po_${preOrderId}_refund_${paymentId}`;
}

export function buildCustomerRefundPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  paymentId: string;
  refundAmount: number;
  method: string;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.refundAmount));
  const isCash = isCashDrawerMethod(params.method);
  const base = makeBasePosting({
    id: getCustomerRefundPostingId(params.preOrderId, params.paymentId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'customer_refund',
    sourceDocId: params.paymentId,
    method: params.method,
    note: params.note || `Customer refund paid (${params.method})`,
    actor: params.actor,
  });
  return {
    ...base,
    cashDelta: isCash ? -amt : 0,
    bankMfsDelta: isCash ? 0 : -amt,
    customerAdvanceDelta: -amt,
  };
}

// A6b. Retained cancellation charge (forfeited portion of advance)
export function getCancellationChargePostingId(preOrderId: string): string {
  return `po_${preOrderId}_cancel_charge`;
}

export function buildCancellationChargePosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  retainedAmount: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.retainedAmount));
  const base = makeBasePosting({
    id: getCancellationChargePostingId(params.preOrderId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'cancel_charge',
    note: params.note || 'Retained cancellation fee recognized as Other Income',
    actor: params.actor,
  });
  return {
    ...base,
    customerAdvanceDelta: -amt,
    otherIncomeDelta: amt,
  };
}

// A7a. Cancelled Supplier Settlement — Supplier refund agreed (OtherReceivables)
export function getSupplierReceivablePostingId(preOrderId: string, receivableId: string): string {
  return `po_${preOrderId}_suprec_${receivableId}`;
}

export function buildSupplierReceivablePosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  receivableId: string;
  amount: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.amount));
  const base = makeBasePosting({
    id: getSupplierReceivablePostingId(params.preOrderId, params.receivableId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'supplier_refund_receivable',
    sourceDocId: params.receivableId,
    note: params.note || 'Supplier advance reclassified to Other Receivables',
    actor: params.actor,
  });
  return {
    ...base,
    inventoryInTransitDelta: -amt,
    receivableDelta: amt,
  };
}

// A7b. Cancelled Supplier Settlement — Non-recoverable loss (CompanyLosses)
export function getSupplierLossPostingId(preOrderId: string, lossId: string): string {
  return `po_${preOrderId}_suploss_${lossId}`;
}

export function buildSupplierLossPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  lossId: string;
  amount: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.amount));
  const base = makeBasePosting({
    id: getSupplierLossPostingId(params.preOrderId, params.lossId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'supplier_loss',
    sourceDocId: params.lossId,
    note: params.note || 'Cancelled pre-order unrecoverable supplier/shipping loss',
    actor: params.actor,
  });
  return {
    ...base,
    inventoryInTransitDelta: -amt,
    lossDelta: amt,
  };
}

// Received stock released to general inventory on cancel (reclassifies Pre-Order Inventory -> General Inventory)
export function getStockReleasedPostingId(preOrderId: string): string {
  return `po_${preOrderId}_stock_release`;
}

export function buildStockReleasedPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  releasedValue: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.releasedValue));
  const base = makeBasePosting({
    id: getStockReleasedPostingId(params.preOrderId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'stock_released',
    note: params.note || 'Pre-order reserved stock released to general warehouse inventory',
    actor: params.actor,
  });
  return {
    ...base,
    inventoryStockDelta: -amt,
  };
}

// Received stock returned to supplier on cancel (credit pre-order inventory, debit Other Receivables)
export function getStockReturnedSupplierPostingId(preOrderId: string, receivableId: string): string {
  return `po_${preOrderId}_stock_return_${receivableId}`;
}

export function buildStockReturnedSupplierPosting(params: {
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  receivableId: string;
  returnedValue: number;
  note?: string;
  actor: PostingActorContext;
}): AccountingPosting {
  const amt = roundMoney(Math.max(0, params.returnedValue));
  const base = makeBasePosting({
    id: getStockReturnedSupplierPostingId(params.preOrderId, params.receivableId),
    preOrderId: params.preOrderId,
    preOrderNumber: params.preOrderNumber,
    subBrand: params.subBrand,
    type: 'stock_returned_supplier',
    sourceDocId: params.receivableId,
    note: params.note || 'Received pre-order stock returned to supplier (Other Receivables)',
    actor: params.actor,
  });
  return {
    ...base,
    inventoryStockDelta: -amt,
    receivableDelta: amt,
  };
}

// Deterministic reversal posting (negates every delta of original posting)
export function getReversalPostingId(originalPostingId: string, reversalDocId: string): string {
  return `${originalPostingId}_rev_${reversalDocId}`;
}

export function buildReversalPosting(
  original: AccountingPosting,
  reversalDocId: string,
  reason: string,
  actor: PostingActorContext
): AccountingPosting {
  return {
    id: getReversalPostingId(original.id, reversalDocId),
    preOrderId: original.preOrderId,
    preOrderNumber: original.preOrderNumber,
    subBrand: original.subBrand,
    type: 'reversal',
    direction: 'reversal',
    reversesPostingId: original.id,
    sourceDocId: reversalDocId,
    ...(original.method ? { method: original.method } : {}),
    isCashDrawer: Boolean(original.isCashDrawer),
    cashDelta: roundMoney(-(original.cashDelta || 0)),
    bankMfsDelta: roundMoney(-(original.bankMfsDelta || 0)),
    customerAdvanceDelta: roundMoney(-(original.customerAdvanceDelta || 0)),
    inventoryInTransitDelta: roundMoney(-(original.inventoryInTransitDelta || 0)),
    inventoryStockDelta: roundMoney(-(original.inventoryStockDelta || 0)),
    salesIncomeDelta: roundMoney(-(original.salesIncomeDelta || 0)),
    cogsDelta: roundMoney(-(original.cogsDelta || 0)),
    profitDelta: roundMoney(-(original.profitDelta || 0)),
    otherIncomeDelta: roundMoney(-(original.otherIncomeDelta || 0)),
    receivableDelta: roundMoney(-(original.receivableDelta || 0)),
    lossDelta: roundMoney(-(original.lossDelta || 0)),
    note: `Reversal of ${original.id}: ${reason}`,
    actorId: actor.actorId,
    actorName: actor.actorName,
    timestamp: actor.timestamp || Date.now(),
  };
}

export interface PreOrderAccountingSummary {
  // Post-cutoff drawer/cash deltas
  postCutoffCashDelta: number;
  postCutoffBankMfsDelta: number;
  postCutoffOtherIncomeDelta: number;
  todayOtherIncome: number;
  monthOtherIncome: number;
  // All-time position balances
  customerAdvancesLiability: number;
  inventoryInTransit: number;
  preOrderInventoryValue: number;
  recognizedSales: number;
  recognizedCogs: number;
  recognizedProfit: number;
  cancellationIncome: number;
  supplierRefundsReceivable: number;
  cancelledLosses: number;
  totalCashDeltaAllTime: number;
  totalBankMfsDeltaAllTime: number;
  postingCount: number;
}

export function summarizePreOrderAccounting(
  postings: AccountingPosting[],
  cutoffTimestamp: number = 0,
  referenceNow: Date = new Date()
): PreOrderAccountingSummary {
  const todayStr = referenceNow.toISOString().split('T')[0];
  const curYear = referenceNow.getFullYear();
  const curMonth = referenceNow.getMonth();

  let postCutoffCashPaisa = 0;
  let postCutoffBankPaisa = 0;
  let postCutoffOtherIncomePaisa = 0;
  let todayOtherIncomePaisa = 0;
  let monthOtherIncomePaisa = 0;

  let customerAdvancePaisa = 0;
  let inTransitPaisa = 0;
  let invStockPaisa = 0;
  let salesPaisa = 0;
  let cogsPaisa = 0;
  let profitPaisa = 0;
  let otherIncomePaisa = 0;
  let receivablePaisa = 0;
  let lossPaisa = 0;
  let cashAllPaisa = 0;
  let bankAllPaisa = 0;

  for (const p of postings || []) {
    if (!p) continue;
    const ts = Number(p.timestamp) || 0;
    const cashP = toPaisa(p.cashDelta);
    const bankP = toPaisa(p.bankMfsDelta);
    const otherIncP = toPaisa(p.otherIncomeDelta);

    cashAllPaisa += cashP;
    bankAllPaisa += bankP;
    customerAdvancePaisa += toPaisa(p.customerAdvanceDelta);
    inTransitPaisa += toPaisa(p.inventoryInTransitDelta);
    invStockPaisa += toPaisa(p.inventoryStockDelta);
    salesPaisa += toPaisa(p.salesIncomeDelta);
    cogsPaisa += toPaisa(p.cogsDelta);
    profitPaisa += toPaisa(p.profitDelta);
    otherIncomePaisa += otherIncP;
    receivablePaisa += toPaisa(p.receivableDelta);
    lossPaisa += toPaisa(p.lossDelta);

    if (ts >= cutoffTimestamp) {
      postCutoffCashPaisa += cashP;
      postCutoffBankPaisa += bankP;
      postCutoffOtherIncomePaisa += otherIncP;

      if (otherIncP !== 0) {
        const d = new Date(ts);
        if (d.toISOString().split('T')[0] === todayStr || d.toDateString() === referenceNow.toDateString()) {
          todayOtherIncomePaisa += otherIncP;
        }
        if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
          monthOtherIncomePaisa += otherIncP;
        }
      }
    }
  }

  return {
    postCutoffCashDelta: fromPaisa(postCutoffCashPaisa),
    postCutoffBankMfsDelta: fromPaisa(postCutoffBankPaisa),
    postCutoffOtherIncomeDelta: fromPaisa(postCutoffOtherIncomePaisa),
    todayOtherIncome: fromPaisa(todayOtherIncomePaisa),
    monthOtherIncome: fromPaisa(monthOtherIncomePaisa),
    customerAdvancesLiability: fromPaisa(customerAdvancePaisa),
    inventoryInTransit: fromPaisa(inTransitPaisa),
    preOrderInventoryValue: fromPaisa(invStockPaisa),
    recognizedSales: fromPaisa(salesPaisa),
    recognizedCogs: fromPaisa(cogsPaisa),
    recognizedProfit: fromPaisa(profitPaisa),
    cancellationIncome: fromPaisa(otherIncomePaisa),
    supplierRefundsReceivable: fromPaisa(receivablePaisa),
    cancelledLosses: fromPaisa(lossPaisa),
    totalCashDeltaAllTime: fromPaisa(cashAllPaisa),
    totalBankMfsDeltaAllTime: fromPaisa(bankAllPaisa),
    postingCount: (postings || []).length,
  };
}

export interface IntegrityAnalysisInput {
  preOrders: PreOrder[];
  paymentsByPreOrder: Record<string, PreOrderPayment[]>;
  privateCostsByPreOrder: Record<string, PreOrderPrivateCost | null>;
  receiptsByPreOrder: Record<string, PreOrderReceipt[]>;
  supplierPayments: PreOrderSupplierPayment[];
  postings: AccountingPosting[];
  orders: Order[];
  invoices: Invoice[];
  products: Product[];
}

/**
 * Pure read-only reconciliation & integrity analyzer across Pre-Orders, Payment Ledgers,
 * Receipts, Reservations, Sales Orders, Invoices, and AccountingPostings.
 */
export function analyzePreOrderIntegrity(input: IntegrityAnalysisInput): PreOrderIntegrityReport {
  const issues: PreOrderIntegrityIssue[] = [];
  const postingsByOrder = new Map<string, AccountingPosting[]>();
  for (const pst of input.postings || []) {
    if (!pst?.preOrderId) continue;
    const arr = postingsByOrder.get(pst.preOrderId) || [];
    arr.push(pst);
    postingsByOrder.set(pst.preOrderId, arr);
  }

  const ordersById = new Map<string, Order>((input.orders || []).map((o) => [o.id, o]));
  const invoicesById = new Map<string, Invoice>((input.invoices || []).map((inv) => [inv.id, inv]));
  const productsById = new Map<string, Product>((input.products || []).map((p) => [p.id, p]));

  for (const po of input.preOrders || []) {
    const payments = input.paymentsByPreOrder[po.id] || [];
    const priv = input.privateCostsByPreOrder[po.id] || null;
    const receipts = input.receiptsByPreOrder[po.id] || [];
    const poPostings = postingsByOrder.get(po.id) || [];

    const ledgerSummary = calculatePerOrderSummaryForAudit(po, payments);

    // 1. Check cached advancePaid / refundedAmount / dueAmount vs payment ledger (before/including conversion)
    if (Math.abs(toPaisa(po.advancePaid) - toPaisa(ledgerSummary.verifiedCollected)) > 1) {
      issues.push({
        preOrderId: po.id,
        preOrderNumber: po.preOrderNumber,
        severity: 'error',
        code: 'ADVANCE_MISMATCH',
        message: 'Pre-order advancePaid field differs from verified payment ledger sum.',
        expected: ledgerSummary.verifiedCollected,
        actual: po.advancePaid,
      });
    }

    // 2. Check customer advance postings match verified advances/refunds/convert/cancel_charge
    const postingMap = new Map(poPostings.map((p) => [p.id, p]));
    for (const pay of payments) {
      if (pay.status !== 'verified') continue;
      if (pay.type === 'advance' || pay.type === 'installment' || pay.type === 'additional') {
        const expectedId = getAdvanceVerifiedPostingId(po.id, pay.id);
        if (!postingMap.has(expectedId)) {
          issues.push({
            preOrderId: po.id,
            preOrderNumber: po.preOrderNumber,
            severity: 'warning',
            code: 'MISSING_ADVANCE_POSTING',
            message: `Verified customer payment ${pay.id} (${pay.method}) is missing accounting posting ${expectedId}.`,
            expected: expectedId,
            actual: 'missing',
          });
        }
      } else if (pay.type === 'refund') {
        const expectedId = getCustomerRefundPostingId(po.id, pay.id);
        if (!postingMap.has(expectedId)) {
          issues.push({
            preOrderId: po.id,
            preOrderNumber: po.preOrderNumber,
            severity: 'warning',
            code: 'MISSING_REFUND_POSTING',
            message: `Customer refund ${pay.id} is missing accounting posting ${expectedId}.`,
            expected: expectedId,
            actual: 'missing',
          });
        }
      }
    }

    // 3. Conversion links check
    const saleId = po.convertedSaleId || po.convertedOrderId;
    if (saleId) {
      const ord = ordersById.get(saleId);
      if (!ord) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'error',
          code: 'ORPHAN_CONVERTED_ORDER',
          message: `convertedSaleId (${saleId}) does not exist in orders collection.`,
          expected: saleId,
          actual: 'missing',
        });
      }
      if (po.convertedInvoiceId && !invoicesById.has(po.convertedInvoiceId)) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'error',
          code: 'ORPHAN_CONVERTED_INVOICE',
          message: `convertedInvoiceId (${po.convertedInvoiceId}) does not exist in invoices collection.`,
          expected: po.convertedInvoiceId,
          actual: 'missing',
        });
      }
      const convertPostingId = getConvertToSalePostingId(po.id);
      if (!postingMap.has(convertPostingId)) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'warning',
          code: 'MISSING_CONVERT_POSTING',
          message: `Converted pre-order is missing A5 accounting posting ${convertPostingId}.`,
          expected: convertPostingId,
          actual: 'missing',
        });
      }
      const remainingLiability = fromPaisa(
        poPostings.reduce((sum, p) => sum + toPaisa(p.customerAdvanceDelta), 0)
      );
      if (Math.abs(toPaisa(remainingLiability)) > 1) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'warning',
          code: 'UNSETTLED_ADVANCE_AFTER_CONVERT',
          message: 'Converted pre-order still has non-zero Customer Advances liability in postings.',
          expected: 0,
          actual: remainingLiability,
        });
      }
    }

    // 4. Unconverted & uncancelled received stock must have active reservation on linkedProductId
    const receivedGoodQty = receipts.reduce((s, r) => s + (Number(r.receivedQty) || 0), 0);
    if (!saleId && !po.isCancelled && po.status !== 'Cancelled' && po.status !== 'Refunded' && receivedGoodQty > 0) {
      if (!po.linkedProductId) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'error',
          code: 'MISSING_LINKED_PRODUCT',
          message: 'Received stock exists but linkedProductId is missing.',
        });
      } else {
        const prod = productsById.get(po.linkedProductId);
        if (!prod) {
          issues.push({
            preOrderId: po.id,
            preOrderNumber: po.preOrderNumber,
            severity: 'error',
            code: 'MISSING_PRODUCT_DOC',
            message: `Linked product ${po.linkedProductId} not found.`,
          });
        } else {
          const resEntry = (prod.reservedForPreOrders || []).find((r) => r.preOrderId === po.id);
          if (!resEntry || resEntry.qty !== receivedGoodQty) {
            issues.push({
              preOrderId: po.id,
              preOrderNumber: po.preOrderNumber,
              severity: 'warning',
              code: 'RESERVATION_MISMATCH',
              message: `Product reservation for ${po.preOrderNumber} does not match received qty.`,
              expected: receivedGoodQty,
              actual: resEntry?.qty || 0,
            });
          }
          if ((Number(prod.totalStock) || 0) < (Number(prod.reservedQty) || 0)) {
            issues.push({
              preOrderId: po.id,
              preOrderNumber: po.preOrderNumber,
              severity: 'error',
              code: 'RESERVED_EXCEEDS_STOCK',
              message: `Product ${prod.name} reservedQty (${prod.reservedQty}) exceeds totalStock (${prod.totalStock}).`,
              expected: `<= ${prod.totalStock}`,
              actual: prod.reservedQty,
            });
          }
        }
      }
    }

    // 5. Cancelled pre-order check: unresolved customer advance or supplier money
    if ((po.status === 'Cancelled' || po.status === 'Refunded') && !po.cancellation) {
      const supSummary = calculatePerOrderSupplierSummary({
        qty: po.qty,
        chinaUnitCost: priv?.chinaUnitCost || 0,
        preOrderId: po.id,
        supplierPayments: input.supplierPayments || [],
      });
      if (toPaisa(ledgerSummary.verifiedNetPaid) > 0 || toPaisa(supSummary.paidToSupplier) > 0 || receivedGoodQty > 0) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'warning',
          code: 'CANCEL_NEEDS_RECONCILE',
          message: 'Cancelled pre-order has unresolved customer advance, supplier payment, or reserved stock.',
        });
      }
    }

    // 6. Shipping expense postings parity vs actualShippingCost
    if (priv) {
      const actualShip = calculateActualShippingCost(priv.shippingExpenses) || Number(priv.actualShippingCost || 0);
      const postedShip = fromPaisa(
        poPostings
          .filter((p) => p.type === 'shipping_expense')
          .reduce((s, p) => s + toPaisa(p.inventoryInTransitDelta), 0)
      );
      if (Math.abs(toPaisa(actualShip) - toPaisa(postedShip)) > 1) {
        issues.push({
          preOrderId: po.id,
          preOrderNumber: po.preOrderNumber,
          severity: 'warning',
          code: 'SHIPPING_POSTING_MISMATCH',
          message: 'Actual shipping cost does not match posted shipping_expense accounting entries.',
          expected: actualShip,
          actual: postedShip,
        });
      }
    }
  }

  // 7. Global product reservation sanity check
  for (const prod of input.products || []) {
    const varSum = (prod.variants || []).reduce((s, v) => s + Math.max(0, Number(v.reservedQty) || 0), 0);
    const prodRes = Math.max(0, Number(prod.reservedQty) || 0);
    if (varSum !== prodRes) {
      issues.push({
        preOrderId: 'PRODUCT',
        preOrderNumber: prod.sku || prod.id,
        severity: 'error',
        code: 'PRODUCT_VARIANT_RESERVE_DRIFT',
        message: `Product ${prod.name} reservedQty (${prodRes}) != variant reservedQty sum (${varSum}).`,
        expected: varSum,
        actual: prodRes,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    checkedCount: (input.preOrders || []).length,
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues,
    checkedAt: Date.now(),
  };
}

function calculatePerOrderSummaryForAudit(po: PreOrder, payments: PreOrderPayment[]) {
  return calculatePreOrderFinancials({
    qty: po.qty,
    sellingUnitPrice: po.sellingUnitPrice,
    deliveryCharge: po.deliveryCharge,
    discount: po.discount,
    payments,
  });
}
