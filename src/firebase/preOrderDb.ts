import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  arrayUnion,
  onSnapshot,
  DocumentData,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase/firestore';
import { auth, db } from './config';
import {
  computeAvailableStockStatus,
  dbCache,
  getCompanySettings,
  getProducts,
  getUniqueBarcodeValue,
  localStore,
  sanitizeData,
} from './db';
import {
  AccountingPosting,
  CancelCustomerResolution,
  CancelStockResolution,
  CancelSupplierResolution,
  CompanyLoss,
  CompanySettings,
  Customer,
  Invoice,
  Order,
  OrderItem,
  OrderPaymentHistory,
  OtherReceivable,
  PreOrder,
  PreOrderAuditAction,
  PreOrderAuditEntry,
  PreOrderCancellationItemSummary,
  PreOrderCancellationSummary,
  PreOrderConversionLock,
  PreOrderCustomsStatus,
  PreOrderIntegrityReport,
  PreOrderItem,
  PreOrderNotification,
  PreOrderPayment,
  PreOrderPaymentMethod,
  PreOrderPaymentState,
  PreOrderPaymentStatus,
  PreOrderPaymentType,
  PreOrderPrivateCost,
  PreOrderPrivateItemCost,
  PreOrderReceipt,
  PreOrderReceiptItemBreakdown,
  PreOrderSettings,
  PreOrderShipment,
  PreOrderShipmentDoc,
  PreOrderShipmentEvent,
  PreOrderShippingExpensesBreakdown,
  PreOrderShippingMethod,
  PreOrderStats,
  PreOrderStatsRebuildDiff,
  PreOrderStatus,
  PreOrderStatusHistory,
  PreOrderSupplierPayment,
  PreOrderSupplierPaymentAllocation,
  PreOrderTrackingHistoryItem,
  Product,
  ProductPreOrderReservation,
  PublicTrackingRecord,
  RolePermissionsMap,
  StockLog,
  Supplier,
  UserProfile,
  Variant,
} from '../types';
import {
  calculateActualShippingCost,
  calculateMultiItemReceiptCosts,
  calculatePerOrderSupplierSummary,
  calculatePreOrderFinancials,
  calculatePreOrderReceiptCost,
  calculateSaleConversionBreakdown,
  canTransitionPreOrderStatus,
  derivePreOrderPaymentState,
  fromPaisa,
  getInitialPreOrderStatus,
  roundMoney,
  toPaisa,
} from '../preOrders/calculations';
import {
  analyzePreOrderIntegrity,
  buildAdvanceVerifiedPosting,
  buildCancellationChargePosting,
  buildConvertToSalePosting,
  buildCustomerRefundPosting,
  buildInventoryReceivedPosting,
  buildReversalPosting,
  buildShippingExpensePosting,
  buildStockReleasedPosting,
  buildStockReturnedSupplierPosting,
  buildSupplierLossPosting,
  buildSupplierPaymentPosting,
  buildSupplierReceivablePosting,
  getAdvanceVerifiedPostingId,
  getConvertToSalePostingId,
  getCustomerRefundPostingId,
  getSupplierPaymentPostingId,
} from '../preOrders/accounting';
import {
  MAX_PRE_ORDER_ITEMS,
  PRE_ORDER_EDIT_LOCKED_STATUSES,
  PRE_ORDER_FORWARD_FLOW,
  PRE_ORDER_LOCKED_PART6_STATUS,
  buildPreOrderSearchKeywords,
  computeItemCostMap,
  formatPreOrderProductLabel,
  getTodayIsoDate,
  isPreOrderAdminRole,
  isPreOrderOverdue,
  isValidBdPhone,
  mergeWithDefaultRolePermissions,
  normalizeBdPhone,
  normalizePreOrderItems,
  sanitizePreOrderItemsForDoc,
  summarizePreOrderItemsLegacyFields,
} from '../preOrders/constants';
import {
  DEFAULT_TRACKING_AUTO_EXPIRY_DAYS,
  buildDisabledPublicTrackingDoc,
  buildWhitelistedPublicTrackingDoc,
  generateSecureTrackingToken,
  isSafeTrackingTokenFormat,
} from '../preOrders/tracking';
import {
  computePreOrderStatsFromData,
  createEmptyPreOrderStats,
  diffPreOrderStats,
  evaluateTimeBasedReminderCandidates,
  isActivePreOrderStatus,
} from '../preOrders/stats';
import {
  DEFAULT_PRE_ORDER_SETTINGS,
  mergeWithDefaultPreOrderSettings,
} from '../preOrders/templates';

export interface PreOrderActor {
  id: string;
  name: string;
  role: string;
}

export function actorFromUser(user: UserProfile | null | undefined): PreOrderActor {
  return {
    id: user?.id || 'system',
    name: user?.name || 'System Operator',
    role: user?.role || 'staff',
  };
}

function isAdminRole(role?: string): boolean {
  return role === 'superadmin' || role === 'super_admin' || role === 'admin';
}

function generateId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).substring(2, 12);
  return `${prefix}_${Date.now()}_${rand}`;
}

function generateTrackingToken(): string {
  return generateSecureTrackingToken();
}

function sanitizeIdFragment(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
}

export function maskPhoneNumber(phone?: string): string {
  if (!phone) return '';
  const cleaned = phone.trim();
  if (cleaned.length <= 5) return '***';
  return `${cleaned.slice(0, 3)}****${cleaned.slice(-3)}`;
}

function withNormalizedPreOrderItems(po: PreOrder): PreOrder {
  const items = normalizePreOrderItems(po);
  return {
    ...po,
    items,
    itemCount: po.itemCount ?? items.length,
    totalQty: po.totalQty ?? items.reduce((s, it) => s + (Number(it.qty) || 0), 0),
  };
}

// ==========================================
// TRANSACTIONAL PRE-ORDER STATS & EVENT NOTIFICATIONS
// ==========================================

function applyOrderSnapshotContribution(stats: PreOrderStats, po: PreOrder, dir: 1 | -1): void {
  const isVoid = po.status === 'Cancelled' || po.status === 'Refunded';
  const totalP = isVoid ? 0 : toPaisa(po.totalAmount);
  const advP = toPaisa(po.advancePaid);
  const dueP = isVoid ? 0 : Math.max(0, toPaisa(po.dueAmount));
  const refP = toPaisa(po.refundedAmount);

  stats.totalOrders = Math.max(0, stats.totalOrders + dir);
  if (po.status) {
    stats.statusCounts[po.status] = Math.max(0, (stats.statusCounts[po.status] || 0) + dir);
  }
  if (isActivePreOrderStatus(po.status)) stats.activeOrders = Math.max(0, stats.activeOrders + dir);
  if (po.status === 'Ordered from China' || po.status === 'China Warehouse') {
    stats.chinaOrders = Math.max(0, stats.chinaOrders + dir);
  }
  if (po.status === 'International Shipment') {
    stats.internationalShipments = Math.max(0, stats.internationalShipments + dir);
  }
  if (po.status === 'Customs Clearance') {
    stats.customsClearance = Math.max(0, stats.customsClearance + dir);
  }
  if (po.status === 'Arrived in Bangladesh') {
    stats.arrivedProducts = Math.max(0, stats.arrivedProducts + dir);
  }
  if (po.status === 'Received in Stock') {
    stats.receivedInStock = Math.max(0, stats.receivedInStock + dir);
  }
  if (po.status === 'Ready for Delivery') {
    stats.readyForDelivery = Math.max(0, stats.readyForDelivery + dir);
  }
  if (po.status === 'Delivered') stats.deliveredOrders = Math.max(0, stats.deliveredOrders + dir);
  if (po.status === 'Cancelled') stats.cancelledOrders = Math.max(0, stats.cancelledOrders + dir);
  if (po.status === 'Refunded') stats.refundedOrders = Math.max(0, stats.refundedOrders + dir);
  if (po.convertedSaleId || po.convertedOrderId) {
    stats.convertedOrders = Math.max(0, stats.convertedOrders + dir);
  }
  if (isPreOrderOverdue(po.estimatedDeliveryDate, po.status, po.stockReceived)) {
    stats.overdueOrders = Math.max(0, stats.overdueOrders + dir);
  }

  stats.totalOrderValue = fromPaisa(Math.max(0, toPaisa(stats.totalOrderValue) + dir * totalP));
  stats.totalAdvanceCollected = fromPaisa(Math.max(0, toPaisa(stats.totalAdvanceCollected) + dir * advP));
  stats.totalCustomerDue = fromPaisa(Math.max(0, toPaisa(stats.totalCustomerDue) + dir * dueP));
  stats.totalRefunded = fromPaisa(Math.max(0, toPaisa(stats.totalRefunded) + dir * refP));

  const sb: 'SAT' | 'GZ' | 'RTX' = po.subBrand === 'GZ' || po.subBrand === 'RTX' ? po.subBrand : 'SAT';
  if (!stats.subBrandStats[sb]) {
    stats.subBrandStats[sb] = { count: 0, totalAmount: 0, advancePaid: 0, dueAmount: 0 };
  }
  stats.subBrandStats[sb].count = Math.max(0, stats.subBrandStats[sb].count + dir);
  stats.subBrandStats[sb].totalAmount = fromPaisa(
    Math.max(0, toPaisa(stats.subBrandStats[sb].totalAmount) + dir * totalP)
  );
  stats.subBrandStats[sb].advancePaid = fromPaisa(
    Math.max(0, toPaisa(stats.subBrandStats[sb].advancePaid) + dir * advP)
  );
  stats.subBrandStats[sb].dueAmount = fromPaisa(
    Math.max(0, toPaisa(stats.subBrandStats[sb].dueAmount) + dir * dueP)
  );
}

function writeStatsDeltaInTxn(
  txn: Transaction,
  statsSnap: any,
  params: {
    beforeOrder?: PreOrder | null;
    afterOrder?: PreOrder | null;
    pendingCountDelta?: number;
    pendingAmountDelta?: number;
    customerAdvanceLiabilityDelta?: number;
    supplierPayableDelta?: number;
    now: number;
  }
): void {
  const base = createEmptyPreOrderStats();
  const raw = statsSnap && statsSnap.exists() ? (statsSnap.data() as Partial<PreOrderStats>) : {};
  const next: PreOrderStats = {
    ...base,
    ...raw,
    id: 'summary',
    statusCounts: { ...base.statusCounts, ...(raw.statusCounts || {}) },
    subBrandStats: {
      SAT: { ...base.subBrandStats.SAT, ...(raw.subBrandStats?.SAT || {}) },
      GZ: { ...base.subBrandStats.GZ, ...(raw.subBrandStats?.GZ || {}) },
      RTX: { ...base.subBrandStats.RTX, ...(raw.subBrandStats?.RTX || {}) },
    },
    lastUpdatedAt: params.now,
  };

  if (params.beforeOrder) {
    applyOrderSnapshotContribution(next, params.beforeOrder, -1);
  }
  if (params.afterOrder) {
    applyOrderSnapshotContribution(next, params.afterOrder, 1);
  }
  if (params.pendingCountDelta) {
    next.pendingPaymentCount = Math.max(0, next.pendingPaymentCount + params.pendingCountDelta);
  }
  if (params.pendingAmountDelta) {
    next.pendingPaymentAmount = fromPaisa(
      Math.max(0, toPaisa(next.pendingPaymentAmount) + toPaisa(params.pendingAmountDelta))
    );
  }
  if (params.customerAdvanceLiabilityDelta) {
    next.customerAdvancesLiability = fromPaisa(
      Math.max(0, toPaisa(next.customerAdvancesLiability) + toPaisa(params.customerAdvanceLiabilityDelta))
    );
  }
  if (params.supplierPayableDelta) {
    next.supplierPayableEstimate = fromPaisa(
      Math.max(0, toPaisa(next.supplierPayableEstimate) + toPaisa(params.supplierPayableDelta))
    );
  }

  txn.set(doc(db, 'preOrderStats', 'summary'), sanitizeData(next));
}

function mapStatusToNotificationType(status: PreOrderStatus): {
  type: PreOrderNotification['type'];
  severity: 'info' | 'warning' | 'urgent';
  targetTab: string;
} {
  switch (status) {
    case 'Advance Received':
      return { type: 'advance_received', severity: 'info', targetTab: 'preorder_payments' };
    case 'Order Confirmed':
      return { type: 'order_confirmed', severity: 'info', targetTab: 'preorder_list' };
    case 'Ordered from China':
    case 'China Warehouse':
    case 'International Shipment':
    case 'Customs Clearance':
      return { type: 'shipment_updated', severity: 'info', targetTab: 'preorder_tracking' };
    case 'Arrived in Bangladesh':
      return { type: 'product_arrived', severity: 'warning', targetTab: 'preorder_list' };
    case 'Received in Stock':
      return { type: 'stock_received', severity: 'info', targetTab: 'preorder_list' };
    case 'Ready for Delivery':
      return { type: 'ready_for_delivery', severity: 'warning', targetTab: 'preorder_list' };
    case 'Out for Delivery':
      return { type: 'out_for_delivery', severity: 'info', targetTab: 'preorder_list' };
    case 'Delivered':
      return { type: 'delivered', severity: 'info', targetTab: 'preorder_list' };
    case 'Cancelled':
      return { type: 'cancelled', severity: 'warning', targetTab: 'preorder_list' };
    case 'Refunded':
      return { type: 'refund_recorded', severity: 'warning', targetTab: 'preorder_payments' };
    default:
      return { type: 'status_update', severity: 'info', targetTab: 'preorder_list' };
  }
}

// ==========================================
// SEQUENTIAL PRE-ORDER COUNTER (PO-0001)
// ==========================================

export async function getNextPreOrderNumber(txn?: Transaction): Promise<string> {
  const counterRef = doc(db, 'settings', 'preOrderCounter');
  if (txn) {
    const snap = await txn.get(counterRef);
    const currentCount = snap.exists() ? Number(snap.data().count || 0) : 0;
    const nextCount = currentCount + 1;
    txn.set(counterRef, { count: nextCount, updatedAt: Date.now() }, { merge: true });
    return `PO-${String(nextCount).padStart(4, '0')}`;
  }

  let nextNum = 1;
  await runTransaction(db, async (t) => {
    const snap = await t.get(counterRef);
    const currentCount = snap.exists() ? Number(snap.data().count || 0) : 0;
    nextNum = currentCount + 1;
    t.set(counterRef, { count: nextNum, updatedAt: Date.now() }, { merge: true });
  });
  return `PO-${String(nextNum).padStart(4, '0')}`;
}

// ==========================================
// ROLE PERMISSIONS (/settings/rolePermissions)
// ==========================================

export async function getRolePermissions(): Promise<RolePermissionsMap> {
  if (!auth?.currentUser) {
    return mergeWithDefaultRolePermissions(null);
  }
  try {
    const ref = doc(db, 'settings', 'rolePermissions');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return mergeWithDefaultRolePermissions(snap.data() as RolePermissionsMap);
    }
    return mergeWithDefaultRolePermissions(null);
  } catch (err) {
    console.warn('getRolePermissions fallback to defaults:', err);
    return mergeWithDefaultRolePermissions(null);
  }
}

export async function saveRolePermissions(
  permissions: RolePermissionsMap,
  updatedBy?: string
): Promise<RolePermissionsMap> {
  const merged = mergeWithDefaultRolePermissions(permissions);
  const ref = doc(db, 'settings', 'rolePermissions');
  await setDoc(
    ref,
    sanitizeData({
      ...merged,
      updatedAt: Date.now(),
      updatedBy: updatedBy || 'superadmin',
    }),
    { merge: true }
  );
  return merged;
}

// ==========================================
// CUSTOMER PHONE LOOKUP (DUPLICATE PREVENTION)
// ==========================================

export async function lookupCustomerByPhone(rawPhone: string): Promise<Customer | null> {
  const normalized = normalizeBdPhone(rawPhone);
  if (!isValidBdPhone(normalized)) return null;

  if (!auth?.currentUser) {
    const cached = dbCache.customers || localStore.get<Customer[]>('customers') || [];
    return cached.find((c) => normalizeBdPhone(c.phone) === normalized) || null;
  }

  // 1. Fast O(1) lookup via normalized phone index doc
  try {
    const idxSnap = await getDoc(doc(db, 'customerPhones', normalized));
    if (idxSnap.exists()) {
      const idxData = idxSnap.data() as { customerDocId?: string };
      if (idxData.customerDocId) {
        const custSnap = await getDoc(doc(db, 'customers', idxData.customerDocId));
        if (custSnap.exists()) {
          return { id: custSnap.id, ...(custSnap.data() as Omit<Customer, 'id'>) };
        }
      }
    }
  } catch (err) {
    console.warn('customerPhones lookup skipped:', err);
  }

  // 2. Query /customers by common normalized & +88 formats (legacy customers)
  try {
    const candidates = [normalized, `+88${normalized}`, `88${normalized}`];
    const q = query(
      collection(db, 'customers'),
      where('phone', 'in', candidates),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { id: d.id, ...(d.data() as Omit<Customer, 'id'>) };
    }
  } catch (err) {
    console.warn('customers phone query fallback:', err);
  }

  // 3. Fallback to cached customers list if offline/legacy formatted with spaces/dashes
  const cached = dbCache.customers || localStore.get<Customer[]>('customers') || [];
  const matched = cached.find((c) => normalizeBdPhone(c.phone) === normalized);
  return matched || null;
}

// ==========================================
// CREATE PRE-ORDER (TRANSACTIONAL + IDEMPOTENT)
// ==========================================

export interface CreatePreOrderInput {
  subBrand: 'SAT' | 'GZ' | 'RTX';
  customerId?: string;
  customerCode?: string;
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerAddress: string;
  salesChannel?: string;
  productName: string;
  category?: string;
  sku?: string;
  model?: string;
  variant?: string;
  color?: string;
  productUrl?: string;
  productSpecs?: string;
  productImage?: string;
  linkedProductId?: string;
  linkedVariantId?: string;
  items?: PreOrderItem[];
  qty: number;
  sellingUnitPrice: number;
  deliveryCharge?: number;
  discount?: number;
  chinaUnitCost?: number;
  shippingCost?: number;
  supplierUnitCost?: number;
  orderDate?: string;
  supplierId?: string;
  supplierName?: string;
  supplierOrderRef?: string;
  estimatedDeliveryDate?: string;
  notes?: string;
  internalNotes?: string;
  idempotencyKey?: string;
  showCourierTrackingToCustomer?: boolean;
  companySettings?: CompanySettings | null;
  initialAdvance?: {
    amount: number;
    method: PreOrderPaymentMethod;
    referenceNo?: string;
    receiptUrl?: string;
    receivedAt?: number;
    note?: string;
    autoVerify?: boolean;
  };
}

export interface CreatePreOrderResult {
  id: string;
  preOrderNumber: string;
  trackingToken: string;
  customerId: string;
  customerCode: string;
  trackingSyncWarning?: string;
}

