import {
  CompanySettings,
  PreOrder,
  PreOrderPayment,
  PreOrderShipmentEvent,
  PreOrderStatusHistory,
  PublicTrackingPaymentItem,
  PublicTrackingRecord,
  PublicTrackingShipmentEvent,
  PublicTrackingTimelineItem,
} from '../types';
import { BRAND_LOGOS, BRAND_NAMES, getSubBrandCompanyInfo } from '../utils/brandLogos';
import { formatBDT, normalizeBdPhone } from './constants';

export const DEFAULT_PUBLIC_APP_URL = 'https://sat-erp.vercel.app';
export const DEFAULT_TRACKING_AUTO_EXPIRY_DAYS = 90;

export const DEFAULT_TRACKING_SHARE_TEMPLATE_EN =
  'Hello {firstName}, track your {brandName} pre-order ({orderId}) for {productName} anytime: {trackingUrl}';

export const DEFAULT_TRACKING_SHARE_TEMPLATE_BN =
  'হ্যালো {firstName}, আপনার {brandName} প্রি-অর্ডার ({orderId} — {productName}) এর লাইভ আপডেট দেখতে নিচের লিংকে ক্লিক করুন: {trackingUrl}';

/**
 * Generates a 256-bit cryptographically random URL-safe token (43 chars base64url).
 * Never derives from PO numbers, phone numbers, timestamps, or Math.random().
 */
export function generateSecureTrackingToken(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
    throw new Error(
      'Cryptographically secure random generator (crypto.getRandomValues) is unavailable.'
    );
  }
  const bytes = new Uint8Array(32); // 256-bit entropy
  cryptoObj.getRandomValues(bytes);

  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');

  // Convert to RFC 4648 base64url without padding -> always 43 chars (>= 43 chars)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Checks whether a token meets minimum format & entropy length (>= 24 legacy or >= 43 modern; reject empty/path-traversal).
 */
export function isSafeTrackingTokenFormat(token?: string | null): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  return /^[A-Za-z0-9_-]{24,128}$/.test(trimmed);
}

/**
 * Extracts customer first name ONLY (never full name or phone).
 */
export function extractCustomerFirstName(fullName?: string): string {
  const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Customer';
  const parts = cleaned.split(' ');
  return parts[0] || 'Customer';
}

/**
 * Validates that publicAppUrl is a clean https:// origin/base URL.
 */
export function isValidHttpsUrl(raw?: string | null): boolean {
  if (!raw || !raw.trim()) return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:' && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL used in href/src to block javascript:, data:text/html, or malformed schemes.
 */
export function sanitizePublicHref(raw?: string | null): string {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function sanitizePublicImageUrl(raw?: string | null, fallback = ''): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith('/')) return trimmed;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  const safeUrl = sanitizePublicHref(trimmed);
  return safeUrl || fallback;
}

/**
 * Builds the public tracking URL from CompanySettings.publicAppUrl + token.
 * Returns empty string if base URL is invalid/empty or token missing.
 */
export function buildPublicTrackingUrl(
  publicAppUrl?: string | null,
  token?: string | null
): string {
  if (!token || !token.trim()) return '';
  if (!isValidHttpsUrl(publicAppUrl)) return '';
  const cleanBase = publicAppUrl!.trim().replace(/\/+$/, '');
  return `${cleanBase}/track/${encodeURIComponent(token.trim())}`;
}

