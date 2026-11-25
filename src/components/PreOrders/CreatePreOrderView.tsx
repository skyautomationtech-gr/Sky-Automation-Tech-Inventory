import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CreditCard,
  ImagePlus,
  Link2,
  Lock,
  Minus,
  Package,
  Phone,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import {
  Category,
  CompanySettings,
  Customer,
  PreOrderPaymentMethod,
  Product,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  PRE_ORDER_PAYMENT_METHODS,
  formatBDT,
  getTodayIsoDate,
  hasPermission,
  isPreOrderAdminRole,
  isValidBdPhone,
  normalizeBdPhone,
} from '../../preOrders/constants';
import {
  calculatePreOrderFinancials,
  getInitialPreOrderStatus,
  toPaisa,
} from '../../preOrders/calculations';
import { uploadPreOrderImage, validateImageFile } from '../../preOrders/imageUpload';
import { addSupplier, getSuppliers } from '../../firebase/db';
import {
  CreatePreOrderResult,
  actorFromUser,
  createPreOrder,
  lookupCustomerByPhone,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CurrencyInput,
  Drawer,
  FormField,
  Input,
  Select,
  Textarea,
  useToast,
} from '../../design-system';
import { PreOrderStatusBadge, SubBrandBadge } from './PreOrderStatusBadge';

export interface CreatePreOrderViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  products: Product[];
  categories: Category[];
  companySettings?: CompanySettings | null;
  onCancel: () => void;
  onCreated: (result: CreatePreOrderResult) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