export async function createPreOrder(
  input: CreatePreOrderInput,
  actor: PreOrderActor
): Promise<CreatePreOrderResult> {
  const normalizedPhone = normalizeBdPhone(input.customerPhone);
  if (!isValidBdPhone(normalizedPhone)) {
    throw new Error('Please enter a valid Bangladesh phone number (01XXXXXXXXX).');
  }
  if (!input.customerName?.trim()) {
    throw new Error('Customer name is required.');
  }
  if (!input.customerAddress?.trim()) {
    throw new Error('Customer delivery address is required.');
  }

  const rawInputItems: Array<PreOrderItem & { chinaUnitCost?: number }> =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items.map((it, idx) => {
          const itemQty = Math.round(Number(it.qty) || 0);
          const itemPrice = roundMoney(Number(it.sellingUnitPrice) || 0);
          const itemChina = roundMoney(Number(it.chinaUnitCost ?? input.chinaUnitCost ?? 0) || 0);
          return {
            itemId: it.itemId?.trim() || `item-${idx + 1}`,
            linkedProductId: it.linkedProductId?.trim() || '',
            linkedVariantId: it.linkedVariantId?.trim() || '',
            productName: it.productName?.trim() || '',
            imageUrl: it.imageUrl || '',
            imageUrls: Array.isArray(it.imageUrls) ? it.imageUrls.filter(Boolean) : it.imageUrl ? [it.imageUrl] : [],
            category: it.category?.trim() || '',
            sku: it.sku?.trim() || '',
            model: it.model?.trim() || '',
            variant: it.variant?.trim() || '',
            color: it.color?.trim() || '',
            productUrl: it.productUrl?.trim() || '',
            productSpecs: it.productSpecs?.trim() || '',
            notes: it.notes?.trim() || '',
            qty: itemQty,
            chinaUnitCost: itemChina,
            sellingUnitPrice: itemPrice,
            lineTotal: roundMoney(itemQty * itemPrice),
            receivedQty: 0,
            deliveredQty: 0,
            damagedQty: 0,
            convertedQty: 0,
            status: 'pending',
          };
        })
      : [
          {
            itemId: 'item-1',
            linkedProductId: input.linkedProductId?.trim() || '',
            linkedVariantId: input.linkedVariantId?.trim() || '',
            productName: input.productName?.trim() || '',
            imageUrl: input.productImage || '',
            imageUrls: input.productImage ? [input.productImage] : [],
            category: input.category?.trim() || '',
            sku: input.sku?.trim() || '',
            model: input.model?.trim() || '',
            variant: input.variant?.trim() || '',
            color: input.color?.trim() || '',
            productUrl: input.productUrl?.trim() || '',
            productSpecs: input.productSpecs?.trim() || '',
            qty: Math.round(Number(input.qty) || 0),
            chinaUnitCost: roundMoney(Number(input.chinaUnitCost) || 0),
            sellingUnitPrice: roundMoney(Number(input.sellingUnitPrice) || 0),
            lineTotal: roundMoney((Math.round(Number(input.qty) || 0)) * roundMoney(Number(input.sellingUnitPrice) || 0)),
            receivedQty: 0,
            deliveredQty: 0,
            damagedQty: 0,
            convertedQty: 0,
            status: 'pending',
          },
        ];

  if (rawInputItems.length === 0) {
    throw new Error('Add at least 1 product item to the pre-order.');
  }
  if (rawInputItems.length > MAX_PRE_ORDER_ITEMS) {
    throw new Error(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed per pre-order.`);
  }
  for (let i = 0; i < rawInputItems.length; i++) {
    const line = rawInputItems[i];
    if (!line.productName) {
      throw new Error(`Item #${i + 1}: Product name is required.`);
    }
    if (line.qty < 1) {
      throw new Error(`Item #${i + 1} (${line.productName}): Quantity must be at least 1.`);
    }
    if (line.sellingUnitPrice <= 0) {
      throw new Error(`Item #${i + 1} (${line.productName}): Selling price must be greater than zero.`);
    }
    if ((line.chinaUnitCost || 0) < 0) {
      throw new Error(`Item #${i + 1} (${line.productName}): China purchase price cannot be negative.`);
    }
  }

  // Strictly strip chinaUnitCost before saving onto preOrders/{id}
  const items = sanitizePreOrderItemsForDoc(rawInputItems);
  const legacySummary = summarizePreOrderItemsLegacyFields(items);
  const itemCount = items.length;
  const totalQty = legacySummary.totalQty;
  const searchKeywords = buildPreOrderSearchKeywords(
    items,
    input.supplierName,
    input.supplierOrderRef
  );

  if (totalQty < 1) {
    throw new Error('Total quantity must be at least 1.');
  }

  const deliveryCharge = Number(input.deliveryCharge || 0);
  const discount = Number(input.discount || 0);
  const shippingCost = Number(input.shippingCost || 0);
  const initialAdvanceAmount = roundMoney(input.initialAdvance?.amount || 0);

  if (
    deliveryCharge < 0 ||
    discount < 0 ||
    shippingCost < 0 ||
    initialAdvanceAmount < 0
  ) {
    throw new Error('Charges, discounts, and advance amounts cannot be negative.');
  }

  const orderDate = input.orderDate || getTodayIsoDate();
  if (input.estimatedDeliveryDate && input.estimatedDeliveryDate < orderDate) {
    throw new Error('Expected arrival date cannot be earlier than the order date.');
  }

  const shouldAutoVerify =
    Boolean(input.initialAdvance?.autoVerify) &&
    input.initialAdvance?.method === 'Cash' &&
    isPreOrderAdminRole(actor.role);
  const initialPaymentStatus = shouldAutoVerify ? 'verified' : 'pending';

  const calc = calculatePreOrderFinancials({
    items: rawInputItems,
    deliveryCharge,
    discount,
    shippingCost,
    payments:
      initialAdvanceAmount > 0
        ? [{ type: 'advance', status: initialPaymentStatus, amount: initialAdvanceAmount }]
        : [],
  });

  if (toPaisa(discount) > toPaisa(calc.subtotal)) {
    throw new Error('Discount cannot exceed product subtotal.');
  }
  if (toPaisa(initialAdvanceAmount) > toPaisa(calc.totalAmount)) {
    throw new Error('Advance payment cannot exceed total pre-order amount.');
  }
  if (
    initialAdvanceAmount > 0 &&
    input.initialAdvance?.method &&
    input.initialAdvance.method !== 'Cash' &&
    !input.initialAdvance.referenceNo?.trim()
  ) {
    throw new Error(`Transaction ID / Reference No is required for ${input.initialAdvance.method}.`);
  }

  const now = Date.now();
  const safeIdempotency = input.idempotencyKey
    ? sanitizeIdFragment(input.idempotencyKey)
    : generateId('po_key');
  const preOrderId = input.idempotencyKey ? `PO_${safeIdempotency}` : generateId('PO');
  const trackingToken = generateTrackingToken();

  // Pre-transaction lookup to detect any legacy customer created prior to customerPhones index
  const matchedCustomer = await lookupCustomerByPhone(normalizedPhone);

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const phoneIndexRef = doc(db, 'customerPhones', normalizedPhone);
  const preOrderCounterRef = doc(db, 'settings', 'preOrderCounter');
  const customerCounterRef = doc(db, 'settings', 'customerCounter');
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const historyId = generateId('HIST');
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', historyId);
  const auditId = generateId('AUD');
  const auditRef = doc(db, 'preOrderAudit', auditId);

  const startStatus = getInitialPreOrderStatus(initialAdvanceAmount);
  const paymentState = derivePreOrderPaymentState(
    calc.totalAmount,
    calc.verifiedCollected,
    calc.verifiedRefunded,
    startStatus
  );

  let createdNumber = '';
  let resolvedTrackingToken = trackingToken;
  let resolvedCustomerDocId = '';
  let resolvedCustomerCode = '';
  let createdNewCustomerRecord: Customer | null = null;

  const statsSummaryRef = doc(db, 'preOrderStats', 'summary');

  await runTransaction(db, async (txn) => {
    // 1. ALL TRANSACTION READS FIRST
    const [existingPoSnap, phoneIdxSnap, poCounterSnap, custCounterSnap, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(phoneIndexRef),
      txn.get(preOrderCounterRef),
      txn.get(customerCounterRef),
      txn.get(statsSummaryRef),
    ]);

    if (existingPoSnap.exists()) {
      const existingData = existingPoSnap.data() as PreOrder;
      createdNumber = existingData.preOrderNumber;
      resolvedTrackingToken = existingData.trackingToken || trackingToken;
      resolvedCustomerDocId = existingData.customerId || '';
      resolvedCustomerCode = existingData.customerCode || '';
      return;
    }

    const indexedCustDocId = phoneIdxSnap.exists()
      ? (phoneIdxSnap.data() as { customerDocId?: string }).customerDocId
      : undefined;
    const candidateCustDocId = indexedCustDocId || matchedCustomer?.id || input.customerId || '';
    let existingCustSnap: any = null;
    if (candidateCustDocId) {
      existingCustSnap = await txn.get(doc(db, 'customers', candidateCustDocId));
    }

    // 2. RESOLVE OR CREATE CUSTOMER (ZERO DUPLICATES GUARANTEED)
    const normalizedWhatsapp = input.customerWhatsapp?.trim()
      ? normalizeBdPhone(input.customerWhatsapp)
      : normalizedPhone;

    if (existingCustSnap && existingCustSnap.exists()) {
      const custData = existingCustSnap.data() as Customer;
      resolvedCustomerDocId = existingCustSnap.id;
      resolvedCustomerCode = custData.customerId || input.customerCode || '';
    } else {
      const currentCustCount = custCounterSnap.exists() ? Number(custCounterSnap.data().count || 0) : 0;
      const nextCustCount = currentCustCount + 1;
      resolvedCustomerCode = `CUS-${String(nextCustCount).padStart(4, '0')}`;
      const newCustRef = doc(collection(db, 'customers'));
      resolvedCustomerDocId = newCustRef.id;

      const newCustomerPayload: Omit<Customer, 'id'> = {
        customerId: resolvedCustomerCode,
        name: input.customerName.trim(),
        phone: normalizedPhone,
        whatsapp: normalizedWhatsapp,
        address: input.customerAddress.trim(),
        subBrand: input.subBrand || 'SAT',
        totalOrders: 0,
        lifetimeValue: 0,
        createdAt: now,
      };

      txn.set(customerCounterRef, { count: nextCustCount }, { merge: true });
      txn.set(newCustRef, sanitizeData(newCustomerPayload));
      createdNewCustomerRecord = { id: resolvedCustomerDocId, ...newCustomerPayload };
    }

    // Ensure phone uniqueness index points to this single customer
    if (!phoneIdxSnap.exists()) {
      txn.set(
        phoneIndexRef,
        sanitizeData({
          phone: normalizedPhone,
          customerDocId: resolvedCustomerDocId,
          customerCode: resolvedCustomerCode,
          updatedAt: now,
        })
      );
    }

    // 3. GENERATE SEQUENTIAL PRE-ORDER NUMBER (PO-0001)
    const currentPoCount = poCounterSnap.exists() ? Number(poCounterSnap.data().count || 0) : 0;
    const nextPoCount = currentPoCount + 1;
    createdNumber = `PO-${String(nextPoCount).padStart(4, '0')}`;
    txn.set(preOrderCounterRef, { count: nextPoCount, updatedAt: now }, { merge: true });

    // 4. WRITE PRE-ORDER + ISOLATED PRIVATE COST + LEDGER + HISTORY + AUDIT
    const primaryItem = items[0];
    const preOrderDoc: PreOrder = {
      id: preOrderId,
      preOrderNumber: createdNumber,
      subBrand: input.subBrand || 'SAT',
      customerId: resolvedCustomerDocId,
      customerCode: resolvedCustomerCode,
      customerName: input.customerName.trim(),
      customerPhone: normalizedPhone,
      customerWhatsapp: normalizedWhatsapp,
      customerAddress: input.customerAddress.trim(),
      salesChannel: input.salesChannel || 'Direct/WhatsApp',
      items,
      itemCount,
      totalQty,
      searchKeywords,
      productName: legacySummary.productName,
      category: legacySummary.category,
      sku: legacySummary.sku,
      model: legacySummary.model,
      variant: legacySummary.variant,
      color: legacySummary.color,
      productUrl: primaryItem?.productUrl || input.productUrl?.trim() || '',
      productSpecs: primaryItem?.productSpecs || input.productSpecs?.trim() || '',
      productImage: legacySummary.productImage,
      linkedProductId: legacySummary.linkedProductId,
      linkedVariantId: legacySummary.linkedVariantId,
      qty: totalQty,
      sellingUnitPrice: legacySummary.sellingUnitPrice,
      subtotal: calc.subtotal,
      deliveryCharge: calc.deliveryCharge,
      discount: calc.discount,
      totalAmount: calc.totalAmount,
      advancePaid: calc.verifiedCollected,
      pendingAmount: calc.pendingCollected,
      refundedAmount: calc.verifiedRefunded,
      dueAmount: calc.dueAmount,
      paymentCount: initialAdvanceAmount > 0 ? 1 : 0,
      paymentState,
      status: startStatus,
      orderDate,
      supplierId: input.supplierId || '',
      supplierName: input.supplierName || '',
      supplierOrderRef: input.supplierOrderRef?.trim() || '',
      trackingToken: resolvedTrackingToken,
      trackingTokenId: resolvedTrackingToken,
      trackingEnabled: true,
      trackingCreatedAt: now,
      trackingCreatedBy: actor.id,
      showCourierTrackingToCustomer: Boolean(
        input.showCourierTrackingToCustomer ??
          input.companySettings?.defaultShowCourierTracking ??
          false
      ),
      trackingHistory: [
        {
          action: 'created',
          timestamp: now,
          actorId: actor.id,
          actorName: actor.name,
        },
      ],
      estimatedDeliveryDate: input.estimatedDeliveryDate || '',
      stockReceived: false,
      isCancelled: false,
      idempotencyKey: safeIdempotency,
      notes: input.notes?.trim() || '',
      createdBy: actor.id,
      createdByName: actor.name,
      createdAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    const itemCosts: PreOrderPrivateItemCost[] = rawInputItems.map((it) => {
      const unitChina = roundMoney(it.chinaUnitCost ?? input.chinaUnitCost ?? 0);
      return {
        itemId: it.itemId,
        chinaUnitCost: unitChina,
        supplierUnitCost: unitChina,
        lineChinaTotal: roundMoney(unitChina * it.qty),
      };
    });
    const totalChinaPaisa = rawInputItems.reduce(
      (s, it) => s + Math.round(toPaisa(it.chinaUnitCost ?? 0) * it.qty),
      0
    );
    const weightedChinaUnitCost =
      totalQty > 0 ? roundMoney(fromPaisa(totalChinaPaisa) / totalQty) : roundMoney(input.chinaUnitCost ?? 0);

    const privateCostDoc: PreOrderPrivateCost = {
      preOrderId,
      chinaUnitCost: weightedChinaUnitCost,
      shippingCost: roundMoney(shippingCost),
      supplierUnitCost: roundMoney(input.supplierUnitCost ?? weightedChinaUnitCost),
      itemCosts,
      expectedProfit: calc.expectedProfit,
      internalNotes: input.internalNotes?.trim() || '',
      supplierOrderRef: input.supplierOrderRef?.trim() || '',
      updatedAt: now,
      updatedBy: actor.id,
    };

    const statusHistoryDoc: PreOrderStatusHistory = {
      id: historyId,
      preOrderId,
      fromStatus: null,
      toStatus: startStatus,
      note:
        initialAdvanceAmount > 0
          ? `Pre-order created with advance of ৳${initialAdvanceAmount.toLocaleString()} (${initialPaymentStatus})`
          : 'Pre-order created and confirmed without advance',
      changedBy: actor.id,
      changedByName: actor.name,
      timestamp: now,
    };

    const auditDoc: PreOrderAuditEntry = {
      id: auditId,
      preOrderId,
      preOrderNumber: createdNumber,
      action: 'PREORDER_CREATED',
      summary: `Created pre-order ${createdNumber} (${startStatus}) for ${preOrderDoc.customerName} (${formatPreOrderProductLabel(preOrderDoc)} · ${totalQty} pcs)`,
      metadata: {
        totalAmount: preOrderDoc.totalAmount,
        initialAdvance: initialAdvanceAmount,
        initialPaymentStatus: initialAdvanceAmount > 0 ? initialPaymentStatus : 'none',
        customerCode: resolvedCustomerCode,
        startStatus,
        itemCount,
        totalQty,
      },
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: now,
    };

    txn.set(preOrderRef, sanitizeData(preOrderDoc));
    txn.set(costRef, sanitizeData(privateCostDoc));
    txn.set(historyRef, sanitizeData(statusHistoryDoc));
    txn.set(auditRef, sanitizeData(auditDoc));

    if (initialAdvanceAmount > 0 && input.initialAdvance) {
      const paymentId = `PAY_${safeIdempotency}_init`;
      const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
      const paymentDoc: PreOrderPayment = {
        id: paymentId,
        preOrderId,
        preOrderNumber: createdNumber,
        subBrand: preOrderDoc.subBrand,
        customerName: preOrderDoc.customerName,
        customerPhone: preOrderDoc.customerPhone,
        type: 'advance',
        amount: initialAdvanceAmount,
        method: input.initialAdvance.method,
        referenceNo: input.initialAdvance.referenceNo?.trim() || '',
        receiptUrl: input.initialAdvance.receiptUrl || '',
        receivedAt: input.initialAdvance.receivedAt || now,
        note: input.initialAdvance.note?.trim() || 'Initial advance payment',
        status: initialPaymentStatus,
        idempotencyKey: `${safeIdempotency}_init`,
        recordedBy: actor.id,
        recordedByName: actor.name,
        createdAt: now,
        ...(shouldAutoVerify
          ? {
              verifiedBy: actor.id,
              verifiedByName: actor.name,
              verifiedAt: now,
            }
          : {}),
      };
      txn.set(paymentRef, sanitizeData(paymentDoc));

      if (shouldAutoVerify) {
        const advancePosting = buildAdvanceVerifiedPosting({
          preOrderId,
          preOrderNumber: createdNumber,
          subBrand: preOrderDoc.subBrand,
          paymentId,
          amount: initialAdvanceAmount,
          method: input.initialAdvance.method,
          note: input.initialAdvance.note?.trim() || 'Initial advance payment (auto-verified)',
          actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
        });
        txn.set(doc(db, 'accountingPostings', advancePosting.id), sanitizeData(advancePosting));
      }
    }

    writeStatsDeltaInTxn(txn, statsSnap, {
      afterOrder: preOrderDoc,
      pendingCountDelta: initialAdvanceAmount > 0 && initialPaymentStatus === 'pending' ? 1 : 0,
      pendingAmountDelta: initialAdvanceAmount > 0 && initialPaymentStatus === 'pending' ? initialAdvanceAmount : 0,
      customerAdvanceLiabilityDelta: shouldAutoVerify ? initialAdvanceAmount : 0,
      now,
    });

    const notifMeta = mapStatusToNotificationType(startStatus);
    const evNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      evNotifRef,
      sanitizeData({
        id: evNotifRef.id,
        preOrderId,
        preOrderNumber: createdNumber,
        subBrand: preOrderDoc.subBrand,
        type: notifMeta.type,
        category: 'event',
        severity: notifMeta.severity,
        title: `New Pre-Order · ${createdNumber}`,
        message: `${preOrderDoc.customerName} ordered ${formatPreOrderProductLabel(preOrderDoc)} (${totalQty} pcs, ${startStatus}).`,
        targetTab: notifMeta.targetTab,
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: preOrderDoc.customerPhone,
        customerName: preOrderDoc.customerName,
        dueAmount: preOrderDoc.dueAmount,
        estimatedArrivalDate: preOrderDoc.estimatedDeliveryDate,
        preOrderStatus: startStatus,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );
  });

  if (createdNewCustomerRecord) {
    dbCache.customers = null;
    const prevCached = localStore.get<Customer[]>('customers') || [];
    localStore.set('customers', [createdNewCustomerRecord, ...prevCached]);
  }

  // Sync sanitized whitelisted snapshot to publicTracking/{token}
  const syncRes = await syncPublicTracking(preOrderId, {
    companySettings: input.companySettings,
  });

  return {
    id: preOrderId,
    preOrderNumber: createdNumber,
    trackingToken: resolvedTrackingToken,
    customerId: resolvedCustomerDocId,
    customerCode: resolvedCustomerCode,
    trackingSyncWarning: syncRes.ok ? undefined : syncRes.error,
  };
}

// ==========================================
// QUOTA-FRIENDLY CURSOR-PAGINATED QUERIES
// ==========================================

export type PreOrderSortField =
  | 'createdAt'
  | 'totalAmount'
  | 'dueAmount'
  | 'estimatedDeliveryDate'
  | 'preOrderNumber';

export interface QueryPreOrdersOptions {
  pageSize?: 25 | 50 | 100 | number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  statuses?: PreOrderStatus[];
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL';
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
  supplierId?: string;
  paymentState?: PreOrderPaymentState | 'ALL';
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  overdueOnly?: boolean;
  searchTerm?: string;
  sortField?: PreOrderSortField;
  sortDir?: 'asc' | 'desc';
}

export interface QueryPreOrdersResult {
  items: PreOrder[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  indexNotice?: string;
}

function matchesClientSideFilters(order: PreOrder, opts: QueryPreOrdersOptions): boolean {
  if (opts.allowedSubBrands && opts.allowedSubBrands.length > 0) {
    if (!opts.allowedSubBrands.includes(order.subBrand)) return false;
  }
  if (opts.subBrand && opts.subBrand !== 'ALL' && order.subBrand !== opts.subBrand) {
    return false;
  }
  if (opts.statuses && opts.statuses.length > 0 && !opts.statuses.includes(order.status)) {
    return false;
  }
  if (opts.supplierId && opts.supplierId !== 'ALL' && order.supplierId !== opts.supplierId) {
    return false;
  }
  if (opts.paymentState && opts.paymentState !== 'ALL') {
    const derivedState =
      order.paymentState ||
      derivePreOrderPaymentState(
        order.totalAmount,
        order.advancePaid || 0,
        order.refundedAmount || 0,
        order.status
      );
    if (derivedState !== opts.paymentState) return false;
  }
  if (opts.dateFrom) {
    const orderDay = order.orderDate || new Date(order.createdAt).toISOString().split('T')[0];
    if (orderDay < opts.dateFrom) return false;
  }
  if (opts.dateTo) {
    const orderDay = order.orderDate || new Date(order.createdAt).toISOString().split('T')[0];
    if (orderDay > opts.dateTo) return false;
  }
  if (opts.overdueOnly) {
    if (!isPreOrderOverdue(order.estimatedDeliveryDate, order.status, order.stockReceived)) {
      return false;
    }
  }
  if (opts.searchTerm?.trim()) {
    const q = opts.searchTerm.trim().toLowerCase();
    const normPhoneQ = normalizeBdPhone(opts.searchTerm);
    const orderItems = normalizePreOrderItems(order);
    const haystack = [
      order.preOrderNumber,
      order.customerName,
      order.customerPhone,
      order.customerCode,
      order.productName,
      order.sku,
      order.supplierOrderRef,
      order.supplierName,
      ...(Array.isArray(order.searchKeywords) ? order.searchKeywords : []),
      ...orderItems.flatMap((it) => [it.productName, it.sku, it.model, it.variant, it.color]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const phoneMatch =
      normPhoneQ.length >= 4 && normalizeBdPhone(order.customerPhone).includes(normPhoneQ);
    if (!haystack.includes(q) && !phoneMatch) return false;
  }
  return true;
}

export async function queryPreOrdersPage(
  options: QueryPreOrdersOptions = {}
): Promise<QueryPreOrdersResult> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 25, 1), 100);
  const sortField = options.sortField || 'createdAt';
  const sortDir = options.sortDir || 'desc';

  // Targeted indexed search shortcuts when searchTerm looks like an exact/prefix PO number or BD phone
  const trimmedSearch = options.searchTerm?.trim() || '';
  if (trimmedSearch && !options.cursor) {
    const upper = trimmedSearch.toUpperCase();
    const normPhone = normalizeBdPhone(trimmedSearch);
    try {
      if (upper.startsWith('PO-')) {
        const prefixQ = query(
          collection(db, 'preOrders'),
          where('preOrderNumber', '>=', upper),
          where('preOrderNumber', '<=', upper + '\uf8ff'),
          orderBy('preOrderNumber', 'asc'),
          limit(pageSize)
        );
        const snap = await getDocs(prefixQ);
        const docs = snap.docs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
        const filtered = docs.filter((o) => matchesClientSideFilters(o, options));
        return { items: filtered, lastDoc: null, hasMore: false };
      }
      if (isValidBdPhone(normPhone)) {
        const phoneQ = query(
          collection(db, 'preOrders'),
          where('customerPhone', '==', normPhone),
          orderBy('createdAt', 'desc'),
          limit(pageSize)
        );
        const snap = await getDocs(phoneQ);
        const docs = snap.docs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
        const filtered = docs.filter((o) => matchesClientSideFilters(o, options));
        return { items: filtered, lastDoc: null, hasMore: false };
      }
    } catch (searchErr) {
      // Fall through cleanly to cursor query below
      console.warn('Targeted search index fallback:', searchErr);
    }
  }

  const buildPrimaryQuery = () => {
    const constraints: any[] = [];
    if (options.subBrand && options.subBrand !== 'ALL') {
      constraints.push(where('subBrand', '==', options.subBrand));
    } else if (options.allowedSubBrands && options.allowedSubBrands.length > 0 && options.allowedSubBrands.length < 3) {
      constraints.push(where('subBrand', 'in', options.allowedSubBrands));
    }

    if (options.statuses && options.statuses.length === 1) {
      constraints.push(where('status', '==', options.statuses[0]));
    } else if (options.statuses && options.statuses.length > 1 && options.statuses.length <= 10) {
      constraints.push(where('status', 'in', options.statuses));
    }

    if (options.supplierId && options.supplierId !== 'ALL') {
      constraints.push(where('supplierId', '==', options.supplierId));
    }
    if (options.paymentState && options.paymentState !== 'ALL') {
      constraints.push(where('paymentState', '==', options.paymentState));
    }

    constraints.push(orderBy(sortField, sortDir));
    if (options.cursor) {
      constraints.push(startAfter(options.cursor));
    }
    constraints.push(limit(pageSize + 1));
    return query(collection(db, 'preOrders'), ...constraints);
  };

  try {
    const q = buildPrimaryQuery();
    const snap = await getDocs(q);
    const hasMore = snap.docs.length > pageSize;
    const slicedDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const rawItems = slicedDocs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
    const filtered = rawItems.filter((o) => matchesClientSideFilters(o, options));
    const lastDoc = slicedDocs.length > 0 ? slicedDocs[slicedDocs.length - 1] : null;
    return { items: filtered, lastDoc, hasMore };
  } catch (err: any) {
    const isIndexError =
      err?.code === 'failed-precondition' ||
      String(err?.message || '').toLowerCase().includes('index');

    if (!isIndexError) throw err;

    // Graceful fallback using single-field createdAt cursor (no composite index required)
    const fallbackConstraints: any[] = [orderBy('createdAt', 'desc')];
    if (options.cursor) {
      fallbackConstraints.push(startAfter(options.cursor));
    }
    fallbackConstraints.push(limit(pageSize + 1));
    const fallbackSnap = await getDocs(query(collection(db, 'preOrders'), ...fallbackConstraints));
    const hasMore = fallbackSnap.docs.length > pageSize;
    const slicedDocs = hasMore ? fallbackSnap.docs.slice(0, pageSize) : fallbackSnap.docs;
    const rawItems = slicedDocs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
    const filtered = rawItems.filter((o) => matchesClientSideFilters(o, options));
    const lastDoc = slicedDocs.length > 0 ? slicedDocs[slicedDocs.length - 1] : null;

    return {
      items: filtered,
      lastDoc,
      hasMore,
      indexNotice:
        'Using base cursor ordering because a composite index for the active filter + sort combination has not been created in Firebase Console yet.',
    };
  }
}

export interface GetPreOrdersOptions {
  status?: PreOrderStatus;
  subBrand?: 'SAT' | 'GZ' | 'RTX';
  limitCount?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}

export interface GetPreOrdersResult {
  items: PreOrder[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export async function getPreOrders(
  options: GetPreOrdersOptions = {}
): Promise<GetPreOrdersResult> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const pageSize = Math.min(Math.max(options.limitCount || 50, 1), 100);
  const constraints: any[] = [];

  if (options.subBrand) {
    constraints.push(where('subBrand', '==', options.subBrand));
  }
  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }
  constraints.push(orderBy('createdAt', 'desc'));
  if (options.cursor) {
    constraints.push(startAfter(options.cursor));
  }
  constraints.push(limit(pageSize));

  const q = query(collection(db, 'preOrders'), ...constraints);
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return {
    items,
    lastDoc,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function getPreOrderById(preOrderId: string): Promise<PreOrder | null> {
  if (!auth?.currentUser) return null;
  const snap = await getDoc(doc(db, 'preOrders', preOrderId));
  if (!snap.exists()) return null;
  return withNormalizedPreOrderItems({ ...(snap.data() as PreOrder), id: snap.id });
}

export async function getPreOrderPrivateCost(
  preOrderId: string
): Promise<PreOrderPrivateCost | null> {
  if (!auth?.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, 'preOrders', preOrderId, 'private', 'cost'));
    if (!snap.exists()) return null;
    return snap.data() as PreOrderPrivateCost;
  } catch (err: any) {
    if (err?.code === 'permission-denied') return null;
    throw err;
  }
}

export interface PreOrderFullDetail {
  order: PreOrder;
  payments: PreOrderPayment[];
  statusHistory: PreOrderStatusHistory[];
  privateCost: PreOrderPrivateCost | null;
  auditLogs: PreOrderAuditEntry[];
}

export async function getPreOrderFullDetail(
  preOrderId: string,
  options: { canViewProfit: boolean; canViewSupplier?: boolean; canViewAudit: boolean }
): Promise<PreOrderFullDetail | null> {
  const order = await getPreOrderById(preOrderId);
  if (!order) return null;

  const canReadPrivateCost = Boolean(options.canViewProfit || options.canViewSupplier);

  const [payments, statusHistory, privateCost, auditLogs] = await Promise.all([
    getPreOrderPayments(preOrderId, 100),
    getPreOrderStatusHistory(preOrderId, 100),
    canReadPrivateCost ? getPreOrderPrivateCost(preOrderId) : Promise.resolve(null),
    options.canViewAudit
      ? getPreOrderAuditLogs(preOrderId, 100).catch(() => [] as PreOrderAuditEntry[])
      : Promise.resolve([] as PreOrderAuditEntry[]),
  ]);

  return {
    order,
    payments,
    statusHistory,
    privateCost,
    auditLogs,
  };
}

// ==========================================
// UPDATE PRE-ORDER & RESTRICTED COST DOC
// ==========================================

export type UpdatePreOrderInput = Partial<
  Pick<
    PreOrder,
    | 'subBrand'
    | 'customerName'
    | 'customerPhone'
    | 'customerWhatsapp'
    | 'customerAddress'
    | 'salesChannel'
    | 'items'
    | 'productName'
    | 'category'
    | 'sku'
    | 'model'
    | 'variant'
    | 'color'
    | 'productUrl'
    | 'productSpecs'
    | 'productImage'
    | 'linkedProductId'
    | 'linkedVariantId'
    | 'qty'
    | 'sellingUnitPrice'
    | 'deliveryCharge'
    | 'discount'
    | 'orderDate'
    | 'supplierId'
    | 'supplierName'
    | 'supplierOrderRef'
    | 'estimatedDeliveryDate'
    | 'notes'
  >
>;

export async function updatePreOrder(
  preOrderId: string,
  updates: UpdatePreOrderInput,
  actor: PreOrderActor
): Promise<{ trackingSyncWarning?: string }> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  // Load real payments ledger outside transaction so dueAmount recalculates accurately from ledger
  const ledgerPayments = await getPreOrderPayments(preOrderId, 200);
  const activePayments = ledgerPayments.filter((p) => p.status !== 'rejected');

  await runTransaction(db, async (txn) => {
    const [snap, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);
    if (!snap.exists()) throw new Error('Pre-order not found.');

    const current = withNormalizedPreOrderItems({ ...(snap.data() as PreOrder), id: snap.id });
    if (PRE_ORDER_EDIT_LOCKED_STATUSES.includes(current.status)) {
      throw new Error(`Pre-orders with status "${current.status}" are locked from editing.`);
    }

    const isConverted = Boolean(current.convertedSaleId || current.convertedOrderId);
    const currentItems = normalizePreOrderItems(current);
    const currentById = new Map(currentItems.map((it) => [it.itemId, it]));

    let resolvedItems: PreOrderItem[];
    if (Array.isArray(updates.items)) {
      if (updates.items.length === 0) {
        throw new Error('At least 1 item is required on a pre-order.');
      }
      if (updates.items.length > MAX_PRE_ORDER_ITEMS) {
        throw new Error(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed per pre-order.`);
      }
      resolvedItems = updates.items.map((it, idx) => {
        const itemId = it.itemId?.trim() || `item-${idx + 1}`;
        const existingItem = currentById.get(itemId);
        const itemQty = Math.round(Number(it.qty) || 0);
        const itemPrice = roundMoney(Number(it.sellingUnitPrice) || 0);
        const prevReceived = Math.max(0, Number(existingItem?.receivedQty ?? it.receivedQty ?? 0));
        const prevDamaged = Math.max(0, Number(existingItem?.damagedQty ?? it.damagedQty ?? 0));
        if (!it.productName?.trim()) {
          throw new Error(`Item #${idx + 1}: Product name is required.`);
        }
        if (itemQty < 1) {
          throw new Error(`Item #${idx + 1} (${it.productName}): Quantity must be at least 1.`);
        }
        if (itemQty < prevReceived + prevDamaged) {
          throw new Error(
            `Item "${it.productName}" already has ${prevReceived + prevDamaged} received/damaged units; quantity cannot be lowered below that.`
          );
        }
        if (itemPrice <= 0) {
          throw new Error(`Item #${idx + 1} (${it.productName}): Selling price must be greater than zero.`);
        }
        return {
          ...existingItem,
          ...it,
          itemId,
          productName: it.productName.trim(),
          category: it.category?.trim() || '',
          sku: it.sku?.trim() || '',
          model: it.model?.trim() || '',
          variant: it.variant?.trim() || '',
          color: it.color?.trim() || '',
          imageUrl: it.imageUrl || existingItem?.imageUrl || '',
          linkedProductId: it.linkedProductId?.trim() || existingItem?.linkedProductId || '',
          linkedVariantId: it.linkedVariantId?.trim() || existingItem?.linkedVariantId || '',
          qty: itemQty,
          sellingUnitPrice: itemPrice,
          lineTotal: roundMoney(itemQty * itemPrice),
          receivedQty: prevReceived,
          deliveredQty: Math.max(0, Number(existingItem?.deliveredQty ?? it.deliveredQty ?? 0)),
          damagedQty: prevDamaged,
          convertedQty: existingItem?.convertedQty ?? it.convertedQty ?? 0,
          ...(existingItem?.unitLandedCost !== undefined ? { unitLandedCost: existingItem.unitLandedCost } : {}),
          ...(existingItem?.landedCostTotal !== undefined ? { landedCostTotal: existingItem.landedCostTotal } : {}),
        };
      });

      // Prevent removing an item that already has received stock
      const updatedIds = new Set(resolvedItems.map((it) => it.itemId));
      for (const oldIt of currentItems) {
        if (!updatedIds.has(oldIt.itemId) && ((oldIt.receivedQty || 0) > 0 || (oldIt.damagedQty || 0) > 0)) {
          throw new Error(
            `Cannot remove "${oldIt.productName}" because stock has already been received for it.`
          );
        }
      }
    } else {
      // Legacy single-field patch merges cleanly onto items[0]
      const first = currentItems[0];
      const nextQty = updates.qty !== undefined ? Math.round(Number(updates.qty)) : first.qty;
      const nextPrice =
        updates.sellingUnitPrice !== undefined
          ? roundMoney(Number(updates.sellingUnitPrice))
          : first.sellingUnitPrice;
      if (nextQty < 1) throw new Error('Quantity must be at least 1.');
      if (nextPrice <= 0) throw new Error('Selling unit price must be greater than zero.');
      resolvedItems = [
        {
          ...first,
          productName: updates.productName?.trim() || first.productName,
          category: updates.category !== undefined ? updates.category : first.category,
          sku: updates.sku !== undefined ? updates.sku : first.sku,
          model: updates.model !== undefined ? updates.model : first.model,
          variant: updates.variant !== undefined ? updates.variant : first.variant,
          color: updates.color !== undefined ? updates.color : first.color,
          imageUrl: updates.productImage !== undefined ? updates.productImage : first.imageUrl,
          linkedProductId:
            updates.linkedProductId !== undefined ? updates.linkedProductId : first.linkedProductId,
          linkedVariantId:
            updates.linkedVariantId !== undefined ? updates.linkedVariantId : first.linkedVariantId,
          qty: nextQty,
          sellingUnitPrice: nextPrice,
          lineTotal: roundMoney(nextQty * nextPrice),
        },
        ...currentItems.slice(1),
      ];
    }

    const sanitizedItems = sanitizePreOrderItemsForDoc(resolvedItems);
    const itemsFinancialChanged =
      sanitizedItems.length !== currentItems.length ||
      sanitizedItems.some((it, idx) => {
        const prev = currentItems[idx];
        return (
          !prev ||
          prev.itemId !== it.itemId ||
          Number(prev.qty) !== Number(it.qty) ||
          toPaisa(prev.sellingUnitPrice) !== toPaisa(it.sellingUnitPrice)
        );
      });

    const hasAnyPayment =
      activePayments.length > 0 ||
      Number(current.paymentCount || 0) > 0 ||
      Number(current.advancePaid || 0) > 0 ||
      Number(current.pendingAmount || 0) > 0;

    const financialFieldChanged =
      itemsFinancialChanged ||
      (updates.deliveryCharge !== undefined &&
        toPaisa(updates.deliveryCharge) !== toPaisa(current.deliveryCharge)) ||
      (updates.discount !== undefined &&
        toPaisa(updates.discount) !== toPaisa(current.discount));

    if (isConverted && financialFieldChanged) {
      throw new Error(
        'Items, quantities, unit prices, delivery charge, and discount are locked after conversion to a Sales Order & Invoice.'
      );
    }

    if (hasAnyPayment && !isAdminRole(actor.role) && financialFieldChanged) {
      throw new Error(
        'Items, quantities, pricing, and order totals cannot be modified after a payment exists unless performed by Admin or Super Admin.'
      );
    }

    let nextPhone = current.customerPhone;
    if (updates.customerPhone !== undefined) {
      const normalized = normalizeBdPhone(updates.customerPhone);
      if (!isValidBdPhone(normalized)) {
        throw new Error('Please enter a valid Bangladesh phone number (01XXXXXXXXX).');
      }
      nextPhone = normalized;
    }

    const deliveryCharge =
      updates.deliveryCharge !== undefined
        ? Number(updates.deliveryCharge)
        : current.deliveryCharge;
    const discount =
      updates.discount !== undefined ? Number(updates.discount) : current.discount;

    if (deliveryCharge < 0 || discount < 0) {
      throw new Error('Delivery charges and discounts cannot be negative.');
    }

    const nextOrderDate = updates.orderDate ?? current.orderDate ?? getTodayIsoDate();
    const nextEstDate = updates.estimatedDeliveryDate ?? current.estimatedDeliveryDate ?? '';
    if (nextEstDate && nextOrderDate && nextEstDate < nextOrderDate) {
      throw new Error('Expected arrival date cannot be earlier than the order date.');
    }

    const calc = calculatePreOrderFinancials({
      items: sanitizedItems,
      deliveryCharge,
      discount,
      payments:
        activePayments.length > 0
          ? activePayments
          : [
              { type: 'advance', status: 'verified', amount: current.advancePaid || 0 },
              { type: 'refund', status: 'verified', amount: current.refundedAmount || 0 },
            ],
    });

    if (toPaisa(discount) > toPaisa(calc.subtotal)) {
      throw new Error('Discount cannot exceed product subtotal.');
    }

    const paymentState = derivePreOrderPaymentState(
      calc.totalAmount,
      calc.verifiedCollected,
      calc.verifiedRefunded,
      current.status
    );

    const legacySummary = summarizePreOrderItemsLegacyFields(sanitizedItems);
    const searchKeywords = buildPreOrderSearchKeywords(
      sanitizedItems,
      updates.supplierName ?? current.supplierName,
      updates.supplierOrderRef ?? current.supplierOrderRef
    );

    const nextDoc: Partial<PreOrder> = {
      ...updates,
      customerPhone: nextPhone,
      items: sanitizedItems,
      itemCount: legacySummary.itemCount,
      totalQty: legacySummary.totalQty,
      searchKeywords,
      productName: legacySummary.productName,
      category: legacySummary.category,
      sku: legacySummary.sku,
      model: legacySummary.model,
      variant: legacySummary.variant,
      color: legacySummary.color,
      productImage: legacySummary.productImage,
      linkedProductId: legacySummary.linkedProductId,
      linkedVariantId: legacySummary.linkedVariantId,
      qty: legacySummary.totalQty,
      sellingUnitPrice: legacySummary.sellingUnitPrice,
      subtotal: calc.subtotal,
      deliveryCharge: calc.deliveryCharge,
      discount: calc.discount,
      totalAmount: calc.totalAmount,
      advancePaid: calc.verifiedCollected,
      pendingAmount: calc.pendingCollected,
      refundedAmount: calc.verifiedRefunded,
      dueAmount: calc.dueAmount,
      paymentCount: activePayments.length || current.paymentCount || 0,
      paymentState,
      updatedAt: now,
      updatedBy: actor.id,
    };

    const beforeDiff: Record<string, any> = {};
    const afterDiff: Record<string, any> = {};
    const trackableKeys: Array<keyof PreOrder> = [
      'subBrand',
      'customerName',
      'customerPhone',
      'customerWhatsapp',
      'customerAddress',
      'itemCount',
      'totalQty',
      'productName',
      'category',
      'sku',
      'model',
      'variant',
      'color',
      'productSpecs',
      'productImage',
      'qty',
      'sellingUnitPrice',
      'subtotal',
      'deliveryCharge',
      'discount',
      'totalAmount',
      'dueAmount',
      'supplierId',
      'supplierName',
      'supplierOrderRef',
      'orderDate',
      'estimatedDeliveryDate',
      'notes',
    ];

    for (const k of trackableKeys) {
      const oldVal = current[k] ?? '';
      const newVal = nextDoc[k] !== undefined ? nextDoc[k] ?? '' : oldVal;
      if (oldVal !== newVal) {
        beforeDiff[k] = oldVal;
        afterDiff[k] = newVal;
      }
    }
    if (updates.items !== undefined && itemsFinancialChanged) {
      beforeDiff.itemsSummary = currentItems.map((i) => `${i.productName} x${i.qty} @${i.sellingUnitPrice}`);
      afterDiff.itemsSummary = sanitizedItems.map((i) => `${i.productName} x${i.qty} @${i.sellingUnitPrice}`);
    }

    txn.update(preOrderRef, sanitizeData(nextDoc));

    const changedFieldNames = Object.keys(afterDiff);
    const auditDoc: PreOrderAuditEntry = {
      id: auditRef.id,
      preOrderId,
      preOrderNumber: current.preOrderNumber,
      action: 'PREORDER_UPDATED',
      summary:
        changedFieldNames.length > 0
          ? `Edited ${current.preOrderNumber} (${changedFieldNames.join(', ')})`
          : `Saved ${current.preOrderNumber} edits`,
      metadata: {
        updatedFields: changedFieldNames,
        before: beforeDiff,
        after: afterDiff,
      },
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: now,
    };
    txn.set(auditRef, sanitizeData(auditDoc));

    const updatedAfter = { ...current, ...nextDoc } as PreOrder;
    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: current,
      afterOrder: updatedAfter,
      now,
    });
  });

  const syncRes = await syncPublicTracking(preOrderId);
  return { trackingSyncWarning: syncRes.ok ? undefined : syncRes.error };
}

export async function updatePreOrderPrivateCost(
  preOrderId: string,
  updates: Partial<
    Pick<
      PreOrderPrivateCost,
      'chinaUnitCost' | 'shippingCost' | 'supplierUnitCost' | 'itemCosts' | 'internalNotes' | 'supplierOrderRef'
    >
  >,
  actor: PreOrderActor
): Promise<void> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const [orderSnap, costSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(costRef),
    ]);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');

    const order = withNormalizedPreOrderItems({ ...(orderSnap.data() as PreOrder), id: orderSnap.id });
    if (PRE_ORDER_EDIT_LOCKED_STATUSES.includes(order.status)) {
      throw new Error(`Pre-orders with status "${order.status}" are locked from editing.`);
    }

    const orderItems = normalizePreOrderItems(order);
    const existingCost: Partial<PreOrderPrivateCost> = costSnap.exists() ? costSnap.data() : {};

    const shippingCost = roundMoney(
      updates.shippingCost !== undefined
        ? updates.shippingCost
        : existingCost.shippingCost || 0
    );
    if (shippingCost < 0) {
      throw new Error('Shipping cost cannot be negative.');
    }

    let resolvedItemCosts: PreOrderPrivateItemCost[];
    if (Array.isArray(updates.itemCosts)) {
      const reqMap = new Map(updates.itemCosts.map((c) => [c.itemId, c]));
      resolvedItemCosts = orderItems.map((it) => {
        const match = reqMap.get(it.itemId);
        const chinaUnit = roundMoney(match?.chinaUnitCost ?? updates.chinaUnitCost ?? existingCost.chinaUnitCost ?? 0);
        if (chinaUnit < 0) {
          throw new Error(`China purchase price for "${it.productName}" cannot be negative.`);
        }
        return {
          itemId: it.itemId,
          chinaUnitCost: chinaUnit,
          supplierUnitCost: roundMoney(match?.supplierUnitCost ?? chinaUnit),
          lineChinaTotal: roundMoney(chinaUnit * it.qty),
        };
      });
    } else if (updates.chinaUnitCost !== undefined) {
      const uniformChina = roundMoney(updates.chinaUnitCost);
      if (uniformChina < 0) {
        throw new Error('China purchase price cannot be negative.');
      }
      resolvedItemCosts = orderItems.map((it) => ({
        itemId: it.itemId,
        chinaUnitCost: uniformChina,
        supplierUnitCost: roundMoney(updates.supplierUnitCost ?? uniformChina),
        lineChinaTotal: roundMoney(uniformChina * it.qty),
      }));
    } else if (Array.isArray(existingCost.itemCosts) && existingCost.itemCosts.length > 0) {
      const existingMap = computeItemCostMap(order, existingCost as PreOrderPrivateCost);
      resolvedItemCosts = orderItems.map((it) => {
        const unit = roundMoney(existingMap[it.itemId]?.chinaUnitCost ?? existingCost.chinaUnitCost ?? 0);
        return {
          itemId: it.itemId,
          chinaUnitCost: unit,
          supplierUnitCost: unit,
          lineChinaTotal: roundMoney(unit * it.qty),
        };
      });
    } else {
      const fallbackChina = roundMoney(existingCost.chinaUnitCost || 0);
      resolvedItemCosts = orderItems.map((it) => ({
        itemId: it.itemId,
        chinaUnitCost: fallbackChina,
        supplierUnitCost: fallbackChina,
        lineChinaTotal: roundMoney(fallbackChina * it.qty),
      }));
    }

    const totalOrderQty = orderItems.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const totalChinaCostPaisa = resolvedItemCosts.reduce((s, ic) => s + toPaisa(ic.lineChinaTotal), 0);
    const chinaUnitCost =
      totalOrderQty > 0
        ? roundMoney(fromPaisa(totalChinaCostPaisa) / totalOrderQty)
        : roundMoney(updates.chinaUnitCost ?? existingCost.chinaUnitCost ?? 0);

    const itemChinaMap = Object.fromEntries(
      resolvedItemCosts.map((ic) => [ic.itemId, ic.chinaUnitCost])
    );
    const calc = calculatePreOrderFinancials({
      items: orderItems.map((it) => ({
        ...it,
        chinaUnitCost: itemChinaMap[it.itemId] ?? chinaUnitCost,
      })),
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      chinaUnitCost,
      shippingCost,
    });

    const nextCost: PreOrderPrivateCost = {
      preOrderId,
      chinaUnitCost,
      shippingCost,
      supplierUnitCost: roundMoney(
        updates.supplierUnitCost !== undefined
          ? updates.supplierUnitCost
          : existingCost.supplierUnitCost ?? chinaUnitCost
      ),
      itemCosts: resolvedItemCosts,
      expectedProfit: calc.expectedProfit,
      internalNotes:
        updates.internalNotes !== undefined
          ? updates.internalNotes
          : existingCost.internalNotes || '',
      supplierOrderRef:
        updates.supplierOrderRef !== undefined
          ? updates.supplierOrderRef
          : existingCost.supplierOrderRef || '',
      updatedAt: now,
      updatedBy: actor.id,
    };

    const beforePrivate: Record<string, any> = {
      chinaUnitCost: existingCost.chinaUnitCost ?? 0,
      shippingCost: existingCost.shippingCost ?? 0,
      expectedProfit: existingCost.expectedProfit ?? 0,
      internalNotes: existingCost.internalNotes ?? '',
      supplierOrderRef: existingCost.supplierOrderRef ?? '',
    };
    const afterPrivate: Record<string, any> = {
      chinaUnitCost: nextCost.chinaUnitCost,
      shippingCost: nextCost.shippingCost,
      expectedProfit: nextCost.expectedProfit,
      internalNotes: nextCost.internalNotes,
      supplierOrderRef: nextCost.supplierOrderRef,
    };

    txn.set(costRef, sanitizeData(nextCost), { merge: true });
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'PRIVATE_COST_UPDATED' as PreOrderAuditAction,
        summary: `Updated private cost/profit data on ${order.preOrderNumber}`,
        metadata: { before: beforePrivate, after: afterPrivate },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export interface MigrateLegacyPreOrdersResult {
  scanned: number;
  migrated: number;
  skipped: number;
  errors: string[];
}