export function renderTrackingShareMessage(
  template: string,
  order: Pick<
    PreOrder,
    'customerName' | 'preOrderNumber' | 'productName' | 'subBrand' | 'status' | 'totalAmount' | 'advancePaid' | 'dueAmount'
  >,
  trackingUrl: string,
  companySettings?: CompanySettings | null
): string {
  const brandInfo = getSubBrandCompanyInfo(order.subBrand || 'SAT', companySettings);
  const firstName = extractCustomerFirstName(order.customerName);
  const replacements: Record<string, string> = {
    '{customerName}': order.customerName || firstName,
    '{firstName}': firstName,
    '{orderId}': order.preOrderNumber || '',
    '{preOrderNo}': order.preOrderNumber || '',
    '{productName}': order.productName || '',
    '{brandName}': brandInfo.companyName || BRAND_NAMES[order.subBrand] || 'Sky Automation Tech',
    '{status}': order.status || '',
    '{trackingUrl}': trackingUrl,
    '{totalAmount}': formatBDT(order.totalAmount),
    '{advancePaid}': formatBDT(order.advancePaid),
    '{dueAmount}': formatBDT(order.dueAmount),
  };

  let output = template || DEFAULT_TRACKING_SHARE_TEMPLATE_EN;
  for (const [key, val] of Object.entries(replacements)) {
    output = output.split(key).join(val);
  }
  return output;
}

