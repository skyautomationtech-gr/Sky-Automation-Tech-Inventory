import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  AlertTriangle, 
  ShoppingBag, 
  Clock, 
  UserCheck, 
  X,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { AppNotification, Product, Order, UserProfile } from '../types';
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  getProducts, 
  getOrders, 
  getAllUsers 
} from '../firebase/db';

interface NotificationCenterProps {
  user: UserProfile | null;
  onNavigate?: (tab: string) => void;
}

export default function NotificationCenter({ user, onNavigate }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAndCompileNotifications();
  }, [user]);

  const fetchAndCompileNotifications = async () => {
    setLoading(true);
    try {
      // Fetch persisted notifications from Firestore
      const dbNotifs = await getNotifications();

      // Dynamically compile active system alerts (Low Stock, Pending Users, Overdue Payments)
      const dynamicAlerts: AppNotification[] = [];

      // 1. Low Stock Check
      const products = await getProducts();
      products.forEach(p => {
        const totalStock = p.variants?.reduce((sum, v) => sum + v.stock, 0) || 0;
        const minThreshold = p.reorderThreshold || 5;
        if (totalStock <= minThreshold) {
          dynamicAlerts.push({
            id: `low_stock_${p.id}`,
            type: 'low_stock',
            title: 'Low Stock Warning',
            message: `Product "${p.name}" has reached low stock level (${totalStock} units remaining).`,
            createdAt: Date.now(),
            read: false,
            targetScreen: 'products'
          });
        }
      });

      // 2. Pending Staff Approvals Check
      if (user?.role === 'superadmin' || user?.role === 'admin') {
        const users = await getAllUsers();
        const pendingUsers = users.filter(u => u.role === 'staff' && (u as any).approved === false);
        if (pendingUsers.length > 0) {
          dynamicAlerts.push({
            id: 'pending_users_alert',
            type: 'pending_approval',
            title: 'Pending Staff Approval',
            message: `There are ${pendingUsers.length} pending staff account(s) awaiting approval.`,
            createdAt: Date.now(),
            read: false,
            targetScreen: 'users'
          });
        }
      }

      // Merge dynamic alerts with stored notifications, removing dismissed ones
      const filteredStored = dbNotifs.filter(n => !n.dismissedBy?.includes(user?.id || ''));
      
      const mergedMap = new Map<string, AppNotification>();
      filteredStored.forEach(n => mergedMap.set(n.id, n));
      dynamicAlerts.forEach(n => {
        if (!mergedMap.has(n.id)) {
          mergedMap.set(n.id, n);
        }
      });

      const list = Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (unreadIds.length > 0) {
      await markAllNotificationsRead(unreadIds.filter(id => !id.startsWith('low_stock') && !id.startsWith('pending')));
    }
  };

  const handleItemClick = async (notif: AppNotification) => {
    if (!notif.read) {
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
      if (!notif.id.startsWith('low_stock') && !notif.id.startsWith('pending')) {
        await markNotificationRead(notif.id);
      }
    }
    if (notif.targetScreen && onNavigate) {
      onNavigate(notif.targetScreen);
      setIsOpen(false);
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
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
        onClick={() => setIsOpen(!isOpen)}
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
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />

          <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-amber-400" />
                <h3 className="text-sm font-bold">Notifications & Alerts</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold rounded-full">
                    {unreadCount} New
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <CheckCheck size={14} />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {/* Notification List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  Checking inventory alerts...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No active alerts or notifications right now.
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => handleItemClick(notif)}
                    className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 ${
                      !notif.read ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-slate-100 shrink-0 mt-0.5">
                      {getIconForType(notif.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className={`text-xs ${!notif.read ? 'font-black text-slate-900' : 'font-bold text-slate-700'}`}>
                          {notif.title}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-snug line-clamp-2">
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
            <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
              Inventory alerts update automatically in real-time
            </div>
          </div>
        </>
      )}
    </div>
  );
}
