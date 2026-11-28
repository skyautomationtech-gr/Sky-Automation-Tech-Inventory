import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Globe,
  Mail,
  MessageCircle,
  Moon,
  Package,
  Phone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sun,
  Truck,
  XCircle,
} from 'lucide-react';
import { PreOrderStatus, PublicTrackingRecord } from '../../types';
import { PRE_ORDER_FORWARD_FLOW, formatBDT, normalizeBdPhone } from '../../preOrders/constants';
import { sanitizePublicHref, sanitizePublicImageUrl } from '../../preOrders/tracking';
import { PublicTrackingFetchResult, getPublicTrackingByToken } from '../../firebase/preOrderDb';

export interface PublicTrackingPortalProps {
  token: string;
}

type Lang = 'en' | 'bn';

const STAGE_LABELS_BN: Record<PreOrderStatus, string> = {
  'Advance Received': 'অগ্রিম গ্রহণ হয়েছে',
  'Order Confirmed': 'অর্ডার কনফার্ম',
  'Ordered from China': 'চায়নায় অর্ডার সম্পন্ন',
  'China Warehouse': 'চায়না ওয়্যারহাউস',
  'International Shipment': 'আন্তর্জাতিক শিপমেন্ট',
  'Customs Clearance': 'কাস্টমস ক্লিয়ারেন্স',
  'Arrived in Bangladesh': 'বাংলাদেশে পৌঁছেছে',
  'Received in Stock': 'স্টকে রিসিভ হয়েছে',
  'Ready for Delivery': 'ডেলিভারির জন্য প্রস্তুত',
  'Out for Delivery': 'ডেলিভারিম্যান রওনা হয়েছে',
  Delivered: 'ডেলিভারি সম্পন্ন',
  Cancelled: 'বাতিল হয়েছে',
  Refunded: 'রিফান্ড সম্পন্ন',
};

const PAYMENT_TYPE_LABELS: Record<
  'advance' | 'installment' | 'additional' | 'refund',
  { en: string; bn: string }
> = {
  advance: { en: 'Advance', bn: 'অগ্রিম' },
  installment: { en: 'Installment', bn: 'কিস্তি' },
  additional: { en: 'Additional Payment', bn: 'অতিরিক্ত পেমেন্ট' },
  refund: { en: 'Refund', bn: 'রিফান্ড' },
};

