export type UserRole = 'superadmin' | 'admin' | 'manager' | 'staff';

export interface PermissionOverrides {
  [key: string]: boolean;
}

export interface Branch {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  active?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternativeMobile?: string;
  photoUrl?: string;
  dob?: string;
  gender?: 'Male' | 'Female' | 'Other' | string;
  nidNumber?: string;
  presentAddress?: string;
  permanentAddress?: string;
  role: UserRole;
  subBrandAccess: string[]; // ['SAT', 'GZ', 'RTX'] etc
  onboardingCompleted?: boolean;
  createdBy?: string;
  active?: boolean;
  createdAt?: number;
  updatedAt?: number;
  
  // Signup Approval Workflow
  status?: 'pending_approval' | 'approved' | 'rejected';
  requestedRole?: 'staff' | 'admin' | 'manager';
  requestedSubBrandAccess?: string[];
  rejectionReason?: string;

  // Employment Info (Confirmed / Assigned)
  employeeId?: string;
  department?: string;
  designation?: string;
  branch?: string;
  joiningDate?: string;
  employmentType?: 'Full-Time' | 'Part-Time' | 'Intern' | 'Contract' | string;

  // Requested Employment Info
  requestedDepartment?: string;
  requestedDesignation?: string;
  requestedBranch?: string;
  requestedJoiningDate?: string;
  requestedEmploymentType?: string;

  // Account Setup
  requirePasswordChange?: boolean;
  permissionOverrides?: PermissionOverrides;

  // Attendance
  currentSessionStatus?: 'checked_in' | 'checked_out';
  currentSessionId?: string | null;
  currentSessionDate?: string | null;

  // Theme Preference
  themePreference?: 'light' | 'dark' | 'system';

  // New Profile & Security Fields
  address?: string;
  twoFactorEnabled?: boolean;
  lastLoginAt?: number;
  sessionsRevokedAt?: number;
  notificationPrefs?: {
    orderUpdates?: boolean;
    lowStockAlerts?: boolean;
    pendingApprovals?: boolean;
    duePaymentReminders?: boolean;
    attendanceReminders?: boolean;
    systemAnnouncements?: boolean;
  };
}

export interface PrivateEmploymentInfo {
  salary: number;
  updatedAt: number;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  role: string;
  subBrand: string;
  checkInTime: number;
  checkOutTime: number | null;
  date: string; // YYYY-MM-DD
  durationMinutes: number | null;
  checkedInBy?: string;
  checkedOutBy?: string;
  isManualEntry?: boolean;
}

export interface ProductPreOrderReservation {
  preOrderId: string;
  preOrderNumber: string;
  variantId: string;
  qty: number;
  receivedAt: number;
}

export interface Variant {
  id: string;
  color: string;
  model: string;
  stock: number;
  reservedQty?: number;
  reservedForPreOrders?: ProductPreOrderReservation[];
  barcodeValue?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  category: string; // for backward compatibility/displays
  mainCategory?: string; // name/id of 3-level main category
  subCategory?: string; // name/id of 3-level sub category
  childCategory?: string; // name/id of 3-level child category
  brand: string;
  subBrand: 'SAT' | 'GZ' | 'RTX' | string; // Sky Automation Tech, GadgetZu, RTX Gadget
  costPrice: number;
  sellingPrice: number;
  discountPrice?: number;
  reorderThreshold: number;
  images: string[]; // Base64 or Object URL or Storage paths
  imageUrls?: string[];
  variants: Variant[];
  totalStock?: number;
  reservedQty?: number;
  reservedForPreOrders?: ProductPreOrderReservation[];
  archived: boolean;
  createdAt: number;
  barcodeValue?: string;
  status?: 'pending_review' | 'approved' | 'rejected';
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  rejectionReason?: string;
  deletionStatus?: 'pending_approval' | null;
  deletionRequestedBy?: string;
  deletionRequestedAt?: number;
  createdById?: string;
  createdBy?: string;
}

export type StockLogType = 'in' | 'out' | 'adjustment' | 'sale' | 'cancellation_restock' | 'return_restock';

export interface StockLog {
  id: string;
  productId: string;
  productName: string;
  type: StockLogType;
  qty: number; // positive/negative change
  reason: string; // Sale, Damage, Return, Gift/Sample, Supplier Purchase, Adjustment, Opening Stock
  userId: string;
  userName: string;
  timestamp: number;
  beforeQty: number;
  afterQty: number;
  refNo?: string;
  supplierName?: string;
  orderId?: string;
  preOrderId?: string;
  variantId?: string;
  purchasePrice?: number;
}

export interface Category {
  id: string;
  name: string;
  level: 'main' | 'sub' | 'child';
  parentId: string | null;
}

export interface Brand {
  id: string;
  name: string;
  logoUrl?: string;
  associatedSubBrands?: string[];
  associatedCategories?: string[];
  createdAt?: number;
}