/**
 * Idempotent Admin migration helper: converts legacy single-product preOrders into
 * multi-item documents (`items[]`, `itemCount`, `totalQty`, `searchKeywords`) while
 * stripping any leaked `chinaUnitCost` from `preOrders/{id}` and preserving financials/statuses.
 */
export async function migrateLegacyPreOrdersToItems(
  actor: PreOrderActor
): Promise<MigrateLegacyPreOrdersResult> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can run the legacy pre-order migration.');
  }

  const now = Date.now();
  const snap = await getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(500)));
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const d of snap.docs) {
    scanned++;
    const raw = { ...(d.data() as PreOrder), id: d.id };
    const hasValidItems = Array.isArray(raw.items) && raw.items.length > 0;
    const hasMeta =
      typeof raw.itemCount === 'number' &&
      typeof raw.totalQty === 'number' &&
      Array.isArray(raw.searchKeywords);
    const hasLeakedCost =
      hasValidItems && raw.items!.some((it) => it && 'chinaUnitCost' in it && (it as any).chinaUnitCost !== undefined);

    if (hasValidItems && hasMeta && !hasLeakedCost) {
      skipped++;
      continue;
    }

    try {
      const normalized = normalizePreOrderItems(raw);
      const sanitizedItems = sanitizePreOrderItemsForDoc(normalized);
      const summary = summarizePreOrderItemsLegacyFields(sanitizedItems);
      const searchKeywords = buildPreOrderSearchKeywords(
        sanitizedItems,
        raw.supplierName,
        raw.supplierOrderRef
      );

      const batch = writeBatch(db);
      batch.update(
        doc(db, 'preOrders', d.id),
        sanitizeData({
          items: sanitizedItems,
          itemCount: summary.itemCount,
          totalQty: summary.totalQty,
          searchKeywords,
          updatedAt: now,
          updatedBy: actor.id,
        })
      );

      const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
      batch.set(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId: d.id,
          preOrderNumber: raw.preOrderNumber || d.id,
          action: 'LEGACY_ITEMS_MIGRATED' as PreOrderAuditAction,
          summary: `Migrated ${raw.preOrderNumber || d.id} to multi-item format (${summary.itemCount} line(s), ${summary.totalQty} pcs)`,
          metadata: {
            itemCount: summary.itemCount,
            totalQty: summary.totalQty,
            strippedLeakedCost: hasLeakedCost,
          },
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
        })
      );

      await batch.commit();
      migrated++;
    } catch (err: any) {
      errors.push(`${raw.preOrderNumber || d.id}: ${err?.message || 'Migration failed'}`);
    }
  }

  return { scanned, migrated, skipped, errors };
}

// ==========================================
// PAYMENTS LEDGER (APPEND-ONLY + VERIFY + REVERSAL + REFUND + RECALC)
// ==========================================

async function loadAndLockOrderLedgerInTxn(
  txn: Transaction,
  preOrderId: string
): Promise<PreOrderPayment[]> {
  const ledgerSnap = await getDocs(collection(db, 'preOrders', preOrderId, 'payments'));
  if (ledgerSnap.empty) return [];
  const docSnaps = await Promise.all(ledgerSnap.docs.map((d) => txn.get(d.ref)));
  return docSnaps
    .filter((s) => s.exists())
    .map((s) => ({ ...(s.data() as PreOrderPayment), id: s.id }));
}

function buildDerivedOrderFinancialPatch(
  order: PreOrder,
  ledger: PreOrderPayment[],
  actorId: string,
  now: number
) {
  const calc = calculatePreOrderFinancials({
    items: normalizePreOrderItems(order),
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    payments: ledger,
  });

  const paymentState = derivePreOrderPaymentState(
    calc.totalAmount,
    calc.verifiedCollected,
    calc.verifiedRefunded,
    order.status
  );

  const patch = {
    advancePaid: calc.verifiedCollected,
    pendingAmount: calc.pendingCollected,
    refundedAmount: calc.verifiedRefunded,
    dueAmount: calc.dueAmount,
    paymentCount: ledger.length,
    paymentState,
    updatedAt: now,
    updatedBy: actorId,
  };

  return { calc, patch };
}

export interface CollectPreOrderPaymentInput {
  type: 'advance' | 'installment' | 'additional';
  amount: number;
  method: PreOrderPaymentMethod;
  referenceNo?: string;
  receiptUrl?: string;
  receivedAt?: number;
  note?: string;
  idempotencyKey: string;
  autoVerify?: boolean;
  duplicateOverrideReason?: string;
}

export interface PaymentMutationResult {
  payment: PreOrderPayment;
  order: PreOrder;
  trackingSyncWarning?: string;
}

export async function collectPreOrderPayment(
  preOrderId: string,
  input: CollectPreOrderPaymentInput,
  actor: PreOrderActor
): Promise<PaymentMutationResult> {
  const safeAmount = roundMoney(input.amount);
  if (safeAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('Idempotency key is required for payment recording.');
  }
  if (!['advance', 'installment', 'additional'].includes(input.type)) {
    throw new Error('Payment type must be advance, installment, or additional.');
  }

  const trimmedRef = input.referenceNo?.trim() || '';
  if (input.method !== 'Cash' && !trimmedRef) {
    throw new Error(`Transaction ID / Reference No is required for ${input.method}.`);
  }

  const shouldAutoVerify =
    Boolean(input.autoVerify) &&
    input.method === 'Cash' &&
    isPreOrderAdminRole(actor.role);
  const nextStatus: PreOrderPaymentStatus = shouldAutoVerify ? 'verified' : 'pending';

  const now = Date.now();
  const safeKey = sanitizeIdFragment(input.idempotencyKey.trim());
  const paymentId = `PAY_${safeKey}`;

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const notifRef = doc(db, 'preOrderNotifications', generateId('NTF'));

  let resultPayment!: PreOrderPayment;
  let resultOrder!: PreOrder;

  await runTransaction(db, async (txn) => {
    const [orderSnap, existingPaymentSnap, existingLedger, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };

    if (existingPaymentSnap.exists()) {
      // Idempotent duplicate submission return
      resultPayment = { ...(existingPaymentSnap.data() as PreOrderPayment), id: existingPaymentSnap.id };
      resultOrder = order;
      return;
    }

    if (['Delivered', 'Cancelled', 'Refunded'].includes(order.status)) {
      throw new Error(`Cannot collect payment while pre-order status is "${order.status}".`);
    }
    if (order.convertedSaleId || order.convertedOrderId) {
      throw new Error(
        `This pre-order has already been converted to Invoice ${order.convertedInvoiceNumber || ''}. Collect remaining due on the Invoice / Due Payments screen to prevent double collection.`
      );
    }

    const currentCalc = calculatePreOrderFinancials({
      items: normalizePreOrderItems(order),
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: existingLedger,
    });

    if (toPaisa(safeAmount) > toPaisa(currentCalc.dueAmount)) {
      throw new Error(
        `Payment amount (৳${safeAmount.toLocaleString()}) exceeds current due balance (৳${currentCalc.dueAmount.toLocaleString()}).`
      );
    }

    // Duplicate (transaction ID + amount) protection on this pre-order
    if (trimmedRef) {
      const reversedIds = new Set(
        existingLedger
          .filter((p) => p.type === 'reversal' && p.reversesPaymentId)
          .map((p) => p.reversesPaymentId as string)
      );
      const duplicateMatch = existingLedger.find(
        (p) =>
          p.type !== 'reversal' &&
          p.status !== 'rejected' &&
          !reversedIds.has(p.id) &&
          (p.referenceNo || '').trim().toLowerCase() === trimmedRef.toLowerCase() &&
          toPaisa(p.amount) === toPaisa(safeAmount)
      );
      if (duplicateMatch) {
        if (!isPreOrderAdminRole(actor.role)) {
          throw new Error(
            `DUPLICATE_TXN: Transaction ID "${trimmedRef}" with amount ৳${safeAmount.toLocaleString()} already exists on ${order.preOrderNumber}. Only an Admin or Super Admin can override.`
          );
        }
        if (!input.duplicateOverrideReason?.trim()) {
          throw new Error(
            `DUPLICATE_TXN_ADMIN: Transaction ID "${trimmedRef}" with amount ৳${safeAmount.toLocaleString()} already exists on ${order.preOrderNumber}. Enter an Admin override reason to proceed.`
          );
        }
      }
    }

    const paymentDoc: PreOrderPayment = {
      id: paymentId,
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      subBrand: order.subBrand,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: input.type,
      amount: safeAmount,
      method: input.method,
      referenceNo: trimmedRef,
      receiptUrl: input.receiptUrl || '',
      receivedAt: input.receivedAt || now,
      note: input.note?.trim() || '',
      status: nextStatus,
      idempotencyKey: input.idempotencyKey.trim(),
      duplicateOverrideReason: input.duplicateOverrideReason?.trim() || '',
      recordedBy: actor.id,
      recordedByName: actor.name,
      createdAt: now,
      ...(shouldAutoVerify
        ? {
            verifiedBy: actor.id,
            verifiedByName: actor.name,
            verifiedAt: now,
          }
        : {}),
    };

    const nextLedger = [...existingLedger, paymentDoc];
    const { patch } = buildDerivedOrderFinancialPatch(order, nextLedger, actor.id, now);

    txn.set(paymentRef, sanitizeData(paymentDoc));
    txn.update(preOrderRef, sanitizeData(patch));

    if (nextStatus === 'verified') {
      const advancePosting = buildAdvanceVerifiedPosting({
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        subBrand: order.subBrand,
        paymentId,
        amount: safeAmount,
        method: input.method,
        note: input.note?.trim() || `${input.type} payment (auto-verified)`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', advancePosting.id), sanitizeData(advancePosting));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'PAYMENT_RECORDED' as PreOrderAuditAction,
        summary: `Collected ${nextStatus} ${input.type} of ৳${safeAmount.toLocaleString()} (${input.method}) on ${order.preOrderNumber}`,
        metadata: {
          paymentId,
          type: input.type,
          method: input.method,
          referenceNo: trimmedRef,
          status: nextStatus,
          duplicateOverrideReason: input.duplicateOverrideReason?.trim() || '',
          before: {
            advancePaid: order.advancePaid || 0,
            pendingAmount: order.pendingAmount || 0,
            dueAmount: order.dueAmount,
            paymentState: order.paymentState || 'unpaid',
          },
          after: {
            advancePaid: patch.advancePaid,
            pendingAmount: patch.pendingAmount,
            dueAmount: patch.dueAmount,
            paymentState: patch.paymentState,
          },
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    if (nextStatus === 'pending') {
      txn.set(
        notifRef,
        sanitizeData({
          id: notifRef.id,
          preOrderId,
          preOrderNumber: order.preOrderNumber,
          subBrand: order.subBrand,
          type: 'payment_pending',
          category: 'event',
          severity: 'warning',
          title: `Payment Pending Verification · ${order.preOrderNumber}`,
          message: `${order.preOrderNumber}: ৳${safeAmount.toLocaleString()} via ${input.method} recorded by ${actor.name} awaiting verification.`,
          targetTab: 'preorder_payments',
          forRoles: ['superadmin', 'admin', 'manager'],
          readBy: [],
          customerPhone: order.customerPhone,
          customerName: order.customerName,
          dueAmount: patch.dueAmount,
          preOrderStatus: order.status,
          createdAt: now,
          createdBy: actor.id,
        } as PreOrderNotification)
      );
    } else {
      txn.set(
        notifRef,
        sanitizeData({
          id: notifRef.id,
          preOrderId,
          preOrderNumber: order.preOrderNumber,
          subBrand: order.subBrand,
          type: 'advance_received',
          category: 'event',
          severity: 'info',
          title: `Advance Received · ${order.preOrderNumber}`,
          message: `৳${safeAmount.toLocaleString()} (${input.method}) verified for ${order.customerName}. Remaining due: ৳${patch.dueAmount.toLocaleString()}.`,
          targetTab: 'preorder_payments',
          forRoles: ['superadmin', 'admin', 'manager', 'staff'],
          readBy: [],
          customerPhone: order.customerPhone,
          customerName: order.customerName,
          dueAmount: patch.dueAmount,
          preOrderStatus: order.status,
          createdAt: now,
          createdBy: actor.id,
        } as PreOrderNotification)
      );
    }

    resultPayment = paymentDoc;
    resultOrder = { ...order, ...patch };

    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: order,
      afterOrder: resultOrder,
      pendingCountDelta: nextStatus === 'pending' ? 1 : 0,
      pendingAmountDelta: nextStatus === 'pending' ? safeAmount : 0,
      customerAdvanceLiabilityDelta: nextStatus === 'verified' ? safeAmount : 0,
      now,
    });
  });

  const syncRes = await syncPublicTracking(preOrderId);
  return {
    payment: resultPayment,
    order: resultOrder,
    trackingSyncWarning: syncRes.ok ? undefined : syncRes.error,
  };
}

export async function verifyPreOrderPayment(
  preOrderId: string,
  paymentId: string,
  decision: 'verified' | 'rejected',
  actor: PreOrderActor,
  rejectionReason?: string
): Promise<PreOrder & { trackingSyncWarning?: string }> {
  if (decision === 'rejected' && !rejectionReason?.trim()) {
    throw new Error('Please provide a reason when rejecting a payment.');
  }

  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let updatedOrder!: PreOrder & { trackingSyncWarning?: string };

  await runTransaction(db, async (txn) => {
    const [orderSnap, paySnap, existingLedger, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    if (!paySnap.exists()) throw new Error('Payment record not found.');

    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };
    const payment = { ...(paySnap.data() as PreOrderPayment), id: paySnap.id };

    if (payment.status !== 'pending') {
      throw new Error(`Payment has already been ${payment.status}.`);
    }
    if (payment.recordedBy === actor.id) {
      throw new Error(
        'Self-verification is not allowed. Another authorized verifier must verify or reject this payment.'
      );
    }

    const paymentPatch = {
      status: decision,
      verifiedBy: actor.id,
      verifiedByName: actor.name,
      verifiedAt: now,
      rejectionReason: decision === 'rejected' ? rejectionReason?.trim() || 'Rejected' : '',
    };

    const nextLedger = existingLedger.map((p) =>
      p.id === paymentId ? { ...p, ...paymentPatch } : p
    );
    const { calc, patch } = buildDerivedOrderFinancialPatch(order, nextLedger, actor.id, now);

    if (decision === 'verified' && payment.type === 'refund') {
      if (toPaisa(calc.verifiedRefunded) > toPaisa(calc.verifiedCollected)) {
        throw new Error('Cannot verify refund exceeding net verified collections.');
      }
    }

    txn.update(paymentRef, sanitizeData(paymentPatch));
    txn.update(preOrderRef, sanitizeData(patch));

    if (decision === 'verified') {
      if (payment.type === 'refund') {
        const refundPosting = buildCustomerRefundPosting({
          preOrderId,
          preOrderNumber: order.preOrderNumber,
          subBrand: order.subBrand,
          paymentId,
          refundAmount: payment.amount,
          method: payment.method,
          note: payment.note || 'Verified customer refund',
          actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
        });
        txn.set(doc(db, 'accountingPostings', refundPosting.id), sanitizeData(refundPosting));
      } else if (payment.type !== 'reversal') {
        const advancePosting = buildAdvanceVerifiedPosting({
          preOrderId,
          preOrderNumber: order.preOrderNumber,
          subBrand: order.subBrand,
          paymentId,
          amount: payment.amount,
          method: payment.method,
          note: payment.note || `Verified ${payment.type} payment`,
          actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
        });
        txn.set(doc(db, 'accountingPostings', advancePosting.id), sanitizeData(advancePosting));
      }
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: (decision === 'verified'
          ? 'PAYMENT_VERIFIED'
          : 'PAYMENT_REJECTED') as PreOrderAuditAction,
        summary: `${decision === 'verified' ? 'Verified' : 'Rejected'} ${payment.type} of ৳${payment.amount.toLocaleString()} on ${order.preOrderNumber}`,
        metadata: {
          paymentId,
          amount: payment.amount,
          decision,
          rejectionReason: paymentPatch.rejectionReason,
          before: {
            paymentStatus: payment.status,
            advancePaid: order.advancePaid || 0,
            pendingAmount: order.pendingAmount || 0,
            dueAmount: order.dueAmount,
            paymentState: order.paymentState || 'unpaid',
          },
          after: {
            paymentStatus: decision,
            advancePaid: patch.advancePaid,
            pendingAmount: patch.pendingAmount,
            dueAmount: patch.dueAmount,
            paymentState: patch.paymentState,
          },
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    updatedOrder = { ...order, ...patch };

    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: order,
      afterOrder: updatedOrder,
      pendingCountDelta: -1,
      pendingAmountDelta: payment.type !== 'refund' && payment.type !== 'reversal' ? -payment.amount : 0,
      customerAdvanceLiabilityDelta:
        decision === 'verified'
          ? payment.type === 'refund'
            ? -payment.amount
            : payment.type !== 'reversal'
            ? payment.amount
            : 0
          : 0,
      now,
    });

    const vNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      vNotifRef,
      sanitizeData({
        id: vNotifRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        subBrand: order.subBrand,
        type: decision === 'verified' ? 'payment_verified' : 'payment_rejected',
        category: 'event',
        severity: decision === 'verified' ? 'info' : 'warning',
        title: `${decision === 'verified' ? 'Payment Verified' : 'Payment Rejected'} · ${order.preOrderNumber}`,
        message:
          decision === 'verified'
            ? `৳${payment.amount.toLocaleString()} (${payment.method}) verified by ${actor.name}.`
            : `৳${payment.amount.toLocaleString()} rejected by ${actor.name}: ${paymentPatch.rejectionReason}`,
        targetTab: 'preorder_payments',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        dueAmount: patch.dueAmount,
        preOrderStatus: order.status,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );
  });

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    updatedOrder.trackingSyncWarning = syncRes.error;
  }
  return updatedOrder;
}

export async function reversePreOrderPayment(
  preOrderId: string,
  originalPaymentId: string,
  reason: string,
  actor: PreOrderActor
): Promise<PaymentMutationResult> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can reverse a verified payment entry.');
  }
  if (!reason?.trim()) {
    throw new Error('A reversal reason is required.');
  }

  const now = Date.now();
  const revId = `REV_${sanitizeIdFragment(originalPaymentId)}`;
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const origPaymentRef = doc(db, 'preOrders', preOrderId, 'payments', originalPaymentId);
  const revPaymentRef = doc(db, 'preOrders', preOrderId, 'payments', revId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let resultPayment!: PreOrderPayment;
  let resultOrder!: PreOrder;

  await runTransaction(db, async (txn) => {
    const origCollectionPostingRef = doc(
      db,
      'accountingPostings',
      getAdvanceVerifiedPostingId(preOrderId, originalPaymentId)
    );
    const origRefundPostingRef = doc(
      db,
      'accountingPostings',
      getCustomerRefundPostingId(preOrderId, originalPaymentId)
    );
    const [orderSnap, origSnap, revSnap, existingLedger, origCollectionPostingSnap, origRefundPostingSnap, statsSnap] =
      await Promise.all([
        txn.get(preOrderRef),
        txn.get(origPaymentRef),
        txn.get(revPaymentRef),
        loadAndLockOrderLedgerInTxn(txn, preOrderId),
        txn.get(origCollectionPostingRef),
        txn.get(origRefundPostingRef),
        txn.get(doc(db, 'preOrderStats', 'summary')),
      ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    if (!origSnap.exists()) throw new Error('Original payment entry not found.');

    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };
    if (revSnap.exists()) {
      resultPayment = { ...(revSnap.data() as PreOrderPayment), id: revSnap.id };
      resultOrder = order;
      return;
    }

    const orig = { ...(origSnap.data() as PreOrderPayment), id: origSnap.id };
    if (orig.type === 'reversal') {
      throw new Error('A reversal entry cannot itself be reversed.');
    }
    if (orig.status !== 'verified') {
      throw new Error('Only verified payment entries can be reversed. Reject pending entries instead.');
    }
    if (
      existingLedger.some(
        (p) => p.type === 'reversal' && p.reversesPaymentId === originalPaymentId
      )
    ) {
      throw new Error('This payment entry has already been reversed.');
    }

    const reversalDoc: PreOrderPayment = {
      id: revId,
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      subBrand: order.subBrand,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: 'reversal',
      amount: roundMoney(orig.amount),
      method: orig.method,
      referenceNo: orig.referenceNo || '',
      receivedAt: now,
      note: `Reversal of ${originalPaymentId}: ${reason.trim()}`,
      reversesPaymentId: originalPaymentId,
      reversedPaymentType: orig.type,
      reversalReason: reason.trim(),
      status: 'verified',
      idempotencyKey: revId,
      recordedBy: actor.id,
      recordedByName: actor.name,
      verifiedBy: actor.id,
      verifiedByName: actor.name,
      verifiedAt: now,
      createdAt: now,
    };

    const nextLedger = [...existingLedger, reversalDoc];

    // Guard: reversing a collection cannot leave verifiedCollected < verifiedRefunded
    const revItems = normalizePreOrderItems(order);
    const beforeCalc = calculatePreOrderFinancials({
      items: revItems,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: existingLedger,
    });
    const rawAfterCalc = calculatePreOrderFinancials({
      items: revItems,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: nextLedger,
    });
    if (
      orig.type !== 'refund' &&
      toPaisa(rawAfterCalc.verifiedCollected) < toPaisa(beforeCalc.verifiedRefunded)
    ) {
      throw new Error(
        `Cannot reverse ৳${orig.amount.toLocaleString()} because ৳${beforeCalc.verifiedRefunded.toLocaleString()} has already been refunded.`
      );
    }

    const { patch } = buildDerivedOrderFinancialPatch(order, nextLedger, actor.id, now);

    // Append-only: NEVER overwrite or delete the original payment doc
    txn.set(revPaymentRef, sanitizeData(reversalDoc));
    txn.update(preOrderRef, sanitizeData(patch));

    const targetOrigPostingSnap =
      orig.type === 'refund' ? origRefundPostingSnap : origCollectionPostingSnap;
    if (targetOrigPostingSnap.exists()) {
      const revPosting = buildReversalPosting(
        targetOrigPostingSnap.data() as AccountingPosting,
        revId,
        reason.trim(),
        { actorId: actor.id, actorName: actor.name, timestamp: now }
      );
      txn.set(doc(db, 'accountingPostings', revPosting.id), sanitizeData(revPosting));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'PAYMENT_REVERSED' as PreOrderAuditAction,
        summary: `Reversed ${orig.type} (${originalPaymentId}) of ৳${orig.amount.toLocaleString()} on ${order.preOrderNumber}: ${reason.trim()}`,
        metadata: {
          reversalPaymentId: revId,
          reversedPaymentId: originalPaymentId,
          amount: orig.amount,
          reason: reason.trim(),
          before: {
            advancePaid: order.advancePaid || 0,
            refundedAmount: order.refundedAmount || 0,
            dueAmount: order.dueAmount,
            paymentState: order.paymentState || 'unpaid',
          },
          after: {
            advancePaid: patch.advancePaid,
            refundedAmount: patch.refundedAmount,
            dueAmount: patch.dueAmount,
            paymentState: patch.paymentState,
          },
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    resultPayment = reversalDoc;
    resultOrder = { ...order, ...patch };

    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: order,
      afterOrder: resultOrder,
      customerAdvanceLiabilityDelta: orig.type === 'refund' ? orig.amount : -orig.amount,
      now,
    });
  });

  const syncRes = await syncPublicTracking(preOrderId);
  return {
    payment: resultPayment,
    order: resultOrder,
    trackingSyncWarning: syncRes.ok ? undefined : syncRes.error,
  };
}

export interface RefundPreOrderPaymentInput {
  amount: number;
  method: PreOrderPaymentMethod;
  referenceNo: string;
  reason: string;
  receiptUrl?: string;
  receivedAt?: number;
  idempotencyKey: string;
}

export async function refundPreOrderPayment(
  preOrderId: string,
  input: RefundPreOrderPaymentInput,
  actor: PreOrderActor
): Promise<PaymentMutationResult> {
  const safeAmount = roundMoney(input.amount);
  if (safeAmount <= 0) {
    throw new Error('Refund amount must be greater than zero.');
  }
  if (!input.reason?.trim()) {
    throw new Error('Refund reason is required.');
  }
  if (!input.referenceNo?.trim()) {
    throw new Error('Refund transaction ID / voucher reference is required.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('Idempotency key is required.');
  }

  const now = Date.now();
  const safeKey = sanitizeIdFragment(input.idempotencyKey.trim());
  const paymentId = `PAY_${safeKey}`;

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const notifRef = doc(db, 'preOrderNotifications', generateId('NTF'));

  let resultPayment!: PreOrderPayment;
  let resultOrder!: PreOrder;

  await runTransaction(db, async (txn) => {
    const [orderSnap, existingPaySnap, existingLedger, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };

    if (existingPaySnap.exists()) {
      resultPayment = { ...(existingPaySnap.data() as PreOrderPayment), id: existingPaySnap.id };
      resultOrder = order;
      return;
    }

    const currentCalc = calculatePreOrderFinancials({
      items: normalizePreOrderItems(order),
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: existingLedger,
    });

    if (toPaisa(safeAmount) > toPaisa(currentCalc.verifiedNetPaid)) {
      throw new Error(
        `Refund amount (৳${safeAmount.toLocaleString()}) exceeds net verified paid balance (৳${currentCalc.verifiedNetPaid.toLocaleString()}).`
      );
    }

    const refundDoc: PreOrderPayment = {
      id: paymentId,
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      subBrand: order.subBrand,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      type: 'refund',
      amount: safeAmount,
      method: input.method,
      referenceNo: input.referenceNo.trim(),
      receiptUrl: input.receiptUrl || '',
      receivedAt: input.receivedAt || now,
      note: input.reason.trim(),
      status: 'verified',
      idempotencyKey: input.idempotencyKey.trim(),
      recordedBy: actor.id,
      recordedByName: actor.name,
      verifiedBy: actor.id,
      verifiedByName: actor.name,
      verifiedAt: now,
      createdAt: now,
    };

    const nextLedger = [...existingLedger, refundDoc];
    const { patch } = buildDerivedOrderFinancialPatch(order, nextLedger, actor.id, now);

    txn.set(paymentRef, sanitizeData(refundDoc));
    txn.update(preOrderRef, sanitizeData(patch));

    const refundPosting = buildCustomerRefundPosting({
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      subBrand: order.subBrand,
      paymentId,
      refundAmount: safeAmount,
      method: input.method,
      note: input.reason.trim(),
      actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
    });
    txn.set(doc(db, 'accountingPostings', refundPosting.id), sanitizeData(refundPosting));

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'REFUND_RECORDED' as PreOrderAuditAction,
        summary: `Issued refund of ৳${safeAmount.toLocaleString()} (${input.method}) on ${order.preOrderNumber}: ${input.reason.trim()}`,
        metadata: {
          paymentId,
          amount: safeAmount,
          method: input.method,
          referenceNo: input.referenceNo.trim(),
          reason: input.reason.trim(),
          before: {
            advancePaid: order.advancePaid || 0,
            refundedAmount: order.refundedAmount || 0,
            dueAmount: order.dueAmount,
            paymentState: order.paymentState || 'unpaid',
          },
          after: {
            advancePaid: patch.advancePaid,
            refundedAmount: patch.refundedAmount,
            dueAmount: patch.dueAmount,
            paymentState: patch.paymentState,
          },
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    txn.set(
      notifRef,
      sanitizeData({
        id: notifRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        subBrand: order.subBrand,
        type: 'refund_recorded',
        category: 'event',
        severity: 'warning',
        title: `Customer Refund Recorded · ${order.preOrderNumber}`,
        message: `${order.preOrderNumber}: ৳${safeAmount.toLocaleString()} refunded via ${input.method} by ${actor.name}.`,
        targetTab: 'preorder_payments',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        dueAmount: patch.dueAmount,
        preOrderStatus: order.status,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );

    resultPayment = refundDoc;
    resultOrder = { ...order, ...patch };

    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: order,
      afterOrder: resultOrder,
      customerAdvanceLiabilityDelta: -safeAmount,
      now,
    });
  });

  const syncRes = await syncPublicTracking(preOrderId);
  return {
    payment: resultPayment,
    order: resultOrder,
    trackingSyncWarning: syncRes.ok ? undefined : syncRes.error,
  };
}

export interface RecalculateLedgerResult {
  changed: boolean;
  before: Record<string, any>;
  after: Record<string, any>;
  order: PreOrder;
  trackingSyncWarning?: string;
}

export async function recalculatePreOrderFromLedger(
  preOrderId: string,
  actor: PreOrderActor
): Promise<RecalculateLedgerResult> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can recalculate totals from the payment ledger.');
  }

  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let result!: RecalculateLedgerResult;

  await runTransaction(db, async (txn) => {
    const [orderSnap, ledger, statsSnap] = await Promise.all([
      txn.get(preOrderRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');

    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };
    const { patch } = buildDerivedOrderFinancialPatch(order, ledger, actor.id, now);

    const before = {
      advancePaid: roundMoney(order.advancePaid || 0),
      pendingAmount: roundMoney(order.pendingAmount || 0),
      refundedAmount: roundMoney(order.refundedAmount || 0),
      dueAmount: roundMoney(order.dueAmount || 0),
      paymentCount: Number(order.paymentCount || 0),
      paymentState: order.paymentState || 'unpaid',
    };

    const after = {
      advancePaid: patch.advancePaid,
      pendingAmount: patch.pendingAmount,
      refundedAmount: patch.refundedAmount,
      dueAmount: patch.dueAmount,
      paymentCount: patch.paymentCount,
      paymentState: patch.paymentState,
    };

    const changed =
      toPaisa(before.advancePaid) !== toPaisa(after.advancePaid) ||
      toPaisa(before.pendingAmount) !== toPaisa(after.pendingAmount) ||
      toPaisa(before.refundedAmount) !== toPaisa(after.refundedAmount) ||
      toPaisa(before.dueAmount) !== toPaisa(after.dueAmount) ||
      before.paymentCount !== after.paymentCount ||
      before.paymentState !== after.paymentState;

    if (changed) {
      txn.update(preOrderRef, sanitizeData(patch));

      txn.set(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId,
          preOrderNumber: order.preOrderNumber,
          action: 'LEDGER_RECALCULATED' as PreOrderAuditAction,
          summary: `Recalculated ${order.preOrderNumber} totals from ${ledger.length} payment ledger entries`,
          metadata: {
            ledgerEntries: ledger.length,
            before,
            after,
          },
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
        })
      );

      writeStatsDeltaInTxn(txn, statsSnap, {
        beforeOrder: order,
        afterOrder: { ...order, ...patch },
        pendingAmountDelta: fromPaisa(toPaisa(after.pendingAmount) - toPaisa(before.pendingAmount)),
        now,
      });
    }

    result = {
      changed,
      before,
      after,
      order: changed ? { ...order, ...patch } : order,
    };
  });

  if (result.changed) {
    const syncRes = await syncPublicTracking(preOrderId);
    if (!syncRes.ok) {
      result.trackingSyncWarning = syncRes.error;
    }
  }

  return result;
}

export async function getPreOrderPayments(
  preOrderId: string,
  limitCount: number = 100
): Promise<PreOrderPayment[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrders', preOrderId, 'payments'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderPayment), id: d.id }));
}

// ==========================================
// GLOBAL PAYMENT MANAGEMENT (COLLECTION GROUP + DUE LIST)
// ==========================================

export interface QueryPreOrderPaymentsGroupOptions {
  pageSize?: 25 | 50 | 100 | number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  status?: PreOrderPaymentStatus | 'ALL';
  type?: PreOrderPaymentType | 'ALL';
  method?: PreOrderPaymentMethod | 'ALL';
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL';
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  searchTerm?: string;
}

export interface EnrichedPreOrderPayment extends PreOrderPayment {
  isReversed?: boolean;
}

export interface QueryPreOrderPaymentsGroupResult {
  items: EnrichedPreOrderPayment[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
  indexNotice?: string;
}

function matchesPaymentFilters(
  p: PreOrderPayment,
  opts: QueryPreOrderPaymentsGroupOptions
): boolean {
  if (opts.allowedSubBrands && opts.allowedSubBrands.length > 0 && p.subBrand) {
    if (!opts.allowedSubBrands.includes(p.subBrand)) return false;
  }
  if (opts.subBrand && opts.subBrand !== 'ALL' && p.subBrand && p.subBrand !== opts.subBrand) {
    return false;
  }
  if (opts.status && opts.status !== 'ALL' && p.status !== opts.status) {
    return false;
  }
  if (opts.type && opts.type !== 'ALL' && p.type !== opts.type) {
    return false;
  }
  if (opts.method && opts.method !== 'ALL' && p.method !== opts.method) {
    return false;
  }
  if (opts.dateFrom || opts.dateTo) {
    const dayStr = new Date(p.receivedAt || p.createdAt).toISOString().split('T')[0];
    if (opts.dateFrom && dayStr < opts.dateFrom) return false;
    if (opts.dateTo && dayStr > opts.dateTo) return false;
  }
  if (opts.searchTerm?.trim()) {
    const q = opts.searchTerm.trim().toLowerCase();
    const normPhone = normalizeBdPhone(opts.searchTerm);
    const haystack = [
      p.preOrderNumber,
      p.customerName,
      p.customerPhone,
      p.referenceNo,
      p.recordedByName,
      p.verifiedByName,
      p.note,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const phoneMatch =
      normPhone.length >= 4 && normalizeBdPhone(p.customerPhone || '').includes(normPhone);
    if (!haystack.includes(q) && !phoneMatch) return false;
  }
  return true;
}

export async function queryPreOrderPaymentsGroup(
  options: QueryPreOrderPaymentsGroupOptions = {}
): Promise<QueryPreOrderPaymentsGroupResult> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 25, 1), 100);

  // Fetch reversed payment IDs from reversal entries across ledger (small set)
  const reversedPaymentIds = new Set<string>();
  try {
    const revSnap = await getDocs(
      query(collectionGroup(db, 'payments'), where('type', '==', 'reversal'), limit(500))
    );
    revSnap.forEach((d) => {
      const data = d.data() as PreOrderPayment;
      if (data.reversesPaymentId) {
        reversedPaymentIds.add(data.reversesPaymentId);
      }
    });
  } catch (err) {
    console.warn('Reversal lookup fallback:', err);
  }

  const buildPrimaryQuery = () => {
    const constraints: any[] = [];
    if (options.status && options.status !== 'ALL') {
      constraints.push(where('status', '==', options.status));
    } else if (options.type && options.type !== 'ALL') {
      constraints.push(where('type', '==', options.type));
    } else if (options.method && options.method !== 'ALL') {
      constraints.push(where('method', '==', options.method));
    }
    if (options.subBrand && options.subBrand !== 'ALL') {
      constraints.push(where('subBrand', '==', options.subBrand));
    }
    constraints.push(orderBy('createdAt', 'desc'));
    if (options.cursor) {
      constraints.push(startAfter(options.cursor));
    }
    constraints.push(limit(pageSize + 1));
    return query(collectionGroup(db, 'payments'), ...constraints);
  };

  let slicedDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let hasMore = false;
  let indexNotice: string | undefined;

  try {
    const snap = await getDocs(buildPrimaryQuery());
    hasMore = snap.docs.length > pageSize;
    slicedDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  } catch (err: any) {
    const isIndexError =
      err?.code === 'failed-precondition' ||
      String(err?.message || '').toLowerCase().includes('index');
    if (!isIndexError) throw err;

    const fallbackConstraints: any[] = [orderBy('createdAt', 'desc')];
    if (options.cursor) {
      fallbackConstraints.push(startAfter(options.cursor));
    }
    fallbackConstraints.push(limit(pageSize + 1));
    const fallbackSnap = await getDocs(
      query(collectionGroup(db, 'payments'), ...fallbackConstraints)
    );
    hasMore = fallbackSnap.docs.length > pageSize;
    slicedDocs = hasMore ? fallbackSnap.docs.slice(0, pageSize) : fallbackSnap.docs;
    indexNotice =
      'Using base collectionGroup ordering because the composite index for this filter combination has not finished building in Firebase Console yet.';
  }

  const rawPayments = slicedDocs.map((d) => ({
    ...(d.data() as PreOrderPayment),
    id: d.id,
  }));

  // Lazily hydrate parent customerName/customerPhone/subBrand if an older Part 2 entry lacks them
  const missingParentIds = Array.from(
    new Set(
      rawPayments
        .filter((p) => p.preOrderId && (!p.customerName || !p.subBrand))
        .map((p) => p.preOrderId)
    )
  );
  const parentMap = new Map<string, PreOrder>();
  if (missingParentIds.length > 0) {
    await Promise.all(
      missingParentIds.slice(0, 30).map(async (poId) => {
        try {
          const poSnap = await getDoc(doc(db, 'preOrders', poId));
          if (poSnap.exists()) {
            parentMap.set(poId, { ...(poSnap.data() as PreOrder), id: poSnap.id });
          }
        } catch {
          // ignore
        }
      })
    );
  }

  const enriched: EnrichedPreOrderPayment[] = rawPayments
    .map((p) => {
      const parent = parentMap.get(p.preOrderId);
      return {
        ...p,
        subBrand: p.subBrand || parent?.subBrand,
        customerName: p.customerName || parent?.customerName || '—',
        customerPhone: p.customerPhone || parent?.customerPhone || '',
        isReversed: reversedPaymentIds.has(p.id),
      };
    })
    .filter((p) => matchesPaymentFilters(p, options));

  const lastDoc = slicedDocs.length > 0 ? slicedDocs[slicedDocs.length - 1] : null;
  return {
    items: enriched,
    lastDoc,
    hasMore,
    indexNotice,
  };
}

export interface QueryPreOrderDueListOptions {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL';
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
  searchTerm?: string;
}

export async function queryPreOrderDueList(
  options: QueryPreOrderDueListOptions = {}
): Promise<QueryPreOrdersResult> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const pageSize = Math.min(Math.max(Number(options.pageSize) || 50, 1), 100);

  const filterDueRow = (o: PreOrder) => {
    if (toPaisa(o.dueAmount) <= 0) return false;
    if (o.status === 'Cancelled' || o.status === 'Refunded') return false;
    if (options.allowedSubBrands && options.allowedSubBrands.length > 0) {
      if (!options.allowedSubBrands.includes(o.subBrand)) return false;
    }
    if (options.subBrand && options.subBrand !== 'ALL' && o.subBrand !== options.subBrand) {
      return false;
    }
    if (options.searchTerm?.trim()) {
      const q = options.searchTerm.trim().toLowerCase();
      const normPhone = normalizeBdPhone(options.searchTerm);
      const oItems = normalizePreOrderItems(o);
      const haystack = [
        o.preOrderNumber,
        o.customerName,
        o.customerPhone,
        o.productName,
        ...(Array.isArray(o.searchKeywords) ? o.searchKeywords : []),
        ...oItems.flatMap((it) => [it.productName, it.sku, it.model, it.color]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const phoneMatch =
        normPhone.length >= 4 && normalizeBdPhone(o.customerPhone).includes(normPhone);
      if (!haystack.includes(q) && !phoneMatch) return false;
    }
    return true;
  };

  try {
    const constraints: any[] = [where('dueAmount', '>', 0), orderBy('dueAmount', 'asc'), orderBy('createdAt', 'asc')];
    if (options.cursor) constraints.push(startAfter(options.cursor));
    constraints.push(limit(pageSize + 1));

    const snap = await getDocs(query(collection(db, 'preOrders'), ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const items = sliced
      .map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }))
      .filter(filterDueRow)
      .sort((a, b) => a.createdAt - b.createdAt); // Oldest first

    return {
      items,
      lastDoc: sliced.length > 0 ? sliced[sliced.length - 1] : null,
      hasMore,
    };
  } catch (err: any) {
    const isIndexError =
      err?.code === 'failed-precondition' ||
      String(err?.message || '').toLowerCase().includes('index');
    if (!isIndexError) throw err;

    // Fallback: single-field createdAt ASC cursor
    const fallbackConstraints: any[] = [orderBy('createdAt', 'asc')];
    if (options.cursor) fallbackConstraints.push(startAfter(options.cursor));
    fallbackConstraints.push(limit(pageSize + 1));
    const snap = await getDocs(query(collection(db, 'preOrders'), ...fallbackConstraints));
    const hasMore = snap.docs.length > pageSize;
    const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const items = sliced
      .map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }))
      .filter(filterDueRow);

    return {
      items,
      lastDoc: sliced.length > 0 ? sliced[sliced.length - 1] : null,
      hasMore,
      indexNotice:
        'Using base oldest-first ordering because the composite dueAmount index has not been created yet.',
    };
  }
}

