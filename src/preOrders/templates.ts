import {
  CompanySettings,
  PreOrder,
  PreOrderMessageTemplateKey,
  PreOrderMessageTemplatesMap,
  PreOrderSettings,
  PreOrderStatus,
} from '../types';
import { formatBDT, normalizeBdPhone } from './constants';
import { buildPublicTrackingUrl } from './tracking';

export const DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES: PreOrderMessageTemplatesMap = {
  advance_received: {
    label: 'Advance Received',
    en: 'Hello {name}, thank you! We received your advance payment for Pre-Order {orderNo}. Remaining due: {due}. Expected arrival: {expectedDate}. Track live: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo}-এর অগ্রিম পেমেন্ট গ্রহণ করা হয়েছে। বকেয়া: {due}। সম্ভাব্য পৌঁছানোর তারিখ: {expectedDate}। লাইভ ট্র্যাক করুন: {link}',
  },
  order_confirmed: {
    label: 'Order Confirmed',
    en: 'Hello {name}, your Pre-Order {orderNo} is confirmed and queued for China procurement. Current status: {status}. Track here: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo} কনফার্ম করা হয়েছে এবং চায়না থেকে অর্ডারের জন্য প্রক্রিয়াধীন। বর্তমান অবস্থা: {status}। ট্র্যাক লিংক: {link}',
  },
  shipment_update: {
    label: 'Shipment Update',
    en: 'Hello {name}, update for Pre-Order {orderNo}: Status is now "{status}". Expected Bangladesh arrival: {expectedDate}. Track live: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo}-এর আপডেট: বর্তমান অবস্থা "{status}"। সম্ভাব্য পৌঁছানোর তারিখ: {expectedDate}। লাইভ ট্র্যাক করুন: {link}',
  },
  product_arrived: {
    label: 'Product Arrived',
    en: 'Great news {name}! Your Pre-Order {orderNo} has arrived in Bangladesh ({status}). Quality check & stock intake is underway. Track: {link}',
    bn: 'সুখবর {name}! আপনার প্রি-অর্ডার {orderNo} বাংলাদেশে পৌঁছেছে ({status})। স্টক রিসিভ ও কোয়ালিটি চেক চলছে। ট্র্যাক করুন: {link}',
  },
  due_payment_reminder: {
    label: 'Due Payment Reminder',
    en: 'Hello {name}, gentle reminder regarding Pre-Order {orderNo} ({status}). Remaining due balance is {due}. Please settle at your convenience. Details: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo} ({status}) সম্পর্কে বিনীত রিমাইন্ডার। আপনার বকেয়া পরিমাণ {due}। বিস্তারিত দেখুন: {link}',
  },
  ready_for_delivery: {
    label: 'Ready for Delivery',
    en: 'Hello {name}, your Pre-Order {orderNo} is now Ready for Delivery! Remaining due: {due}. Please confirm your delivery availability. Track: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo} ডেলিভারির জন্য সম্পূর্ণ প্রস্তুত! বকেয়া: {due}। ডেলিভারির সময় নিশ্চিত করুন। ট্র্যাক করুন: {link}',
  },
  delivery_confirmation: {
    label: 'Delivery Confirmation',
    en: 'Hello {name}, your Pre-Order {orderNo} has been Delivered. Thank you for shopping with us! Track summary: {link}',
    bn: 'আসসালামু আলাইকুম {name}, আপনার প্রি-অর্ডার {orderNo} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে। আমাদের সাথে থাকার জন্য ধন্যবাদ! বিস্তারিত: {link}',
  },
  delay_notice: {
    label: 'Delay Notice',
    en: 'Hello {name}, we sincerely apologize for a slight transit delay on Pre-Order {orderNo} ({status}). Updated expected arrival: {expectedDate}. Live tracking: {link}',
    bn: 'আসসালামু আলাইকুম {name}, প্রি-অর্ডার {orderNo} ({status})-এর শিপমেন্টে সাময়িক বিলম্বের জন্য আমরা আন্তরিকভাবে দুঃখিত। নতুন সম্ভাব্য তারিখ: {expectedDate}। লাইভ ট্র্যাকিং: {link}',
  },
};

