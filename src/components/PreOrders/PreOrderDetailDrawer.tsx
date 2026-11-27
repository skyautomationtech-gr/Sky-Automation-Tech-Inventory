import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Ban,
  Banknote,
  Boxes,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  ImagePlus,
  Link2,
  Lock,
  MessageCircle,
  Minus,
  Package,
  PackageCheck,
  Paperclip,
  Phone,
  Plus,
  Power,
  Printer,
  QrCode,
  Receipt,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  User,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import {
  AccountingPosting,
  Brand,
  Category,
  CompanySettings,
  PreOrder,
  PreOrderAuditEntry,
  PreOrderItem,
  PreOrderPayment,
  PreOrderPrivateCost,
  PreOrderPrivateItemCost,
  PreOrderReceipt,
  PreOrderStatusHistory,
  PreOrderSupplierPayment,
  Product,
  RolePermissionsMap,
  SubBrand,
  Supplier,
  UserProfile,
} from '../../types';
import {
  getSellingSubBrands,
  getUserAllowedSubBrandIds,
  isLegacySatCode,
} from '../../utils/subBrands';
import {
  MAX_PRE_ORDER_ITEMS,
  PRE_ORDER_EDIT_LOCKED_STATUSES,
  PRE_ORDER_FORWARD_FLOW,
  computeItemCostMap,
  formatBDT,
  getTodayIsoDate,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderOverdue,
  isPreOrderPartiallyReceived,
  isPreOrderSuperAdmin,
  isValidBdPhone,
  normalizeBdPhone,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import {
  calculatePerOrderSupplierSummary,
  calculatePreOrderFinancials,
  roundMoney,
  toPaisa,
} from '../../preOrders/calculations';
import { uploadPreOrderImage, validateImageFile } from '../../preOrders/imageUpload';
import {
  buildPublicTrackingUrl,
  isSafeTrackingTokenFormat,
  isValidHttpsUrl,
} from '../../preOrders/tracking';
import { getBrands, getProducts } from '../../firebase/db';
import {
  actorFromUser,
  getPreOrderAccountingPostings,
  getPreOrderFullDetail,
  getPreOrderReceipts,
  getPreOrderSupplierPayments,
  markPreOrderPaymentAsDuplicate,
  recalculatePreOrderFromLedger,
  regeneratePublicTrackingToken,
  syncPublicTracking,
  togglePublicTrackingEnabled,
  updatePreOrder,
  updatePreOrderCourierVisibility,
  updatePreOrderPrivateCost,
  verifyPreOrderPayment,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  ConfirmDialog,
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
  PartiallyReceivedTag,
  PaymentStateBadge,
  PreOrderStatusBadge,
  SubBrandBadge,
} from './PreOrderStatusBadge';
import PreOrderStatusDialog from './PreOrderStatusDialog';
import {
  CollectPaymentModal,
  RefundPaymentModal,
  RejectPaymentModal,
  ReversePaymentModal,
  SuperAdminSelfVerifyModal,
} from './PreOrderPaymentModals';
import PreOrderPaymentReceiptModal from './PreOrderPaymentReceiptModal';
import PreOrderShipmentTab from './PreOrderShipmentTab';
import {
  RecordSupplierPaymentModal,
  ReverseSupplierPaymentModal,
} from './SupplierPaymentModal';
import TrackingLinkShareModal from './TrackingLinkShareModal';
import ReceiveStockModal from './ReceiveStockModal';
import ConvertToSaleModal from './ConvertToSaleModal';
import CancelReconcileModal from './CancelReconcileModal';
import CustomerMessageModal from './CustomerMessageModal';

export interface PreOrderDetailDrawerProps {
  preOrderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  brands?: Brand[];
  products?: Product[];
  suppliers: Supplier[];
  companySettings?: CompanySettings | null;
  subBrands?: SubBrand[];
  initialEditMode?: boolean;
  initialTab?: DetailTab;
  onNavigate?: (tab: string, subAction?: string, initialId?: string | null) => void;
  onUpdated?: () => void;
}

type DetailTab = 'overview' | 'payments' | 'shipment' | 'supplier' | 'timeline' | 'audit';

interface DraftDrawerItem {
  itemId: string;
  linkedProductId: string;
  linkedVariantId: string;
  productName: string;
  category: string;
  sku: string;
  model: string;
  variant: string;
  color: string;
  qty: number;
  sellingUnitPrice: string;
  chinaUnitCost: string;
  imageUrl: string;
  imageFile: File | null;
  receivedQty: number;
  damagedQty: number;
}

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
  brands,
  products,
  suppliers,
  companySettings,
  subBrands,
  initialEditMode = false,
  initialTab = 'overview',
  onNavigate,
  onUpdated,
}) => {
  const toast = useToast();

  const isAdminUser = isPreOrderAdminRole(user.role);
  const isSuperAdmin = isPreOrderSuperAdmin(user);
  const canEdit = hasPermission(user, rolePermissions, 'preOrderEdit');
  const canViewProfit = hasPermission(user, rolePermissions, 'preOrderViewProfit');
  const canViewSupplier = hasPermission(user, rolePermissions, 'preOrderSupplier') || isAdminUser;
  const canCollectPayment = hasPermission(user, rolePermissions, 'preOrderCollectPayment');
  const canVerifyPayment = hasPermission(user, rolePermissions, 'preOrderVerifyPayment');
  const canRefund = hasPermission(user, rolePermissions, 'preOrderRefund');
  const canUpdateStatus = hasPermission(user, rolePermissions, 'preOrderUpdateStatus');
  const canReceiveStock = hasPermission(user, rolePermissions, 'preOrderReceiveStock') || isAdminUser;
  const canConvertSale = hasPermission(user, rolePermissions, 'preOrderConvertSale') || isAdminUser;
  const canManageTracking = hasPermission(user, rolePermissions, 'preOrderManageTracking') || isAdminUser;
  const canViewAudit = isAdminUser;

  const activeSellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: false, companySettings }),
    [subBrands, companySettings]
  );

  const allowedSubBrands = useMemo<string[]>(() => {
    const ids = getUserAllowedSubBrandIds(user, subBrands, {
      includeInactive: false,
      companySettings,
    });
    return ids.length > 0 ? ids : activeSellingSubBrands.map((sb) => sb.shortCode);
  }, [user, subBrands, companySettings, activeSellingSubBrands]);

  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [order, setOrder] = useState<PreOrder | null>(null);
  const [payments, setPayments] = useState<PreOrderPayment[]>([]);
  const [statusHistory, setStatusHistory] = useState<PreOrderStatusHistory[]>([]);
  const [privateCost, setPrivateCost] = useState<PreOrderPrivateCost | null>(null);
  const [auditLogs, setAuditLogs] = useState<PreOrderAuditEntry[]>([]);
  const [orderSupplierPayments, setOrderSupplierPayments] = useState<PreOrderSupplierPayment[]>([]);
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null);

  // Part 3 interactive workflow states
  const [showCollectModal, setShowCollectModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PreOrderPayment | null>(null);
  const [reverseTarget, setReverseTarget] = useState<PreOrderPayment | null>(null);
  const [selfVerifyTarget, setSelfVerifyTarget] = useState<{
    payment: PreOrderPayment;
    decision: 'verified' | 'rejected';
  } | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<PreOrderPayment | null>(null);
  const [markingDuplicate, setMarkingDuplicate] = useState(false);
  const [printableReceiptPayment, setPrintableReceiptPayment] = useState<PreOrderPayment | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const verifyInFlightRef = useRef(false);
  const [recalculating, setRecalculating] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'status' | 'payments'>('all');

  // Part 4 interactive supplier payment states
  const [showSupplierPayModal, setShowSupplierPayModal] = useState(false);
  const [reverseSupPayTarget, setReverseSupPayTarget] = useState<PreOrderSupplierPayment | null>(null);

  // Part 5 public tracking portal states
  const [showShareTrackingModal, setShowShareTrackingModal] = useState(false);
  const [copiedTrackingLink, setCopiedTrackingLink] = useState(false);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenReason, setRegenReason] = useState('');
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [toggleReason, setToggleReason] = useState('');
  const [toggleTargetEnable, setToggleTargetEnable] = useState(false);
  const [lastTrackingSyncWarning, setLastTrackingSyncWarning] = useState('');

  // Part 6 inventory, conversion, cancellation & accounting states
  const [receipts, setReceipts] = useState<PreOrderReceipt[]>([]);
  const [poPostings, setPoPostings] = useState<AccountingPosting[]>([]);
  const [localProducts, setLocalProducts] = useState<Product[]>(products || []);
  const [localBrands, setLocalBrands] = useState<Brand[]>(brands || []);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCustomerMsgModal, setShowCustomerMsgModal] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerWhatsapp, setEditCustomerWhatsapp] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editItems, setEditItems] = useState<DraftDrawerItem[]>([]);
  const [editDeliveryCharge, setEditDeliveryCharge] = useState('0');
  const [editDiscount, setEditDiscount] = useState('0');
  const [editShippingCost, setEditShippingCost] = useState('0');
  const [editSupplierId, setEditSupplierId] = useState('');
  const [editSupplierOrderRef, setEditSupplierOrderRef] = useState('');
  const [editOrderDate, setEditOrderDate] = useState('');
  const [editEstimatedDeliveryDate, setEditEstimatedDeliveryDate] = useState('');
  const [editSubBrand, setEditSubBrand] = useState<string>('GZ');
  const [editNotes, setEditNotes] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');

  const hydrateEditForm = useCallback(
    (ord: PreOrder, priv: PreOrderPrivateCost | null) => {
      setEditCustomerName(ord.customerName || '');
      setEditCustomerPhone(ord.customerPhone || '');
      setEditCustomerWhatsapp(ord.customerWhatsapp || ord.customerPhone || '');
      setEditCustomerAddress(ord.customerAddress || '');

      const normalized = normalizePreOrderItems(ord);
      const costMap = computeItemCostMap(ord, priv);
      setEditItems(
        normalized.map((it) => ({
          itemId: it.itemId,
          linkedProductId: it.linkedProductId || '',
          linkedVariantId: it.linkedVariantId || '',
          productName: it.productName || '',
          category: it.category || '',
          sku: it.sku || '',
          model: it.model || '',
          variant: it.variant || '',
          color: it.color || '',
          qty: Math.max(1, Number(it.qty) || 1),
          sellingUnitPrice: String(it.sellingUnitPrice ?? 0),
          chinaUnitCost: String(costMap[it.itemId]?.chinaUnitCost ?? priv?.chinaUnitCost ?? 0),
          imageUrl: it.imageUrl || '',
          imageFile: null,
          receivedQty: Math.max(
            0,
            Number(it.receivedQty ?? (normalized.length === 1 ? ord.stockReceivedQty : 0)) || 0
          ),
          damagedQty: Math.max(
            0,
            Number(it.damagedQty ?? (normalized.length === 1 ? ord.damagedQty : 0)) || 0
          ),
        }))
      );

      setEditDeliveryCharge(String(ord.deliveryCharge ?? 0));
      setEditDiscount(String(ord.discount ?? 0));
      setEditShippingCost(String(priv?.shippingCost ?? 0));
      setEditSupplierId(ord.supplierId || '');
      setEditSupplierOrderRef(ord.supplierOrderRef || priv?.supplierOrderRef || '');
      setEditOrderDate(ord.orderDate || getTodayIsoDate());
      setEditEstimatedDeliveryDate(ord.estimatedDeliveryDate || '');
      setEditSubBrand(ord.subBrand || '');
      setEditNotes(ord.notes || '');
      setEditInternalNotes(priv?.internalNotes || '');
    },
    []
  );

  useEffect(() => {
    if (products) setLocalProducts(products);
  }, [products]);

  useEffect(() => {
    if (brands) setLocalBrands(brands);
  }, [brands]);

  const loadDetail = useCallback(async () => {
    if (!preOrderId) return;
    setLoading(true);
    setLoadError('');
    try {
      const [detail, supPays, rcptList, postingList, fetchedProds, fetchedBrands] = await Promise.all([
        getPreOrderFullDetail(preOrderId, {
          canViewProfit,
          canViewSupplier,
          canViewAudit,
        }),
        canViewSupplier
          ? getPreOrderSupplierPayments(preOrderId, 100).catch(() => [] as PreOrderSupplierPayment[])
          : Promise.resolve([] as PreOrderSupplierPayment[]),
        getPreOrderReceipts(preOrderId, 50).catch(() => [] as PreOrderReceipt[]),
        getPreOrderAccountingPostings(preOrderId, 100).catch(() => [] as AccountingPosting[]),
        !products || products.length === 0 ? getProducts(true).catch(() => [] as Product[]) : Promise.resolve(null),
        !brands || brands.length === 0 ? getBrands().catch(() => [] as Brand[]) : Promise.resolve(null),
      ]);
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
      setOrderSupplierPayments(supPays);
      setReceipts(rcptList);
      setPoPostings(postingList);
      if (fetchedProds) setLocalProducts(fetchedProds);
      if (fetchedBrands) setLocalBrands(fetchedBrands);
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
  }, [preOrderId, canViewProfit, canViewSupplier, canViewAudit, hydrateEditForm, products, brands, initialEditMode, canEdit]);

  useEffect(() => {
    if (isOpen && preOrderId) {
      setActiveTab(initialTab || 'overview');
      setIsEditing(false);
      loadDetail();
    }
  }, [isOpen, preOrderId, initialTab, loadDetail]);

  const isStatusLocked = order ? PRE_ORDER_EDIT_LOCKED_STATUSES.includes(order.status) : true;

  const reversedPaymentIds = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.type === 'reversal' && p.reversesPaymentId) {
        set.add(p.reversesPaymentId);
      }
    });
    return set;
  }, [payments]);

  const hasAnyActivePayment = useMemo(() => {
    if (!order) return false;
    return (
      payments.some((p) => p.status !== 'rejected') ||
      Number(order.paymentCount || 0) > 0 ||
      Number(order.advancePaid || 0) > 0 ||
      Number(order.pendingAmount || 0) > 0
    );
  }, [order, payments]);

  const isConverted = Boolean(order?.convertedSaleId || order?.convertedOrderId);
  const financialFieldsLocked = isConverted || (hasAnyActivePayment && !isAdminUser);

  const orderItems = useMemo(() => normalizePreOrderItems(order), [order]);
  const itemCostMap = useMemo(
    () => computeItemCostMap(order, privateCost),
    [order, privateCost]
  );
  const totalOrderedQty = useMemo(
    () => order?.totalQty ?? orderItems.reduce((s, it) => s + (Number(it.qty) || 0), 0),
    [order, orderItems]
  );
  const remainingStockToReceive = useMemo(() => {
    if (!order) return 0;
    return orderItems.reduce((sum, it) => {
      const rec = Number(it.receivedQty ?? (orderItems.length === 1 ? order.stockReceivedQty : 0)) || 0;
      const dmg = Number(it.damagedQty ?? (orderItems.length === 1 ? order.damagedQty : 0)) || 0;
      return sum + Math.max(0, (Number(it.qty) || 0) - (rec + dmg));
    }, 0);
  }, [order, orderItems]);

  const canShowReceiveStock = Boolean(
    order &&
      !isConverted &&
      !['Delivered', 'Cancelled', 'Refunded'].includes(order.status) &&
      remainingStockToReceive > 0 &&
      canReceiveStock
  );
  const canShowConvertSale = Boolean(
    order &&
      !isConverted &&
      !['Cancelled', 'Refunded'].includes(order.status) &&
      ((order.stockReceivedQty || 0) > 0 || order.status === 'Received in Stock') &&
      canConvertSale
  );
  const canShowCancelReconcile = Boolean(
    order &&
      !isConverted &&
      !['Delivered', 'Cancelled', 'Refunded'].includes(order.status) &&
      (canUpdateStatus || isAdminUser)
  );

  const liveFinancials = useMemo(() => {
    if (!order) return null;
    const calcItems: PreOrderItem[] = isEditing
      ? editItems.map((it) => {
          const q = Math.max(1, Math.round(Number(it.qty) || 1));
          const sp = Math.max(0, Number(it.sellingUnitPrice || 0));
          return {
            itemId: it.itemId,
            productName: it.productName,
            qty: q,
            sellingUnitPrice: sp,
            lineTotal: roundMoney(q * sp),
            chinaUnitCost: Math.max(0, Number(it.chinaUnitCost || 0)),
          };
        })
      : orderItems.map((it) => ({
          ...it,
          chinaUnitCost:
            itemCostMap[it.itemId]?.chinaUnitCost ?? privateCost?.chinaUnitCost ?? 0,
        }));

    return calculatePreOrderFinancials({
      items: calcItems,
      deliveryCharge: isEditing ? Number(editDeliveryCharge || 0) : order.deliveryCharge,
      discount: isEditing ? Number(editDiscount || 0) : order.discount,
      shippingCost: isEditing
        ? Number(editShippingCost || 0)
        : privateCost?.shippingCost || 0,
      payments:
        payments.length > 0
          ? payments
          : [
              { type: 'advance', status: 'verified', amount: order.advancePaid || 0 },
              { type: 'refund', status: 'verified', amount: order.refundedAmount || 0 },
            ],
    });
  }, [
    order,
    orderItems,
    itemCostMap,
    payments,
    privateCost,
    isEditing,
    editItems,
    editDeliveryCharge,
    editDiscount,
    editShippingCost,
  ]);

  const mergedTimeline = useMemo(() => {
    type TimelineItem =
      | { kind: 'status'; timestamp: number; data: PreOrderStatusHistory }
      | { kind: 'payment'; timestamp: number; data: PreOrderPayment };
    const list: TimelineItem[] = [];
    if (timelineFilter === 'all' || timelineFilter === 'status') {
      statusHistory.forEach((h) =>
        list.push({ kind: 'status', timestamp: h.timestamp, data: h })
      );
    }
    if (timelineFilter === 'all' || timelineFilter === 'payments') {
      payments.forEach((p) =>
        list.push({ kind: 'payment', timestamp: p.receivedAt || p.createdAt, data: p })
      );
    }
    return list.sort((a, b) => a.timestamp - b.timestamp);
  }, [statusHistory, payments, timelineFilter]);

  const needsRefundRequired = Boolean(
    order &&
      order.status === 'Cancelled' &&
      toPaisa(liveFinancials?.verifiedNetPaid || 0) > 0
  );

  const categoryOptions = useMemo(() => {
    const names = Array.from(
      new Set([
        ...categories.map((c) => c.name).filter(Boolean),
        ...editItems.map((it) => it.category).filter(Boolean),
      ])
    );
    return names.map((name) => ({ value: name, label: name }));
  }, [categories, editItems]);

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: [s.supplierCode, s.phone].filter(Boolean).join(' • '),
    }));
  }, [suppliers]);

  const updateEditItem = (itemId: string, patch: Partial<DraftDrawerItem>) => {
    setEditItems((prev) =>
      prev.map((it) => (it.itemId === itemId ? { ...it, ...patch } : it))
    );
  };

  const handleAddEditItem = () => {
    if (financialFieldsLocked) return;
    if (editItems.length >= MAX_PRE_ORDER_ITEMS) {
      toast.error(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed.`);
      return;
    }
    const uniqueId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setEditItems((prev) => [
      ...prev,
      {
        itemId: uniqueId,
        linkedProductId: '',
        linkedVariantId: '',
        productName: '',
        category: categories[0]?.name || '',
        sku: '',
        model: '',
        variant: '',
        color: '',
        qty: 1,
        sellingUnitPrice: '0',
        chinaUnitCost: '0',
        imageUrl: '',
        imageFile: null,
        receivedQty: 0,
        damagedQty: 0,
      },
    ]);
  };

  const handleDuplicateEditItem = (src: DraftDrawerItem) => {
    if (financialFieldsLocked) return;
    if (editItems.length >= MAX_PRE_ORDER_ITEMS) {
      toast.error(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed.`);
      return;
    }
    const uniqueId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setEditItems((prev) => [
      ...prev,
      {
        ...src,
        itemId: uniqueId,
        receivedQty: 0,
        damagedQty: 0,
        imageFile: null,
      },
    ]);
  };

  const handleRemoveEditItem = (item: DraftDrawerItem) => {
    if (financialFieldsLocked) return;
    if (editItems.length <= 1) {
      toast.error('Pre-order must keep at least 1 product line item.');
      return;
    }
    if (item.receivedQty + item.damagedQty > 0) {
      toast.error(`Cannot remove "${item.productName}" because stock was already received for it.`);
      return;
    }
    setEditItems((prev) => prev.filter((it) => it.itemId !== item.itemId));
  };

  const handleEditItemImageSelect = (
    itemId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateEditItem(itemId, { imageFile: file, imageUrl: reader.result });
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
    if (editItems.length === 0) {
      toast.error('At least 1 product item is required.');
      return;
    }
    if (editEstimatedDeliveryDate && editOrderDate && editEstimatedDeliveryDate < editOrderDate) {
      toast.error('Expected arrival date cannot be earlier than order date.');
      return;
    }

    for (let i = 0; i < editItems.length; i++) {
      const it = editItems[i];
      if (!it.productName.trim()) {
        toast.error(`Item #${i + 1}: Product name is required.`);
        return;
      }
      const q = Math.round(Number(it.qty) || 0);
      if (q < 1) {
        toast.error(`Item #${i + 1} (${it.productName}): Quantity must be at least 1.`);
        return;
      }
      if (q < it.receivedQty + it.damagedQty) {
        toast.error(
          `Item "${it.productName}" already has ${it.receivedQty + it.damagedQty} received/damaged units; qty cannot be lower.`
        );
        return;
      }
      const sp = Number(it.sellingUnitPrice || 0);
      if (sp <= 0) {
        toast.error(`Item #${i + 1} (${it.productName}): Selling price must be greater than 0.`);
        return;
      }
      const cp = Number(it.chinaUnitCost || 0);
      if (cp < 0) {
        toast.error(`Item #${i + 1} (${it.productName}): China cost cannot be negative.`);
        return;
      }
    }

    const nextDelivery = Number(editDeliveryCharge || 0);
    const nextDiscount = Number(editDiscount || 0);
    if (nextDelivery < 0 || nextDiscount < 0) {
      toast.error('Delivery charge and discount cannot be negative.');
      return;
    }
    const subtotalCheck = calculatePreOrderFinancials({
      items: editItems.map((it) => ({
        itemId: it.itemId,
        productName: it.productName,
        qty: Math.round(Number(it.qty) || 1),
        sellingUnitPrice: Number(it.sellingUnitPrice || 0),
        lineTotal: roundMoney(
          Math.round(Number(it.qty) || 1) * Number(it.sellingUnitPrice || 0)
        ),
      })),
    }).subtotal;
    if (toPaisa(nextDiscount) > toPaisa(subtotalCheck)) {
      toast.error('Discount cannot exceed product subtotal.');
      return;
    }

    setSaving(true);
    try {
      const resolvedUrls = await Promise.all(
        editItems.map(async (it) => {
          if (it.imageFile) {
            const uploaded = await uploadPreOrderImage(it.imageFile, 'products');
            return uploaded.url;
          }
          return it.imageUrl;
        })
      );

      const originalItemsById = new Map<string, PreOrderItem>(
        orderItems.map((o) => [o.itemId, o])
      );
      const nextItems: PreOrderItem[] = editItems.map((it, idx) => {
        const orig = originalItemsById.get(it.itemId);
        const safeQty = financialFieldsLocked && orig ? orig.qty : Math.round(Number(it.qty) || 1);
        const safePrice =
          financialFieldsLocked && orig
            ? orig.sellingUnitPrice
            : roundMoney(Number(it.sellingUnitPrice || 0));
        return {
          ...orig,
          itemId: it.itemId,
          linkedProductId: it.linkedProductId || orig?.linkedProductId || '',
          linkedVariantId: it.linkedVariantId || orig?.linkedVariantId || '',
          productName: it.productName.trim(),
          category: it.category.trim(),
          sku: it.sku.trim(),
          model: it.model.trim(),
          variant: it.variant.trim(),
          color: it.color.trim(),
          imageUrl: resolvedUrls[idx] || '',
          qty: safeQty,
          sellingUnitPrice: safePrice,
          lineTotal: roundMoney(safeQty * safePrice),
          receivedQty: orig?.receivedQty ?? it.receivedQty,
          damagedQty: orig?.damagedQty ?? it.damagedQty,
          deliveredQty: orig?.deliveredQty ?? 0,
        };
      });

      const selectedSupplier = suppliers.find((s) => s.id === editSupplierId);
      const actor = actorFromUser(user);

      if (isLegacySatCode(editSubBrand)) {
        toast.error(
          'Sky Automation Tech (SAT) is the parent importer company and cannot hold customer pre-orders. Please choose an active selling sub-brand.'
        );
        setSaving(false);
        return;
      }

      const updateRes = await updatePreOrder(
        order.id,
        {
          subBrand: editSubBrand,
          subBrandId: editSubBrand,
          customerName: editCustomerName.trim(),
          customerPhone: normPhone,
          customerWhatsapp: editCustomerWhatsapp.trim()
            ? normalizeBdPhone(editCustomerWhatsapp)
            : normPhone,
          customerAddress: editCustomerAddress.trim(),
          items: nextItems,
          ...(financialFieldsLocked
            ? {}
            : {
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
        const nextItemCosts: PreOrderPrivateItemCost[] = editItems.map((it) => {
          const chinaUnit = roundMoney(Number(it.chinaUnitCost || 0));
          return {
            itemId: it.itemId,
            chinaUnitCost: chinaUnit,
            supplierUnitCost: chinaUnit,
            lineChinaTotal: roundMoney(chinaUnit * Math.max(1, Math.round(Number(it.qty) || 1))),
          };
        });
        const shipNum = roundMoney(Number(editShippingCost || 0));
        const prevItemCostsJson = JSON.stringify(
          (privateCost?.itemCosts || []).map((c) => ({
            id: c.itemId,
            c: roundMoney(c.chinaUnitCost),
          }))
        );
        const nextItemCostsJson = JSON.stringify(
          nextItemCosts.map((c) => ({ id: c.itemId, c: c.chinaUnitCost }))
        );

        if (
          prevItemCostsJson !== nextItemCostsJson ||
          shipNum !== Number(privateCost?.shippingCost || 0) ||
          editInternalNotes.trim() !== (privateCost?.internalNotes || '') ||
          editSupplierOrderRef.trim() !== (privateCost?.supplierOrderRef || '')
        ) {
          await updatePreOrderPrivateCost(
            order.id,
            {
              itemCosts: nextItemCosts,
              shippingCost: shipNum,
              internalNotes: editInternalNotes.trim(),
              supplierOrderRef: editSupplierOrderRef.trim(),
            },
            actor
          );
        }
      }

      toast.success(`${order.preOrderNumber} updated successfully.`);
      if (updateRes.trackingSyncWarning) {
        setLastTrackingSyncWarning(updateRes.trackingSyncWarning);
        toast.warning(updateRes.trackingSyncWarning);
      } else {
        setLastTrackingSyncWarning('');
      }
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

  const handleVerifyPayment = async (payment: PreOrderPayment) => {
    if (!order || !canVerifyPayment || verifyingId || verifyInFlightRef.current) return;
    if (payment.recordedBy === user.id) {
      if (isSuperAdmin) {
        setSelfVerifyTarget({ payment, decision: 'verified' });
      } else {
        toast.error('Staff and Admin cannot verify their own payment entry.');
      }
      return;
    }
    verifyInFlightRef.current = true;
    setVerifyingId(payment.id);
    try {
      const res = await verifyPreOrderPayment(order.id, payment.id, 'verified', actorFromUser(user));
      toast.success(`Verified ${formatBDT(payment.amount)} on ${order.preOrderNumber}.`);
      if (res.trackingSyncWarning) {
        setLastTrackingSyncWarning(res.trackingSyncWarning);
        toast.warning(res.trackingSyncWarning);
      } else {
        setLastTrackingSyncWarning('');
      }
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to verify payment.');
    } finally {
      verifyInFlightRef.current = false;
      setVerifyingId(null);
    }
  };

  const handleConfirmMarkDuplicate = async () => {
    if (!order || !duplicateTarget || !isAdminUser || markingDuplicate) return;
    setMarkingDuplicate(true);
    try {
      const res = await markPreOrderPaymentAsDuplicate(
        order.id,
        duplicateTarget.id,
        actorFromUser(user)
      );
      toast.success(
        `Marked ${formatBDT(duplicateTarget.amount)} as duplicate and rejected.`
      );
      if (res.trackingSyncWarning) {
        setLastTrackingSyncWarning(res.trackingSyncWarning);
        toast.warning(res.trackingSyncWarning);
      } else {
        setLastTrackingSyncWarning('');
      }
      setDuplicateTarget(null);
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark payment as duplicate.');
    } finally {
      setMarkingDuplicate(false);
    }
  };

  const handleRecalculateLedger = async () => {
    if (!order || !isAdminUser || recalculating) return;
    setRecalculating(true);
    try {
      const res = await recalculatePreOrderFromLedger(order.id, actorFromUser(user));
      if (res.changed) {
        toast.success('Derived totals rebuilt from payment ledger & logged to audit.');
        if (res.trackingSyncWarning) {
          setLastTrackingSyncWarning(res.trackingSyncWarning);
          toast.warning(res.trackingSyncWarning);
        } else {
          setLastTrackingSyncWarning('');
        }
        await loadDetail();
        onUpdated?.();
      } else {
        toast.success('Stored totals already match the payment ledger.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Recalculation failed.');
    } finally {
      setRecalculating(false);
    }
  };

  const trackingToken = (order?.trackingToken || order?.trackingTokenId || '').trim();
  const baseUrlConfigured = isValidHttpsUrl(companySettings?.publicAppUrl);
  const publicTrackingUrl = buildPublicTrackingUrl(companySettings?.publicAppUrl, trackingToken);
  const trackingLinkActive = Boolean(
    trackingToken && isSafeTrackingTokenFormat(trackingToken) && order?.trackingEnabled !== false
  );
  const courierVisibleToCustomer = Boolean(
    order?.showCourierTrackingToCustomer ?? companySettings?.defaultShowCourierTracking ?? false
  );

  const handleCopyTrackingUrl = async () => {
    if (!publicTrackingUrl) {
      toast.error('Configure a valid https:// Public Tracking Base URL in Company Settings.');
      return;
    }
    try {
      await navigator.clipboard.writeText(publicTrackingUrl);
      setCopiedTrackingLink(true);
      toast.success('Customer tracking link copied.');
      window.setTimeout(() => setCopiedTrackingLink(false), 1800);
    } catch {
      toast.error('Unable to copy link automatically.');
    }
  };

  const handleResyncTracking = async () => {
    if (!order || !canManageTracking || trackingBusy) return;
    setTrackingBusy(true);
    try {
      const res = await syncPublicTracking(order.id, {
        companySettings,
        actor: actorFromUser(user),
        logAudit: true,
      });
      if (res.ok) {
        setLastTrackingSyncWarning('');
        toast.success(`Resynced customer tracking portal for ${order.preOrderNumber}.`);
        await loadDetail();
      } else {
        setLastTrackingSyncWarning(res.error || 'Sync failed.');
        toast.error(res.error || 'Failed to resync tracking snapshot.');
      }
    } finally {
      setTrackingBusy(false);
    }
  };

  const handleToggleCourierVisibility = async () => {
    if (!order || !canManageTracking || trackingBusy) return;
    setTrackingBusy(true);
    try {
      const nextVal = !courierVisibleToCustomer;
      const res = await updatePreOrderCourierVisibility(
        order.id,
        nextVal,
        actorFromUser(user),
        companySettings
      );
      if (res.ok) {
        setLastTrackingSyncWarning('');
        toast.success(
          nextVal
            ? 'Courier tracking is now visible on customer tracking portal.'
            : 'Courier tracking hidden from customer tracking portal.'
        );
      } else {
        setLastTrackingSyncWarning(res.error || '');
        toast.warning(res.error || 'Flag saved, but tracking sync returned a warning.');
      }
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update courier visibility.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const handleConfirmRegenToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !isAdminUser || trackingBusy) return;
    setTrackingBusy(true);
    try {
      await regeneratePublicTrackingToken(
        order.id,
        actorFromUser(user),
        regenReason.trim(),
        companySettings
      );
      setLastTrackingSyncWarning('');
      toast.success('Generated new tracking link. Old link has been invalidated.');
      setShowRegenConfirm(false);
      setRegenReason('');
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to regenerate tracking link.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const handleConfirmToggleTracking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !isAdminUser || trackingBusy) return;
    setTrackingBusy(true);
    try {
      await togglePublicTrackingEnabled(order.id, toggleTargetEnable, actorFromUser(user), {
        reason: toggleReason.trim(),
        companySettings,
      });
      setLastTrackingSyncWarning('');
      toast.success(
        toggleTargetEnable
          ? 'Customer tracking link enabled & synced.'
          : 'Customer tracking link disabled & public data cleared.'
      );
      setShowToggleConfirm(false);
      setToggleReason('');
      await loadDetail();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update tracking link state.');
    } finally {
      setTrackingBusy(false);
    }
  };

  const linkedSupplierObj = useMemo(
    () => (order?.supplierId ? suppliers.find((s) => s.id === order.supplierId) || null : null),
    [order?.supplierId, suppliers]
  );

  const perOrderSupplierSummary = useMemo(() => {
    if (!order || !canViewSupplier) return null;
    return calculatePerOrderSupplierSummary({
      qty: totalOrderedQty,
      items: orderItems.map((it) => ({
        qty: it.qty,
        chinaUnitCost:
          itemCostMap[it.itemId]?.chinaUnitCost ?? privateCost?.chinaUnitCost ?? 0,
      })),
      chinaUnitCost: privateCost?.chinaUnitCost || 0,
      preOrderId: order.id,
      supplierPayments: orderSupplierPayments,
    });
  }, [
    order,
    totalOrderedQty,
    orderItems,
    itemCostMap,
    canViewSupplier,
    privateCost?.chinaUnitCost,
    orderSupplierPayments,
  ]);

  const reversedSupPayIds = useMemo(() => {
    const set = new Set<string>();
    orderSupplierPayments.forEach((p) => {
      if (p.type === 'reversal' && p.reversesPaymentId) {
        set.add(p.reversesPaymentId);
      }
    });
    return set;
  }, [orderSupplierPayments]);

  const tabs: Array<{ id: DetailTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <Package className="w-3.5 h-3.5" /> },
    {
      id: 'payments',
      label: `Payments (${payments.length})`,
      icon: <CreditCard className="w-3.5 h-3.5" />,
    },
    {
      id: 'shipment',
      label: 'Shipment',
      icon: <Truck className="w-3.5 h-3.5" />,
    },
    ...(canViewSupplier
      ? [
          {
            id: 'supplier' as DetailTab,
            label: 'Supplier',
            icon: <Building2 className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    {
      id: 'timeline',
      label: `Timeline (${statusHistory.length + payments.length})`,
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

  const forwardStageIdx = order ? PRE_ORDER_FORWARD_FLOW.indexOf(order.status) : -1;
  const stagePercent =
    order && forwardStageIdx >= 0
      ? Math.round(((forwardStageIdx + 1) / PRE_ORDER_FORWARD_FLOW.length) * 100)
      : 0;

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
              <SubBrandBadge subBrand={order.subBrand} subBrands={subBrands} />
              <PreOrderStatusBadge status={order.status} size="xs" />
              {isPreOrderPartiallyReceived(order) && <PartiallyReceivedTag />}
              {needsRefundRequired && (
                <Badge variant="danger" size="xs">
                  Refund required
                </Badge>
              )}
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
            <div className="flex flex-wrap items-center justify-between w-full gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {order && isStatusLocked ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <Lock className="w-3.5 h-3.5" />
                    Editing locked in "{order.status}" status
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canShowReceiveStock && (
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<PackageCheck className="w-3.5 h-3.5 text-[#D4AF37]" />}
                    onClick={() => setShowReceiveModal(true)}
                  >
                    Receive Stock
                  </Button>
                )}
                {canShowConvertSale && (
                  <Button
                    type="button"
                    variant="primary"
                    leftIcon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                    onClick={() => setShowConvertModal(true)}
                  >
                    Convert to Sale &amp; Invoice
                  </Button>
                )}
                {canShowCancelReconcile && (
                  <Button
                    type="button"
                    variant="danger"
                    leftIcon={<Ban className="w-3.5 h-3.5" />}
                    onClick={() => setShowCancelModal(true)}
                  >
                    Cancel &amp; Reconcile
                  </Button>
                )}
                {order && canUpdateStatus && order.status !== 'Delivered' && order.status !== 'Refunded' && (
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                    onClick={() => setShowStatusDialog(true)}
                  >
                    Update Status
                  </Button>
                )}
                {order && (
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<MessageCircle className="w-3.5 h-3.5 text-emerald-600" />}
                    onClick={() => setShowCustomerMsgModal(true)}
                  >
                    Send Update
                  </Button>
                )}
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
            {/* Stage Progress Bar on Detail Header */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {forwardStageIdx >= 0
                    ? `Workflow Stage ${forwardStageIdx + 1} of ${PRE_ORDER_FORWARD_FLOW.length}: ${order.status}`
                    : `Order Status: ${order.status}`}
                </span>
                <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                  {forwardStageIdx >= 0 ? `${stagePercent}%` : order.status}
                </span>
              </div>
              {forwardStageIdx >= 0 ? (
                <div className="grid grid-cols-11 gap-1 pt-0.5">
                  {PRE_ORDER_FORWARD_FLOW.map((stageName, idx) => {
                    const done = idx <= forwardStageIdx;
                    return (
                      <div key={stageName} title={stageName} className="space-y-1">
                        <div
                          className={`h-2 rounded-full transition-colors ${
                            idx === forwardStageIdx
                              ? 'bg-[#D4AF37]'
                              : done
                              ? 'bg-emerald-500'
                              : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">
                  {needsRefundRequired
                    ? `Cancelled with ${formatBDT(liveFinancials?.verifiedNetPaid || 0)} net paid — Refund required before marking Refunded.`
                    : order.cancellationReason
                    ? `Reason: ${order.cancellationReason}`
                    : null}
                </div>
              )}
            </div>

            {/* Converted Sale & Invoice Callout OR Stock Receipt Summary */}
            {(isConverted || (order.stockReceivedQty || 0) > 0 || (order.damagedQty || 0) > 0 || order.cancellation) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {isConverted && (
                  <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/25 space-y-2 text-xs sm:col-span-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-emerald-900 dark:text-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          Converted to Sales Order &amp; Invoice{' '}
                          <span className="font-mono">{order.convertedInvoiceNumber || order.convertedSaleId}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {onNavigate && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => {
                                onClose();
                                onNavigate('orders', undefined, order.convertedSaleId || order.convertedOrderId || null);
                              }}
                            >
                              Open Order
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => {
                                onClose();
                                onNavigate('invoices');
                              }}
                            >
                              Open Invoices
                            </Button>
                            {order.dueAmount > 0 && (
                              <Button
                                type="button"
                                variant="primary"
                                size="xs"
                                onClick={() => {
                                  onClose();
                                  onNavigate('receivables');
                                }}
                              >
                                Collect Due ({formatBDT(order.dueAmount)})
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {((order.stockReceivedQty || 0) > 0 || (order.damagedQty || 0) > 0) && (
                  <div className="p-3 rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Boxes className="w-3.5 h-3.5 text-[#D4AF37]" />
                        Warehouse Stock Intake
                      </div>
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 font-mono">
                        Good: {order.stockReceivedQty || 0}/{totalOrderedQty} pcs
                        {(order.damagedQty || 0) > 0 ? ` • Damaged: ${order.damagedQty}` : ''}
                        {receipts.length > 0 ? ` (${receipts.length} receipt${receipts.length > 1 ? 's' : ''})` : ''}
                      </div>
                    </div>
                    <Badge variant={isConverted ? 'success' : 'gold'} size="xs">
                      {isConverted ? 'Delivered to Sale' : 'Reserved'}
                    </Badge>
                  </div>
                )}

                {poPostings.length > 0 && isAdminUser && (
                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-xs flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100">
                        Accounting Postings
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {poPostings.length} immutable journal entries posted
                      </div>
                    </div>
                    <Badge variant="neutral" size="xs">
                      Idempotent
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Customer Public Tracking Portal Strip */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-[#D4AF37]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Customer Tracking Portal
                  </span>
                  <Badge
                    variant={
                      !trackingToken || !isSafeTrackingTokenFormat(trackingToken)
                        ? 'danger'
                        : trackingLinkActive
                        ? 'success'
                        : 'neutral'
                    }
                    size="xs"
                  >
                    {!trackingToken || !isSafeTrackingTokenFormat(trackingToken)
                      ? 'Missing'
                      : trackingLinkActive
                      ? 'Active'
                      : 'Disabled'}
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={!baseUrlConfigured || !trackingLinkActive}
                    leftIcon={
                      copiedTrackingLink ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )
                    }
                    onClick={handleCopyTrackingUrl}
                  >
                    {copiedTrackingLink ? 'Copied' : 'Copy Link'}
                  </Button>

                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    disabled={!trackingToken}
                    leftIcon={<QrCode className="w-3 h-3 text-[#D4AF37]" />}
                    onClick={() => setShowShareTrackingModal(true)}
                  >
                    Share / QR
                  </Button>

                  {publicTrackingUrl && trackingLinkActive && (
                    <a
                      href={publicTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#D4AF37]/60"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Preview
                    </a>
                  )}

                  {canManageTracking && trackingToken && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      isLoading={trackingBusy}
                      leftIcon={<RotateCw className="w-3 h-3" />}
                      onClick={handleResyncTracking}
                      title="Resync publicTracking document"
                    >
                      Resync
                    </Button>
                  )}
                </div>
              </div>

              {!baseUrlConfigured && (
                <div className="text-[11px] text-rose-600 dark:text-rose-400">
                  Public base URL is not configured in Company Settings — Copy &amp; Preview are disabled until set.
                </div>
              )}

              {lastTrackingSyncWarning && (
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
                  <span>{lastTrackingSyncWarning}</span>
                  {canManageTracking && (
                    <Button type="button" variant="secondary" size="xs" onClick={handleResyncTracking}>
                      Retry Sync
                    </Button>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <div className="flex items-center gap-2">
                  {canManageTracking ? (
                    <button
                      type="button"
                      disabled={trackingBusy}
                      onClick={handleToggleCourierVisibility}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold border cursor-pointer disabled:opacity-50 ${
                        courierVisibleToCustomer
                          ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                      }`}
                    >
                      {courierVisibleToCustomer ? (
                        <>
                          <Eye className="w-3 h-3" />
                          Courier Shown to Customer
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-3 h-3" />
                          Courier Hidden from Customer
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-400">
                      {courierVisibleToCustomer ? 'Courier shown to customer' : 'Courier hidden from customer'}
                    </span>
                  )}
                </div>

                {isAdminUser && trackingToken && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={trackingBusy}
                      onClick={() => {
                        setToggleTargetEnable(!trackingLinkActive);
                        setToggleReason('');
                        setShowToggleConfirm(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold cursor-pointer"
                    >
                      <Power className="w-3 h-3" />
                      {trackingLinkActive ? 'Disable Link' : 'Enable Link'}
                    </button>
                    <button
                      type="button"
                      disabled={trackingBusy}
                      onClick={() => {
                        setRegenReason('');
                        setShowRegenConfirm(true);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-semibold cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Regenerate
                    </button>
                  </div>
                )}
              </div>

              {order.trackingHistory && order.trackingHistory.length > 0 && (
                <div className="text-[11px] text-slate-400 pt-1">
                  Latest link event:{' '}
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {order.trackingHistory[order.trackingHistory.length - 1].action}
                  </span>{' '}
                  by {order.trackingHistory[order.trackingHistory.length - 1].actorName} on{' '}
                  {formatDateTime(order.trackingHistory[order.trackingHistory.length - 1].timestamp)}
                </div>
              )}
            </div>

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

                {/* Multi-Item Order Lines */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5" />
                      Order Items ({isEditing ? editItems.length : orderItems.length} ·{' '}
                      {isEditing
                        ? editItems.reduce((s, i) => s + (Math.round(Number(i.qty) || 0)), 0)
                        : totalOrderedQty}{' '}
                      pcs)
                    </h4>
                    {isEditing && !financialFieldsLocked && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                        onClick={handleAddEditItem}
                      >
                        Add Item
                      </Button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      {editItems.map((it, idx) => {
                        const itemHasReceipts = it.receivedQty + it.damagedQty > 0;
                        const minAllowedQty = Math.max(1, it.receivedQty + it.damagedQty);
                        return (
                          <div
                            key={it.itemId}
                            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                                <span>Item #{idx + 1}</span>
                                {it.linkedProductId && (
                                  <Badge variant="info" size="xs">
                                    Linked
                                  </Badge>
                                )}
                                {itemHasReceipts && (
                                  <Badge variant="gold" size="xs">
                                    Received: {it.receivedQty}/{it.qty}
                                  </Badge>
                                )}
                              </div>
                              {!financialFieldsLocked && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    leftIcon={<Copy className="w-3 h-3" />}
                                    onClick={() => handleDuplicateEditItem(it)}
                                  >
                                    Duplicate
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    disabled={editItems.length <= 1 || itemHasReceipts}
                                    onClick={() => handleRemoveEditItem(it)}
                                    leftIcon={<Trash2 className="w-3 h-3 text-rose-500" />}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <FormField label="Product Name" required className="sm:col-span-2">
                                <Input
                                  value={it.productName}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, { productName: e.target.value })
                                  }
                                />
                              </FormField>
                              <FormField label="Category">
                                <Select
                                  options={categoryOptions}
                                  value={it.category}
                                  onChange={(val) =>
                                    updateEditItem(it.itemId, { category: String(val) })
                                  }
                                  searchable
                                  isClearable
                                />
                              </FormField>
                              <FormField label="SKU">
                                <Input
                                  value={it.sku}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, { sku: e.target.value })
                                  }
                                  className="font-mono"
                                />
                              </FormField>
                              <FormField label="Model">
                                <Input
                                  value={it.model}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, { model: e.target.value })
                                  }
                                />
                              </FormField>
                              <FormField label="Variant">
                                <Input
                                  value={it.variant}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, { variant: e.target.value })
                                  }
                                />
                              </FormField>
                              <FormField label="Color">
                                <Input
                                  value={it.color}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, { color: e.target.value })
                                  }
                                />
                              </FormField>
                              <FormField label="Quantity" required>
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={financialFieldsLocked || it.qty <= minAllowedQty}
                                    onClick={() =>
                                      updateEditItem(it.itemId, {
                                        qty: Math.max(minAllowedQty, it.qty - 1),
                                      })
                                    }
                                    className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center cursor-pointer disabled:opacity-40"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <Input
                                    type="number"
                                    min={minAllowedQty}
                                    disabled={financialFieldsLocked}
                                    value={it.qty}
                                    onChange={(e) =>
                                      updateEditItem(it.itemId, {
                                        qty: Math.max(
                                          minAllowedQty,
                                          Math.round(Number(e.target.value) || minAllowedQty)
                                        ),
                                      })
                                    }
                                    className="w-20 text-center font-mono font-bold"
                                  />
                                  <button
                                    type="button"
                                    disabled={financialFieldsLocked}
                                    onClick={() =>
                                      updateEditItem(it.itemId, { qty: it.qty + 1 })
                                    }
                                    className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center cursor-pointer disabled:opacity-40"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </FormField>

                              <FormField label="Selling Price / Unit (৳)" required>
                                <CurrencyInput
                                  min={0}
                                  disabled={financialFieldsLocked}
                                  value={it.sellingUnitPrice}
                                  onChange={(e) =>
                                    updateEditItem(it.itemId, {
                                      sellingUnitPrice: e.target.value,
                                    })
                                  }
                                />
                              </FormField>

                              {canViewProfit && (
                                <FormField label="China Cost / Unit (৳)">
                                  <CurrencyInput
                                    min={0}
                                    value={it.chinaUnitCost}
                                    onChange={(e) =>
                                      updateEditItem(it.itemId, {
                                        chinaUnitCost: e.target.value,
                                      })
                                    }
                                  />
                                </FormField>
                              )}

                              <FormField label="Item Photo" className="sm:col-span-2">
                                <div className="flex items-center gap-3">
                                  {it.imageUrl ? (
                                    <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                                      <img
                                        src={it.imageUrl}
                                        alt={it.productName}
                                        className="w-full h-full object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateEditItem(it.itemId, {
                                            imageFile: null,
                                            imageUrl: '',
                                          })
                                        }
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
                                        onChange={(e) =>
                                          handleEditItemImageSelect(it.itemId, e)
                                        }
                                      />
                                    </label>
                                  )}
                                  <span className="ml-auto font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
                                    Line Total:{' '}
                                    {formatBDT(it.qty * Number(it.sellingUnitPrice || 0))}
                                  </span>
                                </div>
                              </FormField>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {orderItems.map((it) => {
                        const chinaUnit = itemCostMap[it.itemId]?.chinaUnitCost ?? 0;
                        const rec =
                          Number(
                            it.receivedQty ??
                              (orderItems.length === 1 ? order.stockReceivedQty : 0)
                          ) || 0;
                        return (
                          <div
                            key={it.itemId}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row gap-3 text-xs"
                          >
                            {it.imageUrl ? (
                              <img
                                src={it.imageUrl}
                                alt={it.productName}
                                className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center shrink-0">
                                <Package className="w-5 h-5" />
                              </div>
                            )}

                            <div className="flex-1 min-w-0 space-y-1.5">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="font-bold text-slate-900 dark:text-slate-100">
                                  {it.productName}
                                  {it.linkedProductId && (
                                    <Badge variant="info" size="xs" className="ml-2">
                                      Linked
                                    </Badge>
                                  )}
                                </div>
                                <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {formatBDT(it.lineTotal ?? it.qty * it.sellingUnitPrice)}
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                                <div>
                                  <span className="text-slate-400">Qty:</span>{' '}
                                  <span className="font-mono font-bold">{it.qty}</span> ×{' '}
                                  <span className="font-mono">
                                    {formatBDT(it.sellingUnitPrice)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Received:</span>{' '}
                                  <span className="font-mono font-semibold">
                                    {rec}/{it.qty}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-400">SKU:</span>{' '}
                                  <span className="font-mono">{it.sku || '—'}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">Category:</span>{' '}
                                  {it.category || '—'}
                                </div>
                              </div>

                              {(it.model || it.variant || it.color || canViewProfit) && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                                  {(it.model || it.variant || it.color) && (
                                    <span>
                                      Spec:{' '}
                                      {[it.model, it.variant, it.color]
                                        .filter(Boolean)
                                        .join(' / ')}
                                    </span>
                                  )}
                                  {canViewProfit && (
                                    <span className="font-mono text-amber-700 dark:text-amber-300">
                                      China Cost: {formatBDT(chinaUnit)}/u (
                                      {formatBDT(chinaUnit * it.qty)})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
                        <FormField label="Shipping Cost (Total ৳)">
                          <CurrencyInput
                            min={0}
                            value={editShippingCost}
                            onChange={(e) => setEditShippingCost(e.target.value)}
                          />
                        </FormField>
                      )}
                    </div>
                  )}

                  {liveFinancials && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                      <div>
                        <div className="text-slate-400">Items / Total Qty</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {(isEditing ? editItems.length : orderItems.length)} lines •{' '}
                          {liveFinancials.qty} pcs
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
                        <div className="text-slate-400">China Cost Total</div>
                        <div className="font-mono font-semibold mt-0.5">
                          {formatBDT(
                            isEditing
                              ? editItems.reduce(
                                  (s, it) =>
                                    s +
                                    Math.max(1, Math.round(Number(it.qty) || 1)) *
                                      Math.max(0, Number(it.chinaUnitCost || 0)),
                                  0
                                )
                              : orderItems.reduce(
                                  (s, it) =>
                                    s +
                                    it.qty *
                                      (itemCostMap[it.itemId]?.chinaUnitCost ??
                                        privateCost?.chinaUnitCost ??
                                        0),
                                  0
                                )
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
                      <FormField label="Selling Sub-Brand">
                        <Select
                          options={[
                            ...(isLegacySatCode(editSubBrand)
                              ? [
                                  {
                                    value: 'SAT',
                                    label: 'Legacy (SAT) — Reassign to Selling Brand',
                                    disabled: true,
                                  },
                                ]
                              : []),
                            ...allowedSubBrands.map((b) => {
                              const meta = activeSellingSubBrands.find((sb) => sb.shortCode === b);
                              return {
                                value: b,
                                label: meta ? `${meta.shortCode} — ${meta.name}` : b,
                              };
                            }),
                          ]}
                          value={editSubBrand}
                          onChange={(val) => setEditSubBrand(String(val))}
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

            {/* TAB 2: PAYMENTS (APPEND-ONLY LEDGER + VERIFY + REVERSE + REFUND + RECEIPT PDF) */}
            {activeTab === 'payments' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs tabular-nums">
                    <div>
                      <div className="text-slate-400">Verified Advance Paid</div>
                      <div className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                        {formatBDT(order.advancePaid)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Pending Verification</div>
                      <div className="font-mono font-semibold text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                        {formatBDT(order.pendingAmount || 0)}
                      </div>
                      <div className="text-[10px] text-slate-400">Excluded until verified</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Refunded</div>
                      <div className="font-mono font-semibold text-sm text-rose-600 dark:text-rose-400 mt-0.5">
                        {formatBDT(order.refundedAmount || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">Remaining Due</div>
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                        {formatBDT(order.dueAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                    {isConverted ? (
                      <div className="w-full p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Converted to Sales Invoice <strong>{order.convertedInvoiceNumber || order.convertedSaleId}</strong>. Collect remaining customer due via <strong>Invoices / Due Payments</strong>.
                        </span>
                        {onNavigate && order.dueAmount > 0 && (
                          <Button
                            type="button"
                            variant="primary"
                            size="xs"
                            onClick={() => {
                              onClose();
                              onNavigate('receivables');
                            }}
                          >
                            Go to Due Payments
                          </Button>
                        )}
                      </div>
                    ) : (
                      canCollectPayment &&
                      order.dueAmount > 0 &&
                      !['Delivered', 'Cancelled', 'Refunded'].includes(order.status) && (
                        <Button
                          type="button"
                          variant="primary"
                          size="xs"
                          leftIcon={<Banknote className="w-3.5 h-3.5" />}
                          onClick={() => setShowCollectModal(true)}
                        >
                          Collect Payment
                        </Button>
                      )
                    )}
                    {canRefund && !isConverted && (liveFinancials?.verifiedNetPaid || 0) > 0 && (
                      <Button
                        type="button"
                        variant="danger"
                        size="xs"
                        leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                        onClick={() => setShowRefundModal(true)}
                      >
                        Issue Refund
                      </Button>
                    )}
                    {isAdminUser && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        isLoading={recalculating}
                        leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                        onClick={handleRecalculateLedger}
                        className="ml-auto"
                      >
                        Recalculate from Ledger
                      </Button>
                    )}
                  </div>
                </div>

                {payments.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No payments recorded on this Pre-Order yet.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {payments.map((p) => {
                      const isReversed = reversedPaymentIds.has(p.id);
                      const isSelfRecorded = p.recordedBy === user.id;
                      const canVerifyOther =
                        canVerifyPayment && p.status === 'pending' && !isSelfRecorded;
                      const canSelfVerifySuper =
                        canVerifyPayment && p.status === 'pending' && isSelfRecorded && isSuperAdmin;
                      const canMarkDuplicate =
                        isAdminUser && p.status === 'pending' && (!isSelfRecorded || isSuperAdmin);
                      const canReverseThis =
                        isAdminUser &&
                        p.status === 'verified' &&
                        p.type !== 'reversal' &&
                        !isReversed;

                      return (
                        <div
                          key={p.id}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-mono font-bold text-sm ${
                                  p.type === 'refund' || p.type === 'reversal'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {p.type === 'refund' || p.type === 'reversal' ? '-' : '+'}
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
                                {p.status === 'pending' ? 'Pending verification' : p.status}
                              </Badge>
                              {p.selfVerified && (
                                <Badge variant="gold" size="xs" title={p.verifyNote || 'Self-verified by Super Admin'}>
                                  Self-verified
                                </Badge>
                              )}
                              {isReversed && (
                                <Badge variant="neutral" size="xs">
                                  Reversed
                                </Badge>
                              )}
                              <Badge variant="neutral" size="xs">
                                {p.type} • {p.method}
                              </Badge>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>Received: {formatDateTime(p.receivedAt || p.createdAt)}</span>
                              {p.referenceNo && (
                                <span className="font-mono">Txn: {p.referenceNo}</span>
                              )}
                              <span>By: {p.recordedByName || p.recordedBy}</span>
                              {p.verifiedByName && <span>Verified by: {p.verifiedByName}</span>}
                            </div>
                            {p.note && (
                              <div className="text-xs text-slate-600 dark:text-slate-300">
                                {p.note}
                              </div>
                            )}
                            {p.verifyNote && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                Verification note: {p.verifyNote}
                              </div>
                            )}
                            {p.rejectionReason && (
                              <div className="text-xs text-rose-600 dark:text-rose-400">
                                Rejection reason: {p.rejectionReason}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            {p.status === 'pending' && canVerifyPayment && isSelfRecorded && !isSuperAdmin && (
                              <span
                                title="Staff and Admin cannot verify their own entry — another verifier must review it"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                Own entry
                              </span>
                            )}
                            {canSelfVerifySuper && (
                              <>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() =>
                                    setSelfVerifyTarget({ payment: p, decision: 'verified' })
                                  }
                                  leftIcon={<ShieldCheck className="w-3 h-3" />}
                                >
                                  Verify (Self)
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() =>
                                    setSelfVerifyTarget({ payment: p, decision: 'rejected' })
                                  }
                                  leftIcon={<XCircle className="w-3 h-3" />}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {canVerifyOther && (
                              <>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="xs"
                                  isLoading={verifyingId === p.id}
                                  disabled={Boolean(verifyingId)}
                                  onClick={() => handleVerifyPayment(p)}
                                  leftIcon={<CheckCircle2 className="w-3 h-3" />}
                                >
                                  Verify
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="xs"
                                  disabled={Boolean(verifyingId)}
                                  onClick={() => setRejectTarget(p)}
                                  leftIcon={<XCircle className="w-3 h-3" />}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {canMarkDuplicate && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                disabled={Boolean(verifyingId) || markingDuplicate}
                                onClick={() => setDuplicateTarget(p)}
                                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                              >
                                Mark duplicate
                              </Button>
                            )}
                            {canReverseThis && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => setReverseTarget(p)}
                                leftIcon={<RotateCcw className="w-3 h-3" />}
                              >
                                Reverse
                              </Button>
                            )}
                            {p.receiptUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                onClick={() => setReceiptModalUrl(p.receiptUrl || null)}
                                leftIcon={<Receipt className="w-3 h-3 text-[#D4AF37]" />}
                              >
                                Attachment
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="secondary"
                              size="xs"
                              onClick={() => setPrintableReceiptPayment(p)}
                              leftIcon={<Printer className="w-3 h-3" />}
                            >
                              Receipt PDF
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: MERGED TIMELINE (STATUS HISTORY + PAYMENTS) */}
            {activeTab === 'timeline' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1.5">
                    {(['all', 'status', 'payments'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setTimelineFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                          timelineFilter === f
                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                        }`}
                      >
                        {f === 'all' ? 'All Events' : f === 'status' ? 'Status Only' : 'Payments Only'}
                      </button>
                    ))}
                  </div>
                  {canUpdateStatus && order.status !== 'Delivered' && order.status !== 'Refunded' && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
                      onClick={() => setShowStatusDialog(true)}
                    >
                      Update Status
                    </Button>
                  )}
                </div>

                {mergedTimeline.length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                    No timeline events recorded yet.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
                    {mergedTimeline.map((entry) => {
                      if (entry.kind === 'status') {
                        const item = entry.data;
                        return (
                          <div key={`st_${item.id}`} className="relative">
                            <span className="absolute -left-6 top-1.5 w-4 h-4 rounded-full bg-[#D4AF37] text-slate-950 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                              <Clock className="w-2.5 h-2.5" />
                            </span>
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  {item.fromStatus && (
                                    <span className="text-xs text-slate-400">
                                      {item.fromStatus} →
                                    </span>
                                  )}
                                  <PreOrderStatusBadge status={item.toStatus} size="xs" />
                                  {item.isBackwardMove && (
                                    <Badge variant="warning" size="xs">
                                      Backward Move
                                    </Badge>
                                  )}
                                  {item.overrideReason && (
                                    <Badge variant="danger" size="xs">
                                      Admin Override
                                    </Badge>
                                  )}
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
                              {item.publicMessage && (
                                <p className="text-[11px] text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/30 px-2 py-1 rounded">
                                  Customer Message: {item.publicMessage}
                                </p>
                              )}
                              <div className="text-[11px] text-slate-400">
                                By {item.changedByName || item.changedBy}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      const pay = entry.data;
                      return (
                        <div key={`pay_${pay.id}`} className="relative">
                          <span className="absolute -left-6 top-1.5 w-4 h-4 rounded-full bg-emerald-600 text-white border-2 border-white dark:border-slate-900 flex items-center justify-center">
                            <Banknote className="w-2.5 h-2.5" />
                          </span>
                          <div className="p-3 rounded-xl border border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/10 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                                  {pay.type === 'refund' || pay.type === 'reversal' ? '-' : '+'}
                                  {formatBDT(pay.amount)}
                                </span>
                                <Badge variant="neutral" size="xs">
                                  {pay.type} • {pay.method}
                                </Badge>
                                <Badge
                                  variant={
                                    pay.status === 'verified'
                                      ? 'success'
                                      : pay.status === 'rejected'
                                      ? 'danger'
                                      : 'warning'
                                  }
                                  size="xs"
                                >
                                  {pay.status}
                                </Badge>
                              </div>
                              <span className="text-[11px] font-mono text-slate-400">
                                {formatDateTime(pay.receivedAt || pay.createdAt)}
                              </span>
                            </div>
                            {pay.note && (
                              <p className="text-xs text-slate-600 dark:text-slate-300">{pay.note}</p>
                            )}
                            <div className="text-[11px] text-slate-400">
                              Recorded by {pay.recordedByName || pay.recordedBy}
                              {pay.verifiedByName ? ` • Verified by ${pay.verifiedByName}` : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SHIPMENT & CHINA ORDER LOGISTICS */}
            {activeTab === 'shipment' && (
              <PreOrderShipmentTab
                order={order}
                privateCost={privateCost}
                user={user}
                rolePermissions={rolePermissions}
                onRefreshParent={async () => {
                  await loadDetail();
                  onUpdated?.();
                }}
                onOpenStatusDialog={() => setShowStatusDialog(true)}
              />
            )}

            {/* TAB 4: PER-ORDER SUPPLIER & CHINA COST LEDGER (preOrderSupplier ONLY) */}
            {activeTab === 'supplier' && canViewSupplier && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        Linked China / Pre-Order Supplier
                      </h4>
                      <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">
                        {linkedSupplierObj?.name || order.supplierName || 'No supplier assigned yet'}
                      </div>
                      {linkedSupplierObj && (
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="font-mono">{linkedSupplierObj.supplierCode}</span>
                          {linkedSupplierObj.platform && (
                            <Badge variant="info" size="xs">{linkedSupplierObj.platform}</Badge>
                          )}
                          {linkedSupplierObj.phone && <span>Phone: {linkedSupplierObj.phone}</span>}
                          {linkedSupplierObj.wechatId && <span>WeChat: {linkedSupplierObj.wechatId}</span>}
                          {linkedSupplierObj.shopUrl && (
                            <a
                              href={
                                linkedSupplierObj.shopUrl.startsWith('http')
                                  ? linkedSupplierObj.shopUrl
                                  : `https://${linkedSupplierObj.shopUrl}`
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#93741E] dark:text-[#E2C255] font-semibold hover:underline"
                            >
                              Store <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    {linkedSupplierObj ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="xs"
                        leftIcon={<Banknote className="w-3.5 h-3.5" />}
                        onClick={() => setShowSupplierPayModal(true)}
                      >
                        Record Supplier Payment
                      </Button>
                    ) : (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">
                        Assign a supplier via Edit Pre-Order to record supplier payments.
                      </span>
                    )}
                  </div>

                  {perOrderSupplierSummary && (
                    <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200/70 dark:border-slate-800 text-xs tabular-nums">
                      <div>
                        <div className="text-slate-400">China Cost Total (Qty {totalOrderedQty})</div>
                        <div className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                          {formatBDT(perOrderSupplierSummary.chinaCostTotal)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Paid to Supplier</div>
                        <div className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                          {formatBDT(perOrderSupplierSummary.paidToSupplier)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400">Supplier Due</div>
                        <div
                          className={`font-mono font-bold text-sm mt-0.5 ${
                            perOrderSupplierSummary.supplierDue > 0
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {formatBDT(perOrderSupplierSummary.supplierDue)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Supplier Payments Ledger for this Pre-Order */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Supplier Disbursement Entries ({orderSupplierPayments.length})
                  </h4>
                  {orderSupplierPayments.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                      No supplier payments allocated to {order.preOrderNumber} yet.
                    </div>
                  ) : (
                    orderSupplierPayments.map((sp) => {
                      const isReversal = sp.type === 'reversal';
                      const isReversed = reversedSupPayIds.has(sp.id);
                      const thisAlloc = sp.allocations?.find((a) => a.preOrderId === order.id);
                      const effectiveBdt = thisAlloc ? thisAlloc.amountBdt : sp.amountBdt;

                      return (
                        <div
                          key={sp.id}
                          className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-mono font-bold text-sm ${
                                  isReversal
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {isReversal ? '-' : ''}
                                {formatBDT(effectiveBdt)}
                              </span>
                              {thisAlloc && sp.allocations && sp.allocations.length > 1 && (
                                <Badge variant="neutral" size="xs">
                                  Allocated from {formatBDT(sp.amountBdt)} batch
                                </Badge>
                              )}
                              <Badge variant={isReversal ? 'danger' : 'info'} size="xs">
                                {isReversal ? 'Reversal' : sp.method}
                              </Badge>
                              {isReversed && (
                                <Badge variant="warning" size="xs">
                                  Reversed
                                </Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Date: <span className="font-mono">{sp.date}</span>
                              {sp.referenceNo ? ` • Ref: ${sp.referenceNo}` : ''}
                              {' • '}Recorded by {sp.recordedByName}
                            </div>
                            {sp.note && <div className="text-[11px] text-slate-600 dark:text-slate-300">{sp.note}</div>}
                          </div>

                          <div className="flex items-center gap-2">
                            {sp.receiptUrl && (
                              <a
                                href={sp.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold"
                              >
                                <Paperclip className="w-3 h-3" /> Receipt
                              </a>
                            )}
                            {isAdminUser && !isReversal && !isReversed && (
                              <Button
                                type="button"
                                variant="danger"
                                size="xs"
                                leftIcon={<RotateCcw className="w-3 h-3" />}
                                onClick={() => setReverseSupPayTarget(sp)}
                              >
                                Reverse
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: AUDIT (ADMIN / SUPER ADMIN ONLY) */}
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

      {/* Receipt Attachment Image Modal */}
      <Modal
        isOpen={Boolean(receiptModalUrl)}
        onClose={() => setReceiptModalUrl(null)}
        title="Uploaded Payment Attachment"
        size="md"
      >
        {receiptModalUrl && (
          <div className="flex flex-col items-center gap-3">
            <img
              src={receiptModalUrl}
              alt="Payment attachment"
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

      {/* Part 3 Modals */}
      <CollectPaymentModal
        isOpen={showCollectModal}
        onClose={() => setShowCollectModal(false)}
        order={order}
        user={user}
        onSuccess={(payment) => {
          setPrintableReceiptPayment(payment);
          loadDetail();
          onUpdated?.();
        }}
      />

      <RefundPaymentModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        order={order}
        user={user}
        onSuccess={(payment) => {
          setPrintableReceiptPayment(payment);
          loadDetail();
          onUpdated?.();
        }}
      />

      <ReversePaymentModal
        isOpen={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        payment={reverseTarget}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <RejectPaymentModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        payment={rejectTarget}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <SuperAdminSelfVerifyModal
        isOpen={Boolean(selfVerifyTarget)}
        onClose={() => setSelfVerifyTarget(null)}
        payment={selfVerifyTarget?.payment || null}
        initialDecision={selfVerifyTarget?.decision || 'verified'}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(duplicateTarget)}
        onClose={() => !markingDuplicate && setDuplicateTarget(null)}
        onConfirm={handleConfirmMarkDuplicate}
        title="Mark pending payment as duplicate?"
        message={
          duplicateTarget
            ? `Reject ${duplicateTarget.preOrderNumber} (${formatBDT(duplicateTarget.amount)} via ${duplicateTarget.method}${
                duplicateTarget.referenceNo ? `, TrxID ${duplicateTarget.referenceNo}` : ''
              }) with reason "Duplicate entry"? It will stay visible in history, be excluded from totals, and release any lock held by this entry.`
            : ''
        }
        confirmLabel="Mark as Duplicate"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={markingDuplicate}
      />

      <PreOrderStatusDialog
        isOpen={showStatusDialog}
        onClose={() => setShowStatusDialog(false)}
        order={order}
        user={user}
        onOpenCancelReconcile={() => setShowCancelModal(true)}
        onUpdated={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      {/* Part 6 Stock Intake, Sale Conversion & Cancellation Reconciliation Modals */}
      <ReceiveStockModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        order={order}
        privateCost={privateCost}
        user={user}
        categories={categories}
        brands={localBrands}
        products={localProducts}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <ConvertToSaleModal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        order={order}
        privateCost={privateCost}
        user={user}
        companySettings={companySettings}
        subBrands={subBrands}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <CancelReconcileModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        order={order}
        privateCost={privateCost}
        supplierPaidBdt={perOrderSupplierSummary?.paidToSupplier || 0}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <PreOrderPaymentReceiptModal
        isOpen={Boolean(printableReceiptPayment)}
        onClose={() => setPrintableReceiptPayment(null)}
        order={order}
        payment={printableReceiptPayment}
        companySettings={companySettings}
        subBrands={subBrands}
      />

      {/* Part 4 Supplier Payment & Reversal Modals */}
      <RecordSupplierPaymentModal
        isOpen={showSupplierPayModal}
        onClose={() => setShowSupplierPayModal(false)}
        supplier={linkedSupplierObj}
        supplierOrders={order ? [order] : []}
        preSelectedOrderId={order?.id}
        suggestedAmountBdt={perOrderSupplierSummary?.supplierDue || 0}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      <ReverseSupplierPaymentModal
        isOpen={Boolean(reverseSupPayTarget)}
        onClose={() => setReverseSupPayTarget(null)}
        payment={reverseSupPayTarget}
        user={user}
        onSuccess={() => {
          loadDetail();
          onUpdated?.();
        }}
      />

      {/* Part 5 Tracking Share, Regenerate & Disable/Enable Modals */}
      <TrackingLinkShareModal
        isOpen={showShareTrackingModal}
        onClose={() => setShowShareTrackingModal(false)}
        order={order}
        companySettings={companySettings}
      />

      <Modal
        isOpen={showRegenConfirm}
        onClose={() => !trackingBusy && setShowRegenConfirm(false)}
        title="Regenerate Customer Tracking Link"
        subtitle={order ? `${order.preOrderNumber} • Old URL stops working immediately` : ''}
        size="sm"
      >
        <form onSubmit={handleConfirmRegenToken} className="space-y-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Old link will stop working immediately.</strong> Any customer holding the
              previous URL will see an unavailable/expired message.
            </span>
          </div>
          <FormField label="Reason (Optional)">
            <Input
              value={regenReason}
              onChange={(e) => setRegenReason(e.target.value)}
              placeholder="e.g. Shared with wrong number..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={trackingBusy}
              onClick={() => setShowRegenConfirm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger" isLoading={trackingBusy}>
              Regenerate Link
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showToggleConfirm}
        onClose={() => !trackingBusy && setShowToggleConfirm(false)}
        title={toggleTargetEnable ? 'Enable Customer Tracking Link' : 'Disable Customer Tracking Link'}
        subtitle={order?.preOrderNumber}
        size="sm"
      >
        <form onSubmit={handleConfirmToggleTracking} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {toggleTargetEnable
              ? 'This will re-publish the sanitized tracking snapshot and reactivate the customer URL.'
              : 'This immediately removes all order/customer details from publicTracking, leaving only { enabled: false }.'}
          </p>
          <FormField label="Reason (Optional)">
            <Input
              value={toggleReason}
              onChange={(e) => setToggleReason(e.target.value)}
              placeholder="Optional note for audit trail..."
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={trackingBusy}
              onClick={() => setShowToggleConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={toggleTargetEnable ? 'primary' : 'danger'}
              isLoading={trackingBusy}
            >
              {toggleTargetEnable ? 'Enable Link' : 'Disable Link'}
            </Button>
          </div>
        </form>
      </Modal>

      <CustomerMessageModal
        isOpen={showCustomerMsgModal}
        onClose={() => setShowCustomerMsgModal(false)}
        order={order}
        user={user}
        companySettings={companySettings}
        onLogged={loadDetail}
      />
    </>
  );
};

export default PreOrderDetailDrawer;
