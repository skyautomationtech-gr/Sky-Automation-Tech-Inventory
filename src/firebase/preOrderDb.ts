import {
  collection,
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
  arrayUnion,
  DocumentData,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase/firestore';
import { db } from './config';
import { dbCache, getNextCustomerId, localStore, sanitizeData } from './db';
import {
  Customer,
  PreOrder,
  PreOrderAuditAction,
  PreOrderAuditEntry,
  PreOrderNotification,
  PreOrderPayment,
  PreOrderPaymentMethod,
  PreOrderPaymentState,
  PreOrderPaymentType,
  PreOrderPrivateCost,
  PreOrderShipment,
  PreOrderStatus,
  PreOrderStatusHistory,
  PreOrderSupplierPayment,
  PublicTrackingRecord,
  RolePermissionsMap,
  UserProfile,
} from '../types';
import {
  calculatePreOrderFinancials,
  canTransitionPreOrderStatus,
  derivePreOrderPaymentState,
  fromPaisa,
  getInitialPreOrderStatus,
  roundMoney,
  toPaisa,
} from '../preOrders/calculations';
import {
  PRE_ORDER_EDIT_LOCKED_STATUSES,
  getTodayIsoDate,
  isValidBdPhone,
  mergeWithDefaultRolePermissions,
  normalizeBdPhone,
} from '../preOrders/constants';

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
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
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
  if (!input.productName?.trim()) {
    throw new Error('Product name is required.');
  }

  const safeQty = Math.round(Number(input.qty) || 0);
  if (safeQty < 1) {
    throw new Error('Quantity must be at least 1.');
  }

  const unitPrice = Number(input.sellingUnitPrice);
  const deliveryCharge = Number(input.deliveryCharge || 0);
  const discount = Number(input.discount || 0);
  const chinaUnitCost = Number(input.chinaUnitCost || 0);
  const shippingCost = Number(input.shippingCost || 0);
  const initialAdvanceAmount = roundMoney(input.initialAdvance?.amount || 0);

  if (
    unitPrice < 0 ||
    deliveryCharge < 0 ||
    discount < 0 ||
    chinaUnitCost < 0 ||
    shippingCost < 0 ||
    initialAdvanceAmount < 0
  ) {
    throw new Error('Prices, charges, discounts, and advance amounts cannot be negative.');
  }

  const orderDate = input.orderDate || getTodayIsoDate();
  if (input.estimatedDeliveryDate && input.estimatedDeliveryDate < orderDate) {
    throw new Error('Expected arrival date cannot be earlier than the order date.');
  }

  const shouldAutoVerify = Boolean(input.initialAdvance?.autoVerify);
  const initialPaymentStatus = shouldAutoVerify ? 'verified' : 'pending';

  const calc = calculatePreOrderFinancials({
    qty: safeQty,
    sellingUnitPrice: unitPrice,
    deliveryCharge,
    discount,
    chinaUnitCost,
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
  const trackingRef = doc(db, 'publicTracking', trackingToken);

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

  await runTransaction(db, async (txn) => {
    // 1. ALL TRANSACTION READS FIRST
    const [existingPoSnap, phoneIdxSnap, poCounterSnap, custCounterSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(phoneIndexRef),
      txn.get(preOrderCounterRef),
      txn.get(customerCounterRef),
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

    // 4. WRITE PRE-ORDER + ISOLATED PRIVATE COST + LEDGER + HISTORY + AUDIT + PUBLIC TRACKING
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
      productName: input.productName.trim(),
      category: input.category?.trim() || '',
      sku: input.sku?.trim() || '',
      model: input.model?.trim() || '',
      variant: input.variant?.trim() || '',
      color: input.color?.trim() || '',
      productUrl: input.productUrl?.trim() || '',
      productSpecs: input.productSpecs?.trim() || '',
      productImage: input.productImage || '',
      linkedProductId: input.linkedProductId || '',
      linkedVariantId: input.linkedVariantId || '',
      qty: calc.qty,
      sellingUnitPrice: roundMoney(unitPrice),
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

    const privateCostDoc: PreOrderPrivateCost = {
      preOrderId,
      chinaUnitCost: roundMoney(chinaUnitCost),
      shippingCost: roundMoney(shippingCost),
      supplierUnitCost: roundMoney(input.supplierUnitCost ?? chinaUnitCost),
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

    const publicTrackingDoc: PublicTrackingRecord = {
      token: resolvedTrackingToken,
      preOrderId,
      preOrderNumber: createdNumber,
      subBrand: preOrderDoc.subBrand,
      customerName: preOrderDoc.customerName,
      maskedPhone: maskPhoneNumber(preOrderDoc.customerPhone),
      productName: preOrderDoc.productName,
      qty: preOrderDoc.qty,
      totalAmount: preOrderDoc.totalAmount,
      advancePaid: preOrderDoc.advancePaid,
      refundedAmount: preOrderDoc.refundedAmount,
      dueAmount: preOrderDoc.dueAmount,
      status: preOrderDoc.status,
      estimatedDeliveryDate: preOrderDoc.estimatedDeliveryDate || '',
      statusTimeline: [{ status: startStatus, timestamp: now }],
      updatedAt: now,
    };

    const auditDoc: PreOrderAuditEntry = {
      id: auditId,
      preOrderId,
      preOrderNumber: createdNumber,
      action: 'PREORDER_CREATED',
      summary: `Created pre-order ${createdNumber} (${startStatus}) for ${preOrderDoc.customerName} (${preOrderDoc.productName} x${preOrderDoc.qty})`,
      metadata: {
        totalAmount: preOrderDoc.totalAmount,
        initialAdvance: initialAdvanceAmount,
        initialPaymentStatus: initialAdvanceAmount > 0 ? initialPaymentStatus : 'none',
        customerCode: resolvedCustomerCode,
        startStatus,
      },
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      timestamp: now,
    };

    txn.set(preOrderRef, sanitizeData(preOrderDoc));
    txn.set(costRef, sanitizeData(privateCostDoc));
    txn.set(historyRef, sanitizeData(statusHistoryDoc));
    txn.set(trackingRef, sanitizeData(publicTrackingDoc));
    txn.set(auditRef, sanitizeData(auditDoc));

    if (initialAdvanceAmount > 0 && input.initialAdvance) {
      const paymentId = `PAY_${safeIdempotency}_init`;
      const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
      const paymentDoc: PreOrderPayment = {
        id: paymentId,
        preOrderId,
        preOrderNumber: createdNumber,
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
    }
  });

  if (createdNewCustomerRecord) {
    dbCache.customers = null;
    const prevCached = localStore.get<Customer[]>('customers') || [];
    localStore.set('customers', [createdNewCustomerRecord, ...prevCached]);
  }

  return {
    id: preOrderId,
    preOrderNumber: createdNumber,
    trackingToken: resolvedTrackingToken,
    customerId: resolvedCustomerDocId,
    customerCode: resolvedCustomerCode,
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
    const today = getTodayIsoDate();
    const terminalOrReceived = [
      'Received in Stock',
      'Ready for Delivery',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
      'Refunded',
    ].includes(order.status);
    if (
      terminalOrReceived ||
      order.stockReceived ||
      !order.estimatedDeliveryDate ||
      order.estimatedDeliveryDate >= today
    ) {
      return false;
    }
  }
  if (opts.searchTerm?.trim()) {
    const q = opts.searchTerm.trim().toLowerCase();
    const normPhoneQ = normalizeBdPhone(opts.searchTerm);
    const haystack = [
      order.preOrderNumber,
      order.customerName,
      order.customerPhone,
      order.customerCode,
      order.productName,
      order.sku,
      order.supplierOrderRef,
      order.supplierName,
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
        const docs = snap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
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
        const docs = snap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
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
    const rawItems = slicedDocs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
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
    const rawItems = slicedDocs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
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
  const items = snap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
  const lastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  return {
    items,
    lastDoc,
    hasMore: snap.docs.length === pageSize,
  };
}

export async function getPreOrderById(preOrderId: string): Promise<PreOrder | null> {
  const snap = await getDoc(doc(db, 'preOrders', preOrderId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as PreOrder), id: snap.id };
}

export async function getPreOrderPrivateCost(
  preOrderId: string
): Promise<PreOrderPrivateCost | null> {
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
  options: { canViewProfit: boolean; canViewAudit: boolean }
): Promise<PreOrderFullDetail | null> {
  const order = await getPreOrderById(preOrderId);
  if (!order) return null;

  const [payments, statusHistory, privateCost, auditLogs] = await Promise.all([
    getPreOrderPayments(preOrderId, 100),
    getPreOrderStatusHistory(preOrderId, 100),
    options.canViewProfit ? getPreOrderPrivateCost(preOrderId) : Promise.resolve(null),
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
): Promise<void> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  // Load real payments ledger outside transaction so dueAmount recalculates accurately from ledger
  const ledgerPayments = await getPreOrderPayments(preOrderId, 200);
  const activePayments = ledgerPayments.filter((p) => p.status !== 'rejected');

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(preOrderRef);
    if (!snap.exists()) throw new Error('Pre-order not found.');

    const current = snap.data() as PreOrder;
    if (PRE_ORDER_EDIT_LOCKED_STATUSES.includes(current.status)) {
      throw new Error(`Pre-orders with status "${current.status}" are locked from editing.`);
    }

    const hasAnyPayment =
      activePayments.length > 0 ||
      Number(current.paymentCount || 0) > 0 ||
      Number(current.advancePaid || 0) > 0 ||
      Number(current.pendingAmount || 0) > 0;

    const financialFieldChanged =
      (updates.qty !== undefined && Number(updates.qty) !== Number(current.qty)) ||
      (updates.sellingUnitPrice !== undefined &&
        toPaisa(updates.sellingUnitPrice) !== toPaisa(current.sellingUnitPrice)) ||
      (updates.deliveryCharge !== undefined &&
        toPaisa(updates.deliveryCharge) !== toPaisa(current.deliveryCharge)) ||
      (updates.discount !== undefined &&
        toPaisa(updates.discount) !== toPaisa(current.discount));

    if (hasAnyPayment && !isAdminRole(actor.role)) {
      if (
        (updates.qty !== undefined && Number(updates.qty) !== Number(current.qty)) ||
        (updates.sellingUnitPrice !== undefined &&
          toPaisa(updates.sellingUnitPrice) !== toPaisa(current.sellingUnitPrice))
      ) {
        throw new Error(
          'Quantity, selling price, and order totals can only be edited by an Admin or Super Admin after a payment exists.'
        );
      }
      if (financialFieldChanged) {
        throw new Error(
          'Pricing and order totals cannot be modified after a payment exists unless performed by Admin or Super Admin.'
        );
      }
    }

    // Validate contact, product & date updates
    let nextPhone = current.customerPhone;
    if (updates.customerPhone !== undefined) {
      const normalized = normalizeBdPhone(updates.customerPhone);
      if (!isValidBdPhone(normalized)) {
        throw new Error('Please enter a valid Bangladesh phone number (01XXXXXXXXX).');
      }
      nextPhone = normalized;
    }

    const qty = updates.qty !== undefined ? Math.round(Number(updates.qty)) : current.qty;
    if (qty < 1) throw new Error('Quantity must be at least 1.');

    const sellingUnitPrice =
      updates.sellingUnitPrice !== undefined
        ? Number(updates.sellingUnitPrice)
        : current.sellingUnitPrice;
    const deliveryCharge =
      updates.deliveryCharge !== undefined
        ? Number(updates.deliveryCharge)
        : current.deliveryCharge;
    const discount =
      updates.discount !== undefined ? Number(updates.discount) : current.discount;

    if (sellingUnitPrice < 0 || deliveryCharge < 0 || discount < 0) {
      throw new Error('Prices, delivery charges, and discounts cannot be negative.');
    }

    const nextOrderDate = updates.orderDate ?? current.orderDate ?? getTodayIsoDate();
    const nextEstDate = updates.estimatedDeliveryDate ?? current.estimatedDeliveryDate ?? '';
    if (nextEstDate && nextOrderDate && nextEstDate < nextOrderDate) {
      throw new Error('Expected arrival date cannot be earlier than the order date.');
    }

    const calc = calculatePreOrderFinancials({
      qty,
      sellingUnitPrice,
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

    const trackingRef = current.trackingToken
      ? doc(db, 'publicTracking', current.trackingToken)
      : null;
    const trackingSnap = trackingRef ? await txn.get(trackingRef) : null;

    const paymentState = derivePreOrderPaymentState(
      calc.totalAmount,
      calc.verifiedCollected,
      calc.verifiedRefunded,
      current.status
    );

    const nextDoc: Partial<PreOrder> = {
      ...updates,
      customerPhone: nextPhone,
      qty: calc.qty,
      sellingUnitPrice: roundMoney(sellingUnitPrice),
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

    // Compute exact before/after field diff for audit trail
    const beforeDiff: Record<string, any> = {};
    const afterDiff: Record<string, any> = {};
    const trackableKeys: Array<keyof PreOrder> = [
      'subBrand',
      'customerName',
      'customerPhone',
      'customerWhatsapp',
      'customerAddress',
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

    txn.update(preOrderRef, sanitizeData(nextDoc));

    if (trackingRef && trackingSnap && trackingSnap.exists()) {
      txn.update(
        trackingRef,
        sanitizeData({
          customerName: updates.customerName ?? current.customerName,
          maskedPhone: maskPhoneNumber(nextPhone),
          productName: updates.productName ?? current.productName,
          qty: calc.qty,
          totalAmount: calc.totalAmount,
          advancePaid: calc.verifiedCollected,
          refundedAmount: calc.verifiedRefunded,
          dueAmount: calc.dueAmount,
          estimatedDeliveryDate: nextEstDate,
          updatedAt: now,
        })
      );
    }

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
  });
}

export async function updatePreOrderPrivateCost(
  preOrderId: string,
  updates: Partial<
    Pick<
      PreOrderPrivateCost,
      'chinaUnitCost' | 'shippingCost' | 'supplierUnitCost' | 'internalNotes' | 'supplierOrderRef'
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

    const order = orderSnap.data() as PreOrder;
    if (PRE_ORDER_EDIT_LOCKED_STATUSES.includes(order.status)) {
      throw new Error(`Pre-orders with status "${order.status}" are locked from editing.`);
    }

    const existingCost: Partial<PreOrderPrivateCost> = costSnap.exists() ? costSnap.data() : {};

    const chinaUnitCost = roundMoney(
      updates.chinaUnitCost !== undefined
        ? updates.chinaUnitCost
        : existingCost.chinaUnitCost || 0
    );
    const shippingCost = roundMoney(
      updates.shippingCost !== undefined
        ? updates.shippingCost
        : existingCost.shippingCost || 0
    );

    if (chinaUnitCost < 0 || shippingCost < 0) {
      throw new Error('China purchase price and shipping cost cannot be negative.');
    }

    const calc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
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

// ==========================================
// PAYMENTS LEDGER (APPEND-ONLY + VERIFY)
// ==========================================

export interface AddPreOrderPaymentInput {
  type: PreOrderPaymentType;
  amount: number;
  method: PreOrderPaymentMethod;
  referenceNo?: string;
  note?: string;
  idempotencyKey: string;
}

export async function addPreOrderPayment(
  preOrderId: string,
  input: AddPreOrderPaymentInput,
  actor: PreOrderActor
): Promise<string> {
  const safeAmount = roundMoney(input.amount);
  if (safeAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('idempotencyKey is required for payment recording.');
  }

  const now = Date.now();
  const safeKey = sanitizeIdFragment(input.idempotencyKey.trim());
  const paymentId = `PAY_${safeKey}`;

  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));
  const notifRef = doc(db, 'preOrderNotifications', generateId('NTF'));

  await runTransaction(db, async (txn) => {
    const [orderSnap, existingPaymentSnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    if (existingPaymentSnap.exists()) {
      // Idempotent duplicate submission guard
      return;
    }

    const order = orderSnap.data() as PreOrder;
    const netPaid = fromPaisa(toPaisa(order.advancePaid) - toPaisa(order.refundedAmount));
    if (input.type === 'refund' && safeAmount > netPaid) {
      throw new Error(
        `Refund amount (৳${safeAmount}) exceeds verified net paid balance (৳${netPaid}).`
      );
    }

    const paymentDoc: PreOrderPayment = {
      id: paymentId,
      preOrderId,
      preOrderNumber: order.preOrderNumber,
      type: input.type,
      amount: safeAmount,
      method: input.method,
      referenceNo: input.referenceNo?.trim() || '',
      note: input.note?.trim() || '',
      status: 'pending',
      idempotencyKey: input.idempotencyKey.trim(),
      recordedBy: actor.id,
      recordedByName: actor.name,
      createdAt: now,
    };

    const action: PreOrderAuditAction =
      input.type === 'refund' ? 'REFUND_RECORDED' : 'PAYMENT_RECORDED';

    txn.set(paymentRef, sanitizeData(paymentDoc));
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action,
        summary: `Recorded pending ${input.type} of ৳${safeAmount} (${input.method}) on ${order.preOrderNumber}`,
        metadata: { paymentId, amount: safeAmount, method: input.method, type: input.type },
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
        type: input.type === 'refund' ? 'refund_alert' : 'payment_pending',
        title: `${input.type === 'refund' ? 'Refund' : 'Payment'} Pending Verification`,
        message: `${order.preOrderNumber}: ৳${safeAmount} via ${input.method} awaiting verification.`,
        targetTab: 'preorder_payments',
        readBy: [],
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );
  });

  return paymentId;
}

export async function verifyPreOrderPayment(
  preOrderId: string,
  paymentId: string,
  decision: 'verified' | 'rejected',
  actor: PreOrderActor,
  rejectionReason?: string
): Promise<void> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const paymentRef = doc(db, 'preOrders', preOrderId, 'payments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const [orderSnap, paySnap] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    if (!paySnap.exists()) throw new Error('Payment record not found.');

    const order = orderSnap.data() as PreOrder;
    const payment = paySnap.data() as PreOrderPayment;

    if (payment.status !== 'pending') {
      throw new Error(`Payment has already been ${payment.status}.`);
    }

    const trackingRef = order.trackingToken
      ? doc(db, 'publicTracking', order.trackingToken)
      : null;
    const trackingSnap = trackingRef ? await txn.get(trackingRef) : null;

    txn.update(
      paymentRef,
      sanitizeData({
        status: decision,
        verifiedBy: actor.id,
        verifiedByName: actor.name,
        verifiedAt: now,
        rejectionReason: decision === 'rejected' ? rejectionReason?.trim() || 'Rejected' : '',
      })
    );

    if (decision === 'verified') {
      let nextAdvancePaid = roundMoney(order.advancePaid || 0);
      let nextRefundedAmount = roundMoney(order.refundedAmount || 0);

      if (payment.type === 'refund') {
        const netPaid = fromPaisa(toPaisa(nextAdvancePaid) - toPaisa(nextRefundedAmount));
        if (toPaisa(payment.amount) > toPaisa(netPaid)) {
          throw new Error('Cannot verify refund exceeding net verified payments.');
        }
        nextRefundedAmount = fromPaisa(toPaisa(nextRefundedAmount) + toPaisa(payment.amount));
      } else {
        nextAdvancePaid = fromPaisa(toPaisa(nextAdvancePaid) + toPaisa(payment.amount));
      }

      const nextDueAmount = fromPaisa(
        toPaisa(order.totalAmount) - toPaisa(nextAdvancePaid) + toPaisa(nextRefundedAmount)
      );

      txn.update(preOrderRef, {
        advancePaid: nextAdvancePaid,
        refundedAmount: nextRefundedAmount,
        dueAmount: nextDueAmount,
        updatedAt: now,
        updatedBy: actor.id,
      });

      if (trackingRef && trackingSnap && trackingSnap.exists()) {
        txn.update(trackingRef, {
          advancePaid: nextAdvancePaid,
          refundedAmount: nextRefundedAmount,
          dueAmount: nextDueAmount,
          updatedAt: now,
        });
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
        summary: `${decision === 'verified' ? 'Verified' : 'Rejected'} ${payment.type} of ৳${payment.amount} on ${order.preOrderNumber}`,
        metadata: { paymentId, amount: payment.amount, decision },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export async function getPreOrderPayments(
  preOrderId: string,
  limitCount: number = 50
): Promise<PreOrderPayment[]> {
  const q = query(
    collection(db, 'preOrders', preOrderId, 'payments'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderPayment), id: d.id }));
}

// ==========================================
// STATUS TRANSITIONS & HISTORY
// ==========================================

export async function transitionPreOrderStatus(
  preOrderId: string,
  toStatus: PreOrderStatus,
  note: string,
  actor: PreOrderActor
): Promise<void> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const historyId = generateId('HIST');
  const historyRef = doc(db, 'preOrders', preOrderId, 'statusHistory', historyId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const snap = await txn.get(preOrderRef);
    if (!snap.exists()) throw new Error('Pre-order not found.');

    const order = snap.data() as PreOrder;
    const verifiedNetPaid = fromPaisa(
      toPaisa(order.advancePaid || 0) - toPaisa(order.refundedAmount || 0)
    );

    const validation = canTransitionPreOrderStatus(order.status, toStatus, verifiedNetPaid);
    if (!validation.allowed) {
      throw new Error(validation.reason || 'Invalid status transition.');
    }

    const trackingRef = order.trackingToken
      ? doc(db, 'publicTracking', order.trackingToken)
      : null;
    const trackingSnap = trackingRef ? await txn.get(trackingRef) : null;

    const orderUpdate: Record<string, any> = {
      status: toStatus,
      updatedAt: now,
      updatedBy: actor.id,
    };

    if (toStatus === 'Cancelled') {
      orderUpdate.isCancelled = true;
      orderUpdate.cancellationReason = note?.trim() || 'Cancelled';
      orderUpdate.cancelledAt = now;
      orderUpdate.cancelledBy = actor.id;
    }

    if (toStatus === 'Received in Stock') {
      orderUpdate.stockReceived = true;
      orderUpdate.stockReceivedAt = now;
    }

    txn.update(preOrderRef, sanitizeData(orderUpdate));

    const historyDoc: PreOrderStatusHistory = {
      id: historyId,
      preOrderId,
      fromStatus: order.status,
      toStatus,
      note: note?.trim() || '',
      changedBy: actor.id,
      changedByName: actor.name,
      timestamp: now,
    };
    txn.set(historyRef, sanitizeData(historyDoc));

    if (trackingRef && trackingSnap && trackingSnap.exists()) {
      const trackingData = trackingSnap.data() as PublicTrackingRecord;
      const nextTimeline = [
        ...(trackingData.statusTimeline || []),
        { status: toStatus, timestamp: now },
      ];
      txn.update(trackingRef, {
        status: toStatus,
        statusTimeline: nextTimeline,
        updatedAt: now,
      });
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'STATUS_CHANGED' as PreOrderAuditAction,
        summary: `Changed ${order.preOrderNumber} status: ${order.status} -> ${toStatus}`,
        metadata: { fromStatus: order.status, toStatus, note: note || '' },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export async function getPreOrderStatusHistory(
  preOrderId: string,
  limitCount: number = 50
): Promise<PreOrderStatusHistory[]> {
  const q = query(
    collection(db, 'preOrders', preOrderId, 'statusHistory'),
    orderBy('timestamp', 'asc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderStatusHistory), id: d.id }));
}

// ==========================================
// SHIPMENT SUB-DOCUMENT & PUBLIC TRACKING
// ==========================================

export async function upsertPreOrderShipment(
  preOrderId: string,
  shipmentInput: Omit<PreOrderShipment, 'preOrderId' | 'updatedBy' | 'updatedAt'>,
  actor: PreOrderActor
): Promise<void> {
  const now = Date.now();
  const preOrderRef = doc(db, 'preOrders', preOrderId);
  const shipmentRef = doc(db, 'preOrders', preOrderId, 'shipment', 'details');
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const orderSnap = await txn.get(preOrderRef);
    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = orderSnap.data() as PreOrder;

    const trackingRef = order.trackingToken
      ? doc(db, 'publicTracking', order.trackingToken)
      : null;
    const trackingSnap = trackingRef ? await txn.get(trackingRef) : null;

    const shipmentDoc: PreOrderShipment = {
      ...shipmentInput,
      preOrderId,
      updatedBy: actor.id,
      updatedAt: now,
    };
    txn.set(shipmentRef, sanitizeData(shipmentDoc), { merge: true });

    const summaryTrackingNo =
      shipmentInput.bdTrackingNo || shipmentInput.trackingNumber || shipmentInput.chinaTrackingNo || '';
    const summaryCourier = shipmentInput.bdCourier || shipmentInput.freightForwarder || '';

    txn.update(
      preOrderRef,
      sanitizeData({
        trackingNumber: summaryTrackingNo,
        courier: summaryCourier,
        estimatedDeliveryDate:
          shipmentInput.estimatedArrivalDate || order.estimatedDeliveryDate || '',
        updatedAt: now,
        updatedBy: actor.id,
      })
    );

    if (trackingRef && trackingSnap && trackingSnap.exists()) {
      txn.update(
        trackingRef,
        sanitizeData({
          trackingNumber: summaryTrackingNo,
          courier: summaryCourier,
          estimatedDeliveryDate:
            shipmentInput.estimatedArrivalDate || order.estimatedDeliveryDate || '',
          updatedAt: now,
        })
      );
    }

    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'SHIPMENT_UPDATED' as PreOrderAuditAction,
        summary: `Updated shipment info on ${order.preOrderNumber}`,
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });
}

export async function getPreOrderShipment(
  preOrderId: string
): Promise<PreOrderShipment | null> {
  const snap = await getDoc(doc(db, 'preOrders', preOrderId, 'shipment', 'details'));
  if (!snap.exists()) return null;
  return snap.data() as PreOrderShipment;
}

export async function getPublicTrackingByToken(
  token: string
): Promise<PublicTrackingRecord | null> {
  if (!token?.trim()) return null;
  const snap = await getDoc(doc(db, 'publicTracking', token.trim()));
  if (!snap.exists()) return null;
  return snap.data() as PublicTrackingRecord;
}

// ==========================================
// SUPPLIER PAYMENTS (APPEND-ONLY)
// ==========================================

export type AddPreOrderSupplierPaymentInput = Omit<
  PreOrderSupplierPayment,
  'id' | 'recordedBy' | 'recordedByName' | 'createdAt'
>;

export async function addPreOrderSupplierPayment(
  input: AddPreOrderSupplierPaymentInput,
  actor: PreOrderActor
): Promise<string> {
  const safeAmount = roundMoney(input.amount);
  const safeAmountBdt = roundMoney(input.amountBdt);
  if (safeAmount <= 0 || safeAmountBdt <= 0) {
    throw new Error('Supplier payment amount must be greater than zero.');
  }
  if (!input.idempotencyKey?.trim()) {
    throw new Error('idempotencyKey is required.');
  }

  const now = Date.now();
  const paymentId = `SUPPAY_${sanitizeIdFragment(input.idempotencyKey.trim())}`;
  const payRef = doc(db, 'preOrderSupplierPayments', paymentId);
  const auditRef = doc(db, 'preOrderAudit', generateId('AUD'));

  await runTransaction(db, async (txn) => {
    const existing = await txn.get(payRef);
    if (existing.exists()) return;

    const record: PreOrderSupplierPayment = {
      ...input,
      id: paymentId,
      amount: safeAmount,
      amountBdt: safeAmountBdt,
      recordedBy: actor.id,
      recordedByName: actor.name,
      createdAt: now,
    };

    txn.set(payRef, sanitizeData(record));
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId: input.preOrderId,
        preOrderNumber: input.preOrderNumber,
        action: 'SUPPLIER_PAYMENT_RECORDED' as PreOrderAuditAction,
        summary: `Recorded supplier payment of ${safeAmount} ${input.currency} (৳${safeAmountBdt}) to ${input.supplierName}`,
        metadata: { paymentId, supplierId: input.supplierId, amountBdt: safeAmountBdt },
        userId: actor.id,
        userName: actor.name,
        userRole: actor.role,
        timestamp: now,
      })
    );
  });

  return paymentId;
}

export async function getPreOrderSupplierPayments(
  preOrderId?: string,
  limitCount: number = 50
): Promise<PreOrderSupplierPayment[]> {
  const constraints: any[] = [];
  if (preOrderId) {
    constraints.push(where('preOrderId', '==', preOrderId));
  }
  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(limitCount));
  const q = query(collection(db, 'preOrderSupplierPayments'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderSupplierPayment), id: d.id }));
}

// ==========================================
// AUDIT LOGS & NOTIFICATIONS (QUOTA-FRIENDLY)
// ==========================================

export async function getPreOrderAuditLogs(
  preOrderId?: string,
  limitCount: number = 50
): Promise<PreOrderAuditEntry[]> {
  const constraints: any[] = [];
  if (preOrderId) {
    constraints.push(where('preOrderId', '==', preOrderId));
  }
  constraints.push(orderBy('timestamp', 'desc'));
  constraints.push(limit(limitCount));
  const q = query(collection(db, 'preOrderAudit'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderAuditEntry), id: d.id }));
}

export async function getPreOrderNotifications(
  limitCount: number = 30
): Promise<PreOrderNotification[]> {
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