export interface ProductColor {
  id: string;
  name: string;
  hexCode?: string;
}

export interface ProductModel {
  id: string;
  name: string;
}

export interface SubBrandDetails {
  companyName?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  logoUrl?: string;
  invoiceTerms?: string;
  tagline?: string;
}

export interface TrackingShareTemplates {
  en?: string;
  bn?: string;
}

export interface CompanySettings {
  companyName: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
  email?: string;
  invoiceTerms?: string;
  footerTagline?: string;
  paymentMethodsInfo?: {
    bkashNagad?: string;
    bankInfo?: string;
    whatsappContact?: string;
  };
  prefixes: {
    SAT: string; // default: SAT-INV
    GZ: string;  // default: GZ-INV
    RTX: string; // default: RTX-INV
  };
  subBrandDetails?: {
    SAT?: SubBrandDetails;
    GZ?: SubBrandDetails;
    RTX?: SubBrandDetails;
  };
  subBrands?: string[];
  onboarded: boolean;

  // Phase 3 Configurable Options
  defaultReorderThreshold?: number;
  notificationPreferences?: {
    lowStockAlerts?: boolean;
    orderStatusAlerts?: boolean;
    duePaymentAlerts?: boolean;
    pendingApprovalAlerts?: boolean;
  };
  agingThresholds?: {
    bucket1MaxDays?: number; // e.g. 15
    bucket2MaxDays?: number; // e.g. 30
  };
  defaultReportDateRange?: 'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year';
  supplierTermsNote?: string;
  emailJsConfig?: {
    serviceId?: string;
    templateId?: string;
    publicKey?: string;
    recipientEmail?: string;
  };

  // Part 5: Customer Public Tracking Portal Settings
  publicAppUrl?: string; // e.g. https://sat-erp.vercel.app
  trackingAutoExpiryEnabled?: boolean;
  trackingAutoExpiryDays?: number; // default: 90
  defaultShowCourierTracking?: boolean;
  trackingShareTemplates?: TrackingShareTemplates;
}

export interface Supplier {
  id: string;
  supplierCode?: string; // e.g. "SUP-0001"
  name: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  supplierType?: 'Manufacturer' | 'Distributor' | 'Wholesaler' | 'Local Market' | 'Importer' | 'Other' | string;
  productCategory?: string | string[];
  paymentMethod?: 'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer' | 'Multiple' | string;
  openingBalance?: number;
  currentBalance?: number;
  creditLimit?: number;
  creditDays?: number;
  bankInfo?: {
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    branch?: string;
  };
  status?: 'active' | 'inactive';
  notes?: string;
  logoUrl?: string;
  documentUrls?: string[];
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL' | '';
  // Optional China / Pre-Order Supplier metadata
  isChinaSupplier?: boolean;
  whatsapp?: string;
  wechatId?: string;
  city?: string;
  country?: string;
  platform?: '1688' | 'Taobao' | 'AliExpress' | 'Alibaba' | 'Direct factory' | 'Agent' | 'Other' | string;
  shopUrl?: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
  createdAt: number;
  createdBy?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  amount: number;
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer';
  referenceNo?: string;
  notes?: string;
  date: string; // YYYY-MM-DD
  recordedBy: string;
  createdAt: number;
}

export type NotificationType = 'low_stock' | 'order_status' | 'due_payment' | 'pending_approval';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  targetScreen?: string; // 'products' | 'orders' | 'due_payments' | 'users' | 'suppliers'
  targetId?: string;
  createdAt: number;
  read: boolean;
  dismissedBy?: string[];
}

export interface Customer {
  id: string;
  customerId?: string;
  name: string;
  phone: string;
  whatsapp?: string;
  address?: string;
  subBrand?: string;
  notes?: string;
  totalOrders: number;
  lifetimeValue: number;
  createdAt: number;
}

export type SalesChannel = 'Facebook' | 'TikTok' | 'Instagram' | 'Daraz' | 'CartUp' | 'Packly' | 'Direct/WhatsApp';
export type CourierName = 'Steadfast (Outside Dhaka)' | 'CarryBee (Inside Dhaka)' | 'Paperfly' | 'Hand to Hand' | string;
export type PaymentMethod = 'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer';
export type PaymentStatus = 'Paid' | 'Due' | 'Partial';
export type OrderStatus = 'Pending' | 'Confirmed' | 'Packed' | 'Shipped' | 'Delivered' | 'Returned/Cancelled';

export interface OrderItem {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  costPrice?: number; // Landed cost snapshot per unit (used for exact pre-order COGS)
}

export interface OrderStatusHistory {
  status: OrderStatus;
  timestamp: number;
  changedBy: string;
}