export interface PreOrderPaymentsSummaryKPIs {
  totalVerifiedAdvance: number;
  totalPendingVerification: number;
  totalCustomerDue: number;
  totalRefunded: number;
  pendingCountApprox: number;
  dueOrdersCount: number;
}

export async function getPreOrderPaymentsSummary(
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>,
  subBrandFilter?: 'SAT' | 'GZ' | 'RTX' | 'ALL'
): Promise<PreOrderPaymentsSummaryKPIs> {
  if (!auth?.currentUser) {
    return {
      totalVerifiedAdvance: 0,
      totalPendingVerification: 0,
      totalCustomerDue: 0,
      totalRefunded: 0,
      pendingCountApprox: 0,
      dueOrdersCount: 0,
    };
  }
  const [ordersSnap, pendingSnap] = await Promise.all([
    getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(500))),
    getDocs(
      query(collectionGroup(db, 'payments'), where('status', '==', 'pending'), limit(500))
    ).catch(() => null),
  ]);

  let verifiedPaisa = 0;
  let pendingPaisa = 0;
  let duePaisa = 0;
  let refundedPaisa = 0;
  let dueOrdersCount = 0;

  ordersSnap.forEach((d) => {
    const o = d.data() as PreOrder;
    if (allowedSubBrands && allowedSubBrands.length > 0 && !allowedSubBrands.includes(o.subBrand)) {
      return;
    }
    if (subBrandFilter && subBrandFilter !== 'ALL' && o.subBrand !== subBrandFilter) {
      return;
    }
    verifiedPaisa += Math.max(0, toPaisa(o.advancePaid || 0));
    pendingPaisa += Math.max(0, toPaisa(o.pendingAmount || 0));
    refundedPaisa += Math.max(0, toPaisa(o.refundedAmount || 0));
    if (o.status !== 'Cancelled' && o.status !== 'Refunded' && toPaisa(o.dueAmount) > 0) {
      duePaisa += toPaisa(o.dueAmount);
      dueOrdersCount += 1;
    }
  });

  let pendingCountApprox = 0;
  if (pendingSnap) {
    pendingSnap.forEach((d) => {
      const p = d.data() as PreOrderPayment;
      if (allowedSubBrands && allowedSubBrands.length > 0 && p.subBrand && !allowedSubBrands.includes(p.subBrand)) {
        return;
      }
      if (subBrandFilter && subBrandFilter !== 'ALL' && p.subBrand && p.subBrand !== subBrandFilter) {
        return;
      }
      pendingCountApprox += 1;
    });
  }

  return {
    totalVerifiedAdvance: fromPaisa(verifiedPaisa),
    totalPendingVerification: fromPaisa(pendingPaisa),
    totalCustomerDue: fromPaisa(duePaisa),
    totalRefunded: fromPaisa(refundedPaisa),
    pendingCountApprox,
    dueOrdersCount,
  };
}

// ==========================================
// STATUS TRANSITIONS & HISTORY (ATOMIC + GUARDED)
// ==========================================

export interface TransitionPreOrderStatusInput {
  toStatus: PreOrderStatus;
  note?: string;
  publicMessage?: string;
  notifyCustomer?: boolean;
  allowUnpaidDeliveryOverride?: boolean;
  overrideReason?: string;
}

export async function transitionPreOrderStatus(
  preOrderId: string,
  input: TransitionPreOrderStatusInput,
  actor: PreOrderActor
): Promise<PreOrder & { trackingSyncWarning?: string }> {
  const { toStatus } = input;
  const noteTrimmed = input.note?.trim() || '';
  const publicMessageTrimmed = input.publicMessage?.trim() || '';
  const overrideReasonTrimmed = input.overrideReason?.trim() || '';

  if (toStatus === PRE_ORDER_LOCKED_PART6_STATUS) {
    throw new Error(
      '"Received in Stock" is locked in Part 3. Use Receive Stock in Part 6 to update warehouse stock safely.'
    );
  }

  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const historyId = generateId('HIST');
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', historyId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let updatedOrder!: PreOrder & { trackingSyncWarning?: string };

  await runTransaction(db, async (txn) => {
    const preReadSnap = await txn.get(preOrderRef);
    if (!preReadSnap.exists()) throw new Error('Pre-order not found.');
    const prelimOrder = { ...(preReadSnap.data() as PreOrder), id: preReadSnap.id };
    const convertedOrderRef =
      prelimOrder.convertedSaleId || prelimOrder.convertedOrderId
        ? doc(db, 'orders', (prelimOrder.convertedSaleId || prelimOrder.convertedOrderId)!)
        : null;

    const [ledger, convertedOrderSnap, statsSnap] = await Promise.all([
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      convertedOrderRef ? txn.get(convertedOrderRef) : Promise.resolve(null),
      txn.get(doc(db, 'preOrderStats', 'summary')),
    ]);

    const order = withNormalizedPreOrderItems(prelimOrder);
    if (order.status === toStatus) {
      throw new Error(`Pre-order is already in "${toStatus}" status.`);
    }

    const calc = calculatePreOrderFinancials({
      items: normalizePreOrderItems(order),
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: ledger,
    });

    const isAdmin = isPreOrderAdminRole(actor.role);
    const currentIdx = PRE_ORDER_FORWARD_FLOW.indexOf(order.status);
    const targetIdx = PRE_ORDER_FORWARD_FLOW.indexOf(toStatus);
    const isBackwardMove =
      currentIdx !== -1 &&
      targetIdx !== -1 &&
      targetIdx < currentIdx &&
      !['Delivered', 'Cancelled', 'Refunded'].includes(order.status);

    if (isBackwardMove) {
      if (!isAdmin) {
        throw new Error('Only Admin or Super Admin can move a pre-order backward to an earlier stage.');
      }
      if (!noteTrimmed) {
        throw new Error('A reason/note is required when moving a pre-order backward.');
      }
    } else {
      const validation = canTransitionPreOrderStatus(
        order.status,
        toStatus,
        calc.verifiedNetPaid,
        calc.verifiedRefunded
      );
      if (!validation.allowed) {
        throw new Error(validation.reason || 'Invalid status transition.');
      }
    }

    // Special status guards
    if (toStatus === 'Cancelled') {
      if (order.convertedSaleId || order.convertedOrderId) {
        throw new Error(
          'This pre-order has already been converted to a Sales Order & Invoice. Cancel it from Order Desk instead.'
        );
      }
      if (toPaisa(calc.verifiedNetPaid) > 0 || Number(order.stockReceivedQty || 0) > 0) {
        throw new Error(
          'This pre-order has verified customer payments or received stock. Use the "Cancel & Reconcile" workflow to settle refunds, supplier balance, and inventory safely.'
        );
      }
      if (!noteTrimmed) {
        throw new Error('Cancellation reason is required.');
      }
      if (order.status === 'Delivered') {
        throw new Error('Delivered pre-orders cannot be cancelled.');
      }
    }

    // When converted to Sale/Invoice, check converted Order/Invoice remaining due too
    const convertedOrderData =
      convertedOrderSnap && convertedOrderSnap.exists() ? (convertedOrderSnap.data() as Order) : null;
    const effectiveRemainingDue = convertedOrderData
      ? roundMoney(convertedOrderData.amountDue || 0)
      : calc.dueAmount;

    let loggedOverrideReason = '';
    if (toStatus === 'Delivered' && toPaisa(effectiveRemainingDue) > 0) {
      if (!isAdmin) {
        throw new Error(
          `Cannot mark as Delivered while ৳${effectiveRemainingDue.toLocaleString()} due remains. Collect remaining payment first or ask an Admin to override.`
        );
      }
      if (!input.allowUnpaidDeliveryOverride || !(overrideReasonTrimmed || noteTrimmed)) {
        throw new Error(
          `Remaining due is ৳${effectiveRemainingDue.toLocaleString()}. Admin unpaid-delivery override and a reason are required.`
        );
      }
      loggedOverrideReason = overrideReasonTrimmed || noteTrimmed;
    }

    const paymentState = convertedOrderData
      ? effectiveRemainingDue <= 0
        ? 'fully_paid'
        : Number(convertedOrderData.amountPaid || 0) > 0
        ? 'partially_paid'
        : 'unpaid'
      : derivePreOrderPaymentState(
          calc.totalAmount,
          calc.verifiedCollected,
          calc.verifiedRefunded,
          toStatus
        );

    const orderUpdate: Record<string, any> = {
      status: toStatus,
      advancePaid: convertedOrderData ? roundMoney(convertedOrderData.amountPaid || 0) : calc.verifiedCollected,
      pendingAmount: calc.pendingCollected,
      refundedAmount: calc.verifiedRefunded,
      dueAmount: effectiveRemainingDue,
      paymentCount: ledger.length,
      paymentState,
      lastStatusChangeAt: now,
      updatedAt: now,
      updatedBy: actor.id,
    };

    if (toStatus === 'Cancelled') {
      orderUpdate.isCancelled = true;
      orderUpdate.cancellationReason = noteTrimmed;
      orderUpdate.cancelledAt = now;
      orderUpdate.cancelledBy = actor.id;
    }

    txn.update(preOrderRef, sanitizeData(orderUpdate));

    const historyDoc: PreOrderStatusHistory = {
      id: historyId,
      preOrderId,
      fromStatus: order.status,
      toStatus,
      note: noteTrimmed,
      publicMessage: publicMessageTrimmed || '',
      notifyCustomer: Boolean(input.notifyCustomer),
      isBackwardMove,
      overrideReason: loggedOverrideReason || '',
      changedBy: actor.id,
      changedByName: actor.name,
      timestamp: now,
    };
    txn.set(historyRef, sanitizeData(historyDoc));

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'STATUS_CHANGED' as PreOrderAuditAction,
        summary: `Changed ${order.preOrderNumber} status: ${order.status} → ${toStatus}${
          isBackwardMove ? ' (Backward move)' : ''
        }${loggedOverrideReason ? ' (Unpaid delivery override)' : ''}`,
        metadata: {
          before: { status: order.status, isCancelled: Boolean(order.isCancelled) },
          after: { status: toStatus, isCancelled: toStatus === 'Cancelled' },
          note: noteTrimmed,
          publicMessage: publicMessageTrimmed,
          notifyCustomer: Boolean(input.notifyCustomer),
          isBackwardMove,
          overrideReason: loggedOverrideReason,
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    updatedOrder = { ...order, ...orderUpdate } as PreOrder;

    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: order,
      afterOrder: updatedOrder,
      now,
    });

    const stMeta = mapStatusToNotificationType(toStatus);
    const stNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      stNotifRef,
      sanitizeData({
        id: stNotifRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        subBrand: order.subBrand,
        type: stMeta.type,
        category: 'event',
        severity: stMeta.severity,
        title: `${toStatus} · ${order.preOrderNumber}`,
        message: `${formatPreOrderProductLabel(order)} for ${order.customerName} moved from ${order.status} to ${toStatus}.${
          noteTrimmed ? ` Note: ${noteTrimmed}` : ''
        }`,
        targetTab: stMeta.targetTab,
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: order.customerPhone,
        customerName: order.customerName,
        dueAmount: updatedOrder.dueAmount,
        estimatedArrivalDate: updatedOrder.estimatedDeliveryDate,
        preOrderStatus: toStatus,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );
  });

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    updatedOrder.trackingSyncWarning = syncRes.error;
  }
  return updatedOrder;
}

export async function getPreOrderStatusHistory(
  preOrderId: string,
  limitCount: number = 50
): Promise<PreOrderStatusHistory[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrders', preOrderId, 'statusHistory'),
    orderBy('timestamp', 'asc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderStatusHistory), id: d.id }));
}

// ==========================================
// SHIPMENT SUB-DOCUMENT, EXPENSES, DOCS, EVENTS & PUBLIC TRACKING
// ==========================================

export interface UpsertPreOrderShipmentInput
  extends Omit<PreOrderShipment, 'preOrderId' | 'updatedBy' | 'updatedAt' | 'previousEstimatedArrivalDate'> {
  showToCustomer?: boolean;
  publicMessage?: string;
}

export interface UpsertPreOrderShipmentResult {
  shipment: PreOrderShipment;
  suggestedNextStatus?: PreOrderStatus;
  suggestionReason?: string;
  isDelayed: boolean;
  trackingSyncWarning?: string;
}

export async function upsertPreOrderShipment(
  preOrderId: string,
  shipmentInput: UpsertPreOrderShipmentInput,
  actor: PreOrderActor
): Promise<UpsertPreOrderShipmentResult> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const shipmentRef = doc(db, 'preOrders', preOrderId, 'shipment', 'details');
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const eventRef = doc(db, 'preOrders', preOrderId, 'shipmentEvents', generateId('SHPEVT'));

  const { showToCustomer, publicMessage, ...cleanShipmentFields } = shipmentInput;

  let result!: UpsertPreOrderShipmentResult;

  await runTransaction(db, async (txn) => {
    const [orderSnap, prevShipmentSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(shipmentRef),
    ]);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };
    const prevShipment = prevShipmentSnap.exists()
      ? (prevShipmentSnap.data() as PreOrderShipment)
      : ({} as Partial<PreOrderShipment>);

    const prevEta = prevShipment.estimatedArrivalDate || order.estimatedDeliveryDate || '';
    const nextEta =
      cleanShipmentFields.estimatedArrivalDate !== undefined
        ? cleanShipmentFields.estimatedArrivalDate
        : prevEta;

    const etaPushedLater = Boolean(prevEta && nextEta && nextEta > prevEta);
    const nextDelayed =
      cleanShipmentFields.isDelayed !== undefined
        ? Boolean(cleanShipmentFields.isDelayed) || etaPushedLater
        : Boolean(prevShipment.isDelayed || order.isDelayed || etaPushedLater);

    const shipmentDoc: PreOrderShipment = {
      ...prevShipment,
      ...cleanShipmentFields,
      preOrderId,
      estimatedArrivalDate: nextEta,
      previousEstimatedArrivalDate: etaPushedLater
        ? prevEta
        : prevShipment.previousEstimatedArrivalDate || order.previousEstimatedArrivalDate || '',
      isDelayed: nextDelayed,
      updatedBy: actor.id,
      updatedAt: now,
    };

    // Strip any restricted cost keys in case of accidental spread
    const safeShipmentDoc = { ...shipmentDoc } as Record<string, any>;
    for (const forbidden of [
      'chinaUnitCost',
      'shippingCost',
      'expectedProfit',
      'internalNotes',
      'supplierUnitCost',
      'actualShippingCost',
      'internationalFreight',
      'customsDuty',
      'localTransport',
      'handlingOther',
      'shippingExpenses',
    ]) {
      delete safeShipmentDoc[forbidden];
    }

    txn.set(shipmentRef, sanitizeData(safeShipmentDoc), { merge: true });

    const summaryTrackingNo =
      shipmentDoc.trackingNumber ||
      shipmentDoc.bdTrackingNo ||
      shipmentDoc.chinaTrackingNo ||
      order.trackingNumber ||
      '';
    const summaryCourier =
      shipmentDoc.bdCourier || shipmentDoc.freightForwarder || order.courier || '';

    const orderPatch = {
      supplierOrderRef:
        shipmentDoc.supplierOrderRef !== undefined
          ? shipmentDoc.supplierOrderRef
          : order.supplierOrderRef || '',
      chinaOrderDate: shipmentDoc.chinaOrderDate || '',
      shippingMethod: shipmentDoc.shippingMethod || '',
      freightForwarder: shipmentDoc.freightForwarder || '',
      forwarderContact: shipmentDoc.forwarderContact || '',
      trackingNumber: summaryTrackingNo,
      carrierTrackingUrl: shipmentDoc.carrierTrackingUrl || '',
      courier: summaryCourier,
      shippedFromChinaAt: shipmentDoc.shippedFromChinaAt || '',
      estimatedDeliveryDate: nextEta,
      previousEstimatedArrivalDate: shipmentDoc.previousEstimatedArrivalDate || '',
      arrivedBdAt: shipmentDoc.arrivedBdAt || '',
      customsStatus: shipmentDoc.customsStatus || 'Not started',
      customsClearanceDate: shipmentDoc.customsClearanceDate || '',
      isDelayed: nextDelayed,
      updatedAt: now,
      updatedBy: actor.id,
    };

    txn.update(preOrderRef, sanitizeData(orderPatch));

    // Diff for audit & auto shipment event
    const compareKeys: Array<keyof PreOrderShipment> = [
      'supplierOrderRef',
      'chinaOrderDate',
      'shippingMethod',
      'freightForwarder',
      'forwarderContact',
      'trackingNumber',
      'carrierTrackingUrl',
      'shippedFromChinaAt',
      'estimatedArrivalDate',
      'arrivedBdAt',
      'customsStatus',
      'customsClearanceDate',
    ];
    const beforeDiff: Record<string, any> = {};
    const afterDiff: Record<string, any> = {};
    const autoChangeNotes: string[] = [];

    for (const k of compareKeys) {
      const oldV = (prevShipment as any)[k] ?? (order as any)[k] ?? '';
      const newV = (shipmentDoc as any)[k] ?? '';
      if (String(oldV) !== String(newV)) {
        beforeDiff[k] = oldV;
        afterDiff[k] = newV;
        if (k === 'trackingNumber' && newV) {
          autoChangeNotes.push(`Tracking No set to ${newV}`);
        } else if (k === 'customsStatus' && newV) {
          autoChangeNotes.push(`Customs status: ${newV}`);
        } else if (k === 'shippedFromChinaAt' && newV) {
          autoChangeNotes.push(`Dispatched from China (${newV})`);
        } else if (k === 'arrivedBdAt' && newV) {
          autoChangeNotes.push(`Arrived in Bangladesh (${newV})`);
        } else if (k === 'estimatedArrivalDate' && newV) {
          autoChangeNotes.push(
            etaPushedLater
              ? `Expected arrival delayed from ${prevEta} to ${newV}`
              : `Expected arrival updated to ${newV}`
          );
        }
      }
    }

    const nowDateObj = new Date(now);
    const eventText =
      autoChangeNotes.length > 0
        ? autoChangeNotes.join(' • ')
        : `Updated shipment details (${shipmentDoc.shippingMethod || 'Logistics'})`;

    if (autoChangeNotes.length > 0 || showToCustomer) {
      const eventDoc: PreOrderShipmentEvent = {
        id: eventRef.id,
        preOrderId,
        date: nowDateObj.toISOString().split('T')[0],
        time: nowDateObj.toTimeString().slice(0, 5),
        timestamp: now,
        staffId: actor.id,
        staffName: actor.name,
        text: eventText,
        showToCustomer: Boolean(showToCustomer),
        publicMessage: publicMessage?.trim() || (showToCustomer ? eventText : ''),
        source: 'auto',
        eventType: 'shipment_update',
      };
      txn.set(eventRef, sanitizeData(eventDoc));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'SHIPMENT_UPDATED' as PreOrderAuditAction,
        summary:
          autoChangeNotes.length > 0
            ? `${order.preOrderNumber}: ${autoChangeNotes.join(', ')}`
            : `Updated shipment details on ${order.preOrderNumber}`,
        metadata: {
          before: beforeDiff,
          after: afterDiff,
          isDelayed: nextDelayed,
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    // Non-forcing status suggestions
    let suggestedNextStatus: PreOrderStatus | undefined;
    let suggestionReason: string | undefined;

    if (
      shipmentDoc.customsStatus === 'Cleared' &&
      Boolean(shipmentDoc.arrivedBdAt) &&
      ['Ordered from China', 'China Warehouse', 'International Shipment', 'Customs Clearance'].includes(
        order.status
      )
    ) {
      suggestedNextStatus = 'Arrived in Bangladesh';
      suggestionReason =
        'Customs is Cleared and BD Arrival Date is set. Update order status to "Arrived in Bangladesh"?';
    } else if (
      Boolean(shipmentDoc.trackingNumber) &&
      ['Advance Received', 'Order Confirmed', 'Ordered from China', 'China Warehouse'].includes(
        order.status
      )
    ) {
      suggestedNextStatus = 'International Shipment';
      suggestionReason =
        'Tracking number has been saved. Update order status to "International Shipment"?';
    }

    result = {
      shipment: shipmentDoc,
      suggestedNextStatus,
      suggestionReason,
      isDelayed: nextDelayed,
    };
  });

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    result.trackingSyncWarning = syncRes.error;
  }

  return result;
}

export async function getPreOrderShipment(
  preOrderId: string
): Promise<PreOrderShipment | null> {
  if (!auth?.currentUser) return null;
  const snap = await getDoc(doc(db, 'preOrders', preOrderId, 'shipment', 'details'));
  if (!snap.exists()) return null;
  return snap.data() as PreOrderShipment;
}

/**
 * Restricted Shipping Expenses breakdown saved inside `preOrders/{id}/private/cost`
 * so staff without `preOrderSupplier` / `preOrderViewProfit` are blocked in both UI and Firestore rules.
 */
export async function updatePreOrderShippingExpenses(
  preOrderId: string,
  breakdown: PreOrderShippingExpensesBreakdown,
  actor: PreOrderActor
): Promise<{ actualShippingCost: number; shippingExpenses: PreOrderShippingExpensesBreakdown }> {
  const freight = roundMoney(breakdown.internationalFreight);
  const customs = roundMoney(breakdown.customsDuty);
  const local = roundMoney(breakdown.localTransport);
  const handling = roundMoney(breakdown.handlingOther);

  if (freight < 0 || customs < 0 || local < 0 || handling < 0) {
    throw new Error('Shipping expense amounts cannot be negative.');
  }

  const paymentMethod = (breakdown.paymentMethod || 'Cash').trim() || 'Cash';

  const sanitizedBreakdown: PreOrderShippingExpensesBreakdown = {
    internationalFreight: freight,
    customsDuty: customs,
    localTransport: local,
    handlingOther: handling,
    paymentMethod,
    freightReceiptUrl: breakdown.freightReceiptUrl || '',
    customsReceiptUrl: breakdown.customsReceiptUrl || '',
    localReceiptUrl: breakdown.localReceiptUrl || '',
    handlingReceiptUrl: breakdown.handlingReceiptUrl || '',
  };
  const actualShippingCost = calculateActualShippingCost(sanitizedBreakdown);

  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const [orderSnap, costSnap] = await Promise.all([txn.get(preOrderRef), txn.get(costRef)]);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = orderSnap.data() as PreOrder;
    const prevCost = costSnap.exists() ? (costSnap.data() as PreOrderPrivateCost) : null;
    const prevActual = roundMoney(
      prevCost?.actualShippingCost ??
        calculateActualShippingCost(prevCost?.shippingExpenses) ??
        0
    );
    const prevSeq = Number(prevCost?.shippingExpenses?.shippingExpenseSeq || 0);
    const nextSeq = prevSeq + 1;
    sanitizedBreakdown.shippingExpenseSeq = nextSeq;

    const deltaShipping = fromPaisa(toPaisa(actualShippingCost) - toPaisa(prevActual));

    const nextCostPatch: Partial<PreOrderPrivateCost> = {
      preOrderId,
      chinaUnitCost: prevCost?.chinaUnitCost ?? 0,
      shippingCost: prevCost?.shippingCost ?? 0,
      expectedProfit: prevCost?.expectedProfit ?? 0,
      shippingExpenses: sanitizedBreakdown,
      actualShippingCost,
      updatedAt: now,
      updatedBy: actor.id,
    };

    txn.set(costRef, sanitizeData(nextCostPatch), { merge: true });

    if (Math.abs(toPaisa(deltaShipping)) > 0) {
      const shipPosting = buildShippingExpensePosting({
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        subBrand: order.subBrand,
        expenseSeqOrId: `seq${nextSeq}`,
        deltaAmount: deltaShipping,
        method: paymentMethod,
        note: `Shipping expense ${deltaShipping >= 0 ? 'added' : 'adjusted'} (${paymentMethod}): ৳${deltaShipping.toLocaleString()}`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', shipPosting.id), sanitizeData(shipPosting));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'PRIVATE_COST_UPDATED' as PreOrderAuditAction,
        summary: `Updated restricted shipping expense breakdown on ${order.preOrderNumber} (Actual total: ৳${actualShippingCost.toLocaleString()}, via ${paymentMethod})`,
        metadata: {
          before: { actualShippingCost: prevActual },
          after: { actualShippingCost, paymentMethod, deltaShipping },
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });

  return { actualShippingCost, shippingExpenses: sanitizedBreakdown };
}

export async function getPreOrderShipmentDocs(
  preOrderId: string,
  includeDeleted: boolean = false
): Promise<PreOrderShipmentDoc[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrders', preOrderId, 'shipmentDocs'),
    orderBy('uploadedAt', 'desc'),
    limit(100)
  );
  const snap = await getDocs(q);
  const docs = snap.docs.map((d) => ({ ...(d.data() as PreOrderShipmentDoc), id: d.id }));
  return includeDeleted ? docs : docs.filter((d) => !d.isDeleted);
}

export async function addPreOrderShipmentDoc(
  preOrderId: string,
  input: Omit<
    PreOrderShipmentDoc,
    'id' | 'preOrderId' | 'uploadedBy' | 'uploadedByName' | 'uploadedAt' | 'isDeleted'
  >,
  actor: PreOrderActor
): Promise<PreOrderShipmentDoc> {
  const now = Date.now();
  const docId = generateId('SHPDOC');
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const docRef = doc(db, 'preOrders', preOrderId, 'shipmentDocs', docId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let createdDoc!: PreOrderShipmentDoc;

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(preOrderRef);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = orderSnap.data() as PreOrder;

    createdDoc = {
      id: docId,
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      docType: input.docType,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      storagePath: input.storagePath || '',
      contentType: input.contentType || '',
      fileSize: input.fileSize || 0,
      note: input.note?.trim() || '',
      uploadedBy: actor.id,
      uploadedByName: actor.name,
      uploadedAt: now,
      isDeleted: false,
    };

    txn.set(docRef, sanitizeData(createdDoc));
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'SHIPMENT_DOC_UPLOADED' as PreOrderAuditAction,
        summary: `Uploaded ${input.docType} document "${input.fileName}" on ${order.preOrderNumber}`,
        metadata: { docId, docType: input.docType, fileName: input.fileName },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });

  return createdDoc;
}

export async function softDeletePreOrderShipmentDoc(
  preOrderId: string,
  docId: string,
  reason: string,
  actor: PreOrderActor
): Promise<void> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can delete shipment documents.');
  }
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const docRef = doc(db, 'preOrders', preOrderId, 'shipmentDocs', docId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const [orderSnap, docSnap] = await Promise.all([txn.get(preOrderRef), txn.get(docRef)]);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    if (!docSnap.exists()) throw new Error('Document not found.');
    const order = orderSnap.data() as PreOrder;
    const prevDoc = docSnap.data() as PreOrderShipmentDoc;

    txn.update(
      docRef,
      sanitizeData({
        isDeleted: true,
        deletedBy: actor.id,
        deletedByName: actor.name,
        deletedAt: now,
        deleteReason: reason?.trim() || 'Removed by Admin',
      })
    );
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'SHIPMENT_DOC_DELETED' as PreOrderAuditAction,
        summary: `Soft-deleted shipment document "${prevDoc.fileName}" on ${order.preOrderNumber}`,
        metadata: { docId, fileName: prevDoc.fileName, deleteReason: reason?.trim() || '' },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export async function getPreOrderShipmentEvents(
  preOrderId: string,
  limitCount: number = 100
): Promise<PreOrderShipmentEvent[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrders', preOrderId, 'shipmentEvents'),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderShipmentEvent), id: d.id }));
}

export async function addPreOrderShipmentEvent(
  preOrderId: string,
  input: {
    text: string;
    date?: string;
    time?: string;
    showToCustomer: boolean;
    publicMessage?: string;
  },
  actor: PreOrderActor
): Promise<PreOrderShipmentEvent & { trackingSyncWarning?: string }> {
  if (!input.text?.trim()) {
    throw new Error('Event update text is required.');
  }
  const now = Date.now();
  const nowDate = new Date(now);
  const eventId = generateId('SHPEVT');
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const eventRef = doc(db, 'preOrders', preOrderId, 'shipmentEvents', eventId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let createdEvent!: PreOrderShipmentEvent & { trackingSyncWarning?: string };

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(preOrderRef);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = orderSnap.data() as PreOrder;

    createdEvent = {
      id: eventId,
      preOrderId,
      date: input.date || nowDate.toISOString().split('T')[0],
      time: input.time || nowDate.toTimeString().slice(0, 5),
      timestamp: now,
      staffId: actor.id,
      staffName: actor.name,
      text: input.text.trim(),
      showToCustomer: Boolean(input.showToCustomer),
      publicMessage: input.publicMessage?.trim() || (input.showToCustomer ? input.text.trim() : ''),
      source: 'manual',
      eventType: 'shipment_update',
    };

    txn.set(eventRef, sanitizeData(createdEvent));

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'SHIPMENT_EVENT_ADDED' as PreOrderAuditAction,
        summary: `Added shipment update on ${order.preOrderNumber}: "${createdEvent.text}"`,
        metadata: { eventId, showToCustomer: createdEvent.showToCustomer },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });

  if (createdEvent.showToCustomer) {
    const syncRes = await syncPublicTracking(preOrderId);
    if (!syncRes.ok) {
      createdEvent.trackingSyncWarning = syncRes.error;
    }
  }

  return createdEvent;
}