export const DEFAULT_PRE_ORDER_SETTINGS: PreOrderSettings = {
  id: 'preOrderSettings',
  enableArrivalSoonReminder: true,
  enableArrivalTodayReminder: true,
  enableDelayReminder: true,
  enableDueReminder: true,
  enableReadyDeliveryReminder: true,
  arrivalReminderDays: 3,
  dueReminderDays: 7,
  delayGraceDays: 0,
  readyWaitingDays: 2,
  receivedNotConvertedDays: 3,
  messageTemplates: DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES,
  updatedAt: 0,
};

export function mergeWithDefaultPreOrderSettings(raw?: Partial<PreOrderSettings> | null): PreOrderSettings {
  const mergedTemplates = { ...DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES };
  if (raw?.messageTemplates) {
    (Object.keys(DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES) as PreOrderMessageTemplateKey[]).forEach((k) => {
      if (raw.messageTemplates?.[k]) {
        mergedTemplates[k] = {
          label: raw.messageTemplates[k].label || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES[k].label,
          en: raw.messageTemplates[k].en || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES[k].en,
          bn: raw.messageTemplates[k].bn || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES[k].bn,
        };
      }
    });
  }

  return {
    ...DEFAULT_PRE_ORDER_SETTINGS,
    ...(raw || {}),
    id: 'preOrderSettings',
    arrivalReminderDays: Math.max(1, Math.round(Number(raw?.arrivalReminderDays ?? DEFAULT_PRE_ORDER_SETTINGS.arrivalReminderDays))),
    dueReminderDays: Math.max(1, Math.round(Number(raw?.dueReminderDays ?? DEFAULT_PRE_ORDER_SETTINGS.dueReminderDays))),
    delayGraceDays: Math.max(0, Math.round(Number(raw?.delayGraceDays ?? DEFAULT_PRE_ORDER_SETTINGS.delayGraceDays))),
    readyWaitingDays: Math.max(1, Math.round(Number(raw?.readyWaitingDays ?? DEFAULT_PRE_ORDER_SETTINGS.readyWaitingDays))),
    receivedNotConvertedDays: Math.max(1, Math.round(Number(raw?.receivedNotConvertedDays ?? DEFAULT_PRE_ORDER_SETTINGS.receivedNotConvertedDays))),
    messageTemplates: mergedTemplates,
  };
}

export function renderPreOrderTemplate(
  templateText: string,
  order: Pick<
    PreOrder,
    'customerName' | 'preOrderNumber' | 'status' | 'dueAmount' | 'trackingToken' | 'estimatedDeliveryDate'
  >,
  companySettings?: CompanySettings | null
): string {
  const link = order.trackingToken
    ? buildPublicTrackingUrl(order.trackingToken, companySettings?.publicAppUrl)
    : 'N/A';

  const replacements: Record<string, string> = {
    '{name}': order.customerName || 'Customer',
    '{orderNo}': order.preOrderNumber || '',
    '{status}': order.status || '',
    '{due}': formatBDT(order.dueAmount || 0),
    '{link}': link,
    '{expectedDate}': order.estimatedDeliveryDate || 'TBA',
  };

  let output = templateText || '';
  Object.entries(replacements).forEach(([placeholder, val]) => {
    output = output.split(placeholder).join(val);
  });
  return output;
}

export function getDefaultTemplateKeyForStatus(status?: PreOrderStatus): PreOrderMessageTemplateKey {
  switch (status) {
    case 'Advance Received':
      return 'advance_received';
    case 'Order Confirmed':
      return 'order_confirmed';
    case 'Arrived in Bangladesh':
    case 'Received in Stock':
      return 'product_arrived';
    case 'Ready for Delivery':
    case 'Out for Delivery':
      return 'ready_for_delivery';
    case 'Delivered':
      return 'delivery_confirmation';
    default:
      return 'shipment_update';
  }
}

export function buildCustomerWhatsAppHref(rawPhone: string, message: string): string {
  const norm = normalizeBdPhone(rawPhone || '');
  const waNumber = norm.startsWith('01') ? `88${norm}` : norm;
  return `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
}

export function buildCustomerSmsHref(rawPhone: string, message: string): string {
  const norm = normalizeBdPhone(rawPhone || '');
  return `sms:${norm}?body=${encodeURIComponent(message)}`;
}
