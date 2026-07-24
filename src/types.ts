export type UserRole = 'superadmin' | 'admin' | 'staff';

export interface PermissionOverrides {
  [key: string]: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  role: UserRole;
  subBrandAccess: string[]; // ['SAT', 'GZ', 'RTX'] etc
  onboardingCompleted?: boolean;
  createdBy?: string;
  active?: boolean;
  createdAt?: number;
  
  // Signup Approval Workflow
  status?: 'pending_approval' | 'approved' | 'rejected';
  requestedRole?: 'staff' | 'admin';
  requestedSubBrandAccess?: string[];

  // Employment Info (Public part)
  designation?: string;
  joiningDate?: string;
  nidNumber?: string;
  address?: string;

  // Account Setup
  requirePasswordChange?: boolean;
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
  category: string; // for backward compatibility/displays
  mainCategory?: string; // name/id of 3-level main category
  subCategory?: string; // name/id of 3-level sub category
  childCategory?: string; // name/id of 3-level child category
  brand: string;
  subBrand: 'SAT' | 'GZ' | 'RTX'; // Sky Automation Tech, GadgetZu, RTX Gadget
  costPrice: number;
  sellingPrice: number;
  reorderThreshold: number;
  images: string[]; // Base64 or Object URL or Storage paths
  variants: Variant[];
  archived: boolean;
  createdAt: number;
  barcodeValue?: string;
  status?: 'pending_review' | 'approved' | 'rejected';
  stockStatus?: 'in_stock' | 'out_of_stock';
  rejectionReason?: string;
  deletionStatus?: 'pending_approval' | null;
  deletionRequestedBy?: string;
  deletionRequestedAt?: number;
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
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  subBrand?: 'SAT' | 'GZ' | 'RTX' | 'ALL' | '';
  totalPurchases: number;
  totalPaid: number;
  outstandingDue: number;
  createdAt: number;
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

export type ExpenseCategory = 'Rent' | 'Salary' | 'Utility Bill' | 'Marketing' | 'Courier/Delivery Charge' | 'Office Supplies' | 'Maintenance' | 'Other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // YYYY-MM-DD
  subBrand?: 'SAT' | 'GZ' | 'RTX' | '';
  notes?: string;
  receiptUrl?: string;
  createdBy: string;
  createdAt: number;
}

