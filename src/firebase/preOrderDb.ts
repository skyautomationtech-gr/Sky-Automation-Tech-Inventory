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
  DocumentData,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase/firestore';
import { auth, db } from './config';
import { dbCache, getCompanySettings, localStore, sanitizeData } from './db';
import {
  CompanySettings,
  Customer,
  PreOrder,
  PreOrderAuditAction,
  PreOrderAuditEntry,
  PreOrderCustomsStatus,
  PreOrderNotification,
  PreOrderPayment,
  PreOrderPaymentMethod,
  PreOrderPaymentState,
  PreOrderPaymentStatus,
  PreOrderPaymentType,
  PreOrderPrivateCost,
  PreOrderShipment,
  PreOrderShipmentDoc,
  PreOrderShipmentEvent,
  PreOrderShippingExpensesBreakdown,
  PreOrderShippingMethod,
  PreOrderStatus,
  PreOrderStatusHistory,
  PreOrderSupplierPayment,
  PreOrderSupplierPaymentAllocation,
  PreOrderTrackingHistoryItem,
  PublicTrackingRecord,
  RolePermissionsMap,
  UserProfile,
} from '../types';
import {
  calculateActualShippingCost,
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
  PRE_ORDER_FORWARD_FLOW,
  PRE_ORDER_LOCKED_PART6_STATUS,
  getTodayIsoDate,
  isPreOrderAdminRole,
  isPreOrderOverdue,
  isValidBdPhone,
  mergeWithDefaultRolePermissions,
  normalizeBdPhone,
} from '../preOrders/constants';
import {
  DEFAULT_TRACKING_AUTO_EXPIRY_DAYS,
  buildDisabledPublicTrackingDoc,
  buildWhitelistedPublicTrackingDoc,
  generateSecureTrackingToken,
  isSafeTrackingTokenFormat,
} from '../preOrders/tracking';

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

  const shouldAutoVerify =
    Boolean(input.initialAdvance?.autoVerify) &&
    input.initialAdvance?.method === 'Cash' &&
    isPreOrderAdminRole(actor.role);
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

    // 4. WRITE PRE-ORDER + ISOLATED PRIVATE COST + LEDGER + HISTORY + AUDIT
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
    }
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

  const syncRes = await syncPublicTracking(preOrderId);
  return { trackingSyncWarning: syncRes.ok ? undefined : syncRes.error };
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
    qty: order.qty,
    sellingUnitPrice: order.sellingUnitPrice,
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
    const [orderSnap, existingPaymentSnap, existingLedger] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
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

    const currentCalc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
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
          type: 'payment_pending',
          title: 'Payment Pending Verification',
          message: `${order.preOrderNumber}: ৳${safeAmount.toLocaleString()} via ${input.method} recorded by ${actor.name} awaiting verification.`,
          targetTab: 'preorder_payments',
          readBy: [],
          createdAt: now,
          createdBy: actor.id,
        } as PreOrderNotification)
      );
    }

    resultPayment = paymentDoc;
    resultOrder = { ...order, ...patch };
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
    const [orderSnap, paySnap, existingLedger] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
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
    const [orderSnap, origSnap, revSnap, existingLedger] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(origPaymentRef),
      txn.get(revPaymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
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
    const beforeCalc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: existingLedger,
    });
    const rawAfterCalc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
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
    const [orderSnap, existingPaySnap, existingLedger] = await Promise.all([
      txn.get(preOrderRef),
      txn.get(paymentRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
    ]);

    if (!orderSnap.exists()) throw new Error('Pre-order not found.');
    const order = { ...(orderSnap.data() as PreOrder), id: orderSnap.id };

    if (existingPaySnap.exists()) {
      resultPayment = { ...(existingPaySnap.data() as PreOrderPayment), id: existingPaySnap.id };
      resultOrder = order;
      return;
    }

    const currentCalc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
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
        type: 'refund_alert',
        title: 'Customer Refund Recorded',
        message: `${order.preOrderNumber}: ৳${safeAmount.toLocaleString()} refunded via ${input.method} by ${actor.name}.`,
        targetTab: 'preorder_payments',
        readBy: [],
        createdAt: now,
        createdBy: actor.id,
      } as PreOrderNotification)
    );

    resultPayment = refundDoc;
    resultOrder = { ...order, ...patch };
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
    const [orderSnap, ledger] = await Promise.all([
      txn.get(preOrderRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
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
      const haystack = [o.preOrderNumber, o.customerName, o.customerPhone, o.productName]
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
      .map((d) => ({ ...(d.data() as PreOrder), id: d.id }))
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
      .map((d) => ({ ...(d.data() as PreOrder), id: d.id }))
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
    const [snap, ledger] = await Promise.all([
      txn.get(preOrderRef),
      loadAndLockOrderLedgerInTxn(txn, preOrderId),
    ]);
    if (!snap.exists()) throw new Error('Pre-order not found.');

    const order = { ...(snap.data() as PreOrder), id: snap.id };
    if (order.status === toStatus) {
      throw new Error(`Pre-order is already in "${toStatus}" status.`);
    }

    const calc = calculatePreOrderFinancials({
      qty: order.qty,
      sellingUnitPrice: order.sellingUnitPrice,
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
      if (!noteTrimmed) {
        throw new Error('Cancellation reason is required.');
      }
      if (order.status === 'Delivered') {
        throw new Error('Delivered pre-orders cannot be cancelled.');
      }
      if (toPaisa(calc.verifiedCollected) > 0 && !isAdmin) {
        throw new Error(
          'This pre-order has verified customer payments. Only an Admin or Super Admin can cancel it.'
        );
      }
    }

    let loggedOverrideReason = '';
    if (toStatus === 'Delivered' && toPaisa(calc.dueAmount) > 0) {
      if (!isAdmin) {
        throw new Error(
          `Cannot mark as Delivered while ৳${calc.dueAmount.toLocaleString()} due remains. Collect remaining payment first or ask an Admin to override.`
        );
      }
      if (!input.allowUnpaidDeliveryOverride || !(overrideReasonTrimmed || noteTrimmed)) {
        throw new Error(
          `Remaining due is ৳${calc.dueAmount.toLocaleString()}. Admin unpaid-delivery override and a reason are required.`
        );
      }
      loggedOverrideReason = overrideReasonTrimmed || noteTrimmed;
    }

    const paymentState = derivePreOrderPaymentState(
      calc.totalAmount,
      calc.verifiedCollected,
      calc.verifiedRefunded,
      toStatus
    );

    const orderUpdate: Record<string, any> = {
      status: toStatus,
      advancePaid: calc.verifiedCollected,
      pendingAmount: calc.pendingCollected,
      refundedAmount: calc.verifiedRefunded,
      dueAmount: calc.dueAmount,
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

  const sanitizedBreakdown: PreOrderShippingExpensesBreakdown = {
    internationalFreight: freight,
    customsDuty: customs,
    localTransport: local,
    handlingOther: handling,
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
    txn.set(
      auditRef,
      sanitizeData({
        id: auditRef.id,
        preOrderId,
        preOrderNumber: order.preOrderNumber,
        action: 'PRIVATE_COST_UPDATED' as PreOrderAuditAction,
        summary: `Updated restricted shipping expense breakdown on ${order.preOrderNumber} (Actual total: ৳${actualShippingCost.toLocaleString()})`,
        metadata: {
          before: { actualShippingCost: prevCost?.actualShippingCost ?? 0 },
          after: { actualShippingCost },
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
  const pageSize = Math.min(Math.max(options.limitCount || 150, 20), 250);
  const q = query(
    collection(db, 'preOrders'),
    orderBy('updatedAt', 'desc'),
    limit(pageSize)
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
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

    const [payments, statusHistory, shipmentEvents, companySettings] = await Promise.all([
      getPreOrderPayments(preOrderId, 100),
      getPreOrderStatusHistory(preOrderId, 100),
      getPreOrderShipmentEvents(preOrderId, 100),
      options?.companySettings !== undefined
        ? Promise.resolve(options.companySettings)
        : getCompanySettings().catch(() => null),
    ]);

    const whitelistedDoc = buildWhitelistedPublicTrackingDoc({
      order,
      payments,
      statusHistory,
      shipmentEvents,
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

  await runTransaction(db, async (txn) => {
    const [origSnap, revSnap] = await Promise.all([txn.get(origRef), txn.get(revRef)]);
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

  const q = query(
    collection(db, 'preOrderSupplierPayments'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as PreOrderSupplierPayment), id: d.id }));
}

export async function getPreOrderSupplierPaymentsBySupplier(
  supplierId: string,
  limitCount: number = 200
): Promise<PreOrderSupplierPayment[]> {
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
  try {
    const q = query(
      collection(db, 'preOrders'),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...(d.data() as PreOrder), id: d.id }));
  } catch (err: any) {
    if (err?.code === 'failed-precondition') {
      const qFallback = query(
        collection(db, 'preOrders'),
        where('supplierId', '==', supplierId),
        limit(limitCount)
      );
      const snap = await getDocs(qFallback);
      return snap.docs
        .map((d) => ({ ...(d.data() as PreOrder), id: d.id }))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    throw err;
  }
}

export async function getPreOrderPrivateCostsMap(
  preOrderIds: string[]
): Promise<Record<string, PreOrderPrivateCost>> {
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
