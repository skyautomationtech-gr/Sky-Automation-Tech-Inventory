import React from 'react';
import {
  ChevronRight,
  Home,
  LayoutDashboard,
  Package,
  PackagePlus,
  PlusCircle,
  ClipboardList,
  Wallet,
  Plane,
  Link2,
  Building2,
  ArrowUpDown,
  ShoppingBag,
  Receipt,
  Coins,
  Calculator,
  Truck,
  BarChart3,
  Activity,
  DollarSign,
  Contact,
  Users,
  ShieldCheck,
  Settings,
  User,
  Bell,
  HelpCircle,
} from 'lucide-react';

interface BreadcrumbsProps {
  currentTab: string;
  onNavigate?: (tab: string) => void;
  className?: string;
}

interface TabMeta {
  group: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

export const TAB_DIRECTORY: Record<string, TabMeta> = {
  dashboard: { group: 'Overview', label: 'Dashboard', icon: LayoutDashboard },
  products: { group: 'Operations', label: 'Products & Brands', icon: Package },
  preorder_overview: { group: 'Pre-Order Management', label: 'Overview Dashboard', icon: PackagePlus },
  preorder_create: { group: 'Pre-Order Management', label: 'Create Pre-Order', icon: PlusCircle },
  preorder_list: { group: 'Pre-Order Management', label: 'All Pre-Orders', icon: ClipboardList },
  preorder_payments: { group: 'Pre-Order Management', label: 'Payment Management', icon: Wallet },
  preorder_tracking: { group: 'Pre-Order Management', label: 'Shipment Tracking', icon: Plane },
  preorder_links: { group: 'Pre-Order Management', label: 'Customer Tracking Links', icon: Link2 },
  preorder_suppliers: { group: 'Pre-Order Management', label: 'Supplier Management', icon: Building2 },
  preorder_reminders: { group: 'Pre-Order Management', label: 'Notifications & Reminders', icon: Bell },
  preorder_reports: { group: 'Pre-Order Management', label: 'Reports & History', icon: BarChart3 },
  preorder_help: { group: 'Pre-Order Management', label: 'Help & Guide', icon: HelpCircle },
  stock: { group: 'Operations', label: 'Stock Operations', icon: ArrowUpDown },
  orders: { group: 'Sales Desk', label: 'Order Desk', icon: ShoppingBag },
  invoices: { group: 'Sales Desk', label: 'Invoice Desk', icon: Receipt },
  receivables: { group: 'Sales Desk', label: 'Due Payments', icon: Coins },
  accounting: { group: 'Financials', label: 'Accounting Desk', icon: Calculator },
  financials: { group: 'Financials', label: 'Income & Expense', icon: DollarSign },
  suppliers: { group: 'Operations', label: 'Supplier Directory', icon: Truck },
  reports: { group: 'Analytics', label: 'Reports & Analytics', icon: BarChart3 },
  audit_logs: { group: 'Security', label: 'Audit Logs', icon: Activity },
  customers: { group: 'People & CRM', label: 'Customer Directory', icon: Contact },
  attendance: { group: 'People & CRM', label: 'Attendance Log', icon: Users },
  users: { group: 'Administration', label: 'Staff Permissions', icon: ShieldCheck },
  settings: { group: 'Administration', label: 'Company Settings', icon: Settings },
  profile: { group: 'Administration', label: 'Profile Settings', icon: User },
};

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({ currentTab, onNavigate, className = '' }) => {
  const meta = TAB_DIRECTORY[currentTab] || {
    group: 'Platform',
    label: currentTab.replace(/_/g, ' '),
    icon: LayoutDashboard,
  };

  const CurrentIcon = meta.icon;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium ${className}`}
    >
      <button
        type="button"
        onClick={() => onNavigate && onNavigate('dashboard')}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer group"
        title="Go to Dashboard"
      >
        <Home size={13} className="text-slate-400 group-hover:text-brand-gold transition-colors" />
        <span className="hidden sm:inline">Home</span>
      </button>

      <ChevronRight size={13} className="text-slate-300 dark:text-slate-600 shrink-0" />

      <span className="text-slate-400 dark:text-slate-500 truncate max-w-[140px] sm:max-w-none">
        {meta.group}
      </span>

      <ChevronRight size={13} className="text-slate-300 dark:text-slate-600 shrink-0" />

      <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
        <CurrentIcon size={13} className="text-brand-gold shrink-0" />
        <span className="truncate max-w-[180px] sm:max-w-none">{meta.label}</span>
      </div>
    </nav>
  );
};
