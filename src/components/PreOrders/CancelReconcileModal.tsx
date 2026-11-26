import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import {
  CancelCustomerResolution,
  CancelStockResolution,
  CancelSupplierResolution,
  PreOrder,
  PreOrderPaymentMethod,
  PreOrderPrivateCost,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_PAYMENT_METHODS,
  formatBDT,
  formatPreOrderProductLabel,
  isPreOrderAdminRole,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import { roundMoney, toPaisa } from '../../preOrders/calculations';
import {
  actorFromUser,
  cancelAndReconcilePreOrder,
  CancelAndReconcileResult,
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

export interface CancelReconcileModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  privateCost?: PreOrderPrivateCost | null;
  supplierPaidBdt?: number;
  user: UserProfile;
  onSuccess: (res: CancelAndReconcileResult) => void;
}

export const CancelReconcileModal: React.FC<CancelReconcileModalProps> = ({
  isOpen,
  onClose,
  order,
  privateCost,
  supplierPaidBdt = 0,
  user,
  onSuccess,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const isSuperAdmin =
    user.role === 'superadmin' || (user.role as string) === 'super_admin';

  const orderItems = useMemo(() => normalizePreOrderItems(order), [order]);
  const totalOrderedQty = useMemo(
    () => order?.totalQty ?? orderItems.reduce((s, it) => s + (Number(it.qty) || 0), 0),
    [order, orderItems]
  );

  const verifiedNetPaid = Math.max(
    0,
    roundMoney((order?.advancePaid || 0) - (order?.refundedAmount || 0))
  );
  const actualShip = Math.max(0, Number(privateCost?.actualShippingCost) || 0);
  const totalSupplierExposure = roundMoney(supplierPaidBdt + actualShip);
  const stockReceivedQty = useMemo(() => {
    const itemRecSum = orderItems.reduce(
      (s, it) => s + Math.max(0, Number(it.receivedQty) || 0),
      0
    );
    return itemRecSum > 0 ? itemRecSum : Math.max(0, Number(order?.stockReceivedQty) || 0);
  }, [order, orderItems]);

  const [reason, setReason] = useState('');
  const [customerResolution, setCustomerResolution] =
    useState<CancelCustomerResolution>('full_refund');
  const [refundAmount, setRefundAmount] = useState('0');
  const [refundMethod, setRefundMethod] =
    useState<PreOrderPaymentMethod>('Cash');
  const [refundReferenceNo, setRefundReferenceNo] = useState('');
  const [retainedChargeReason, setRetainedChargeReason] = useState('');

  const [supplierResolution, setSupplierResolution] =
    useState<CancelSupplierResolution>('receivable');
  const [supplierSettledAmount, setSupplierSettledAmount] = useState('0');
  const [stockResolution, setStockResolution] =
    useState<CancelStockResolution>('release_normal');

  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && order) {
      setIdempotencyKey(
        `CNCL_${order.id}_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`
      );
      setReason('');
      setErrorMsg('');
      setRefundReferenceNo('');
      setRetainedChargeReason('');
      setRefundMethod('Cash');

      if (verifiedNetPaid > 0) {
        setCustomerResolution('full_refund');
        setRefundAmount(String(verifiedNetPaid));
      } else {
        setCustomerResolution('none');
        setRefundAmount('0');
      }

      if (totalSupplierExposure > 0) {
        setSupplierResolution(
          stockReceivedQty > 0 ? 'keep_stock' : 'receivable'
        );
        setSupplierSettledAmount(String(totalSupplierExposure));
      } else {
        setSupplierResolution('none');
        setSupplierSettledAmount('0');
      }

      setStockResolution(stockReceivedQty > 0 ? 'release_normal' : 'none');
    }
  }, [isOpen, order, verifiedNetPaid, totalSupplierExposure, stockReceivedQty]);

  const retainedAmount = useMemo(() => {
    if (customerResolution === 'full_refund' || customerResolution === 'none') {
      return 0;
    }
    if (customerResolution === 'no_refund') return verifiedNetPaid;
    return Math.max(
      0,
      roundMoney(verifiedNetPaid - (Number(refundAmount) || 0))
    );
  }, [customerResolution, verifiedNetPaid, refundAmount]);

  if (!order) return null;

  const isConverted = Boolean(order.convertedSaleId || order.convertedOrderId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isConverted) return;
    setErrorMsg('');

    if (!reason.trim()) {
      setErrorMsg('Cancellation reason is required.');
      return;
    }

    if (verifiedNetPaid > 0) {
      if (customerResolution === 'partial_refund') {
        if (!isAdmin) {
          setErrorMsg(
            'Partial refund with cancellation charge requires Admin or Super Admin.'
          );
          return;
        }
        const refAmt = Number(refundAmount) || 0;
        if (toPaisa(refAmt) <= 0 || toPaisa(refAmt) >= toPaisa(verifiedNetPaid)) {
          setErrorMsg(
            'Partial refund must be > ৳0 and strictly less than net paid advance.'
          );
          return;
        }
        if (!retainedChargeReason.trim()) {
          setErrorMsg('Provide a reason for the retained cancellation fee.');
          return;
        }
      }
      if (customerResolution === 'no_refund') {
        if (!isSuperAdmin) {
          setErrorMsg(
            'Full forfeiture (No Refund) requires Super Admin approval.'
          );
          return;
        }
        if (!retainedChargeReason.trim()) {
          setErrorMsg('Provide an explicit reason for retaining 100% of advance.');
          return;
        }
      }
      if (
        (customerResolution === 'full_refund' ||
          customerResolution === 'partial_refund') &&
        refundMethod !== 'Cash' &&
        !refundReferenceNo.trim()
      ) {
        setErrorMsg(`Transaction/Reference ID is required for ${refundMethod} refund.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await cancelAndReconcilePreOrder(
        order.id,
        {
          reason: reason.trim(),
          customerResolution: verifiedNetPaid > 0 ? customerResolution : 'none',
          refundAmount:
            customerResolution === 'full_refund'
              ? verifiedNetPaid
              : customerResolution === 'partial_refund'
              ? Number(refundAmount) || 0
              : 0,
          refundMethod,
          refundReferenceNo: refundReferenceNo.trim() || undefined,
          retainedChargeReason: retainedChargeReason.trim() || undefined,
          supplierResolution:
            totalSupplierExposure > 0 ? supplierResolution : 'none',
          supplierSettledAmount:
            totalSupplierExposure > 0
              ? Number(supplierSettledAmount) || totalSupplierExposure
              : 0,
          stockResolution: stockReceivedQty > 0 ? stockResolution : 'none',
          idempotencyKey,
        },
        actorFromUser(user)
      );

      toast.success(
        `${order.preOrderNumber} cancelled and reconciled (${res.order.status}).`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess(res);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to cancel & reconcile pre-order.';
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
      title="Cancel Pre-Order & Financial Reconciliation"
      subtitle={`${order.preOrderNumber} • ${order.customerName}`}
      size="lg"
    >
      {isConverted ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 space-y-2">
          <div className="font-bold flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            Already Converted to Sales Order ({order.convertedInvoiceNumber})
          </div>
          <p>
            Converted pre-orders cannot be cancelled here. Please manage returns or cancellations from the Order Desk / Invoices screen so stock &amp; COGS stay reconciled.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Items Summary */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {formatPreOrderProductLabel(order)}
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                {orderItems.length} item(s) · {totalOrderedQty} ordered · {stockReceivedQty} received
              </span>
            </div>
            {orderItems.length > 1 && (
              <div className="space-y-1 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                {orderItems.map((it) => {
                  const rec = Math.max(0, Number(it.receivedQty) || 0);
                  return (
                    <div
                      key={it.itemId}
                      className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300"
                    >
                      <span className="truncate pr-2">
                        {it.productName}
                        {it.variant || it.color ? ` (${[it.variant, it.color].filter(Boolean).join(' / ')})` : ''}
                      </span>
                      <span className="font-mono shrink-0">
                        {rec}/{it.qty} pcs · {formatBDT(it.lineTotal ?? it.qty * it.sellingUnitPrice)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <FormField label="Cancellation Reason" required>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this pre-order is being cancelled..."
            />
          </FormField>

          {/* 1. Customer Advance Reconciliation */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                1. Customer Advance Settlement
              </span>
              <Badge variant={verifiedNetPaid > 0 ? 'warning' : 'neutral'} size="xs">
                Net Held: {formatBDT(verifiedNetPaid)}
              </Badge>
            </div>

            {verifiedNetPaid <= 0 ? (
              <p className="text-xs text-slate-500">
                No verified customer advance held on this order.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'full_refund' as const,
                      label: 'Full Refund',
                      desc: `Refund ${formatBDT(verifiedNetPaid)}`,
                      allowed: true,
                    },
                    {
                      id: 'partial_refund' as const,
                      label: 'Partial + Fee',
                      desc: 'Admin only',
                      allowed: isAdmin,
                    },
                    {
                      id: 'no_refund' as const,
                      label: 'No Refund / Forfeit',
                      desc: 'Super Admin only',
                      allowed: isSuperAdmin,
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={!opt.allowed}
                      onClick={() => setCustomerResolution(opt.id)}
                      className={`p-2.5 rounded-xl border text-left text-xs cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                        customerResolution === opt.id
                          ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-slate-900 dark:text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] text-slate-400">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {(customerResolution === 'full_refund' ||
                  customerResolution === 'partial_refund') && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {customerResolution === 'partial_refund' && (
                      <FormField
                        label="Refund Amount (BDT)"
                        required
                        hint={`Cancellation fee: ${formatBDT(retainedAmount)}`}
                      >
                        <CurrencyInput
                          min={1}
                          max={verifiedNetPaid - 1}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                        />
                      </FormField>
                    )}
                    <FormField label="Refund Method" required>
                      <Select
                        options={PRE_ORDER_PAYMENT_METHODS.map((m) => ({
                          value: m,
                          label: m,
                        }))}
                        value={refundMethod}
                        onChange={(val) =>
                          setRefundMethod(val as PreOrderPaymentMethod)
                        }
                        searchable={false}
                      />
                    </FormField>
                    <FormField
                      label="Reference / TxID"
                      required={refundMethod !== 'Cash'}
                    >
                      <Input
                        value={refundReferenceNo}
                        onChange={(e) => setRefundReferenceNo(e.target.value)}
                        placeholder={
                          refundMethod === 'Cash' ? 'Optional' : 'Required TxID'
                        }
                      />
                    </FormField>
                  </div>
                )}

                {(customerResolution === 'partial_refund' ||
                  customerResolution === 'no_refund') && (
                  <FormField
                    label="Cancellation Charge / Forfeiture Reason"
                    required
                    hint={`${formatBDT(retainedAmount)} recorded as Other Income – Cancellation Charges`}
                  >
                    <Input
                      value={retainedChargeReason}
                      onChange={(e) => setRetainedChargeReason(e.target.value)}
                      placeholder="e.g. Special order fee after China shipment dispatched"
                    />
                  </FormField>
                )}
              </div>
            )}
          </div>

          {/* 2. Supplier Money Reconciliation */}
          {totalSupplierExposure > 0 && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  2. Supplier / Transit Cost Reconciliation
                </span>
                <Badge variant="gold" size="xs">
                  Exposure: {formatBDT(totalSupplierExposure)}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Supplier Settlement Disposition">
                  <Select
                    options={[
                      {
                        value: 'receivable',
                        label: 'Supplier will refund -> Other Receivables',
                      },
                      {
                        value: 'loss',
                        label: 'Supplier keeps / unrecoverable -> Company Loss',
                      },
                      ...(stockReceivedQty > 0
                        ? [
                            {
                              value: 'keep_stock',
                              label: 'Keep received stock in normal inventory',
                            },
                          ]
                        : []),
                    ]}
                    value={supplierResolution}
                    onChange={(val) =>
                      setSupplierResolution(val as CancelSupplierResolution)
                    }
                    searchable={false}
                  />
                </FormField>
                <FormField label="Settled Amount (BDT)">
                  <CurrencyInput
                    min={0}
                    max={totalSupplierExposure}
                    value={supplierSettledAmount}
                    onChange={(e) => setSupplierSettledAmount(e.target.value)}
                  />
                </FormField>
              </div>
            </div>
          )}

          {/* 3. Received Stock Reconciliation */}
          {stockReceivedQty > 0 && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  3. Reserved Stock Disposition ({stockReceivedQty} pcs received)
                </span>
              </div>
              <Select
                options={[
                  {
                    value: 'release_normal',
                    label:
                      'Release reserved stock to normal sellable inventory (clear Pre-Order tag)',
                  },
                  {
                    value: 'return_supplier',
                    label:
                      'Return stock to supplier (deduct stock + log Stock OUT + add Other Receivable)',
                  },
                ]}
                value={stockResolution}
                onChange={(val) =>
                  setStockResolution(val as CancelStockResolution)
                }
                searchable={false}
              />
            </div>
          )}

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
              Keep Order
            </Button>
            <Button
              type="submit"
              variant="danger"
              isLoading={submitting}
              leftIcon={<Ban className="w-4 h-4" />}
            >
              Cancel &amp; Post Reconciliation
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default CancelReconcileModal;
