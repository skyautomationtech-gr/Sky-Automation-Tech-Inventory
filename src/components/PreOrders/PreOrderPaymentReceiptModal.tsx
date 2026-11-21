import React, { useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Download, Printer, X } from 'lucide-react';
import { CompanySettings, PreOrder, PreOrderPayment } from '../../types';
import { getCompanySettings } from '../../firebase/db';
import { getSubBrandCompanyInfo } from '../../utils/brandLogos';
import { formatBDT } from '../../preOrders/constants';
import { calculatePreOrderFinancials } from '../../preOrders/calculations';
import { Button, Modal, useToast } from '../../design-system';

export interface PreOrderPaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  payment: PreOrderPayment | null;
  companySettings?: CompanySettings | null;
}

function formatReceiptDateTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPaymentTypeLabel(type: PreOrderPayment['type']): string {
  switch (type) {
    case 'advance':
      return 'Advance Deposit';
    case 'installment':
      return 'Installment Payment';
    case 'additional':
      return 'Additional Payment';
    case 'refund':
      return 'Customer Refund';
    case 'reversal':
      return 'Ledger Reversal';
    default:
      return String(type);
  }
}

export const PreOrderPaymentReceiptModal: React.FC<PreOrderPaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  payment,
  companySettings: propSettings,
}) => {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const [resolvedSettings, setResolvedSettings] = useState<CompanySettings | null>(
    propSettings || null
  );

  useEffect(() => {
    if (propSettings) {
      setResolvedSettings(propSettings);
      return;
    }
    if (isOpen && !resolvedSettings) {
      getCompanySettings()
        .then((s) => {
          if (s) setResolvedSettings(s);
        })
        .catch(() => {});
    }
  }, [isOpen, propSettings, resolvedSettings]);

  if (!isOpen || !order || !payment) return null;

  const brandInfo = getSubBrandCompanyInfo(order.subBrand || 'SAT', resolvedSettings);
  const netPaid = calculatePreOrderFinancials({
    qty: order.qty,
    sellingUnitPrice: order.sellingUnitPrice,
    deliveryCharge: order.deliveryCharge,
    discount: order.discount,
    payments: [
      { type: 'advance', status: 'verified', amount: order.advancePaid || 0 },
      { type: 'refund', status: 'verified', amount: order.refundedAmount || 0 },
    ],
  }).verifiedNetPaid;

  const isRefundOrReversal = payment.type === 'refund' || payment.type === 'reversal';
  const receiptTitle =
    payment.type === 'refund'
      ? 'CUSTOMER REFUND VOUCHER'
      : payment.type === 'reversal'
      ? 'PAYMENT REVERSAL MEMO'
      : 'PRE-ORDER PAYMENT RECEIPT';

  const handlePrint = () => {
    const printEl = document.getElementById('preorder-receipt-print-area');
    if (!printEl) return;

    const printWin = window.open('', '_blank', 'width=820,height=900');
    if (!printWin) {
      window.print();
      return;
    }

    printWin.document.open();
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${order.preOrderNumber} Receipt - ${payment.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #ffffff; color: #000000; font-family: Arial, Helvetica, sans-serif; padding: 20px; }
    @page { size: A4; margin: 12mm; }
  </style>
</head>
<body>
  ${printEl.outerHTML}
</body>
</html>`);
    printWin.document.close();
    setTimeout(() => {
      printWin.focus();
      printWin.print();
      printWin.close();
    }, 250);
  };

  const handleDownloadPdf = async () => {
    const element = document.getElementById('preorder-receipt-print-area');
    if (!element) return;

    setDownloading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794,
        onclone: (clonedDoc) => {
          // Strip any global oklch() declarations in cloned style sheets to avoid html2canvas CSS parser errors
          const styleElements = clonedDoc.querySelectorAll('style');
          styleElements.forEach((style) => {
            if (style.innerHTML && style.innerHTML.includes('oklch')) {
              style.innerHTML = style.innerHTML.replace(/oklch\([^)]+\)/gi, 'rgba(0, 0, 0, 0)');
            }
          });
          const allInlineOklch = clonedDoc.querySelectorAll('[style*="oklch"]');
          allInlineOklch.forEach((el) => {
            const s = el.getAttribute('style');
            if (s) {
              el.setAttribute('style', s.replace(/oklch\([^)]+\)/gi, 'rgba(0, 0, 0, 0)'));
            }
          });
        },
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
        while (heightLeft > 5) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }

      const fileName = `${order.preOrderNumber}-Receipt-${payment.id.slice(-8)}.pdf`;
      pdf.save(fileName);
      toast.success(`Downloaded ${fileName}`);
    } catch (err: any) {
      console.error('Receipt PDF generation failed:', err);
      toast.error(err?.message || 'Failed to generate receipt PDF.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Receipt"
      subtitle={`${order.preOrderNumber} • ${brandInfo.companyName}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button type="button" variant="secondary" onClick={onClose} leftIcon={<X className="w-4 h-4" />}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              Print
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={downloading}
              onClick={handleDownloadPdf}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Download PDF
            </Button>
          </div>
        </div>
      }
    >
      {/* STRICT BLACK & WHITE HEX-ONLY RECEIPT SURFACE (ZERO OKLCH) */}
      <div
        style={{
          backgroundColor: '#f3f4f6',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid #d1d5db',
          overflowX: 'auto',
        }}
      >
        <div
          id="preorder-receipt-print-area"
          style={{
            backgroundColor: '#ffffff',
            color: '#000000',
            width: '100%',
            maxWidth: '680px',
            margin: '0 auto',
            padding: '28px 32px',
            border: '2px solid #000000',
            fontFamily: 'Arial, Helvetica, sans-serif',
            fontSize: '12px',
            lineHeight: '1.5',
          }}
        >
          {/* Header: Sub-Brand Logo & Company Info */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #000000',
              paddingBottom: '14px',
              marginBottom: '16px',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <img
                src={brandInfo.logoUrl}
                alt={brandInfo.companyName}
                crossOrigin="anonymous"
                style={{
                  width: '54px',
                  height: '54px',
                  objectFit: 'contain',
                  border: '1px solid #000000',
                  padding: '3px',
                  backgroundColor: '#ffffff',
                  filter: 'grayscale(100%)',
                }}
              />
              <div>
                <div
                  style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    letterSpacing: '0.3px',
                    color: '#000000',
                  }}
                >
                  {brandInfo.companyName}
                </div>
                <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                  {brandInfo.address}
                </div>
                <div style={{ fontSize: '11px', color: '#374151' }}>
                  Phone: {brandInfo.phone} | Email: {brandInfo.email}
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  border: '1.5px solid #000000',
                  backgroundColor: '#000000',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.8px',
                }}
              >
                {receiptTitle}
              </div>
              <div
                style={{
                  marginTop: '6px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#000000',
                }}
              >
                Pre-Order: {order.preOrderNumber}
              </div>
              <div style={{ fontSize: '10px', color: '#4b5563', fontFamily: 'monospace' }}>
                Receipt ID: {payment.id}
              </div>
            </div>
          </div>

          {/* Customer & Order Meta Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px',
              marginBottom: '16px',
              padding: '12px',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: '#4b5563',
                  marginBottom: '4px',
                }}
              >
                Customer Details
              </div>
              <div style={{ fontWeight: 700, fontSize: '13px', color: '#000000' }}>
                {order.customerName}
              </div>
              <div style={{ fontFamily: 'monospace', color: '#111827' }}>
                Phone: {order.customerPhone}
              </div>
              {order.customerCode && (
                <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#4b5563' }}>
                  ID: {order.customerCode}
                </div>
              )}
              <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                {order.customerAddress}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  color: '#4b5563',
                  marginBottom: '4px',
                }}
              >
                Pre-Order Item & Receipt Info
              </div>
              <div style={{ fontWeight: 700, color: '#000000' }}>
                {order.productName} (Qty: {order.qty})
              </div>
              <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                Sub-Brand: <strong>{order.subBrand}</strong> | Status: <strong>{order.status}</strong>
              </div>
              <div style={{ fontSize: '11px', color: '#374151', marginTop: '2px' }}>
                Received Date: {formatReceiptDateTime(payment.receivedAt || payment.createdAt)}
              </div>
              <div style={{ fontSize: '11px', color: '#374151' }}>
                Verification: <strong style={{ textTransform: 'uppercase' }}>{payment.status}</strong>
              </div>
            </div>
          </div>

          {/* Payment Entry Table */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              marginBottom: '16px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px' }}>
                  Description
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px' }}>
                  Method
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px' }}>
                  Transaction ID / Ref
                </th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '11px' }}>
                  Amount (BDT)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td style={{ padding: '10px', color: '#000000' }}>
                  <div style={{ fontWeight: 700 }}>{getPaymentTypeLabel(payment.type)}</div>
                  {payment.note && (
                    <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '2px' }}>
                      {payment.note}
                    </div>
                  )}
                </td>
                <td style={{ padding: '10px', color: '#000000', fontWeight: 600 }}>
                  {payment.method}
                </td>
                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#000000' }}>
                  {payment.referenceNo || '—'}
                </td>
                <td
                  style={{
                    padding: '10px',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: '14px',
                    color: '#000000',
                  }}
                >
                  {isRefundOrReversal ? '-' : ''}
                  {formatBDT(payment.amount)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Order Financial Balance Box */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, fontSize: '11px', color: '#374151' }}>
              <div>
                <strong>Collected / Recorded By:</strong> {payment.recordedByName || payment.recordedBy}
              </div>
              {payment.verifiedByName && (
                <div style={{ marginTop: '3px' }}>
                  <strong>Verified By:</strong> {payment.verifiedByName} (
                  {formatReceiptDateTime(payment.verifiedAt)})
                </div>
              )}
              {payment.status === 'pending' && (
                <div
                  style={{
                    marginTop: '6px',
                    padding: '6px 8px',
                    border: '1px dashed #000000',
                    backgroundColor: '#f9fafb',
                    fontSize: '10px',
                    fontWeight: 700,
                    color: '#000000',
                  }}
                >
                  NOTE: This entry is currently PENDING VERIFICATION and is excluded from verified balance totals until approved.
                </div>
              )}
              <div style={{ marginTop: '8px', fontSize: '10px', color: '#6b7280' }}>
                * Advance & installment deposits are held as customer pre-order deposits until final fulfillment.
              </div>
            </div>

            <div
              style={{
                width: '250px',
                border: '1.5px solid #000000',
                padding: '10px 12px',
                backgroundColor: '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#374151' }}>Order Total:</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {formatBDT(order.totalAmount)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#374151' }}>Total Verified Paid (Net):</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {formatBDT(netPaid)}
                </span>
              </div>
              {(order.refundedAmount || 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ color: '#374151' }}>Total Refunded:</span>
                  <span style={{ fontFamily: 'monospace' }}>
                    {formatBDT(order.refundedAmount)}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1.5px solid #000000',
                  paddingTop: '6px',
                  marginTop: '6px',
                  fontSize: '13px',
                  fontWeight: 800,
                }}
              >
                <span>BALANCE DUE:</span>
                <span style={{ fontFamily: 'monospace' }}>{formatBDT(order.dueAmount)}</span>
              </div>
            </div>
          </div>

          {/* Footer Signature Line */}
          <div
            style={{
              marginTop: '26px',
              paddingTop: '12px',
              borderTop: '1px solid #d1d5db',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              fontSize: '10px',
              color: '#4b5563',
            }}
          >
            <div>Printed on {formatReceiptDateTime(Date.now())}</div>
            <div style={{ textAlign: 'center', width: '160px' }}>
              <div style={{ borderTop: '1px solid #000000', paddingTop: '4px', color: '#000000' }}>
                Authorized Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PreOrderPaymentReceiptModal;