export interface OrderPaymentHistory {
  amount: number;
  method: string;
  date: number;
  recordedBy: string;
  label?: string;
  isPreOrderAdvance?: boolean;
  preOrderPaymentId?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  salesChannel: SalesChannel;
  items: OrderItem[];
  discountAmount?: number;
  shippingCharge?: number;
  totalAmount: number;
  courier: CourierName;
  courierTrackingNumber?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  amountDue: number;
  status: OrderStatus;
  statusHistory: OrderStatusHistory[];
  deliveryAddress: string;
  notes?: string;
  createdBy: string;
  createdAt: number;
  invoiceId?: string;
  paymentHistory?: OrderPaymentHistory[];
  source?: 'regular' | 'pre_order' | string;
  preOrderId?: string;
  preOrderNumber?: string;
  stockDeductedOnConvert?: boolean;
}

export interface Invoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  subBrandPrefix: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  discountAmount?: number;
  shippingCharge?: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  paymentStatus: PaymentStatus;
  courier: CourierName;
  courierTrackingNumber?: string;
  generatedAt: number;
  generatedBy: string;
  voided: boolean;
  voidedReason?: string;
  voidedBy?: string;
  voidedAt?: number;
  source?: 'regular' | 'pre_order' | string;
  preOrderId?: string;
  preOrderNumber?: string;
}

export type ExpenseCategory = 
  | 'Product Purchase'
  | 'Supplier Delivery/Transport'
  | 'Packaging'
  | 'Warehouse/Rent'
  | 'Electricity'
  | 'Internet'
  | 'Mobile/Phone Bill'
  | 'Staff Salary'
  | 'Courier/Delivery Expense'
  | 'Facebook/Instagram Ads'
  | 'Marketing/Design'
  | 'Software/Subscription'
  | 'Equipment/Repair'
  | 'Bank/MFS Charge'
  | 'Supplier Payment'
  | 'Customer Refund'
  | 'Other Expense'
  | 'Rent'
  | 'Salary'
  | 'Utility Bill'
  | 'Marketing'
  | 'Courier/Delivery Charge'
  | 'Office Supplies'
  | 'Maintenance'
  | 'Import / Shipping'
  | 'Other';

export type ExpensePaymentMethod = 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Upay' | 'Other';

export interface Expense {
  id: string;
  expenseId?: string; // e.g. "EXP-20260815-4921"
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "04:30 PM"
  paymentMethod?: ExpensePaymentMethod;
  supplierName?: string; // Supplier / Vendor Name (Optional)
  reference?: string; // Reference / Transaction ID
  invoiceNo?: string; // Invoice / Reference No (Optional)
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL' | '';
  notes?: string;
  receiptUrl?: string;
  createdBy?: string;
  addedBy?: string;
  createdAt: number;
}

export type IncomeCategory = 
  | 'Product Sale'
  | 'Delivery/Courier Income'
  | 'Digital Service / Top-up'
  | 'Other Income'
  | 'Customer Refund Received'
  | 'Other Business Income';

export type IncomePaymentMethod = 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Other';

export interface Income {
  id: string;
  incomeId: string; // e.g. "INC-20260815-9481"
  category: IncomeCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "04:30 PM"
  paymentMethod: IncomePaymentMethod;
  customerName?: string;
  invoiceNo?: string;
  reference?: string; // Reference / Transaction ID
  notes?: string;
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL' | '';
  addedBy: string;
  createdAt: number;
  source: 'manual' | 'order_sale';
  orderId?: string;
  receiptUrl?: string;
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'PRICE_CHANGE' | 'STOCK_ADJUSTMENT' | 'STATUS_CHANGE';
  targetType: 'Product' | 'Order' | 'Customer' | 'Supplier' | 'User' | 'Expense' | 'Income';
  targetId: string;
  targetName: string;
  details: string;
  userId: string;
  userName: string;
  userRole: string;
  timestamp: number;
}

// ==========================================
// ACCOUNTING & FINANCIAL EQUITY INTERFACES
// ==========================================

export interface InvestmentEntry {
  id: string;
  amount: number;
  date: string;
  note?: string;
  subBrand?: string;
  createdBy?: string;
  createdAt: number;
  isLocked?: boolean;
  source?: string;
}

export interface CompanyPurchase {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  paidVia: string;
  supplier?: string;
  invoiceNo?: string;
  note?: string;
  createdAt: number;
  subBrand?: string;
}

export interface CompanyLoss {
  id: string;
  title: string;
  reason: 'Product Damage' | 'Courier Return Loss' | 'Theft/Missing' | 'Bad Debt' | 'Depreciation' | 'System Error' | 'Other' | string;
  amount: number;
  date: string;
  note?: string;
  recordedBy?: string;
  createdAt: number;
  subBrand?: string;
}

export interface CashBalanceSettings {
  openingBalance: number;
  lastReconciledAmount?: number;
  lastReconciledAt?: number;
  reconciledBy?: string;
  updatedAt: number;
}

export interface AccountingBaselineSettings {
  baselineCash: number;
  baselineInvestment: number;
  cutoffDate: string;
  cutoffTimestamp: number;
  note?: string;
  updatedAt: number;
  updatedBy?: string;
}

