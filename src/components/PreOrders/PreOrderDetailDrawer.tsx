import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Clock,
  CreditCard,
  Edit3,
  History,
  ImagePlus,
  Lock,
  Minus,
  Package,
  Phone,
  Plus,
  Receipt,
  Save,
  ShieldCheck,
  Trash2,
  User,
  Wallet,
  X,
} from 'lucide-react';
import {
  Category,
  PreOrder,
  PreOrderAuditEntry,
  PreOrderPayment,
  PreOrderPrivateCost,
  PreOrderStatusHistory,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_EDIT_LOCKED_STATUSES,
  formatBDT,
  getTodayIsoDate,
  hasPermission,
  isPreOrderOverdue,
  isValidBdPhone,
  normalizeBdPhone,
} from '../../preOrders/constants';
import { calculatePreOrderFinancials, toPaisa } from '../../preOrders/calculations';
import { uploadPreOrderImage, validateImageFile } from '../../preOrders/imageUpload';
import {
  actorFromUser,
  getPreOrderFullDetail,
  updatePreOrder,
  updatePreOrderPrivateCost,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  CurrencyInput,
  Drawer,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../design-system';
import {
  OverdueTag,
  PaymentStateBadge,
  PreOrderStatusBadge,
  SubBrandBadge,
} from './PreOrderStatusBadge';

export interface PreOrderDetailDrawerProps {
  preOrderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  suppliers: Supplier[];
  initialEditMode?: boolean;
  onUpdated?: () => void;
}

type DetailTab = 'overview' | 'payments' | 'timeline' | 'audit';

function formatDateTime(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const PreOrderDetailDrawer: React.FC<PreOrderDetailDrawerProps> = ({
  preOrderId,
  isOpen,
  onClose,
  user,
  rolePermissions,
  categories,
  suppliers,
  initialEditMode = false,
  onUpdated,
}) => {
  const toast = useToast();

  const isAdminUser =
    user.role === 'superadmin' ||
    (user.role as string) === 'super_admin' ||
    user.role === 'admin';
  const canEdit = hasPermission(user, rolePermissions, 'preOrderEdit');
  const canViewProfit = hasPermission(user, rolePermissions, 'preOrderViewProfit');
  const canViewAudit = isAdminUser;

  const allowedSubBrands = useMemo<Array<'SAT' | 'GZ' | 'RTX'>>(() => {
    const isSuper = user.role === 'superadmin' || (user.role as string) === 'super_admin';
    if (isSuper || !user.subBrandAccess || user.subBrandAccess.length === 0) {
      return ['SAT', 'GZ', 'RTX'];
    }
    const valid = user.subBrandAccess.filter(
      (b): b is 'SAT' | 'GZ' | 'RTX' => b === 'SAT' || b === 'GZ' || b === 'RTX'
    );
    return valid.length > 0 ? valid : ['SAT'];
  }, [user.role, user.subBrandAccess]);

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [order, setOrder] = useState<PreOrder | null>(null);
  const [payments, setPayments] = useState<PreOrderPayment[]>([]);
  const [statusHistory, setStatusHistory] = useState<PreOrderStatusHistory[]>([]);
  const [privateCost, setPrivateCost] = useState<PreOrderPrivateCost | null>(null);
  const [auditLogs, setAuditLogs] = useState<PreOrderAuditEntry[]>([]);
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerWhatsapp, setEditCustomerWhatsapp] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editVariant, setEditVariant] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [editProductImageFile, setEditProductImageFile] = useState<File | null>(null);
  const [editProductImagePreview, setEditProductImagePreview] = useState('');
  const [editSellingUnitPrice, setEditSellingUnitPrice] = useState('0');
  const [editDeliveryCharge, setEditDeliveryCharge] = useState('0');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editChinaUnitCost, setEditChinaUnitCost] = useState('0');
  const [editShippingCost, setEditShippingCost] = useState('0');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editSupplierOrderRef, setEditSupplierOrderRef] = useState('');
  const [editOrderDate, setEditOrderDate] = useState('');
  const [editEstimatedDeliveryDate, setEditEstimatedDeliveryDate] = useState('');
  const [editSubBrand, setEditSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [editNotes, setEditNotes] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');

  const hydrateEditForm = useCallback(
    (ord: PreOrder, priv: PreOrderPrivateCost | null) => {
      setEditCustomerName(ord.customerName || '');
      setEditCustomerPhone(ord.customerPhone || '');
      setEditCustomerWhatsapp(ord.customerWhatsapp || ord.customerPhone || '');
      setEditCustomerAddress(ord.customerAddress || '');
      setEditProductName(ord.productName || '');
      setEditCategory(ord.category || '');
      setEditSku(ord.sku || '');
      setEditModel(ord.model || '');
      setEditVariant(ord.variant || '');
      setEditColor(ord.color || '');
      setEditQty(ord.qty || 1);
      setEditProductImageFile(null);
      setEditProductImagePreview(ord.productImage || '');
      setEditSellingUnitPrice(String(ord.sellingUnitPrice ?? 0));
      setEditDeliveryCharge(String(ord.deliveryCharge ?? 0));
      setEditDiscount(String(ord.discount ?? 0));
      setEditChinaUnitCost(String(priv?.chinaUnitCost ?? 0));
      setEditShippingCost(String(priv?.shippingCost ?? 0));
      setEditSupplierId(ord.supplierId || '');
      setEditSupplierOrderRef(ord.supplierOrderRef || priv?.supplierOrderRef || '');
      setEditOrderDate(ord.orderDate || getTodayIsoDate());
      setEditEstimatedDeliveryDate(ord.estimatedDeliveryDate || '');
      setEditSubBrand(ord.subBrand || 'SAT');
      setEditNotes(ord.notes || '');
      setEditInternalNotes(priv?.internalNotes || '');
    },
    []
  );

  const loadDetail = useCallback(async () => {
    if (!preOrderId) return;
    setLoading(true);
    setLoadError('');
    try {
      const detail = await getPreOrderFullDetail(preOrderId, {
        canViewProfit,
        canViewAudit,
      });
      if (!detail) {
        setLoadError('Pre-order record could not be found.');
        setOrder(null);
        return;
      }
      setOrder(detail.order);
      setPayments(detail.payments);
      setStatusHistory(detail.statusHistory);
      setPrivateCost(detail.privateCost);
      setAuditLogs(detail.auditLogs);
      hydrateEditForm(detail.order, detail.privateCost);
      const locked = PRE_ORDER_EDIT_LOCKED_STATUSES.includes(detail.order.status);
      if (initialEditMode && canEdit && !locked) {
        setIsEditing(true);
      }
    } catch (err: any) {
      console.error('Failed to load pre-order details:', err);
      setLoadError(err?.message || 'Failed to load pre-order details.');
    } finally {
      setLoading(false);
    }
  }, [preOrderId, canViewProfit, canViewAudit, hydrateEditForm]);

  useEffect(() => {
    if (isOpen && preOrderId) {
      setActiveTab('overview');
      setIsEditing(false);
      loadDetail();
    }
  }, [isOpen, preOrderId, loadDetail]);

  const isStatusLocked = order ? PRE_ORDER_EDIT_LOCKED_STATUSES.includes(order.status) : true;
  const hasAnyActivePayment = useMemo(() => {
    if (!order) return false;
    return (
      payments.some((p) => p.status !== 'rejected') ||
      Number(order.paymentCount || 0) > 0 ||
      Number(order.advancePaid || 0) > 0 ||
      Number(order.pendingAmount || 0) > 0
    );
  }, [order, payments]);

  const financialFieldsLocked = hasAnyActivePayment && !isAdminUser;

  const liveFinancials = useMemo(() => {
    if (!order) return null;
    const activeLedger = payments.filter((p) => p.status !== 'rejected');
    return calculatePreOrderFinancials({
      qty: isEditing ? editQty : order.qty,
      sellingUnitPrice: isEditing ? Number(editSellingUnitPrice || 0) : order.sellingUnitPrice,
      deliveryCharge: isEditing ? Number(editDeliveryCharge || 0) : order.deliveryCharge,
      discount: isEditing ? Number(editDiscount || 0) : order.discount,
      chinaUnitCost: isEditing
        ? Number(editChinaUnitCost || 0)
        : privateCost?.chinaUnitCost || 0,
      shippingCost: isEditing
        ? Number(editShippingCost || 0)
        : privateCost?.shippingCost || 0,
      payments:
        activeLedger.length > 0
          ? activeLedger
          : [
              { type: 'advance', status: 'verified', amount: order.advancePaid || 0 },
              { type: 'refund', status: 'verified', amount: order.refundedAmount || 0 },
            ],
    });
  }, [
    order,
    payments,
    privateCost,
    isEditing,
    editQty,
    editSellingUnitPrice,
    editDeliveryCharge,
    editDiscount,
    editChinaUnitCost,
    editShippingCost,
  ]);

  const categoryOptions = useMemo(() => {
    const names = Array.from(
      new Set([
        ...categories.map((c) => c.name).filter(Boolean),
        ...(editCategory && !categories.some((c) => c.name === editCategory)
          ? [editCategory]
          : []),
      ])
    );
    return names.map((name) => ({ value: name, label: name }));
  }, [categories, editCategory]);

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: [s.supplierCode, s.phone].filter(Boolean).join(' • '),
    }));
  }, [suppliers]);

  const handleEditImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setEditProductImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setEditProductImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveEdits = async () => {
    if (!order || !canEdit || isStatusLocked || saving) return;

    const normPhone = normalizeBdPhone(editCustomerPhone);
    if (!isValidBdPhone(normPhone)) {
      toast.error('Please enter a valid Bangladesh phone number (01XXXXXXXXX).');
      return;
    }
    if (!editCustomerName.trim()) {
      toast.error('Customer name is required.');
      return;
    }
    if (!editCustomerAddress.trim()) {
      toast.error('Customer address is required.');
      return;
    }
    if (!editProductName.trim()) {
      toast.error('Product name is required.');
      return;
    }
    if (editEstimatedDeliveryDate && editOrderDate && editEstimatedDeliveryDate < editOrderDate) {
      toast.error('Expected arrival date cannot be earlier than order date.');
      return;
    }

    const nextUnitPrice = Number(editSellingUnitPrice || 0);
    const nextDelivery = Number(editDeliveryCharge || 0);
    const nextDiscount = Number(editDiscount || 0);
    const nextQty = Math.round(Number(editQty) || 0);

    if (nextQty < 1) {
      toast.error('Quantity must be at least 1.');
      return;
    }
    if (nextUnitPrice <= 0) {
      toast.error('Selling unit price must be greater than 0.');
      return;
    }
    if (nextDelivery < 0 || nextDiscount < 0) {
      toast.error('Delivery charge and discount cannot be negative.');
      return;
    }
    const subtotalCheck = calculatePreOrderFinancials({
      qty: nextQty,
      sellingUnitPrice: nextUnitPrice,
    }).subtotal;
    if (toPaisa(nextDiscount) > toPaisa(subtotalCheck)) {
      toast.error('Discount cannot exceed product subtotal.');
      return;
    }

    setSaving(true);
    try {
      let nextImageUrl = editProductImagePreview;
      if (editProductImageFile) {
        const uploaded = await uploadPreOrderImage(editProductImageFile, 'products');
        nextImageUrl = uploaded.url;
      }

      const selectedSupplier = suppliers.find((s) => s.id === editSupplierId);
      const actor = actorFromUser(user);

      await updatePreOrder(
        order.id,
        {
          subBrand: editSubBrand,
          customerName: editCustomerName.trim(),
          customerPhone: normPhone,
          customerWhatsapp: editCustomerWhatsapp.trim()
            ? normalizeBdPhone(editCustomerWhatsapp)
            : normPhone,
          customerAddress: editCustomerAddress.trim(),
          productName: editProductName.trim(),
          category: editCategory.trim(),
          sku: editSku.trim(),
          model: editModel.trim(),
          variant: editVariant.trim(),
          color: editColor.trim(),
          productImage: nextImageUrl || '',
          ...(financialFieldsLocked
            ? {}
            : {
                qty: nextQty,
                sellingUnitPrice: nextUnitPrice,
                deliveryCharge: nextDelivery,
                discount: nextDiscount,
              }),
          supplierId: selectedSupplier?.id || '',
          supplierName: selectedSupplier?.name || '',
          supplierOrderRef: editSupplierOrderRef.trim(),
          orderDate: editOrderDate,
          estimatedDeliveryDate: editEstimatedDeliveryDate,
          notes: editNotes.trim(),
        },
        actor
      );

      if (canViewProfit) {
        const chinaNum = Number(editChinaUnitCost || 0);
        const shipNum = Number(editShippingCost || 0);
        if (
          chinaNum !== Number(privateCost?.chinaUnitCost || 0) ||
          shipNum !== Number(privateCost?.shippingCost || 0) ||
          editInternalNotes.trim() !== (privateCost?.internalNotes || '') ||
          editSupplierOrderRef.trim() !== (privateCost?.supplierOrderRef || '')
        ) {
          await updatePreOrderPrivateCost(
            order.id,
            {
              chinaUnitCost: chinaNum,
              shippingCost: shipNum,
              internalNotes: editInternalNotes.trim(),
              supplierOrderRef: editSupplierOrderRef.trim(),
            },
            actor
          );
        }
      }

      toast.success(`${order.preOrderNumber} updated successfully.`);
      setIsEditing(false);
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      console.error('Failed to update pre-order:', err);
      toast.error(err?.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Package className="w-3.5 h-3.5" /> },
    {
      id: 'payments',
      label: `Payments (${payments.length})`,
      icon: <CreditCard className="w-3.5 h-3.5" />,
    },
    {
      id: 'timeline',
      label: `Timeline (${statusHistory.length})`,
      icon: <History className="w-3.5 h-3.5" />,
    },
    ...(canViewAudit
      ? [
          {
            id: 'audit' as DetailTab,
            label: `Audit (${auditLogs.length})`,
            icon: <ShieldCheck className="w-3.5 h-3.5" />,
          },
        ]
      : []),
  ];

  const overdue = order
    ? isPreOrderOverdue(order.estimatedDeliveryDate, order.status, order.stockReceived)
    : false;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={() => {
          if (!saving) onClose();
        }}
        width="xl"
        title={
          order ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                {order.preOrderNumber}
              </span>
              <SubBrandBadge subBrand={order.subBrand} />
              <PreOrderStatusBadge status={order.status} size="xs" />
              {overdue && <OverdueTag />}
            </div>
          ) : (
            'Pre-Order Details'
          )
        }
        subtitle={
          order
            ? `Created ${formatDateTime(order.createdAt)} by ${order.createdByName || 'Operator'}`
            : undefined
        }
        footer={
          isEditing ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  if (order) hydrateEditForm(order, privateCost);
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                isLoading={saving}
                leftIcon={<Save className="w-4 h-4" />}
                onClick={handleSaveEdits}
              >
                Save Changes
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {order && isStatusLocked ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Lock className="w-3.5 h-3.5" />
                    Editing locked in "{order.status}" status
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {order && canEdit && !isStatusLocked && activeTab === 'overview' && (
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Pre-Order
                  </Button>
                )}
                <Button type="button" variant="primary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )
        }
      >
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-40 w-full rounded-xl" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : loadError ? (
          <div className="p-6 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
            <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={loadDetail}>
              Retry
            </Button>
          </div>
        ) : order ? (
          <div className="space-y-5">
            {/* Sub-Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={isEditing && tab.id !== 'overview'}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      active
                        ? 'border-[#D4AF37] text-[#93741E] dark:text-[#E2C255]'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-5">
                {isEditing && financialFieldsLocked && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>
                      A customer payment exists on this Pre-Order. Quantity, selling unit price, delivery charge, and discount can only be modified by an <strong>Admin or Super Admin</strong>.
                    </span>
                  </div>
                )}

                {/* Customer Info */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Customer
                    </h4>
                    {order.customerCode && (
                      <Badge variant="neutral" size="xs">
                        {order.customerCode}
                      </Badge>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Customer Name" required>
                        <Input
                          value={editCustomerName}
                          onChange={(e) => setEditCustomerName(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Phone" required>
                        <Input
                          value={editCustomerPhone}
                          onChange={(e) => setEditCustomerPhone(e.target.value)}
                        />
                      </FormField>
                      <FormField label="WhatsApp">
                        <Input
                          value={editCustomerWhatsapp}
                          onChange={(e) => setEditCustomerWhatsapp(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Address" required>
                        <Input
                          value={editCustomerAddress}
                          onChange={(e) => setEditCustomerAddress(e.target.value)}
                        />
                      </FormField>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400">Name</div>
                        <div className="font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                          {order.customerName}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Phone / WhatsApp</div>
                        <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 mt-0.5 flex items-center gap-2">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {order.customerPhone}
                          {order.customerWhatsapp &&
                            order.customerWhatsapp !== order.customerPhone && (
                              <span className="text-slate-400">
                                (WA: {order.customerWhatsapp})
                              </span>
                            )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="text-slate-400">Delivery Address</div>
                        <div className="text-slate-800 dark:text-slate-200 mt-0.5">
                          {order.customerAddress}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Product Details
                    </h4>
                    {order.linkedProductId && (
                      <Badge variant="info" size="xs">
                        Linked Catalog Product
                      </Badge>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Product Name" required className="sm:col-span-2">
                        <Input
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Category">
                        <Select
                          options={categoryOptions}
                          value={editCategory}
                          onChange={(val) => setEditCategory(String(val))}
                          searchable
                          isClearable
                        />
                      </FormField>
                      <FormField label="SKU">
                        <Input
                          value={editSku}
                          onChange={(e) => setEditSku(e.target.value)}
                          className="font-mono"
                        />
                      </FormField>
                      <FormField label="Model">
                        <Input value={editModel} onChange={(e) => setEditModel(e.target.value)} />
                      </FormField>
                      <FormField label="Variant">
                        <Input
                          value={editVariant}
                          onChange={(e) => setEditVariant(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Color">
                        <Input value={editColor} onChange={(e) => setEditColor(e.target.value)} />
                      </FormField>
                      <FormField label="Quantity" required>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            disabled={financialFieldsLocked}
                            onClick={() => setEditQty((q) => Math.max(1, q - 1))}
                            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center cursor-pointer disabled:opacity-40"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <Input
                            type="number"
                            min={1}
                            disabled={financialFieldsLocked}
                            value={editQty}
                            onChange={(e) =>
                              setEditQty(Math.max(1, Math.round(Number(e.target.value) || 1)))
                            }
                            className="w-20 text-center font-mono font-bold"
                          />
                          <button
                            type="button"
                            disabled={financialFieldsLocked}
                            onClick={() => setEditQty((q) => q + 1)}
                            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center cursor-pointer disabled:opacity-40"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </FormField>
                      <FormField label="Product Photo" className="sm:col-span-2">
                        <div className="flex items-center gap-3">
                          {editProductImagePreview ? (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                              <img
                                src={editProductImagePreview}
                                alt={editProductName}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEditProductImageFile(null);
                                  setEditProductImagePreview('');
                                }}
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer">
                              <ImagePlus className="w-4 h-4 text-[#D4AF37]" />
                              Upload Image
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={handleEditImageSelect}
                              />
                            </label>
                          )}
                        </div>
                      </FormField>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-4 text-xs">
                      {order.productImage && (
                        <img
                          src={order.productImage}
                          alt={order.productName}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
                        <div className="col-span-2 sm:col-span-3">
                          <div className="text-slate-400">Product Name</div>
                          <div className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                            {order.productName}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Category</div>
                          <div className="font-medium mt-0.5">{order.category || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">SKU</div>
                          <div className="font-mono mt-0.5">{order.sku || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Quantity</div>
                          <div className="font-mono font-bold mt-0.5">{order.qty}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Model</div>
                          <div className="mt-0.5">{order.model || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Variant</div>
                          <div className="mt-0.5">{order.variant || '—'}</div>
                        </div>
                        <div>
                          <div className="text-slate-400">Color</div>
                          <div className="mt-0.5">{order.color || '—'}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pricing & Financial Summary */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      Pricing & Payment Summary
                    </h4>
                    <PaymentStateBadge
                      state={
                        order.paymentState ||
                        (order.dueAmount <= 0 ? 'fully_paid' : order.advancePaid > 0 ? 'partially_paid' : 'unpaid')
                      }
                    />
                  </div>

                  {isEditing && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-3 border-b border-slate-200/70 dark:border-slate-800">
                      <FormField label="Selling Price / Unit (৳)">
                        <CurrencyInput
                          min={0}
                          disabled={financialFieldsLocked}
                          value={editSellingUnitPrice}
                          onChange={(e) => setEditSellingUnitPrice(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Delivery Charge (৳)">
                        <CurrencyInput
                          min={0}
                          disabled={financialFieldsLocked}
                          value={editDeliveryCharge}
                          onChange={(e) => setEditDeliveryCharge(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Discount (৳)">
                        <CurrencyInput
                          min={0}
                          disabled={financialFieldsLocked}
                          value={editDiscount}
                          onChange={(e) => setEditDiscount(e.target.value)}
                        />
                      </FormField>

                      {canViewProfit && (
                        <>
                          <FormField label="China Purchase Price / Unit (৳)">
                            <CurrencyInput
                              min={0}
                              value={editChinaUnitCost}
                              onChange={(e) => setEditChinaUnitCost(e.target.value)}
                            />
                          </FormField>
                          <FormField label="Shipping Cost (Total ৳)">
                            <CurrencyInput
                              min={0}
                              value={editShippingCost}
                              onChange={(e) => setEditShippingCost(e.target.value)}
                            />
                          </FormField>
                        </>
                      )}
                    </div>
                  )}

                  {liveFinancials && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div>
                        <div className="text-slate-400">Unit Price</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {formatBDT(
                            isEditing ? Number(editSellingUnitPrice || 0) : order.sellingUnitPrice
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Subtotal</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {formatBDT(liveFinancials.subtotal)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Delivery / Discount</div>
                        <div className="font-mono mt-0.5">
                          +{formatBDT(liveFinancials.deliveryCharge)} / -
                          {formatBDT(liveFinancials.discount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Total Amount</div>
                        <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                          {formatBDT(liveFinancials.totalAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Verified Advance Paid</div>
                        <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {formatBDT(liveFinancials.verifiedCollected)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Pending Verification</div>
                        <div className="font-mono font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                          {formatBDT(liveFinancials.pendingCollected)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Refunded</div>
                        <div className="font-mono text-rose-600 dark:text-rose-400 mt-0.5">
                          {formatBDT(liveFinancials.verifiedRefunded)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Remaining Due</div>
                        <div className="font-mono font-bold text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                          {formatBDT(liveFinancials.dueAmount)}
                        </div>
                      </div>
                    </div>
                  )}

                  {canViewProfit && liveFinancials && (
                    <div className="pt-3 mt-2 border-t border-slate-200/70 dark:border-slate-800 grid grid-cols-3 gap-3 text-xs tabular-nums">
                      <div>
                        <div className="text-slate-400">China Cost / Unit</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {formatBDT(
                            isEditing
                              ? Number(editChinaUnitCost || 0)
                              : privateCost?.chinaUnitCost || 0
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Import Shipping Cost</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {formatBDT(
                            isEditing
                              ? Number(editShippingCost || 0)
                              : privateCost?.shippingCost || 0
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Expected Profit</div>
                        <div className="font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {formatBDT(liveFinancials.expectedProfit)} (
                          {liveFinancials.expectedProfitPercent}%)
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Supplier, Dates & Notes */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Supplier, Dates & Notes
                  </h4>

                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Supplier">
                        <Select
                          options={supplierOptions}
                          value={editSupplierId}
                          onChange={(val) => setEditSupplierId(String(val))}
                          placeholder="Select supplier..."
                          searchable
                          isClearable
                        />
                      </FormField>
                      <FormField label="Supplier Order ID">
                        <Input
                          value={editSupplierOrderRef}
                          onChange={(e) => setEditSupplierOrderRef(e.target.value)}
                          className="font-mono"
                        />
                      </FormField>
                      <FormField label="Order Date">
                        <Input
                          type="date"
                          value={editOrderDate}
                          onChange={(e) => setEditOrderDate(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Expected Arrival Date">
                        <Input
                          type="date"
                          min={editOrderDate || undefined}
                          value={editEstimatedDeliveryDate}
                          onChange={(e) => setEditEstimatedDeliveryDate(e.target.value)}
                        />
                      </FormField>
                      <FormField label="Sub-Brand">
                        <Select
                          options={allowedSubBrands.map((b) => ({ value: b, label: b }))}
                          value={editSubBrand}
                          onChange={(val) => setEditSubBrand(val as 'SAT' | 'GZ' | 'RTX')}
                          searchable={false}
                        />
                      </FormField>
                      <div className="hidden sm:block" />
                      <FormField
                        label="Public Note"
                        className={canViewProfit ? '' : 'sm:col-span-2'}
                      >
                        <Textarea
                          rows={2}
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                      </FormField>
                      {canViewProfit && (
                        <FormField label="Internal Note (Restricted)">
                          <Textarea
                            rows={2}
                            value={editInternalNotes}
                            onChange={(e) => setEditInternalNotes(e.target.value)}
                          />
                        </FormField>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-slate-400">Supplier</div>
                        <div className="font-semibold mt-0.5">
                          {order.supplierName || 'Not assigned'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Supplier Order Ref</div>
                        <div className="font-mono mt-0.5">
                          {order.supplierOrderRef || privateCost?.supplierOrderRef || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Order Date</div>
                        <div className="font-mono mt-0.5">
                          {order.orderDate ||
                            new Date(order.createdAt).toISOString().split('T')[0]}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Expected Arrival</div>
                        <div className="font-mono mt-0.5 flex items-center gap-1.5">
                          {order.estimatedDeliveryDate || '—'}
                          {overdue && <OverdueTag />}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-slate-400">Public Note</div>
                        <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                          {order.notes || '—'}
                        </div>
                      </div>
                      {canViewProfit && (
                        <div className="col-span-2 sm:col-span-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                          <div className="text-slate-400">Internal Note (Restricted)</div>
                          <div className="mt-0.5 text-slate-700 dark:text-slate-300">
                            {privateCost?.internalNotes || '—'}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: PAYMENTS (READ-ONLY LEDGER) */}
            {activeTab === 'payments' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
                  <span>
                    Read-only payment ledger for Part 2. Collection, verification, and refunds are managed in Payment Management (Part 4).
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100 shrink-0">
                    Due: {formatBDT(order.dueAmount)}
                  </span>
                </div>

                {payments.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No payments recorded on this Pre-Order yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                              {p.type === 'refund' ? '-' : '+'}
                              {formatBDT(p.amount)}
                            </span>
                            <Badge
                              variant={
                                p.status === 'verified'
                                  ? 'success'
                                  : p.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                              }
                              size="xs"
                            >
                              {p.status}
                            </Badge>
                            <Badge variant="neutral" size="xs">
                              {p.type} • {p.method}
                            </Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>Received: {formatDateTime(p.receivedAt || p.createdAt)}</span>
                            {p.referenceNo && (
                              <span className="font-mono">Ref: {p.referenceNo}</span>
                            )}
                            <span>By: {p.recordedByName || p.recordedBy}</span>
                            {p.verifiedByName && <span>Verified by: {p.verifiedByName}</span>}
                          </div>
                        </div>

                        {p.receiptUrl && (
                          <button
                            type="button"
                            onClick={() => setReceiptModalUrl(p.receiptUrl || null)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Receipt className="w-3.5 h-3.5 text-[#D4AF37]" />
                            Receipt
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: TIMELINE (READ-ONLY) */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  Read-only status history. Status progression & cancellation workflow will be added in Part 3.
                </div>

                {statusHistory.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No status timeline entries found.
                  </div>
                ) : (
                  <div className="relative pl-5 space-y-4 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
                    {statusHistory.map((item) => (
                      <div key={item.id} className="relative">
                        <span className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-[#D4AF37] border-2 border-white dark:border-slate-900" />
                        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {item.fromStatus && (
                                <span className="text-xs text-slate-400">
                                  {item.fromStatus} →
                                </span>
                              )}
                              <PreOrderStatusBadge status={item.toStatus} size="xs" />
                            </div>
                            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDateTime(item.timestamp)}
                            </span>
                          </div>
                          {item.note && (
                            <p className="text-xs text-slate-700 dark:text-slate-300">
                              {item.note}
                            </p>
                          )}
                          <div className="text-[11px] text-slate-400">
                            By {item.changedByName || item.changedBy}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: AUDIT (ADMIN / SUPER ADMIN ONLY) */}
            {activeTab === 'audit' && canViewAudit && (
              <div className="space-y-3">
                {auditLogs.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No audit entries logged yet.
                  </div>
                ) : (
                  auditLogs.map((entry) => {
                    const beforeObj = entry.metadata?.before as
                      | Record<string, any>
                      | undefined;
                    const afterObj = entry.metadata?.after as
                      | Record<string, any>
                      | undefined;
                    const diffKeys =
                      beforeObj && afterObj
                        ? Array.from(
                            new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])
                          )
                        : [];

                    return (
                      <div
                        key={entry.id}
                        className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="gold" size="xs">
                              {entry.action}
                            </Badge>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {entry.summary}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">
                            {formatDateTime(entry.timestamp)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Actor: <span className="font-medium">{entry.userName}</span> (
                          {entry.userRole})
                        </div>

                        {diffKeys.length > 0 && (
                          <div className="mt-2 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <table className="w-full text-[11px] text-left">
                              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500">
                                <tr>
                                  <th className="px-2.5 py-1.5 font-semibold">Field</th>
                                  <th className="px-2.5 py-1.5 font-semibold">Before</th>
                                  <th className="px-2.5 py-1.5 font-semibold">After</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {diffKeys.map((k) => (
                                  <tr key={k}>
                                    <td className="px-2.5 py-1.5 font-mono font-medium text-slate-700 dark:text-slate-300">
                                      {k}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-rose-600 dark:text-rose-400 break-all">
                                      {String(beforeObj?.[k] ?? '—')}
                                    </td>
                                    <td className="px-2.5 py-1.5 text-emerald-700 dark:text-emerald-400 break-all">
                                      {String(afterObj?.[k] ?? '—')}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : null}
      </Drawer>

      {/* Receipt Preview Modal */}
      <Modal
        isOpen={Boolean(receiptModalUrl)}
        onClose={() => setReceiptModalUrl(null)}
        title="Payment Receipt"
        size="md"
      >
        {receiptModalUrl && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={receiptModalUrl}
              alt="Payment receipt"
              className="max-h-[70vh] w-auto rounded-xl border border-slate-200 dark:border-slate-700"
            />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={() => setReceiptModalUrl(null)}
            >
              Close Preview
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
};

export default PreOrderDetailDrawer;
