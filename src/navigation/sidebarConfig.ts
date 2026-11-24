import React from 'react';
import {
  LayoutDashboard,
  Package,
  PackagePlus,
  ShoppingBag,
  Users,
  DollarSign,
  Activity,
  Settings,
} from 'lucide-react';
import { RolePermissionsMap, UserProfile } from '../types';
import { PRE_ORDER_NAV_ITEMS, hasPermission } from '../preOrders/constants';

export interface SidebarBadgeCounts {
  outOfStockCount?: number;
  archiveCount?: number;
  pendingProductsCount?: number;
  deletionRequestsCount?: number;
  pendingPreOrderVerificationsCount?: number;
  pendingUsersCount?: number;
}

export interface SidebarSubItem {
  id: string;
  label: string;
  tab: string;
  subAction?: string;
  badgeCount?: number;
  badgeTone?: 'danger' | 'amber' | 'neutral';
  keywords?: string;
}

export interface SidebarGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Single top-level route without expandable children (e.g. Dashboard) */
  singleTab?: string;
  badgeText?: string;
  badgeTone?: 'green';
  items: SidebarSubItem[];
}

export function normalizeDefaultSubAction(tab: string, subAction?: string): string | undefined {
  if (tab === 'products') {
    if (
      subAction === 'catalog' ||
      subAction === 'categories' ||
      subAction === 'brands' ||
      subAction === 'attributes' ||
      subAction === 'out_of_stock' ||
      subAction === 'pending' ||
      subAction === 'archive' ||
      subAction === 'deletion_requests'
    ) {
      return subAction;
    }
    return 'catalog';
  }
  if (tab === 'stock') {
    if (subAction === 'in' || subAction === 'out' || subAction === 'adjust' || subAction === 'ledger') {
      return subAction;
    }
    return 'ledger';
  }
  if (tab === 'orders') {
    if (subAction === 'create' || subAction === 'new') return 'create';
    return 'list';
  }
  if (tab === 'users') {
    if (subAction === 'pending' || subAction === 'permissions' || subAction === 'registry') {
      return subAction;
    }
    return 'registry';
  }
  if (tab === 'accounting') {
    if (
      subAction === 'overview' ||
      subAction === 'investments' ||
      subAction === 'purchases' ||
      subAction === 'losses' ||
      subAction === 'loss_orders' ||
      subAction === 'platforms' ||
      subAction === 'receivables' ||
      subAction === 'expenses'
    ) {
      return subAction;
    }
    return 'overview';
  }
  if (tab === 'financials') {
    if (subAction === 'income' || subAction === 'expenses' || subAction === 'expense') {
      return subAction === 'expense' ? 'expenses' : subAction;
    }
    return 'overview';
  }
  if (tab === 'reports') {
    if (
      subAction === 'sales' ||
      subAction === 'profit_loss' ||
      subAction === 'products_rank' ||
      subAction === 'subbrand_comp' ||
      subAction === 'channels'
    ) {
      return subAction;
    }
    return 'sales';
  }
  return subAction;
}

