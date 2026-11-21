import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Paperclip,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  PreOrder,
  PreOrderSupplierPayment,
  PreOrderSupplierPaymentAllocation,
  Supplier,
  UserProfile,
} from '../../types';
import { formatBDT, getTodayIsoDate, isPreOrderAdminRole } from '../../preOrders/constants';
import { fromPaisa, roundMoney, toPaisa } from '../../preOrders/calculations';
import { uploadPreOrderDocument, validatePreOrderDocumentFile } from '../../preOrders/imageUpload';
import {
  actorFromUser,
  addPreOrderSupplierPayment,
  reversePreOrderSupplierPayment,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  CurrencyInput,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';

const SUPPLIER_PAYMENT_METHODS = [
  { value: 'bKash', label: 'bKash' },
  { value: 'Bank', label: 'Bank Transfer / Wire' },
  { value: 'Alipay', label: 'Alipay' },
  { value: 'WeChat Pay', label: 'WeChat Pay' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Other', label: 'Other' },
];

const CURRENCY_OPTIONS = [
  { value: 'BDT', label: 'BDT (৳)' },
  { value: 'RMB', label: 'RMB (¥ Chinese Yuan)' },
  { value: 'USD', label: 'USD ($ US Dollar)' },
];

export interface RecordSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  supplierOrders: PreOrder[];
  preSelectedOrderId?: string;
  suggestedAmountBdt?: number;
  user: UserProfile;
  onSuccess: () => void;
}

export const RecordSupplierPaymentModal: React.FC<RecordSupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  supplier,
  supplierOrders,
  preSelectedOrderId,
  suggestedAmountBdt,
  user,
  onSuccess,
}) => {
  const toast = useToast();

  const [currency, setCurrency] = useState<'BDT' | 'RMB' | 'USD'>('RMB');
  const [originalAmount, setOriginalAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState('17.2');
  const [amountBdtInput, setAmountBdtInput] = useState('');
  const [method, setMethod] = useState('Alipay');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(getTodayIsoDate());
  const [note, setNote] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptName, setReceiptName] = useState('');
  const [allowUnallocated, setAllowUnallocated] = useState(false);
  const [allocMap, setAllocMap] = useState<Record<string, string>>({});
  const [sessionIdempotencyKey, setSessionIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const allocatableOrders = useMemo(
    () =>
      supplierOrders.filter(
        (o) => o.status !== 'Cancelled' && o.status !== 'Refunded'
      ),
    [supplierOrders]
  );

  useEffect(() => {
    if (isOpen && supplier) {
      setSessionIdempotencyKey(
        `SP_${supplier.id.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      );
      setCurrency('BDT');
      setExchangeRate('17.2');
      const initBdt = suggestedAmountBdt && suggestedAmountBdt > 0 ? String(suggestedAmountBdt) : '';
      setOriginalAmount(initBdt);
      setAmountBdtInput(initBdt);
      setMethod('Bank');
      setReferenceNo('');
      setDate(getTodayIsoDate());
      setNote('');
      setReceiptFile(null);
      setReceiptName('');
      setErrorMsg('');

      if (preSelectedOrderId) {
        setAllowUnallocated(false);
        setAllocMap({ [preSelectedOrderId]: initBdt });
      } else {
        setAllowUnallocated(allocatableOrders.length === 0);
        setAllocMap({});
      }
    }
  }, [isOpen, supplier, preSelectedOrderId, suggestedAmountBdt, allocatableOrders.length]);

  // Auto-calculate BDT when non-BDT currency or rate changes
  const handleCurrencyChange = (nextCurr: 'BDT' | 'RMB' | 'USD') => {
    setCurrency(nextCurr);
    if (nextCurr === 'BDT') {
      if (amountBdtInput) setOriginalAmount(amountBdtInput);
    } else {
      const defaultRate = nextCurr === 'RMB' ? '17.2' : '121';
      setExchangeRate(defaultRate);
      const origNum = Number(originalAmount || 0);
      if (origNum > 0) {
        const calcBdt = roundMoney(origNum * Number(defaultRate));
        setAmountBdtInput(String(calcBdt));
      }
    }
  };

  const handleOriginalAmountChange = (val: string) => {
    setOriginalAmount(val);
    const origNum = Number(val || 0);
    if (currency === 'BDT') {
      setAmountBdtInput(val);
      if (preSelectedOrderId && allocMap[preSelectedOrderId] !== undefined) {
        setAllocMap((prev) => ({ ...prev, [preSelectedOrderId]: val }));
      }
    } else {
      const rateNum = Number(exchangeRate || 0);
      if (origNum > 0 && rateNum > 0) {
        const calcBdt = String(roundMoney(origNum * rateNum));
        setAmountBdtInput(calcBdt);
        if (preSelectedOrderId && allocMap[preSelectedOrderId] !== undefined) {
          setAllocMap((prev) => ({ ...prev, [preSelectedOrderId]: calcBdt }));
        }
      }
    }
  };

  const handleRateChange = (val: string) => {
    setExchangeRate(val);
    if (currency !== 'BDT') {
      const origNum = Number(originalAmount || 0);
      const rateNum = Number(val || 0);
      if (origNum > 0 && rateNum > 0) {
        const calcBdt = String(roundMoney(origNum * rateNum));
        setAmountBdtInput(calcBdt);
      }
    }
  };

  const totalBdtPaisa = toPaisa(amountBdtInput);
  const selectedOrderIds = Object.keys(allocMap);
  const allocatedPaisa = selectedOrderIds.reduce(
    (sum, id) => sum + Math.max(0, toPaisa(allocMap[id])),
    0
  );
  const allocationDiffPaisa = totalBdtPaisa - allocatedPaisa;

  const toggleOrderAllocation = (order: PreOrder) => {
    setAllocMap((prev) => {
      const copy = { ...prev };
      if (copy[order.id] !== undefined) {
        delete copy[order.id];
      } else {
        const remaining = Math.max(0, fromPaisa(totalBdtPaisa - allocatedPaisa));
        copy[order.id] = remaining > 0 ? String(remaining) : '';
      }
      return copy;
    });
    setAllowUnallocated(false);
    setErrorMsg('');
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validatePreOrderDocumentFile(file);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setReceiptFile(file);
    setReceiptName(file.name);
    setErrorMsg('');
  };

  if (!supplier) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    const bdtVal = roundMoney(amountBdtInput);
    const origVal = currency === 'BDT' ? bdtVal : roundMoney(originalAmount);

    if (bdtVal <= 0 || origVal <= 0) {
      setErrorMsg('Please enter a valid payment amount greater than ৳0.');
      return;
    }
    if (!date) {
      setErrorMsg('Payment date is required.');
      return;
    }
    if (method !== 'Cash' && !referenceNo.trim()) {
      setErrorMsg(`Transaction / Reference ID is required for ${method}.`);
      return;
    }

    let allocations: PreOrderSupplierPaymentAllocation[] = [];
    if (!allowUnallocated) {
      if (selectedOrderIds.length === 0) {
        setErrorMsg('Select at least one Pre-Order to allocate this payment, or choose General Unallocated.');
        return;
      }
      allocations = selectedOrderIds.map((id) => {
        const ord = allocatableOrders.find((o) => o.id === id);
        return {
          preOrderId: id,
          preOrderNumber: ord?.preOrderNumber || id,
          amountBdt: roundMoney(allocMap[id]),
        };
      });
      if (allocations.some((a) => a.amountBdt <= 0)) {
        setErrorMsg('Every selected Pre-Order allocation must be greater than ৳0.');
        return;
      }
      if (allocatedPaisa !== totalBdtPaisa) {
        setErrorMsg(
          `Allocation mismatch: allocated ৳${fromPaisa(allocatedPaisa).toLocaleString()} must equal total ৳${bdtVal.toLocaleString()}.`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      let receiptUrl = '';
      if (receiptFile) {
        const uploadTarget =
          allocations.length === 1 ? allocations[0].preOrderId : `supplier_${supplier.id}`;
        const uploaded = await uploadPreOrderDocument(uploadTarget, receiptFile);
        receiptUrl = uploaded.url;
      }

      await addPreOrderSupplierPayment(
        {
          supplierId: supplier.id,
          supplierName: supplier.name,
          amount: origVal,
          currency,
          exchangeRate: currency === 'BDT' ? 1 : Number(exchangeRate || 1),
          amountBdt: bdtVal,
          method,
          referenceNo: referenceNo.trim(),
          receiptUrl,
          note: note.trim(),
          date,
          idempotencyKey: sessionIdempotencyKey,
          allocations,
        },
        actorFromUser(user)
      );

      toast.success(
        `Recorded supplier payment of ${formatBDT(bdtVal)} to ${supplier.name}.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to record supplier payment.';
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
      title="Record Supplier Payment"
      subtitle={`${supplier.name} (${supplier.supplierCode || 'Supplier'}) • Append-only ledger`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-2">
          <span>
            Category: <strong className="text-slate-900 dark:text-slate-100">Pre-Order Supplier Payment</strong> (isolated from General Accounting until Part 6)
          </span>
          <Badge variant="gold" size="xs">BDT Accounting</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Original Currency">
            <Select
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => handleCurrencyChange(val as 'BDT' | 'RMB' | 'USD')}
              searchable={false}
            />
          </FormField>

          {currency !== 'BDT' ? (
            <>
              <FormField label={`Amount (${currency})`} required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={originalAmount}
                  onChange={(e) => handleOriginalAmountChange(e.target.value)}
                  placeholder="e.g. 2500"
                  className="font-mono font-bold"
                />
              </FormField>
              <FormField label={`Rate (1 ${currency} = ৳ BDT)`} required>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={exchangeRate}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="font-mono"
                />
              </FormField>
            </>
          ) : (
            <FormField label="Payment Date" required className="sm:col-span-2">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FormField label="Accounting Amount (৳ BDT)" required>
            <CurrencyInput
              min={0}
              step="0.01"
              value={amountBdtInput}
              onChange={(e) => {
                setAmountBdtInput(e.target.value);
                if (currency === 'BDT') setOriginalAmount(e.target.value);
              }}
              placeholder="0"
            />
          </FormField>

          <FormField label="Payment Method" required>
            <Select
              options={SUPPLIER_PAYMENT_METHODS}
              value={method}
              onChange={(val) => setMethod(String(val))}
              searchable={false}
            />
          </FormField>

          {currency !== 'BDT' ? (
            <FormField label="Payment Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
          ) : (
            <FormField label="Transaction / Ref ID" required={method !== 'Cash'}>
              <Input
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder={method === 'Cash' ? 'Optional voucher ref' : 'TxID / Bank Ref'}
                className="font-mono"
              />
            </FormField>
          )}
        </div>

        {currency !== 'BDT' && (
          <FormField label="Transaction / Reference ID" required={method !== 'Cash'}>
            <Input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder={method === 'Cash' ? 'Optional voucher ref' : 'Alipay / WeChat / Bank TxID'}
              className="font-mono"
            />
          </FormField>
        )}

        {/* Order Allocation Picker */}
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 bg-slate-50/40 dark:bg-slate-950/30">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                Allocate to Pre-Orders
              </div>
              <div className="text-[11px] text-slate-500">
                Link one or more Pre-Orders. Sum of allocations must match Total BDT.
              </div>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={allowUnallocated}
                onChange={(e) => {
                  setAllowUnallocated(e.target.checked);
                  if (e.target.checked) setAllocMap({});
                }}
                className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              Unallocated advance
            </label>
          </div>

          {!allowUnallocated && (
            <>
              {allocatableOrders.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                  No active Pre-Orders found for this supplier. Check "Unallocated advance" above to record an advance payment.
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900">
                  {allocatableOrders.map((ord) => {
                    const isChecked = allocMap[ord.id] !== undefined;
                    return (
                      <div
                        key={ord.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOrderAllocation(ord)}
                            className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                {ord.preOrderNumber}
                              </span>
                              <Badge variant="neutral" size="xs">
                                {ord.status}
                              </Badge>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {ord.productName} (Qty {ord.qty})
                            </div>
                          </div>
                        </label>
                        {isChecked && (
                          <div className="w-36 shrink-0">
                            <CurrencyInput
                              min={0}
                              step="0.01"
                              value={allocMap[ord.id]}
                              onChange={(e) =>
                                setAllocMap((prev) => ({ ...prev, [ord.id]: e.target.value }))
                              }
                              placeholder="৳ BDT"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedOrderIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 tabular-nums">
                  <span className="text-slate-500">
                    Allocated:{' '}
                    <strong className="font-mono text-slate-900 dark:text-slate-100">
                      {formatBDT(fromPaisa(allocatedPaisa))}
                    </strong>{' '}
                    / {formatBDT(fromPaisa(totalBdtPaisa))}
                  </span>
                  {allocationDiffPaisa === 0 && totalBdtPaisa > 0 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Matched
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400 font-semibold font-mono">
                      Difference: {formatBDT(fromPaisa(allocationDiffPaisa))}
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Receipt / Slip Upload (Optional, <=5MB)">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 flex-1 truncate">
                <Paperclip className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                <span className="truncate">{receiptName || 'Attach JPG/PNG/PDF'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={handleReceiptSelect}
                />
              </label>
              {receiptFile && (
                <button
                  type="button"
                  onClick={() => {
                    setReceiptFile(null);
                    setReceiptName('');
                  }}
                  className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                  title="Remove receipt"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </FormField>

          <FormField label="Note (Optional)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. 50% factory deposit batch #4"
            />
          </FormField>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={submitting}
            leftIcon={<Banknote className="w-4 h-4" />}
          >
            Save Supplier Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export interface ReverseSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PreOrderSupplierPayment | null;
  user: UserProfile;
  onSuccess: () => void;
}

export const ReverseSupplierPaymentModal: React.FC<ReverseSupplierPaymentModalProps> = ({
  isOpen,
  onClose,
  payment,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setErrorMsg('');
    }
  }, [isOpen, payment?.id]);

  if (!payment) return null;
  const isAdmin = isPreOrderAdminRole(user.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !isAdmin) return;
    if (!reason.trim()) {
      setErrorMsg('Reversal reason is required.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      await reversePreOrderSupplierPayment(payment.id, reason.trim(), actorFromUser(user));
      toast.success(`Reversed supplier payment of ${formatBDT(payment.amountBdt)}.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to reverse supplier payment.';
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
      title="Reverse Supplier Payment"
      subtitle={`Original entry ${payment.id} • Append-only correction`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-semibold">
            {payment.supplierName} — {formatBDT(payment.amountBdt)}
          </div>
          <div className="text-[11px]">
            Orders: {payment.preOrderNumber || 'Unallocated'} • {payment.method}{' '}
            {payment.referenceNo ? `(${payment.referenceNo})` : ''}
          </div>
          <p className="text-[11px] pt-1">
            The original record stays visible with a "Reversed" badge and a balancing reversal entry is added to the ledger.
          </p>
        </div>

        <FormField label="Reversal Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why this supplier payment is being reversed..."
          />
        </FormField>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={submitting}
            disabled={!isAdmin || submitting}
            leftIcon={<RotateCcw className="w-4 h-4" />}
          >
            Confirm Reversal
          </Button>
        </div>
      </form>
    </Modal>
  );
};
