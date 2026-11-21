import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Lock, ShieldAlert } from 'lucide-react';
import { PreOrder, PreOrderStatus, UserProfile } from '../../types';
import {
  formatBDT,
  getSelectablePreOrderTransitions,
  isPreOrderAdminRole,
} from '../../preOrders/constants';
import { toPaisa } from '../../preOrders/calculations';
import { actorFromUser, transitionPreOrderStatus } from '../../firebase/preOrderDb';
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';
import { PreOrderStatusBadge } from './PreOrderStatusBadge';

export interface PreOrderStatusDialogProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  user: UserProfile;
  onUpdated: (updatedOrder: PreOrder) => void;
}

export const PreOrderStatusDialog: React.FC<PreOrderStatusDialogProps> = ({
  isOpen,
  onClose,
  order,
  user,
  onUpdated,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);

  const [selectedStatus, setSelectedStatus] = useState<PreOrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [publicMessage, setPublicMessage] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [allowUnpaidOverride, setAllowUnpaidOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const transitions = useMemo(() => {
    if (!order) return { forward: [] as PreOrderStatus[], backward: [] as PreOrderStatus[] };
    return getSelectablePreOrderTransitions(order.status, {
      isAdmin,
      verifiedRefunded: order.refundedAmount || 0,
    });
  }, [order, isAdmin]);

  const statusOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; sublabel?: string }> = [];
    transitions.forward.forEach((st) => {
      opts.push({
        value: st,
        label: st,
        sublabel: st === 'Cancelled' ? 'Cancels order' : 'Next / Forward stage',
      });
    });
    transitions.backward.forEach((st) => {
      opts.push({
        value: st,
        label: `${st} (Backward)`,
        sublabel: 'Admin backward correction (reason required)',
      });
    });
    return opts;
  }, [transitions]);

  useEffect(() => {
    if (isOpen && order) {
      const defaultNext = transitions.forward.find((s) => s !== 'Cancelled') || transitions.forward[0] || '';
      setSelectedStatus(defaultNext);
      setNote('');
      setPublicMessage('');
      setNotifyCustomer(false);
      setAllowUnpaidOverride(false);
      setOverrideReason('');
      setErrorMsg('');
    }
  }, [isOpen, order, transitions.forward]);

  if (!order) return null;

  const isBackwardMove =
    Boolean(selectedStatus) && transitions.backward.includes(selectedStatus as PreOrderStatus);
  const isCancelSelected = selectedStatus === 'Cancelled';
  const isDeliveredWithDue =
    selectedStatus === 'Delivered' && toPaisa(order.dueAmount) > 0;
  const hasVerifiedPayments = toPaisa(order.advancePaid || 0) > 0;
  const cancelBlockedForStaff = isCancelSelected && hasVerifiedPayments && !isAdmin;
  const deliveredBlockedForStaff = isDeliveredWithDue && !isAdmin;
  const noteRequired = isCancelSelected || isBackwardMove;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !selectedStatus) return;
    setErrorMsg('');

    if (noteRequired && !note.trim()) {
      setErrorMsg(
        isCancelSelected
          ? 'Please enter a cancellation reason.'
          : 'Please enter a reason for moving backward to an earlier stage.'
      );
      return;
    }
    if (cancelBlockedForStaff) {
      setErrorMsg('Verified customer payments exist. Only Admin or Super Admin can cancel.');
      return;
    }
    if (deliveredBlockedForStaff) {
      setErrorMsg('Collect remaining customer due before marking Delivered.');
      return;
    }
    if (isDeliveredWithDue && isAdmin && (!allowUnpaidOverride || !overrideReason.trim())) {
      setErrorMsg('Check the unpaid delivery override box and provide an Admin reason.');
      return;
    }

    setSubmitting(true);
    try {
      const updated = await transitionPreOrderStatus(
        order.id,
        {
          toStatus: selectedStatus as PreOrderStatus,
          note: note.trim(),
          publicMessage: publicMessage.trim(),
          notifyCustomer,
          allowUnpaidDeliveryOverride: allowUnpaidOverride,
          overrideReason: overrideReason.trim(),
        },
        actorFromUser(user)
      );
      toast.success(`${order.preOrderNumber} moved to "${selectedStatus}".`);
      if (updated.trackingSyncWarning) {
        toast.warning(updated.trackingSyncWarning);
      }
      onUpdated(updated);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to update status.';
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
      title="Update Pre-Order Status"
      subtitle={`${order.preOrderNumber} • ${order.customerName}`}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Current Stage:</span>
            <PreOrderStatusBadge status={order.status} size="xs" />
          </div>
          <div className="font-mono font-semibold text-slate-700 dark:text-slate-200">
            Due: {formatBDT(order.dueAmount)}
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>
            <strong>Received in Stock</strong> is hidden/locked in Part 3 — use <em>Receive Stock</em> in Part 6 when stock arrives in warehouse.
          </span>
        </div>

        {statusOptions.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
            {order.status === 'Cancelled' && (order.refundedAmount || 0) <= 0 && (order.advancePaid || 0) > 0
              ? 'This order was cancelled with paid deposits. Record a refund in the Payments tab first to unlock "Refunded".'
              : `No further transitions are available from "${order.status}".`}
          </div>
        ) : (
          <>
            <FormField label="New Status" required>
              <Select
                options={statusOptions}
                value={selectedStatus}
                onChange={(val) => {
                  setSelectedStatus(val as PreOrderStatus);
                  setErrorMsg('');
                }}
                placeholder="Select next status..."
                searchable={false}
              />
            </FormField>

            {cancelBlockedForStaff && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  Verified payment of {formatBDT(order.advancePaid)} exists. Only an Admin or Super Admin can cancel this pre-order.
                </span>
              </div>
            )}

            {isDeliveredWithDue && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2.5">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    Remaining customer due is {formatBDT(order.dueAmount)}.
                  </span>
                </div>
                {isAdmin ? (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={allowUnpaidOverride}
                        onChange={(e) => setAllowUnpaidOverride(e.target.checked)}
                        className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                      />
                      <span>Admin Override: allow Delivered with unpaid balance (logged in Audit)</span>
                    </label>
                    {allowUnpaidOverride && (
                      <FormField label="Unpaid Delivery Override Reason" required>
                        <Input
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="e.g. COD courier settlement pending..."
                        />
                      </FormField>
                    )}
                  </>
                ) : (
                  <p>Delivered status is blocked until remaining due is ৳0 (or overridden by Admin).</p>
                )}
              </div>
            )}

            <FormField
              label={
                isCancelSelected
                  ? 'Cancellation Reason'
                  : isBackwardMove
                  ? 'Backward Move Reason'
                  : 'Internal / Status Note (Optional)'
              }
              required={noteRequired}
            >
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isCancelSelected
                    ? 'Why is this pre-order being cancelled?'
                    : isBackwardMove
                    ? 'Explain why this order is moving back to an earlier stage...'
                    : 'Shipment update, customs clearance note, or internal handoff remark...'
                }
              />
            </FormField>

            <FormField
              label="Public Message for Customer Tracking (Optional)"
              hint="Visible to the customer on their public tracking timeline"
            >
              <Input
                value={publicMessage}
                onChange={(e) => setPublicMessage(e.target.value)}
                placeholder="e.g. Cleared Dhaka customs, inspecting unit before dispatch"
              />
            </FormField>

            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={notifyCustomer}
                onChange={(e) => setNotifyCustomer(e.target.checked)}
                className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              <span>Flag for customer notification (queued for SMS/WhatsApp Alerts module)</span>
            </label>
          </>
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
          {statusOptions.length > 0 && (
            <Button
              type="submit"
              variant={isCancelSelected ? 'danger' : 'primary'}
              isLoading={submitting}
              disabled={
                submitting ||
                !selectedStatus ||
                cancelBlockedForStaff ||
                deliveredBlockedForStaff
              }
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Update Status
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default PreOrderStatusDialog;