export function buildSidebarGroups({
  user,
  rolePermissions = null,
  badges = {},
}: {
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  badges?: SidebarBadgeCounts;
}): SidebarGroup[] {
  const isStaff = user?.role === 'staff';
  const isSuperAdmin = user?.role === 'superadmin';
  const isPrivileged = isSuperAdmin || user?.role === 'admin';
  const canViewPreOrders = hasPermission(user, rolePermissions, 'preOrderView');

  const visiblePreOrderSubItems = canViewPreOrders
    ? PRE_ORDER_NAV_ITEMS.filter((item) =>
        hasPermission(user, rolePermissions, item.requiredPermission)
      )
    : [];

  const groups: SidebarGroup[] = [
    {
      id: 'dashboard',
      title: 'Dashboard',
      icon: LayoutDashboard,
      singleTab: 'dashboard',
      items: [],
    },
    {
      id: 'inventory',
      title: 'Inventory',
      icon: Package,
      items: [
        {
          id: 'inventory_catalog',
          label: 'Products & Stock',
          tab: 'products',
          subAction: 'catalog',
          keywords: 'products catalog sku items stock',
        },
        {
          id: 'inventory_categories',
          label: 'Categories',
          tab: 'products',
          subAction: 'categories',
          keywords: 'categories crud taxonomy',
        },
        {
          id: 'inventory_brands',
          label: 'Brands',
          tab: 'products',
          subAction: 'brands',
          keywords: 'brands logos crud',
        },
        ...(!isStaff
          ? [
              {
                id: 'inventory_attributes',
                label: 'Attributes',
                tab: 'products',
                subAction: 'attributes',
                keywords: 'colors models attributes variants',
              },
            ]
          : []),
        {
          id: 'inventory_stock_in',
          label: 'Stock In',
          tab: 'stock',
          subAction: 'in',
          keywords: 'stock in receive purchase inventory',
        },
        {
          id: 'inventory_stock_out',
          label: 'Stock Out',
          tab: 'stock',
          subAction: 'out',
          keywords: 'stock out dispatch damage',
        },
        {
          id: 'inventory_stock_adjust',
          label: 'Stock Adjustment',
          tab: 'stock',
          subAction: 'adjust',
          keywords: 'stock adjustment audit reconciliation',
        },
        {
          id: 'inventory_stock_ledger',
          label: 'Master Stock Ledger',
          tab: 'stock',
          subAction: 'ledger',
          keywords: 'stock operations ledger history',
        },
        {
          id: 'inventory_out_of_stock',
          label: 'Out of Stock',
          tab: 'products',
          subAction: 'out_of_stock',
          badgeCount: badges.outOfStockCount,
          badgeTone: 'danger',
          keywords: 'out of stock empty zero reorder',
        },
        {
          id: 'inventory_archive',
          label: 'Archive',
          tab: 'products',
          subAction: 'archive',
          badgeCount: badges.archiveCount,
          badgeTone: 'neutral',
          keywords: 'archived products hidden',
        },
        ...(!isStaff
          ? [
              {
                id: 'inventory_pending',
                label: 'Pending Approvals',
                tab: 'products',
                subAction: 'pending',
                badgeCount: badges.pendingProductsCount,
                badgeTone: 'danger' as const,
                keywords: 'pending products review approval',
              },
            ]
          : []),
        ...(isSuperAdmin
          ? [
              {
                id: 'inventory_deletion_requests',
                label: 'Deletion Requests',
                tab: 'products',
                subAction: 'deletion_requests',
                badgeCount: badges.deletionRequestsCount,
                badgeTone: 'danger' as const,
                keywords: 'deletion requests remove products',
              },
            ]
          : []),
      ],
    },
    ...(visiblePreOrderSubItems.length > 0
      ? [
          {
            id: 'preorder',
            title: 'Pre-Order Management',
            icon: PackagePlus,
            badgeText: 'New',
            badgeTone: 'green' as const,
            items: visiblePreOrderSubItems.map((sub) => ({
              id: sub.id,
              label: sub.label,
              tab: sub.id,
              badgeCount:
                sub.id === 'preorder_payments'
                  ? badges.pendingPreOrderVerificationsCount
                  : undefined,
              badgeTone: 'amber' as const,
              keywords: `pre-order preorder ${sub.label}`,
            })),
          },
        ]
      : []),
    {
      id: 'sales',
      title: 'Sales',
      icon: ShoppingBag,
      items: [
        {
          id: 'sales_order_desk',
          label: 'Order Desk',
          tab: 'orders',
          subAction: 'create',
          keywords: 'order desk create new sales order',
        },
        {
          id: 'sales_orders',
          label: 'Orders',
          tab: 'orders',
          subAction: 'list',
          keywords: 'orders list courier fulfillment',
        },
        {
          id: 'sales_invoices',
          label: 'Invoices',
          tab: 'invoices',
          keywords: 'invoices billing pdf receipts',
        },
        {
          id: 'sales_receivables',
          label: 'Due Payments',
          tab: 'receivables',
          keywords: 'due payments receivables collection',
        },
      ],
    },
    {
      id: 'crm',
      title: 'People & CRM',
      icon: Users,
      items: [
        {
          id: 'crm_customers',
          label: 'Customer Directory',
          tab: 'customers',
          keywords: 'customers crm buyers directory',
        },
        {
          id: 'crm_suppliers',
          label: 'Supplier Directory',
          tab: 'suppliers',
          keywords: 'suppliers vendors procurement',
        },
        ...(isSuperAdmin
          ? [
              {
                id: 'crm_attendance',
                label: 'Attendance Log',
                tab: 'attendance',
                keywords: 'attendance check in out staff shift',
              },
              {
                id: 'crm_permissions',
                label: 'Staff Permissions',
                tab: 'users',
                subAction: 'permissions',
                keywords: 'role permissions matrix pre-order access',
              },
            ]
          : []),
        ...(isPrivileged
          ? [
              {
                id: 'crm_users',
                label: 'User Management',
                tab: 'users',
                subAction: 'registry',
                keywords: 'users staff registry accounts',
              },
            ]
          : []),
        ...(isSuperAdmin
          ? [
              {
                id: 'crm_pending_users',
                label: 'Sign-up Approvals',
                tab: 'users',
                subAction: 'pending',
                badgeCount: badges.pendingUsersCount,
                badgeTone: 'amber' as const,
                keywords: 'pending users signup approvals registration',
              },
            ]
          : []),
      ],
    },
    ...(isSuperAdmin
      ? [
          {
            id: 'finance',
            title: 'Finance',
            icon: DollarSign,
            items: [
              {
                id: 'finance_income_expense',
                label: 'Income & Expense',
                tab: 'financials',
                keywords: 'financials income expense profit ledger',
              },
              {
                id: 'finance_acc_overview',
                label: 'Accounting: Overview',
                tab: 'accounting',
                subAction: 'overview',
                keywords: 'accounting desk cash p&l overview',
              },
              {
                id: 'finance_acc_investments',
                label: 'Accounting: Investments',
                tab: 'accounting',
                subAction: 'investments',
                keywords: 'accounting capital investments equity',
              },
              {
                id: 'finance_acc_purchases',
                label: 'Accounting: Purchases',
                tab: 'accounting',
                subAction: 'purchases',
                keywords: 'accounting company assets purchases',
              },
              {
                id: 'finance_acc_losses',
                label: 'Accounting: Company Losses',
                tab: 'accounting',
                subAction: 'losses',
                keywords: 'accounting company losses damage',
              },
              {
                id: 'finance_acc_loss_orders',
                label: 'Accounting: Loss Orders',
                tab: 'accounting',
                subAction: 'loss_orders',
                keywords: 'accounting loss making orders',
              },
              {
                id: 'finance_acc_platforms',
                label: 'Accounting: Payment Platform',
                tab: 'accounting',
                subAction: 'platforms',
                keywords: 'accounting payment gateway bkash nagad ssl',
              },
              {
                id: 'finance_acc_receivables',
                label: 'Accounting: Receivables',
                tab: 'accounting',
                subAction: 'receivables',
                keywords: 'accounting other receivables advances',
              },
              {
                id: 'finance_acc_expenses',
                label: 'Accounting: Expenses',
                tab: 'accounting',
                subAction: 'expenses',
                keywords: 'accounting daily expenses',
              },
              {
                id: 'finance_reports',
                label: 'Reports & Analytics',
                tab: 'reports',
                keywords: 'reports analytics sales profit sub-brand channels',
              },
            ],
          },
          {
            id: 'intelligence',
            title: 'Intelligence & Audit',
            icon: Activity,
            items: [
              {
                id: 'intel_audit_logs',
                label: 'Audit Logs',
                tab: 'audit_logs',
                keywords: 'audit logs security history activity',
              },
            ],
          },
        ]
      : []),
    {
      id: 'administration',
      title: 'Administration',
      icon: Settings,
      items: [
        ...(isSuperAdmin
          ? [
              {
                id: 'admin_company_settings',
                label: 'Company Settings',
                tab: 'settings',
                keywords: 'company settings brand logo invoice integrations',
              },
            ]
          : []),
        {
          id: 'admin_profile_settings',
          label: 'Profile Settings',
          tab: 'profile',
          keywords: 'profile account password security notifications',
        },
      ],
    },
  ];

  return groups.filter((group) => Boolean(group.singleTab) || group.items.length > 0);
}

export function isSidebarSubItemActive(
  item: SidebarSubItem,
  currentTab: string,
  currentSubAction?: string
): boolean {
  if (item.tab !== currentTab) return false;
  if (!item.subAction) return true;
  const normalized = normalizeDefaultSubAction(currentTab, currentSubAction);
  return normalized === item.subAction;
}

export function findActiveNavigationMatch(
  groups: SidebarGroup[],
  currentTab: string,
  currentSubAction?: string
): { group: SidebarGroup; subItem?: SidebarSubItem } | null {
  for (const group of groups) {
    if (group.singleTab && group.singleTab === currentTab) {
      return { group };
    }
    for (const subItem of group.items) {
      if (isSidebarSubItemActive(subItem, currentTab, currentSubAction)) {
        return { group, subItem };
      }
    }
  }
  return null;
}