const COPY = {
  en: {
    orderId: 'Order ID',
    hello: 'Hello',
    qty: 'Qty',
    orderedItemsTitle: 'Ordered Items',
    itemsCount: (n: number, q: number) => `${n} item${n === 1 ? '' : 's'} · ${q} pcs`,
    progressTitle: 'Order Progress',
    stepOf: (step: number, total: number) => `Step ${step} of ${total}`,
    expectedArrival: 'Expected Arrival',
    arrivalPending: 'Schedule update pending',
    deliveredOnSchedule: 'Delivered',
    arrivingToday: 'Expected today',
    daysRemaining: (d: number) => `${d} day${d === 1 ? '' : 's'} remaining`,
    schedulePassed: 'In final transit — schedule updating soon',
    courierTitle: 'Courier & Dispatch Tracking',
    courierLabel: 'Courier',
    trackingNoLabel: 'Tracking No.',
    trackCourier: 'Track on Carrier',
    copied: 'Copied',
    timelineTitle: 'Live Updates Timeline',
    noUpdatesYet: 'Your order is confirmed. Tracking updates will appear here as your parcel progresses.',
    showAllUpdates: (n: number) => `Show all ${n} updates`,
    showFewer: 'Show fewer updates',
    orderSummaryTitle: 'Payment Summary',
    orderTotal: 'Order Total',
    verifiedPaid: 'Advance / Verified Paid',
    remainingDue: 'Remaining Due',
    refundedLabel: 'Refunded',
    paymentHistoryTitle: 'Verified Payment History',
    noPaymentsYet: 'No verified payments recorded yet.',
    pendingNote:
      'Only verified payments are shown above. Pending transfers appear automatically once confirmed.',
    noteTitle: 'Order Note',
    supportTitle: 'Need Help With This Order?',
    whatsappBtn: 'WhatsApp Us',
    callBtn: 'Call Support',
    emailBtn: 'Email',
    lastUpdated: 'Last updated',
    refresh: 'Refresh',
    refreshing: 'Refreshing...',
    notFoundTitle: 'Tracking Link Unavailable',
    notFoundDesc:
      'This order tracking link is invalid, has been deactivated, or has expired. Please check the link or contact the store for an updated tracking link.',
    networkTitle: 'Unable to Load Tracking Status',
    retry: 'Retry',
    cancelledBannerTitle: 'This Order Was Cancelled',
    refundedBannerTitle: 'Order Cancelled & Refunded',
    poweredBy: 'Powered by Sky Automation Tech',
  },
  bn: {
    orderId: 'অর্ডার আইডি',
    hello: 'হ্যালো',
    qty: 'পরিমাণ',
    orderedItemsTitle: 'অর্ডারকৃত পণ্যসমূহ',
    itemsCount: (n: number, q: number) => `${n}টি পণ্য · মোট ${q} পিস`,
    progressTitle: 'অর্ডারের অগ্রগতি',
    stepOf: (step: number, total: number) => `ধাপ ${step} / ${total}`,
    expectedArrival: 'সম্ভাব্য পৌঁছানোর তারিখ',
    arrivalPending: 'সম্ভাব্য তারিখ শীঘ্রই আপডেট হবে',
    deliveredOnSchedule: 'ডেলিভারি সম্পন্ন',
    arrivingToday: 'আজই পৌঁছানোর কথা',
    daysRemaining: (d: number) => `আর ${d} দিন বাকি`,
    schedulePassed: 'পথে রয়েছে — আপডেট শীঘ্রই আসছে',
    courierTitle: 'কুরিয়ার ট্র্যাকিং',
    courierLabel: 'কুরিয়ার',
    trackingNoLabel: 'ট্র্যাকিং নম্বর',
    trackCourier: 'কুরিয়ারে দেখুন',
    copied: 'কপি হয়েছে',
    timelineTitle: 'আপডেট টাইমলাইন',
    noUpdatesYet: 'আপনার অর্ডারটি নিশ্চিত হয়েছে। প্রতিটি ধাপের আপডেট এখানে দেখা যাবে।',
    showAllUpdates: (n: number) => `সবগুলো (${n}টি) আপডেট দেখুন`,
    showFewer: 'কম দেখুন',
    orderSummaryTitle: 'পেমেন্ট হিসাব',
    orderTotal: 'মোট মূল্য',
    verifiedPaid: 'যাচাইকৃত পরিশোধ',
    remainingDue: 'বাকি বকেয়া',
    refundedLabel: 'রিফান্ড',
    paymentHistoryTitle: 'যাচাইকৃত পেমেন্ট তালিকা',
    noPaymentsYet: 'এখনো কোনো যাচাইকৃত পেমেন্ট যুক্ত হয়নি।',
    pendingNote:
      'শুধুমাত্র যাচাইকৃত পেমেন্টগুলো এখানে দেখানো হয়। যাচাই সম্পন্ন হলে নতুন পেমেন্ট যুক্ত হবে।',
    noteTitle: 'অর্ডার নোট',
    supportTitle: 'সহায়তা প্রয়োজন?',
    whatsappBtn: 'হোয়াটসঅ্যাপ',
    callBtn: 'কল করুন',
    emailBtn: 'ইমেইল',
    lastUpdated: 'সর্বশেষ আপডেট',
    refresh: 'রিফ্রেশ',
    refreshing: 'আপডেট হচ্ছে...',
    notFoundTitle: 'ট্র্যাকিং লিংকটি কার্যকর নয়',
    notFoundDesc:
      'এই ট্র্যাকিং লিংকটি সঠিক নয়, নিষ্ক্রিয় করা হয়েছে অথবা মেয়াদ শেষ হয়েছে। অনুগ্রহ করে সঠিক লিংক যাচাই করুন অথবা স্টোরের সাথে যোগাযোগ করুন।',
    networkTitle: 'তথ্য লোড করা যাচ্ছে না',
    retry: 'আবার চেষ্টা করুন',
    cancelledBannerTitle: 'এই অর্ডারটি বাতিল করা হয়েছে',
    refundedBannerTitle: 'অর্ডার বাতিল ও টাকা ফেরত সম্পন্ন',
    poweredBy: 'Powered by Sky Automation Tech',
  },
} as const;

