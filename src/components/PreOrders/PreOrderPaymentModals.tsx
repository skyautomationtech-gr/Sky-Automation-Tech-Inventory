import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Receipt,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  PreOrder,
  PreOrderPayment,
  PreOrderPaymentMethod,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_PAYMENT_METHODS,
  formatBDT,
  isPreOrderAdminRole,
  normalizePaymentTxnRef,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import {
  calculatePreOrderFinancials,
  roundMoney,
  toPaisa,
} from '../../preOrders/calculations';
import { uploadPreOrderImage, validateImageFile } from '../../preOrders/imageUpload';
import {
  actorFromUser,
  collectPreOrderPayment,
  refundPreOrderPayment,
  reversePreOrderPayment,
  verifyPreOrderPayment,
} from '../../firebase/preOrderDb';
import {
  Button,
  CurrencyInput,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';

function getLocalDateTimeValue(ts = Date.now()): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ==========================================
// 1. COLLECT PAYMENT MODAL
// ==========================================

export interface CollectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  user: UserProfile;
  onSuccess: (payment: PreOrderPayment, updatedOrder: PreOrder) => void;
}

export const CollectPaymentModal: React.FC<CollectPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeIdempotencyKey());
  const [type, setType] = useState<'advance' | 'installment' | 'additional'>('installment');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PreOrderPaymentMethod>('bKash');
  const [referenceNo, setReferenceNo] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => getLocalDateTimeValue());
  const [note, setNote] = useState('');
  const [autoVerify, setAutoVerify] = useState(false);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState('');

  const [duplicateNeedsOverride, setDuplicateNeedsOverride] = useState(false);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen && order) {
      setIdempotencyKey(makeIdempotencyKey());
      setType((order.advancePaid || 0) > 0 ? 'installment' : 'advance');
      setAmount(order.dueAmount > 0 ? String(order.dueAmount) : '');
      setMethod('bKash');
      setReferenceNo('');
      setReceivedAt(getLocalDateTimeValue());
      setNote('');
      setAutoVerify(false);
      setReceiptFile(null);
      setReceiptPreview('');
      setDuplicateNeedsOverride(false);
      setDuplicateOverrideReason('');
      setErrorMsg('');
    }
  }, [isOpen, order]);

  useEffect(() => {
    if (method === 'Cash' && isAdmin) {
      setAutoVerify(true);
    } else {
      setAutoVerify(false);
    }
  }, [method, isAdmin]);

  if (!order) return null;

  const parsedAmount = roundMoney(amount || 0);
  const exceedsDue = toPaisa(parsedAmount) > toPaisa(order.dueAmount);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setReceiptPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitInFlightRef.current) return;
    setErrorMsg('');

    if (parsedAmount <= 0) {
      setErrorMsg('Amount must be greater than 0.');
      return;
    }
    if (exceedsDue) {
      setErrorMsg(
        `Amount (${formatBDT(parsedAmount)}) cannot exceed current due (${formatBDT(
          order.dueAmount
        )}).`
      );
      return;
    }
    if (method !== 'Cash' && !referenceNo.trim()) {
      setErrorMsg(`Transaction ID / Reference No is required for ${method}.`);
      return;
    }
    if (duplicateNeedsOverride && !duplicateOverrideReason.trim()) {
      setErrorMsg('Please enter an Admin override reason to record a pending duplicate Transaction ID.');
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      let receiptUrl = '';
      if (receiptFile) {
        const uploaded = await uploadPreOrderImage(receiptFile, 'receipts');
        receiptUrl = uploaded.url;
      }

      const receivedTs = receivedAt ? new Date(receivedAt).getTime() : Date.now();
      const res = await collectPreOrderPayment(
        order.id,
        {
          type,
          amount: parsedAmount,
          method,
          referenceNo: referenceNo.trim(),
          receiptUrl,
          receivedAt: Number.isFinite(receivedTs) ? receivedTs : Date.now(),
          note: note.trim(),
          idempotencyKey,
          autoVerify: method === 'Cash' && isAdmin ? autoVerify : false,
          duplicateOverrideReason: duplicateOverrideReason.trim(),
        },
        actorFromUser(user)
      );

      toast.success(
        res.payment.status === 'verified'
          ? `Collected & verified ${formatBDT(res.payment.amount)} on ${order.preOrderNumber}.`
          : `Recorded ${formatBDT(res.payment.amount)} as Pending Verification on ${order.preOrderNumber}.`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess(res.payment, res.order);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to record payment.';
      if (msg.startsWith('DUPLICATE_TXN_VERIFIED:')) {
        setDuplicateNeedsOverride(false);
        setDuplicateOverrideReason('');
        setErrorMsg(msg.replace('DUPLICATE_TXN_VERIFIED:', '').trim());
      } else if (msg.startsWith('DUPLICATE_TXN_ADMIN:')) {
        setDuplicateNeedsOverride(true);
        setErrorMsg(msg.replace('DUPLICATE_TXN_ADMIN:', '').trim());
      } else if (msg.startsWith('DUPLICATE_TXN:')) {
        setDuplicateNeedsOverride(false);
        setErrorMsg(msg.replace('DUPLICATE_TXN:', '').trim());
      } else {
        setErrorMsg(msg);
      }
      toast.error(msg.replace(/^DUPLICATE_TXN(_ADMIN|_VERIFIED)?:\s*/, ''));
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Collect Pre-Order Payment"
      subtitle={`${order.preOrderNumber} • ${order.customerName} • Due: ${formatBDT(order.dueAmount)}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-3 text-xs tabular-nums">
          <div>
            <div className="text-slate-400">Order Total</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {formatBDT(order.totalAmount)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Verified Paid</div>
            <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
              {formatBDT(order.advancePaid)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Current Due</div>
            <div className="font-mono font-bold text-amber-700 dark:text-amber-300 mt-0.5">
              {formatBDT(order.dueAmount)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField label="Payment Type" required>
            <Select
              options={[
                { value: 'advance', label: 'Advance Deposit' },
                { value: 'installment', label: 'Installment Payment' },
                { value: 'additional', label: 'Additional Payment' },
              ]}
              value={type}
              onChange={(val) => setType(val as 'advance' | 'installment' | 'additional')}
              searchable={false}
            />
          </FormField>

          <FormField
            label="Amount (৳)"
            required
            error={exceedsDue ? `Cannot exceed due (${formatBDT(order.dueAmount)})` : undefined}
            hint={`Max collectible: ${formatBDT(order.dueAmount)}`}
          >
            <CurrencyInput
              min={1}
              max={order.dueAmount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </FormField>

          <FormField label="Payment Method" required>
            <Select
              options={PRE_ORDER_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
              value={method}
              onChange={(val) => {
                setMethod(val as PreOrderPaymentMethod);
                setDuplicateNeedsOverride(false);
                setDuplicateOverrideReason('');
              }}
              searchable={false}
            />
          </FormField>

          <FormField
            label="Transaction ID / Reference"
            required={method !== 'Cash'}
            hint={method === 'Cash' ? 'Optional voucher/slip ref' : `Required for ${method}`}
          >
            <Input
              value={referenceNo}
              onChange={(e) => {
                setReferenceNo(e.target.value);
                setDuplicateNeedsOverride(false);
              }}
              placeholder="e.g. TRX9A8B7C6D"
              className="font-mono"
            />
          </FormField>

          <FormField label="Received Date & Time" required>
            <Input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </FormField>

          <FormField label="Receipt Image (Optional)">
            <div className="flex items-center gap-2.5">
              {receiptPreview ? (
                <div className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                  <img src={receiptPreview} alt="Receipt" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setReceiptFile(null);
                      setReceiptPreview('');
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 rounded bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#D4AF37] text-xs font-semibold cursor-pointer">
                  <Receipt className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Upload Receipt
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </label>
              )}
            </div>
          </FormField>
        </div>

        <FormField label="Note (Optional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Payment remarks or customer transfer notes..."
          />
        </FormField>

        {method === 'Cash' && isAdmin ? (
          <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-800 dark:text-emerald-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoVerify}
              onChange={(e) => setAutoVerify(e.target.checked)}
              className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
            />
            <span>Auto-verify this Cash receipt immediately (updates Advance Paid & Due right away)</span>
          </label>
        ) : (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              {method === 'Cash'
                ? 'Cash entries by Staff/Manager start as Pending Verification until reviewed by another verifier.'
                : `Non-cash (${method}) payments always start as Pending Verification and are excluded from verified totals until verified.`}
            </span>
          </div>
        )}

        {duplicateNeedsOverride && isAdmin && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Pending Duplicate Transaction ID Detected — Admin Override Required
            </div>
            <FormField label="Admin Override Reason" required>
              <Input
                value={duplicateOverrideReason}
                onChange={(e) => setDuplicateOverrideReason(e.target.value)}
                placeholder="Explain why this duplicate pending Transaction ID is valid..."
              />
            </FormField>
          </div>
        )}

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
            disabled={submitting || exceedsDue || parsedAmount <= 0 || order.dueAmount <= 0}
            leftIcon={<Banknote className="w-4 h-4" />}
          >
            Record Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ==========================================
// 2. REFUND PAYMENT MODAL
// ==========================================

export interface RefundPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  user: UserProfile;
  onSuccess: (payment: PreOrderPayment, updatedOrder: PreOrder) => void;
}

export const RefundPaymentModal: React.FC<RefundPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => makeIdempotencyKey());
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PreOrderPaymentMethod>('bKash');
  const [referenceNo, setReferenceNo] = useState('');
  const [reason, setReason] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => getLocalDateTimeValue());
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const netPaid = useMemo(() => {
    if (!order) return 0;
    return calculatePreOrderFinancials({
      items: normalizePreOrderItems(order),
      deliveryCharge: order.deliveryCharge,
      discount: order.discount,
      payments: [
        { type: 'advance', status: 'verified', amount: order.advancePaid || 0 },
        { type: 'refund', status: 'verified', amount: order.refundedAmount || 0 },
      ],
    }).verifiedNetPaid;
  }, [order]);

  useEffect(() => {
    if (isOpen && order) {
      setIdempotencyKey(makeIdempotencyKey());
      setAmount(netPaid > 0 ? String(netPaid) : '');
      setMethod('bKash');
      setReferenceNo('');
      setReason(order.cancellationReason || '');
      setReceivedAt(getLocalDateTimeValue());
      setErrorMsg('');
    }
  }, [isOpen, order, netPaid]);

  if (!order) return null;

  const parsedAmount = roundMoney(amount || 0);
  const exceedsNet = toPaisa(parsedAmount) > toPaisa(netPaid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (parsedAmount <= 0) {
      setErrorMsg('Refund amount must be greater than zero.');
      return;
    }
    if (exceedsNet) {
      setErrorMsg(`Refund amount cannot exceed net verified paid (${formatBDT(netPaid)}).`);
      return;
    }
    if (!referenceNo.trim()) {
      setErrorMsg('Refund transaction ID or voucher reference is required.');
      return;
    }
    if (!reason.trim()) {
      setErrorMsg('Refund reason is required.');
      return;
    }

    setSubmitting(true);
    try {
      const receivedTs = receivedAt ? new Date(receivedAt).getTime() : Date.now();
      const res = await refundPreOrderPayment(
        order.id,
        {
          amount: parsedAmount,
          method,
          referenceNo: referenceNo.trim(),
          reason: reason.trim(),
          receivedAt: Number.isFinite(receivedTs) ? receivedTs : Date.now(),
          idempotencyKey,
        },
        actorFromUser(user)
      );
      toast.success(`Refund of ${formatBDT(res.payment.amount)} recorded on ${order.preOrderNumber}.`);
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess(res.payment, res.order);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to record refund.';
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
      title="Issue Customer Refund"
      subtitle={`${order.preOrderNumber} • Net Verified Paid: ${formatBDT(netPaid)}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between">
          <span>Maximum refundable verified balance:</span>
          <span className="font-mono font-bold text-sm">{formatBDT(netPaid)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <FormField
            label="Refund Amount (৳)"
            required
            error={exceedsNet ? `Max refundable: ${formatBDT(netPaid)}` : undefined}
          >
            <CurrencyInput
              min={1}
              max={netPaid}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>

          <FormField label="Refund Method" required>
            <Select
              options={PRE_ORDER_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
              value={method}
              onChange={(val) => setMethod(val as PreOrderPaymentMethod)}
              searchable={false}
            />
          </FormField>

          <FormField label="Transaction ID / Reference" required>
            <Input
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              placeholder="e.g. REF-TRX12345"
              className="font-mono"
            />
          </FormField>

          <FormField label="Refund Date & Time" required>
            <Input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Refund Reason" required>
          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for refund (e.g. customer cancelled order due to delay)..."
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
            disabled={submitting || exceedsNet || parsedAmount <= 0 || netPaid <= 0}
          >
            Record Refund
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ==========================================
// 3. REVERSE PAYMENT MODAL (ADMIN ONLY)
// ==========================================

export interface ReversePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PreOrderPayment | null;
  user: UserProfile;
  onSuccess: () => void;
}

export const ReversePaymentModal: React.FC<ReversePaymentModalProps> = ({
  isOpen,
  onClose,
  payment,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!reason.trim()) {
      toast.error('Please enter a reason for reversing this payment entry.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await reversePreOrderPayment(
        payment.preOrderId,
        payment.id,
        reason.trim(),
        actorFromUser(user)
      );
      toast.success(`Created reversal entry for ${payment.preOrderNumber} (${formatBDT(payment.amount)}).`);
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reverse payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Reverse Verified Ledger Entry"
      subtitle={`${payment.preOrderNumber} • Append-Only Correction`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Original entry is never overwritten or deleted
          </div>
          <p>
            Reversing creates a new <strong>reversal</strong> entry referencing{' '}
            <span className="font-mono">{payment.id}</span> for{' '}
            <strong className="font-mono">{formatBDT(payment.amount)}</strong> ({payment.method}).
            The original entry stays visible with a <strong>Reversed</strong> badge.
          </p>
        </div>

        <FormField label="Reversal Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong amount entered, duplicate transfer posted, bank chargeback..."
          />
        </FormField>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={submitting}
            disabled={submitting || !reason.trim()}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
          >
            Confirm Reversal
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ==========================================
// 4. REJECT PAYMENT MODAL
// ==========================================

export interface RejectPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PreOrderPayment | null;
  user: UserProfile;
  onSuccess: () => void;
}

export const RejectPaymentModal: React.FC<RejectPaymentModalProps> = ({
  isOpen,
  onClose,
  payment,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setReason('');
  }, [isOpen]);

  if (!payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!reason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await verifyPreOrderPayment(
        payment.preOrderId,
        payment.id,
        'rejected',
        actorFromUser(user),
        reason.trim()
      );
      toast.success(`Payment ${payment.preOrderNumber} (${formatBDT(payment.amount)}) rejected.`);
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reject payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Reject Pending Payment"
      subtitle={`${payment.preOrderNumber} • ${formatBDT(payment.amount)} (${payment.method})`}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Rejection Reason" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Transaction ID not found in bKash merchant statement..."
          />
        </FormField>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            isLoading={submitting}
            disabled={submitting || !reason.trim()}
          >
            Reject Payment
          </Button>
        </div>
      </form>
    </Modal>
  );
};

// ==========================================
// 5. SUPER ADMIN SELF-VERIFICATION DIALOG
// ==========================================

export interface SuperAdminSelfVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PreOrderPayment | null;
  initialDecision?: 'verified' | 'rejected';
  user: UserProfile;
  onSuccess: () => void;
}

export const SuperAdminSelfVerifyModal: React.FC<SuperAdminSelfVerifyModalProps> = ({
  isOpen,
  onClose,
  payment,
  initialDecision = 'verified',
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const [decision, setDecision] = useState<'verified' | 'rejected'>(initialDecision);
  const [statementChecked, setStatementChecked] = useState(false);
  const [verifyNote, setVerifyNote] = useState('');
  const [confirmTxnId, setConfirmTxnId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setDecision(initialDecision);
      setStatementChecked(false);
      setVerifyNote('');
      setConfirmTxnId('');
      setErrorMsg('');
    }
  }, [isOpen, initialDecision, payment?.id]);

  if (!payment) return null;

  const isNonCash = payment.method !== 'Cash';
  const expectedRef = (payment.referenceNo || '').trim();
  const needsTxnRetype = isNonCash && expectedRef.length > 0;
  const txnMatches =
    !needsTxnRetype ||
    normalizePaymentTxnRef(confirmTxnId) === normalizePaymentTxnRef(expectedRef);

  const canSubmit =
    statementChecked &&
    verifyNote.trim().length > 0 &&
    txnMatches &&
    !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || submitInFlightRef.current) return;
    setErrorMsg('');

    if (!statementChecked) {
      setErrorMsg('Please confirm that you checked this transaction in your bKash/Nagad/Bank statement.');
      return;
    }
    if (!verifyNote.trim()) {
      setErrorMsg('Please enter a verification / audit note.');
      return;
    }
    if (needsTxnRetype && !txnMatches) {
      setErrorMsg('Re-typed Transaction ID does not match the payment entry.');
      return;
    }

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await verifyPreOrderPayment(
        payment.preOrderId,
        payment.id,
        decision,
        actorFromUser(user),
        {
          selfVerified: true,
          verifyNote: verifyNote.trim(),
          rejectionReason: decision === 'rejected' ? verifyNote.trim() : undefined,
          confirmedReferenceNo: confirmTxnId.trim(),
        }
      );
      toast.success(
        decision === 'verified'
          ? `Self-verified ${formatBDT(payment.amount)} on ${payment.preOrderNumber}.`
          : `Self-rejected ${formatBDT(payment.amount)} on ${payment.preOrderNumber}.`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to process Super Admin self-verification.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      submitInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Super Admin Self-Verification Confirmation"
      subtitle={`${payment.preOrderNumber} • Recorded by ${payment.recordedByName || user.name}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="font-bold">Super Admin Statement Verification Required</div>
            <p className="mt-0.5 text-amber-800/90 dark:text-amber-300/90">
              You recorded this payment entry yourself. Confirm the transaction details against your statement before approving or rejecting. This action is logged as{' '}
              <strong>&ldquo;self-verified by Super Admin&rdquo;</strong>.
            </p>
          </div>
        </div>

        {/* Summary Card */}
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-slate-400">Payment Method</div>
            <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {payment.method}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Amount</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
              {formatBDT(payment.amount)}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Transaction ID</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 break-all">
              {payment.referenceNo || '—'}
            </div>
          </div>
          <div>
            <div className="text-slate-400">Customer / Sender Number</div>
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {payment.customerPhone || '—'}
            </div>
          </div>
        </div>

        {/* Action Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => setDecision('verified')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              decision === 'verified'
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-500 dark:text-emerald-200'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verify Payment
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setDecision('rejected')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              decision === 'rejected'
                ? 'bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-950/50 dark:border-rose-500 dark:text-rose-200'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Reject Payment
          </button>
        </div>

        {/* Mandatory Statement Checkbox */}
        <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={statementChecked}
            onChange={(e) => setStatementChecked(e.target.checked)}
            className="mt-0.5 rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
          />
          <span className="font-medium">
            I checked this transaction in my bKash/Nagad/Bank statement
          </span>
        </label>

        {/* Non-Cash Transaction ID Re-type Confirmation */}
        {needsTxnRetype && (
          <FormField
            label="Re-type Transaction ID to Confirm Match"
            required
            error={
              confirmTxnId.trim().length > 0 && !txnMatches
                ? 'Does not match Transaction ID above'
                : undefined
            }
            hint="Required for non-cash self-verification (spaces/case ignored)"
          >
            <Input
              value={confirmTxnId}
              onChange={(e) => setConfirmTxnId(e.target.value)}
              placeholder={`Type ${expectedRef} to confirm...`}
              className="font-mono"
            />
          </FormField>
        )}

        {/* Mandatory Note Field */}
        <FormField
          label={decision === 'rejected' ? 'Rejection / Verification Note' : 'Verification Note'}
          required
          hint="Recorded permanently in the Super Admin audit entry"
        >
          <Textarea
            rows={2}
            value={verifyNote}
            onChange={(e) => setVerifyNote(e.target.value)}
            placeholder={
              decision === 'rejected'
                ? 'e.g. Duplicate entry or transaction not reflected in statement...'
                : 'e.g. Verified against bKash merchant app statement...'
            }
          />
        </FormField>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={decision === 'rejected' ? 'danger' : 'primary'}
            isLoading={submitting}
            disabled={!canSubmit}
            leftIcon={
              decision === 'rejected' ? (
                <XCircle className="w-3.5 h-3.5" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )
            }
          >
            {decision === 'rejected' ? 'Confirm Self-Reject' : 'Confirm Self-Verify'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
