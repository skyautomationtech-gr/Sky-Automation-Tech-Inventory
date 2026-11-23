import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  ShoppingBag,
  Clock,
  UserCheck,
  ExternalLink,
  Plane,
} from 'lucide-react';
import {
  AppNotification,
  PreOrderNotification,
  Product,
  RolePermissionsMap,
  UserProfile,
} from '../types';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getProducts,
  getAllUsers,
} from '../firebase/db';
import {
  actorFromUser,
  markAllPreOrderNotificationsRead,
  queryPreOrderNotifications,
  syncDailyTimeBasedReminders,
} from '../firebase/preOrderDb';
import { hasPermission } from '../preOrders/constants';
import { auth } from '../firebase/config';

interface NotificationCenterProps {
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  products?: Product[];
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
}

interface UnifiedNotificationItem {
  id: string;
  source: 'erp' | 'preorder';
  type: string;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  targetScreen?: string;
  preOrderId?: string;
  subBrand?: 'SAT' | 'GZ' | 'RTX';
  severity?: 'info' | 'warning' | 'urgent';
}

export default function NotificationCenter({
  user,
  rolePermissions = null,
  products: propProducts,
  onNavigate,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<UnifiedNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const canViewPreOrders = hasPermission(user, rolePermissions, 'preOrderView');

  const allowedSubBrands = useMemo<Array<'SAT' | 'GZ' | 'RTX'>>(() => {
    if (!user) return ['SAT', 'GZ', 'RTX'];
    const isSuper = user.role === 'superadmin' || (user.role as string) === 'super_admin';
    if (isSuper || !user.subBrandAccess || user.subBrandAccess.length === 0) {
      return ['SAT', 'GZ', 'RTX'];
    }
    const valid = user.subBrandAccess.filter(
      (b): b is 'SAT' | 'GZ' | 'RTX' => b === 'SAT' || b === 'GZ' || b === 'RTX'
    );
    return valid.length > 0 ? valid : ['SAT'];
  }, [user]);

  const fetchAndCompileNotifications = useCallback(async () => {
    if (!auth?.currentUser || !user) return;
    setLoading(true);
    try {
      // Trigger non-blocking daily/session reminder check if user has Pre-Order access
      if (canViewPreOrders) {
        syncDailyTimeBasedReminders({
          actor: actorFromUser(user),
          allowedSubBrands,
        }).catch(() => {});
      }

      const [dbNotifs, poNotifsRes] = await Promise.all([
        getNotifications().catch(() => [] as AppNotification[]),
        canViewPreOrders
          ? queryPreOrderNotifications({ limitCount: 15 }).catch(() => ({
              items: [] as PreOrderNotification[],
              lastDoc: null,
              hasMore: false,
            }))
          : Promise.resolve({
              items: [] as PreOrderNotification[],
              lastDoc: null,
              hasMore: false,
            }),
      ]);

      const mergedMap = new Map<string, UnifiedNotificationItem>();

      // Stored ERP notifications
      dbNotifs
        .filter((n) => !n.dismissedBy?.includes(user.id || ''))
        .forEach((n) => {
          mergedMap.set(n.id, {
            id: n.id,
            source: 'erp',
            type: n.type,
            title: n.title,
            message: n.message,
            createdAt: n.createdAt,
            read: Boolean(n.read),
            targetScreen: n.targetScreen,
          });
        });

      // Low Stock Check
      const products =
        propProducts && propProducts.length > 0 ? propProducts : await getProducts();
      products.forEach((p) => {
        const totalStock = p.variants?.reduce((sum, v) => sum + v.stock, 0) || 0;
        const minThreshold = p.reorderThreshold || 5;
        if (totalStock <= minThreshold) {
          const id = `low_stock_${p.id}`;
          if (!mergedMap.has(id)) {
            mergedMap.set(id, {
              id,
              source: 'erp',
              type: 'low_stock',
              title: 'Low Stock Warning',
              message: `Product "${p.name}" has reached low stock level (${totalStock} units remaining).`,
              createdAt: Date.now(),
              read: false,
              targetScreen: 'products',
            });
          }
        }
      });

      // Pending Staff Approvals Check
      if (user.role === 'superadmin' || user.role === 'admin') {
        const users = await getAllUsers().catch(() => []);
        const pendingUsers = users.filter(
          (u) => u.role === 'staff' && (u as any).approved === false
        );
        if (pendingUsers.length > 0 && !mergedMap.has('pending_users_alert')) {
          mergedMap.set('pending_users_alert', {
            id: 'pending_users_alert',
            source: 'erp',
            type: 'pending_approval',
            title: 'Pending Staff Approval',
            message: `There are ${pendingUsers.length} pending staff account(s) awaiting approval.`,
            createdAt: Date.now(),
            read: false,
            targetScreen: 'users',
          });
        }
      }

      // Pre-Order Notifications & Reminders
      const nowMs = Date.now();
      poNotifsRes.items.forEach((poNotif) => {
        if (
          poNotif.subBrand &&
          allowedSubBrands.length < 3 &&
          !allowedSubBrands.includes(poNotif.subBrand)
        ) {
          return;
        }
        const snoozedUntil = poNotif.snoozedUntilBy?.[user.id] || 0;
        if (snoozedUntil > nowMs) return;

        mergedMap.set(`po_${poNotif.id}`, {
          id: poNotif.id,
          source: 'preorder',
          type: poNotif.type,
          title: poNotif.title,
          message: poNotif.message,
          createdAt: poNotif.createdAt,
          read: Boolean(poNotif.readBy?.includes(user.id)),
          targetScreen: poNotif.targetTab || 'preorder_list',
          preOrderId: poNotif.preOrderId,
          subBrand: poNotif.subBrand,
          severity: poNotif.severity,
        });
      });

      const list = Array.from(mergedMap.values()).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user, propProducts, canViewPreOrders, allowedSubBrands]);

  useEffect(() => {
    if (!user || !auth?.currentUser) return;
    fetchAndCompileNotifications();
  }, [user, fetchAndCompileNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleDropdownItems = notifications.slice(0, 12);

  const handleMarkAllRead = async () => {
    if (!user) return;
    const unread = notifications.filter((n) => !n.read);
    const erpUnreadIds = unread
      .filter(
        (n) =>
          n.source === 'erp' &&
          !n.id.startsWith('low_stock') &&
          !n.id.startsWith('pending')
      )
      .map((n) => n.id);
    const poUnreadIds = unread
      .filter((n) => n.source === 'preorder')
      .map((n) => n.id);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    await Promise.all([
      erpUnreadIds.length > 0
        ? markAllNotificationsRead(erpUnreadIds).catch(() => {})
        : Promise.resolve(),
      poUnreadIds.length > 0
        ? markAllPreOrderNotificationsRead(poUnreadIds, user.id).catch(() => {})
        : Promise.resolve(),
    ]);
  };

  const handleItemClick = async (notif: UnifiedNotificationItem) => {
    if (!notif.read && user) {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id && n.source === notif.source ? { ...n, read: true } : n
        )
      );
      if (notif.source === 'preorder') {
        await markAllPreOrderNotificationsRead([notif.id], user.id).catch(() => {});
      } else if (!notif.id.startsWith('low_stock') && !notif.id.startsWith('pending')) {
        await markNotificationRead(notif.id).catch(() => {});
      }
    }
    if (notif.targetScreen && onNavigate) {
      onNavigate(
        notif.targetScreen,
        undefined,
        notif.source === 'preorder' ? notif.preOrderId || null : null
      );
      setIsOpen(false);
    }
  };

  const getIconForItem = (item: UnifiedNotificationItem) => {
    if (item.source === 'preorder') {
      if (item.severity === 'urgent') {
        return <AlertTriangle size={16} className="text-rose-500" />;
      }
      if (item.type.includes('arrival') || item.type.includes('delay')) {
        return <Plane size={16} className="text-[#D4AF37]" />;
      }
      if (item.type.includes('payment') || item.type.includes('due')) {
        return <Clock size={16} className="text-amber-500" />;
      }
      return <ShoppingBag size={16} className="text-blue-500" />;
    }
    switch (item.type) {
      case 'low_stock':
        return <AlertTriangle size={16} className="text-amber-500" />;
      case 'order_status':
        return <ShoppingBag size={16} className="text-blue-500" />;
      case 'due_payment':
        return <Clock size={16} className="text-rose-500" />;
      case 'pending_approval':
        return <UserCheck size={16} className="text-teal-500" />;
      default:
        return <Bell size={16} className="text-slate-500" />;
    }
  };

  return (
    <div className="relative inline-block text-left">
      {/* Bell Icon Trigger */}
      <button
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) fetchAndCompileNotifications();
        }}
        className="relative p-2.5 text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800 rounded-xl border border-slate-800 transition-all cursor-pointer"
        title="Notifications & Alerts"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold">Notifications &amp; Reminders</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Checking alerts &amp; reminders...
                </div>
              ) : visibleDropdownItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No active alerts or reminders right now.
                </div>
              ) : (
                visibleDropdownItems.map((notif) => (
                  <div
                    key={`${notif.source}_${notif.id}`}
                    onClick={() => handleItemClick(notif)}
                    className={`p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer flex items-start gap-3 ${
                      !notif.read ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                      {getIconForItem(notif)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4
                          className={`text-xs truncate ${
                            !notif.read
                              ? 'font-black text-slate-900 dark:text-white'
                              : 'font-bold text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {notif.subBrand ? `[${notif.subBrand}] ` : ''}
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {new Date(notif.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                        {notif.message}
                      </p>
                    </div>

                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-2" />
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 text-[11px] truncate">
                {canViewPreOrders
                  ? 'Inventory + Pre-Order alerts'
                  : 'Inventory alerts'}
              </span>
              {canViewPreOrders && onNavigate && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onNavigate('preorder_reminders');
                  }}
                  className="inline-flex items-center gap-1 font-semibold text-[#B89628] hover:underline shrink-0 cursor-pointer"
                >
                  <span>Open Reminder Center</span>
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