function upsertMetaTag(name: string, content: string): () => void {
  const selector = `meta[name="${name}"]`;
  const existing = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (existing) {
    const prev = existing.getAttribute('content') || '';
    existing.setAttribute('content', content);
    return () => {
      existing.setAttribute('content', prev);
    };
  }
  const el = document.createElement('meta');
  el.setAttribute('name', name);
  el.setAttribute('content', content);
  document.head.appendChild(el);
  return () => {
    el.remove();
  };
}

function formatDateOnly(isoOrMs: string | number): string {
  if (!isoOrMs) return '—';
  if (typeof isoOrMs === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoOrMs)) {
    const [y, m, d] = isoOrMs.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  const dt = new Date(isoOrMs);
  if (Number.isNaN(dt.getTime())) return String(isoOrMs);
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTimeShort(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getArrivalCountdownText(
  estimatedDate: string | undefined,
  status: PreOrderStatus | undefined,
  lang: Lang
): { label: string; tone: 'neutral' | 'gold' | 'emerald' } {
  const c = COPY[lang];
  if (status === 'Delivered') {
    return { label: c.deliveredOnSchedule, tone: 'emerald' };
  }
  if (!estimatedDate || !/^\d{4}-\d{2}-\d{2}$/.test(estimatedDate)) {
    return { label: c.arrivalPending, tone: 'neutral' };
  }
  const [y, m, d] = estimatedDate.split('-').map(Number);
  const etaUtc = Date.UTC(y, m - 1, d);
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((etaUtc - todayUtc) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: c.arrivingToday, tone: 'gold' };
  if (diffDays > 0) return { label: c.daysRemaining(diffDays), tone: 'gold' };
  return { label: c.schedulePassed, tone: 'neutral' };
}

export const PublicTrackingPortal: React.FC<PublicTrackingPortalProps> = ({ token }) => {
  const [lang, setLang] = useState<Lang>('en');
  // Respect system prefers-color-scheme on initial load; never touch ERP localStorage
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'not_found' }
    | { status: 'network_error'; message: string }
    | { status: 'ok'; record: PublicTrackingRecord }
  >({ status: 'loading' });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number>(Date.now());
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [copiedTrackingNo, setCopiedTrackingNo] = useState(false);

  const c = COPY[lang];

  // Clear window.name, enforce noindex/nofollow & no-referrer meta tags
  useEffect(() => {
    try {
      window.name = '';
    } catch {
      // ignore
    }
    const restoreRobots = upsertMetaTag('robots', 'noindex, nofollow');
    const restoreReferrer = upsertMetaTag('referrer', 'no-referrer');
    return () => {
      restoreRobots();
      restoreReferrer();
    };
  }, []);

  // Safe document title — NEVER include token
  useEffect(() => {
    const prevTitle = document.title;
    if (state.status === 'ok' && state.record.brandName) {
      document.title = `Track your order – ${state.record.brandName}`;
    } else {
      document.title = 'Track your order';
    }
    return () => {
      document.title = prevTitle;
    };
  }, [state]);

  const fetchTracking = useCallback(
    async (silent = false) => {
      if (silent) {
        setIsRefreshing(true);
      } else {
        setState({ status: 'loading' });
      }

      const res: PublicTrackingFetchResult = await getPublicTrackingByToken(token);
      setLastFetchedAt(Date.now());
      setIsRefreshing(false);

      if (res.status === 'ok') {
        setState({ status: 'ok', record: res.record });
      } else if (res.status === 'not_found') {
        setState({ status: 'not_found' });
      } else {
        setState((prev) =>
          silent && prev.status === 'ok'
            ? prev
            : { status: 'network_error', message: res.message }
        );
      }
    },
    [token]
  );

  // Initial fetch + quota-friendly 60s single-getDoc polling (no onSnapshot realtime listeners)
  useEffect(() => {
    fetchTracking(false);
    const interval = window.setInterval(() => {
      fetchTracking(true);
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [fetchTracking]);

  const record = state.status === 'ok' ? state.record : null;

  const combinedTimeline = useMemo(() => {
    if (!record) return [];
    type Item =
      | {
          key: string;
          kind: 'status';
          timestamp: number;
          status: PreOrderStatus;
          message: string;
        }
      | {
          key: string;
          kind: 'shipment';
          timestamp: number;
          dateLabel: string;
          message: string;
        };

    const items: Item[] = [];
    (record.statusHistory || []).forEach((s, idx) => {
      const stageText = lang === 'bn' ? STAGE_LABELS_BN[s.status] || s.status : s.status;
      items.push({
        key: `st-${idx}-${s.timestamp}`,
        kind: 'status',
        timestamp: Number(s.timestamp || 0),
        status: s.status,
        message: s.publicMessage?.trim()
          ? `${stageText} — ${s.publicMessage.trim()}`
          : stageText,
      });
    });

    (record.shipmentEvents || []).forEach((ev, idx) => {
      if (!ev.message?.trim()) return;
      items.push({
        key: `ev-${idx}-${ev.timestamp}`,
        kind: 'shipment',
        timestamp: Number(ev.timestamp || 0),
        dateLabel: [ev.date, ev.time].filter(Boolean).join(' '),
        message: ev.message.trim(),
      });
    });

    return items.sort((a, b) => b.timestamp - a.timestamp);
  }, [record, lang]);

  const visibleTimeline = showAllTimeline ? combinedTimeline : combinedTimeline.slice(0, 4);

  const stageLabel = (st: PreOrderStatus) =>
    lang === 'bn' ? STAGE_LABELS_BN[st] || st : st;

  const handleCopyTrackingNumber = async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedTrackingNo(true);
      window.setTimeout(() => setCopiedTrackingNo(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className={isDark ? 'dark' : ''}>
      <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#090d16] dark:text-slate-100 transition-colors">
        <div className="max-w-lg mx-auto px-4 py-5 pb-10 space-y-4">
          {/* Top Utility Strip (Language & Theme only — zero ERP navigation) */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>{record?.brandName || 'Order Tracking'}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLang((prev) => (prev === 'en' ? 'bn' : 'en'))}
                className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer hover:border-[#D4AF37]/60 transition-colors"
                aria-label="Toggle Language"
              >
                <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
                {lang === 'en' ? 'বাংলা' : 'English'}
              </button>

              <button
                type="button"
                onClick={() => setIsDark((d) => !d)}
                className="min-h-[44px] w-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center cursor-pointer hover:border-[#D4AF37]/60 transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* STATE 1: LOADING */}
          {state.status === 'loading' && (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
              <div className="h-36 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
              <div className="h-44 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" />
            </div>
          )}

          {/* STATE 2: NEUTRAL INVALID / DISABLED / EXPIRED */}
          {state.status === 'not_found' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-7 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
                <Package className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  {c.notFoundTitle}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  {c.notFoundDesc}
                </p>
              </div>
            </div>
          )}

          {/* STATE 3: NETWORK ERROR */}
          {state.status === 'network_error' && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-rose-200 dark:border-rose-900/60 p-7 text-center space-y-4 shadow-xs">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div className="space-y-2">
                <h1 className="text-lg font-bold text-slate-900 dark:text-white">
                  {c.networkTitle}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {state.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => fetchTracking(false)}
                className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-[#D4AF37] text-white dark:text-slate-950 text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                {c.retry}
              </button>
            </div>
          )}

          {/* STATE 4: ACTIVE ORDER TRACKING */}
          {state.status === 'ok' && record && (() => {
            const safeLogo = sanitizePublicImageUrl(record.brandLogoUrl, '/sat_logo.jpg');
            const safeProductImg = sanitizePublicImageUrl(record.productImageUrl, '');
            const status = record.status || 'Advance Received';
            const isCancelledOrRefunded = status === 'Cancelled' || status === 'Refunded';
            const forwardIndex = PRE_ORDER_FORWARD_FLOW.indexOf(status);
            const arrivalInfo = getArrivalCountdownText(
              record.estimatedArrivalDate,
              status,
              lang
            );
            const safeCarrierUrl = sanitizePublicHref(record.carrierTrackingUrl);
            const hasCourierInfo = Boolean(
              record.courier || record.trackingNumber || safeCarrierUrl
            );

            const supportPhone = record.supportContact?.phone?.trim() || '';
            const supportWaRaw = record.supportContact?.whatsapp?.trim() || '';
            const normWa = normalizeBdPhone(supportWaRaw);
            const waHref = normWa
              ? `https://wa.me/${normWa.startsWith('01') && normWa.length === 11 ? `88${normWa}` : normWa}?text=${encodeURIComponent(
                  `Hello ${record.brandName || ''}, inquiry regarding Order ${record.preOrderNo || ''}`
                )}`
              : '';
            const supportEmail = record.supportContact?.email?.trim() || '';

            return (
              <>
                {/* Brand & Order ID Header Card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-slate-950 p-1.5 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        <img
                          src={safeLogo}
                          alt={record.brandName || 'Brand'}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/sat_logo.jpg';
                          }}
                        />
                      </div>
                      <div className="min-w-0">
                        <h1 className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {record.brandName}
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {c.hello}{' '}
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            {record.customerFirstName || 'Customer'}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {c.orderId}
                      </div>
                      <div className="font-mono text-sm font-bold text-[#93741E] dark:text-[#E2C255] bg-amber-50 dark:bg-[#D4AF37]/15 border border-[#D4AF37]/30 px-2.5 py-1 rounded-lg mt-0.5">
                        {record.preOrderNo}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Product Summary Card (Multi-Item + Legacy Fallback) */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {c.orderedItemsTitle}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        status === 'Delivered'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                          : status === 'Cancelled' || status === 'Refunded'
                          ? 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                          : 'bg-amber-50 text-[#93741E] border-[#D4AF37]/40 dark:bg-[#D4AF37]/15 dark:text-[#E2C255] dark:border-[#D4AF37]/40'
                      }`}
                    >
                      {stageLabel(status)}
                    </span>
                  </div>

                  {Array.isArray(record.items) && record.items.length > 0 ? (
                    <div className="space-y-2.5">
                      {record.items.map((item, idx) => {
                        const itemImg = sanitizePublicImageUrl(item.thumbUrl || item.imageUrl, '');
                        return (
                          <div
                            key={`${item.productName}-${idx}`}
                            className="flex items-start gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800"
                          >
                            {itemImg ? (
                              <img
                                src={itemImg}
                                alt={item.productName}
                                loading="lazy"
                                decoding="async"
                                className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white dark:bg-slate-900"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                <Package className="w-5 h-5" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-start justify-between gap-2">
                                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                                  {item.productName}
                                </h2>
                                {typeof item.lineTotal === 'number' && item.lineTotal > 0 && (
                                  <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0 tabular-nums">
                                    {formatBDT(item.lineTotal)}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                                  {c.qty}: {item.qty || 1}
                                  {typeof item.sellingUnitPrice === 'number' && item.sellingUnitPrice > 0
                                    ? ` × ${formatBDT(item.sellingUnitPrice)}`
                                    : ''}
                                </span>
                                {item.variant && (
                                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                                    {item.variant}
                                  </span>
                                )}
                                {item.color && (
                                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300">
                                    {item.color}
                                  </span>
                                )}
                                {item.model && (
                                  <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-mono">
                                    {item.model}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-right tabular-nums">
                        {c.itemsCount(
                          record.items.length,
                          record.totalQty || record.qty || record.items.reduce((s, it) => s + (it.qty || 1), 0)
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3.5">
                      {safeProductImg ? (
                        <img
                          src={safeProductImg}
                          alt={record.productName || 'Ordered product'}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-100 dark:bg-slate-800"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                          <Package className="w-7 h-7" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                            {record.productName}
                          </h2>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
                            {c.qty}: {record.qty || 1}
                          </span>
                          {record.variant && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {record.variant}
                            </span>
                          )}
                          {record.color && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {record.color}
                            </span>
                          )}
                          {record.model && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                              {record.model}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Progress OR Dedicated Cancelled / Refunded Banner */}
                {isCancelledOrRefunded ? (
                  <div className="bg-rose-50 dark:bg-rose-950/30 rounded-2xl border border-rose-200 dark:border-rose-900/70 p-4 sm:p-5 space-y-2">
                    <div className="flex items-center gap-2.5 text-rose-800 dark:text-rose-200 font-bold text-sm">
                      {status === 'Refunded' ? (
                        <RotateCcw className="w-5 h-5 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 shrink-0" />
                      )}
                      <span>
                        {status === 'Refunded' ? c.refundedBannerTitle : c.cancelledBannerTitle}
                      </span>
                    </div>
                    {Number(record.refundedAmount || 0) > 0 && (
                      <p className="text-xs text-rose-700 dark:text-rose-300 tabular-nums">
                        {c.refundedLabel}: <strong>{formatBDT(record.refundedAmount || 0)}</strong>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {c.progressTitle}
                      </h3>
                      {forwardIndex >= 0 && (
                        <span className="text-xs font-mono font-bold text-[#93741E] dark:text-[#E2C255] tabular-nums">
                          {c.stepOf(forwardIndex + 1, PRE_ORDER_FORWARD_FLOW.length)}
                        </span>
                      )}
                    </div>

                    {/* Horizontal 11-segment visual bar */}
                    <div className="grid grid-cols-11 gap-1">
                      {PRE_ORDER_FORWARD_FLOW.map((stepName, idx) => {
                        const completed = forwardIndex > idx || status === 'Delivered';
                        const active = forwardIndex === idx && status !== 'Delivered';
                        return (
                          <div
                            key={stepName}
                            title={stageLabel(stepName)}
                            className={`h-2.5 rounded-full transition-colors ${
                              active
                                ? 'bg-[#D4AF37]'
                                : completed
                                ? 'bg-emerald-500'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        );
                      })}
                    </div>

                    {/* Clear vertical checklist of the 11 stages */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                      {PRE_ORDER_FORWARD_FLOW.map((stepName, idx) => {
                        const completed = forwardIndex > idx || (status === 'Delivered' && idx === forwardIndex);
                        const active = forwardIndex === idx && status !== 'Delivered';
                        return (
                          <div
                            key={stepName}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs ${
                              active
                                ? 'bg-amber-50 dark:bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] font-semibold border border-[#D4AF37]/40'
                                : completed
                                ? 'text-emerald-700 dark:text-emerald-300 font-medium'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            ) : active ? (
                              <span className="w-3.5 h-3.5 rounded-full bg-[#D4AF37] shrink-0 inline-block" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-700 shrink-0 inline-block" />
                            )}
                            <span className="truncate">{stageLabel(stepName)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expected Arrival Card */}
                {!isCancelledOrRefunded && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] flex items-center justify-center shrink-0">
                        <CalendarClock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          {c.expectedArrival}
                        </div>
                        <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                          {record.estimatedArrivalDate
                            ? formatDateOnly(record.estimatedArrivalDate)
                            : c.arrivalPending}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border shrink-0 ${
                        arrivalInfo.tone === 'emerald'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                          : arrivalInfo.tone === 'gold'
                          ? 'bg-amber-50 text-[#93741E] border-[#D4AF37]/40 dark:bg-[#D4AF37]/15 dark:text-[#E2C255] dark:border-[#D4AF37]/40'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {arrivalInfo.label}
                    </span>
                  </div>
                )}

                {/* Conditional Courier Info Card (ONLY when Admin enabled & courier data present) */}
                {hasCourierInfo && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Truck className="w-4 h-4 text-[#D4AF37]" />
                      <span>{c.courierTitle}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 text-xs">
                        {record.courier && (
                          <div>
                            <span className="text-slate-400">{c.courierLabel}: </span>
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {record.courier}
                            </span>
                          </div>
                        )}
                        {record.trackingNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">{c.trackingNoLabel}: </span>
                            <span className="font-mono font-bold text-slate-900 dark:text-white">
                              {record.trackingNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyTrackingNumber(record.trackingNumber!)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              {copiedTrackingNo ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  {c.copied}
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {safeCarrierUrl && (
                        <a
                          href={safeCarrierUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-[#D4AF37] text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          {c.trackCourier}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Combined Status + Public Shipment Timeline (Newest First) */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {c.timelineTitle}
                  </h3>

                  {visibleTimeline.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">{c.noUpdatesYet}</p>
                  ) : (
                    <div className="space-y-3">
                      {visibleTimeline.map((item, idx) => (
                        <div key={item.key} className="flex items-start gap-3">
                          <div className="flex flex-col items-center pt-1">
                            <span
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                idx === 0
                                  ? 'bg-[#D4AF37]'
                                  : item.kind === 'shipment'
                                  ? 'bg-sky-500'
                                  : 'bg-emerald-500'
                              }`}
                            />
                            {idx < visibleTimeline.length - 1 && (
                              <span className="w-px h-6 bg-slate-200 dark:bg-slate-800 mt-1" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 pb-1">
                            <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">
                              {item.message}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                              {item.timestamp
                                ? formatDateTimeShort(item.timestamp)
                                : item.kind === 'shipment'
                                ? item.dateLabel
                                : ''}
                            </p>
                          </div>
                        </div>
                      ))}

                      {combinedTimeline.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setShowAllTimeline((prev) => !prev)}
                          className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          {showAllTimeline ? (
                            <>
                              <ChevronUp className="w-4 h-4" />
                              {c.showFewer}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-4 h-4" />
                              {c.showAllUpdates(combinedTimeline.length)}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Public Note */}
                {record.publicNote && (
                  <div className="bg-amber-50/70 dark:bg-[#D4AF37]/10 rounded-2xl border border-[#D4AF37]/30 p-4 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                    <div className="font-bold uppercase tracking-wider text-[11px] text-[#93741E] dark:text-[#E2C255]">
                      {c.noteTitle}
                    </div>
                    <p className="leading-relaxed">{record.publicNote}</p>
                  </div>
                )}

                {/* Financial Summary + Verified Payments */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {c.orderSummaryTitle}
                  </h3>

                  <div className="grid grid-cols-3 gap-2.5 tabular-nums">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.orderTotal}
                      </div>
                      <div className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-white mt-0.5">
                        {formatBDT(record.totalAmount)}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60">
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        {c.verifiedPaid}
                      </div>
                      <div className="font-mono font-bold text-sm sm:text-base text-emerald-800 dark:text-emerald-300 mt-0.5">
                        {formatBDT(record.advancePaid)}
                      </div>
                    </div>

                    <div
                      className={`p-3 rounded-xl border ${
                        Number(record.dueAmount || 0) > 0
                          ? 'bg-amber-50/80 dark:bg-[#D4AF37]/15 border-[#D4AF37]/40'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200/80 dark:border-slate-800'
                      }`}
                    >
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {c.remainingDue}
                      </div>
                      <div
                        className={`font-mono font-bold text-sm sm:text-base mt-0.5 ${
                          Number(record.dueAmount || 0) > 0
                            ? 'text-[#93741E] dark:text-[#E2C255]'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {formatBDT(record.dueAmount)}
                      </div>
                    </div>
                  </div>

                  {Number(record.refundedAmount || 0) > 0 && (
                    <div className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between text-xs tabular-nums">
                      <span className="font-medium text-rose-700 dark:text-rose-300">
                        {c.refundedLabel}
                      </span>
                      <span className="font-mono font-bold text-rose-800 dark:text-rose-200">
                        {formatBDT(record.refundedAmount)}
                      </span>
                    </div>
                  )}

                  {/* Verified Payment History */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {c.paymentHistoryTitle}
                    </div>

                    {!record.paymentHistory || record.paymentHistory.length === 0 ? (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{c.noPaymentsYet}</p>
                    ) : (
                      <div className="space-y-2">
                        {record.paymentHistory.map((p, idx) => {
                          const typeCfg =
                            PAYMENT_TYPE_LABELS[p.type] || PAYMENT_TYPE_LABELS.installment;
                          const isRefund = p.type === 'refund';
                          return (
                            <div
                              key={`${p.date}-${idx}`}
                              className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 text-xs tabular-nums"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-slate-100">
                                  {typeCfg[lang]} &bull; {p.method}
                                </div>
                                <div className="text-[11px] font-mono text-slate-400">
                                  {formatDateTimeShort(p.date)}
                                </div>
                              </div>
                              <div
                                className={`font-mono font-bold shrink-0 ${
                                  isRefund
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                {isRefund ? '-' : ''}
                                {formatBDT(p.amount)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-400 leading-relaxed">{c.pendingNote}</p>
                  </div>
                </div>

                {/* Support Contact Card */}
                {(waHref || supportPhone || supportEmail) && (
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {c.supportTitle}
                    </h3>
                    <div className="flex flex-wrap gap-2.5">
                      {waHref && (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-[140px] min-h-[48px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          {c.whatsappBtn}
                        </a>
                      )}
                      {supportPhone && (
                        <a
                          href={`tel:${supportPhone.replace(/[^\d+]/g, '')}`}
                          className="flex-1 min-w-[130px] min-h-[48px] px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                        >
                          <Phone className="w-4 h-4 text-[#D4AF37]" />
                          {c.callBtn}
                        </a>
                      )}
                      {supportEmail && (
                        <a
                          href={`mailto:${supportEmail}`}
                          className="min-h-[48px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2"
                        >
                          <Mail className="w-4 h-4" />
                          {c.emailBtn}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Refresh Status Bar */}
                <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
                  <span className="font-mono">
                    {c.lastUpdated}: {formatDateTimeShort(record.updatedAt || lastFetchedAt)}
                  </span>
                  <button
                    type="button"
                    disabled={isRefreshing}
                    onClick={() => fetchTracking(true)}
                    className="min-h-[44px] px-3 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? c.refreshing : c.refresh}
                  </button>
                </div>
              </>
            );
          })()}

          {/* Neutral Brand Footer */}
          <footer className="pt-3 text-center text-[11px] text-slate-400">
            {c.poweredBy}
          </footer>
        </div>
      </div>
    </div>
  );
};

export default PublicTrackingPortal;
