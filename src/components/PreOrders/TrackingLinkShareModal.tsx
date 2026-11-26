import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  Send,
  Smartphone,
} from 'lucide-react';
import { CompanySettings, PreOrder } from '../../types';
import {
  DEFAULT_TRACKING_SHARE_TEMPLATE_BN,
  DEFAULT_TRACKING_SHARE_TEMPLATE_EN,
  buildPublicTrackingUrl,
  buildSmsShareHref,
  buildWhatsAppShareHref,
  isValidHttpsUrl,
  renderTrackingShareMessage,
} from '../../preOrders/tracking';
import { formatPreOrderProductLabel } from '../../preOrders/constants';
import { Button, Modal, Textarea, useToast } from '../../design-system';

export interface TrackingLinkShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  companySettings?: CompanySettings | null;
}

export const TrackingLinkShareModal: React.FC<TrackingLinkShareModalProps> = ({
  isOpen,
  onClose,
  order,
  companySettings,
}) => {
  const toast = useToast();
  const qrWrapperRef = useRef<HTMLDivElement>(null);

  const [templateLang, setTemplateLang] = useState<'en' | 'bn'>('en');
  const [messageText, setMessageText] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const token = (order?.trackingToken || order?.trackingTokenId || '').trim();
  const baseUrlValid = isValidHttpsUrl(companySettings?.publicAppUrl);
  const trackingUrl = useMemo(
    () => buildPublicTrackingUrl(companySettings?.publicAppUrl, token),
    [companySettings?.publicAppUrl, token]
  );

  const isDisabled = order?.trackingEnabled === false;

  useEffect(() => {
    if (!isOpen || !order) return;
    const rawTemplate =
      templateLang === 'bn'
        ? companySettings?.trackingShareTemplates?.bn || DEFAULT_TRACKING_SHARE_TEMPLATE_BN
        : companySettings?.trackingShareTemplates?.en || DEFAULT_TRACKING_SHARE_TEMPLATE_EN;

    setMessageText(
      renderTrackingShareMessage(
        rawTemplate,
        order,
        trackingUrl || '[Configure publicAppUrl in Company Settings]',
        companySettings
      )
    );
  }, [isOpen, order, templateLang, trackingUrl, companySettings]);

  if (!order) return null;

  const targetPhone = order.customerWhatsapp || order.customerPhone || '';
  const waHref = buildWhatsAppShareHref(targetPhone, messageText);
  const smsHref = buildSmsShareHref(targetPhone, messageText);

  const handleCopyUrl = async () => {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedUrl(true);
      toast.success('Tracking link copied to clipboard.');
      window.setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      toast.error('Unable to copy automatically.');
    }
  };

  const handleCopyMessage = async () => {
    if (!messageText) return;
    try {
      await navigator.clipboard.writeText(messageText);
      setCopiedMsg(true);
      toast.success('Customer message copied to clipboard.');
      window.setTimeout(() => setCopiedMsg(false), 1800);
    } catch {
      toast.error('Unable to copy automatically.');
    }
  };

  const handleDownloadQrSvg = () => {
    const svg = qrWrapperRef.current?.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.preOrderNumber || 'preorder'}-tracking-qr.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share Customer Tracking Link"
      subtitle={`${order.preOrderNumber} • ${order.customerName}`}
      size="lg"
    >
      <div className="space-y-4">
        {!baseUrlValid && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Public Base URL not configured:</strong> Set a valid{' '}
              <span className="font-mono">https://</span> URL in Company Settings before copying or sharing tracking links.
            </span>
          </div>
        )}

        {isDisabled && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              This tracking link is currently <strong>disabled</strong>. Visitors opening it will see the unavailable/expired page until re-enabled by an Admin.
            </span>
          </div>
        )}

        {/* URL Box + Copy + Preview */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Secret Customer Tracking URL
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200 truncate select-all">
              {trackingUrl || 'Unavailable (configure publicAppUrl or generate token)'}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!trackingUrl}
              leftIcon={copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={handleCopyUrl}
            >
              {copiedUrl ? 'Copied' : 'Copy Link'}
            </Button>
            {trackingUrl && !isDisabled && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#D4AF37]" />
                Preview
              </a>
            )}
          </div>
        </div>

        {/* Two-column layout: QR Code + Message Composer */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* QR Card */}
          <div className="md:col-span-5 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <QrCode className="w-3.5 h-3.5 text-[#D4AF37]" />
              Scan to Track
            </div>
            {trackingUrl ? (
              <>
                <div
                  ref={qrWrapperRef}
                  className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs"
                >
                  <QRCodeSVG
                    value={trackingUrl}
                    size={168}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#0F172A"
                  />
                </div>
                <div className="text-xs">
                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {order.preOrderNumber}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                    {formatPreOrderProductLabel(order)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="xs"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={handleDownloadQrSvg}
                >
                  Download QR (SVG)
                </Button>
              </>
            ) : (
              <div className="py-10 text-xs text-slate-400">
                QR code becomes available once a valid HTTPS URL & token are configured.
              </div>
            )}
          </div>

          {/* WhatsApp / SMS Composer */}
          <div className="md:col-span-7 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Customer Share Message
              </span>
              <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setTemplateLang('en')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    templateLang === 'en'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateLang('bn')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    templateLang === 'bn'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  বাংলা
                </button>
              </div>
            </div>

            <Textarea
              rows={5}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={copiedMsg ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                onClick={handleCopyMessage}
              >
                {copiedMsg ? 'Copied Message' : 'Copy Message'}
              </Button>

              {trackingUrl && !isDisabled ? (
                <>
                  <a
                    href={waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send on WhatsApp
                  </a>
                  <a
                    href={smsHref}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Send SMS
                  </a>
                </>
              ) : (
                <Button type="button" variant="primary" size="sm" disabled leftIcon={<Send className="w-3.5 h-3.5" />}>
                  Share Disabled
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TrackingLinkShareModal;