export async function queryShipmentTrackingOrders(options: {
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
  limitCount?: number;
} = {}): Promise<PreOrder[]> {
  if (!auth?.currentUser) return [];
  const pageSize = Math.min(Math.max(options.limitCount || 150, 20), 250);
  const q = query(
    collection(db, 'preOrders'),
    orderBy('updatedAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
  if (options.allowedSubBrands && options.allowedSubBrands.length > 0 && options.allowedSubBrands.length < 3) {
    return rows.filter((r) => options.allowedSubBrands!.includes(r.subBrand));
  }
  return rows;
}

export interface BatchShipmentPatchInput {
  freightForwarder?: string;
  forwarderContact?: string;
  shippingMethod?: PreOrderShippingMethod | string;
  trackingNumber?: string;
  carrierTrackingUrl?: string;
  shippedFromChinaAt?: string;
  estimatedArrivalDate?: string;
  customsStatus?: PreOrderCustomsStatus | string;
}

export async function batchUpdatePreOrderShipments(
  orders: PreOrder[],
  patch: BatchShipmentPatchInput,
  actor: PreOrderActor
): Promise<number> {
  if (!orders || orders.length === 0) return 0;

  const hasAnyField = Object.values(patch).some((v) => v !== undefined && String(v).trim() !== '');
  if (!hasAnyField) {
    throw new Error('Enter at least one shipment field to apply in batch.');
  }

  const now = Date.now();
  const nowDate = new Date(now);
  const dateStr = nowDate.toISOString().split('T')[0];
  const timeStr = nowDate.toTimeString().slice(0, 5);

  const CHUNK_SIZE = 80;
  let updatedCount = 0;

  for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
    const chunk = orders.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const order of chunk) {
      const preOrderRef = doc(db, 'preOrders', order.id);
      const shipmentRef = doc(db, 'preOrders', order.id, 'shipment', 'details');
      const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
      const eventRef = doc(db, 'preOrders', order.id, 'shipmentEvents', generateId('SHPEVT'));

      const orderUpdate: Record<string, any> = {
        updatedAt: now,
        updatedBy: actor.id,
      };
      const shipmentUpdate: Record<string, any> = {
        preOrderId: order.id,
        updatedAt: now,
        updatedBy: actor.id,
      };
      const afterDiff: Record<string, any> = {};
      const beforeDiff: Record<string, any> = {};
      const changeNotes: string[] = [];

      const applyField = (key: keyof BatchShipmentPatchInput, orderKey: string = key) => {
        const val = patch[key];
        if (val === undefined || String(val).trim() === '') return;
        const cleanVal = String(val).trim();
        const prevVal = (order as any)[orderKey] || '';
        beforeDiff[orderKey] = prevVal;
        afterDiff[orderKey] = cleanVal;
        orderUpdate[orderKey] = cleanVal;
        shipmentUpdate[key] = cleanVal;
      };

      applyField('freightForwarder');
      applyField('forwarderContact');
      applyField('shippingMethod');
      applyField('trackingNumber');
      applyField('carrierTrackingUrl');
      applyField('shippedFromChinaAt');
      applyField('customsStatus');

      if (patch.estimatedArrivalDate?.trim()) {
        const nextEta = patch.estimatedArrivalDate.trim();
        const prevEta = order.estimatedDeliveryDate || '';
        const pushedLater = Boolean(prevEta && nextEta > prevEta);
        beforeDiff.estimatedDeliveryDate = prevEta;
        afterDiff.estimatedDeliveryDate = nextEta;
        orderUpdate.estimatedDeliveryDate = nextEta;
        shipmentUpdate.estimatedArrivalDate = nextEta;
        if (pushedLater) {
          orderUpdate.previousEstimatedArrivalDate = prevEta;
          orderUpdate.isDelayed = true;
          shipmentUpdate.previousEstimatedArrivalDate = prevEta;
          shipmentUpdate.isDelayed = true;
          changeNotes.push(`ETA delayed to ${nextEta}`);
        } else {
          changeNotes.push(`ETA set to ${nextEta}`);
        }
      }

      if (patch.trackingNumber?.trim()) {
        changeNotes.push(`Tracking No: ${patch.trackingNumber.trim()}`);
      }
      if (patch.freightForwarder?.trim()) {
        orderUpdate.courier = patch.freightForwarder.trim();
        changeNotes.push(`Forwarder: ${patch.freightForwarder.trim()}`);
      }
      if (patch.customsStatus?.trim()) {
        changeNotes.push(`Customs: ${patch.customsStatus.trim()}`);
      }

      batch.update(preOrderRef, sanitizeData(orderUpdate));
      batch.set(shipmentRef, sanitizeData(shipmentUpdate), { merge: true });

      const summaryText =
        changeNotes.length > 0
          ? `Batch shipment update: ${changeNotes.join(' • ')}`
          : 'Batch shipment update applied';

      batch.set(
        eventRef,
        sanitizeData({
          id: eventRef.id,
          preOrderId: order.id,
          date: dateStr,
          time: timeStr,
          timestamp: now,
          staffId: actor.id,
          staffName: actor.name,
          text: summaryText,
          showToCustomer: false,
          source: 'auto',
          eventType: 'shipment_update',
        } as PreOrderShipmentEvent)
      );

      batch.set(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId: order.id,
          preOrderNumber: order.preOrderNumber,
          action: 'SHIPMENT_UPDATED' as PreOrderAuditAction,
          summary: `${order.preOrderNumber}: ${summaryText}`,
          metadata: {
            batch: true,
            before: beforeDiff,
            after: afterDiff,
          },
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
        })
      );

      updatedCount++;
    }

    await batch.commit();
  }

  // Resync publicTracking snapshots cleanly via centralized builder
  const sharedSettings = await getCompanySettings().catch(() => null);
  await Promise.allSettled(
    orders.map((o) => syncPublicTracking(o.id, { companySettings: sharedSettings }))
  );

  return updatedCount;
}

// ==========================================
// PART 5: CENTRALIZED PUBLIC TRACKING ENGINE & LIFECYCLE
// ==========================================

export interface SyncPublicTrackingResult {
  ok: boolean;
  error?: string;
}

/**
 * Rebuilds the strict whitelist-only `publicTracking/{token}` document from real Firestore data.
 * Never writes full name, phone, address, costs, profits, internal notes, receipt URLs, or staff names.
 */
export async function syncPublicTracking(
  preOrderId: string,
  options?: {
    companySettings?: CompanySettings | null;
    actor?: PreOrderActor;
    logAudit?: boolean;
  }
): Promise<SyncPublicTrackingResult> {
  try {
    const order = await getPreOrderById(preOrderId);
    if (!order) {
      return { ok: false, error: 'Pre-order not found for tracking sync.' };
    }

    const token = (order.trackingToken || order.trackingTokenId || '').trim();
    if (!token) {
      return { ok: false, error: 'Pre-order does not have a tracking token yet.' };
    }

    const trackingRef = doc(db, 'publicTracking', token);
    const now = Date.now();

    if (order.trackingEnabled === false) {
      await setDoc(trackingRef, sanitizeData(buildDisabledPublicTrackingDoc(now)));
      return { ok: true };
    }

    const saleId = order.convertedSaleId || order.convertedOrderId;
    const [payments, statusHistory, shipmentEvents, companySettings, convertedOrdSnap] = await Promise.all([
      getPreOrderPayments(preOrderId, 100),
      getPreOrderStatusHistory(preOrderId, 100),
      getPreOrderShipmentEvents(preOrderId, 100),
      options?.companySettings !== undefined
        ? Promise.resolve(options.companySettings)
        : getCompanySettings().catch(() => null),
      saleId ? getDoc(doc(db, 'orders', saleId)).catch(() => null) : Promise.resolve(null),
    ]);

    const convertedOrderData =
      convertedOrdSnap && convertedOrdSnap.exists() ? (convertedOrdSnap.data() as Order) : null;

    const whitelistedDoc = buildWhitelistedPublicTrackingDoc({
      order,
      payments,
      statusHistory,
      shipmentEvents,
      postConversionPayments: convertedOrderData?.paymentHistory || [],
      companySettings,
      now,
    });

    await setDoc(trackingRef, sanitizeData(whitelistedDoc));

    if (options?.logAudit && options?.actor) {
      const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
      await setDoc(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId: order.id,
          preOrderNumber: order.preOrderNumber,
          action: 'TRACKING_LINK_SYNCED' as PreOrderAuditAction,
          summary: `Manually resynced customer tracking snapshot for ${order.preOrderNumber}`,
          userId: options.actor.id,
          userName: options.actor.name,
          userRole: options.actor.role,
          timestamp: now,
        })
      ).catch(() => {});
    }

    return { ok: true };
  } catch (err: any) {
    const msg =
      err?.code === 'permission-denied'
        ? 'Tracking link sync requires "Manage Tracking & Links" permission.'
        : err?.message || 'Failed to sync public tracking document.';
    return { ok: false, error: msg };
  }
}

/**
 * Admin/Super Admin: Regenerates a 256-bit cryptographically random token for a pre-order.
 * Atomically creates the new `publicTracking/{newToken}`, removes the old `publicTracking/{oldToken}`,
 * updates `preOrders/{id}` metadata + trackingHistory, and logs audit.
 */
export async function regeneratePublicTrackingToken(
  preOrderId: string,
  actor: PreOrderActor,
  reason?: string,
  companySettings?: CompanySettings | null
): Promise<{ token: string; order: PreOrder }> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can regenerate customer tracking links.');
  }

  const [payments, statusHistory, shipmentEvents, resolvedSettings] = await Promise.all([
    getPreOrderPayments(preOrderId, 100),
    getPreOrderStatusHistory(preOrderId, 100),
    getPreOrderShipmentEvents(preOrderId, 100),
    companySettings !== undefined
      ? Promise.resolve(companySettings)
      : getCompanySettings().catch(() => null),
  ]);

  const now = Date.now();
  const newToken = generateSecureTrackingToken();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const newTrackingRef = doc(db, 'publicTracking', newToken);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let updatedOrder!: PreOrder;
  let oldTokenToDelete = '';

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(preOrderRef);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };

    oldTokenToDelete = (order.trackingToken || order.trackingTokenId || '').trim();

    const historyItem: PreOrderTrackingHistoryItem = {
      action: 'regenerated',
      timestamp: now,
      actorId: actor.id,
      actorName: actor.name,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    };
    const nextTrackingHistory = [...(order.trackingHistory || []), historyItem];

    const orderPatch: Partial<PreOrder> = {
      trackingToken: newToken,
      trackingTokenId: newToken,
      trackingEnabled: true,
      trackingCreatedAt: order.trackingCreatedAt || now,
      trackingCreatedBy: order.trackingCreatedBy || actor.id,
      trackingLastRegeneratedAt: now,
      trackingHistory: nextTrackingHistory,
      updatedAt: now,
      updatedBy: actor.id,
    };

    const nextOrderObj: PreOrder = { ...order, ...orderPatch };
    const whitelistedDoc = buildWhitelistedPublicTrackingDoc({
      order: nextOrderObj,
      payments,
      statusHistory,
      shipmentEvents,
      companySettings: resolvedSettings,
      now,
    });

    txn.set(newTrackingRef, sanitizeData(whitelistedDoc));
    if (oldTokenToDelete && oldTokenToDelete !== newToken) {
      txn.delete(doc(db, 'publicTracking', oldTokenToDelete));
    }
    txn.update(preOrderRef, sanitizeData(orderPatch));
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'TRACKING_LINK_REGENERATED' as PreOrderAuditAction,
        summary: `Regenerated public tracking link for ${order.preOrderNumber} (previous token invalidated)`,
        metadata: { reason: reason?.trim() || '' },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    updatedOrder = nextOrderObj;
  });

  return { token: newToken, order: updatedOrder };
}

/**
 * Admin/Super Admin: Disables or enables an existing tracking link.
 * When disabled, strips all customer/order data from `publicTracking/{token}` leaving ONLY `{ enabled: false, updatedAt }`.
 */
export async function togglePublicTrackingEnabled(
  preOrderId: string,
  enabled: boolean,
  actor: PreOrderActor,
  options?: {
    reason?: string;
    isExpiry?: boolean;
    companySettings?: CompanySettings | null;
  }
): Promise<PreOrder> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can enable or disable tracking links.');
  }

  const [payments, statusHistory, shipmentEvents, resolvedSettings] = enabled
    ? await Promise.all([
        getPreOrderPayments(preOrderId, 100),
        getPreOrderStatusHistory(preOrderId, 100),
        getPreOrderShipmentEvents(preOrderId, 100),
        options?.companySettings !== undefined
          ? Promise.resolve(options.companySettings)
          : getCompanySettings().catch(() => null),
      ])
    : [[], [], [], null];

  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  let updatedOrder!: PreOrder;

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(preOrderRef);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };

    let token = (order.trackingToken || order.trackingTokenId || '').trim();
    if (!token) {
      token = generateSecureTrackingToken();
    }

    const actionType: PreOrderTrackingHistoryItem['action'] = !enabled
      ? options?.isExpiry
        ? 'expired'
        : 'disabled'
      : 'enabled';

    const historyItem: PreOrderTrackingHistoryItem = {
      action: actionType,
      timestamp: now,
      actorId: actor.id,
      actorName: actor.name,
      ...(options?.reason?.trim() ? { reason: options.reason.trim() } : {}),
    };

    const orderPatch: Partial<PreOrder> = {
      trackingToken: token,
      trackingTokenId: token,
      trackingEnabled: enabled,
      trackingCreatedAt: order.trackingCreatedAt || now,
      trackingCreatedBy: order.trackingCreatedBy || actor.id,
      trackingHistory: [...(order.trackingHistory || []), historyItem],
      updatedAt: now,
      updatedBy: actor.id,
    };

    const nextOrderObj: PreOrder = { ...order, ...orderPatch };
    const trackingRef = doc(db, 'publicTracking', token);

    if (!enabled) {
      txn.set(trackingRef, sanitizeData(buildDisabledPublicTrackingDoc(now)));
    } else {
      const whitelisted = buildWhitelistedPublicTrackingDoc({
        order: nextOrderObj,
        payments,
        statusHistory,
        shipmentEvents,
        companySettings: resolvedSettings,
        now,
      });
      txn.set(trackingRef, sanitizeData(whitelisted));
    }

    txn.update(preOrderRef, sanitizeData(orderPatch));
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: (actionType === 'expired'
          ? 'TRACKING_LINK_EXPIRED'
          : actionType === 'disabled'
          ? 'TRACKING_LINK_DISABLED'
          : 'TRACKING_LINK_ENABLED') as PreOrderAuditAction,
        summary: `${
          actionType === 'expired'
            ? 'Auto-expired'
            : actionType === 'disabled'
            ? 'Disabled'
            : 'Enabled'
        } public tracking link for ${order.preOrderNumber}`,
        metadata: { enabled, reason: options?.reason?.trim() || '' },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    updatedOrder = nextOrderObj;
  });

  return updatedOrder;
}

export async function updatePreOrderCourierVisibility(
  preOrderId: string,
  showCourier: boolean,
  actor: PreOrderActor,
  companySettings?: CompanySettings | null
): Promise<SyncPublicTrackingResult> {
  const now = Date.now();
  await updateDoc(
    doc(db, 'preOrders', preOrderId),
    sanitizeData({
      showCourierTrackingToCustomer: Boolean(showCourier),
      updatedAt: now,
      updatedBy: actor.id,
    })
  );
  return syncPublicTracking(preOrderId, { companySettings });
}

export interface BulkGenerateTrackingResult {
  scanned: number;
  generated: number;
  synced: number;
  failed: number;
}

/**
 * One-time Admin utility: scans existing Pre-Orders and creates/syncs missing 256-bit public tracking links.
 */
export async function generateMissingTrackingLinks(
  actor: PreOrderActor,
  companySettings?: CompanySettings | null
): Promise<BulkGenerateTrackingResult> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can bulk-generate tracking links.');
  }

  const resolvedSettings =
    companySettings !== undefined
      ? companySettings
      : await getCompanySettings().catch(() => null);

  const snap = await getDocs(
    query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(250))
  );

  let scanned = 0;
  let generated = 0;
  let synced = 0;
  let failed = 0;
  const now = Date.now();

  for (const d of snap.docs) {
    scanned++;
    const order = { ...(d.data() as PreOrder), id: d.id };
    const existingToken = (order.trackingToken || order.trackingTokenId || '').trim();
    const hasValidToken = Boolean(existingToken && isSafeTrackingTokenFormat(existingToken));

    try {
      if (!hasValidToken) {
        const newToken = generateSecureTrackingToken();
        const historyItem: PreOrderTrackingHistoryItem = {
          action: 'created',
          timestamp: now,
          actorId: actor.id,
          actorName: actor.name,
          reason: 'Bulk-generated tracking link for existing pre-order',
        };

        await updateDoc(
          doc(db, 'preOrders', order.id),
          sanitizeData({
            trackingToken: newToken,
            trackingTokenId: newToken,
            trackingEnabled: order.trackingEnabled ?? true,
            trackingCreatedAt: order.trackingCreatedAt || now,
            trackingCreatedBy: order.trackingCreatedBy || actor.id,
            trackingHistory: [...(order.trackingHistory || []), historyItem],
            updatedAt: now,
            updatedBy: actor.id,
          })
        );

        const syncRes = await syncPublicTracking(order.id, {
          companySettings: resolvedSettings,
        });
        if (syncRes.ok) {
          generated++;
        } else {
          failed++;
        }
      } else {
        // Check if publicTracking doc exists or needs upgrade to strict whitelist schema
        const pubSnap = await getDoc(doc(db, 'publicTracking', existingToken)).catch(() => null);
        const needsRepair =
          !pubSnap ||
          !pubSnap.exists() ||
          !order.trackingTokenId ||
          order.trackingEnabled === undefined;

        if (needsRepair) {
          if (!order.trackingTokenId || order.trackingEnabled === undefined) {
            await updateDoc(
              doc(db, 'preOrders', order.id),
              sanitizeData({
                trackingTokenId: existingToken,
                trackingEnabled: order.trackingEnabled ?? true,
                trackingCreatedAt: order.trackingCreatedAt || order.createdAt || now,
                trackingCreatedBy: order.trackingCreatedBy || order.createdBy || actor.id,
                updatedAt: now,
                updatedBy: actor.id,
              })
            );
          }
          const syncRes = await syncPublicTracking(order.id, {
            companySettings: resolvedSettings,
          });
          if (syncRes.ok) synced++;
          else failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return { scanned, generated, synced, failed };
}

/**
 * Checks completed/terminal pre-orders for tracking link auto-expiry (configured N days after Delivered/Cancelled/Refunded).
 */
export async function checkAndExpireCompletedTrackingLinks(
  orders: PreOrder[],
  actor: PreOrderActor,
  companySettings?: CompanySettings | null
): Promise<{ expiredCount: number; expiredOrderIds: string[] }> {
  if (!isPreOrderAdminRole(actor.role)) {
    return { expiredCount: 0, expiredOrderIds: [] };
  }
  if (!companySettings?.trackingAutoExpiryEnabled) {
    return { expiredCount: 0, expiredOrderIds: [] };
  }

  const days = Math.max(1, Number(companySettings.trackingAutoExpiryDays || DEFAULT_TRACKING_AUTO_EXPIRY_DAYS));
  const cutoffMs = days * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const expiredOrderIds: string[] = [];

  for (const order of orders) {
    if (order.trackingEnabled === false) continue;
    if (!order.trackingToken && !order.trackingTokenId) continue;
    if (!['Delivered', 'Cancelled', 'Refunded'].includes(order.status)) continue;

    const completedAt = Number(
      order.cancelledAt || (order as any).lastStatusChangeAt || order.updatedAt || order.createdAt || 0
    );
    if (completedAt > 0 && now - completedAt >= cutoffMs) {
      try {
        await togglePublicTrackingEnabled(order.id, false, actor, {
          reason: `Auto-expired ${days} days after order reached "${order.status}"`,
          isExpiry: true,
          companySettings,
        });
        expiredOrderIds.push(order.id);
      } catch {
        // Skip silently; next Admin check can retry
      }
    }
  }

  return {
    expiredCount: expiredOrderIds.length,
    expiredOrderIds,
  };
}

export type PublicTrackingFetchResult =
  | { status: 'ok'; record: PublicTrackingRecord }
  | { status: 'not_found' }
  | { status: 'network_error'; message: string };

/**
 * UNAUTHENTICATED SINGLE-DOCUMENT LOOKUP ONLY.
 * Executes ONLY `getDoc(doc(db, 'publicTracking', token))`.
 * Never queries any other collection, never calls auth, never console.logs token or data.
 */
export async function getPublicTrackingByToken(
  token: string
): Promise<PublicTrackingFetchResult> {
  const cleanToken = (token || '').trim();
  if (!isSafeTrackingTokenFormat(cleanToken)) {
    return { status: 'not_found' };
  }

  try {
    const snap = await getDoc(doc(db, 'publicTracking', cleanToken));
    if (!snap.exists()) {
      return { status: 'not_found' };
    }
    const data = snap.data() as PublicTrackingRecord;
    if (data.enabled !== true) {
      return { status: 'not_found' };
    }
    return { status: 'ok', record: data };
  } catch (err: any) {
    const code = String(err?.code || '');
    // Firestore returns 'permission-denied' when doc does not exist OR enabled == false
    // under rule `allow get: if resource.data.enabled == true;`.
    // Never reveal whether the token ever existed.
    if (code === 'permission-denied' || code === 'not-found') {
      return { status: 'not_found' };
    }
    return {
      status: 'network_error',
      message: 'Unable to reach tracking server right now. Check your internet connection and retry.',
    };
  }
}

// ==========================================
// SUPPLIER PAYMENTS (APPEND-ONLY, MULTI-ORDER ALLOCATION & REVERSALS)
// ==========================================

export interface AddPreOrderSupplierPaymentInput {
  supplierId: string;
  supplierName: string;
  amount: number;
  currency: 'BDT' | 'RMB' | 'USD' | string;
  exchangeRate?: number;
  amountBdt: number;
  method: string;
  referenceNo?: string;
  receiptUrl?: string;
  note?: string;
  date: string;
  idempotencyKey: string;
  allocations?: PreOrderSupplierPaymentAllocation[];
  preOrderId?: string;
  preOrderNumber?: string;
}

export async function addPreOrderSupplierPayment(
  input: AddPreOrderSupplierPaymentInput,
  actor: PreOrderActor
): Promise<string> {
  const safeAmount = roundMoney(input.amount);
  const safeAmountBdt = roundMoney(input.amountBdt);
  if (safeAmount <= 0 || safeAmountBdt <= 0) {
    throw new Error('Supplier payment amount must be greater than zero.');
  }
  if (!input.supplierId) {
    throw new Error('Supplier is required.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('idempotencyKey is required.');
  }

  const cleanAllocations: PreOrderSupplierPaymentAllocation[] = (input.allocations || [])
    .filter((a) => a.preOrderId && roundMoney(a.amountBdt) > 0)
    .map((a) => ({
      preOrderId: a.preOrderId,
      preOrderNumber: a.preOrderNumber || a.preOrderId,
      amountBdt: roundMoney(a.amountBdt),
    }));

  if (cleanAllocations.length > 0) {
    const allocSumPaisa = cleanAllocations.reduce((s, a) => s + toPaisa(a.amountBdt), 0);
    if (allocSumPaisa !== toPaisa(safeAmountBdt)) {
      throw new Error(
        `Allocated sum (৳${fromPaisa(allocSumPaisa).toLocaleString()}) must equal total payment (৳${safeAmountBdt.toLocaleString()}).`
      );
    }
  } else if (input.preOrderId && input.preOrderId !== 'UNALLOCATED') {
    cleanAllocations.push({
      preOrderId: input.preOrderId,
      preOrderNumber: input.preOrderNumber || input.preOrderId,
      amountBdt: safeAmountBdt,
    });
  }

  const preOrderIds = cleanAllocations.map((a) => a.preOrderId);
  const primaryPreOrderId =
    cleanAllocations.length === 1
      ? cleanAllocations[0].preOrderId
      : cleanAllocations.length > 1
      ? 'MULTI'
      : 'UNALLOCATED';
  const summaryNumbers =
    cleanAllocations.length > 0
      ? cleanAllocations.map((a) => a.preOrderNumber).join(', ')
      : input.preOrderNumber || 'General Advance';

  const now = Date.now();
  const paymentId = `SUPPAY_${sanitizeIdFragment(input.idempotencyKey.trim())}`;
  const payRef = doc(db, 'preOrderSupplierPayments', paymentId);

  await runTransaction(db, async (txn) => {
    const existing = await txn.get(payRef);
    if (existing.exists()) return;

    // Fetch allocated pre-orders upfront before any writes to resolve exact subBrand
    const allocSubBrandMap: Record<string, 'SAT' | 'GZ' | 'RTX'> = {};
    if (cleanAllocations.length > 0) {
      const allocSnaps = await Promise.all(
        cleanAllocations.map((alloc) => txn.get(doc(db, 'preOrders', alloc.preOrderId)))
      );
      allocSnaps.forEach((snap, idx) => {
        const alloc = cleanAllocations[idx];
        const sb = snap.exists() ? (snap.data()?.subBrand as 'SAT' | 'GZ' | 'RTX' | undefined) : undefined;
        allocSubBrandMap[alloc.preOrderId] = sb === 'GZ' || sb === 'RTX' ? sb : 'SAT';
      });
    }

    const record: PreOrderSupplierPayment = {
      id: paymentId,
      type: 'payment',
      preOrderId: primaryPreOrderId,
      preOrderNumber: summaryNumbers,
      preOrderIds,
      allocations: cleanAllocations,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      amount: safeAmount,
      currency: input.currency || 'BDT',
      exchangeRate: input.exchangeRate,
      amountBdt: safeAmountBdt,
      method: input.method,
      referenceNo: input.referenceNo?.trim() || '',
      receiptUrl: input.receiptUrl || '',
      note: input.note?.trim() || '',
      category: 'Pre-Order Supplier Payment',
      idempotencyKey: input.idempotencyKey.trim(),
      date: input.date || getTodayIsoDate(),
      recordedBy: actor.id,
      recordedByName: actor.name,
      createdAt: now,
    };

    txn.set(payRef, sanitizeData(record));

    if (cleanAllocations.length > 0) {
      for (const alloc of cleanAllocations) {
        const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
        txn.set(
          auditRef,
          sanitizeData({
            id: auditRef.id,
            preOrderId: alloc.preOrderId,
            preOrderNumber: alloc.preOrderNumber,
            action: 'SUPPLIER_PAYMENT_RECORDED' as PreOrderAuditAction,
            summary: `Recorded supplier payment of ৳${alloc.amountBdt.toLocaleString()} to ${input.supplierName} (${input.currency} ${safeAmount} batch)`,
            metadata: {
              paymentId,
              supplierId: input.supplierId,
              allocatedBdt: alloc.amountBdt,
              totalBatchBdt: safeAmountBdt,
              method: input.method,
            },
            userId: actor.id,
            userName: actor.name,
            userRole: actor.role,
            timestamp: now,
          })
        );

        const supPosting = buildSupplierPaymentPosting({
          preOrderId: alloc.preOrderId,
          preOrderNumber: alloc.preOrderNumber,
          subBrand: allocSubBrandMap[alloc.preOrderId] || 'SAT',
          supplierPaymentId: paymentId,
          amountBdt: alloc.amountBdt,
          method: input.method,
          note: `Supplier payment to ${input.supplierName} (${input.method})`,
          actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
        });
        txn.set(doc(db, 'accountingPostings', supPosting.id), sanitizeData(supPosting));
      }
    } else {
      const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
      txn.set(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId: 'SUPPLIER_' + input.supplierId,
          preOrderNumber: summaryNumbers,
          action: 'SUPPLIER_PAYMENT_RECORDED' as PreOrderAuditAction,
          summary: `Recorded unallocated supplier payment of ${safeAmount} ${input.currency} (৳${safeAmountBdt.toLocaleString()}) to ${input.supplierName}`,
          metadata: { paymentId, supplierId: input.supplierId, amountBdt: safeAmountBdt },
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
        })
      );

      const unallocPosting = buildSupplierPaymentPosting({
        preOrderId: `SUPPLIER_${input.supplierId}`,
        preOrderNumber: input.supplierName || 'General Supplier Advance',
        subBrand: 'SAT',
        supplierPaymentId: paymentId,
        amountBdt: safeAmountBdt,
        method: input.method,
        note: `Unallocated advance to ${input.supplierName} (${input.method})`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', unallocPosting.id), sanitizeData(unallocPosting));
    }
  });

  return paymentId;
}

export async function reversePreOrderSupplierPayment(
  originalPaymentId: string,
  reason: string,
  actor: PreOrderActor
): Promise<string> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can reverse a supplier payment.');
  }
  if (!reason?.trim()) {
    throw new Error('Reversal reason is required.');
  }

  const now = Date.now();
  const revId = `SUPREV_${sanitizeIdFragment(originalPaymentId)}`;
  const origRef = doc(db, 'preOrderSupplierPayments', originalPaymentId);
  const revRef = doc(db, 'preOrderSupplierPayments', revId);

  // Pre-fetch original payment to locate its deterministic accountingPostings docs cleanly before txn writes
  const preOrigSnap = await getDoc(origRef);
  const preOrig = preOrigSnap.exists() ? (preOrigSnap.data() as PreOrderSupplierPayment) : null;
  const candidatePostingKeys: string[] = [];
  if (preOrig) {
    if (Array.isArray(preOrig.allocations) && preOrig.allocations.length > 0) {
      preOrig.allocations.forEach((a) =>
        candidatePostingKeys.push(getSupplierPaymentPostingId(a.preOrderId, originalPaymentId))
      );
    } else if (preOrig.preOrderId && preOrig.preOrderId !== 'MULTI' && preOrig.preOrderId !== 'UNALLOCATED') {
      candidatePostingKeys.push(getSupplierPaymentPostingId(preOrig.preOrderId, originalPaymentId));
    } else {
      candidatePostingKeys.push(
        getSupplierPaymentPostingId(`SUPPLIER_${preOrig.supplierId}`, originalPaymentId)
      );
    }
  }

  await runTransaction(db, async (txn) => {
    const [origSnap, revSnap, ...origPostingSnaps] = await Promise.all([
      txn.get(origRef),
      txn.get(revRef),
      ...candidatePostingKeys.map((pid) => txn.get(doc(db, 'accountingPostings', pid))),
    ]);
    if (!origSnap.exists()) throw new Error('Original supplier payment not found.');
    if (revSnap.exists()) return;

    const orig = { ...(origSnap.data() as PreOrderSupplierPayment), id: origSnap.id };
    if (orig.type === 'reversal') {
      throw new Error('A reversal entry cannot itself be reversed.');
    }

    const revRecord: PreOrderSupplierPayment = {
      id: revId,
      type: 'reversal',
      preOrderId: orig.preOrderId,
      preOrderNumber: orig.preOrderNumber,
      preOrderIds: orig.preOrderIds || (orig.preOrderId && orig.preOrderId !== 'MULTI' && orig.preOrderId !== 'UNALLOCATED' ? [orig.preOrderId] : []),
      allocations: orig.allocations || [],
      supplierId: orig.supplierId,
      supplierName: orig.supplierName,
      amount: roundMoney(orig.amount),
      currency: orig.currency,
      exchangeRate: orig.exchangeRate,
      amountBdt: roundMoney(orig.amountBdt),
      method: orig.method,
      referenceNo: orig.referenceNo || '',
      note: `Reversal of ${originalPaymentId}: ${reason.trim()}`,
      category: 'Pre-Order Supplier Payment',
      reversesPaymentId: originalPaymentId,
      reversalReason: reason.trim(),
      idempotencyKey: revId,
      date: getTodayIsoDate(),
      recordedBy: actor.id,
      recordedByName: actor.name,
      createdAt: now,
    };

    txn.set(revRef, sanitizeData(revRecord));

    for (const pSnap of origPostingSnaps) {
      if (pSnap.exists()) {
        const revPosting = buildReversalPosting(
          pSnap.data() as AccountingPosting,
          revId,
          reason.trim(),
          { actorId: actor.id, actorName: actor.name, timestamp: now }
        );
        txn.set(doc(db, 'accountingPostings', revPosting.id), sanitizeData(revPosting));
      }
    }

    const targetAllocations =
      orig.allocations && orig.allocations.length > 0
        ? orig.allocations
        : [
            {
              preOrderId: orig.preOrderId || 'SUPPLIER_' + orig.supplierId,
              preOrderNumber: orig.preOrderNumber || orig.supplierName,
              amountBdt: orig.amountBdt,
            },
          ];

    for (const alloc of targetAllocations) {
      const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
      txn.set(
        auditRef,
        sanitizeData({
          id: auditRef.id,
          preOrderId: alloc.preOrderId,
          preOrderNumber: alloc.preOrderNumber,
          action: 'SUPPLIER_PAYMENT_REVERSED' as PreOrderAuditAction,
          summary: `Reversed supplier payment ${originalPaymentId} (-৳${alloc.amountBdt.toLocaleString()}) to ${orig.supplierName}: ${reason.trim()}`,
          metadata: {
            reversalId: revId,
            reversesPaymentId: originalPaymentId,
            supplierId: orig.supplierId,
            amountBdt: alloc.amountBdt,
          },
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          timestamp: now,
        })
      );
    }
  });

  return revId;
}

export async function getPreOrderSupplierPayments(
  preOrderId?: string,
  limitCount: number = 100
): Promise<PreOrderSupplierPayment[]> {
  if (!auth?.currentUser) return [];
  if (preOrderId) {
    // Support both legacy single preOrderId and new multi-order preOrderIds array-contains
    const [byArraySnap, bySingleSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'preOrderSupplierPayments'),
          where('preOrderIds', 'array-contains', preOrderId),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        )
      ).catch(() => null),
      getDocs(
        query(
          collection(db, 'preOrderSupplierPayments'),
          where('preOrderId', '==', preOrderId),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        )
      ).catch(() => null),
    ]);

    const map = new Map<string, PreOrderSupplierPayment>();
    byArraySnap?.docs.forEach((d) =>
      map.set(d.id, { ...(d.data() as PreOrderSupplierPayment), id: d.id })
    );
    bySingleSnap?.docs.forEach((d) =>
      map.set(d.id, { ...(d.data() as PreOrderSupplierPayment), id: d.id })
    );
    return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  try {
    const q = query(
      collection(db, 'preOrderSupplierPayments'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as PreOrderSupplierPayment), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'permission-denied') return [];
    throw err;
  }
}

