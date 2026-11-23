import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Info,
  MessageCircle,
  MessageSquare,
  Send,
} from 'lucide-react';
import {
  CompanySettings,
  PreOrder,
  PreOrderMessageTemplateKey,
  PreOrderSettings,
  UserProfile,
} from '../../types';
import {
  DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES,
  buildCustomerSmsHref,
  buildCustomerWhatsAppHref,
  getDefaultTemplateKeyForStatus,
  renderPreOrderTemplate,
} from '../../preOrders/templates';
import {
  actorFromUser,
  getPreOrderSettings,
  logCustomerMessagePrepared,
} from '../../firebase/preOrderDb';
import {
  Button,
  FormField,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';

export interface CustomerMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Pick<
    PreOrder,
    | 'id'
    | 'preOrderNumber'
    | 'customerName'
    | 'customerPhone'
    | 'customerWhatsapp'
    | 'status'
    | 'dueAmount'
    | 'trackingToken'
    | 'estimatedDeliveryDate'
  > | null;
  user: UserProfile;
  settings?: PreOrderSettings | null;
  companySettings?: CompanySettings | null;
  defaultTemplateKey?: PreOrderMessageTemplateKey;
  onLogged?: () => void;
}

export const CustomerMessageModal: React.FC<CustomerMessageModalProps> = ({
  isOpen,
  onClose,
  order,
  user,
  settings: propSettings,
  companySettings,
  defaultTemplateKey,
  onLogged,
}) => {
  const toast = useToast();
  const [settings, setSettings] = useState<PreOrderSettings | null>(propSettings || null);
  const [templateKey, setTemplateKey] = useState<PreOrderMessageTemplateKey>('shipment_update');
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [messageText, setMessageText] = useState('');
  const [copied, setCopied] = useState(false);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    if (propSettings) {
      setSettings(propSettings);
      return;
    }
    if (isOpen) {
      getPreOrderSettings().then(setSettings).catch(() => {});
    }
  }, [isOpen, propSettings]);

  const templatesMap = settings?.messageTemplates || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES;

  useEffect(() => {
    if (!isOpen || !order) return;
    const initialKey = defaultTemplateKey || getDefaultTemplateKeyForStatus(order.status);
    setTemplateKey(initialKey);
    const tpl = templatesMap[initialKey] || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES.shipment_update;
    setMessageText(renderPreOrderTemplate(tpl[language], order, companySettings));
    setCopied(false);
  }, [isOpen, order?.id, defaultTemplateKey]);

  const handleSelectTemplate = (nextKey: PreOrderMessageTemplateKey, nextLang: 'en' | 'bn') => {
    setTemplateKey(nextKey);
    setLanguage(nextLang);
    if (!order) return;
    const tpl = templatesMap[nextKey] || DEFAULT_PRE_ORDER_MESSAGE_TEMPLATES.shipment_update;
    setMessageText(renderPreOrderTemplate(tpl[nextLang], order, companySettings));
  };

  const targetPhone = useMemo(() => {
    if (!order) return '';
    return order.customerWhatsapp || order.customerPhone || '';
  }, [order]);

  const waHref = useMemo(() => buildCustomerWhatsAppHref(targetPhone, messageText), [targetPhone, messageText]);
  const smsHref = useMemo(
    () => buildCustomerSmsHref(order?.customerPhone || targetPhone, messageText),
    [order?.customerPhone, targetPhone, messageText]
  );

  const recordLog = async (channel: 'whatsapp' | 'sms' | 'copy') => {
    if (!order) return;
    setLogging(true);
    try {
      await logCustomerMessagePrepared(
        order.id,
        { channel, templateKey, language, messageText },
        actorFromUser(user)
      );
      onLogged?.();
    } catch (err) {
      console.warn('Could not log customer message preparation:', err);
    } finally {
      setLogging(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      await recordLog('copy');
      toast.success('Copied', 'Message copied & logged to timeline.');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Copy Failed', 'Could not access clipboard.');
    }
  };

  if (!order) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Send Customer Update · ${order.preOrderNumber}`}
      subtitle={`${order.customerName} (${order.customerPhone}) · Status: ${order.status}`}
      size="lg"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Template" className="sm:col-span-2">
            <Select
              value={templateKey}
              searchable={false}
              options={(Object.keys(templatesMap) as PreOrderMessageTemplateKey[]).map((key) => ({
                value: key,
                label: templatesMap[key].label,
              }))}
              onChange={(val) =>
                handleSelectTemplate(val as PreOrderMessageTemplateKey, language)
              }
            />
          </FormField>

          <FormField label="Language">
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleSelectTemplate(templateKey, 'en')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => handleSelectTemplate(templateKey, 'bn')}
                className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  language === 'bn'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                বাংলা
              </button>
            </div>
          </FormField>
        </div>

        <FormField
          label="Message Preview (Editable before sending)"
          hint="Variables: {name} {orderNo} {status} {due} {link} {expectedDate}"
        >
          <Textarea
            rows={5}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write customer message..."
          />
        </FormField>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300">
          <Info size={15} className="shrink-0 mt-0.5 text-amber-500" />
          <p className="leading-relaxed">
            No automatic WhatsApp or SMS gateway is active. Clicking below opens your device&apos;s WhatsApp or SMS app pre-filled and logs a{' '}
            <span className="font-mono font-semibold">&quot;Message prepared/sent&quot;</span> entry in the order audit &amp; timeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              leftIcon={copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              onClick={handleCopy}
              disabled={!messageText.trim() || logging}
            >
              {copied ? 'Copied & Logged' : 'Copy Message'}
            </Button>

            <a
              href={smsHref}
              onClick={() => {
                recordLog('sms');
                toast.success('SMS Opened', 'Prepared SMS & logged to order timeline.');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white transition-colors"
            >
              <MessageSquare size={14} />
              <span>Open SMS</span>
            </a>

            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                recordLog('whatsapp');
                toast.success('WhatsApp Opened', 'Prepared message & logged to order timeline.');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
            >
              <MessageCircle size={14} />
              <span>Send via WhatsApp</span>
              <Send size={12} />
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CustomerMessageModal;