function getLocalDateTimeInputValue(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const CreatePreOrderView: React.FC<CreatePreOrderViewProps> = ({
  user,
  rolePermissions,
  products,
  categories,
  companySettings,
  onCancel,
  onCreated,
  onDirtyChange,
}) => {
  const toast = useToast();

  const canCreate = hasPermission(user, rolePermissions, 'preOrderCreate');
  const canViewProfit = hasPermission(user, rolePermissions, 'preOrderViewProfit');
  const canViewChinaCost =
    hasPermission(user, rolePermissions, 'preOrderSupplier') || canViewProfit;
  const isAdminActor = isPreOrderAdminRole(user.role);
  const canAddSupplier =
    hasPermission(user, rolePermissions, 'preOrderSupplier') || canCreate;

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

  // Stable idempotency key per create attempt; only regenerated if user starts a fresh order
  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const lookupSeqRef = useRef<number>(0);

  // Section 1 — Customer
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true);
  const [customerAddress, setCustomerAddress] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [customerLookupDonePhone, setCustomerLookupDonePhone] = useState('');

  // Section 2 — Product
  const [linkedProductId, setLinkedProductId] = useState('');
  const [linkedVariantId, setLinkedVariantId] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [color, setColor] = useState('');
  const [qty, setQty] = useState<number>(1);
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreview, setProductImagePreview] = useState('');
  const [uploadedProductImageUrl, setUploadedProductImageUrl] = useState('');

  // Section 3 — Pricing
  const [chinaUnitCost, setChinaUnitCost] = useState<string>('');
  const [sellingUnitPrice, setSellingUnitPrice] = useState<string>('');
  const [shippingCost, setShippingCost] = useState<string>('');
  const [deliveryCharge, setDeliveryCharge] = useState<string>('0');
  const [discount, setDiscount] = useState<string>('0');

  // Section 4 — Advance Payment
  const [advanceAmount, setAdvanceAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PreOrderPaymentMethod>('bKash');
  const [paymentRefNo, setPaymentRefNo] = useState('');
  const [paymentReceivedAt, setPaymentReceivedAt] = useState<string>(() =>
    getLocalDateTimeInputValue()
  );
  const [autoVerifyAdvance, setAutoVerifyAdvance] = useState<boolean>(() => isPreOrderAdminRole(user.role));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState('');

  // Section 5 — Supplier & Dates
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [supplierOrderRef, setSupplierOrderRef] = useState('');
  const [orderDate, setOrderDate] = useState<string>(() => getTodayIsoDate());
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [subBrand, setSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>(allowedSubBrands[0]);
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Submission & validation state
  const [submitting, setSubmitting] = useState(false);
  const [submitStatusText, setSubmitStatusText] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Quick Add Supplier Drawer
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupCompany, setNewSupCompany] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [savingSupplier, setSavingSupplier] = useState(false);

  // Load suppliers once on mount
  useEffect(() => {
    let active = true;
    setLoadingSuppliers(true);
    getSuppliers()
      .then((list) => {
        if (active) setSuppliers(list.filter((s) => s.status !== 'inactive'));
      })
      .catch((err) => {
        console.warn('Could not load suppliers:', err);
      })
      .finally(() => {
        if (active) setLoadingSuppliers(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Keep subBrand inside allowed sub-brands
  useEffect(() => {
    if (!allowedSubBrands.includes(subBrand)) {
      setSubBrand(allowedSubBrands[0]);
    }
  }, [allowedSubBrands, subBrand]);

  // Keep WhatsApp synced when checkbox checked
  useEffect(() => {
    if (whatsappSameAsPhone) {
      setCustomerWhatsapp(customerPhone);
    }
  }, [whatsappSameAsPhone, customerPhone]);

  // Track dirty state in React memory + browser unload guard
  const isDirty = useMemo(() => {
    return Boolean(
      customerPhone.trim() ||
        customerName.trim() ||
        customerAddress.trim() ||
        productName.trim() ||
        sku.trim() ||
        model.trim() ||
        variant.trim() ||
        color.trim() ||
        linkedVariantId.trim() ||
        Number(sellingUnitPrice) > 0 ||
        Number(advanceAmount) > 0 ||
        productImageFile ||
        productImagePreview ||
        supplierId ||
        notes.trim() ||
        internalNotes.trim()
    );
  }, [
    customerPhone,
    customerName,
    customerAddress,
    productName,
    sku,
    model,
    variant,
    color,
    linkedVariantId,
    sellingUnitPrice,
    advanceAmount,
    productImageFile,
    productImagePreview,
    supplierId,
    notes,
    internalNotes,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty && !submitting);
    return () => onDirtyChange?.(false);
  }, [isDirty, submitting, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !submitting) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, submitting]);

  // Automatic Customer Phone Lookup (debounced on valid BD phone)
  useEffect(() => {
    const norm = normalizeBdPhone(customerPhone);
    if (!isValidBdPhone(norm)) {
      setExistingCustomer(null);
      setCustomerLookupDonePhone('');
      setIsLookingUpCustomer(false);
      return;
    }
    if (norm === customerLookupDonePhone) return;

    const seq = ++lookupSeqRef.current;
    setIsLookingUpCustomer(true);
    const timer = setTimeout(async () => {
      try {
        const found = await lookupCustomerByPhone(norm);
        if (seq !== lookupSeqRef.current) return;
        setCustomerLookupDonePhone(norm);
        if (found) {
          setExistingCustomer(found);
          setCustomerName(found.name || '');
          setCustomerAddress(found.address || '');
          const foundWa = found.whatsapp ? normalizeBdPhone(found.whatsapp) : norm;
          if (foundWa && foundWa !== norm) {
            setWhatsappSameAsPhone(false);
            setCustomerWhatsapp(foundWa);
          } else {
            setWhatsappSameAsPhone(true);
            setCustomerWhatsapp(norm);
          }
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.customerPhone;
            delete next.customerName;
            delete next.customerAddress;
            return next;
          });
        } else {
          setExistingCustomer(null);
        }
      } catch (err) {
        if (seq === lookupSeqRef.current) {
          console.warn('Customer phone lookup failed:', err);
        }
      } finally {
        if (seq === lookupSeqRef.current) {
          setIsLookingUpCustomer(false);
        }
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [customerPhone, customerLookupDonePhone]);

  // Central Financial Calculations (Single Source of Truth)
  const parsedSelling = Number(sellingUnitPrice || 0);
  const parsedChinaCost = canViewChinaCost ? Number(chinaUnitCost || 0) : 0;
  const parsedShipping = canViewChinaCost ? Number(shippingCost || 0) : 0;
  const parsedDelivery = Number(deliveryCharge || 0);
  const parsedDiscount = Number(discount || 0);
  const parsedAdvance = Number(advanceAmount || 0);

  const canAutoVerifyCash = isAdminActor && paymentMethod === 'Cash';
  const shouldVerify = canAutoVerifyCash && autoVerifyAdvance;
  const financials = useMemo(() => {
    return calculatePreOrderFinancials({
      qty,
      sellingUnitPrice: Number.isFinite(parsedSelling) ? Math.max(0, parsedSelling) : 0,
      deliveryCharge: Number.isFinite(parsedDelivery) ? Math.max(0, parsedDelivery) : 0,
      discount: Number.isFinite(parsedDiscount) ? Math.max(0, parsedDiscount) : 0,
      chinaUnitCost: Number.isFinite(parsedChinaCost) ? Math.max(0, parsedChinaCost) : 0,
      shippingCost: Number.isFinite(parsedShipping) ? Math.max(0, parsedShipping) : 0,
      payments:
        parsedAdvance > 0
          ? [
              {
                type: 'advance',
                status: shouldVerify ? 'verified' : 'pending',
                amount: parsedAdvance,
              },
            ]
          : [],
    });
  }, [
    qty,
    parsedSelling,
    parsedDelivery,
    parsedDiscount,
    parsedChinaCost,
    parsedShipping,
    parsedAdvance,
    shouldVerify,
  ]);

  const startStatus = getInitialPreOrderStatus(parsedAdvance);

  const productLinkOptions = useMemo(() => {
    return products
      .filter((p) => !p.archived)
      .map((p) => ({
        value: p.id,
        label: p.name,
        sublabel: [p.sku ? `SKU: ${p.sku}` : '', p.category || '', `Stock: ${p.stock}`]
          .filter(Boolean)
          .join(' • '),
        badge: p.sellingPrice ? formatBDT(p.sellingPrice) : undefined,
      }));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const names = Array.from(
      new Set([
        ...categories.map((c) => c.name).filter(Boolean),
        ...(category && !categories.some((c) => c.name === category) ? [category] : []),
      ])
    );
    return names.map((name) => ({ value: name, label: name }));
  }, [categories, category]);

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: [s.supplierCode, s.companyName, s.phone].filter(Boolean).join(' • '),
    }));
  }, [suppliers]);

  const linkedProductVariants = useMemo(() => {
    if (!linkedProductId) return [];
    const found = products.find((p) => p.id === linkedProductId);
    return found?.variants || [];
  }, [linkedProductId, products]);

  const handleLinkProductChange = (prodId: string) => {
    setLinkedProductId(prodId);
    setLinkedVariantId('');
    if (!prodId) return;
    const found = products.find((p) => p.id === prodId);
    if (!found) return;

    setProductName(found.name);
    if (found.category) setCategory(found.category);
    if (found.sku) setSku(found.sku);
    if (found.variants && found.variants.length > 0) {
      const firstVar = found.variants[0];
      setLinkedVariantId(firstVar.id);
      if (firstVar.color) setColor(firstVar.color);
      if (firstVar.model) setModel(firstVar.model);
      setVariant(`${firstVar.color} / ${firstVar.model}`);
    } else {
      if (found.model) setModel(found.model);
      if (found.color) setColor(found.color);
    }
    if (found.sellingPrice > 0) setSellingUnitPrice(String(found.sellingPrice));
    if (canViewChinaCost && found.purchasePrice > 0 && !chinaUnitCost) {
      setChinaUnitCost(String(found.purchasePrice));
    }
    if (found.imageUrl) {
      setProductImageFile(null);
      setProductImagePreview(found.imageUrl);
      setUploadedProductImageUrl(found.imageUrl);
    }
  };

  const handleVariantSelect = (varId: string) => {
    setLinkedVariantId(varId);
    if (!varId) return;
    const foundProd = products.find((p) => p.id === linkedProductId);
    const varItem = foundProd?.variants?.find((v) => v.id === varId);
    if (varItem) {
      if (varItem.color) setColor(varItem.color);
      if (varItem.model) setModel(varItem.model);
      setVariant(`${varItem.color} / ${varItem.model}`);
    }
  };

  const handleAutoSku = () => {
    const base = (productName || 'ITEM')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(3, 'X');
    const suffix = String(Date.now()).slice(-4);
    setSku(`PO-${subBrand}-${base}-${suffix}`);
  };

  const handleProductImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setProductImageFile(file);
    setUploadedProductImageUrl('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProductImagePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setReceiptFile(file);
    setUploadedReceiptUrl('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateQuickSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) {
      toast.error('Supplier name is required.');
      return;
    }
    if (!newSupPhone.trim()) {
      toast.error('Supplier phone / contact is required.');
      return;
    }
    setSavingSupplier(true);
    try {
      const createdId = await addSupplier({
        name: newSupName.trim(),
        companyName: newSupCompany.trim() || undefined,
        phone: newSupPhone.trim(),
        address: newSupAddress.trim() || undefined,
        supplierType: 'Importer',
        subBrand,
        status: 'active',
        createdBy: user.id,
      });
      if (!createdId) {
        throw new Error('Could not create supplier. Please verify your permissions.');
      }
      const updatedList = await getSuppliers();
      setSuppliers(updatedList.filter((s) => s.status !== 'inactive'));
      setSupplierId(createdId);
      setShowAddSupplier(false);
      setNewSupName('');
      setNewSupPhone('');
      setNewSupCompany('');
      setNewSupAddress('');
      toast.success('Supplier created and selected.');
    } catch (err: any) {
      console.error('Quick supplier creation failed:', err);
      toast.error(err?.message || 'Failed to add supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    const normPhone = normalizeBdPhone(customerPhone);

    if (!isValidBdPhone(normPhone)) {
      errors.customerPhone = 'Enter a valid Bangladesh mobile number (01XXXXXXXXX).';
    }
    if (!customerName.trim()) {
      errors.customerName = 'Customer name is required.';
    }
    if (!customerAddress.trim()) {
      errors.customerAddress = 'Delivery address is required.';
    }
    if (!whatsappSameAsPhone && customerWhatsapp.trim() && !isValidBdPhone(customerWhatsapp)) {
      errors.customerWhatsapp = 'Enter a valid Bangladesh WhatsApp number (01XXXXXXXXX).';
    }
    if (!productName.trim()) {
      errors.productName = 'Product name is required.';
    }
    if (!Number.isFinite(qty) || qty < 1) {
      errors.qty = 'Quantity must be at least 1.';
    }
    if (!sellingUnitPrice || Number(sellingUnitPrice) <= 0) {
      errors.sellingUnitPrice = 'Selling price per unit must be greater than 0.';
    }
    if (canViewChinaCost && Number(chinaUnitCost || 0) < 0) {
      errors.chinaUnitCost = 'China purchase price cannot be negative.';
    }
    if (canViewChinaCost && Number(shippingCost || 0) < 0) {
      errors.shippingCost = 'Shipping cost cannot be negative.';
    }
    if (Number(deliveryCharge || 0) < 0) {
      errors.deliveryCharge = 'Delivery charge cannot be negative.';
    }
    if (Number(discount || 0) < 0) {
      errors.discount = 'Discount cannot be negative.';
    } else if (toPaisa(parsedDiscount) > toPaisa(financials.subtotal)) {
      errors.discount = 'Discount cannot exceed product subtotal.';
    }

    if (Number(advanceAmount || 0) < 0) {
      errors.advanceAmount = 'Advance payment cannot be negative.';
    } else if (toPaisa(parsedAdvance) > toPaisa(financials.totalAmount)) {
      errors.advanceAmount = 'Advance payment cannot exceed total order amount.';
    }

    if (parsedAdvance > 0 && paymentMethod !== 'Cash' && !paymentRefNo.trim()) {
      errors.paymentRefNo = `Transaction ID is required for ${paymentMethod}.`;
    }

    if (estimatedDeliveryDate && orderDate && estimatedDeliveryDate < orderDate) {
      errors.estimatedDeliveryDate = 'Expected arrival date cannot be before order date.';
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstErr = Object.values(errors)[0];
      toast.error(firstErr);
      return false;
    }
    return true;
  };

  const handleSavePreOrder = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canCreate || submitting) return;
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      let finalProductImageUrl = uploadedProductImageUrl || productImagePreview;
      if (productImageFile && !uploadedProductImageUrl) {
        setSubmitStatusText('Compressing & uploading product image...');
        const uploadRes = await uploadPreOrderImage(productImageFile, 'products');
        finalProductImageUrl = uploadRes.url;
        setUploadedProductImageUrl(uploadRes.url);
      }

      let finalReceiptUrl = uploadedReceiptUrl;
      if (parsedAdvance > 0 && receiptFile && !uploadedReceiptUrl) {
        setSubmitStatusText('Uploading payment receipt...');
        const receiptRes = await uploadPreOrderImage(receiptFile, 'receipts');
        finalReceiptUrl = receiptRes.url;
        setUploadedReceiptUrl(receiptRes.url);
      }

      setSubmitStatusText('Saving pre-order transaction...');
      const selectedSupplier = suppliers.find((s) => s.id === supplierId);
      const parsedReceivedTs = paymentReceivedAt
        ? new Date(paymentReceivedAt).getTime()
        : Date.now();

      const result = await createPreOrder(
        {
          subBrand,
          customerId: existingCustomer?.id,
          customerCode: existingCustomer?.customerId,
          customerName: customerName.trim(),
          customerPhone: normalizeBdPhone(customerPhone),
          customerWhatsapp: whatsappSameAsPhone
            ? normalizeBdPhone(customerPhone)
            : normalizeBdPhone(customerWhatsapp),
          customerAddress: customerAddress.trim(),
          productName: productName.trim(),
          category: category.trim(),
          sku: sku.trim(),
          model: model.trim(),
          variant: variant.trim(),
          color: color.trim(),
          productImage: finalProductImageUrl || '',
          linkedProductId: linkedProductId || undefined,
          linkedVariantId: linkedVariantId || undefined,
          qty: Math.round(qty),
          sellingUnitPrice: Number(sellingUnitPrice),
          deliveryCharge: Number(deliveryCharge || 0),
          discount: Number(discount || 0),
          chinaUnitCost: canViewChinaCost ? Number(chinaUnitCost || 0) : 0,
          shippingCost: canViewChinaCost ? Number(shippingCost || 0) : 0,
          orderDate,
          supplierId: selectedSupplier?.id || '',
          supplierName: selectedSupplier?.name || '',
          supplierOrderRef: supplierOrderRef.trim(),
          estimatedDeliveryDate: estimatedDeliveryDate || '',
          notes: notes.trim(),
          internalNotes: canViewProfit ? internalNotes.trim() : '',
          idempotencyKey: idempotencyKeyRef.current,
          companySettings,
          initialAdvance:
            parsedAdvance > 0
              ? {
                  amount: parsedAdvance,
                  method: paymentMethod,
                  referenceNo: paymentRefNo.trim(),
                  receiptUrl: finalReceiptUrl || '',
                  receivedAt: Number.isFinite(parsedReceivedTs) ? parsedReceivedTs : Date.now(),
                  autoVerify: shouldVerify,
                }
              : undefined,
        },
        actorFromUser(user)
      );

      onDirtyChange?.(false);
      toast.success(
        `Pre-Order ${result.preOrderNumber} created (${startStatus}).`
      );
      if (result.trackingSyncWarning) {
        toast.warning(result.trackingSyncWarning);
      }
      onCreated(result);
    } catch (err: any) {
      console.error('Create Pre-Order failed:', err);
      toast.error(err?.message || 'Failed to save Pre-Order. Your form data has been kept.');
    } finally {
      setSubmitting(false);
      setSubmitStatusText('');
    }
  };

  if (!canCreate) {
    return (
      <Card padding="lg" className="max-w-xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-5 h-5" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Permission Required
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Your role does not currently have permission to create Pre-Orders (`preOrderCreate`).
        </p>
        <div className="mt-5">
          <Button variant="secondary" onClick={onCancel}>
            Back to All Pre-Orders
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSavePreOrder} className="max-w-[1440px] mx-auto pb-24 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => (isDirty ? setShowCancelConfirm(true) : onCancel())}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            title="Back to All Pre-Orders"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
              Create Pre-Order
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sequential <span className="font-mono font-semibold">PO-0001</span> numbering assigned atomically on save • No stock deduction on creation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <SubBrandBadge subBrand={subBrand} />
          <PreOrderStatusBadge status={startStatus} />
        </div>
      </div>

      {/* Main 2-Column Laptop Grid (~70% left / ~30% right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (~70%) */}
        <div className="xl:col-span-8 space-y-5">
          {/* SECTION 1 — CUSTOMER */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] flex items-center justify-center">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    1. Customer Information
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter Bangladesh mobile number first to auto-detect existing customers
                  </p>
                </div>
              </div>

              {isLookingUpCustomer ? (
                <Badge variant="info" size="xs" dot pulse>
                  Checking phone...
                </Badge>
              ) : existingCustomer ? (
                <Badge variant="success" size="sm" dot>
                  <UserCheck className="w-3.5 h-3.5" />
                  Existing customer {existingCustomer.customerId || 'CUS'} •{' '}
                  {existingCustomer.totalOrders || 0} past order
                  {(existingCustomer.totalOrders || 0) === 1 ? '' : 's'}
                </Badge>
              ) : isValidBdPhone(customerPhone) && customerLookupDonePhone ? (
                <Badge variant="gold" size="sm">
                  <UserPlus className="w-3.5 h-3.5" />
                  New customer (auto-assigns CUS-xxxx)
                </Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label="Phone Number"
                required
                error={fieldErrors.customerPhone}
                hint="Bangladesh format (e.g. 01712345678). Normalized automatically."
              >
                <Input
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (fieldErrors.customerPhone) {
                      setFieldErrors((p) => ({ ...p, customerPhone: '' }));
                    }
                  }}
                  onBlur={() => {
                    const norm = normalizeBdPhone(customerPhone);
                    if (isValidBdPhone(norm)) setCustomerPhone(norm);
                  }}
                  placeholder="01XXXXXXXXX"
                  leftAddon={<Phone className="w-3.5 h-3.5" />}
                />
              </FormField>

              <FormField
                label="Customer Name"
                required
                error={fieldErrors.customerName}
              >
                <Input
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (fieldErrors.customerName) {
                      setFieldErrors((p) => ({ ...p, customerName: '' }));
                    }
                  }}
                  placeholder="Full customer name"
                />
              </FormField>

              <FormField
                label="WhatsApp Number"
                error={fieldErrors.customerWhatsapp}
              >
                <div className="space-y-1.5">
                  <Input
                    value={whatsappSameAsPhone ? customerPhone : customerWhatsapp}
                    disabled={whatsappSameAsPhone}
                    onChange={(e) => setCustomerWhatsapp(e.target.value)}
                    onBlur={() => {
                      if (!whatsappSameAsPhone && customerWhatsapp.trim()) {
                        const norm = normalizeBdPhone(customerWhatsapp);
                        if (isValidBdPhone(norm)) setCustomerWhatsapp(norm);
                      }
                    }}
                    placeholder="01XXXXXXXXX"
                  />
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={whatsappSameAsPhone}
                      onChange={(e) => setWhatsappSameAsPhone(e.target.checked)}
                      className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    Same as phone number
                  </label>
                </div>
              </FormField>

              <FormField
                label="Delivery Address"
                required
                error={fieldErrors.customerAddress}
              >
                <Textarea
                  rows={2}
                  value={customerAddress}
                  onChange={(e) => {
                    setCustomerAddress(e.target.value);
                    if (fieldErrors.customerAddress) {
                      setFieldErrors((p) => ({ ...p, customerAddress: '' }));
                    }
                  }}
                  placeholder="House, road, area, district..."
                />
              </FormField>
            </div>
          </Card>

          {/* SECTION 2 — PRODUCT */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    2. Product Details
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter custom pre-order item details or link to an existing catalog product
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Optional Link to existing product */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                <FormField
                  label="Link to Existing Product (Optional)"
                  hint={
                    linkedProductId
                      ? 'Linked to existing catalog product — stock is NOT changed now. When received in Part 6, stock will be added to this product instead of creating a duplicate.'
                      : 'Leave blank for brand-new China import items. Can be linked or created as a new product upon stock receipt (Part 6).'
                  }
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <Select
                      options={productLinkOptions}
                      value={linkedProductId}
                      onChange={handleLinkProductChange}
                      placeholder="Search existing catalog product..."
                      searchable
                      isClearable
                    />
                  </div>
                </FormField>
              </div>

              {linkedProductId && linkedProductVariants.length > 0 && (
                <div className="p-3 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/60">
                  <FormField label="Product Variant (Color / Model / Size)">
                    <Select
                      options={linkedProductVariants.map((v) => ({
                        value: v.id,
                        label: `${v.color || 'Standard'} / ${v.model || 'Standard'}`,
                        sublabel: `Stock: ${v.stock} pcs`,
                      }))}
                      value={linkedVariantId}
                      onChange={(val) => handleVariantSelect(String(val))}
                      placeholder="Select variant..."
                    />
                  </FormField>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Product Name"
                  required
                  error={fieldErrors.productName}
                  className="md:col-span-2"
                >
                  <Input
                    value={productName}
                    onChange={(e) => {
                      setProductName(e.target.value);
                      if (fieldErrors.productName) {
                        setFieldErrors((p) => ({ ...p, productName: '' }));
                      }
                    }}
                    placeholder="e.g. Zigbee Smart Curtain Motor Tuya WiFi"
                  />
                </FormField>

                <FormField label="Category">
                  <Select
                    options={categoryOptions}
                    value={category}
                    onChange={(val) => setCategory(String(val))}
                    placeholder="Select category..."
                    searchable
                    isClearable
                  />
                </FormField>

                <FormField label="SKU (Optional)">
                  <div className="flex items-center gap-2">
                    <Input
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="Auto or custom SKU"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={handleAutoSku}
                      leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                      className="shrink-0"
                    >
                      Auto
                    </Button>
                  </div>
                </FormField>

                <FormField label="Model">
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="e.g. ZM85EL-2.0"
                  />
                </FormField>

                <FormField label="Variant">
                  <Input
                    value={variant}
                    onChange={(e) => setVariant(e.target.value)}
                    placeholder="e.g. 3 Meter / EU Plug"
                  />
                </FormField>

                <FormField label="Color">
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Matte Black"
                  />
                </FormField>

                <FormField label="Quantity" required error={fieldErrors.qty}>
                  <div className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                      className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={qty}
                      onChange={(e) => {
                        const n = Math.round(Number(e.target.value) || 0);
                        setQty(n < 1 ? 1 : n);
                      }}
                      className="w-24 text-center font-mono font-bold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setQty((prev) => prev + 1)}
                      className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </FormField>

                {/* Product Image Upload */}
                <FormField
                  label="Product Image (Optional)"
                  hint="JPG, PNG or WebP (max 8MB). Compressed automatically before upload."
                  className="md:col-span-2"
                >
                  <div className="flex flex-wrap items-center gap-4">
                    {productImagePreview ? (
                      <div className="relative w-24 h-24 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                        <img
                          src={productImagePreview}
                          alt="Pre-order product preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setProductImageFile(null);
                            setProductImagePreview('');
                            setUploadedProductImageUrl('');
                          }}
                          className="absolute top-1 right-1 w-6 h-6 rounded-md bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 cursor-pointer shadow"
                          title="Remove image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-[#D4AF37] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors">
                        <ImagePlus className="w-4 h-4 text-[#D4AF37]" />
                        Upload Product Photo
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={handleProductImageSelect}
                        />
                      </label>
                    )}
                    {productImageFile && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {productImageFile.name} ({Math.round(productImageFile.size / 1024)} KB)
                      </span>
                    )}
                  </div>
                </FormField>
              </div>
            </div>
          </Card>

          {/* SECTION 3 — PRICING */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    3. Pricing & Totals
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    All calculations use the shared integer-safe Pre-Order financial engine
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                label="Selling Price / Unit (৳)"
                required
                error={fieldErrors.sellingUnitPrice}
              >
                <CurrencyInput
                  min={0}
                  value={sellingUnitPrice}
                  onChange={(e) => {
                    setSellingUnitPrice(e.target.value);
                    if (fieldErrors.sellingUnitPrice) {
                      setFieldErrors((p) => ({ ...p, sellingUnitPrice: '' }));
                    }
                  }}
                  placeholder="0"
                />
              </FormField>

              {canViewChinaCost && (
                <FormField
                  label="China Purchase Price / Unit (৳)"
                  error={fieldErrors.chinaUnitCost}
                  hint="Stored in restricted private cost record"
                >
                  <CurrencyInput
                    min={0}
                    value={chinaUnitCost}
                    onChange={(e) => setChinaUnitCost(e.target.value)}
                    placeholder="0"
                  />
                </FormField>
              )}

              {canViewChinaCost && (
                <FormField
                  label="Shipping Cost (Total ৳)"
                  error={fieldErrors.shippingCost}
                  hint="Import freight & customs estimate"
                >
                  <CurrencyInput
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    placeholder="0"
                  />
                </FormField>
              )}

              <FormField label="Delivery Charge (৳)" error={fieldErrors.deliveryCharge}>
                <CurrencyInput
                  min={0}
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  placeholder="0"
                />
              </FormField>

              <FormField
                label="Discount (৳)"
                error={fieldErrors.discount}
                hint={`Max: ${formatBDT(financials.subtotal)}`}
              >
                <CurrencyInput
                  min={0}
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                    if (fieldErrors.discount) {
                      setFieldErrors((p) => ({ ...p, discount: '' }));
                    }
                  }}
                  placeholder="0"
                />
              </FormField>
            </div>

            {/* Auto-calculated read-only strip */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Subtotal
                </span>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatBDT(financials.subtotal)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Total Amount
                </span>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                  {formatBDT(financials.totalAmount)}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Remaining Due
                </span>
                <div className="text-sm font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">
                  {formatBDT(financials.dueAmount)}
                </div>
              </div>
              {canViewProfit && (
                <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70">
                  <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    Expected Profit
                  </span>
                  <div className="text-sm font-bold font-mono tabular-nums text-emerald-800 dark:text-emerald-200 mt-0.5">
                    {formatBDT(financials.expectedProfit)}{' '}
                    <span className="text-xs font-semibold">
                      ({financials.expectedProfitPercent}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* SECTION 4 — ADVANCE PAYMENT */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    4. Advance Payment
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Recorded as a customer deposit liability — never booked as sales revenue until fulfillment
                  </p>
                </div>
              </div>
              <PreOrderStatusBadge status={startStatus} size="xs" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Advance Amount (৳)"
                error={fieldErrors.advanceAmount}
                hint={
                  parsedAdvance > 0
                    ? 'Starts order in "Advance Received" and adds an advance payment entry.'
                    : 'Leave 0 to start directly in "Order Confirmed".'
                }
              >
                <CurrencyInput
                  min={0}
                  value={advanceAmount}
                  onChange={(e) => {
                    setAdvanceAmount(e.target.value);
                    if (fieldErrors.advanceAmount) {
                      setFieldErrors((p) => ({ ...p, advanceAmount: '' }));
                    }
                  }}
                  placeholder="0"
                />
              </FormField>

              <FormField label="Payment Method">
                <Select
                  options={PRE_ORDER_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                  value={paymentMethod}
                  onChange={(val) => setPaymentMethod(val as PreOrderPaymentMethod)}
                  searchable={false}
                  disabled={parsedAdvance <= 0}
                />
              </FormField>

              {parsedAdvance > 0 && (
                <>
                  <FormField
                    label="Transaction ID / Reference"
                    required={paymentMethod !== 'Cash'}
                    error={fieldErrors.paymentRefNo}
                    hint={
                      paymentMethod === 'Cash'
                        ? 'Optional cash voucher / slip reference'
                        : `Required for ${paymentMethod} deposits`
                    }
                  >
                    <Input
                      value={paymentRefNo}
                      onChange={(e) => {
                        setPaymentRefNo(e.target.value);
                        if (fieldErrors.paymentRefNo) {
                          setFieldErrors((p) => ({ ...p, paymentRefNo: '' }));
                        }
                      }}
                      placeholder="e.g. TRX9A8B7C6D"
                      className="font-mono"
                    />
                  </FormField>

                  <FormField label="Received Date & Time">
                    <Input
                      type="datetime-local"
                      value={paymentReceivedAt}
                      onChange={(e) => setPaymentReceivedAt(e.target.value)}
                    />
                  </FormField>

                  <FormField
                    label="Payment Receipt (Optional)"
                    hint="Screenshot or bank slip (compressed before upload)"
                    className="sm:col-span-2"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      {receiptPreview ? (
                        <div className="relative w-20 h-20 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setReceiptFile(null);
                              setReceiptPreview('');
                              setUploadedReceiptUrl('');
                            }}
                            className="absolute top-1 right-1 w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center cursor-pointer"
                            title="Remove receipt"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#D4AF37] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                          <Receipt className="w-4 h-4 text-[#D4AF37]" />
                          Attach Receipt Image
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={handleReceiptSelect}
                          />
                        </label>
                      )}
                      {receiptFile && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {receiptFile.name}
                        </span>
                      )}
                    </div>
                  </FormField>

                  {canAutoVerifyCash ? (
                    <div className="sm:col-span-2">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoVerifyAdvance}
                          onChange={(e) => setAutoVerifyAdvance(e.target.checked)}
                          className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
                        />
                        Auto-verify Cash advance immediately (Admin / Super Admin only — reduces Remaining Due right away)
                      </label>
                    </div>
                  ) : (
                    <div className="sm:col-span-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {paymentMethod !== 'Cash' ? (
                        <span>
                          Non-cash payments (<strong>{paymentMethod}</strong>) always start as <strong>Pending Verification</strong> and do not reduce Remaining Due until approved by another verifier.
                        </span>
                      ) : (
                        <span>
                          Cash entry will start as <strong>Pending Verification</strong> until approved by an authorized verifier.
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* SECTION 5 — SUPPLIER & DATES */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    5. Supplier, Dates & Notes
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Assign supplier, procurement reference, expected arrival, and sub-brand
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Supplier">
                <div className="flex items-center gap-2">
                  <Select
                    options={supplierOptions}
                    value={supplierId}
                    onChange={(val) => setSupplierId(String(val))}
                    placeholder={loadingSuppliers ? 'Loading suppliers...' : 'Select supplier...'}
                    searchable
                    isClearable
                  />
                  {canAddSupplier && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="md"
                      onClick={() => setShowAddSupplier(true)}
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      className="shrink-0"
                    >
                      New
                    </Button>
                  )}
                </div>
              </FormField>

              <FormField label="Supplier Order ID / Ref">
                <Input
                  value={supplierOrderRef}
                  onChange={(e) => setSupplierOrderRef(e.target.value)}
                  placeholder="e.g. 1688-3940284920"
                  className="font-mono"
                />
              </FormField>

              <FormField label="Order Date" required>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </FormField>

              <FormField
                label="Expected Arrival Date"
                error={fieldErrors.estimatedDeliveryDate}
                hint="Used to flag overdue shipments"
              >
                <Input
                  type="date"
                  min={orderDate || undefined}
                  value={estimatedDeliveryDate}
                  onChange={(e) => {
                    setEstimatedDeliveryDate(e.target.value);
                    if (fieldErrors.estimatedDeliveryDate) {
                      setFieldErrors((p) => ({ ...p, estimatedDeliveryDate: '' }));
                    }
                  }}
                />
              </FormField>

              <FormField label="Sub-Brand" required>
                <Select
                  options={allowedSubBrands.map((b) => ({
                    value: b,
                    label:
                      b === 'SAT'
                        ? 'SAT — Sky Automation Tech'
                        : b === 'GZ'
                        ? 'GZ — GadgetZone'
                        : 'RTX — Robotics & Tech',
                  }))}
                  value={subBrand}
                  onChange={(val) => setSubBrand(val as 'SAT' | 'GZ' | 'RTX')}
                  searchable={false}
                />
              </FormField>

              <div className="hidden md:block" />

              <FormField
                label="Public Note (Customer-Visible)"
                className={canViewProfit ? '' : 'md:col-span-2'}
              >
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special color/plug instructions or delivery remarks..."
                />
              </FormField>

              {canViewProfit && (
                <FormField
                  label="Internal Note (Admin / Profit Role Only)"
                  hint="Stored securely in restricted private record; never exposed to Staff or Tracking links"
                >
                  <Textarea
                    rows={2}
                    value={internalNotes}
                    onChange={(e) => setInternalNotes(e.target.value)}
                    placeholder="Private margin, sourcing negotiation, or freight notes..."
                  />
                </FormField>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN (~30%) — STICKY LIVE ORDER SUMMARY */}
        <div className="xl:col-span-4 xl:sticky xl:top-4 space-y-4">
          <Card padding="md" className="border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">
                Order Summary
              </h3>
              <SubBrandBadge subBrand={subBrand} />
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Starting Status</span>
                <PreOrderStatusBadge status={startStatus} size="xs" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Customer</span>
                <div className="text-right font-medium text-slate-900 dark:text-slate-100 truncate max-w-[60%]">
                  {customerName.trim() || 'Not entered'}
                  {isValidBdPhone(customerPhone) && (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {normalizeBdPhone(customerPhone)}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">Product</span>
                <div className="text-right font-medium text-slate-900 dark:text-slate-100 max-w-[65%] truncate">
                  {productName.trim() || 'Not entered'}
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Qty: <span className="font-mono font-bold">{financials.qty}</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 tabular-nums">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>
                    Subtotal ({financials.qty} × {formatBDT(parsedSelling || 0)})
                  </span>
                  <span className="font-mono font-semibold">
                    {formatBDT(financials.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Delivery Charge</span>
                  <span className="font-mono">{formatBDT(financials.deliveryCharge)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Discount</span>
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    -{formatBDT(financials.discount)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Total Amount
                  </span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
                    {formatBDT(financials.totalAmount)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>
                    Advance ({shouldVerify ? 'Verified' : parsedAdvance > 0 ? 'Pending Verify' : 'None'})
                  </span>
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {formatBDT(parsedAdvance)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 flex justify-between items-center">
                  <span className="font-semibold text-amber-900 dark:text-amber-300">
                    Remaining Due
                  </span>
                  <span className="text-sm font-bold font-mono text-amber-800 dark:text-amber-200">
                    {formatBDT(financials.dueAmount)}
                  </span>
                </div>
              </div>

              {canViewProfit && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 tabular-nums">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Profitability (Restricted)
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>China Cost ({financials.qty} units)</span>
                    <span className="font-mono">
                      {formatBDT((parsedChinaCost || 0) * financials.qty)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-300">
                    <span>Import Shipping</span>
                    <span className="font-mono">{formatBDT(parsedShipping || 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-700 dark:text-emerald-400 pt-1">
                    <span>Expected Profit</span>
                    <span className="font-mono">
                      {formatBDT(financials.expectedProfit)} ({financials.expectedProfitPercent}%)
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="sticky bottom-0 z-30 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {submitStatusText ? (
            <span className="font-medium text-[#93741E] dark:text-[#E2C255]">
              {submitStatusText}
            </span>
          ) : isDirty ? (
            <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Ready to create Pre-Order
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 ml-auto">
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={() => (isDirty ? setShowCancelConfirm(true) : onCancel())}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={submitting}
            disabled={submitting}
          >
            Save Pre-Order
          </Button>
        </div>
      </div>

      {/* Discard Changes Confirmation */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => {
          setShowCancelConfirm(false);
          onDirtyChange?.(false);
          onCancel();
        }}
        title="Discard unsaved Pre-Order?"
        message="You have unsaved customer or product details in this form. Leaving now will discard them."
        confirmLabel="Discard & Leave"
        cancelLabel="Keep Editing"
        variant="warning"
      />

      {/* Quick Add Supplier Drawer */}
      <Drawer
        isOpen={showAddSupplier}
        onClose={() => !savingSupplier && setShowAddSupplier(false)}
        title="Add New Supplier"
        subtitle="Creates a supplier in /suppliers with sequential SUP-xxxx code and selects it here."
        width="sm"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={savingSupplier}
              onClick={() => setShowAddSupplier(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              isLoading={savingSupplier}
              onClick={handleCreateQuickSupplier}
            >
              Save Supplier
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-100 dark:border-slate-800">
            <Building2 className="w-4 h-4 text-[#D4AF37]" />
            Reusable across Inventory & Pre-Order procurement
          </div>
          <FormField label="Supplier Name" required>
            <Input
              value={newSupName}
              onChange={(e) => setNewSupName(e.target.value)}
              placeholder="e.g. Shenzhen SmartHome Trading Co."
            />
          </FormField>
          <FormField label="Phone / WeChat / Contact" required>
            <Input
              value={newSupPhone}
              onChange={(e) => setNewSupPhone(e.target.value)}
              placeholder="+86 ... or 01XXXXXXXXX"
            />
          </FormField>
          <FormField label="Company Name (Optional)">
            <Input
              value={newSupCompany}
              onChange={(e) => setNewSupCompany(e.target.value)}
              placeholder="Company or store name (1688 / Alibaba)"
            />
          </FormField>
          <FormField label="Address / Location (Optional)">
            <Textarea
              rows={2}
              value={newSupAddress}
              onChange={(e) => setNewSupAddress(e.target.value)}
              placeholder="Guangzhou / Shenzhen / Dhaka office..."
            />
          </FormField>
        </div>
      </Drawer>
    </form>
  );
};

export default CreatePreOrderView;
