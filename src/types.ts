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
  dateOfBirth?: string;
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
  customPassword?: string;
  permissionOverrides?: PermissionOverrides;

  // Attendance
  currentSessionStatus?: 'checked_in' | 'checked_out';
  currentSessionId?: string | null;
  currentSessionDate?: string | null;
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

export interface Variant {
  id: string;
  color: string;
  model: string;
  stock: number;
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
  email?: string;
  logoUrl?: string;
  invoiceTerms?: string;
  tagline?: string;
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
  address?: string;
  subBrand?: string;
  notes?: string;
  totalOrders: number;
  lifetimeValue: number;
  createdAt: number;
}

export type SalesChannel = 'Facebook' | 'TikTok' | 'Instagram' | 'Daraz' | 'CartUp' | 'Packly' | 'Direct/WhatsApp';
export type CourierName = 'Steadfast (Outside Dhaka)' | 'CarryBee (Inside Dhaka)';
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

