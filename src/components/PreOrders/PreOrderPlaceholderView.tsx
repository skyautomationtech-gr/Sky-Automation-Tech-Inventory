import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  Wallet,
  Plane,
  Link2,
  Building2,
  BarChart3,
  ShieldAlert,
  ArrowLeft,
  PackagePlus,
} from 'lucide-react';
import { Card, EmptyState, Button } from '../../design-system';
import { RolePermissionsMap, UserProfile } from '../../types';
import {
  PRE_ORDER_NAV_ITEMS,
  PreOrderTabId,
  hasPermission,
} from '../../preOrders/constants';

interface PreOrderPlaceholderViewProps {
  tab: PreOrderTabId;
  user: UserProfile | null;
  rolePermissions: RolePermissionsMap | null;
  onNavigate: (tab: string) => void;
}

const TAB_ICON_MAP: Record<PreOrderTabId, React.ComponentType<{ size?: number; className?: string }>> = {
  preorder_overview: LayoutDashboard,
  preorder_create: PlusCircle,
  preorder_list: ClipboardList,
  preorder_payments: Wallet,
  preorder_tracking: Plane,
  preorder_links: Link2,
  preorder_suppliers: Building2,
  preorder_reports: BarChart3,
};

export const PreOrderPlaceholderView: React.FC<PreOrderPlaceholderViewProps> = ({
  tab,
  user,
  rolePermissions,
  onNavigate,
}) => {
  const meta =
    PRE_ORDER_NAV_ITEMS.find((item) => item.id === tab) || PRE_ORDER_NAV_ITEMS[0];
  const Icon = TAB_ICON_MAP[meta.id] || PackagePlus;

  const canViewModule = hasPermission(user, rolePermissions, 'preOrderView');
  const canViewScreen =
    canViewModule && hasPermission(user, rolePermissions, meta.requiredPermission);

  if (!canViewScreen) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <Card variant="flat" padding="lg">
          <EmptyState
            icon={<ShieldAlert size={24} className="text-red-500" />}
            title="Access Restricted"
            description="Your current role or permission profile does not grant access to this Pre-Order screen. Contact a Super Admin to adjust Staff Permissions."
            action={
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<ArrowLeft size={14} />}
                onClick={() => onNavigate('dashboard')}
              >
                Return to Dashboard
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <Card
        variant="flat"
        padding="lg"
        header={
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] flex items-center justify-center shrink-0">
              <Icon size={18} />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {meta.label}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pre-Order Management · China-to-Bangladesh Import Operations
              </p>
            </div>
          </div>
        }
      >
        <EmptyState
          icon={<Icon size={24} />}
          title={`No ${meta.label} records yet`}
          description={`${meta.description} Core data models, status rules, sequential PO counters, and Firestore security rules are ready.`}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {tab !== 'preorder_overview' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigate('preorder_overview')}
                >
                  Pre-Order Overview
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<ArrowLeft size={14} />}
                onClick={() => onNavigate('dashboard')}
              >
                Back to Dashboard
              </Button>
            </div>
          }
        />
      </Card>
    </div>
  );
};

export default PreOrderPlaceholderView;
