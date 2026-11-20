import {
  PreOrderPermissionKey,
  PreOrderStatus,
  RolePermissionSet,
  RolePermissionsMap,
  UserProfile,
} from '../types';

export const PRE_ORDER_STATUSES: readonly PreOrderStatus[] = [
  'Advance Received',
  'Order Confirmed',
  'Ordered from China',
  'China Warehouse',
  'International Shipment',
  'Customs Clearance',
  'Arrived in Bangladesh',
  'Received in Stock',
  'Ready for Delivery',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
] as const;

export const PRE_ORDER_FORWARD_FLOW: readonly PreOrderStatus[] = [
  'Advance Received',
  'Order Confirmed',
  'Ordered from China',
  'China Warehouse',
  'International Shipment',
  'Customs Clearance',
  'Arrived in Bangladesh',
  'Received in Stock',
  'Ready for Delivery',
  'Out for Delivery',
  'Delivered',
] as const;

/**
 * Allowed status transitions:
 * - Standard flow can advance forward along PRE_ORDER_FORWARD_FLOW (next step or forward skip before Delivered)
 * - 'Cancelled' is allowed from any status prior to 'Delivered'
 * - 'Refunded' is allowed ONLY from 'Cancelled' (and requires verified net paid > 0, enforced in calculations.ts)
 * - 'Delivered' and 'Refunded' are terminal states
 */
