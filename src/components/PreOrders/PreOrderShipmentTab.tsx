import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  Lock,
  Paperclip,
  Plane,
  Plus,
  Save,
  Ship,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  PreOrder,
  PreOrderPrivateCost,
  PreOrderShipment,
  PreOrderShipmentDoc,
  PreOrderShipmentDocType,
  PreOrderShipmentEvent,
  PreOrderShippingExpensesBreakdown,
  PreOrderStatus,
  RolePermissionsMap,
  UserProfile,
} from '../../types';
import {
  formatBDT,
  hasPermission,
  isPreOrderAdminRole,
} from '../../preOrders/constants';
import { calculateActualShippingCost, fromPaisa, toPaisa } from '../../preOrders/calculations';
import { uploadPreOrderDocument, validatePreOrderDocumentFile } from '../../preOrders/imageUpload';
import {
  actorFromUser,
  addPreOrderShipmentDoc,
  addPreOrderShipmentEvent,
  getPreOrderShipment,
  getPreOrderShipmentDocs,
  getPreOrderShipmentEvents,
  softDeletePreOrderShipmentDoc,
  updatePreOrderShippingExpenses,
  upsertPreOrderShipment,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  CurrencyInput,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../design-system';

const SHIPPING_METHODS = [
  { value: 'Air', label: 'Air Freight' },
  { value: 'Sea', label: 'Sea Cargo' },
  { value: 'Express courier', label: 'Express Courier (DHL / FedEx)' },
];

const CUSTOMS_STATUSES = [
  { value: 'Not started', label: 'Not started' },
  { value: 'In progress', label: 'In progress' },
  { value: 'Cleared', label: 'Cleared' },
  { value: 'Held/Issue', label: 'Held / Issue' },
];

const DOC_TYPES: Array<{ value: PreOrderShipmentDocType; label: string }> = [
  { value: 'invoice', label: 'Commercial Invoice' },
  { value: 'packing_list', label: 'Packing List' },
  { value: 'bill_of_lading', label: 'Bill of Lading / AWB' },
  { value: 'customs_papers', label: 'Customs Papers' },
  { value: 'photo', label: 'Parcel / Warehouse Photo' },
  { value: 'other', label: 'Other Document' },
];

export interface PreOrderShipmentTabProps {
  order: PreOrder;
  privateCost: PreOrderPrivateCost | null;
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  onRefreshParent: () => Promise<void> | void;
  onOpenStatusDialog: () => void;
}

export const PreOrderShipmentTab: React.FC<PreOrderShipmentTabProps> = ({
  order,
  privateCost,
  user,
  rolePermissions,
  onRefreshParent,
  onOpenStatusDialog,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const canManageTracking = hasPermission(user, rolePermissions, 'preOrderManageTracking') || isAdmin;
  const canViewSupplier = hasPermission(user, rolePermissions, 'preOrderSupplier') || isAdmin;

  const [loading, setLoading] = useState(true);
  const [shipment, setShipment] = useState<PreOrderShipment | null>(null);
  const [docs, setDocs] = useState<PreOrderShipmentDoc[]>([]);
  const [events, setEvents] = useState<PreOrderShipmentEvent[]>([]);

  // Logistics Form State
  const [supplierOrderRef, setSupplierOrderRef] = useState('');
  const [chinaOrderDate, setChinaOrderDate] = useState('');
  const [shippingMethod, setShippingMethod] = useState('Air');
  const [freightForwarder, setFreightForwarder] = useState('');
  const [forwarderContact, setForwarderContact] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrierTrackingUrl, setCarrierTrackingUrl] = useState('');
  const [shippedFromChinaAt, setShippedFromChinaAt] = useState('');
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState('');
  const [arrivedBdAt, setArrivedBdAt] = useState('');
  const [customsStatus, setCustomsStatus] = useState('Not started');
  const [customsClearanceDate, setCustomsClearanceDate] = useState('');
  const [notes, setNotes] = useState('');
  const [savingLogistics, setSavingLogistics] = useState(false);

  // Non-forcing status suggestion
  const [statusSuggestion, setStatusSuggestion] = useState<{
    nextStatus: PreOrderStatus;
    reason: string;
  } | null>(null);

  // Restricted Shipping Expenses State
  const [expFreight, setExpFreight] = useState('0');
  const [expCustoms, setExpCustoms] = useState('0');
  const [expLocal, setExpLocal] = useState('0');
  const [expHandling, setExpHandling] = useState('0');
  const [freightReceiptUrl, setFreightReceiptUrl] = useState('');
  const [customsReceiptUrl, setCustomsReceiptUrl] = useState('');
  const [localReceiptUrl, setLocalReceiptUrl] = useState('');
  const [handlingReceiptUrl, setHandlingReceiptUrl] = useState('');
  const [uploadingExpKey, setUploadingExpKey] = useState<string | null>(null);
  const [savingExpenses, setSavingExpenses] = useState(false);

  // Document Upload State
  const [docType, setDocType] = useState<PreOrderShipmentDocType>('invoice');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docNote, setDocNote] = useState('');
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [deleteTargetDoc, setDeleteTargetDoc] = useState<PreOrderShipmentDoc | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingDoc, setDeletingDoc] = useState(false);

  // Manual Shipment Event State
  const [eventText, setEventText] = useState('');
  const [eventShowToCustomer, setEventShowToCustomer] = useState(false);
  const [eventPublicMsg, setEventPublicMsg] = useState('');
  const [addingEvent, setAddingEvent] = useState(false);

  const hydrateFromPropsAndFetch = useCallback(async () => {
    setLoading(true);
    try {
      const [shp, docList, eventList] = await Promise.all([
        getPreOrderShipment(order.id).catch(() => null),
        getPreOrderShipmentDocs(order.id, false).catch(() => []),
        getPreOrderShipmentEvents(order.id, 100).catch(() => []),
      ]);
      setShipment(shp);
      setDocs(docList);
      setEvents(eventList);

      setSupplierOrderRef(shp?.supplierOrderRef ?? order.supplierOrderRef ?? '');
      setChinaOrderDate(shp?.chinaOrderDate ?? order.chinaOrderDate ?? '');
      setShippingMethod(shp?.shippingMethod ?? order.shippingMethod ?? 'Air');
      setFreightForwarder(shp?.freightForwarder ?? order.freightForwarder ?? '');
      setForwarderContact(shp?.forwarderContact ?? order.forwarderContact ?? '');
      setTrackingNumber(shp?.trackingNumber ?? order.trackingNumber ?? '');
      setCarrierTrackingUrl(shp?.carrierTrackingUrl ?? order.carrierTrackingUrl ?? '');
      setShippedFromChinaAt(shp?.shippedFromChinaAt ?? order.shippedFromChinaAt ?? '');
      setEstimatedArrivalDate(shp?.estimatedArrivalDate ?? order.estimatedDeliveryDate ?? '');
      setArrivedBdAt(shp?.arrivedBdAt ?? order.arrivedBdAt ?? '');
      setCustomsStatus(shp?.customsStatus ?? order.customsStatus ?? 'Not started');
      setCustomsClearanceDate(shp?.customsClearanceDate ?? order.customsClearanceDate ?? '');
      setNotes(shp?.notes ?? '');
    } finally {
      setLoading(false);
    }
  }, [order.id]);

  useEffect(() => {
    hydrateFromPropsAndFetch();
    setStatusSuggestion(null);
  }, [hydrateFromPropsAndFetch]);

  useEffect(() => {
    const breakdown = privateCost?.shippingExpenses;
    setExpFreight(String(breakdown?.internationalFreight ?? 0));
    setExpCustoms(String(breakdown?.customsDuty ?? 0));
    setExpLocal(String(breakdown?.localTransport ?? 0));
    setExpHandling(String(breakdown?.handlingOther ?? 0));
    setFreightReceiptUrl(breakdown?.freightReceiptUrl || '');
    setCustomsReceiptUrl(breakdown?.customsReceiptUrl || '');
    setLocalReceiptUrl(breakdown?.localReceiptUrl || '');
    setHandlingReceiptUrl(breakdown?.handlingReceiptUrl || '');
  }, [privateCost]);

  const handleSaveLogistics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTracking || savingLogistics) return;
    setSavingLogistics(true);
    try {
      const res = await upsertPreOrderShipment(
        order.id,
        {
          supplierOrderRef: supplierOrderRef.trim(),
          chinaOrderDate,
          shippingMethod,
          freightForwarder: freightForwarder.trim(),
          forwarderContact: forwarderContact.trim(),
          trackingNumber: trackingNumber.trim(),
          carrierTrackingUrl: carrierTrackingUrl.trim(),
          shippedFromChinaAt,
          estimatedArrivalDate,
          arrivedBdAt,
          customsStatus,
          customsClearanceDate,
          notes: notes.trim(),
        },
        actorFromUser(user)
      );
      toast.success(
        res.isDelayed
          ? `Shipment saved on ${order.preOrderNumber} (Delay flagged).`
          : `Shipment details saved on ${order.preOrderNumber}.`
      );
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      if (res.suggestedNextStatus && res.suggestionReason) {
        setStatusSuggestion({
          nextStatus: res.suggestedNextStatus,
          reason: res.suggestionReason,
        });
      }
      await hydrateFromPropsAndFetch();
      await onRefreshParent();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save shipment details.');
    } finally {
      setSavingLogistics(false);
    }
  };

  const handleExpenseReceiptUpload = async (
    key: 'freight' | 'customs' | 'local' | 'handling',
    file: File | undefined
  ) => {
    if (!file || !canViewSupplier) return;
    const err = validatePreOrderDocumentFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingExpKey(key);
    try {
      const uploaded = await uploadPreOrderDocument(order.id, file);
      if (key === 'freight') setFreightReceiptUrl(uploaded.url);
      if (key === 'customs') setCustomsReceiptUrl(uploaded.url);
      if (key === 'local') setLocalReceiptUrl(uploaded.url);
      if (key === 'handling') setHandlingReceiptUrl(uploaded.url);
      toast.success('Expense receipt attached. Click "Save Shipping Expenses" to persist.');
    } catch (uploadErr: any) {
      toast.error(uploadErr?.message || 'Failed to upload receipt.');
    } finally {
      setUploadingExpKey(null);
    }
  };

  const liveActualTotal = calculateActualShippingCost({
    internationalFreight: Number(expFreight || 0),
    customsDuty: Number(expCustoms || 0),
    localTransport: Number(expLocal || 0),
    handlingOther: Number(expHandling || 0),
  });
  const estimatedShipping = Number(privateCost?.shippingCost || 0);
  const shippingVariancePaisa = toPaisa(liveActualTotal) - toPaisa(estimatedShipping);

  const handleSaveShippingExpenses = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canViewSupplier || savingExpenses) return;
    setSavingExpenses(true);
    try {
      const breakdown: PreOrderShippingExpensesBreakdown = {
        internationalFreight: Number(expFreight || 0),
        customsDuty: Number(expCustoms || 0),
        localTransport: Number(expLocal || 0),
        handlingOther: Number(expHandling || 0),
        freightReceiptUrl,
        customsReceiptUrl,
        localReceiptUrl,
        handlingReceiptUrl,
      };
      await updatePreOrderShippingExpenses(order.id, breakdown, actorFromUser(user));
      toast.success('Shipping expense breakdown saved to restricted cost record.');
      await onRefreshParent();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save shipping expenses.');
    } finally {
      setSavingExpenses(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTracking || uploadingDoc) return;
    if (!docFile) {
      toast.error('Choose a JPG, PNG, WebP, or PDF file (<= 5MB).');
      return;
    }
    const err = validatePreOrderDocumentFile(docFile);
    if (err) {
      toast.error(err);
      return;
    }

    setUploadingDoc(true);
    try {
      const uploaded = await uploadPreOrderDocument(order.id, docFile);
      await addPreOrderShipmentDoc(
        order.id,
        {
          docType,
          fileName: uploaded.fileName,
          fileUrl: uploaded.url,
          storagePath: uploaded.storagePath,
          contentType: uploaded.contentType,
          fileSize: uploaded.fileSize,
          note: docNote.trim(),
        },
        actorFromUser(user)
      );
      toast.success(`Uploaded "${docFile.name}".`);
      setDocFile(null);
      setDocNote('');
      await hydrateFromPropsAndFetch();
      await onRefreshParent();
    } catch (uploadErr: any) {
      toast.error(uploadErr?.message || 'Failed to upload shipment document.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleConfirmSoftDeleteDoc = async () => {
    if (!deleteTargetDoc || !isAdmin || deletingDoc) return;
    setDeletingDoc(true);
    try {
      await softDeletePreOrderShipmentDoc(
        order.id,
        deleteTargetDoc.id,
        deleteReason.trim() || 'Removed by Admin',
        actorFromUser(user)
      );
      toast.success(`Removed "${deleteTargetDoc.fileName}" from active shipment documents.`);
      setDeleteTargetDoc(null);
      setDeleteReason('');
      await hydrateFromPropsAndFetch();
      await onRefreshParent();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove document.');
    } finally {
      setDeletingDoc(false);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTracking || addingEvent) return;
    if (!eventText.trim()) {
      toast.error('Enter an event description.');
      return;
    }
    setAddingEvent(true);
    try {
      const eventRes = await addPreOrderShipmentEvent(
        order.id,
        {
          text: eventText.trim(),
          showToCustomer: eventShowToCustomer,
          publicMessage: eventPublicMsg.trim() || undefined,
        },
        actorFromUser(user)
      );
      toast.success('Shipment event added.');
      if (eventRes.trackingSyncWarning) {
        toast.warning(eventRes.trackingSyncWarning);
      }
      setEventText('');
      setEventPublicMsg('');
      setEventShowToCustomer(false);
      await hydrateFromPropsAndFetch();
      await onRefreshParent();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add shipment event.');
    } finally {
      setAddingEvent(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  const isDelayed = Boolean(shipment?.isDelayed || order.isDelayed);

  return (
    <div className="space-y-5">
      {/* Non-forcing Status Change Suggestion */}
      {statusSuggestion && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <CalendarClock className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{statusSuggestion.reason}</span>
          </div>
          <Button
            type="button"
            variant="primary"
            size="xs"
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            onClick={onOpenStatusDialog}
          >
            Open Status Update ({statusSuggestion.nextStatus})
          </Button>
        </div>
      )}

      {/* SECTION 1: CHINA ORDER & INTERNATIONAL LOGISTICS */}
      <form
        onSubmit={handleSaveLogistics}
        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            {shippingMethod === 'Sea' ? (
              <Ship className="w-3.5 h-3.5" />
            ) : (
              <Plane className="w-3.5 h-3.5" />
            )}
            China Order & Shipment Logistics
          </h4>
          <div className="flex items-center gap-2">
            {isDelayed && (
              <Badge variant="danger" size="xs">
                Delayed ETA
              </Badge>
            )}
            {shipment?.previousEstimatedArrivalDate && (
              <span className="text-[11px] font-mono text-slate-400">
                Prev ETA: {shipment.previousEstimatedArrivalDate}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <FormField label="Supplier Order ID / Ref">
            <Input
              disabled={!canManageTracking}
              value={supplierOrderRef}
              onChange={(e) => setSupplierOrderRef(e.target.value)}
              placeholder="e.g. 1688-99482711"
              className="font-mono"
            />
          </FormField>

          <FormField label="China Order Date">
            <Input
              type="date"
              disabled={!canManageTracking}
              value={chinaOrderDate}
              onChange={(e) => setChinaOrderDate(e.target.value)}
            />
          </FormField>

          <FormField label="Shipping Method">
            <Select
              disabled={!canManageTracking}
              options={SHIPPING_METHODS}
              value={shippingMethod}
              onChange={(val) => setShippingMethod(String(val))}
              searchable={false}
            />
          </FormField>

          <FormField label="Freight Forwarder / Carrier">
            <Input
              disabled={!canManageTracking}
              value={freightForwarder}
              onChange={(e) => setFreightForwarder(e.target.value)}
              placeholder="e.g. S.F. Express / Dhaka Cargo"
            />
          </FormField>

          <FormField label="Forwarder Contact">
            <Input
              disabled={!canManageTracking}
              value={forwarderContact}
              onChange={(e) => setForwarderContact(e.target.value)}
              placeholder="Phone / WeChat / Rep"
            />
          </FormField>

          <FormField label="Tracking Number">
            <Input
              disabled={!canManageTracking}
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="AWB / Waybill No"
              className="font-mono"
            />
          </FormField>

          <FormField label="Carrier Tracking URL (External Link)" className="sm:col-span-2">
            <div className="flex items-center gap-2">
              <Input
                disabled={!canManageTracking}
                value={carrierTrackingUrl}
                onChange={(e) => setCarrierTrackingUrl(e.target.value)}
                placeholder="https://track17.net/..."
                className="flex-1"
              />
              {carrierTrackingUrl.trim() && (
                <a
                  href={
                    carrierTrackingUrl.trim().startsWith('http')
                      ? carrierTrackingUrl.trim()
                      : `https://${carrierTrackingUrl.trim()}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-[#93741E] dark:text-[#E2C255] hover:bg-slate-50 shrink-0"
                >
                  Track <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </FormField>

          <FormField label="Dispatch Date (China)">
            <Input
              type="date"
              disabled={!canManageTracking}
              value={shippedFromChinaAt}
              onChange={(e) => setShippedFromChinaAt(e.target.value)}
            />
          </FormField>

          <FormField label="Expected Arrival Date (BD)">
            <Input
              type="date"
              disabled={!canManageTracking}
              value={estimatedArrivalDate}
              onChange={(e) => setEstimatedArrivalDate(e.target.value)}
            />
          </FormField>

          <FormField label="Actual BD Arrival Date">
            <Input
              type="date"
              disabled={!canManageTracking}
              value={arrivedBdAt}
              onChange={(e) => setArrivedBdAt(e.target.value)}
            />
          </FormField>

          <FormField label="Customs Clearance Status">
            <Select
              disabled={!canManageTracking}
              options={CUSTOMS_STATUSES}
              value={customsStatus}
              onChange={(val) => setCustomsStatus(String(val))}
              searchable={false}
            />
          </FormField>

          <FormField label="Customs Clearance Date">
            <Input
              type="date"
              disabled={!canManageTracking}
              value={customsClearanceDate}
              onChange={(e) => setCustomsClearanceDate(e.target.value)}
            />
          </FormField>

          <FormField label="Logistics Notes (Non-Sensitive)" className="sm:col-span-2">
            <Input
              disabled={!canManageTracking}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Carton weight, warehouse lot, port note..."
            />
          </FormField>
        </div>

        {canManageTracking && (
          <div className="flex justify-end pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={savingLogistics}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Shipment Details
            </Button>
          </div>
        )}
      </form>

      {/* SECTION 2: RESTRICTED SHIPPING EXPENSES BREAKDOWN (preOrderSupplier ONLY) */}
      {canViewSupplier && (
        <form
          onSubmit={handleSaveShippingExpenses}
          className="p-4 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/30 dark:bg-amber-950/10 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Shipping Expenses Breakdown (Restricted)
            </h4>
            <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
              <span>
                Estimated:{' '}
                <strong className="font-mono">{formatBDT(estimatedShipping)}</strong>
              </span>
              <span>
                Actual:{' '}
                <strong className="font-mono text-slate-900 dark:text-slate-100">
                  {formatBDT(liveActualTotal)}
                </strong>
              </span>
              <Badge
                variant={
                  shippingVariancePaisa > 0
                    ? 'danger'
                    : shippingVariancePaisa < 0
                    ? 'success'
                    : 'neutral'
                }
                size="xs"
              >
                {shippingVariancePaisa === 0
                  ? 'On Estimate'
                  : `${shippingVariancePaisa > 0 ? '+' : ''}${formatBDT(
                      fromPaisa(shippingVariancePaisa)
                    )} variance`}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(
              [
                {
                  key: 'freight',
                  label: 'International Freight (৳)',
                  val: expFreight,
                  setVal: setExpFreight,
                  receiptUrl: freightReceiptUrl,
                },
                {
                  key: 'customs',
                  label: 'Customs Duty & Tax (৳)',
                  val: expCustoms,
                  setVal: setExpCustoms,
                  receiptUrl: customsReceiptUrl,
                },
                {
                  key: 'local',
                  label: 'Local BD Transport (৳)',
                  val: expLocal,
                  setVal: setExpLocal,
                  receiptUrl: localReceiptUrl,
                },
                {
                  key: 'handling',
                  label: 'Handling / Other Charges (৳)',
                  val: expHandling,
                  setVal: setExpHandling,
                  receiptUrl: handlingReceiptUrl,
                },
              ] as const
            ).map((item) => (
              <div key={item.key} className="space-y-1.5">
                <FormField label={item.label}>
                  <div className="flex items-center gap-2">
                    <CurrencyInput
                      min={0}
                      value={item.val}
                      onChange={(e) => item.setVal(e.target.value)}
                      className="flex-1"
                    />
                    <label
                      className="inline-flex items-center gap-1 px-2.5 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold cursor-pointer hover:bg-slate-50 shrink-0"
                      title="Upload receipt (optional)"
                    >
                      <Paperclip className="w-3 h-3 text-[#D4AF37]" />
                      {uploadingExpKey === item.key ? '...' : item.receiptUrl ? 'Replace' : 'Receipt'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          handleExpenseReceiptUpload(item.key, f);
                        }}
                      />
                    </label>
                    {item.receiptUrl && (
                      <a
                        href={item.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[#93741E] hover:bg-slate-50 shrink-0"
                        title="View expense receipt"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </FormField>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-amber-200/60 dark:border-amber-900/40">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              isLoading={savingExpenses}
              leftIcon={<Save className="w-3.5 h-3.5" />}
            >
              Save Shipping Expenses
            </Button>
          </div>
        </form>
      )}

      {/* SECTION 3: SHIPMENT DOCUMENTS */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            Shipment Documents ({docs.length})
          </h4>
          <span className="text-[11px] text-slate-400">JPG, PNG, WebP or PDF (max 5MB)</span>
        </div>

        {canManageTracking && (
          <form onSubmit={handleUploadDoc} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
            <div className="sm:col-span-4">
              <FormField label="Document Type">
                <Select
                  options={DOC_TYPES}
                  value={docType}
                  onChange={(val) => setDocType(val as PreOrderShipmentDocType)}
                  searchable={false}
                />
              </FormField>
            </div>
            <div className="sm:col-span-5">
              <FormField label="Select File (<= 5MB)">
                <label className="flex items-center gap-2 px-3 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs cursor-pointer truncate">
                  <Upload className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span className="truncate">{docFile ? docFile.name : 'Choose PDF or Image...'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const err = validatePreOrderDocumentFile(f);
                      if (err) {
                        toast.error(err);
                        return;
                      }
                      setDocFile(f);
                    }}
                  />
                </label>
              </FormField>
            </div>
            <div className="sm:col-span-3">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={uploadingDoc}
                disabled={!docFile}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                className="w-full"
              >
                Upload Doc
              </Button>
            </div>
          </form>
        )}

        {docs.length === 0 ? (
          <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
            No shipment documents uploaded yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
            {docs.map((d) => (
              <div key={d.id} className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral" size="xs">
                      {DOC_TYPES.find((t) => t.value === d.docType)?.label || d.docType}
                    </Badge>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {d.fileName}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Uploaded by {d.uploadedByName} on{' '}
                    {new Date(d.uploadedAt).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {d.fileSize ? ` • ${(d.fileSize / 1024).toFixed(0)} KB` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteTargetDoc(d);
                        setDeleteReason('');
                      }}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                      title="Soft delete document (Admin only)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 4: SHIPMENT EVENT LOG (APPEND-ONLY) */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5" />
          Shipment Events Log ({events.length})
        </h4>

        {canManageTracking && (
          <form onSubmit={handleAddEvent} className="space-y-2.5 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <FormField label="Add Shipment Event / Milestone">
              <Input
                value={eventText}
                onChange={(e) => setEventText(e.target.value)}
                placeholder="e.g. Parcel departed Guangzhou hub for Dhaka..."
              />
            </FormField>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventShowToCustomer}
                  onChange={(e) => setEventShowToCustomer(e.target.checked)}
                  className="rounded border-slate-300 text-[#D4AF37]"
                />
                <span>Show on Customer Public Tracking Link</span>
              </label>
              <Button
                type="submit"
                variant="secondary"
                size="xs"
                isLoading={addingEvent}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                Post Event
              </Button>
            </div>
            {eventShowToCustomer && (
              <Input
                value={eventPublicMsg}
                onChange={(e) => setEventPublicMsg(e.target.value)}
                placeholder="Optional custom customer-safe message (defaults to event text)"
              />
            )}
          </form>
        )}

        {events.length === 0 ? (
          <div className="p-5 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
            No shipment milestone events logged yet. Changes to tracking number, ETA, dispatch, arrival, or customs are logged automatically.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-semibold text-slate-500">
                      {ev.date} {ev.time}
                    </span>
                    <Badge variant={ev.source === 'manual' ? 'info' : 'neutral'} size="xs">
                      {ev.source === 'manual' ? 'Manual' : 'Auto'}
                    </Badge>
                    {ev.showToCustomer && (
                      <Badge variant="success" size="xs">
                        Customer Visible
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">{ev.staffName}</span>
                </div>
                <p className="text-slate-800 dark:text-slate-200 font-medium">{ev.text}</p>
                {ev.showToCustomer && ev.publicMessage && ev.publicMessage !== ev.text && (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Public note: {ev.publicMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ADMIN SOFT DELETE DOCUMENT MODAL */}
      <Modal
        isOpen={Boolean(deleteTargetDoc)}
        onClose={() => !deletingDoc && setDeleteTargetDoc(null)}
        title="Remove Shipment Document"
        subtitle={deleteTargetDoc?.fileName}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Soft deletion hides this document from the active shipment list while preserving an Admin audit trail.
            </span>
          </div>
          <FormField label="Reason for removal (Optional)">
            <Textarea
              rows={2}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Uploaded wrong packing list..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTargetDoc(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={deletingDoc}
              onClick={handleConfirmSoftDeleteDoc}
            >
              Confirm Remove
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PreOrderShipmentTab;
