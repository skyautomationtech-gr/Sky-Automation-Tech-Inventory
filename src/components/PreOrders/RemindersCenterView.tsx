import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  AlertCircle,
  Bell,
  BellOff,
  CheckCheck,
  Clock,
  ExternalLink,
  Info,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CompanySettings,
  PreOrder,
  PreOrderMessageTemplateKey,
  PreOrderNotification,
  PreOrderNotificationType,
  PreOrderSettings,
  RolePermissionsMap,
  SubBrand,
  UserProfile,
} from '../../types';
import {
  getSellingSubBrands,
  getUserAllowedSubBrandIds,
  matchesGlobalBrandFilter,
} from '../../utils/subBrands';
import {
  hasPermission,
  isPreOrderAdminRole,
} from '../../preOrders/constants';
import {
  DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES,
  DEFAULT_PRE_ORDER_SETTINGS,
  mergeWithDefaultPreOrderSettings,
} from '../../preOrders/templates';
import {
  actorFromUser,
  getPreOrderById,
  getPreOrderSettings,
  markAllPreOrderNotificationsRead,
  queryPreOrderNotifications,
  savePreOrderSettings,
  snoozePreOrderNotification,
  syncDailyTimeBasedReminders,
} from '../../firebase/preOrderDb';
import { auth } from '../../firebase/config';
import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  SearchInput,
  Select,
  Skeleton,
  Textarea,
  ToggleSwitch,
  useToast,
} from '../../design-system';
import CustomerMessageModal from './CustomerMessageModal';
import { SubBrandBadge } from './PreOrderStatusBadge';

export interface RemindersCenterViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  companySettings?: CompanySettings | null;
  subBrands?: SubBrand[];
  globalBrandFilter?: string;
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
}

type ReminderFilterTab = 'all' | 'unread' | 'reminders' | 'delayed' | 'payments';

const DELAY_TYPES: PreOrderNotificationType[] = [
  'shipment_delayed',
  'arrival_today',
  'arrival_soon',
];

const PAYMENT_TYPES: PreOrderNotificationType[] = [
  'payment_pending',
  'advance_received',
  'payment_verified',
  'payment_rejected',
  'due_payment_reminder',
  'refund_recorded',
];

function getDefaultTemplateForNotif(type: PreOrderNotificationType): PreOrderMessageTemplateKey {
  switch (type) {
    case 'due_payment_reminder':
    case 'payment_pending':
      return 'due_payment_reminder';
    case 'shipment_delayed':
      return 'delay_notice';
    case 'arrival_today':
    case 'arrival_soon':
    case 'product_arrived':
      return 'product_arrived';
    case 'ready_for_delivery':
    case 'out_for_delivery':
      return 'ready_for_delivery';
    case 'advance_received':
      return 'advance_received';
    default:
      return 'shipment_update';
  }
}