export const PRE_ORDER_ALLOWED_TRANSITIONS: Record<PreOrderStatus, readonly PreOrderStatus[]> = {
  'Advance Received': [
    'Order Confirmed',
    'Ordered from China',
    'China Warehouse',
    'International Shipment',
    'Customs Clearance',
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Order Confirmed': [
    'Ordered from China',
    'China Warehouse',
    'International Shipment',
    'Customs Clearance',
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Ordered from China': [
    'China Warehouse',
    'International Shipment',
    'Customs Clearance',
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'China Warehouse': [
    'International Shipment',
    'Customs Clearance',
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'International Shipment': [
    'Customs Clearance',
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Customs Clearance': [
    'Arrived in Bangladesh',
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Arrived in Bangladesh': [
    'Received in Stock',
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Received in Stock': [
    'Ready for Delivery',
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Ready for Delivery': [
    'Out for Delivery',
    'Delivered',
    'Cancelled',
  ],
  'Out for Delivery': [
    'Delivered',
    'Cancelled',
  ],
  'Delivered': [],
  'Cancelled': ['Refunded'],
  'Refunded': [],
};

export const PRE_ORDER_PAYMENT_METHODS = [
  'Cash',
  'bKash',
  'Nagad',
  'Rocket',
  'Bank Transfer',
  'Card',
] as const;

export interface PreOrderStatusMeta {
  label: string;
  badgeClass: string;
  dotClass: string;
}

/**
 * Single shared source of truth for Pre-Order status badge colors across all screens.
 */
export const PRE_ORDER_STATUS_META: Record<PreOrderStatus, PreOrderStatusMeta> = {
  'Advance Received': {
    label: 'Advance Received',
    badgeClass:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/80',
    dotClass: 'bg-amber-500',
  },
  'Order Confirmed': {
    label: 'Order Confirmed',
    badgeClass:
      'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/80',
    dotClass: 'bg-blue-500',
  },
  'Ordered from China': {
    label: 'Ordered from China',
    badgeClass:
      'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/80',
    dotClass: 'bg-indigo-500',
  },
  'China Warehouse': {
    label: 'China Warehouse',
    badgeClass:
      'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/80',
    dotClass: 'bg-violet-500',
  },
  'International Shipment': {
    label: 'International Shipment',
    badgeClass:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/80',
    dotClass: 'bg-sky-500',
  },
  'Customs Clearance': {
    label: 'Customs Clearance',
    badgeClass:
      'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/80',
    dotClass: 'bg-orange-500',
  },
  'Arrived in Bangladesh': {
    label: 'Arrived in Bangladesh',
    badgeClass:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80',
    dotClass: 'bg-teal-500',
  },
  'Received in Stock': {
    label: 'Received in Stock',
    badgeClass:
      'bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/80',
    dotClass: 'bg-cyan-500',
  },
  'Ready for Delivery': {
    label: 'Ready for Delivery',
    badgeClass:
      'bg-lime-50 text-lime-800 border-lime-200 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-800/80',
    dotClass: 'bg-lime-500',
  },
  'Out for Delivery': {
    label: 'Out for Delivery',
    badgeClass:
      'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/80',
    dotClass: 'bg-yellow-500',
  },
  Delivered: {
    label: 'Delivered',
    badgeClass:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80',
    dotClass: 'bg-emerald-500',
  },
  Cancelled: {
    label: 'Cancelled',
    badgeClass:
      'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/80',
    dotClass: 'bg-rose-500',
  },
  Refunded: {
    label: 'Refunded',
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-500',
  },
};

export const PRE_ORDER_EDIT_LOCKED_STATUSES: readonly PreOrderStatus[] = [
  'Delivered',
  'Cancelled',
  'Refunded',
] as const;

export const PRE_ORDER_NOT_OVERDUE_STATUSES: readonly PreOrderStatus[] = [
  'Received in Stock',
  'Ready for Delivery',
  'Out for Delivery',
  'Delivered',
  'Cancelled',
  'Refunded',
] as const;

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isPreOrderOverdue(
  estimatedDeliveryDate?: string,
  status?: PreOrderStatus,
  stockReceived?: boolean
): boolean {
  if (!estimatedDeliveryDate) return false;
  if (stockReceived) return false;
  if (status && PRE_ORDER_NOT_OVERDUE_STATUSES.includes(status)) return false;
  return estimatedDeliveryDate < getTodayIsoDate();
}

/**
 * Normalizes Bangladesh phone numbers (strips spaces/dashes/+88/88) into 01XXXXXXXXX when possible.
 */
export function normalizeBdPhone(raw: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  if (digits.startsWith('8801') && digits.length === 13) {
    return digits.slice(2);
  }
  if (digits.startsWith('880') && digits.length === 12) {
    return '0' + digits.slice(3);
  }
  return digits;
}

export function isValidBdPhone(raw: string): boolean {
  const normalized = normalizeBdPhone(raw);
  return /^01[3-9]\d{8}$/.test(normalized);
}

export function formatBDT(amount: number | undefined | null): string {
  const num = Number(amount || 0);
  if (!Number.isFinite(num)) return '৳0';
  return `৳${num.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export const PRE_ORDER_PERMISSION_META: Array<{
  key: PreOrderPermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'preOrderView',
    label: 'View Pre-Orders',
    description: 'See Pre-Order Management menu and view pre-order lists & details',
  },
  {
    key: 'preOrderCreate',
    label: 'Create Pre-Order',
    description: 'Create new customer pre-orders and reserve PO numbers',
  },
  {
    key: 'preOrderEdit',
    label: 'Edit Pre-Order',
    description: 'Modify customer info, pricing, delivery charges, and specs',
  },
  {
    key: 'preOrderUpdateStatus',
    label: 'Update Status',
    description: 'Advance shipment/procurement workflow status or cancel pre-orders',
  },
  {
    key: 'preOrderCollectPayment',
    label: 'Collect Payment',
    description: 'Record advance, installment, or additional payment entries',
  },
  {
    key: 'preOrderVerifyPayment',
    label: 'Verify / Reject Payment',
    description: 'Approve or reject pending customer payment records',
  },
  {
    key: 'preOrderRefund',
    label: 'Process Refunds',
    description: 'Issue customer refunds on cancelled pre-orders',
  },
  {
    key: 'preOrderReceiveStock',
    label: 'Receive into Stock',
    description: 'Receive arrived pre-order items into warehouse inventory',
  },
  {
    key: 'preOrderConvertSale',
    label: 'Convert to Sales Order',
    description: 'Convert fulfilled pre-order into a regular Order & Invoice',
  },
  {
    key: 'preOrderManageTracking',
    label: 'Manage Tracking & Links',
    description: 'Manage China/BD tracking numbers and customer public tracking links',
  },
  {
    key: 'preOrderSupplier',
    label: 'Supplier & Procurement',
    description: 'Manage pre-order China suppliers and supplier payment ledgers',
  },
  {
    key: 'preOrderReports',
    label: 'Pre-Order Reports',
    description: 'View Pre-Order analytics, audit logs, and export history',
  },
  {
    key: 'preOrderViewProfit',
    label: 'View Cost, Profit & Internal Notes',
    description: 'Access restricted China cost, shipping cost, profit margin & internal notes',
  },
];

export const DEFAULT_PRE_ORDER_PERMISSIONS: Record<'superadmin' | 'admin' | 'manager' | 'staff', Record<PreOrderPermissionKey, boolean>> = {
  superadmin: {
    preOrderView: true,
    preOrderCreate: true,
    preOrderEdit: true,
    preOrderUpdateStatus: true,
    preOrderCollectPayment: true,
    preOrderVerifyPayment: true,
    preOrderRefund: true,
    preOrderReceiveStock: true,
    preOrderConvertSale: true,
    preOrderManageTracking: true,
    preOrderSupplier: true,
    preOrderReports: true,
    preOrderViewProfit: true,
  },
  admin: {
    preOrderView: true,
    preOrderCreate: true,
    preOrderEdit: true,
    preOrderUpdateStatus: true,
    preOrderCollectPayment: true,
    preOrderVerifyPayment: true,
    preOrderRefund: true,
    preOrderReceiveStock: true,
    preOrderConvertSale: true,
    preOrderManageTracking: true,
    preOrderSupplier: true,
    preOrderReports: true,
    preOrderViewProfit: true,
  },
  manager: {
    preOrderView: true,
    preOrderCreate: true,
    preOrderEdit: true,
    preOrderUpdateStatus: true,
    preOrderCollectPayment: true,
    preOrderVerifyPayment: true,
    preOrderRefund: false,
    preOrderReceiveStock: true,
    preOrderConvertSale: true,
    preOrderManageTracking: true,
    preOrderSupplier: true,
    preOrderReports: true,
    preOrderViewProfit: false,
  },
  staff: {
    preOrderView: true,
    preOrderCreate: true,
    preOrderEdit: false,
    preOrderUpdateStatus: true,
    preOrderCollectPayment: true,
    preOrderVerifyPayment: false,
    preOrderRefund: false,
    preOrderReceiveStock: true,
    preOrderConvertSale: false,
    preOrderManageTracking: false,
    preOrderSupplier: false,
    preOrderReports: false,
    preOrderViewProfit: false,
  },
};

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMap = {
  superadmin: {
    addProduct: true,
    editProduct: true,
    deleteProduct: true,
    manageCategories: true,
    stockIn: true,
    stockOut: true,
    stockAdjustment: true,
    manageOrders: true,
    voidInvoice: true,
    ...DEFAULT_PRE_ORDER_PERMISSIONS.superadmin,
  },
  admin: {
    addProduct: true,
    editProduct: true,
    deleteProduct: true,
    manageCategories: true,
    stockIn: true,
    stockOut: true,
    stockAdjustment: true,
    manageOrders: true,
    voidInvoice: false,
    ...DEFAULT_PRE_ORDER_PERMISSIONS.admin,
  },
  manager: {
    addProduct: true,
    editProduct: true,
    deleteProduct: false,
    manageCategories: true,
    stockIn: true,
    stockOut: true,
    stockAdjustment: true,
    manageOrders: true,
    voidInvoice: false,
    ...DEFAULT_PRE_ORDER_PERMISSIONS.manager,
  },
  staff: {
    addProduct: false,
    editProduct: false,
    deleteProduct: false,
    manageCategories: false,
    stockIn: true,
    stockOut: true,
    stockAdjustment: false,
    manageOrders: false,
    voidInvoice: false,
    ...DEFAULT_PRE_ORDER_PERMISSIONS.staff,
  },
};

export function mergeWithDefaultRolePermissions(raw?: RolePermissionsMap | null): RolePermissionsMap {
  return {
    superadmin: { ...DEFAULT_ROLE_PERMISSIONS.superadmin, ...(raw?.superadmin || {}) },
    admin: { ...DEFAULT_ROLE_PERMISSIONS.admin, ...(raw?.admin || {}) },
    manager: { ...DEFAULT_ROLE_PERMISSIONS.manager, ...(raw?.manager || {}) },
    staff: { ...DEFAULT_ROLE_PERMISSIONS.staff, ...(raw?.staff || {}) },
  };
}

export function hasPermission(
  user: UserProfile | null | undefined,
  rolePermissions: RolePermissionsMap | null | undefined,
  key: keyof RolePermissionSet
): boolean {
  if (!user) return false;
  const normalizedRole = user.role === ('super_admin' as any) ? 'superadmin' : user.role;
  if (normalizedRole === 'superadmin') return true;

  if (user.permissionOverrides && typeof user.permissionOverrides[key] === 'boolean') {
    return Boolean(user.permissionOverrides[key]);
  }

  const roleMap = rolePermissions?.[normalizedRole] || DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  if (roleMap && typeof roleMap[key] === 'boolean') {
    return Boolean(roleMap[key]);
  }

  const fallback = DEFAULT_ROLE_PERMISSIONS[normalizedRole] || DEFAULT_ROLE_PERMISSIONS.staff;
  return Boolean(fallback?.[key]);
}

export type PreOrderTabId =
  | 'preorder_overview'
  | 'preorder_create'
  | 'preorder_list'
  | 'preorder_payments'
  | 'preorder_tracking'
  | 'preorder_links'
  | 'preorder_suppliers'
  | 'preorder_reports';

export interface PreOrderNavItemMeta {
  id: PreOrderTabId;
  label: string;
  description: string;
  requiredPermission: PreOrderPermissionKey;
}

export const PRE_ORDER_NAV_ITEMS: readonly PreOrderNavItemMeta[] = [
  {
    id: 'preorder_overview',
    label: 'Overview Dashboard',
    description: 'Pre-order pipeline summary, awaiting payments, and international shipment queue.',
    requiredPermission: 'preOrderView',
  },
  {
    id: 'preorder_create',
    label: 'Create Pre-Order',
    description: 'Register a new customer pre-order with sequential PO-0001 numbering and advance deposit.',
    requiredPermission: 'preOrderCreate',
  },
  {
    id: 'preorder_list',
    label: 'All Pre-Orders',
    description: 'Search, filter, advance statuses, and convert pre-orders to sales invoices.',
    requiredPermission: 'preOrderView',
  },
  {
    id: 'preorder_payments',
    label: 'Payment Management',
    description: 'Collect installments, verify pending deposits, and process approved refunds.',
    requiredPermission: 'preOrderView',
  },
  {
    id: 'preorder_tracking',
    label: 'Shipment Tracking',
    description: 'Track China supplier orders, freight forwarder batches, and Bangladesh courier handoff.',
    requiredPermission: 'preOrderView',
  },
  {
    id: 'preorder_links',
    label: 'Customer Tracking Links',
    description: 'Manage shareable public tracking tokens for live customer self-service status checks.',
    requiredPermission: 'preOrderView',
  },
  {
    id: 'preorder_suppliers',
    label: 'Supplier Management',
    description: 'Record China supplier disbursements, RMB/USD conversions, and procurement references.',
    requiredPermission: 'preOrderSupplier',
  },
  {
    id: 'preorder_reports',
    label: 'Reports & History',
    description: 'Analyze pre-order volume, dues, profit margins, and immutable audit trails.',
    requiredPermission: 'preOrderReports',
  },
] as const;

export function isPreOrderTab(tab: string): tab is PreOrderTabId {
  return PRE_ORDER_NAV_ITEMS.some((item) => item.id === tab);
}
