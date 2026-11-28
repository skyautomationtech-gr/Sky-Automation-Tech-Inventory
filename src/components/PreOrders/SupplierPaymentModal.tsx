import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Loader2,
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
import {
  formatBDT,
  formatPreOrderProductLabel,
  getTodayIsoDate,
  isPreOrderAdminRole,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import { fromPaisa, roundMoney, toPaisa } from '../../preOrders/calculations';
import {
  deleteMediaObject,
  uploadPreOrderDocument,
  UploadedPreOrderDocument,
  validatePreOrderDocumentFile,
} from '../../preOrders/imageUpload';
import { formatBytesCompact } from '../../utils/mediaUpload';
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
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [uploadedReceiptDoc, setUploadedReceiptDoc] = useState<UploadedPreOrderDocument | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<'idle' | 'preparing' | 'uploading' | 'done' | 'failed'>('idle');
  const [receiptProgress, setReceiptProgress] = useState(0);
  const [receiptError, setReceiptError] = useState<string | undefined>(undefined);
  const [receiptErrorCode, setReceiptErrorCode] = useState<string | undefined>(undefined);

  const [allowUnallocated, setAllowUnallocated] = useState(false);
  const [allocMap, setAllocMap] = useState<Record<string, string>>({});
  const [sessionIdempotencyKey, setSessionIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitStatusText, setSubmitStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const receiptAbortRef = useRef<AbortController | null>(null);
  const receiptPromiseRef = useRef<Promise<UploadedPreOrderDocument | null> | null>(null);
  const sessionReceiptPathRef = useRef<string | undefined>(undefined);
  const savedReceiptRef = useRef(false);

  const allocatableOrders = useMemo(
    () =>
      supplierOrders.filter(
        (o) => o.status !== 'Cancelled' && o.status !== 'Refunded'
      ),
    [supplierOrders]
  );

  const cleanupReceipt = (deleteStorageObj: boolean) => {
    receiptAbortRef.current?.abort();
    receiptAbortRef.current = null;
    receiptPromiseRef.current = null;
    if (receiptPreviewUrl && receiptPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    if (deleteStorageObj && sessionReceiptPathRef.current) {
      void deleteMediaObject(sessionReceiptPathRef.current);
      sessionReceiptPathRef.current = undefined;
    }
  };

  useEffect(() => {
    if (isOpen && supplier) {
      savedReceiptRef.current = false;
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
      cleanupReceipt(true);
      setReceiptFile(null);
      setReceiptName('');
      setReceiptPreviewUrl('');
      setUploadedReceiptDoc(null);
      setReceiptStatus('idle');
      setReceiptProgress(0);
      setReceiptError(undefined);
      setReceiptErrorCode(undefined);
      setErrorMsg('');
      setSubmitStatusText('');

      if (preSelectedOrderId) {
        setAllowUnallocated(false);
        setAllocMap({ [preSelectedOrderId]: initBdt });
      } else {
        setAllowUnallocated(allocatableOrders.length === 0);
        setAllocMap({});
      }
    }
    if (!isOpen && !savedReceiptRef.current) {
      cleanupReceipt(true);
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

  if (!supplier) return null;

  const startReceiptUpload = (file: File) => {
    receiptAbortRef.current?.abort();
    const controller = new AbortController();
    receiptAbortRef.current = controller;

    setReceiptStatus('preparing');
    setReceiptProgress(5);
    setReceiptError(undefined);
    setReceiptErrorCode(undefined);
    setUploadedReceiptDoc(null);

    const uploadTarget =
      selectedOrderIds.length === 1 ? selectedOrderIds[0] : `supplier_${supplier.id}`;

    const p = uploadPreOrderDocument(uploadTarget, file, {
      signal: controller.signal,
      onPhase: (phase) => {
        if (!controller.signal.aborted) {
          setReceiptStatus(phase === 'preparing' ? 'preparing' : 'uploading');
        }
      },
      onProgress: (pct) => {
        if (!controller.signal.aborted) {
          setReceiptStatus(pct < 18 ? 'preparing' : 'uploading');
          setReceiptProgress(pct);
        }
      },
    })
      .then((uploaded) => {
        if (controller.signal.aborted) {
          if (uploaded.storagePath) void deleteMediaObject(uploaded.storagePath);
          return null;
        }
        if (uploaded.storagePath) {
          sessionReceiptPathRef.current = uploaded.storagePath;
        }
        if (uploaded.fallbackUsed) {
          toast.warning('Storage bucket unavailable — saved compact 40 KB receipt preview.');
        }
        setUploadedReceiptDoc(uploaded);
        setReceiptStatus('done');
        setReceiptProgress(100);
        return uploaded;
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.code === 'storage/canceled') {
          return null;
        }
        const code = err?.code || 'upload-failed';
        const message = err?.message || 'Receipt upload failed.';
        console.error('[SupplierPaymentModal] Receipt upload failed:', code, err);
        setReceiptStatus('failed');
        setReceiptProgress(0);
        setReceiptError(message);
        setReceiptErrorCode(code);
        toast.error(`Receipt upload failed (${code}): ${message}`);
        return null;
      })
      .finally(() => {
        if (receiptAbortRef.current === controller) {
          receiptAbortRef.current = null;
        }
      });

    receiptPromiseRef.current = p;
    return p;
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
    cleanupReceipt(true);
    setReceiptFile(file);
    setReceiptName(file.name);
    if (file.type.startsWith('image/')) {
      setReceiptPreviewUrl(URL.createObjectURL(file));
    } else {
      setReceiptPreviewUrl('');
    }
    setErrorMsg('');
    void startReceiptUpload(file);
  };

  const handleClearReceipt = () => {
    cleanupReceipt(true);
    setReceiptFile(null);
    setReceiptName('');
    setReceiptPreviewUrl('');
    setUploadedReceiptDoc(null);
    setReceiptStatus('idle');
    setReceiptProgress(0);
    setReceiptError(undefined);
    setReceiptErrorCode(undefined);
  };

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

    if (receiptStatus === 'failed') {
      setErrorMsg('Receipt upload failed. Click Retry or Remove on the receipt.');
      return;
    }

    setSubmitting(true);
    setSubmitStatusText('');
    try {
      let receiptUrl = uploadedReceiptDoc?.url || '';
      if (receiptFile && !receiptUrl) {
        setSubmitStatusText('Finishing receipt upload...');
        const waitRes = await (receiptPromiseRef.current || startReceiptUpload(receiptFile));
        if (!waitRes) {
          setErrorMsg('Receipt upload failed. Please Retry or Remove it.');
          return;
        }
        receiptUrl = waitRes.url;
      }

      setSubmitStatusText('Saving supplier payment...');
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

      savedReceiptRef.current = true;
      sessionReceiptPathRef.current = undefined;
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
      setSubmitStatusText('');
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
                              {formatPreOrderProductLabel(ord)} (Qty{' '}
                              {ord.totalQty ??
                                normalizePreOrderItems(ord).reduce((s, it) => s + it.qty, 0)}
                              )
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
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {receiptPreviewUrl && (
                  <img
                    src={receiptPreviewUrl}
                    alt="Receipt preview"
                    className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                )}
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 flex-1 truncate">
                  <Paperclip className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span className="truncate">{receiptName || 'Attach JPG/PNG/HEIC/PDF'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf"
                    className="hidden"
                    onChange={handleReceiptSelect}
                  />
                </label>
                {receiptFile && (
                  <button
                    type="button"
                    onClick={handleClearReceipt}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                    title="Remove receipt"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {receiptFile && (
                <div className="text-[11px]">
                  {(receiptStatus === 'preparing' || receiptStatus === 'uploading') && (
                    <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>
                        {receiptStatus === 'preparing'
                          ? 'Compressing...'
                          : `Uploading ${receiptProgress}%`}
                      </span>
                    </div>
                  )}
                  {receiptStatus === 'done' && uploadedReceiptDoc && (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-3 h-3" />
                      {uploadedReceiptDoc.fallbackUsed
                        ? `Compact preview (${formatBytesCompact(uploadedReceiptDoc.fileSize)})`
                        : `Uploaded • ${formatBytesCompact(uploadedReceiptDoc.fileSize)}`}
                    </span>
                  )}
                  {receiptStatus === 'failed' && (
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                      <span className="truncate">
                        Failed ({receiptErrorCode || 'err'}): {receiptError}
                      </span>
                      <button
                        type="button"
                        onClick={() => void startReceiptUpload(receiptFile)}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        Retry
                      </button>
                    </div>
                  )}
                </div>
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

        <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-[#93741E] dark:text-[#E2C255]">
            {submitStatusText && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {submitStatusText}
                {receiptProgress > 0 && receiptProgress < 100 ? ` (${receiptProgress}%)` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
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