export interface CashTransaction {
  id: string;
  type: 'cash_in' | 'cash_out' | 'deposit' | 'withdrawal' | 'adjustment';
  amount: number;
  reason: string;
  date: string;
  timestamp: number;
  note?: string;
  recordedBy?: string;
  subBrand?: string;
}


export interface CashReconciliation {
  id: string;
  systemBalance: number;
  physicalCount: number;
  discrepancy: number;
  notes?: string;
  date: string;
  reconciledBy: string;
  createdAt: number;
}

export interface OtherReceivable {
  id: string;
  borrowerName: string;
  phone?: string;
  type: 'Loan Given' | 'Advance Salary' | 'Security Deposit' | 'Supplier Advance' | 'Other';
  amount: number;
  paidDate: string;
  expectedReturnDate?: string;
  status: 'Pending' | 'Partially Recovered' | 'Recovered' | 'Written Off';
  recoveredAmount: number;
  notes?: string;
  createdAt: number;
}

export interface PaymentPlatformLedger {
  id: string;
  platform: 'bKash Merchant' | 'Nagad Merchant' | 'Rocket' | 'Bank Account' | 'Cash Drawer' | 'POS Card' | string;
  accountNo?: string;
  currentBalance: number;
  pendingSettlement?: number;
  feePercentage?: number;
  lastUpdated: number;
  notes?: string;
  createdAt: number;
}

export interface ImportShippingCost {
  id: string;
  batchOrShipmentNo: string;
  trackingNo?: string;
  carrierOrAgent: string;
  freightCost: number;
  customsTaxCost: number;
  handlingOrClearingCost: number;
  totalCost: number;
  currency?: string;
  exchangeRate?: number;
  shipmentDate: string;
  status: 'In Transit' | 'Customs Cleared' | 'Received' | 'Paid';
  notes?: string;
  createdAt: number;
}

export type AccountCategory = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  subType: string;
  description?: string;
  isSystem?: boolean;
  balance: number;
}

export type VoucherType = 'Receipt' | 'Payment' | 'Journal' | 'Contra' | 'Sales' | 'Purchase';

export interface VoucherEntry {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface AccountingVoucher {
  id: string;
  voucherNo: string;
  voucherType: VoucherType;
  date: string;
  reference?: string;
  entries: VoucherEntry[];
  totalAmount: number;
  notes?: string;
  subBrand?: string;
  createdBy: string;
  createdAt: number;
}

// Accounting & Financial reporting type aliases
export type Investment = InvestmentEntry;
export type PaymentPlatformEntry = PaymentPlatformLedger & { type?: string; amount?: number };
export type ImportShippingRecord = ImportShippingCost & { amount?: number };
export interface StockPurchaseRecord {
  id: string;
  amount: number;
  date?: string;
  supplierId?: string;
  supplierName?: string;
  notes?: string;
  createdAt?: number;
}

// ==========================================
// PRE-ORDER MANAGEMENT SYSTEM TYPES (PART 1 FOUNDATION)
// ==========================================

export type PreOrderPermissionKey =
  | 'preOrderView'
  | 'preOrderCreate'
  | 'preOrderEdit'
  | 'preOrderUpdateStatus'
  | 'preOrderCollectPayment'
  | 'preOrderVerifyPayment'
  | 'preOrderRefund'
  | 'preOrderReceiveStock'
  | 'preOrderConvertSale'
  | 'preOrderManageTracking'
  | 'preOrderSupplier'
  | 'preOrderReports'
  | 'preOrderViewProfit';

export type LegacyRolePermissionKey =
  | 'addProduct'
  | 'editProduct'
  | 'deleteProduct'
  | 'manageCategories'
  | 'stockIn'
  | 'stockOut'
  | 'stockAdjustment'
  | 'manageOrders'
  | 'voidInvoice';

export type AppPermissionKey = LegacyRolePermissionKey | PreOrderPermissionKey;

export type RolePermissionSet = Record<AppPermissionKey, boolean>;

export type RolePermissionsMap = {
  superadmin?: Partial<RolePermissionSet>;
  admin: Partial<RolePermissionSet>;
  manager?: Partial<RolePermissionSet>;
  staff: Partial<RolePermissionSet>;
  [role: string]: Partial<RolePermissionSet> | undefined;
};

export type PreOrderStatus =
  | 'Advance Received'
  | 'Order Confirmed'
  | 'Ordered from China'
  | 'China Warehouse'
  | 'International Shipment'
  | 'Customs Clearance'
  | 'Arrived in Bangladesh'
  | 'Received in Stock'
  | 'Ready for Delivery'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded';

export type PreOrderPaymentType = 'advance' | 'installment' | 'additional' | 'refund' | 'reversal';
export type PreOrderPaymentStatus = 'pending' | 'verified' | 'rejected';
export type PreOrderPaymentMethod = 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank Transfer' | 'Card' | string;

export type PreOrderPaymentState = 'unpaid' | 'partially_paid' | 'fully_paid' | 'refunded';

export interface PreOrder {
  id: string;
  preOrderNumber: string; // e.g. "PO-0001"
  subBrand: 'SAT' | 'GZ' | 'RTX';
  customerId?: string;
  customerCode?: string; // e.g. "CUS-0001"
  customerName: string;
  customerPhone: string;
  customerWhatsapp?: string;
  customerAddress: string;
  salesChannel?: SalesChannel | string;