export const RemindersCenterView: React.FC<RemindersCenterViewProps> = ({
  user,
  rolePermissions,
  companySettings,
  subBrands,
  globalBrandFilter,
  onNavigate,
}) => {
  const toast = useToast();
  const canView = hasPermission(user, rolePermissions, 'preOrderView');
  const isAdmin = isPreOrderAdminRole(user.role);
  const canEditSettings = isAdmin || user.role === 'manager';

  const sellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: true, companySettings }),
    [subBrands, companySettings]
  );

  const allowedSubBrands = useMemo<string[] | undefined>(() => {
    if (isAdmin) return undefined;
    const ids = getUserAllowedSubBrandIds(user, subBrands, {
      includeInactive: true,
      companySettings,
    });
    return ids.length > 0 ? ids : sellingSubBrands.map((sb) => sb.shortCode);
  }, [isAdmin, user, subBrands, companySettings, sellingSubBrands]);

  const brandFilterOptions = useMemo(() => {
    const visible = isAdmin
      ? sellingSubBrands
      : sellingSubBrands.filter((sb) => !allowedSubBrands || allowedSubBrands.includes(sb.shortCode));
    const opts = [
      { value: 'ALL', label: 'All Sub-Brands' },
      ...visible.map((sb) => ({
        value: sb.shortCode,
        label: sb.active ? `${sb.shortCode} — ${sb.name}` : `${sb.shortCode} — ${sb.name} (Inactive)`,
      })),
    ];
    if (isAdmin) {
      opts.push({ value: 'LEGACY_SAT', label: 'Legacy (SAT)' });
    }
    return opts;
  }, [isAdmin, sellingSubBrands, allowedSubBrands]);

  const [notifications, setNotifications] = useState<PreOrderNotification[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [activeTab, setActiveTab] = useState<ReminderFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState<string>(() =>
    globalBrandFilter && globalBrandFilter !== 'ALL' ? globalBrandFilter : 'ALL'
  );
  const [showSnoozed, setShowSnoozed] = useState(false);

  // Settings & Bilingual Templates State
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settings, setSettings] = useState<PreOrderSettings>(DEFAULT_PRE_ORDER_SETTINGS);
  const [savingSettings, setSavingSettings] = useState(false);
  const [activeTplKey, setActiveTplKey] = useState<PreOrderMessageTemplateKey>('advance_received');

  // Customer Message Modal State
  const [msgTargetOrder, setMsgTargetOrder] = useState<PreOrder | null>(null);
  const [msgDefaultTemplate, setMsgDefaultTemplate] =
    useState<PreOrderMessageTemplateKey>('shipment_update');
  const [loadingMsgOrderId, setLoadingMsgOrderId] = useState<string | null>(null);

  const loadNotifications = useCallback(
    async (append = false, nextCursor?: QueryDocumentSnapshot<DocumentData> | null) => {
      if (!canView) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await queryPreOrderNotifications({
          limitCount: 30,
          cursor: append ? nextCursor || null : null,
        });
        setNotifications((prev) => {
          if (!append) return res.items;
          const map = new Map<string, PreOrderNotification>();
          prev.forEach((p) => map.set(p.id, p));
          res.items.forEach((n) => map.set(n.id, n));
          return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
        });
        setCursor(res.lastDoc);
        setHasMore(res.hasMore);
      } catch (err: any) {
        console.error('Failed to load pre-order notifications:', err);
        toast.error('Load Failed', err?.message || 'Unable to load reminders.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [canView, toast]
  );

  useEffect(() => {
    if (globalBrandFilter) {
      setSubBrandFilter(globalBrandFilter);
    }
  }, [globalBrandFilter]);

  useEffect(() => {
    if (!canView || !auth?.currentUser || !user?.id) return;
    let active = true;
    (async () => {
      const loadedSettings = await getPreOrderSettings().catch(() => DEFAULT_PRE_ORDER_SETTINGS);
      if (active) setSettings(loadedSettings);
      await syncDailyTimeBasedReminders({
        settings: loadedSettings,
        actor: actorFromUser(user),
        allowedSubBrands,
      }).catch(() => {});
      if (active) await loadNotifications(false);
    })();
    return () => {
      active = false;
    };
  }, [canView, user, allowedSubBrands, loadNotifications]);

  const handleRefreshReminders = async () => {
    setSyncing(true);
    try {
      const res = await syncDailyTimeBasedReminders({
        settings,
        actor: actorFromUser(user),
        allowedSubBrands,
        force: true,
      });
      await loadNotifications(false);
      toast.success(
        'Reminders Refreshed',
        `Evaluated ${res.evaluated} orders · ${res.created} new reminder${res.created === 1 ? '' : 's'} queued.`
      );
    } catch (err: any) {
      toast.error('Refresh Failed', err?.message || 'Could not evaluate daily reminders.');
    } finally {
      setSyncing(false);
    }
  };

  const nowMs = Date.now();

  const visibleNotifications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notifications.filter((n) => {
      if (
        n.subBrand &&
        allowedSubBrands &&
        allowedSubBrands.length > 0 &&
        !allowedSubBrands.includes(n.subBrand)
      ) {
        return false;
      }
      if (subBrandFilter !== 'ALL' && n.subBrand && !matchesGlobalBrandFilter(n.subBrand, subBrandFilter)) {
        return false;
      }
      const snoozedUntil = n.snoozedUntilBy?.[user.id] || 0;
      const isSnoozed = snoozedUntil > nowMs;
      if (!showSnoozed && isSnoozed) return false;

      const isRead = Boolean(n.readBy?.includes(user.id));
      if (activeTab === 'unread' && isRead) return false;
      if (activeTab === 'reminders' && n.category !== 'reminder') return false;
      if (activeTab === 'delayed' && !DELAY_TYPES.includes(n.type)) return false;
      if (activeTab === 'payments' && !PAYMENT_TYPES.includes(n.type)) return false;

      if (q) {
        const hay = `${n.preOrderNumber || ''} ${n.customerName || ''} ${n.customerPhone || ''} ${n.title || ''} ${n.message || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    notifications,
    allowedSubBrands,
    subBrandFilter,
    user.id,
    nowMs,
    showSnoozed,
    activeTab,
    searchQuery,
  ]);

  const unreadIds = useMemo(
    () =>
      visibleNotifications
        .filter((n) => !n.readBy?.includes(user.id))
        .map((n) => n.id),
    [visibleNotifications, user.id]
  );

  const handleMarkRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id) && !n.readBy?.includes(user.id)
          ? { ...n, readBy: [...(n.readBy || []), user.id] }
          : n
      )
    );
    try {
      await markAllPreOrderNotificationsRead(ids, user.id);
    } catch (err: any) {
      toast.error('Update Failed', err?.message || 'Could not mark notifications read.');
    }
  };

  const handleSnooze = async (notif: PreOrderNotification, days: 1 | 3) => {
    try {
      const until = await snoozePreOrderNotification(notif.id, user.id, days);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notif.id
            ? { ...n, snoozedUntilBy: { ...(n.snoozedUntilBy || {}), [user.id]: until } }
            : n
        )
      );
      toast.success('Snoozed', `Reminder hidden for ${days} day${days > 1 ? 's' : ''}.`);
    } catch (err: any) {
      toast.error('Snooze Failed', err?.message || 'Unable to snooze notification.');
    }
  };

  const handleOpenSendUpdate = async (notif: PreOrderNotification) => {
    if (!notif.preOrderId) return;
    setLoadingMsgOrderId(notif.id);
    try {
      const order = await getPreOrderById(notif.preOrderId);
      if (!order) {
        toast.error('Not Found', 'Pre-order record no longer exists.');
        return;
      }
      setMsgDefaultTemplate(getDefaultTemplateForNotif(notif.type));
      setMsgTargetOrder(order);
    } catch (err: any) {
      toast.error('Load Failed', err?.message || 'Unable to load pre-order for messaging.');
    } finally {
      setLoadingMsgOrderId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!canEditSettings) return;
    setSavingSettings(true);
    try {
      const saved = await savePreOrderSettings(settings, actorFromUser(user));
      setSettings(saved);
      toast.success('Settings Saved', 'Reminder thresholds and EN/BN templates updated.');
    } catch (err: any) {
      toast.error('Save Failed', err?.message || 'Unable to save reminder settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetTemplates = () => {
    setSettings((prev) =>
      mergeWithDefaultPreOrderSettings({
        ...prev,
        messageTemplates: DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES,
      })
    );
    toast.info('Templates Reset', 'Default EN/BN templates restored (click Save Settings to apply).');
  };

  if (!canView) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Access Restricted</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your role does not currently have permission to view Pre-Order Notifications (`preOrderView`).
        </p>
      </Card>
    );
  }

  const tabs: Array<{ id: ReminderFilterTab; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: `Unread (${notifications.filter((n) => !n.readBy?.includes(user.id)).length})` },
    { id: 'reminders', label: 'Reminders Due' },
    { id: 'delayed', label: 'Arrivals & Delays' },
    { id: 'payments', label: 'Payments' },
  ];

  const tplKeys = Object.keys(DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES) as PreOrderMessageTemplateKey[];
  const activeTpl =
    settings.messageTemplates?.[activeTplKey] || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES[activeTplKey];

  return (
    <div className="max-w-[1440px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#D4AF37]" />
            <span>Notifications &amp; Reminders Center</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track arrival milestones, shipment delays, pending verifications, customer dues, and dispatch alerts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unreadIds.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              leftIcon={<CheckCheck className="w-3.5 h-3.5" />}
              onClick={() => handleMarkRead(unreadIds)}
            >
              Mark All Read ({unreadIds.length})
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            isLoading={syncing}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={handleRefreshReminders}
          >
            Refresh Reminders Now
          </Button>
          <Button
            type="button"
            variant={showSettingsPanel ? 'primary' : 'secondary'}
            size="sm"
            leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
            onClick={() => setShowSettingsPanel((s) => !s)}
          >
            Settings &amp; Templates
          </Button>
        </div>
      </div>

      {/* Honest Client-Side Architecture Disclosure */}
      <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#B89628]" />
        <p className="leading-relaxed">
          <strong>Client-side reminder engine:</strong> Time-based arrival, delay, due-payment, and ready-waiting reminders are evaluated automatically once per day/session when staff open the app or Notification Center (no automated SMS/WhatsApp/email gateway is running in the background). Use <strong>Send Update</strong> on any alert to prepare a pre-filled bilingual customer message.
        </p>
      </div>

      {/* Collapsible Settings & Bilingual Templates Panel */}
      {showSettingsPanel && (
        <Card padding="md" className="space-y-5 border-[#D4AF37]/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Reminder Rules &amp; Bilingual Customer Message Templates
              </h2>
            </div>
            {!canEditSettings && (
              <Badge variant="warning" size="xs">
                View-Only (Admin / Manager only)
              </Badge>
            )}
          </div>

          {/* Switches & Threshold Days */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active Daily Reminder Rules
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <ToggleSwitch
                  checked={settings.enableArrivalSoonReminder}
                  disabled={!canEditSettings}
                  onChange={(v) => setSettings((s) => ({ ...s, enableArrivalSoonReminder: v }))}
                  label="Arrival Soon"
                  description="Before expected BD ETA"
                  size="sm"
                />
                <ToggleSwitch
                  checked={settings.enableArrivalTodayReminder}
                  disabled={!canEditSettings}
                  onChange={(v) => setSettings((s) => ({ ...s, enableArrivalTodayReminder: v }))}
                  label="Expected Today"
                  description="On ETA calendar date"
                  size="sm"
                />
                <ToggleSwitch
                  checked={settings.enableDelayReminder}
                  disabled={!canEditSettings}
                  onChange={(v) => setSettings((s) => ({ ...s, enableDelayReminder: v }))}
                  label="Shipment Delay"
                  description="Past ETA + grace days"
                  size="sm"
                />
                <ToggleSwitch
                  checked={settings.enableDueReminder}
                  disabled={!canEditSettings}
                  onChange={(v) => setSettings((s) => ({ ...s, enableDueReminder: v }))}
                  label="Due Balance Follow-Up"
                  description="Active due after threshold"
                  size="sm"
                />
                <ToggleSwitch
                  checked={settings.enableReadyDeliveryReminder}
                  disabled={!canEditSettings}
                  onChange={(v) => setSettings((s) => ({ ...s, enableReadyDeliveryReminder: v }))}
                  label="Ready Waiting Delivery"
                  description="Ready but not dispatched"
                  size="sm"
                />
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Threshold Windows (Days)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FormField label="Arrival Soon (days)">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!canEditSettings}
                    value={settings.arrivalReminderDays}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        arrivalReminderDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </FormField>
                <FormField label="Delay Grace (days)">
                  <Input
                    type="number"
                    min={0}
                    max={14}
                    disabled={!canEditSettings}
                    value={settings.delayGraceDays}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        delayGraceDays: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                  />
                </FormField>
                <FormField label="Due Follow-up (days)">
                  <Input
                    type="number"
                    min={1}
                    max={60}
                    disabled={!canEditSettings}
                    value={settings.dueReminderDays}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        dueReminderDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </FormField>
                <FormField label="Ready Waiting (days)">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!canEditSettings}
                    value={settings.readyWaitingDays}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        readyWaitingDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </FormField>
                <FormField label="Received Not Converted">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!canEditSettings}
                    value={settings.receivedNotConvertedDays}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        receivedNotConvertedDays: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* Bilingual Template Editor */}
          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Bilingual Customer Message Templates (Placeholders: {'{name} {orderNo} {status} {due} {link} {expectedDate}'})
              </p>
              {canEditSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  leftIcon={<RotateCcw className="w-3 h-3" />}
                  onClick={handleResetTemplates}
                >
                  Reset Templates to Defaults
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <FormField label="Template Category">
                <Select
                  value={activeTplKey}
                  searchable={false}
                  options={tplKeys.map((k) => ({
                    value: k,
                    label: settings.messageTemplates?.[k]?.label || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES[k].label,
                  }))}
                  onChange={(val) => setActiveTplKey(val as PreOrderMessageTemplateKey)}
                />
              </FormField>
              <FormField label="English (EN)" className="md:col-span-3">
                <Textarea
                  rows={2}
                  disabled={!canEditSettings}
                  value={activeTpl.en}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      messageTemplates: {
                        ...s.messageTemplates,
                        [activeTplKey]: {
                          ...activeTpl,
                          en: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </FormField>
            </div>
            <FormField label="বাংলা (Bengali)">
              <Textarea
                rows={2}
                disabled={!canEditSettings}
                value={activeTpl.bn}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    messageTemplates: {
                      ...s.messageTemplates,
                      [activeTplKey]: {
                        ...activeTpl,
                        bn: e.target.value,
                      },
                    },
                  }))
                }
              />
            </FormField>

            {canEditSettings && (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowSettingsPanel(false)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={savingSettings}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  onClick={handleSaveSettings}
                >
                  Save Settings
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Filter Bar */}
      <Card padding="sm" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#D4AF37] text-slate-950 shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={showSnoozed}
              onChange={(e) => setShowSnoozed(e.target.checked)}
              className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span>Show snoozed</span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
          <div className="md:col-span-8">
            <SearchInput
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Filter by PO number, customer name, phone, or alert text..."
              sizeVariant="md"
              isSoftUI={false}
            />
          </div>
          <div className="md:col-span-4">
            <Select
              value={subBrandFilter}
              searchable={false}
              options={brandFilterOptions}
              onChange={(val) => setSubBrandFilter(String(val))}
            />
          </div>
        </div>
      </Card>

      {/* Notification Feed */}
      <Card padding="none" className="overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <BellOff className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No active notifications or reminders match this filter
            </p>
            <p className="text-xs text-slate-400">
              Click Refresh Reminders Now above to re-evaluate today&apos;s order schedule.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleNotifications.map((notif) => {
              const isRead = Boolean(notif.readBy?.includes(user.id));
              const snoozedUntil = notif.snoozedUntilBy?.[user.id] || 0;
              const isSnoozed = snoozedUntil > nowMs;
              const sevVariant =
                notif.severity === 'urgent'
                  ? 'danger'
                  : notif.severity === 'warning'
                  ? 'warning'
                  : 'info';

              return (
                <div
                  key={notif.id}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-colors ${
                    !isRead
                      ? 'bg-amber-50/40 dark:bg-amber-950/15'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        !isRead ? 'bg-[#D4AF37]' : 'bg-slate-200 dark:bg-slate-700'
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {notif.title}
                        </span>
                        {notif.subBrand && (
                          <SubBrandBadge subBrand={notif.subBrand} subBrands={subBrands} />
                        )}
                        <Badge variant={sevVariant} size="xs">
                          {notif.severity || 'info'}
                        </Badge>
                        <Badge variant="neutral" size="xs">
                          {notif.category === 'reminder' ? 'Reminder' : 'Event'}
                        </Badge>
                        {isSnoozed && (
                          <Badge variant="neutral" size="xs">
                            <Clock className="w-2.5 h-2.5" />
                            Snoozed until {new Date(snoozedUntil).toLocaleDateString()}
                          </Badge>
                        )}
                        <span className="text-[11px] font-mono text-slate-400 ml-auto">
                          {new Date(notif.createdAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {notif.message}
                      </p>

                      {(notif.preOrderNumber || notif.customerName || notif.customerPhone) && (
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {notif.preOrderNumber && <span>Order: {notif.preOrderNumber}</span>}
                          {notif.customerName && <span>Customer: {notif.customerName}</span>}
                          {notif.customerPhone && <span>Phone: {notif.customerPhone}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {!isRead && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => handleMarkRead([notif.id])}
                      >
                        Mark Read
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => handleSnooze(notif, 1)}
                    >
                      Snooze 1d
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => handleSnooze(notif, 3)}
                    >
                      Snooze 3d
                    </Button>
                    {notif.preOrderId && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        isLoading={loadingMsgOrderId === notif.id}
                        leftIcon={<MessageCircle className="w-3 h-3 text-emerald-600" />}
                        onClick={() => handleOpenSendUpdate(notif)}
                      >
                        Send Update
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="primary"
                      size="xs"
                      rightIcon={<ExternalLink className="w-3 h-3" />}
                      onClick={() => {
                        if (!isRead) handleMarkRead([notif.id]);
                        onNavigate?.(
                          notif.targetTab || 'preorder_list',
                          undefined,
                          notif.preOrderId || null
                        );
                      }}
                    >
                      Open
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && !loading && (
          <div className="p-3 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 text-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={loadingMore}
              onClick={() => loadNotifications(true, cursor)}
            >
              Load More Notifications
            </Button>
          </div>
        )}
      </Card>

      <CustomerMessageModal
        isOpen={Boolean(msgTargetOrder)}
        onClose={() => setMsgTargetOrder(null)}
        order={msgTargetOrder}
        user={user}
        settings={settings}
        companySettings={companySettings}
        defaultTemplateKey={msgDefaultTemplate}
      />
    </div>
  );
};

export default RemindersCenterView;
