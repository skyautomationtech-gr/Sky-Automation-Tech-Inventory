import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  AlertTriangle,
  ShoppingBag,
  Clock,
  UserCheck,
  ExternalLink,
  Plane,
  RefreshCw,
} from 'lucide-react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
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
  getProductAvailableStock,
} from '../firebase/db';
import {
  actorFromUser,
  markAllPreOrderNotificationsRead,
  queryPreOrderNotifications,
  syncDailyTimeBasedReminders,
} from '../firebase/preOrderDb';
import { hasPermission } from '../preOrders/constants';
import { auth, db } from '../firebase/config';

interface NotificationCenterProps {
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  rolePermissionsReady?: boolean;
  products?: Product[];
  currentTab?: string;
  currentSubAction?: string;
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

interface PanelPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

type FilterTab = 'all' | 'unread';

const ANIMATION_DURATION_MS = 150;

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return '';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 45_000) return 'Just now';
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

export default function NotificationCenter({
  user,
  rolePermissions = null,
  rolePermissionsReady = false,
  products: propProducts,
  currentTab,
  currentSubAction,
  onNavigate,
}: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const [notifications, setNotifications] = useState<UnifiedNotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [panelPos, setPanelPos] = useState<PanelPosition>({
    top: 72,
    left: 16,
    width: 380,
    maxHeight: 480,
  });

  // Persist locally-read synthetic alert IDs (low_stock_*, pending_users_alert) per user session
  const localReadStorageKey = `sat_local_read_notifs_${user?.id || 'guest'}`;
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(() => {
    try {
      const saved = sessionStorage.getItem(localReadStorageKey);
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(localReadStorageKey);
      setLocallyReadIds(saved ? new Set(JSON.parse(saved) as string[]) : new Set());
    } catch {
      setLocallyReadIds(new Set());
    }
  }, [localReadStorageKey]);

  const markSyntheticIdsRead = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setLocallyReadIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        try {
          sessionStorage.setItem(localReadStorageKey, JSON.stringify(Array.from(next)));
        } catch {}
        return next;
      });
    },
    [localReadStorageKey]
  );

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const locallyReadRef = useRef(locallyReadIds);
  locallyReadRef.current = locallyReadIds;

  const isSuperAdmin = user?.role === 'superadmin' || (user?.role as string) === 'super_admin';
  const canViewPreOrders =
    Boolean(user) &&
    (isSuperAdmin || rolePermissionsReady) &&
    hasPermission(user, rolePermissions, 'preOrderView');

  const allowedSubBrands = useMemo<Array<'SAT' | 'GZ' | 'RTX'>>(() => {
    if (!user) return ['SAT', 'GZ', 'RTX'];
    if (isSuperAdmin || !user.subBrandAccess || user.subBrandAccess.length === 0) {
      return ['SAT', 'GZ', 'RTX'];
    }
    const valid = user.subBrandAccess.filter(
      (b): b is 'SAT' | 'GZ' | 'RTX' => b === 'SAT' || b === 'GZ' || b === 'RTX'
    );
    return valid.length > 0 ? valid : ['SAT'];
  }, [user, isSuperAdmin]);

  // Compile unified notifications from Firestore docs + Inventory alerts + User approvals + Pre-Order reminders
  const compileNotificationsList = useCallback(
    async (
      dbNotifs: AppNotification[],
      poNotifs: PreOrderNotification[]
    ): Promise<UnifiedNotificationItem[]> => {
      if (!user) return [];
      const readSet = locallyReadRef.current;
      const mergedMap = new Map<string, UnifiedNotificationItem>();

      // 1. Stored ERP notifications
      dbNotifs
        .filter(
          (n) =>
            !n.dismissedBy?.includes(user.id || '') &&
            (isSuperAdmin || n.type !== 'pending_approval')
        )
        .forEach((n) => {
          const isRead = Boolean(n.read || n.readBy?.includes(user.id || ''));
          mergedMap.set(n.id, {
            id: n.id,
            source: 'erp',
            type: n.type,
            title: n.title,
            message: n.message,
            createdAt: n.createdAt,
            read: isRead,
            targetScreen: n.targetScreen,
          });
        });

      // 2. Low Stock Check (reuses already-subscribed products when available)
      const productsList =
        propProducts && propProducts.length > 0
          ? propProducts
          : await getProducts().catch(() => [] as Product[]);

      productsList
        .filter((p) => !p.archived)
        .forEach((p) => {
          const totalStock = getProductAvailableStock(p);
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
                createdAt: p.createdAt || Date.now(),
                read: readSet.has(id),
                targetScreen: 'products',
              });
            }
          }
        });

      // 3. Pending Staff / Sign-up Approvals Check (Super Admin only)
      if (isSuperAdmin) {
        const usersList = await getAllUsers().catch(() => []);
        const pendingUsers = usersList.filter(
          (u) =>
            u.status === 'pending_approval' ||
            (u.role === 'staff' && (u as any).approved === false)
        );
        if (pendingUsers.length > 0 && !mergedMap.has('pending_users_alert')) {
          mergedMap.set('pending_users_alert', {
            id: 'pending_users_alert',
            source: 'erp',
            type: 'pending_approval',
            title: 'Pending Account Approvals',
            message: `There are ${pendingUsers.length} pending user account(s) awaiting approval.`,
            createdAt: Date.now(),
            read: readSet.has('pending_users_alert'),
            targetScreen: 'users',
          });
        }
      }

      // 4. Pre-Order Notifications & Reminders
      if (canViewPreOrders) {
        const nowMs = Date.now();
        poNotifs.forEach((poNotif) => {
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
      }

      return Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    },
    [user, isSuperAdmin, propProducts, canViewPreOrders, allowedSubBrands]
  );

  // Latest snapshot refs so realtime listeners & manual refresh stay consistent
  const latestErpRef = useRef<AppNotification[]>([]);
  const latestPoRef = useRef<PreOrderNotification[]>([]);

  const fetchAndCompileNotifications = useCallback(async () => {
    if (!auth?.currentUser || !user?.id) return;
    setLoading(true);
    setFetchError(null);
    try {
      // Non-blocking daily reminder check if user has Pre-Order access
      if (canViewPreOrders) {
        syncDailyTimeBasedReminders({
          actor: actorFromUser(user),
          allowedSubBrands,
        }).catch(() => {});
      }

      const [dbNotifs, poNotifsRes] = await Promise.all([
        getNotifications(true),
        canViewPreOrders
          ? queryPreOrderNotifications({ limitCount: 15 })
          : Promise.resolve({
              items: [] as PreOrderNotification[],
              lastDoc: null,
              hasMore: false,
            }),
      ]);

      latestErpRef.current = dbNotifs;
      latestPoRef.current = poNotifsRes.items;

      const compiled = await compileNotificationsList(dbNotifs, poNotifsRes.items);
      setNotifications(compiled);
      setHasLoadedOnce(true);
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      const message =
        err?.code === 'permission-denied' ||
        String(err?.message || '').toLowerCase().includes('permission')
          ? 'Unable to load notifications due to missing permissions.'
          : 'Could not load notifications right now. Please try again.';
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [user, canViewPreOrders, allowedSubBrands, compileNotificationsList]);

  // Real-time Firestore listeners (started ONLY after a real Firebase Auth user exists)
  useEffect(() => {
    if (!auth?.currentUser || !user?.id) return;

    fetchAndCompileNotifications();

    const erpQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubErp = onSnapshot(
      erpQuery,
      async (snapshot) => {
        const docs = snapshot.docs.map(
          (docSnap) => ({ id: docSnap.id, ...docSnap.data() } as AppNotification)
        );
        latestErpRef.current = docs;
        const compiled = await compileNotificationsList(docs, latestPoRef.current);
        setNotifications(compiled);
        setHasLoadedOnce(true);
        setFetchError(null);
      },
      (err) => {
        console.warn('Notification listener error:', err);
        setFetchError(
          err?.code === 'permission-denied'
            ? 'Unable to load notifications due to missing permissions.'
            : 'Notification connection interrupted. Click Retry to refresh.'
        );
      }
    );

    let unsubPo: (() => void) | null = null;
    if (canViewPreOrders) {
      const poQuery = query(
        collection(db, 'preOrderNotifications'),
        orderBy('createdAt', 'desc'),
        limit(15)
      );
      unsubPo = onSnapshot(
        poQuery,
        async (snapshot) => {
          const docs = snapshot.docs.map(
            (docSnap) =>
              ({ ...(docSnap.data() as PreOrderNotification), id: docSnap.id })
          );
          latestPoRef.current = docs;
          const compiled = await compileNotificationsList(latestErpRef.current, docs);
          setNotifications(compiled);
          setHasLoadedOnce(true);
          setFetchError(null);
        },
        (err) => {
          console.warn('Pre-order notification listener error:', err);
          setFetchError(
            err?.code === 'permission-denied'
              ? 'Unable to load pre-order notifications due to permissions.'
              : 'Could not sync pre-order alerts. Click Retry to refresh.'
          );
        }
      );
    } else {
      latestPoRef.current = [];
    }

    return () => {
      unsubErp();
      if (unsubPo) unsubPo();
    };
  }, [user?.id, canViewPreOrders, fetchAndCompileNotifications, compileNotificationsList]);

  // Re-compile if products array changes locally
  useEffect(() => {
    if (!auth?.currentUser || !user?.id || !hasLoadedOnce) return;
    compileNotificationsList(latestErpRef.current, latestPoRef.current)
      .then((compiled) => setNotifications(compiled))
      .catch(() => {});
  }, [propProducts, hasLoadedOnce, user?.id, compileNotificationsList]);

  // Compute portal fixed position from trigger's bounding rect, clamped inside viewport
  const updatePosition = useCallback(() => {
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return;

    const rect = triggerEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const margin = 8;
    const gap = 8;
    const width = Math.min(380, Math.max(260, viewportW - margin * 2));

    // Right-aligned to the bell button, clamped inside viewport horizontally
    let left = rect.right - width;
    left = Math.max(margin, Math.min(left, viewportW - width - margin));

    // Vertically positioned below the bell, capped at 70vh and available space
    const preferredMaxHeight = Math.round(viewportH * 0.7);
    const spaceBelow = viewportH - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;

    let top = rect.bottom + gap;
    let maxHeight = Math.min(preferredMaxHeight, Math.max(220, spaceBelow));

    if (spaceBelow < 240 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(preferredMaxHeight, Math.max(220, spaceAbove));
      top = Math.max(margin, rect.top - gap - maxHeight);
    }

    setPanelPos({ top, left, width, maxHeight });
  }, []);

  // Open / close 150ms animation lifecycle
  useEffect(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isOpen) {
      setIsMounted(true);
      updatePosition();
      const raf = window.requestAnimationFrame(() => {
        updatePosition();
        setIsVisible(true);
      });
      return () => window.cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      closeTimerRef.current = window.setTimeout(() => {
        setIsMounted(false);
      }, ANIMATION_DURATION_MS);
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Keep panel aligned on resize / scroll
  useEffect(() => {
    if (!isMounted) return;
    const handleReposition = () => updatePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isMounted, updatePosition]);

  // Close on outside click & Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Close automatically on route/tab navigation
  useEffect(() => {
    setIsOpen(false);
  }, [currentTab, currentSubAction]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const visibleItems = useMemo(() => {
    const filtered =
      activeTab === 'unread'
        ? notifications.filter((n) => !n.read)
        : notifications;
    return filtered.slice(0, 30);
  }, [notifications, activeTab]);

  const handleMarkAllRead = async () => {
    if (!user || unreadCount === 0) return;
    const unread = notifications.filter((n) => !n.read);

    const syntheticIds = unread
      .filter(
        (n) =>
          n.source === 'erp' &&
          (n.id.startsWith('low_stock') || n.id.startsWith('pending'))
      )
      .map((n) => n.id);
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

    markSyntheticIdsRead(syntheticIds);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));

    await Promise.all([
      erpUnreadIds.length > 0
        ? markAllNotificationsRead(erpUnreadIds, user.id).catch(() => {})
        : Promise.resolve(),
      poUnreadIds.length > 0
        ? markAllPreOrderNotificationsRead(poUnreadIds, user.id).catch(() => {})
        : Promise.resolve(),
    ]);
  };

  const handleItemClick = async (notif: UnifiedNotificationItem) => {
    if (!notif.read && user) {
      if (
        notif.source === 'erp' &&
        (notif.id.startsWith('low_stock') || notif.id.startsWith('pending'))
      ) {
        markSyntheticIdsRead([notif.id]);
      }
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id && n.source === notif.source ? { ...n, read: true } : n
        )
      );
      if (notif.source === 'preorder') {
        await markAllPreOrderNotificationsRead([notif.id], user.id).catch(() => {});
      } else if (
        !notif.id.startsWith('low_stock') &&
        !notif.id.startsWith('pending')
      ) {
        await markNotificationRead(notif.id, user.id).catch(() => {});
      }
    }

    if (notif.targetScreen && onNavigate) {
      const targetTab =
        notif.targetScreen === 'due_payments' ? 'receivables' : notif.targetScreen;
      const targetSubAction =
        notif.type === 'pending_approval' && targetTab === 'users'
          ? 'pending'
          : undefined;
      onNavigate(
        targetTab,
        targetSubAction,
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
        return <Bell size={16} className="text-slate-500 dark:text-slate-400" />;
    }
  };

  const portalDropdown =
    isMounted && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Notifications"
            style={{
              position: 'fixed',
              top: `${panelPos.top}px`,
              left: `${panelPos.left}px`,
              width: `${panelPos.width}px`,
              maxHeight: `${panelPos.maxHeight}px`,
              zIndex: 1000,
            }}
            className={`
              flex flex-col overflow-hidden rounded-2xl
              bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl
              border border-slate-200/90 dark:border-slate-700/80
              shadow-2xl text-slate-900 dark:text-slate-100
              origin-top-right transition-[opacity,transform] duration-150 ease-out
              ${
                isVisible
                  ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                  : 'opacity-0 -translate-y-1.5 scale-95 pointer-events-none'
              }
            `}
          >
            {/* Header Row */}
            <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Bell size={16} className="text-[#D4AF37] shrink-0" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Notifications
                </h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-mono font-bold rounded-full leading-none shrink-0">
                    {unreadCount}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[11px] font-semibold text-amber-600 dark:text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 rounded px-1 py-0.5"
                  >
                    <CheckCheck size={13} />
                    <span>Mark all read</span>
                  </button>
                )}

                {canViewPreOrders && onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onNavigate('preorder_reminders');
                    }}
                    className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-[#D4AF37] flex items-center gap-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 rounded px-1 py-0.5"
                  >
                    <span>Reminder Center</span>
                    <ExternalLink size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs Row (All / Unread) */}
            <div
              role="tablist"
              aria-label="Notification filter"
              className="px-4 py-2 border-b border-slate-200/70 dark:border-slate-800/80 flex items-center gap-2 bg-white/60 dark:bg-slate-900/60 shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 ${
                  activeTab === 'all'
                    ? 'bg-[#D4AF37] text-slate-950 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'unread'}
                onClick={() => setActiveTab('unread')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 ${
                  activeTab === 'unread'
                    ? 'bg-[#D4AF37] text-slate-950 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
              {fetchError ? (
                <div className="p-4 m-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3">
                  <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                      Failed to fetch notifications
                    </p>
                    <p className="text-[11px] text-rose-600/90 dark:text-rose-400 mt-0.5 leading-snug">
                      {fetchError}
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchAndCompileNotifications()}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                    >
                      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                      <span>Retry</span>
                    </button>
                  </div>
                </div>
              ) : loading && !hasLoadedOnce ? (
                <div className="p-3 space-y-2.5" aria-busy="true" aria-label="Loading notifications">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 animate-pulse"
                    >
                      <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                          <div className="h-2.5 w-10 rounded bg-slate-200 dark:bg-slate-700" />
                        </div>
                        <div className="h-2.5 w-full rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-2.5 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : visibleItems.length === 0 ? (
                <div className="py-10 px-6 text-center flex flex-col items-center justify-center gap-2">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-center text-slate-400 dark:text-slate-500">
                    <BellOff size={20} />
                  </div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                    {activeTab === 'unread' && notifications.length > 0
                      ? 'No unread notifications'
                      : 'No notifications yet'}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeTab === 'unread' && notifications.length > 0
                      ? 'You are caught up on all alerts.'
                      : 'Inventory and order alerts will show up here.'}
                  </p>
                </div>
              ) : (
                visibleItems.map((notif) => (
                  <button
                    key={`${notif.source}_${notif.id}`}
                    type="button"
                    onClick={() => handleItemClick(notif)}
                    className={`w-full text-left p-3.5 hover:bg-slate-100/80 dark:hover:bg-slate-800/70 transition-colors cursor-pointer flex items-start gap-3 focus:outline-none focus:bg-slate-100/90 dark:focus:bg-slate-800/80 ${
                      !notif.read ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700/70 shrink-0 mt-0.5">
                      {getIconForItem(notif)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs truncate ${
                            !notif.read
                              ? 'font-bold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {notif.subBrand ? `[${notif.subBrand}] ` : ''}
                          {notif.title}
                        </h4>
                        <span
                          className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0"
                          title={new Date(notif.createdAt).toLocaleString()}
                        >
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-snug line-clamp-2">
                        {notif.message}
                      </p>
                    </div>

                    {!notif.read && (
                      <span
                        className="w-2 h-2 rounded-full bg-amber-500 shrink-0 mt-2 ring-2 ring-amber-500/20"
                        aria-label="Unread"
                      />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          if (next) fetchAndCompileNotifications();
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        title="Notifications & Alerts"
        className={`relative w-10 h-10 flex items-center justify-center rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 ${
          isOpen
            ? 'bg-amber-50 dark:bg-slate-800 text-amber-600 dark:text-[#D4AF37] border-[#D4AF37]/50 shadow-xs'
            : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border-slate-200/80 dark:border-slate-700 shadow-2xs'
        }`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-slate-900 tabular-nums">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {portalDropdown}
    </div>
  );
}