  // Product / Item details
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

  // Customer-facing financials (non-sensitive cost fields live in preOrders/{id}/private/cost)
  sellingUnitPrice: number;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  totalAmount: number;
  advancePaid: number; // Sum of verified non-refund collections minus reversals
  pendingAmount?: number; // Sum of pending non-refund payments awaiting verification
  refundedAmount: number; // Sum of verified refunds minus refund reversals
  dueAmount: number; // totalAmount - advancePaid + refundedAmount
  paymentCount?: number; // Non-rejected payment ledger entries count
  paymentState?: PreOrderPaymentState;

  // Workflow & Operations
  status: PreOrderStatus;
  orderDate?: string; // YYYY-MM-DD
  supplierId?: string;
  supplierName?: string;
  supplierOrderRef?: string;
  chinaOrderDate?: string;
  shippingMethod?: 'Air' | 'Sea' | 'Express courier' | string;
  freightForwarder?: string;
  forwarderContact?: string;
  courier?: string;
  trackingNumber?: string;
  carrierTrackingUrl?: string;
  trackingToken?: string;
  trackingTokenId?: string;
  trackingEnabled?: boolean;
  trackingCreatedAt?: number;
  trackingCreatedBy?: string;
  trackingLastRegeneratedAt?: number;
  showCourierTrackingToCustomer?: boolean;
  trackingHistory?: PreOrderTrackingHistoryItem[];
  shippedFromChinaAt?: string;
  estimatedDeliveryDate?: string;
  previousEstimatedArrivalDate?: string;
  arrivedBdAt?: string;
  customsStatus?: 'Not started' | 'In progress' | 'Cleared' | 'Held/Issue' | string;
  customsClearanceDate?: string;
  isDelayed?: boolean;

  // Conversion & Stock flags
  stockReceived?: boolean;
  stockReceivedAt?: number;
  stockReceivedQty?: number;
  damagedQty?: number;
  stockReturnedToSupplierQty?: number;
  landedCostTotal?: number;
  unitLandedCost?: number;
  convertedOrderId?: string;
  convertedSaleId?: string;
  convertedInvoiceId?: string;
  convertedInvoiceNumber?: string;
  convertedAt?: number;

  // Cancellation metadata
  isCancelled?: boolean;
  cancellationReason?: string;
  cancelledAt?: number;
  cancelledBy?: string;
  cancellation?: PreOrderCancellationSummary;