export async function getPreOrderSupplierPaymentsBySupplier(
  supplierId: string,
  limitCount: number = 200
): Promise<PreOrderSupplierPayment[]> {
  if (!auth?.currentUser) return [];
  try {
    const q = query(
      collection(db, 'preOrderSupplierPayments'),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as PreOrderSupplierPayment), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'permission-denied') return [];
    if (err?.code === 'failed-precondition') {
      const qFallback = query(
        collection(db, 'preOrderSupplierPayments'),
        where('supplierId', '==', supplierId),
        limit(limitCount)
      );
      const snap = await getDocs(qFallback);
      return snap.docs
        .map((d) => ({ ...(d.data() as PreOrderSupplierPayment), id: d.id }))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    throw err;
  }
}

export async function getPreOrdersBySupplier(
  supplierId: string,
  limitCount: number = 150
): Promise<PreOrder[]> {
  if (!auth?.currentUser) return [];
  try {
    const q = query(
      collection(db, 'preOrders'),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'permission-denied') return [];
    if (err?.code === 'failed-precondition') {
      const qFallback = query(
        collection(db, 'preOrders'),
        where('supplierId', '==', supplierId),
        limit(limitCount)
      );
      const snap = await getDocs(qFallback);
      return snap.docs
        .map((d) => withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    throw err;
  }
}

export async function getPreOrderPrivateCostsMap(
  preOrderIds: string[]
): Promise<Record<string, PreOrderPrivateCost>> {
  if (!auth?.currentUser) return {};
  const uniqueIds = Array.from(new Set(preOrderIds.filter(Boolean))).slice(0, 120);
  const map: Record<string, PreOrderPrivateCost> = {};
  if (uniqueIds.length === 0) return map;

  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      const cost = await getPreOrderPrivateCost(id);
      return { id, cost };
    })
  );
  for (const e of entries) {
    if (e.cost) map[e.id] = e.cost;
  }
  return map;
}

// ==========================================
// AUDIT LOGS & NOTIFICATIONS (QUOTA-FRIENDLY)
// ==========================================

export async function getPreOrderAuditLogs(
  preOrderId?: string,
  limitCount: number = 50
): Promise<PreOrderAuditEntry[]> {
  if (!auth?.currentUser) return [];
  const constraints: any[] = [];
  if (preOrderId) {
    constraints.push(where('preOrderId', '==', preOrderId));
  }
  constraints.push(orderBy('timestamp', 'desc'));
  constraints.push(limit(limitCount));
  try {
    const q = query(collection(db, 'preOrderAudit'), ...constraints);
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as PreOrderAuditEntry), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'permission-denied') return [];
    throw err;
  }
}

export async function getPreOrderNotifications(
  limitCount: number = 30
): Promise<PreOrderNotification[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrderNotifications'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderNotification), id: d.id }));
}

export async function markPreOrderNotificationRead(
  notificationId: string,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, 'preOrderNotifications', notificationId), {
    readBy: arrayUnion(userId),
  });
}

// ==========================================
// PART 6: RECEIVE STOCK, CONVERT TO SALE, CANCEL & RECONCILE, POSTINGS & INTEGRITY
// ==========================================

