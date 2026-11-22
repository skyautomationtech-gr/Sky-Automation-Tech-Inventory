import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  Lock,
  Receipt,
} from 'lucide-react';
import {
  CompanySettings,
  PreOrder,
  PreOrderPrivateCost,
  UserProfile,
} from '../../types';
import { formatBDT } from '../../preOrders/constants';
import { calculateSaleConversionBreakdown } from '../../preOrders/calculations';
import {
  actorFromUser,
  convertPreOrderToSale,
  ConvertPreOrderToSaleResult,
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

  const sellQty = Math.max(0, Number(order?.stockReceivedQty) || order?.qty || 0);

  const breakdown = useMemo(() => {
    if (!order) return null;
    const shipTotal =
      Number(privateCost?.actualShippingCost) > 0
        ? Number(privateCost?.actualShippingCost)
        : Number(privateCost?.shippingCost || 0);
    const unitLanded =
      Number(order.unitLandedCost) > 0
        ? Number(order.unitLandedCost)
        : order.qty > 0
        ? (Number(privateCost?.chinaUnitCost || 0) * order.qty + shipTotal) /
          order.qty
        : 0;

    return calculateSaleConversionBreakdown({
      qty: sellQty,
      sellingUnitPrice: order.sellingUnitPrice,
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      verifiedNetPaid: order.advancePaid,
      unitLandedCost: unitLanded,
    });
  }, [order, privateCost, sellQty]);

  if (!order) return null;

  const prefixMap: Record<string, string> = {
    SAT: companySettings?.prefixes?.sat || 'SAT-INV',
    GZ: companySettings?.prefixes?.gz || 'GZ-INV',
    RTX: companySettings?.prefixes?.rtx || 'RTX-INV',
  };
  const invSeries = prefixMap[order.subBrand] || `${order.subBrand}-INV`;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await convertPreOrderToSale(
        order.id,
        {
          courier: courier.trim() || 'Pathao',
          courierTrackingNumber: trackingNo.trim() || undefined,
          deliveryAddress: deliveryAddress.trim() || order.customerAddress || 'N/A',
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
      size="md"
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
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-100">
                {order.productName} ({sellQty} pcs)
              </span>
              <Badge variant="gold" size="xs">
                Series: {invSeries}
              </Badge>
            </div>
            {breakdown && (
              <div className="grid grid-cols-2 gap-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800 font-mono">
                <span className="text-slate-500">Order Total:</span>
                <span className="text-right font-bold">
                  {formatBDT(breakdown.totalAmount)}
                </span>
                <span className="text-slate-500">Verified Advance Applied:</span>
                <span className="text-right font-bold text-emerald-600">
                  - {formatBDT(breakdown.appliedAdvance)}
                </span>
                <span className="text-slate-500">Remaining Due on Invoice:</span>
                <span className="text-right font-bold text-amber-700 dark:text-amber-400">
                  {formatBDT(breakdown.remainingDue)}
                </span>
                {privateCost && (
                  <>
                    <span className="text-slate-500">Recognized Landed COGS:</span>
                    <span className="text-right text-slate-600 dark:text-slate-300">
                      {formatBDT(breakdown.totalLandedCogs)}
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
              Converting moves the pre-order advance from Liability into recognized Sales Income (৳0 cash change), deducts reserved stock, and locks pre-order price &amp; quantity.
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
