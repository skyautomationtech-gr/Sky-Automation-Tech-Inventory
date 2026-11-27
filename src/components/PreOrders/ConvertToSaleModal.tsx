import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Receipt,
} from 'lucide-react';
import {
  CompanySettings,
  PreOrder,
  PreOrderPrivateCost,
  SubBrand,
  UserProfile,
} from '../../types';
import { isLegacySatCode, resolveSubBrandMeta } from '../../utils/subBrands';
import {
  computeItemCostMap,
  formatBDT,
  formatPreOrderProductLabel,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import {
  calculateActualShippingCost,
  calculateSaleConversionBreakdown,
} from '../../preOrders/calculations';
import {
  ConvertPreOrderToSaleResult,
  actorFromUser,
  convertPreOrderToSale,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';

export interface ConvertToSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  privateCost?: PreOrderPrivateCost | null;
  user: UserProfile;
  companySettings?: CompanySettings | null;
  subBrands?: SubBrand[];
  onSuccess: (res: ConvertPreOrderToSaleResult) => void;
}

const COURIER_OPTIONS = [
  { value: 'Pathao', label: 'Pathao' },
  { value: 'Steadfast', label: 'Steadfast' },
  { value: 'RedX', label: 'RedX' },
  { value: 'Sundarban', label: 'Sundarban' },
  { value: 'SA Paribahan', label: 'SA Paribahan' },
  { value: 'Self Pickup', label: 'Self Pickup' },
];

export const ConvertToSaleModal: React.FC<ConvertToSaleModalProps> = ({
  isOpen,
  onClose,
  order,
  privateCost,
  user,
  companySettings,
  subBrands,
  onSuccess,
}) => {
  const toast = useToast();
  const [courier, setCourier] = useState('Pathao');
  const [trackingNo, setTrackingNo] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createdResult, setCreatedResult] =
    useState<ConvertPreOrderToSaleResult | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      setCourier(order.courier || 'Pathao');
      setTrackingNo(order.trackingNumber || '');
      setDeliveryAddress(order.customerAddress || '');
      setNotes(`Converted from Pre-Order ${order.preOrderNumber}`);
      setErrorMsg('');
      setCreatedResult(null);
    }
  }, [isOpen, order]);

  const orderItems = useMemo(() => normalizePreOrderItems(order), [order]);

  const unreceivedItems = useMemo(() => {
    if (!order) return [];
    return orderItems.filter((it) => {
      const rec =
        Number(it.receivedQty ?? (orderItems.length === 1 ? order.stockReceivedQty : 0)) || 0;
      const dmg =
        Number(it.damagedQty ?? (orderItems.length === 1 ? order.damagedQty : 0)) || 0;
      return rec + dmg < it.qty;
    });
  }, [order, orderItems]);

  const convertibleLines = useMemo(() => {
    if (!order) return [];
    return orderItems
      .map((it) => {
        const sellQty = Math.max(
          0,
          Number(
            it.receivedQty ??
              (orderItems.length === 1 ? order.stockReceivedQty || order.qty : 0)
          ) || 0
        );
        return { ...it, sellQty };
      })
      .filter((it) => it.sellQty > 0);
  }, [order, orderItems]);

  const sellQtyTotal = useMemo(
    () => convertibleLines.reduce((s, it) => s + it.sellQty, 0),
    [convertibleLines]
  );

  const breakdown = useMemo(() => {
    if (!order) return null;
    const shipTotal =
      calculateActualShippingCost(privateCost?.shippingExpenses) ||
      Number(privateCost?.actualShippingCost || 0) ||
      Number(privateCost?.shippingCost || 0);

    const costMapObj = computeItemCostMap(order, privateCost);
    const itemChinaCostsByItemId = Object.fromEntries(
      Object.entries(costMapObj).map(([k, v]) => [k, v.chinaUnitCost])
    );

    const unitLandedCostsByItemId: Record<string, number> = {};
    convertibleLines.forEach((it) => {
      const fallbackLanded =
        orderItems.length === 1 ? order.unitLandedCost : undefined;
      const uCost = it.unitLandedCost ?? fallbackLanded;
      if (uCost !== undefined && uCost > 0) {
        unitLandedCostsByItemId[it.itemId] = uCost;
      }
    });

    return calculateSaleConversionBreakdown({
      items: convertibleLines.map((it) => ({ ...it, qty: it.sellQty })),
      qty: sellQtyTotal,
      sellingUnitPrice: order.sellingUnitPrice,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      verifiedNetPaid: order.advancePaid,
      unitLandedCostsByItemId,
      itemChinaCostsByItemId,
      fallbackChinaUnitCost: Number(privateCost?.chinaUnitCost || 0),
      fallbackShippingCost: shipTotal,
    });
  }, [order, privateCost, convertibleLines, orderItems.length, sellQtyTotal]);

  if (!order) return null;

  const resolvedBrand = resolveSubBrandMeta(order.subBrand, subBrands, companySettings);
  const legacyKey = (order.subBrand || '').trim().toLowerCase();
  const invSeries =
    resolvedBrand?.invoicePrefix ||
    companySettings?.prefixes?.[order.subBrand] ||
    (companySettings?.prefixes as Record<string, string> | undefined)?.[legacyKey] ||
    `${order.subBrand || 'INV'}-INV`;
  const blockedLegacySat = isLegacySatCode(order.subBrand);
  const blockedPendingReceipt = unreceivedItems.length > 0 && !order.stockReceived;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || blockedPendingReceipt || blockedLegacySat) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await convertPreOrderToSale(
        order.id,
        {
          courier: courier.trim() || 'Pathao',
          courierTrackingNumber: trackingNo.trim() || undefined,
          deliveryAddress:
            deliveryAddress.trim() || order.customerAddress || 'N/A',
          notes: notes.trim() || undefined,
        },
        actorFromUser(user)
      );
      setCreatedResult(res);
      toast.success(
        res.alreadyConverted
          ? `Already converted to ${res.invoiceNumber}.`
          : `Converted ${order.preOrderNumber} -> Sales Order & Invoice ${res.invoiceNumber}!`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess(res);
    } catch (err: any) {
      const msg = err?.message || 'Conversion failed.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Convert Pre-Order to Sale & Invoice"
      subtitle={`${order.preOrderNumber} • ${order.customerName}`}
      size="lg"
    >
      {createdResult ? (
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
              Sale &amp; Invoice Created Successfully
            </div>
            <div className="font-mono text-lg font-black text-slate-900 dark:text-white">
              {createdResult.invoiceNumber}
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              Reserved stock has been deducted, customer advance transferred, and remaining due ({formatBDT(createdResult.order?.amountDue || 0)}) can now be collected via Invoices / Due Payments.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4">
          {blockedLegacySat && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <div className="font-bold">Legacy SAT Brand Must Be Reassigned</div>
                <p className="mt-0.5">
                  Sky Automation Tech (SAT) is the parent importer company and does not issue customer invoices. Edit this Pre-Order and select an active selling sub-brand before converting to a sale.
                </p>
              </div>
            </div>
          )}

          {blockedPendingReceipt && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <div className="font-bold">All items must be received before conversion</div>
                <p className="mt-0.5">
                  Pending stock receipt:{' '}
                  <strong>
                    {unreceivedItems.map((it) => it.productName).join(', ')}
                  </strong>
                  . Receive remaining units first so one Sales Order &amp; Invoice is billed cleanly.
                </p>
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {formatPreOrderProductLabel(order)} ({sellQtyTotal} pcs across {convertibleLines.length} line{convertibleLines.length === 1 ? '' : 's'})
              </span>
              <Badge variant="gold" size="xs">
                Series: {invSeries}
              </Badge>
            </div>

            {convertibleLines.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500">
                    <tr>
                      <th className="px-2.5 py-1.5">Item</th>
                      <th className="px-2.5 py-1.5 text-right">Qty</th>
                      <th className="px-2.5 py-1.5 text-right">Unit Price</th>
                      <th className="px-2.5 py-1.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {convertibleLines.map((line) => (
                      <tr key={line.itemId}>
                        <td className="px-2.5 py-1.5">
                          <div className="font-medium text-slate-800 dark:text-slate-100">
                            {line.productName}
                          </div>
                          {(line.model || line.variant || line.color) && (
                            <div className="text-[10px] text-slate-400">
                              {[line.model, line.variant, line.color]
                                .filter(Boolean)
                                .join(' / ')}
                            </div>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-bold">
                          {line.sellQty}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono">
                          {formatBDT(line.sellingUnitPrice)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-bold">
                          {formatBDT(line.sellQty * line.sellingUnitPrice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {breakdown && (
              <div className="grid grid-cols-2 gap-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800 font-mono">
                <span className="text-slate-500">Items Subtotal:</span>
                <span className="text-right font-medium">
                  {formatBDT(breakdown.subtotal)}
                </span>
                {breakdown.deliveryCharge > 0 && (
                  <>
                    <span className="text-slate-500">Delivery Charge:</span>
                    <span className="text-right">
                      +{formatBDT(breakdown.deliveryCharge)}
                    </span>
                  </>
                )}
                {breakdown.discount > 0 && (
                  <>
                    <span className="text-slate-500">Discount:</span>
                    <span className="text-right text-rose-600">
                      -{formatBDT(breakdown.discount)}
                    </span>
                  </>
                )}
                <span className="text-slate-500 font-semibold">Order Total:</span>
                <span className="text-right font-bold">
                  {formatBDT(breakdown.totalAmount)}
                </span>
                <span className="text-slate-500">Verified Advance Applied:</span>
                <span className="text-right font-bold text-emerald-600">
                  - {formatBDT(breakdown.advanceApplied)}
                </span>
                <span className="text-slate-500">Remaining Due on Invoice:</span>
                <span className="text-right font-bold text-amber-700 dark:text-amber-400">
                  {formatBDT(breakdown.remainingDue)}
                </span>
                {privateCost && (
                  <>
                    <span className="text-slate-500">Recognized Landed COGS:</span>
                    <span className="text-right text-slate-600 dark:text-slate-300">
                      {formatBDT(breakdown.totalCogs)}
                    </span>
                    <span className="text-slate-500">Realized Gross Profit:</span>
                    <span
                      className={`text-right font-bold ${
                        breakdown.recognizedProfit >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {formatBDT(breakdown.recognizedProfit)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-200 flex items-start gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Converting creates one Sales Order &amp; Invoice, moves customer advance from Liability into recognized Sales Income (৳0 cash change), deducts reserved stock, and locks pre-order price &amp; quantities.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Delivery Courier">
              <Select
                options={COURIER_OPTIONS}
                value={courier}
                onChange={(val) => setCourier(val)}
                searchable={false}
              />
            </FormField>
            <FormField label="BD Courier Tracking # (Optional)">
              <Input
                value={trackingNo}
                onChange={(e) => setTrackingNo(e.target.value)}
                placeholder="Tracking ID..."
              />
            </FormField>
          </div>

          <FormField label="Delivery Address" required>
            <Input
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="Customer delivery address"
            />
          </FormField>

          <FormField label="Order / Invoice Notes (Optional)">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={submitting}
              disabled={blockedPendingReceipt || blockedLegacySat || convertibleLines.length === 0}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              leftIcon={<Receipt className="w-4 h-4" />}
            >
              Convert &amp; Generate Invoice
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ConvertToSaleModal;