export function buildWhatsAppShareHref(phone?: string, message?: string): string {
  const norm = normalizeBdPhone(phone || '');
  const waPhone = norm.startsWith('01') && norm.length === 11 ? `88${norm}` : norm;
  const encoded = encodeURIComponent(message || '');
  if (waPhone) {
    return `https://wa.me/${waPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function buildSmsShareHref(phone?: string, message?: string): string {
  const norm = normalizeBdPhone(phone || '');
  const encoded = encodeURIComponent(message || '');
  return norm ? `sms:${norm}?body=${encoded}` : `sms:?body=${encoded}`;
}

/**
 * Returns minimal disabled payload that strips ALL customer/order data when link is disabled.
 */
export function buildDisabledPublicTrackingDoc(now: number = Date.now()): PublicTrackingRecord {
  return {
    enabled: false,
    updatedAt: now,
  };
}

export interface BuildWhitelistedPublicTrackingInput {
  order: PreOrder;
  payments: PreOrderPayment[];
  statusHistory: PreOrderStatusHistory[];
  shipmentEvents: PreOrderShipmentEvent[];
  postConversionPayments?: Array<{ date: number; amount: number; method: string; isPreOrderAdvance?: boolean }>;
  companySettings?: CompanySettings | null;
  now?: number;
}

/**
 * STRICT WHITELIST-ONLY builder for `publicTracking/{token}`.
 * Drops ALL internal/PII/cost/staff fields explicitly. Only ever outputs the audited public contract.
 */
export function buildWhitelistedPublicTrackingDoc(
  input: BuildWhitelistedPublicTrackingInput
): PublicTrackingRecord {
  const { order, payments, statusHistory, shipmentEvents, companySettings } = input;
  const now = input.now ?? Date.now();

  if (order.trackingEnabled === false) {
    return buildDisabledPublicTrackingDoc(now);
  }

  const subBrand = order.subBrand || 'SAT';
  const brandInfo = getSubBrandCompanyInfo(subBrand, companySettings);
  const subBrandCustom = companySettings?.subBrandDetails?.[subBrand];

  // Customer-friendly status timeline ONLY (oldest -> newest)
  const sanitizedStatusHistory: PublicTrackingTimelineItem[] = [...statusHistory]
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0))
    .map((h) => {
      const item: PublicTrackingTimelineItem = {
        status: h.toStatus,
        timestamp: Number(h.timestamp || 0),
      };
      if (h.publicMessage && h.publicMessage.trim()) {
        item.publicMessage = h.publicMessage.trim();
      }
      return item;
    });

  // Fallback entry if order somehow has empty statusHistory
  if (sanitizedStatusHistory.length === 0) {
    sanitizedStatusHistory.push({
      status: order.status,
      timestamp: Number(order.createdAt || now),
    });
  }

  // Public shipment events ONLY where showToCustomer === true (newest first)
  const sanitizedShipmentEvents: PublicTrackingShipmentEvent[] = shipmentEvents
    .filter((ev) => ev.showToCustomer === true)
    .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
    .map((ev) => ({
      date: String(ev.date || ''),
      time: ev.time ? String(ev.time) : '',
      timestamp: Number(ev.timestamp || 0),
      message: String((ev.publicMessage || ev.text || '').trim()),
    }))
    .filter((ev) => ev.message.length > 0);

  // Payment history: VERIFIED non-reversed customer entries ONLY (no txn IDs, no receipt URLs, no staff names)
  const reversedIds = new Set(
    payments
      .filter((p) => p.type === 'reversal' && p.reversesPaymentId)
      .map((p) => String(p.reversesPaymentId))
  );

  const sanitizedPostConversion: PublicTrackingPaymentItem[] = (input.postConversionPayments || [])
    .filter((p) => !p.isPreOrderAdvance && Number(p.amount || 0) > 0)
    .map((p) => ({
      date: Number(p.date || now),
      amount: Number(p.amount || 0),
      type: 'installment' as const,
      method: String(p.method || 'Cash'),
    }));

  const sanitizedPaymentHistory: PublicTrackingPaymentItem[] = [
    ...payments
      .filter(
        (p) =>
          p.status === 'verified' &&
          (p.type === 'advance' ||
            p.type === 'installment' ||
            p.type === 'additional' ||
            p.type === 'refund') &&
          !reversedIds.has(p.id)
      )
      .map((p) => ({
        date: Number(p.receivedAt || p.createdAt || now),
        amount: Number(p.amount || 0),
        type: p.type as 'advance' | 'installment' | 'additional' | 'refund',
        method: String(p.method || 'Cash'),
      })),
    ...sanitizedPostConversion,
  ].sort((a, b) => b.date - a.date);

  const defaultBrandLogo = BRAND_LOGOS[subBrand] || '/sat_logo.jpg';
  const brandLogoUrl = sanitizePublicImageUrl(brandInfo.logoUrl, defaultBrandLogo);
  const productImageUrl = sanitizePublicImageUrl(order.productImage, '');

  const showCourier = Boolean(
    order.showCourierTrackingToCustomer ?? companySettings?.defaultShowCourierTracking ?? false
  );

  const whitelisted: PublicTrackingRecord = {
    enabled: true,
    preOrderNo: String(order.preOrderNumber || ''),
    subBrand,
    brandName: String(brandInfo.companyName || BRAND_NAMES[subBrand] || 'Sky Automation Tech'),
    brandLogoUrl,
    productName: String(order.productName || ''),
    ...(productImageUrl ? { productImageUrl } : {}),
    ...(order.variant?.trim() ? { variant: order.variant.trim() } : {}),
    ...(order.color?.trim() ? { color: order.color.trim() } : {}),
    ...(order.model?.trim() ? { model: order.model.trim() } : {}),
    qty: Number(order.qty || 1),
    status: order.status,
    statusHistory: sanitizedStatusHistory,
    shipmentEvents: sanitizedShipmentEvents,
    ...(order.estimatedDeliveryDate?.trim()
      ? { estimatedArrivalDate: order.estimatedDeliveryDate.trim() }
      : {}),
    totalAmount: Number(order.totalAmount || 0),
    advancePaid: Number(order.advancePaid || 0),
    dueAmount: Number(order.dueAmount || 0),
    refundedAmount: Number(order.refundedAmount || 0),
    paymentHistory: sanitizedPaymentHistory,
    ...(order.notes?.trim() ? { publicNote: order.notes.trim() } : {}),
    supportContact: {
      phone: String(subBrandCustom?.phone || brandInfo.phone || '').trim(),
      whatsapp: String(
        subBrandCustom?.whatsapp ||
          companySettings?.paymentMethodsInfo?.whatsappContact ||
          brandInfo.whatsappContact ||
          brandInfo.phone ||
          ''
      ).trim(),
      email: String(subBrandCustom?.email || brandInfo.email || '').trim(),
    },
    customerFirstName: extractCustomerFirstName(order.customerName),
    updatedAt: now,
  };

  if (showCourier) {
    if (order.courier?.trim()) whitelisted.courier = order.courier.trim();
    if (order.trackingNumber?.trim()) whitelisted.trackingNumber = order.trackingNumber.trim();
    const safeCarrierUrl = sanitizePublicHref(order.carrierTrackingUrl);
    if (safeCarrierUrl) whitelisted.carrierTrackingUrl = safeCarrierUrl;
  }

  return whitelisted;
}