  // Idempotency & Audit
  idempotencyKey?: string;
  notes?: string; // Customer-visible order note
  createdBy: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  updatedBy?: string;
}

/**
 * Restricted cost/profit/shipping-expense/internal note subdocument stored at `preOrders/{id}/private/cost`.
 * Read/write restricted exclusively to roles holding `preOrderSupplier` or `preOrderViewProfit`.
 */
export interface PreOrderShippingExpensesBreakdown {
  internationalFreight: number;
  customsDuty: number;
  localTransport: number;
  handlingOther: number;
  paymentMethod?: 'Cash' | 'bKash' | 'Nagad' | 'Rocket' | 'Bank' | 'Card' | string;
  shippingExpenseSeq?: number;
  freightReceiptUrl?: string;
  customsReceiptUrl?: string;
  localReceiptUrl?: string;
  handlingReceiptUrl?: string;
}

export interface PreOrderPrivateCost {
  preOrderId: string;
  chinaUnitCost: number;
  shippingCost: number; // Estimated shipping cost
  actualShippingCost?: number; // Sum of shippingExpenses breakdown
  shippingExpenses?: PreOrderShippingExpensesBreakdown;
  supplierUnitCost?: number;
  expectedProfit: number;
  internalNotes?: string;
  supplierOrderRef?: string;
  updatedAt: number;
  updatedBy: string;
}

export interface PreOrderPayment {
  id: string;
  preOrderId: string;
  preOrderNumber: string;
  subBrand?: 'SAT' | 'GZ' | 'RTX';
  customerName?: string;
  customerPhone?: string;
  type: PreOrderPaymentType;
  amount: number;
  method: PreOrderPaymentMethod;
  referenceNo?: string;
  receiptUrl?: string;
  receivedAt?: number;
  note?: string;
  status: PreOrderPaymentStatus;
  idempotencyKey: string;
  recordedBy: string;
  recordedByName: string;
  createdAt: number;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: number;
  rejectionReason?: string;
  reversesPaymentId?: string;
  reversedPaymentType?: PreOrderPaymentType;
  reversalReason?: string;
  duplicateOverrideReason?: string;
}

export interface PreOrderStatusHistory {
  id: string;
  preOrderId: string;
  fromStatus: PreOrderStatus | null;
  toStatus: PreOrderStatus;
  note?: string;
  publicMessage?: string;
  notifyCustomer?: boolean;
  isBackwardMove?: boolean;
  overrideReason?: string;
  changedBy: string;
  changedByName: string;
  timestamp: number;
}

export type PreOrderShippingMethod = 'Air' | 'Sea' | 'Express courier';
export type PreOrderCustomsStatus = 'Not started' | 'In progress' | 'Cleared' | 'Held/Issue';

export interface PreOrderShipment {
  preOrderId: string;
  supplierOrderRef?: string;
  chinaOrderDate?: string; // YYYY-MM-DD
  shippingMethod?: PreOrderShippingMethod | string;
  chinaCourier?: string;
  chinaTrackingNo?: string;
  freightForwarder?: string;
  forwarderContact?: string;
  bdCourier?: string;
  bdTrackingNo?: string;
  trackingNumber?: string;
  carrierTrackingUrl?: string;
  shippedFromChinaAt?: string; // YYYY-MM-DD
  estimatedArrivalDate?: string; // YYYY-MM-DD
  previousEstimatedArrivalDate?: string; // YYYY-MM-DD
  isDelayed?: boolean;
  arrivedBdAt?: string; // YYYY-MM-DD
  customsStatus?: PreOrderCustomsStatus | string;
  customsClearanceDate?: string; // YYYY-MM-DD
  notes?: string;
  updatedBy: string;
  updatedAt: number;
}

export type PreOrderShipmentDocType =
  | 'invoice'
  | 'packing_list'
  | 'bill_of_lading'
  | 'customs_papers'
  | 'photo'
  | 'other';

export interface PreOrderShipmentDoc {
  id: string;
  preOrderId: string;
  preOrderNumber?: string;
  docType: PreOrderShipmentDocType | string;
  fileName: string;
  fileUrl: string;
  storagePath?: string;
  contentType?: string;
  fileSize?: number;
  note?: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: number;
  isDeleted?: boolean;
  deletedBy?: string;
  deletedByName?: string;
  deletedAt?: number;
  deleteReason?: string;
}

export interface PreOrderShipmentEvent {
  id: string;
  preOrderId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  timestamp: number;
  staffId: string;
  staffName: string;
  text: string;
  showToCustomer: boolean;
  publicMessage?: string;
  source?: 'auto' | 'manual';
  eventType?: 'shipment_update' | 'customer_message_prepared';
}

export interface PreOrderSupplierPaymentAllocation {
  preOrderId: string;
  preOrderNumber: string;
  amountBdt: number;
}

export interface PreOrderSupplierPayment {
  id: string;
  type?: 'payment' | 'reversal';
  preOrderId: string; // First allocated order ID or 'MULTI'
  preOrderNumber: string; // Comma summary or single PO number
  preOrderIds?: string[]; // All linked order IDs for Firestore array-contains queries
  allocations?: PreOrderSupplierPaymentAllocation[];
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
  category?: 'Pre-Order Supplier Payment' | string;
  idempotencyKey: string;
  date: string; // YYYY-MM-DD
  recordedBy: string;
  recordedByName: string;
  createdAt: number;
  reversesPaymentId?: string;
  reversalReason?: string;
}

export interface PreOrderTrackingHistoryItem {
  action: 'created' | 'regenerated' | 'disabled' | 'enabled' | 'expired';
  timestamp: number;
  actorId: string;
  actorName: string;
  reason?: string;
}

export interface PublicTrackingTimelineItem {
  status: PreOrderStatus;
  timestamp: number;
  publicMessage?: string;
}

export interface PublicTrackingShipmentEvent {
  date: string;
  time?: string;
  timestamp: number;
  message: string;
}

export interface PublicTrackingPaymentItem {
  date: number; // verified or received timestamp (ms)
  amount: number;
  type: 'advance' | 'installment' | 'additional' | 'refund';
  method: string;
}

export interface PublicTrackingSupportContact {
  phone?: string;
  whatsapp?: string;
  email?: string;
}

/**
 * STRICT WHITELIST-ONLY schema stored at `publicTracking/{token}`.
 * Never store full customer name, phone, masked phone, address, email, customerId,
 * preOrderId, supplierId/name, China cost, profit, internal notes, receipt URLs,
 * transaction reference IDs, or staff names.
 */
export interface PublicTrackingRecord {
  enabled: boolean;
  preOrderNo?: string; // Shown as "Order ID"
  subBrand?: 'SAT' | 'GZ' | 'RTX';
  brandName?: string;
  brandLogoUrl?: string;
  productName?: string;
  productImageUrl?: string;
  variant?: string;
  color?: string;
  model?: string;
  qty?: number;
  status?: PreOrderStatus;
  statusHistory?: PublicTrackingTimelineItem[];
  shipmentEvents?: PublicTrackingShipmentEvent[];
  estimatedArrivalDate?: string;
  totalAmount?: number;
  advancePaid?: number; // Verified only
  dueAmount?: number;
  refundedAmount?: number;
  paymentHistory?: PublicTrackingPaymentItem[]; // Verified entries only
  publicNote?: string;
  supportContact?: PublicTrackingSupportContact;
  customerFirstName?: string; // First name only
  courier?: string; // Included ONLY when showCourierTrackingToCustomer === true
  trackingNumber?: string; // Included ONLY when showCourierTrackingToCustomer === true
  carrierTrackingUrl?: string; // Included ONLY when showCourierTrackingToCustomer === true
  updatedAt: number;
}

export type PreOrderAuditAction =
  | 'PREORDER_CREATED'
  | 'PREORDER_UPDATED'
  | 'PRIVATE_COST_UPDATED'
  | 'STATUS_CHANGED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_REVERSED'
  | 'REFUND_RECORDED'
  | 'LEDGER_RECALCULATED'
  | 'SHIPMENT_UPDATED'
  | 'SHIPMENT_DOC_UPLOADED'
  | 'SHIPMENT_DOC_DELETED'
  | 'SHIPMENT_EVENT_ADDED'
  | 'SUPPLIER_PAYMENT_RECORDED'
  | 'SUPPLIER_PAYMENT_REVERSED'
  | 'TRACKING_LINK_GENERATED'
  | 'TRACKING_LINK_REGENERATED'
  | 'TRACKING_LINK_DISABLED'
  | 'TRACKING_LINK_ENABLED'
  | 'TRACKING_LINK_SYNCED'
  | 'TRACKING_LINK_EXPIRED'
  | 'STOCK_RECEIVED'
  | 'CONVERTED_TO_SALE'
  | 'CANCEL_RECONCILED'
  | 'CUSTOMER_MESSAGE_PREPARED'
  | 'STATS_REBUILT';

export interface PreOrderAuditEntry {
  id: string;
  preOrderId: string;
  preOrderNumber: string;
  action: PreOrderAuditAction;
  summary: string;
  metadata?: Record<string, any>;
  userId: string;
  userName: string;
  userRole: string;
  timestamp: number;
}

export type PreOrderNotificationType =
  | 'payment_pending'
  | 'advance_received'
  | 'payment_verified'
  | 'payment_rejected'
  | 'order_confirmed'
  | 'status_update'
  | 'shipment_updated'
  | 'shipment_delayed'
  | 'arrival_alert'
  | 'arrival_soon'
  | 'arrival_today'
  | 'product_arrived'
  | 'stock_received'
  | 'due_payment_reminder'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refund_alert'
  | 'refund_recorded'
  | 'link_sync_failed'
  | 'general';

export interface PreOrderNotification {
  id: string;
  preOrderId: string;
  preOrderNumber: string;
  subBrand?: 'SAT' | 'GZ' | 'RTX';
  type: PreOrderNotificationType;
  category?: 'event' | 'reminder';
  severity?: 'info' | 'warning' | 'urgent';
  title: string;
  message: string;
  targetTab: string;
  forRoles?: string[];
  forUserIds?: string[];
  readBy: string[];
  snoozedUntilBy?: Record<string, number>;
  dayKey?: string;
  reminderType?: string;
  customerPhone?: string;
  customerName?: string;
  dueAmount?: number;
  estimatedArrivalDate?: string;
  preOrderStatus?: PreOrderStatus;
  createdAt: number;
  createdBy: string;
}

export interface PreOrderReceipt {
  id: string;
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  receivedQty: number;
  damagedQty: number;
  productId: string;
  productName: string;
  variantId: string;
  variantLabel: string;
  chinaUnitCost: number;
  shippingCostPerUnit: number;
  shippingCostPortion: number;
  unitLandedCost: number;
  totalGoodLandedCost: number;
  damagedCostLoss: number;
  damagedLossId?: string;
  damagedLossPending?: boolean;
  note?: string;
  idempotencyKey: string;
  receivedBy: string;
  receivedByName: string;
  receivedAt: number;
}

export type AccountingPostingType =
  | 'advance_verified'
  | 'supplier_payment'
  | 'shipping_expense'
  | 'inventory_received'
  | 'convert_to_sale'
  | 'customer_refund'
  | 'cancel_charge'
  | 'supplier_refund_receivable'
  | 'supplier_loss'
  | 'stock_released'
  | 'stock_returned_supplier'
  | 'reversal';

export interface AccountingPosting {
  id: string; // Deterministic ID: po_{preOrderId}_...
  preOrderId: string;
  preOrderNumber: string;
  subBrand: 'SAT' | 'GZ' | 'RTX';
  type: AccountingPostingType;
  direction?: 'normal' | 'reversal';
  reversesPostingId?: string;
  sourceDocId?: string;
  method?: string;
  isCashDrawer?: boolean;
  cashDelta: number;
  bankMfsDelta: number;
  customerAdvanceDelta: number;
  inventoryInTransitDelta: number;
  inventoryStockDelta: number;
  salesIncomeDelta: number;
  cogsDelta: number;
  profitDelta: number;
  otherIncomeDelta: number;
  receivableDelta: number;
  lossDelta: number;
  note?: string;
  actorId: string;
  actorName: string;
  timestamp: number;
}

export interface PreOrderConversionLock {
  preOrderId: string;
  preOrderNumber: string;
  orderId: string;
  invoiceId: string;
  invoiceNumber: string;
  convertedAt: number;
  convertedBy: string;
}

export type CancelCustomerResolution = 'full_refund' | 'partial_refund' | 'no_refund' | 'none';
export type CancelSupplierResolution = 'receivable' | 'loss' | 'keep_stock' | 'none';
export type CancelStockResolution = 'release_normal' | 'return_supplier' | 'none';

export interface PreOrderCancellationSummary {
  reason: string;
  customerResolution: CancelCustomerResolution;
  customerRefundAmount: number;
  customerRefundMethod?: string;
  customerRefundPaymentId?: string;
  retainedChargeAmount: number;
  retainedChargeReason?: string;
  supplierResolution: CancelSupplierResolution;
  supplierSettledAmount: number;
  supplierReceivableId?: string;
  supplierLossId?: string;
  stockResolution: CancelStockResolution;
  releasedOrReturnedQty: number;
  cancelledBy: string;
  cancelledByName: string;
  cancelledAt: number;
}

export interface PreOrderIntegrityIssue {
  preOrderId: string;
  preOrderNumber: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  expected?: number | string;
  actual?: number | string;
}

export interface PreOrderIntegrityReport {
  checkedCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: PreOrderIntegrityIssue[];
  checkedAt: number;
}

export interface PreOrderStatsSubBrandBucket {
  count: number;
  totalAmount: number;
  advancePaid: number;
  dueAmount: number;
}

export interface PreOrderStats {
  id: string; // 'summary'
  totalOrders: number;
  activeOrders: number;
  chinaOrders: number;
  internationalShipments: number;
  customsClearance: number;
  arrivedProducts: number;
  receivedInStock: number;
  readyForDelivery: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
  convertedOrders: number;
  overdueOrders: number;
  totalOrderValue: number;
  totalAdvanceCollected: number;
  totalCustomerDue: number;
  totalRefunded: number;
  pendingPaymentAmount: number;
  pendingPaymentCount: number;
  customerAdvancesLiability: number;
  supplierPayableEstimate: number;
  statusCounts: Record<PreOrderStatus, number>;
  subBrandStats: Record<'SAT' | 'GZ' | 'RTX', PreOrderStatsSubBrandBucket>;
  lastUpdatedAt: number;
  lastRebuiltAt?: number;
  rebuiltBy?: string;
}

export interface PreOrderStatsRebuildDiff {
  field: string;
  label: string;
  before: number;
  after: number;
  diff: number;
}

export type PreOrderMessageTemplateKey =
  | 'advance_received'
  | 'order_confirmed'
  | 'shipment_update'
  | 'product_arrived'
  | 'due_payment_reminder'
  | 'ready_for_delivery'
  | 'delivery_confirmation'
  | 'delay_notice';

export interface BilingualMessageTemplate {
  label: string;
  en: string;
  bn: string;
}

export type PreOrderMessageTemplatesMap = Record<PreOrderMessageTemplateKey, BilingualMessageTemplate>;

export interface PreOrderSettings {
  id: string; // 'preOrderSettings'
  enableArrivalSoonReminder: boolean;
  enableArrivalTodayReminder: boolean;
  enableDelayReminder: boolean;
  enableDueReminder: boolean;
  enableReadyDeliveryReminder: boolean;
  arrivalReminderDays: number; // default 3
  dueReminderDays: number; // default 7
  delayGraceDays: number; // default 0
  readyWaitingDays: number; // default 2
  receivedNotConvertedDays: number; // default 3 (Needs Attention N days)
  messageTemplates: PreOrderMessageTemplatesMap;
  updatedAt: number;
  updatedBy?: string;
}

export interface PreOrderListFilterPreset {
  statuses?: PreOrderStatus[];
  subBrand?: 'ALL' | 'SAT' | 'GZ' | 'RTX';
  paymentState?: 'ALL' | PreOrderPaymentState;
  overdueOnly?: boolean;
  searchTerm?: string;
  label?: string;
}