export async function getPreOrderReceipts(
  preOrderId: string,
  limitCount: number = 50
): Promise<PreOrderReceipt[]> {
  if (!auth?.currentUser) return [];
  const q = query(
    collection(db, 'preOrders', preOrderId, 'receipts'),
    orderBy('receivedAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderReceipt), id: d.id }));
}

export async function getPreOrderAccountingPostings(
  preOrderId?: string,
  limitCount: number = 250
): Promise<AccountingPosting[]> {
  if (!auth?.currentUser) return [];
  const constraints: any[] = [];
  if (preOrderId) {
    constraints.push(where('preOrderId', '==', preOrderId));
  }
  constraints.push(orderBy('timestamp', 'desc'));
  constraints.push(limit(limitCount));
  try {
    const snap = await getDocs(query(collection(db, 'accountingPostings'), ...constraints));
    return snap.docs.map((d) => ({ ...(d.data() as AccountingPosting), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'failed-precondition' && preOrderId) {
      const fallbackSnap = await getDocs(
        query(collection(db, 'accountingPostings'), where('preOrderId', '==', preOrderId), limit(limitCount))
      );
      return fallbackSnap.docs
        .map((d) => ({ ...(d.data() as AccountingPosting), id: d.id }))
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    if (err?.code === 'permission-denied') return [];
    throw err;
  }
}

export function subscribeToAccountingPostings(
  callback: (postings: AccountingPosting[]) => void,
  limitCount: number = 400
): () => void {
  if (!auth?.currentUser) return () => {};
  try {
    const q = query(
      collection(db, 'accountingPostings'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as AccountingPosting), id: d.id }));
        callback(rows);
      },
      () => {
        getPreOrderAccountingPostings(undefined, limitCount)
          .then(callback)
          .catch(() => callback([]));
      }
    );
  } catch {
    return () => {};
  }
}

export interface ReceivePreOrderItemInput {
  itemId: string;
  receivedQty: number;
  damagedQty?: number;
  productId?: string;
  variantId?: string;
  newProductDetails?: {
    name?: string;
    sku?: string;
    category?: string;
    brand?: string;
    color?: string;
    model?: string;
    reorderThreshold?: number;
  };
}

export interface ReceivePreOrderStockInput {
  items?: ReceivePreOrderItemInput[];
  receivedQty?: number;
  damagedQty?: number;
  productId?: string; // Existing product ID if linking
  variantId?: string; // Existing variant ID if linking
  newProductDetails?: {
    name?: string;
    sku?: string;
    category?: string;
    brand?: string;
    color?: string;
    model?: string;
    reorderThreshold?: number;
  };
  note?: string;
  idempotencyKey: string;
}

export interface ReceivePreOrderStockResult {
  receipt: PreOrderReceipt;
  order: PreOrder;
  productId: string;
  variantId: string;
  createdNewProduct: boolean;
  productStatus: 'approved' | 'pending_review' | 'rejected';
  trackingSyncWarning?: string;
}

export async function receivePreOrderStock(
  preOrderId: string,
  input: ReceivePreOrderStockInput,
  actor: PreOrderActor
): Promise<ReceivePreOrderStockResult> {
  if (!input.idempotencyKey?.trim()) {
    throw new Error('Idempotency key is required to receive stock safely.');
  }

  const hasMultiItems = Array.isArray(input.items) && input.items.length > 0;
  let totalInputGood = 0;
  let totalInputDamaged = 0;

  if (hasMultiItems) {
    for (const line of input.items!) {
      const g = Math.round(Number(line.receivedQty) || 0);
      const d = Math.round(Number(line.damagedQty) || 0);
      if (g < 0 || d < 0) {
        throw new Error('Received and damaged quantities cannot be negative.');
      }
      totalInputGood += g;
      totalInputDamaged += d;
    }
  } else {
    totalInputGood = Math.round(Number(input.receivedQty) || 0);
    totalInputDamaged = Math.round(Number(input.damagedQty) || 0);
  }

  if (totalInputGood < 0 || totalInputDamaged < 0 || totalInputGood + totalInputDamaged <= 0) {
    throw new Error('Enter at least 1 good or damaged unit to receive.');
  }
  if (totalInputDamaged > 0 && !isPreOrderAdminRole(actor.role)) {
    throw new Error(
      'Logging damaged/missing pre-order units to Company Losses requires Admin or Super Admin approval.'
    );
  }

  const now = Date.now();
  const safeKey = sanitizeIdFragment(input.idempotencyKey.trim());
  const receiptId = `RCPT_${safeKey}`;

  // Fetch existing products list upfront if we might generate new unique barcodes
  const existingProducts = await getProducts(true).catch(() => [] as Product[]);

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const receiptRef = doc(db, 'preOrders', preOrderId, 'receipts', receiptId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', generateId('HIST'));

  let result!: ReceivePreOrderStockResult;

  await runTransaction(db, async (txn) => {
    const preSnap = await txn.get(preOrderRef);
    if (!preSnap.exists()) throw new Error('Pre-order not found.');
    const prelimOrder = withNormalizedPreOrderItems({ ...(preSnap.data() as PreOrder), id: preSnap.id });
    const orderItems = normalizePreOrderItems(prelimOrder);

    const requestedLines: ReceivePreOrderItemInput[] = hasMultiItems
      ? input.items!
          .map((l) => ({
            ...l,
            receivedQty: Math.round(Number(l.receivedQty) || 0),
            damagedQty: Math.round(Number(l.damagedQty) || 0),
          }))
          .filter((l) => l.receivedQty + (l.damagedQty || 0) > 0)
      : [
          {
            itemId: orderItems[0]?.itemId || 'item-1',
            receivedQty: totalInputGood,
            damagedQty: totalInputDamaged,
            productId: input.productId,
            variantId: input.variantId,
            newProductDetails: input.newProductDetails,
          },
        ];

    if (requestedLines.length === 0) {
      throw new Error('Enter at least 1 good or damaged unit to receive.');
    }

    const uniqueProductIds = Array.from(
      new Set(
        requestedLines
          .map((line) => {
            const matchItem = orderItems.find((it) => it.itemId === line.itemId);
            return (line.productId || matchItem?.linkedProductId || '').trim();
          })
          .filter(Boolean)
      )
    );

    const [receiptSnap, costSnap, statsSnap, ...productSnaps] = await Promise.all([
      txn.get(receiptRef),
      txn.get(costRef),
      txn.get(doc(db, 'preOrderStats', 'summary')),
      ...uniqueProductIds.map((pid) => txn.get(doc(db, 'products', pid))),
    ]);

    if (receiptSnap.exists()) {
      const prevReceipt = { ...(receiptSnap.data() as PreOrderReceipt), id: receiptSnap.id };
      result = {
        receipt: prevReceipt,
        order: prelimOrder,
        productId: prevReceipt.productId,
        variantId: prevReceipt.variantId,
        createdNewProduct: false,
        productStatus: 'approved',
      };
      return;
    }

    if (prelimOrder.convertedSaleId || prelimOrder.convertedOrderId) {
      throw new Error('This pre-order has already been converted to a Sales Order.');
    }
    if (['Delivered', 'Cancelled', 'Refunded'].includes(prelimOrder.status)) {
      throw new Error(`Cannot receive stock while pre-order status is "${prelimOrder.status}".`);
    }

    const allowedReceiveStages: PreOrderStatus[] = [
      'Arrived in Bangladesh',
      'Received in Stock',
      'Ready for Delivery',
    ];
    if (!allowedReceiveStages.includes(prelimOrder.status) && !isPreOrderAdminRole(actor.role)) {
      throw new Error(
        `Order must be "Arrived in Bangladesh" before staff can receive stock (current: "${prelimOrder.status}").`
      );
    }

    // Validate remaining capacity per requested item
    const orderItemMap = new Map(orderItems.map((it) => [it.itemId, { ...it }]));
    for (const line of requestedLines) {
      const item = orderItemMap.get(line.itemId);
      if (!item) {
        throw new Error(`Pre-order item "${line.itemId}" not found on ${prelimOrder.preOrderNumber}.`);
      }
      const prevGoodItem = Math.max(0, Number(item.receivedQty) || 0);
      const prevDmgItem = Math.max(0, Number(item.damagedQty) || 0);
      const itemRemaining = Math.max(0, item.qty - (prevGoodItem + prevDmgItem));
      const reqTotal = line.receivedQty + (line.damagedQty || 0);
      if (reqTotal > itemRemaining) {
        throw new Error(
          `Cannot receive ${reqTotal} unit(s) for "${item.productName}". Only ${itemRemaining} unit(s) remain unreceived.`
        );
      }
    }

    const privCost = costSnap.exists() ? (costSnap.data() as PreOrderPrivateCost) : null;
    const actualShip =
      calculateActualShippingCost(privCost?.shippingExpenses) ||
      Number(privCost?.actualShippingCost || 0);
    const itemCostMap = computeItemCostMap(prelimOrder, privCost);

    const multiCost = calculateMultiItemReceiptCosts({
      allItems: orderItems.map((it) => ({
        itemId: it.itemId,
        qty: it.qty,
        chinaUnitCost: itemCostMap[it.itemId]?.chinaUnitCost ?? privCost?.chinaUnitCost ?? 0,
      })),
      receiptLines: requestedLines.map((l) => {
        const orderItem = orderItemMap.get(l.itemId)!;
        return {
          itemId: l.itemId,
          orderedQty: orderItem.qty,
          receivedGoodQty: l.receivedQty,
          damagedQty: l.damagedQty || 0,
          chinaUnitCost: itemCostMap[l.itemId]?.chinaUnitCost ?? privCost?.chinaUnitCost ?? 0,
        };
      }),
      actualShippingCost: actualShip,
      estimatedShippingCost: privCost?.shippingCost || 0,
    });

    // Build in-memory product state map so multiple lines targeting the SAME product update cleanly without overwriting sibling variants
    const productStateMap = new Map<
      string,
      { prodData: Product; variants: Variant[]; touched: boolean }
    >();
    uniqueProductIds.forEach((pid, idx) => {
      const pSnap = productSnaps[idx];
      if (pSnap && pSnap.exists()) {
        const prodData = pSnap.data() as Product;
        productStateMap.set(pid, {
          prodData,
          variants: Array.isArray(prodData.variants) ? [...prodData.variants] : [],
          touched: false,
        });
      }
    });

    const usedBarcodes = new Set<string>();
    const isSuperAdminActor = actor.role === 'superadmin' || actor.role === 'super_admin';

    let primaryProductId = '';
    let primaryVariantId = '';
    let primaryProductName = prelimOrder.productName;
    let primaryVariantLabel = '';
    let createdAnyNewProduct = false;
    let primaryProductStatus: 'approved' | 'pending_review' | 'rejected' = 'approved';
    let firstDamagedLossId = '';

    const itemsBreakdown: PreOrderReceiptItemBreakdown[] = [];

    for (let idx = 0; idx < requestedLines.length; idx++) {
      const line = requestedLines[idx];
      const item = orderItemMap.get(line.itemId)!;
      const lineCost = multiCost.byItemId[line.itemId];
      const lineGoodQty = line.receivedQty;
      const lineDamagedQty = line.damagedQty || 0;

      const requestedProdId = (line.productId || item.linkedProductId || '').trim();
      const targetProdState = requestedProdId ? productStateMap.get(requestedProdId) : undefined;

      let resolvedProductId = '';
      let resolvedVariantId = '';
      let resolvedProductName = item.productName;
      let resolvedVariantLabel = `${item.color || 'Standard'} / ${item.model || 'Standard'}`;
      let resolvedProductStatus: 'approved' | 'pending_review' | 'rejected' = 'approved';

      const reservationEntry: ProductPreOrderReservation = {
        preOrderId,
        preOrderNumber: prelimOrder.preOrderNumber,
        itemId: item.itemId,
        variantId: '',
        qty: lineGoodQty,
        receivedAt: now,
      };

      if (targetProdState) {
        resolvedProductId = requestedProdId;
        resolvedProductName = targetProdState.prodData.name;
        resolvedProductStatus = targetProdState.prodData.status || 'approved';
        targetProdState.touched = true;

        const targetVarId = (line.variantId || item.linkedVariantId || '').trim();
        let matchedIdx = targetProdState.variants.findIndex((v) => v.id === targetVarId);
        if (matchedIdx === -1 && targetProdState.variants.length > 0) {
          // Try color/model match if variantId wasn't explicitly set
          const byAttrIdx = targetProdState.variants.findIndex(
            (v) =>
              (item.color && v.color?.toLowerCase() === item.color.toLowerCase()) &&
              (item.model ? v.model?.toLowerCase() === item.model.toLowerCase() : true)
          );
          matchedIdx = byAttrIdx >= 0 ? byAttrIdx : 0;
        }

        if (matchedIdx === -1) {
          resolvedVariantId = 'v-1';
          reservationEntry.variantId = resolvedVariantId;
          const varBarcode = getUniqueBarcodeValue(
            targetProdState.prodData.subBrand || prelimOrder.subBrand,
            existingProducts,
            usedBarcodes
          );
          usedBarcodes.add(varBarcode);
          targetProdState.variants.push({
            id: resolvedVariantId,
            color: item.color || line.newProductDetails?.color || 'Standard',
            model: item.model || line.newProductDetails?.model || 'Standard',
            stock: lineGoodQty,
            reservedQty: lineGoodQty,
            reservedForPreOrders: lineGoodQty > 0 ? [reservationEntry] : [],
            barcodeValue: varBarcode,
          });
          resolvedVariantLabel = `${targetProdState.variants[0].color} / ${targetProdState.variants[0].model}`;
          if (lineGoodQty > 0) {
            const stockLogRef = doc(collection(db, 'stockLogs'));
            txn.set(
              stockLogRef,
              sanitizeData({
                productId: resolvedProductId,
                productName: resolvedProductName,
                type: 'in',
                qty: lineGoodQty,
                reason: 'Pre-Order Receive',
                userId: actor.id,
                userName: actor.name,
                timestamp: now,
                beforeQty: 0,
                afterQty: lineGoodQty,
                refNo: prelimOrder.preOrderNumber,
                supplierName: prelimOrder.supplierName || '',
                preOrderId,
                variantId: resolvedVariantId,
                purchasePrice: lineCost.unitLandedCost,
              } as Omit<StockLog, 'id'>)
            );
          }
        } else {
          const targetVar = targetProdState.variants[matchedIdx];
          resolvedVariantId = targetVar.id;
          resolvedVariantLabel = `${targetVar.color} / ${targetVar.model}`;
          reservationEntry.variantId = resolvedVariantId;

          const beforeVarStock = Number(targetVar.stock) || 0;
          const afterVarStock = beforeVarStock + lineGoodQty;
          const prevVarRes = Math.max(0, Number(targetVar.reservedQty) || 0);
          const existingVarReservations = Array.isArray(targetVar.reservedForPreOrders)
            ? [...targetVar.reservedForPreOrders]
            : [];

          if (lineGoodQty > 0) {
            const existingPoIdx = existingVarReservations.findIndex(
              (r) => r.preOrderId === preOrderId && (!r.itemId || r.itemId === item.itemId)
            );
            if (existingPoIdx >= 0) {
              existingVarReservations[existingPoIdx] = {
                ...existingVarReservations[existingPoIdx],
                itemId: item.itemId,
                qty: existingVarReservations[existingPoIdx].qty + lineGoodQty,
                receivedAt: now,
              };
            } else {
              existingVarReservations.push(reservationEntry);
            }
          }

          targetProdState.variants[matchedIdx] = {
            ...targetVar,
            stock: afterVarStock,
            reservedQty: prevVarRes + lineGoodQty,
            reservedForPreOrders: existingVarReservations,
          };

          if (lineGoodQty > 0) {
            const stockLogRef = doc(collection(db, 'stockLogs'));
            const stockLog: Omit<StockLog, 'id'> = {
              productId: resolvedProductId,
              productName: resolvedProductName,
              type: 'in',
              qty: lineGoodQty,
              reason: 'Pre-Order Receive',
              userId: actor.id,
              userName: actor.name,
              timestamp: now,
              beforeQty: beforeVarStock,
              afterQty: afterVarStock,
              refNo: prelimOrder.preOrderNumber,
              supplierName: prelimOrder.supplierName || '',
              preOrderId,
              variantId: resolvedVariantId,
              purchasePrice: lineCost.unitLandedCost,
            };
            txn.set(stockLogRef, sanitizeData(stockLog));
          }
        }
      } else {
        // Auto-create new Product using existing SKU/CODE128 barcode & approval rule
        createdAnyNewProduct = true;
        const newProdRef = doc(collection(db, 'products'));
        resolvedProductId = newProdRef.id;
        resolvedVariantId = 'v-1';
        reservationEntry.variantId = resolvedVariantId;
        resolvedProductStatus = isSuperAdminActor ? 'approved' : 'pending_review';

        const productName = line.newProductDetails?.name?.trim() || item.productName;
        const color = line.newProductDetails?.color?.trim() || item.color || 'Standard';
        const model = line.newProductDetails?.model?.trim() || item.model || 'Standard';
        const category = line.newProductDetails?.category?.trim() || item.category || 'Pre-Order';
        const brand = line.newProductDetails?.brand?.trim() || prelimOrder.supplierName || 'Pre-Order Import';
        const sku =
          line.newProductDetails?.sku?.trim() ||
          item.sku?.trim() ||
          `${prelimOrder.subBrand}-${prelimOrder.preOrderNumber}-${idx + 1}`;

        const prodBarcode = getUniqueBarcodeValue(prelimOrder.subBrand || 'PRD', existingProducts, usedBarcodes);
        usedBarcodes.add(prodBarcode);
        const varBarcode = getUniqueBarcodeValue(prelimOrder.subBrand || 'PRD', existingProducts, usedBarcodes);
        usedBarcodes.add(varBarcode);

        resolvedProductName = productName;
        resolvedVariantLabel = `${color} / ${model}`;

        const variantDoc: Variant = {
          id: resolvedVariantId,
          color,
          model,
          stock: lineGoodQty,
          reservedQty: lineGoodQty,
          reservedForPreOrders: lineGoodQty > 0 ? [reservationEntry] : [],
          barcodeValue: varBarcode,
        };

        const itemImages =
          Array.isArray(item.imageUrls) && item.imageUrls.length > 0
            ? item.imageUrls
            : item.imageUrl
            ? [item.imageUrl]
            : [];

        const newProductPayload: Omit<Product, 'id'> = {
          name: productName,
          sku,
          description: item.productSpecs || prelimOrder.productSpecs || `Imported via Pre-Order ${prelimOrder.preOrderNumber}`,
          category,
          mainCategory: category,
          brand,
          subBrand: prelimOrder.subBrand,
          costPrice: lineCost.unitLandedCost,
          sellingPrice: item.sellingUnitPrice,
          reorderThreshold: Number(line.newProductDetails?.reorderThreshold ?? 5),
          images: itemImages,
          imageUrls: itemImages,
          variants: [variantDoc],
          totalStock: lineGoodQty,
          reservedQty: lineGoodQty,
          reservedForPreOrders: lineGoodQty > 0 ? [reservationEntry] : [],
          archived: false,
          createdAt: now,
          barcodeValue: prodBarcode,
          status: resolvedProductStatus,
          stockStatus: 'out_of_stock',
          createdById: actor.id,
          createdBy: actor.name,
          submittedBy: {
            uid: actor.id,
            name: actor.name,
            role: actor.role,
          },
          submittedAt: now,
          editHistory: [
            {
              id: `eh-${now}-${idx}`,
              editedByUid: actor.id,
              editedByName: actor.name,
              editedByRole: actor.role,
              editedAt: now,
              action: 'created',
              note: `Created via Pre-Order ${prelimOrder.preOrderNumber}`,
              changes: [],
            },
          ],
        };

        txn.set(newProdRef, sanitizeData(newProductPayload));

        if (lineGoodQty > 0) {
          const stockLogRef = doc(collection(db, 'stockLogs'));
          txn.set(
            stockLogRef,
            sanitizeData({
              productId: resolvedProductId,
              productName,
              type: 'in',
              qty: lineGoodQty,
              reason: 'Pre-Order Receive',
              userId: actor.id,
              userName: actor.name,
              timestamp: now,
              beforeQty: 0,
              afterQty: lineGoodQty,
              refNo: prelimOrder.preOrderNumber,
              supplierName: prelimOrder.supplierName || '',
              preOrderId,
              variantId: resolvedVariantId,
              purchasePrice: lineCost.unitLandedCost,
            } as Omit<StockLog, 'id'>)
          );
        }
      }

      if (lineDamagedQty > 0 && lineCost.damagedCostLoss > 0) {
        const lossRef = doc(collection(db, 'companyLosses'));
        if (!firstDamagedLossId) firstDamagedLossId = lossRef.id;
        const lossDoc: Omit<CompanyLoss, 'id'> = {
          title: `Damaged Pre-Order Stock (${prelimOrder.preOrderNumber}) - ${resolvedProductName}`,
          reason: 'Product Damage',
          amount: lineCost.damagedCostLoss,
          date: getTodayIsoDate(),
          subBrand: prelimOrder.subBrand,
          note: `Damaged qty: ${lineDamagedQty} × ৳${lineCost.unitLandedCost.toLocaleString()} landed cost${
            input.note?.trim() ? ` | ${input.note.trim()}` : ''
          }`,
          recordedBy: actor.name,
          createdAt: now,
        };
        txn.set(lossRef, sanitizeData(lossDoc));
      }

      // Update PreOrderItem line progress
      const prevGoodItem = Math.max(0, Number(item.receivedQty) || 0);
      const prevDmgItem = Math.max(0, Number(item.damagedQty) || 0);
      const nextGoodItem = prevGoodItem + lineGoodQty;
      const nextDmgItem = prevDmgItem + lineDamagedQty;
      const itemAccounted = nextGoodItem + nextDmgItem >= item.qty;

      item.receivedQty = nextGoodItem;
      item.damagedQty = nextDmgItem;
      item.linkedProductId = resolvedProductId;
      item.linkedVariantId = resolvedVariantId;
      item.unitLandedCost = lineCost.unitLandedCost;
      item.landedCostTotal = roundMoney(lineCost.unitLandedCost * nextGoodItem);
      item.status = itemAccounted ? 'received' : 'pending';
      orderItemMap.set(item.itemId, item);

      itemsBreakdown.push({
        itemId: item.itemId,
        productName: resolvedProductName,
        receivedQty: lineGoodQty,
        damagedQty: lineDamagedQty,
        productId: resolvedProductId,
        variantId: resolvedVariantId,
        variantLabel: resolvedVariantLabel,
        chinaUnitCost: lineCost.chinaUnitCost,
        shippingCostPerUnit: lineCost.shippingCostPerUnit,
        shippingCostPortion: lineCost.shippingCostPortion,
        unitLandedCost: lineCost.unitLandedCost,
        totalGoodLandedCost: lineCost.totalGoodLandedCost,
        damagedCostLoss: lineCost.damagedCostLoss,
      });

      if (idx === 0) {
        primaryProductId = resolvedProductId;
        primaryVariantId = resolvedVariantId;
        primaryProductName = resolvedProductName;
        primaryVariantLabel = resolvedVariantLabel;
        primaryProductStatus = resolvedProductStatus;
      }
    }

    // Flush mutated existing products (each touched product updated once)
    for (const [pid, state] of productStateMap.entries()) {
      if (!state.touched) continue;
      const prodTotalStock = state.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
      const prodTotalReserved = state.variants.reduce((s, v) => s + Math.max(0, Number(v.reservedQty) || 0), 0);
      const nextProdReservations = state.variants.flatMap((v) => v.reservedForPreOrders || []);
      const nextStockStatus = computeAvailableStockStatus(
        prodTotalStock,
        prodTotalReserved,
        state.prodData.reorderThreshold
      );
      const matchedLineBreakdown = itemsBreakdown.find((b) => b.productId === pid);
      const productPatch: Partial<Product> = {
        variants: state.variants,
        totalStock: prodTotalStock,
        reservedQty: prodTotalReserved,
        reservedForPreOrders: nextProdReservations,
        stockStatus: nextStockStatus,
        ...(matchedLineBreakdown && matchedLineBreakdown.unitLandedCost > 0
          ? { costPrice: matchedLineBreakdown.unitLandedCost }
          : {}),
      };
      txn.update(doc(db, 'products', pid), sanitizeData(productPatch));
    }

    const totalGoodUnits = multiCost.totalGoodQty;
    const totalDamagedUnits = multiCost.totalDamagedQty;
    const avgUnitLandedCost =
      totalGoodUnits + totalDamagedUnits > 0
        ? roundMoney(
            (multiCost.totalGoodLandedCost + multiCost.totalDamagedCostLoss) /
              (totalGoodUnits + totalDamagedUnits)
          )
        : itemsBreakdown[0]?.unitLandedCost || 0;

    const receiptDoc: PreOrderReceipt = {
      id: receiptId,
      preOrderId,
      preOrderNumber: prelimOrder.preOrderNumber,
      subBrand: prelimOrder.subBrand,
      receivedQty: totalGoodUnits,
      damagedQty: totalDamagedUnits,
      productId: primaryProductId,
      productName:
        itemsBreakdown.length > 1
          ? `${primaryProductName} (+${itemsBreakdown.length - 1} more)`
          : primaryProductName,
      variantId: primaryVariantId,
      variantLabel: primaryVariantLabel,
      chinaUnitCost: itemsBreakdown[0]?.chinaUnitCost || privCost?.chinaUnitCost || 0,
      shippingCostPerUnit: itemsBreakdown[0]?.shippingCostPerUnit || 0,
      shippingCostPortion: multiCost.totalShippingPortion,
      unitLandedCost: avgUnitLandedCost,
      totalGoodLandedCost: multiCost.totalGoodLandedCost,
      damagedCostLoss: multiCost.totalDamagedCostLoss,
      ...(firstDamagedLossId ? { damagedLossId: firstDamagedLossId } : {}),
      damagedLossPending: false,
      itemsBreakdown,
      note: input.note?.trim() || '',
      idempotencyKey: input.idempotencyKey.trim(),
      receivedBy: actor.id,
      receivedByName: actor.name,
      receivedAt: now,
    };
    txn.set(receiptRef, sanitizeData(receiptDoc));

    // A4 Accounting Posting
    const receiptPosting = buildInventoryReceivedPosting({
      preOrderId,
      preOrderNumber: prelimOrder.preOrderNumber,
      subBrand: prelimOrder.subBrand,
      receiptId,
      goodLandedCost: multiCost.totalGoodLandedCost,
      damagedLossCost: multiCost.totalDamagedCostLoss,
      note: `Received ${totalGoodUnits} good, ${totalDamagedUnits} damaged across ${itemsBreakdown.length} line(s) on ${prelimOrder.preOrderNumber}`,
      actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
    });
    txn.set(doc(db, 'accountingPostings', receiptPosting.id), sanitizeData(receiptPosting));

    const updatedOrderItems = sanitizePreOrderItemsForDoc(
      orderItems.map((it) => orderItemMap.get(it.itemId) || it)
    );
    const newTotalGood = updatedOrderItems.reduce((s, it) => s + Math.max(0, Number(it.receivedQty) || 0), 0);
    const newTotalDamaged = updatedOrderItems.reduce((s, it) => s + Math.max(0, Number(it.damagedQty) || 0), 0);
    const totalLandedAllGood = roundMoney(
      updatedOrderItems.reduce((s, it) => s + roundMoney(it.landedCostTotal || 0), 0)
    );
    const weightedReceivedLanded =
      newTotalGood > 0 ? roundMoney(totalLandedAllGood / newTotalGood) : avgUnitLandedCost;

    const isFullyAccountedFor = updatedOrderItems.every(
      (it) => (Number(it.receivedQty) || 0) + (Number(it.damagedQty) || 0) >= it.qty
    );
    const shouldMoveToReceivedStatus =
      isFullyAccountedFor &&
      !['Received in Stock', 'Ready for Delivery', 'Out for Delivery', 'Delivered'].includes(
        prelimOrder.status
      );

    const nextStatus: PreOrderStatus = shouldMoveToReceivedStatus
      ? 'Received in Stock'
      : prelimOrder.status;

    const legacySummary = summarizePreOrderItemsLegacyFields(updatedOrderItems);
    const poPatch: Partial<PreOrder> = {
      items: updatedOrderItems,
      linkedProductId: legacySummary.linkedProductId || primaryProductId,
      linkedVariantId: legacySummary.linkedVariantId || primaryVariantId,
      stockReceivedQty: newTotalGood,
      damagedQty: newTotalDamaged,
      stockReceived: isFullyAccountedFor,
      stockReceivedAt: prelimOrder.stockReceivedAt || now,
      unitLandedCost: weightedReceivedLanded,
      landedCostTotal: totalLandedAllGood,
      status: nextStatus,
      updatedAt: now,
      updatedBy: actor.id,
    };
    txn.update(preOrderRef, sanitizeData(poPatch));

    if (shouldMoveToReceivedStatus) {
      const historyDoc: PreOrderStatusHistory = {
        id: historyRef.id,
        preOrderId,
        fromStatus: prelimOrder.status,
        toStatus: 'Received in Stock',
        note: `Stock received into warehouse (${newTotalGood} good${
          newTotalDamaged > 0 ? `, ${newTotalDamaged} damaged` : ''
        } across ${updatedOrderItems.length} item(s))`,
        publicMessage: `Your item(s) arrived in our Dhaka warehouse and passed inspection.`,
        notifyCustomer: true,
        changedBy: actor.id,
        changedByName: actor.name,
        timestamp: now,
      };
      txn.set(historyRef, sanitizeData(historyDoc));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: prelimOrder.preOrderNumber,
        action: 'STOCK_RECEIVED' as PreOrderAuditAction,
        summary: `Received ${totalGoodUnits} good + ${totalDamagedUnits} damaged unit(s) across ${itemsBreakdown.length} line(s) for ${prelimOrder.preOrderNumber}`,
        metadata: {
          receiptId,
          productId: primaryProductId,
          variantId: primaryVariantId,
          createdNewProduct: createdAnyNewProduct,
          productStatus: primaryProductStatus,
          goodQty: totalGoodUnits,
          damagedQty: totalDamagedUnits,
          unitLandedCost: avgUnitLandedCost,
          totalGoodLandedCost: multiCost.totalGoodLandedCost,
          damagedCostLoss: multiCost.totalDamagedCostLoss,
          itemsBreakdown,
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    const updatedReceiveOrder = { ...prelimOrder, ...poPatch };
    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: prelimOrder,
      afterOrder: updatedReceiveOrder,
      now,
    });

    const recNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      recNotifRef,
      sanitizeData({
        id: recNotifRef.id,
        preOrderId,
        preOrderNumber: prelimOrder.preOrderNumber,
        subBrand: prelimOrder.subBrand,
        type: 'stock_received',
        category: 'event',
        severity: 'info',
        title: `Stock Received · ${prelimOrder.preOrderNumber}`,
        message: `Received ${totalGoodUnits} good${totalDamagedUnits > 0 ? `, ${totalDamagedUnits} damaged` : ''} unit(s) for ${formatPreOrderProductLabel(updatedReceiveOrder)}. Status: ${nextStatus}.`,
        targetTab: 'preorder_list',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: prelimOrder.customerPhone,
        customerName: prelimOrder.customerName,
        dueAmount: prelimOrder.dueAmount,
        preOrderStatus: nextStatus,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );

    result = {
      receipt: receiptDoc,
      order: updatedReceiveOrder,
      productId: primaryProductId,
      variantId: primaryVariantId,
      createdNewProduct: createdAnyNewProduct,
      productStatus: primaryProductStatus,
    };
  });

  dbCache.products = null;
  dbCache.productsArchived = null;

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    result.trackingSyncWarning = syncRes.error;
  }

  return result;
}

export interface ConvertPreOrderToSaleInput {
  courier?: string;
  courierTrackingNumber?: string;
  deliveryAddress?: string;
  notes?: string;
}

export interface ConvertPreOrderToSaleResult {
  orderId: string;
  invoiceId: string;
  invoiceNumber: string;
  order: Order;
  invoice: Invoice;
  preOrder: PreOrder;
  alreadyConverted: boolean;
  trackingSyncWarning?: string;
}

export async function convertPreOrderToSale(
  preOrderId: string,
  input: ConvertPreOrderToSaleInput,
  actor: PreOrderActor
): Promise<ConvertPreOrderToSaleResult> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const convLockRef = doc(db, 'preOrderConversions', preOrderId);
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const companySettingsRef = doc(db, 'settings', 'company');
  const countersRef = doc(db, 'settings', 'invoiceCounters');
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', generateId('HIST'));

  let result!: ConvertPreOrderToSaleResult;

  await runTransaction(db, async (txn) => {
    const preSnap = await txn.get(preOrderRef);
    if (!preSnap.exists()) throw new Error('Pre-order not found.');
    const po = withNormalizedPreOrderItems({ ...(preSnap.data() as PreOrder), id: preSnap.id });
    const orderItems = normalizePreOrderItems(po);

    const convLockSnap = await txn.get(convLockRef);

    // Idempotent duplicate check
    if (convLockSnap.exists() || po.convertedSaleId || po.convertedOrderId) {
      const lockData = convLockSnap.exists() ? (convLockSnap.data() as PreOrderConversionLock) : null;
      const existingOrderId = lockData?.orderId || po.convertedSaleId || po.convertedOrderId || '';
      const existingInvoiceId = lockData?.invoiceId || po.convertedInvoiceId || '';
      const [existingOrdSnap, existingInvSnap] = await Promise.all([
        existingOrderId ? txn.get(doc(db, 'orders', existingOrderId)) : Promise.resolve(null),
        existingInvoiceId ? txn.get(doc(db, 'invoices', existingInvoiceId)) : Promise.resolve(null),
      ]);
      result = {
        orderId: existingOrderId,
        invoiceId: existingInvoiceId,
        invoiceNumber: lockData?.invoiceNumber || po.convertedInvoiceNumber || '',
        order: existingOrdSnap?.exists()
          ? ({ id: existingOrdSnap.id, ...existingOrdSnap.data() } as Order)
          : ({} as Order),
        invoice: existingInvSnap?.exists()
          ? ({ id: existingInvSnap.id, ...existingInvSnap.data() } as Invoice)
          : ({} as Invoice),
        preOrder: po,
        alreadyConverted: true,
      };
      return;
    }

    if (po.isCancelled || po.status === 'Cancelled' || po.status === 'Refunded') {
      throw new Error(`Cannot convert a ${po.status} pre-order.`);
    }

    // Require all items to be received/accounted for before conversion so delivery/discount/advance apply cleanly once
    const unreceivedItems = orderItems.filter((it) => {
      const rec = Number(it.receivedQty ?? (orderItems.length === 1 ? po.stockReceivedQty : 0)) || 0;
      const dmg = Number(it.damagedQty ?? (orderItems.length === 1 ? po.damagedQty : 0)) || 0;
      return rec + dmg < it.qty;
    });
    if (unreceivedItems.length > 0 && !po.stockReceived) {
      throw new Error(
        `Receive all items before converting to Sale & Invoice (${unreceivedItems.map((i) => i.productName).join(', ')} still pending receipt).`
      );
    }

    const convertibleItems = orderItems
      .map((it) => {
        const sellQty = Math.max(
          0,
          Number(it.receivedQty ?? (orderItems.length === 1 ? po.stockReceivedQty || po.qty : 0)) || 0
        );
        const productId = (it.linkedProductId || (orderItems.length === 1 ? po.linkedProductId : '') || '').trim();
        const variantId = (it.linkedVariantId || (orderItems.length === 1 ? po.linkedVariantId : '') || '').trim();
        return { item: it, sellQty, productId, variantId };
      })
      .filter((entry) => entry.sellQty > 0);

    if (convertibleItems.length === 0) {
      throw new Error('Stock must be received in BD warehouse before converting to Sale & Invoice.');
    }

    const missingProductLink = convertibleItems.find((e) => !e.productId);
    if (missingProductLink) {
      throw new Error(
        `Linked warehouse product missing for "${missingProductLink.item.productName}". Receive stock first before converting.`
      );
    }

    const uniqueProductIds = Array.from(new Set(convertibleItems.map((e) => e.productId)));
    const customerRef = po.customerId ? doc(db, 'customers', po.customerId) : null;

    // ALL REMAINING READS FIRST
    const [costSnap, ledger, companySettingsSnap, countersSnap, custSnap, statsSnap, ...productSnaps] =
      await Promise.all([
        txn.get(costRef),
        loadAndLockOrderLedgerInTxn(txn, preOrderId),
        txn.get(companySettingsRef),
        txn.get(countersRef),
        customerRef ? txn.get(customerRef) : Promise.resolve(null),
        txn.get(doc(db, 'preOrderStats', 'summary')),
        ...uniqueProductIds.map((pid) => txn.get(doc(db, 'products', pid))),
      ]);

    const productStateMap = new Map<string, { prodData: Product; variants: Variant[] }>();
    uniqueProductIds.forEach((pid, idx) => {
      const snap = productSnaps[idx];
      if (!snap || !snap.exists()) {
        throw new Error(`Linked warehouse product document (${pid}) was not found.`);
      }
      const prodData = snap.data() as Product;
      productStateMap.set(pid, {
        prodData,
        variants: Array.isArray(prodData.variants) ? [...prodData.variants] : [],
      });
    });

    const privCost = costSnap.exists() ? (costSnap.data() as PreOrderPrivateCost) : null;
    const calc = calculatePreOrderFinancials({
      items: orderItems,
      deliveryCharge: po.deliveryCharge,
      discount: po.discount,
      payments: ledger,
    });

    const unitLandedCostsByItemId: Record<string, number> = {};
    convertibleItems.forEach(({ item }) => {
      const fallbackLanded = orderItems.length === 1 ? po.unitLandedCost : undefined;
      const uCost = item.unitLandedCost ?? fallbackLanded;
      if (uCost !== undefined && uCost > 0) {
        unitLandedCostsByItemId[item.itemId] = uCost;
      }
    });

    const costMapObj = computeItemCostMap(po, privCost);
    const itemChinaCostsByItemId = Object.fromEntries(
      Object.entries(costMapObj).map(([k, v]) => [k, v.chinaUnitCost])
    );
    const conversionCalc = calculateSaleConversionBreakdown({
      items: convertibleItems.map((e) => ({ ...e.item, qty: e.sellQty })),
      qty: convertibleItems.reduce((s, e) => s + e.sellQty, 0),
      sellingUnitPrice: po.sellingUnitPrice,
      deliveryCharge: po.deliveryCharge,
      discount: po.discount,
      verifiedNetPaid: calc.verifiedNetPaid,
      unitLandedCostsByItemId,
      itemChinaCostsByItemId,
      fallbackChinaUnitCost: privCost?.chinaUnitCost || 0,
      fallbackShippingCost:
        calculateActualShippingCost(privCost?.shippingExpenses) || privCost?.shippingCost || 0,
    });

    // Deduct stock + clear reservations per convertible item using productStateMap
    const orderItemsForSale: OrderItem[] = [];
    const pendingSaleLogs: Array<Omit<StockLog, 'id'>> = [];

    for (let idx = 0; idx < convertibleItems.length; idx++) {
      const { item, sellQty, productId, variantId } = convertibleItems[idx];
      const lineBreakdown = conversionCalc.itemBreakdowns?.[idx];
      const prodState = productStateMap.get(productId)!;

      let targetVarIdx = prodState.variants.findIndex((v) => v.id === variantId);
      if (targetVarIdx === -1 && prodState.variants.length > 0) {
        targetVarIdx = 0;
      }
      if (targetVarIdx === -1) {
        throw new Error(`Linked product "${prodState.prodData.name}" has no variants to deduct stock from.`);
      }

      const targetVar = prodState.variants[targetVarIdx];
      const beforeVarStock = Number(targetVar.stock) || 0;
      if (beforeVarStock < sellQty) {
        throw new Error(
          `Insufficient warehouse stock on ${prodState.prodData.name} (${beforeVarStock} on hand, need ${sellQty}).`
        );
      }

      const afterVarStock = beforeVarStock - sellQty;
      const beforeVarReserved = Math.max(0, Number(targetVar.reservedQty) || 0);
      const releaseQty = Math.min(beforeVarReserved, sellQty);
      const afterVarReserved = Math.max(0, beforeVarReserved - releaseQty);
      const nextVarReservations = (targetVar.reservedForPreOrders || []).filter(
        (r) => !(r.preOrderId === preOrderId && (!r.itemId || r.itemId === item.itemId))
      );

      prodState.variants[targetVarIdx] = {
        ...targetVar,
        stock: afterVarStock,
        reservedQty: afterVarReserved,
        reservedForPreOrders: nextVarReservations,
      };

      const variantLabel = [
        targetVar.color || item.color || 'Standard',
        targetVar.model || item.model || 'Standard',
        item.variant || '',
      ]
        .filter(Boolean)
        .join(' / ');

      orderItemsForSale.push({
        productId: prodState.prodData.id || productId,
        variantId: targetVar.id,
        productName: item.productName,
        variantLabel,
        qty: sellQty,
        unitPrice: item.sellingUnitPrice,
        costPrice: lineBreakdown ? lineBreakdown.unitCostPrice : conversionCalc.unitCostPrice,
      });

      pendingSaleLogs.push({
        productId: prodState.prodData.id || productId,
        productName: prodState.prodData.name || item.productName,
        type: 'sale',
        qty: -sellQty,
        reason: `Pre-Order Sale (${po.preOrderNumber})`,
        userId: actor.id,
        userName: actor.name,
        timestamp: now,
        beforeQty: beforeVarStock,
        afterQty: afterVarStock,
        orderId: '', // Filled once orderId is allocated below
        preOrderId,
        variantId: targetVar.id,
        refNo: '', // Filled once invoiceNumber is allocated below
      });
    }

    // Allocate sequential Invoice Number using existing invoiceCounters pattern
    const prefixes =
      companySettingsSnap.exists() && companySettingsSnap.data()?.prefixes
        ? companySettingsSnap.data().prefixes
        : { SAT: 'SAT-INV', GZ: 'GZ-INV', RTX: 'RTX-INV' };

    let satCounter = 0;
    let gzCounter = 0;
    let rtxCounter = 0;
    if (countersSnap.exists()) {
      const cData = countersSnap.data();
      satCounter = cData.satCounter || 0;
      gzCounter = cData.gzCounter || 0;
      rtxCounter = cData.rtxCounter || 0;
    }

    let prefix = 'SAT-INV';
    let nextNum = 1;
    const sub = po.subBrand || 'SAT';
    if (sub === 'SAT') {
      prefix = prefixes?.SAT || 'SAT-INV';
      satCounter++;
      nextNum = satCounter;
    } else if (sub === 'GZ') {
      prefix = prefixes?.GZ || 'GZ-INV';
      gzCounter++;
      nextNum = gzCounter;
    } else if (sub === 'RTX') {
      prefix = prefixes?.RTX || 'RTX-INV';
      rtxCounter++;
      nextNum = rtxCounter;
    }

    const invoiceNumber = `${prefix}-${String(nextNum).padStart(4, '0')}`;
    const orderRef = doc(collection(db, 'orders'));
    const orderId = orderRef.id;
    const invoiceId = `INV-${now}-${Math.random().toString(36).substring(2, 9)}`;
    const invoiceRef = doc(db, 'invoices', invoiceId);

    const verifiedCollections = ledger.filter(
      (p) => p.status === 'verified' && p.type !== 'refund' && p.type !== 'reversal'
    );
    const primaryMethodRaw =
      verifiedCollections[verifiedCollections.length - 1]?.method || 'Cash';
    const orderPaymentMethod: Order['paymentMethod'] =
      primaryMethodRaw === 'bKash' ||
      primaryMethodRaw === 'Nagad' ||
      primaryMethodRaw === 'Bank Transfer'
        ? primaryMethodRaw
        : 'Cash';

    const orderPaymentStatus: Order['paymentStatus'] =
      conversionCalc.remainingDue <= 0
        ? 'Paid'
        : conversionCalc.advanceApplied > 0
        ? 'Partial'
        : 'Due';

    const initialPaymentHistory: OrderPaymentHistory[] =
      conversionCalc.advanceApplied > 0
        ? [
            {
              amount: conversionCalc.advanceApplied,
              method: orderPaymentMethod,
              date: po.createdAt || now,
              recordedBy: po.createdByName || actor.name,
              label: `Advance paid (Pre-Order ${po.preOrderNumber})`,
              isPreOrderAdvance: true,
            },
          ]
        : [];

    const validSalesChannels = [
      'Facebook',
      'TikTok',
      'Instagram',
      'Daraz',
      'CartUp',
      'Packly',
      'Direct/WhatsApp',
    ];
    const resolvedChannel: Order['salesChannel'] = validSalesChannels.includes(
      po.salesChannel || ''
    )
      ? (po.salesChannel as Order['salesChannel'])
      : 'Direct/WhatsApp';

    const newOrderDoc: Order = {
      id: orderId,
      customerId: po.customerId || '',
      customerName: po.customerName,
      customerPhone: po.customerPhone,
      subBrand: po.subBrand,
      salesChannel: resolvedChannel,
      items: orderItemsForSale,
      discountAmount: conversionCalc.discount,
      shippingCharge: conversionCalc.deliveryCharge,
      totalAmount: conversionCalc.totalAmount,
      courier: input.courier?.trim() || po.courier || 'Hand to Hand',
      courierTrackingNumber: input.courierTrackingNumber?.trim() || po.trackingNumber || '',
      paymentMethod: orderPaymentMethod,
      paymentStatus: orderPaymentStatus,
      amountPaid: conversionCalc.advanceApplied,
      amountDue: conversionCalc.remainingDue,
      status: 'Confirmed',
      statusHistory: [
        {
          status: 'Confirmed',
          timestamp: now,
          changedBy: actor.name,
        },
      ],
      deliveryAddress: input.deliveryAddress?.trim() || po.customerAddress,
      notes: input.notes?.trim() || po.notes || `Converted from Pre-Order ${po.preOrderNumber}`,
      createdBy: actor.name,
      createdAt: now,
      invoiceId,
      paymentHistory: initialPaymentHistory,
      source: 'pre_order',
      preOrderId,
      preOrderNumber: po.preOrderNumber,
      stockDeductedOnConvert: true,
    };

    const custCode =
      custSnap && custSnap.exists() ? custSnap.data()?.customerId || po.customerCode || '' : po.customerCode || '';

    const newInvoiceDoc: Invoice = {
      id: invoiceId,
      orderId,
      invoiceNumber,
      subBrand: po.subBrand,
      subBrandPrefix: prefix,
      customerId: custCode,
      customerName: po.customerName,
      customerPhone: po.customerPhone,
      items: orderItemsForSale,
      discountAmount: conversionCalc.discount,
      shippingCharge: conversionCalc.deliveryCharge,
      totalAmount: conversionCalc.totalAmount,
      amountPaid: conversionCalc.advanceApplied,
      amountDue: conversionCalc.remainingDue,
      paymentStatus: orderPaymentStatus,
      courier: newOrderDoc.courier,
      courierTrackingNumber: newOrderDoc.courierTrackingNumber || '',
      generatedAt: now,
      generatedBy: actor.id,
      voided: false,
      source: 'pre_order',
      preOrderId,
      preOrderNumber: po.preOrderNumber,
    };

    // ALL WRITES START HERE
    txn.set(countersRef, { satCounter, gzCounter, rtxCounter }, { merge: true });

    for (const [pid, prodState] of productStateMap.entries()) {
      const nextTotalStock = prodState.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
      const nextReservedTotal = prodState.variants.reduce((s, v) => s + Math.max(0, Number(v.reservedQty) || 0), 0);
      const nextProdReservations = prodState.variants.flatMap((v) => v.reservedForPreOrders || []);
      const nextStockStatus = computeAvailableStockStatus(
        nextTotalStock,
        nextReservedTotal,
        prodState.prodData.reorderThreshold
      );
      txn.update(
        doc(db, 'products', pid),
        sanitizeData({
          variants: prodState.variants,
          totalStock: nextTotalStock,
          reservedQty: nextReservedTotal,
          reservedForPreOrders: nextProdReservations,
          stockStatus: nextStockStatus,
        })
      );
    }

    for (const logItem of pendingSaleLogs) {
      const stockLogRef = doc(collection(db, 'stockLogs'));
      txn.set(
        stockLogRef,
        sanitizeData({
          ...logItem,
          orderId,
          refNo: invoiceNumber,
        })
      );
    }

    const ordPayload = sanitizeData(newOrderDoc);
    delete ordPayload.id;
    txn.set(orderRef, ordPayload);
    txn.set(invoiceRef, sanitizeData(newInvoiceDoc));

    if (customerRef && custSnap && custSnap.exists()) {
      const cData = custSnap.data() as Customer;
      txn.update(
        customerRef,
        sanitizeData({
          totalOrders: (Number(cData.totalOrders) || 0) + 1,
          lifetimeValue: roundMoney((Number(cData.lifetimeValue) || 0) + conversionCalc.totalAmount),
        })
      );
    }

    const lockDoc: PreOrderConversionLock = {
      preOrderId,
      preOrderNumber: po.preOrderNumber,
      orderId,
      invoiceId,
      invoiceNumber,
      convertedAt: now,
      convertedBy: actor.id,
    };
    txn.set(convLockRef, sanitizeData(lockDoc));

    // A5 Accounting Posting (Sales income, COGS, Profit, settles Customer Advances & Pre-Order Inventory; Cash = 0)
    const convertPosting = buildConvertToSalePosting({
      preOrderId,
      preOrderNumber: po.preOrderNumber,
      subBrand: po.subBrand,
      orderId,
      invoiceNumber,
      advanceApplied: conversionCalc.advanceApplied,
      totalSaleAmount: conversionCalc.totalAmount,
      totalLandedCogs: conversionCalc.totalCogs,
      note: `Converted ${po.preOrderNumber} -> ${invoiceNumber} (${orderItemsForSale.length} item(s), Sales ৳${conversionCalc.totalAmount}, COGS ৳${conversionCalc.totalCogs})`,
      actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
    });
    txn.set(doc(db, 'accountingPostings', convertPosting.id), sanitizeData(convertPosting));

    const updatedConvertedItems = sanitizePreOrderItemsForDoc(
      orderItems.map((it) => {
        const matched = convertibleItems.find((c) => c.item.itemId === it.itemId);
        const brkIdx = convertibleItems.findIndex((c) => c.item.itemId === it.itemId);
        const brk = brkIdx >= 0 ? conversionCalc.itemBreakdowns[brkIdx] : undefined;
        return {
          ...it,
          convertedQty: matched ? matched.sellQty : 0,
          unitLandedCost: brk ? brk.unitCostPrice : it.unitLandedCost,
          landedCostTotal: brk ? brk.lineCogs : it.landedCostTotal,
          status: matched ? 'converted' : it.status || 'pending',
        };
      })
    );

    const nextStatus: PreOrderStatus =
      po.status === 'Received in Stock' ? 'Ready for Delivery' : po.status;
    const poPatch: Partial<PreOrder> = {
      items: updatedConvertedItems,
      convertedOrderId: orderId,
      convertedSaleId: orderId,
      convertedInvoiceId: invoiceId,
      convertedInvoiceNumber: invoiceNumber,
      convertedAt: now,
      status: nextStatus,
      unitLandedCost: conversionCalc.unitCostPrice,
      landedCostTotal: conversionCalc.totalCogs,
      updatedAt: now,
      updatedBy: actor.id,
    };
    txn.update(preOrderRef, sanitizeData(poPatch));

    if (nextStatus !== po.status) {
      const historyDoc: PreOrderStatusHistory = {
        id: historyRef.id,
        preOrderId,
        fromStatus: po.status,
        toStatus: nextStatus,
        note: `Converted to Sales Order & Invoice ${invoiceNumber} (${orderItemsForSale.length} line(s))`,
        publicMessage: `Your order has been billed (${invoiceNumber}) and is ready for dispatch.`,
        notifyCustomer: true,
        changedBy: actor.id,
        changedByName: actor.name,
        timestamp: now,
      };
      txn.set(historyRef, sanitizeData(historyDoc));
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        action: 'CONVERTED_TO_SALE' as PreOrderAuditAction,
        summary: `Converted ${po.preOrderNumber} (${orderItemsForSale.length} item(s)) to Sales Order ${orderId} & Invoice ${invoiceNumber} (Advance applied: ৳${conversionCalc.advanceApplied.toLocaleString()}, Due: ৳${conversionCalc.remainingDue.toLocaleString()})`,
        metadata: {
          orderId,
          invoiceId,
          invoiceNumber,
          itemCount: orderItemsForSale.length,
          totalAmount: conversionCalc.totalAmount,
          advanceApplied: conversionCalc.advanceApplied,
          remainingDue: conversionCalc.remainingDue,
          totalCogs: conversionCalc.totalCogs,
          recognizedProfit: conversionCalc.recognizedProfit,
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    const updatedConvertedOrder = { ...po, ...poPatch };
    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: po,
      afterOrder: updatedConvertedOrder,
      customerAdvanceLiabilityDelta: -conversionCalc.advanceApplied,
      now,
    });

    const convNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      convNotifRef,
      sanitizeData({
        id: convNotifRef.id,
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        type: 'ready_for_delivery',
        category: 'event',
        severity: 'info',
        title: `Converted to Invoice ${invoiceNumber}`,
        message: `${po.preOrderNumber} (${formatPreOrderProductLabel(po)}) for ${po.customerName} converted to Sales Order & Invoice ${invoiceNumber} (Due: ৳${conversionCalc.remainingDue.toLocaleString()}).`,
        targetTab: 'preorder_list',
        forRoles: ['superadmin', 'admin', 'manager', 'staff'],
        readBy: [],
        customerPhone: po.customerPhone,
        customerName: po.customerName,
        dueAmount: conversionCalc.remainingDue,
        preOrderStatus: nextStatus,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );

    result = {
      orderId,
      invoiceId,
      invoiceNumber,
      order: newOrderDoc,
      invoice: newInvoiceDoc,
      preOrder: updatedConvertedOrder,
      alreadyConverted: false,
    };
  });

  dbCache.orders = null;
  dbCache.invoices = null;
  dbCache.products = null;
  dbCache.productsArchived = null;
  dbCache.customers = null;

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    result.trackingSyncWarning = syncRes.error;
  }

  return result;
}

export interface CancelAndReconcileInput {
  reason: string;
  customerResolution: CancelCustomerResolution;
  refundAmount?: number;
  refundMethod?: PreOrderPaymentMethod;
  refundReferenceNo?: string;
  retainedChargeReason?: string;
  supplierResolution: CancelSupplierResolution;
  supplierSettledAmount?: number;
  stockResolution: CancelStockResolution;
  idempotencyKey: string;
}

export interface CancelAndReconcileResult {
  order: PreOrder;
  cancellation: PreOrderCancellationSummary;
  trackingSyncWarning?: string;
}

export async function cancelAndReconcilePreOrder(
  preOrderId: string,
  input: CancelAndReconcileInput,
  actor: PreOrderActor
): Promise<CancelAndReconcileResult> {
  if (!input.reason?.trim()) {
    throw new Error('Cancellation reason is required.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('Idempotency key is required.');
  }

  const now = Date.now();
  const safeKey = sanitizeIdFragment(input.idempotencyKey.trim());
  const isAdmin = isPreOrderAdminRole(actor.role);
  const isSuperAdminActor = actor.role === 'superadmin' || actor.role === 'super_admin';

  // Load supplier payments outside transaction cleanly
  const supplierPayments = await getPreOrderSupplierPayments(preOrderId, 100);

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const costRef = doc(db, 'preOrders', preOrderId, 'private', 'cost');
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', generateId('HIST'));
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  let result!: CancelAndReconcileResult;

  await runTransaction(db, async (txn) => {
    const preSnap = await txn.get(preOrderRef);
    if (!preSnap.exists()) throw new Error('Pre-order not found.');
    const po = withNormalizedPreOrderItems({ ...(preSnap.data() as PreOrder), id: preSnap.id });
    const poItems = normalizePreOrderItems(po);

    if (po.convertedSaleId || po.convertedOrderId) {
      throw new Error(
        `This pre-order has already been converted to Sales Order (${po.convertedInvoiceNumber || po.convertedSaleId}). Cancel it from the Order Desk / Invoices screen instead.`
      );
    }
    if (po.status === 'Delivered') {
      throw new Error('Delivered pre-orders cannot be cancelled.');
    }
    if ((po.status === 'Cancelled' || po.status === 'Refunded') && po.cancellation) {
      result = { order: po, cancellation: po.cancellation };
      return;
    }

    const cancelProductIds = Array.from(
      new Set([
        ...poItems.map((it) => (it.linkedProductId || '').trim()).filter(Boolean),
        ...(po.linkedProductId ? [po.linkedProductId.trim()] : []),
      ])
    );

    const [costSnap, ledger, statsSnap, ...cancelProdSnaps] = await Promise.all([
      txn.get(costRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
      txn.get(doc(db, 'preOrderStats', 'summary')),
      ...cancelProductIds.map((pid) => txn.get(doc(db, 'products', pid))),
    ]);

    const cancelProductMap = new Map<string, { prodData: Product; variants: Variant[] }>();
    cancelProductIds.forEach((pid, idx) => {
      const pSnap = cancelProdSnaps[idx];
      if (pSnap && pSnap.exists()) {
        const prodData = pSnap.data() as Product;
        cancelProductMap.set(pid, {
          prodData,
          variants: Array.isArray(prodData.variants) ? [...prodData.variants] : [],
        });
      }
    });

    const privCost = costSnap.exists() ? (costSnap.data() as PreOrderPrivateCost) : null;
    const itemCostMap = computeItemCostMap(po, privCost);
    const calc = calculatePreOrderFinancials({
      items: poItems,
      deliveryCharge: po.deliveryCharge,
      discount: po.discount,
      payments: ledger,
    });

    const verifiedNetPaid = calc.verifiedNetPaid;
    const supSummary = calculatePerOrderSupplierSummary({
      qty: po.totalQty || po.qty,
      items: poItems.map((it) => ({
        qty: it.qty,
        chinaUnitCost: itemCostMap[it.itemId]?.chinaUnitCost ?? privCost?.chinaUnitCost ?? 0,
      })),
      chinaUnitCost: privCost?.chinaUnitCost || 0,
      preOrderId,
      supplierPayments,
    });
    const actualShip =
      calculateActualShippingCost(privCost?.shippingExpenses) ||
      Number(privCost?.actualShippingCost || 0);
    const totalSupplierAndShipPaid = roundMoney(supSummary.paidToSupplier + actualShip);

    const perItemReceived = poItems.map((it) => {
      const itemGood = Math.max(
        0,
        Number(it.receivedQty ?? (poItems.length === 1 ? po.stockReceivedQty : 0)) || 0
      );
      const itemLanded = roundMoney(
        it.unitLandedCost ||
          po.unitLandedCost ||
          itemCostMap[it.itemId]?.chinaUnitCost ||
          privCost?.chinaUnitCost ||
          0
      );
      return { item: it, itemGood, itemLanded };
    });
    const goodReceivedQty = perItemReceived.reduce((s, r) => s + r.itemGood, 0);
    const goodValue = roundMoney(
      perItemReceived.reduce((s, r) => s + roundMoney(r.itemGood * r.itemLanded), 0)
    );

    // ---- 1. Customer Money Validation ----
    let refundAmount = 0;
    let retainedChargeAmount = 0;
    let resolvedCustRes: CancelCustomerResolution = input.customerResolution;

    if (toPaisa(verifiedNetPaid) <= 0) {
      resolvedCustRes = 'none';
    } else {
      if (!isAdmin) {
        throw new Error(
          'Only Admin or Super Admin can cancel a pre-order that has verified customer advance payments.'
        );
      }
      if (input.customerResolution === 'full_refund') {
        refundAmount = verifiedNetPaid;
        retainedChargeAmount = 0;
      } else if (input.customerResolution === 'partial_refund') {
        const reqRefund = roundMoney(input.refundAmount || 0);
        if (reqRefund <= 0 || toPaisa(reqRefund) >= toPaisa(verifiedNetPaid)) {
          throw new Error(
            'Partial refund amount must be greater than 0 and less than total verified advance paid.'
          );
        }
        refundAmount = reqRefund;
        retainedChargeAmount = fromPaisa(toPaisa(verifiedNetPaid) - toPaisa(reqRefund));
        if (!input.retainedChargeReason?.trim() && !input.reason?.trim()) {
          throw new Error('A reason is required for retaining a cancellation charge.');
        }
      } else if (input.customerResolution === 'no_refund') {
        if (!isSuperAdminActor) {
          throw new Error(
            'Forfeiting customer advance with No Refund is restricted to Super Admin only.'
          );
        }
        if (!input.retainedChargeReason?.trim()) {
          throw new Error('Explicit Super Admin reason is required when choosing No Refund.');
        }
        refundAmount = 0;
        retainedChargeAmount = verifiedNetPaid;
      } else {
        throw new Error('Select how to resolve the customer advance payment.');
      }

      if (refundAmount > 0 && !input.refundMethod) {
        throw new Error('Select a refund payment method.');
      }
      if (
        refundAmount > 0 &&
        input.refundMethod &&
        input.refundMethod !== 'Cash' &&
        !input.refundReferenceNo?.trim()
      ) {
        throw new Error(`Refund transaction / reference ID is required for ${input.refundMethod}.`);
      }
    }

    // ---- 2. Supplier Money Validation ----
    const unreceivedTransitMoney = Math.max(
      0,
      fromPaisa(toPaisa(totalSupplierAndShipPaid) - toPaisa(goodValue))
    );
    const settledSupplierAmt =
      input.supplierResolution === 'none' || input.supplierResolution === 'keep_stock'
        ? 0
        : roundMoney(input.supplierSettledAmount ?? unreceivedTransitMoney);

    // ---- 3. Received Stock Validation ----
    let resolvedStockRes: CancelStockResolution =
      goodReceivedQty > 0 ? input.stockResolution : 'none';
    if (goodReceivedQty > 0 && resolvedStockRes === 'none') {
      throw new Error('Select how to handle received pre-order warehouse stock.');
    }

    // ---- WRITES ----
    let refundPaymentId = '';
    const updatedLedger = [...ledger];

    if (refundAmount > 0 && input.refundMethod) {
      refundPaymentId = `PAY_${safeKey}_refund`;
      const refundPaymentDoc: PreOrderPayment = {
        id: refundPaymentId,
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        customerName: po.customerName,
        customerPhone: po.customerPhone,
        type: 'refund',
        amount: refundAmount,
        method: input.refundMethod,
        referenceNo: input.refundReferenceNo?.trim() || '',
        receivedAt: now,
        note: `Cancellation refund: ${input.reason.trim()}`,
        status: 'verified',
        idempotencyKey: `${safeKey}_refund`,
        recordedBy: actor.id,
        recordedByName: actor.name,
        verifiedBy: actor.id,
        verifiedByName: actor.name,
        verifiedAt: now,
        createdAt: now,
      };
      txn.set(doc(db, 'preOrders', preOrderId, 'payments', refundPaymentId), sanitizeData(refundPaymentDoc));
      updatedLedger.push(refundPaymentDoc);

      const refundPosting = buildCustomerRefundPosting({
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        paymentId: refundPaymentId,
        refundAmount,
        method: input.refundMethod,
        note: `Cancellation refund (${input.refundMethod}): ${input.reason.trim()}`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', refundPosting.id), sanitizeData(refundPosting));
    }

    if (retainedChargeAmount > 0) {
      const chargePosting = buildCancellationChargePosting({
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        retainedAmount: retainedChargeAmount,
        note:
          input.retainedChargeReason?.trim() ||
          `Retained cancellation fee on ${po.preOrderNumber}: ${input.reason.trim()}`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', chargePosting.id), sanitizeData(chargePosting));
    }

    const poProductLabel = formatPreOrderProductLabel(po);
    let supplierReceivableId = '';
    let supplierLossId = '';
    if (settledSupplierAmt > 0 && input.supplierResolution === 'receivable') {
      const recRef = doc(collection(db, 'otherReceivables'));
      supplierReceivableId = recRef.id;
      const recDoc: Omit<OtherReceivable, 'id'> = {
        borrowerName: po.supplierName || `Supplier (${po.preOrderNumber})`,
        type: 'Supplier Advance',
        amount: settledSupplierAmt,
        paidDate: getTodayIsoDate(),
        status: 'Pending',
        recoveredAmount: 0,
        notes: `Cancelled Pre-Order ${po.preOrderNumber} (${poProductLabel}): ${input.reason.trim()}`,
        createdAt: now,
      };
      txn.set(recRef, sanitizeData(recDoc));

      const supRecPosting = buildSupplierReceivablePosting({
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        receivableId: supplierReceivableId,
        amount: settledSupplierAmt,
        note: `Supplier refund receivable (${po.supplierName || 'China Supplier'})`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', supRecPosting.id), sanitizeData(supRecPosting));
    } else if (settledSupplierAmt > 0 && input.supplierResolution === 'loss') {
      const lossRef = doc(collection(db, 'companyLosses'));
      supplierLossId = lossRef.id;
      const lossDoc: Omit<CompanyLoss, 'id'> = {
        title: `Cancelled Pre-Order Loss (${po.preOrderNumber}) - ${poProductLabel}`,
        reason: 'Pre-Order Cancellation Loss',
        amount: settledSupplierAmt,
        date: getTodayIsoDate(),
        subBrand: po.subBrand,
        note: input.reason.trim(),
        recordedBy: actor.name,
        createdAt: now,
      };
      txn.set(lossRef, sanitizeData(lossDoc));

      const supLossPosting = buildSupplierLossPosting({
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        lossId: supplierLossId,
        amount: settledSupplierAmt,
        note: `Unrecoverable supplier/shipping loss on cancelled ${po.preOrderNumber}`,
        actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
      });
      txn.set(doc(db, 'accountingPostings', supLossPosting.id), sanitizeData(supLossPosting));
    }

    let returnedToSupplierQty = Number(po.stockReturnedToSupplierQty || 0);
    if (goodReceivedQty > 0 && cancelProductMap.size > 0) {
      for (const { item, itemGood } of perItemReceived) {
        if (itemGood <= 0) continue;
        const pid = (item.linkedProductId || (poItems.length === 1 ? po.linkedProductId : '') || '').trim();
        const vid = (item.linkedVariantId || (poItems.length === 1 ? po.linkedVariantId : '') || '').trim();
        const state = pid ? cancelProductMap.get(pid) : undefined;
        if (!state) continue;

        let targetIdx = state.variants.findIndex(
          (v) =>
            (v.reservedForPreOrders || []).some(
              (r) => r.preOrderId === preOrderId && (!r.itemId || r.itemId === item.itemId)
            ) || v.id === vid
        );
        if (targetIdx === -1 && state.variants.length > 0 && poItems.length === 1) {
          targetIdx = 0;
        }
        if (targetIdx === -1) continue;

        const targetVar = state.variants[targetIdx];
        const beforeStock = Number(targetVar.stock) || 0;
        const beforeRes = Math.max(0, Number(targetVar.reservedQty) || 0);
        const resEntry = (targetVar.reservedForPreOrders || []).find(
          (r) => r.preOrderId === preOrderId && (!r.itemId || r.itemId === item.itemId)
        );
        const qtyToClear = resEntry?.qty || Math.min(beforeRes, itemGood);
        const nextVarReservations = (targetVar.reservedForPreOrders || []).filter(
          (r) => !(r.preOrderId === preOrderId && (!r.itemId || r.itemId === item.itemId))
        );

        if (resolvedStockRes === 'release_normal') {
          state.variants[targetIdx] = {
            ...targetVar,
            reservedQty: Math.max(0, beforeRes - qtyToClear),
            reservedForPreOrders: nextVarReservations,
          };
        } else {
          const afterStock = Math.max(0, beforeStock - qtyToClear);
          const logRef = doc(collection(db, 'stockLogs'));
          const returnLog: Omit<StockLog, 'id'> = {
            productId: state.prodData.id || pid,
            productName: state.prodData.name || item.productName,
            type: 'out',
            qty: -qtyToClear,
            reason: `Pre-Order Return to Supplier (${po.preOrderNumber})`,
            userId: actor.id,
            userName: actor.name,
            timestamp: now,
            beforeQty: beforeStock,
            afterQty: afterStock,
            refNo: po.preOrderNumber,
            supplierName: po.supplierName || '',
            preOrderId,
            variantId: targetVar.id,
          };
          txn.set(logRef, sanitizeData(returnLog));

          state.variants[targetIdx] = {
            ...targetVar,
            stock: afterStock,
            reservedQty: Math.max(0, beforeRes - qtyToClear),
            reservedForPreOrders: nextVarReservations,
          };
        }
      }

      for (const [pid, state] of cancelProductMap.entries()) {
        const nextTotalStock = state.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
        const nextTotalReserved = state.variants.reduce((s, v) => s + Math.max(0, Number(v.reservedQty) || 0), 0);
        const nextProdRes = state.variants.flatMap((v) => v.reservedForPreOrders || []);
        const nextStockStatus = computeAvailableStockStatus(
          nextTotalStock,
          nextTotalReserved,
          state.prodData.reorderThreshold
        );

        txn.update(
          doc(db, 'products', pid),
          sanitizeData({
            variants: state.variants,
            totalStock: nextTotalStock,
            reservedQty: nextTotalReserved,
            reservedForPreOrders: nextProdRes,
            stockStatus: nextStockStatus,
          })
        );
      }

      if (resolvedStockRes === 'release_normal' && goodValue > 0) {
        const releasePosting = buildStockReleasedPosting({
          preOrderId,
          preOrderNumber: po.preOrderNumber,
          subBrand: po.subBrand,
          releasedValue: goodValue,
          note: `Released ${goodReceivedQty} unit(s) from ${po.preOrderNumber} to general warehouse stock`,
          actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
        });
        txn.set(doc(db, 'accountingPostings', releasePosting.id), sanitizeData(releasePosting));
      } else if (resolvedStockRes === 'return_supplier') {
        returnedToSupplierQty += goodReceivedQty;
        if (goodValue > 0) {
          const retRecRef = doc(collection(db, 'otherReceivables'));
          const retRecDoc: Omit<OtherReceivable, 'id'> = {
            borrowerName: po.supplierName || `Supplier Return (${po.preOrderNumber})`,
            type: 'Supplier Advance',
            amount: goodValue,
            paidDate: getTodayIsoDate(),
            status: 'Pending',
            recoveredAmount: 0,
            notes: `Returned ${goodReceivedQty} unit(s) of ${poProductLabel} from cancelled ${po.preOrderNumber}`,
            createdAt: now,
          };
          txn.set(retRecRef, sanitizeData(retRecDoc));

          const retPosting = buildStockReturnedSupplierPosting({
            preOrderId,
            preOrderNumber: po.preOrderNumber,
            subBrand: po.subBrand,
            receivableId: retRecRef.id,
            returnedValue: goodValue,
            note: `Returned ${goodReceivedQty} unit(s) to supplier for credit/refund`,
            actor: { actorId: actor.id, actorName: actor.name, timestamp: now },
          });
          txn.set(doc(db, 'accountingPostings', retPosting.id), sanitizeData(retPosting));
        }
      }
    }

    const itemSummaries: PreOrderCancellationItemSummary[] = perItemReceived.map(({ item, itemGood }) => ({
      itemId: item.itemId,
      productName: item.productName,
      orderedQty: item.qty,
      receivedQty: itemGood,
      releasedOrReturnedQty: itemGood,
    }));

    const cancellationSummary: PreOrderCancellationSummary = {
      reason: input.reason.trim(),
      customerResolution: resolvedCustRes,
      customerRefundAmount: refundAmount,
      ...(input.refundMethod ? { customerRefundMethod: input.refundMethod } : {}),
      ...(refundPaymentId ? { customerRefundPaymentId: refundPaymentId } : {}),
      retainedChargeAmount,
      ...(input.retainedChargeReason?.trim() ? { retainedChargeReason: input.retainedChargeReason.trim() } : {}),
      supplierResolution: input.supplierResolution,
      supplierSettledAmount: settledSupplierAmt,
      ...(supplierReceivableId ? { supplierReceivableId } : {}),
      ...(supplierLossId ? { supplierLossId } : {}),
      stockResolution: resolvedStockRes,
      releasedOrReturnedQty: goodReceivedQty,
      itemSummaries,
      cancelledBy: actor.id,
      cancelledByName: actor.name,
      cancelledAt: now,
    };

    const nextStatus: PreOrderStatus =
      refundAmount > 0 || toPaisa(calc.verifiedRefunded) > 0 ? 'Refunded' : 'Cancelled';
    const { patch: derivedFin } = buildDerivedOrderFinancialPatch(po, updatedLedger, actor.id, now);
    const paymentState =
      nextStatus === 'Refunded'
        ? 'refunded'
        : derivePreOrderPaymentState(
            po.totalAmount,
            derivedFin.advancePaid,
            derivedFin.refundedAmount,
            nextStatus
          );

    const updatedCancelledItems = sanitizePreOrderItemsForDoc(
      poItems.map((it) => ({
        ...it,
        ...(resolvedStockRes === 'return_supplier' ? { receivedQty: 0 } : {}),
        status: 'cancelled',
      }))
    );

    const poPatch: Partial<PreOrder> = {
      ...derivedFin,
      items: updatedCancelledItems,
      paymentState,
      status: nextStatus,
      isCancelled: true,
      cancellationReason: input.reason.trim(),
      cancelledAt: now,
      cancelledBy: actor.id,
      cancellation: cancellationSummary,
      ...(resolvedStockRes === 'return_supplier'
        ? { stockReturnedToSupplierQty: returnedToSupplierQty, stockReceivedQty: 0, stockReceived: false }
        : {}),
      updatedAt: now,
      updatedBy: actor.id,
    };
    txn.update(preOrderRef, sanitizeData(poPatch));

    const historyDoc: PreOrderStatusHistory = {
      id: historyRef.id,
      preOrderId,
      fromStatus: po.status,
      toStatus: nextStatus,
      note: `Cancel & Reconcile: ${input.reason.trim()}`,
      publicMessage:
        nextStatus === 'Refunded'
          ? 'Your pre-order has been cancelled and refunded.'
          : 'Your pre-order has been cancelled.',
      notifyCustomer: true,
      changedBy: actor.id,
      changedByName: actor.name,
      timestamp: now,
    };
    txn.set(historyRef, sanitizeData(historyDoc));

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        action: 'CANCEL_RECONCILED' as PreOrderAuditAction,
        summary: `Cancelled & reconciled ${po.preOrderNumber} (${nextStatus}): Customer refund ৳${refundAmount.toLocaleString()}, Retained charge ৳${retainedChargeAmount.toLocaleString()}, Supplier ${input.supplierResolution} ৳${settledSupplierAmt.toLocaleString()}`,
        metadata: cancellationSummary,
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );

    const updatedCancelledOrder = { ...po, ...poPatch };
    writeStatsDeltaInTxn(txn, statsSnap, {
      beforeOrder: po,
      afterOrder: updatedCancelledOrder,
      customerAdvanceLiabilityDelta: -(refundAmount + retainedChargeAmount),
      now,
    });

    const cancelNotifRef = doc(db, 'preOrderNotifications', generateId('NTF'));
    txn.set(
      cancelNotifRef,
      sanitizeData({
        id: cancelNotifRef.id,
        preOrderId,
        preOrderNumber: po.preOrderNumber,
        subBrand: po.subBrand,
        type: nextStatus === 'Refunded' ? 'refund_recorded' : 'cancelled',
        category: 'event',
        severity: 'warning',
        title: `${nextStatus} · ${po.preOrderNumber}`,
        message: `${po.preOrderNumber} (${po.customerName}) cancelled & reconciled. Refund: ৳${refundAmount.toLocaleString()}, Retained: ৳${retainedChargeAmount.toLocaleString()}.`,
        targetTab: 'preorder_list',
        forRoles: ['superadmin', 'admin', 'manager'],
        readBy: [],
        customerPhone: po.customerPhone,
        customerName: po.customerName,
        dueAmount: 0,
        preOrderStatus: nextStatus,
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );

    result = {
      order: updatedCancelledOrder,
      cancellation: cancellationSummary,
    };
  });

  dbCache.products = null;
  dbCache.productsArchived = null;

  const syncRes = await syncPublicTracking(preOrderId);
  if (!syncRes.ok) {
    result.trackingSyncWarning = syncRes.error;
  }

  return result;
}

/**
 * Read-only Admin integrity audit scanning Pre-Orders, Payment Ledgers, Receipts,
 * Products Reservations, Sales Orders, Invoices, and AccountingPostings.
 */
export async function runPreOrderIntegrityCheck(): Promise<PreOrderIntegrityReport> {
  const [preOrdersSnap, postings, ordersSnap, invoicesSnap, products, supPays] = await Promise.all([
    getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(200))),
    getPreOrderAccountingPostings(undefined, 500),
    getDocs(query(collection(db, 'orders'), where('source', '==', 'pre_order'), limit(200))).catch(() => null),
    getDocs(query(collection(db, 'invoices'), where('source', '==', 'pre_order'), limit(200))).catch(() => null),
    getProducts(true),
    getPreOrderSupplierPayments(undefined, 300),
  ]);

  const preOrders: PreOrder[] = preOrdersSnap.docs.map((d) =>
    withNormalizedPreOrderItems({
      ...(d.data() as PreOrder),
      id: d.id,
    })
  );

  const paymentsByPreOrder: Record<string, PreOrderPayment[]> = {};
  const privateCostsByPreOrder: Record<string, PreOrderPrivateCost | null> = {};
  const receiptsByPreOrder: Record<string, PreOrderReceipt[]> = {};

  await Promise.all(
    preOrders.map(async (po) => {
      const [pays, priv, rcpts] = await Promise.all([
        getPreOrderPayments(po.id, 100).catch(() => [] as PreOrderPayment[]),
        getPreOrderPrivateCost(po.id).catch(() => null),
        getPreOrderReceipts(po.id, 50).catch(() => [] as PreOrderReceipt[]),
      ]);
      paymentsByPreOrder[po.id] = pays;
      privateCostsByPreOrder[po.id] = priv;
      receiptsByPreOrder[po.id] = rcpts;
    })
  );

  const orders: Order[] = ordersSnap
    ? ordersSnap.docs.map((d) => ({ ...(d.data() as Order), id: d.id }))
    : [];
  const invoices: Invoice[] = invoicesSnap
    ? invoicesSnap.docs.map((d) => ({ ...(d.data() as Invoice), id: d.id }))
    : [];

  return analyzePreOrderIntegrity({
    preOrders,
    paymentsByPreOrder,
    privateCostsByPreOrder,
    receiptsByPreOrder,
    supplierPayments: supPays,
    postings,
    orders,
    invoices,
    products,
  });
}

// ==========================================
// PART 7: SETTINGS, OVERVIEW STATS, REMINDERS, CUSTOMER MESSAGES, REPORTS & SEARCH
// ==========================================

let lastReminderSyncSessionKey = '';

export async function getPreOrderSettings(): Promise<PreOrderSettings> {
  if (!auth?.currentUser) return mergeWithDefaultPreOrderSettings(null);
  try {
    const snap = await getDoc(doc(db, 'settings', 'preOrderSettings'));
    if (snap.exists()) {
      return mergeWithDefaultPreOrderSettings(snap.data() as PreOrderSettings);
    }
    return mergeWithDefaultPreOrderSettings(null);
  } catch (err) {
    console.warn('getPreOrderSettings fallback to defaults:', err);
    return mergeWithDefaultPreOrderSettings(null);
  }
}

export async function savePreOrderSettings(
  settings: Partial<PreOrderSettings>,
  actor: PreOrderActor
): Promise<PreOrderSettings> {
  const merged = mergeWithDefaultPreOrderSettings({
    ...settings,
    updatedAt: Date.now(),
    updatedBy: actor.id,
  });
  await setDoc(doc(db, 'settings', 'preOrderSettings'), sanitizeData(merged), { merge: true });
  return merged;
}

export async function getPreOrderStatsSummary(): Promise<PreOrderStats | null> {
  if (!auth?.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, 'preOrderStats', 'summary'));
    if (!snap.exists()) return null;
    const base = createEmptyPreOrderStats();
    const raw = snap.data() as Partial<PreOrderStats>;
    return {
      ...base,
      ...raw,
      statusCounts: { ...base.statusCounts, ...(raw.statusCounts || {}) },
      subBrandStats: {
        SAT: { ...base.subBrandStats.SAT, ...(raw.subBrandStats?.SAT || {}) },
        GZ: { ...base.subBrandStats.GZ, ...(raw.subBrandStats?.GZ || {}) },
        RTX: { ...base.subBrandStats.RTX, ...(raw.subBrandStats?.RTX || {}) },
      },
    };
  } catch (err) {
    console.warn('getPreOrderStatsSummary fallback:', err);
    return null;
  }
}

export interface RebuildPreOrderStatsResult {
  before: PreOrderStats | null;
  stats: PreOrderStats;
  diffs: PreOrderStatsRebuildDiff[];
}

export async function rebuildPreOrderStats(
  actor: PreOrderActor
): Promise<RebuildPreOrderStatsResult> {
  if (!isPreOrderAdminRole(actor.role)) {
    throw new Error('Only Admin or Super Admin can rebuild pre-order summary statistics.');
  }

  const [beforeStats, ordersSnap, pendingSnap, supPays, postings] = await Promise.all([
    getPreOrderStatsSummary(),
    getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(1000))),
    getDocs(query(collectionGroup(db, 'payments'), where('status', '==', 'pending'), limit(500))).catch(() => null),
    getPreOrderSupplierPayments(undefined, 500).catch(() => [] as PreOrderSupplierPayment[]),
    getPreOrderAccountingPostings(undefined, 1000).catch(() => [] as AccountingPosting[]),
  ]);

  const preOrders: PreOrder[] = ordersSnap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
  const pendingPayments: PreOrderPayment[] = pendingSnap
    ? pendingSnap.docs.map((d) => ({ ...(d.data() as PreOrderPayment), id: d.id }))
    : [];

  // Load private costs for active orders in small bounded batches so supplierPayableEstimate is accurate
  const activeOrders = preOrders.filter((o) => isActivePreOrderStatus(o.status)).slice(0, 180);
  const privateCostsByOrder = await getPreOrderPrivateCostsMap(activeOrders.map((o) => o.id));

  const nextStats = computePreOrderStatsFromData({
    preOrders,
    pendingPayments,
    supplierPayments: supPays,
    privateCostsByOrder,
    postings,
    rebuiltBy: actor.name,
  });

  const diffs = diffPreOrderStats(beforeStats, nextStats);
  await setDoc(doc(db, 'preOrderStats', 'summary'), sanitizeData(nextStats));

  const rebuildAuditId = generateId('AUD');
  await setDoc(
    doc(db, 'preOrderAudit', rebuildAuditId),
    sanitizeData({
      id: rebuildAuditId,
      preOrderId: 'STATS',
      preOrderNumber: 'SUMMARY',
      action: 'STATS_REBUILT' as PreOrderAuditAction,
      summary: `Rebuilt preOrderStats/summary from ${preOrders.length} orders (${diffs.length} changed metric${diffs.length === 1 ? '' : 's'})`,
      metadata: {
        scannedOrders: preOrders.length,
        diffs,
      },
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: Date.now(),
    })
  ).catch(() => {});

  return { before: beforeStats, stats: nextStats, diffs };
}

export async function queryPreOrderNotifications(options?: {
  limitCount?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
}): Promise<{
  items: PreOrderNotification[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const pageSize = Math.min(Math.max(Number(options?.limitCount) || 30, 1), 100);
  const constraints: any[] = [orderBy('createdAt', 'desc')];
  if (options?.cursor) {
    constraints.push(startAfter(options.cursor));
  }
  constraints.push(limit(pageSize + 1));

  const snap = await getDocs(query(collection(db, 'preOrderNotifications'), ...constraints));
  const hasMore = snap.docs.length > pageSize;
  const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  const items = sliced.map((d) => ({ ...(d.data() as PreOrderNotification), id: d.id }));
  const lastDoc = sliced.length > 0 ? sliced[sliced.length - 1] : null;
  return { items, lastDoc, hasMore };
}

export async function markAllPreOrderNotificationsRead(
  notificationIds: string[],
  userId: string
): Promise<void> {
  if (!notificationIds.length || !userId) return;
  const unique = Array.from(new Set(notificationIds));
  for (let i = 0; i < unique.length; i += 400) {
    const chunk = unique.slice(i, i + 400);
    const batch = writeBatch(db);
    chunk.forEach((id) => {
      batch.update(doc(db, 'preOrderNotifications', id), {
        readBy: arrayUnion(userId),
      });
    });
    await batch.commit();
  }
}

export async function snoozePreOrderNotification(
  notificationId: string,
  userId: string,
  durationDays: 1 | 3
): Promise<number> {
  const snoozedUntil = Date.now() + durationDays * 86400000;
  await updateDoc(doc(db, 'preOrderNotifications', notificationId), {
    [`snoozedUntilBy.${userId}`]: snoozedUntil,
  });
  return snoozedUntil;
}

export async function syncDailyTimeBasedReminders(options: {
  settings?: PreOrderSettings;
  actor: PreOrderActor;
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
  force?: boolean;
}): Promise<{ created: number; evaluated: number; skippedSessionGuard?: boolean }> {
  if (!auth?.currentUser) return { created: 0, evaluated: 0 };
  const todayIso = getTodayIsoDate();
  const sessionKey = `${auth.currentUser.uid}_${todayIso}`;
  if (!options.force && lastReminderSyncSessionKey === sessionKey) {
    return { created: 0, evaluated: 0, skippedSessionGuard: true };
  }

  const settings = options.settings || (await getPreOrderSettings());
  const activeSnap = await getDocs(
    query(collection(db, 'preOrders'), orderBy('updatedAt', 'desc'), limit(250))
  );
  let orders = activeSnap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
  if (options.allowedSubBrands && options.allowedSubBrands.length > 0 && options.allowedSubBrands.length < 3) {
    orders = orders.filter((o) => options.allowedSubBrands!.includes(o.subBrand));
  }

  const candidates = evaluateTimeBasedReminderCandidates(orders, settings, todayIso, Date.now());
  if (candidates.length === 0) {
    lastReminderSyncSessionKey = sessionKey;
    return { created: 0, evaluated: orders.length };
  }

  // Check already-existing reminders for today in one query so we never overwrite user readBy/snoozedUntilBy
  const dayKey = todayIso.replace(/-/g, '');
  const existingTodaySnap = await getDocs(
    query(collection(db, 'preOrderNotifications'), where('dayKey', '==', dayKey), limit(500))
  ).catch(() => null);
  const existingIds = new Set<string>();
  existingTodaySnap?.forEach((d) => existingIds.add(d.id));

  const missing = candidates.filter((c) => !existingIds.has(c.id));
  let created = 0;

  if (missing.length > 0) {
    for (let i = 0; i < missing.length; i += 250) {
      const chunk = missing.slice(i, i + 250);
      const batch = writeBatch(db);
      for (const rem of chunk) {
        batch.set(doc(db, 'preOrderNotifications', rem.id), sanitizeData(rem));
        created += 1;
      }
      await batch.commit().catch(() => {});
    }
  }

  lastReminderSyncSessionKey = sessionKey;
  return { created, evaluated: orders.length };
}

export async function logCustomerMessagePrepared(
  preOrderId: string,
  input: {
    channel: 'whatsapp' | 'sms' | 'copy';
    templateKey?: string;
    language?: 'en' | 'bn';
    messageText: string;
  },
  actor: PreOrderActor
): Promise<void> {
  const now = Date.now();
  const nowDate = new Date(now);
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const eventId = generateId('SHPEVT');
  const eventRef = doc(db, 'preOrders', preOrderId, 'shipmentEvents', eventId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  const channelLabel =
    input.channel === 'whatsapp' ? 'WhatsApp' : input.channel === 'sms' ? 'SMS' : 'Copied Text';

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(preOrderRef);
    if (!snap.exists()) throw new Error('Pre-order not found.');
    const order = snap.data() as PreOrder;

    const eventDoc: PreOrderShipmentEvent = {
      id: eventId,
      preOrderId,
      date: nowDate.toISOString().split('T')[0],
      time: nowDate.toTimeString().slice(0, 5),
      timestamp: now,
      staffId: actor.id,
      staffName: actor.name,
      text: `Message prepared/sent by ${actor.name} via ${channelLabel}`,
      showToCustomer: false,
      source: 'manual',
      eventType: 'customer_message_prepared',
    };
    txn.set(eventRef, sanitizeData(eventDoc));

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'CUSTOMER_MESSAGE_PREPARED' as PreOrderAuditAction,
        summary: `Customer update prepared (${channelLabel}${input.language ? ` · ${input.language.toUpperCase()}` : ''}) on ${order.preOrderNumber}`,
        metadata: {
          channel: input.channel,
          templateKey: input.templateKey || 'custom',
          language: input.language || 'en',
          messagePreview: input.messageText.slice(0, 240),
        },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export interface PreOrderDashboardData {
  stats: PreOrderStats;
  hasSummaryDoc: boolean;
  orders: PreOrder[];
  payments: PreOrderPayment[];
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>;
  supplierPayments: PreOrderSupplierPayment[];
  postings: AccountingPosting[];
  activity: PreOrderAuditEntry[];
  activityLastDoc: QueryDocumentSnapshot<DocumentData> | null;
  activityHasMore: boolean;
  settings: PreOrderSettings;
}

export async function loadPreOrderDashboardData(options: {
  canViewProfit: boolean;
  canViewSupplier: boolean;
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
}): Promise<PreOrderDashboardData> {
  if (!auth?.currentUser) {
    return {
      stats: createEmptyPreOrderStats(),
      hasSummaryDoc: false,
      orders: [],
      payments: [],
      privateCostsByOrder: {},
      supplierPayments: [],
      postings: [],
      activity: [],
      activityLastDoc: null,
      activityHasMore: false,
      settings: mergeWithDefaultPreOrderSettings(null),
    };
  }
  const [summaryDoc, ordersSnap, paymentsSnap, postings, auditSnap, supPays, settings] =
    await Promise.all([
      getPreOrderStatsSummary(),
      getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(300))),
      getDocs(query(collectionGroup(db, 'payments'), orderBy('createdAt', 'desc'), limit(350))).catch(
        () => null
      ),
      options.canViewProfit
        ? getPreOrderAccountingPostings(undefined, 400).catch(() => [] as AccountingPosting[])
        : Promise.resolve([] as AccountingPosting[]),
      getDocs(query(collection(db, 'preOrderAudit'), orderBy('timestamp', 'desc'), limit(21))).catch(
        () => null
      ),
      options.canViewSupplier
        ? getPreOrderSupplierPayments(undefined, 300).catch(() => [] as PreOrderSupplierPayment[])
        : Promise.resolve([] as PreOrderSupplierPayment[]),
      getPreOrderSettings(),
    ]);

  let orders: PreOrder[] = ordersSnap.docs.map((d) =>
    withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id })
  );
  if (
    options.allowedSubBrands &&
    options.allowedSubBrands.length > 0 &&
    options.allowedSubBrands.length < 3
  ) {
    orders = orders.filter((o) => options.allowedSubBrands!.includes(o.subBrand));
  }

  let payments: PreOrderPayment[] = paymentsSnap
    ? paymentsSnap.docs.map((d) => ({ ...(d.data() as PreOrderPayment), id: d.id }))
    : [];
  if (
    options.allowedSubBrands &&
    options.allowedSubBrands.length > 0 &&
    options.allowedSubBrands.length < 3
  ) {
    payments = payments.filter((p) => !p.subBrand || options.allowedSubBrands!.includes(p.subBrand));
  }

  const privateCostsByOrder =
    options.canViewProfit || options.canViewSupplier
      ? await getPreOrderPrivateCostsMap(orders.slice(0, 120).map((o) => o.id))
      : {};

  const activityDocs = auditSnap ? auditSnap.docs : [];
  const activityHasMore = activityDocs.length > 20;
  const slicedAuditDocs = activityHasMore ? activityDocs.slice(0, 20) : activityDocs;
  const activity = slicedAuditDocs.map((d) => ({
    ...(d.data() as PreOrderAuditEntry),
    id: d.id,
  }));
  const activityLastDoc =
    slicedAuditDocs.length > 0 ? slicedAuditDocs[slicedAuditDocs.length - 1] : null;

  const stats =
    summaryDoc ||
    computePreOrderStatsFromData({
      preOrders: orders,
      pendingPayments: payments.filter((p) => p.status === 'pending'),
      supplierPayments: supPays,
      privateCostsByOrder,
      postings,
    });

  return {
    stats,
    hasSummaryDoc: Boolean(summaryDoc),
    orders,
    payments,
    privateCostsByOrder,
    supplierPayments: supPays,
    postings,
    activity,
    activityLastDoc,
    activityHasMore,
    settings,
  };
}

export async function loadMorePreOrderAuditFeed(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
  pageSize: number = 20
): Promise<{
  items: PreOrderAuditEntry[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}> {
  if (!auth?.currentUser) {
    return { items: [], lastDoc: null, hasMore: false };
  }
  const constraints: any[] = [orderBy('timestamp', 'desc')];
  if (cursor) constraints.push(startAfter(cursor));
  constraints.push(limit(pageSize + 1));

  try {
    const snap = await getDocs(query(collection(db, 'preOrderAudit'), ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const sliced = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    return {
      items: sliced.map((d) => ({ ...(d.data() as PreOrderAuditEntry), id: d.id })),
      lastDoc: sliced.length > 0 ? sliced[sliced.length - 1] : null,
      hasMore,
    };
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      return { items: [], lastDoc: null, hasMore: false };
    }
    throw err;
  }
}

export interface PreOrderReportsDataset {
  preOrders: PreOrder[];
  payments: PreOrderPayment[];
  privateCostsByOrder: Record<string, PreOrderPrivateCost | null>;
  suppliers: Supplier[];
  supplierPayments: PreOrderSupplierPayment[];
  postings: AccountingPosting[];
  auditLogs: PreOrderAuditEntry[];
}

export async function loadPreOrderReportsDataset(options: {
  canViewProfit: boolean;
  canViewSupplier: boolean;
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>;
}): Promise<PreOrderReportsDataset> {
  if (!auth?.currentUser) {
    return {
      preOrders: [],
      payments: [],
      privateCostsByOrder: {},
      suppliers: [],
      supplierPayments: [],
      postings: [],
      auditLogs: [],
    };
  }
  const [ordersSnap, paymentsSnap, suppliersSnap, supPays, postings, auditLogs] = await Promise.all([
    getDocs(query(collection(db, 'preOrders'), orderBy('createdAt', 'desc'), limit(1000))),
    getDocs(query(collectionGroup(db, 'payments'), orderBy('createdAt', 'desc'), limit(1200))).catch(
      () => null
    ),
    options.canViewSupplier
      ? getDocs(collection(db, 'suppliers')).catch(() => null)
      : Promise.resolve(null),
    options.canViewSupplier
      ? getPreOrderSupplierPayments(undefined, 600).catch(() => [] as PreOrderSupplierPayment[])
      : Promise.resolve([] as PreOrderSupplierPayment[]),
    options.canViewProfit
      ? getPreOrderAccountingPostings(undefined, 800).catch(() => [] as AccountingPosting[])
      : Promise.resolve([] as AccountingPosting[]),
    getPreOrderAuditLogs(undefined, 400).catch(() => [] as PreOrderAuditEntry[]),
  ]);

  let preOrders = ordersSnap.docs.map((d) =>
    withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id })
  );
  if (
    options.allowedSubBrands &&
    options.allowedSubBrands.length > 0 &&
    options.allowedSubBrands.length < 3
  ) {
    preOrders = preOrders.filter((o) => options.allowedSubBrands!.includes(o.subBrand));
  }

  let payments = paymentsSnap
    ? paymentsSnap.docs.map((d) => ({ ...(d.data() as PreOrderPayment), id: d.id }))
    : [];
  if (
    options.allowedSubBrands &&
    options.allowedSubBrands.length > 0 &&
    options.allowedSubBrands.length < 3
  ) {
    payments = payments.filter((p) => !p.subBrand || options.allowedSubBrands!.includes(p.subBrand));
  }

  const suppliers: Supplier[] = suppliersSnap
    ? suppliersSnap.docs.map((d) => ({ ...(d.data() as Omit<Supplier, 'id'>), id: d.id }))
    : [];

  const privateCostsByOrder =
    options.canViewProfit || options.canViewSupplier
      ? await getPreOrderPrivateCostsMap(preOrders.slice(0, 160).map((o) => o.id))
      : {};

  return {
    preOrders,
    payments,
    privateCostsByOrder,
    suppliers,
    supplierPayments: supPays,
    postings,
    auditLogs,
  };
}

export async function getPreOrdersByCustomer(
  customerId: string,
  rawPhone?: string
): Promise<PreOrder[]> {
  if (!auth?.currentUser) return [];
  const results = new Map<string, PreOrder>();
  const normPhone = rawPhone ? normalizeBdPhone(rawPhone) : '';

  const tasks: Promise<void>[] = [];
  if (customerId) {
    tasks.push(
      getDocs(query(collection(db, 'preOrders'), where('customerId', '==', customerId), limit(50)))
        .then((snap) => {
          snap.forEach((d) =>
            results.set(d.id, withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }))
          );
        })
        .catch(() => {})
    );
  }
  if (isValidBdPhone(normPhone)) {
    tasks.push(
      getDocs(query(collection(db, 'preOrders'), where('customerPhone', '==', normPhone), limit(50)))
        .then((snap) => {
          snap.forEach((d) =>
            results.set(d.id, withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id }))
          );
        })
        .catch(() => {})
    );
  }

  await Promise.all(tasks);
  return Array.from(results.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function searchPreOrdersForCommandPalette(
  allowedSubBrands?: Array<'SAT' | 'GZ' | 'RTX'>,
  limitCount: number = 80
): Promise<PreOrder[]> {
  if (!auth?.currentUser) return [];
  try {
    const snap = await getDocs(
      query(collection(db, 'preOrders'), orderBy('updatedAt', 'desc'), limit(limitCount))
    );
    const items = snap.docs.map((d) =>
      withNormalizedPreOrderItems({ ...(d.data() as PreOrder), id: d.id })
    );
    if (allowedSubBrands && allowedSubBrands.length > 0 && allowedSubBrands.length < 3) {
      return items.filter((o) => allowedSubBrands.includes(o.subBrand));
    }
    return items;
  } catch {
    return [];
  }
}

