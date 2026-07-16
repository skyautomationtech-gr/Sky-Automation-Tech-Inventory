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
  category: string;
  subCategory?: string;
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
}

export type StockLogType = 'in' | 'out' | 'adjustment';

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
}

export interface Category {
  id: string;
  name: string;
  subCategories: string[];
}

export interface Brand {
  id: string;
  name: string;
}

export interface CompanySettings {
  companyName: string;
  logoUrl?: string;
  prefixes: {
    SAT: string; // default: SAT-INV
    GZ: string;  // default: GZ-INV
    RTX: string; // default: RTX-INV
  };
  onboarded: boolean;
}
