import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  Calendar,
  CheckCircle2,
  Copy,
  CreditCard,
  GitMerge,
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
  PreOrderItem,
  PreOrderPaymentMethod,
  Product,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  MAX_PRE_ORDER_ITEMS,
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
  roundMoney,
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

interface DraftPreOrderLine {
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
  notes: string;
  imageFile: File | null;
  imagePreview: string;
  uploadedImageUrl: string;
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

function createEmptyLine(itemId: string): DraftPreOrderLine {
  return {
    itemId,
    linkedProductId: '',
    linkedVariantId: '',
    productName: '',
    category: '',
    sku: '',
    model: '',
    variant: '',
    color: '',
    qty: 1,
    sellingUnitPrice: '',
    chinaUnitCost: '',
    notes: '',
    imageFile: null,
    imagePreview: '',
    uploadedImageUrl: '',
  };
}

function isLineTouched(line: DraftPreOrderLine): boolean {
  return Boolean(
    line.linkedProductId ||
      line.linkedVariantId ||
      line.productName.trim() ||
      line.sku.trim() ||
      line.model.trim() ||
      line.variant.trim() ||
      line.color.trim() ||
      line.notes.trim() ||
      Number(line.sellingUnitPrice) > 0 ||
      Number(line.chinaUnitCost) > 0 ||
      line.qty > 1 ||
      line.imageFile ||
      line.imagePreview
  );
}

function getLineIdentitySignature(line: DraftPreOrderLine): string {
  if (line.linkedProductId) {
    return `cat:${line.linkedProductId}:${line.linkedVariantId || 'default'}`;
  }
  const name = line.productName.trim().toLowerCase();
  if (!name) return '';
  return `custom:${name}:${line.model.trim().toLowerCase()}:${line.variant.trim().toLowerCase()}:${line.color
    .trim()
    .toLowerCase()}`;
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

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());
  const submitInFlightRef = useRef<boolean>(false);
  const lookupSeqRef = useRef<number>(0);
  const lineSeqRef = useRef<number>(2);

  // Section 1 — Customer
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = useState(true);
  const [customerAddress, setCustomerAddress] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [customerLookupDonePhone, setCustomerLookupDonePhone] = useState('');

  // Section 2 — Multi-Line Order Items
  const [lines, setLines] = useState<DraftPreOrderLine[]>(() => [createEmptyLine('item-1')]);
  const [dismissedDuplicatePairs, setDismissedDuplicatePairs] = useState<Record<string, boolean>>({});
  const [pendingRemoveLineId, setPendingRemoveLineId] = useState<string | null>(null);

  // Section 3 — Order-Level Charges & Totals
  const [shippingCost, setShippingCost] = useState<string>('');
  const [deliveryCharge, setDeliveryCharge] = useState<string>('0');
  const [discount, setDiscount] = useState<string>('0');

  // Section 4 — Advance Payment
  const [advanceAmount, setAdvanceAmount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PreOrderPaymentMethod>('bKash');
  const [paymentRefNo, setPaymentRefNo] = useState('');
  const [initDuplicateNeedsOverride, setInitDuplicateNeedsOverride] = useState(false);
  const [initDuplicateOverrideReason, setInitDuplicateOverrideReason] = useState('');
  const [paymentReceivedAt, setPaymentReceivedAt] = useState<string>(() =>
    getLocalDateTimeInputValue()
  );
  const [autoVerifyAdvance, setAutoVerifyAdvance] = useState<boolean>(() =>
    isPreOrderAdminRole(user.role)
  );
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

  useEffect(() => {
    if (!allowedSubBrands.includes(subBrand)) {
      setSubBrand(allowedSubBrands[0]);
    }
  }, [allowedSubBrands, subBrand]);

  useEffect(() => {
    if (whatsappSameAsPhone) {
      setCustomerWhatsapp(customerPhone);
    }
  }, [whatsappSameAsPhone, customerPhone]);

  const isDirty = useMemo(() => {
    return Boolean(
      customerPhone.trim() ||
        customerName.trim() ||
        customerAddress.trim() ||
        lines.length > 1 ||
        lines.some((l) => isLineTouched(l)) ||
        Number(advanceAmount) > 0 ||
        Number(deliveryCharge) > 0 ||
        Number(discount) > 0 ||
        Number(shippingCost) > 0 ||
        supplierId ||
        notes.trim() ||
        internalNotes.trim()
    );
  }, [
    customerPhone,
    customerName,
    customerAddress,
    lines,
    advanceAmount,
    deliveryCharge,
    discount,
    shippingCost,
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

  // Automatic Customer Phone Lookup
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

  // Central Financial Calculations (Single Source of Truth across all lines)
  const parsedShipping = canViewChinaCost ? Number(shippingCost || 0) : 0;
  const parsedDelivery = Number(deliveryCharge || 0);
  const parsedDiscount = Number(discount || 0);
  const parsedAdvance = Number(advanceAmount || 0);

  const canAutoVerifyCash = isAdminActor && paymentMethod === 'Cash';
  const shouldVerify = canAutoVerifyCash && autoVerifyAdvance;

  const calculationItems = useMemo<PreOrderItem[]>(() => {
    return lines.map((line) => {
      const q = Math.max(0, Math.round(Number(line.qty) || 0));
      const selling = Number.isFinite(Number(line.sellingUnitPrice))
        ? Math.max(0, Number(line.sellingUnitPrice) || 0)
        : 0;
      const china =
        canViewChinaCost && Number.isFinite(Number(line.chinaUnitCost))
          ? Math.max(0, Number(line.chinaUnitCost) || 0)
          : 0;
      return {
        itemId: line.itemId,
        productName: line.productName.trim() || 'Item',
        qty: q,
        sellingUnitPrice: selling,
        chinaUnitCost: china,
        lineTotal: roundMoney(q * selling),
      };
    });
  }, [lines, canViewChinaCost]);

  const financials = useMemo(() => {
    return calculatePreOrderFinancials({
      items: calculationItems,
      deliveryCharge: Number.isFinite(parsedDelivery) ? Math.max(0, parsedDelivery) : 0,
      discount: Number.isFinite(parsedDiscount) ? Math.max(0, parsedDiscount) : 0,
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
  }, [calculationItems, parsedDelivery, parsedDiscount, parsedShipping, parsedAdvance, shouldVerify]);

  const totalChinaProductCost = useMemo(() => {
    if (!canViewChinaCost) return 0;
    const paisa = calculationItems.reduce(
      (sum, it) => sum + Math.round(it.qty * toPaisa(it.chinaUnitCost)),
      0
    );
    return paisa / 100;
  }, [calculationItems, canViewChinaCost]);

  const startStatus = getInitialPreOrderStatus(parsedAdvance);

  const productLinkOptions = useMemo(() => {
    return products
      .filter((p) => !p.archived)
      .map((p) => {
        const total = p.totalStock ?? p.stock ?? 0;
        const avail = Math.max(0, total - (p.reservedQty || 0));
        return {
          value: p.id,
          label: p.name,
          sublabel: [
            p.sku ? `SKU: ${p.sku}` : '',
            p.category || '',
            `Avail: ${avail} / Stock: ${total}`,
          ]
            .filter(Boolean)
            .join(' • '),
          badge: p.sellingPrice ? formatBDT(p.sellingPrice) : undefined,
        };
      });
  }, [products]);

  const baseCategoryNames = useMemo(() => {
    const names = new Set<string>(categories.map((c) => c.name).filter(Boolean));
    lines.forEach((l) => {
      if (l.category) names.add(l.category);
    });
    return Array.from(names).map((name) => ({ value: name, label: name }));
  }, [categories, lines]);

  const supplierOptions = useMemo(() => {
    return suppliers.map((s) => ({
      value: s.id,
      label: s.name,
      sublabel: [s.supplierCode, s.companyName, s.phone].filter(Boolean).join(' • '),
    }));
  }, [suppliers]);

  // Helper to update a single line safely
  const updateLine = (itemId: string, patch: Partial<DraftPreOrderLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l))
    );
  };

  const clearItemError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    }
  };

  const handleAddLine = () => {
    if (lines.length >= MAX_PRE_ORDER_ITEMS) {
      toast.warning(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed per pre-order.`);
      return;
    }
    const newId = `item-${lineSeqRef.current++}`;
    setLines((prev) => [...prev, createEmptyLine(newId)]);
  };

  const handleDuplicateLine = (index: number) => {
    if (lines.length >= MAX_PRE_ORDER_ITEMS) {
      toast.warning(`Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed per pre-order.`);
      return;
    }
    const src = lines[index];
    if (!src) return;
    const newId = `item-${lineSeqRef.current++}`;
    const clone: DraftPreOrderLine = {
      ...src,
      itemId: newId,
    };
    setLines((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, clone);
      return next;
    });
  };

  const handleMoveLine = (index: number, dir: -1 | 1) => {
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= lines.length) return;
    setLines((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  };

  const handleRequestRemoveLine = (itemId: string) => {
    if (lines.length <= 1) return;
    const target = lines.find((l) => l.itemId === itemId);
    if (target && isLineTouched(target)) {
      setPendingRemoveLineId(itemId);
    } else {
      setLines((prev) => prev.filter((l) => l.itemId !== itemId));
    }
  };

  const confirmRemoveLine = () => {
    if (!pendingRemoveLineId) return;
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.itemId !== pendingRemoveLineId) : prev));
    setPendingRemoveLineId(null);
  };

  // Detect duplicate signature across lines
  const duplicateMatches = useMemo(() => {
    const firstBySig = new Map<string, { idx: number; itemId: string }>();
    const dupMap: Record<string, { targetIdx: number; targetItemId: string; sig: string }> = {};
    lines.forEach((l, idx) => {
      const sig = getLineIdentitySignature(l);
      if (!sig) return;
      const existing = firstBySig.get(sig);
      if (existing) {
        dupMap[l.itemId] = {
          targetIdx: existing.idx,
          targetItemId: existing.itemId,
          sig,
        };
      } else {
        firstBySig.set(sig, { idx, itemId: l.itemId });
      }
    });
    return dupMap;
  }, [lines]);

  const handleMergeDuplicateLine = (sourceItemId: string, targetItemId: string) => {
    setLines((prev) => {
      const src = prev.find((l) => l.itemId === sourceItemId);
      const tgt = prev.find((l) => l.itemId === targetItemId);
      if (!src || !tgt) return prev;
      return prev
        .map((l) =>
          l.itemId === targetItemId
            ? { ...l, qty: Math.max(1, (Number(l.qty) || 1) + (Number(src.qty) || 1)) }
            : l
        )
        .filter((l) => l.itemId !== sourceItemId);
    });
    toast.success('Merged quantities into a single line item.');
  };

  const handleLinkProductChange = (itemId: string, prodId: string) => {
    clearItemError(`item_${itemId}_productName`);
    clearItemError(`item_${itemId}_sellingUnitPrice`);
    if (!prodId) {
      updateLine(itemId, { linkedProductId: '', linkedVariantId: '' });
      return;
    }
    const found = products.find((p) => p.id === prodId);
    if (!found) return;

    const currentLine = lines.find((l) => l.itemId === itemId);
    const patch: Partial<DraftPreOrderLine> = {
      linkedProductId: prodId,
      linkedVariantId: '',
      productName: found.name,
      category: found.category || currentLine?.category || '',
      sku: found.sku || currentLine?.sku || '',
    };

    if (found.variants && found.variants.length > 0) {
      const firstVar = found.variants[0];
      patch.linkedVariantId = firstVar.id;
      patch.color = firstVar.color || '';
      patch.model = firstVar.model || '';
      patch.variant = [firstVar.color, firstVar.model].filter(Boolean).join(' / ');
    } else {
      patch.model = found.model || '';
      patch.color = found.color || '';
    }

    if (found.sellingPrice > 0) {
      patch.sellingUnitPrice = String(found.sellingPrice);
    }
    if (canViewChinaCost && found.purchasePrice > 0 && !currentLine?.chinaUnitCost) {
      patch.chinaUnitCost = String(found.purchasePrice);
    }
    if (found.imageUrl) {
      patch.imageFile = null;
      patch.imagePreview = found.imageUrl;
      patch.uploadedImageUrl = found.imageUrl;
    }
    updateLine(itemId, patch);
  };

  const handleVariantSelect = (itemId: string, prodId: string, varId: string) => {
    if (!varId) {
      updateLine(itemId, { linkedVariantId: '' });
      return;
    }
    const foundProd = products.find((p) => p.id === prodId);
    const varItem = foundProd?.variants?.find((v) => v.id === varId);
    if (!varItem) {
      updateLine(itemId, { linkedVariantId: varId });
      return;
    }
    updateLine(itemId, {
      linkedVariantId: varId,
      color: varItem.color || '',
      model: varItem.model || '',
      variant: [varItem.color, varItem.model].filter(Boolean).join(' / '),
    });
  };

  const handleAutoSku = (itemId: string, productNameVal: string, index: number) => {
    const base = (productNameVal || 'ITEM')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4)
      .padEnd(3, 'X');
    const suffix = String(Date.now()).slice(-4);
    updateLine(itemId, { sku: `PO-${subBrand}-${base}-${index + 1}${suffix.slice(-2)}` });
  };

  const handleLineImageSelect = (itemId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    const existing = lines.find((l) => l.itemId === itemId)?.imagePreview;
    if (existing && existing.startsWith('blob:')) {
      URL.revokeObjectURL(existing);
    }
    const blobUrl = URL.createObjectURL(file);
    updateLine(itemId, { imageFile: file, uploadedImageUrl: '', imagePreview: blobUrl });
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
    if (receiptPreview && receiptPreview.startsWith('blob:')) {
      URL.revokeObjectURL(receiptPreview);
    }
    setReceiptFile(file);
    setUploadedReceiptUrl('');
    setReceiptPreview(URL.createObjectURL(file));
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

    if (lines.length === 0) {
      errors.items = 'Add at least 1 product line item.';
    } else if (lines.length > MAX_PRE_ORDER_ITEMS) {
      errors.items = `Maximum ${MAX_PRE_ORDER_ITEMS} line items allowed.`;
    }

    lines.forEach((line, idx) => {
      if (!line.productName.trim()) {
        errors[`item_${line.itemId}_productName`] = `Item #${idx + 1}: Product name is required.`;
      }
      if (!Number.isFinite(line.qty) || line.qty < 1) {
        errors[`item_${line.itemId}_qty`] = `Item #${idx + 1}: Quantity must be at least 1.`;
      }
      if (!line.sellingUnitPrice || Number(line.sellingUnitPrice) <= 0) {
        errors[`item_${line.itemId}_sellingUnitPrice`] = `Item #${idx + 1}: Selling price must be > 0.`;
      }
      if (canViewChinaCost && Number(line.chinaUnitCost || 0) < 0) {
        errors[`item_${line.itemId}_chinaUnitCost`] = `Item #${idx + 1}: China cost cannot be negative.`;
      }
    });

    if (canViewChinaCost && Number(shippingCost || 0) < 0) {
      errors.shippingCost = 'Shipping cost cannot be negative.';
    }
    if (Number(deliveryCharge || 0) < 0) {
      errors.deliveryCharge = 'Delivery charge cannot be negative.';
    }
    if (Number(discount || 0) < 0) {
      errors.discount = 'Discount cannot be negative.';
    } else if (toPaisa(parsedDiscount) > toPaisa(financials.subtotal)) {
      errors.discount = 'Discount cannot exceed order subtotal.';
    }

    if (Number(advanceAmount || 0) < 0) {
      errors.advanceAmount = 'Advance payment cannot be negative.';
    } else if (toPaisa(parsedAdvance) > toPaisa(financials.totalAmount)) {
      errors.advanceAmount = 'Advance payment cannot exceed total order amount.';
    }

    if (parsedAdvance > 0 && paymentMethod !== 'Cash' && !paymentRefNo.trim()) {
      errors.paymentRefNo = `Transaction ID is required for ${paymentMethod}.`;
    }
    if (
      parsedAdvance > 0 &&
      initDuplicateNeedsOverride &&
      !initDuplicateOverrideReason.trim()
    ) {
      errors.initDuplicateOverrideReason =
        'Admin override reason is required for a pending duplicate Transaction ID.';
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
    if (!canCreate || submitting || submitInFlightRef.current) return;
    if (!validateForm()) return;

    submitInFlightRef.current = true;
    setSubmitting(true);
    try {
      const resolvedImageUrls: Record<string, string> = {};
      const linesNeedingUpload = lines.filter((l) => l.imageFile && !l.uploadedImageUrl);
      const totalUploads = linesNeedingUpload.length + (parsedAdvance > 0 && receiptFile && !uploadedReceiptUrl ? 1 : 0);
      let completedUploads = 0;

      if (totalUploads > 0) {
        setSubmitStatusText(`Compressing & uploading ${totalUploads} photo${totalUploads > 1 ? 's' : ''} in parallel...`);
      }

      const lineUploadPromise = Promise.all(
        lines.map(async (line) => {
          if (line.imageFile && !line.uploadedImageUrl) {
            const uploadRes = await uploadPreOrderImage(line.imageFile, 'products');
            resolvedImageUrls[line.itemId] = uploadRes.url;
            updateLine(line.itemId, { uploadedImageUrl: uploadRes.url });
            completedUploads += 1;
            setSubmitStatusText(`Uploaded ${completedUploads}/${totalUploads} photos...`);
          } else {
            resolvedImageUrls[line.itemId] = line.uploadedImageUrl || line.imagePreview || '';
          }
        })
      );

      let finalReceiptUrl = uploadedReceiptUrl;
      const receiptUploadPromise =
        parsedAdvance > 0 && receiptFile && !uploadedReceiptUrl
          ? uploadPreOrderImage(receiptFile, 'receipts').then((receiptRes) => {
              finalReceiptUrl = receiptRes.url;
              setUploadedReceiptUrl(receiptRes.url);
              completedUploads += 1;
              setSubmitStatusText(`Uploaded ${completedUploads}/${totalUploads} photos...`);
            })
          : Promise.resolve();

      await Promise.all([lineUploadPromise, receiptUploadPromise]);

      setSubmitStatusText('Saving multi-item pre-order transaction...');
      const selectedSupplier = suppliers.find((s) => s.id === supplierId);
      const parsedReceivedTs = paymentReceivedAt
        ? new Date(paymentReceivedAt).getTime()
        : Date.now();

      const itemsPayload: PreOrderItem[] = lines.map((line, idx) => {
        const q = Math.max(1, Math.round(Number(line.qty) || 1));
        const sp = roundMoney(Number(line.sellingUnitPrice) || 0);
        const chinaCost = canViewChinaCost ? roundMoney(Number(line.chinaUnitCost) || 0) : 0;
        return {
          itemId: `item-${idx + 1}`,
          linkedProductId: line.linkedProductId || undefined,
          linkedVariantId: line.linkedVariantId || undefined,
          productName: line.productName.trim(),
          imageUrl: resolvedImageUrls[line.itemId] || '',
          category: line.category.trim(),
          sku: line.sku.trim(),
          model: line.model.trim(),
          variant: line.variant.trim(),
          color: line.color.trim(),
          qty: q,
          chinaUnitCost: chinaCost,
          sellingUnitPrice: sp,
          lineTotal: roundMoney(q * sp),
          notes: line.notes.trim() || undefined,
        };
      });

      const primary = itemsPayload[0];
      const totalQty = itemsPayload.reduce((s, it) => s + it.qty, 0);
      const weightedChina =
        totalQty > 0
          ? roundMoney(
              itemsPayload.reduce((s, it) => s + (it.chinaUnitCost || 0) * it.qty, 0) / totalQty
            )
          : 0;

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
          items: itemsPayload,
          productName: primary.productName,
          category: primary.category || '',
          sku: primary.sku || '',
          model: primary.model || '',
          variant: primary.variant || '',
          color: primary.color || '',
          productImage: primary.imageUrl || '',
          linkedProductId: primary.linkedProductId,
          linkedVariantId: primary.linkedVariantId,
          qty: totalQty,
          sellingUnitPrice: primary.sellingUnitPrice,
          deliveryCharge: Number(deliveryCharge || 0),
          discount: Number(discount || 0),
          chinaUnitCost: canViewChinaCost ? weightedChina : 0,
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
                  duplicateOverrideReason: initDuplicateOverrideReason.trim() || undefined,
                }
              : undefined,
        },
        actorFromUser(user)
      );

      onDirtyChange?.(false);
      toast.success(
        `Pre-Order ${result.preOrderNumber} created (${itemsPayload.length} item${
          itemsPayload.length === 1 ? '' : 's'
        }, ${totalQty} pcs).`
      );
      if (result.trackingSyncWarning) {
        toast.warning(result.trackingSyncWarning);
      }
      onCreated(result);
    } catch (err: any) {
      console.error('Create Pre-Order failed:', err);
      const rawMsg = err?.message || 'Failed to save Pre-Order. Your form data has been kept.';
      if (rawMsg.startsWith('DUPLICATE_TXN_ADMIN:')) {
        setInitDuplicateNeedsOverride(true);
        const clean = rawMsg.replace('DUPLICATE_TXN_ADMIN:', '').trim();
        setFieldErrors((prev) => ({ ...prev, paymentRefNo: clean }));
        toast.error(clean);
      } else if (rawMsg.startsWith('DUPLICATE_TXN_VERIFIED:') || rawMsg.startsWith('DUPLICATE_TXN:')) {
        setInitDuplicateNeedsOverride(false);
        setInitDuplicateOverrideReason('');
        const clean = rawMsg.replace(/^DUPLICATE_TXN(_VERIFIED)?:\s*/, '').trim();
        setFieldErrors((prev) => ({ ...prev, paymentRefNo: clean }));
        toast.error(clean);
      } else {
        toast.error(rawMsg);
      }
    } finally {
      submitInFlightRef.current = false;
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
              Supports multiple products &amp; variants in a single <span className="font-mono font-semibold">PO-0001</span> • No stock deduction on creation
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
                    clearItemError('customerPhone');
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
                    clearItemError('customerName');
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
                    clearItemError('customerAddress');
                  }}
                  placeholder="House, road, area, district..."
                />
              </FormField>
            </div>
          </Card>

          {/* SECTION 2 — MULTI-PRODUCT & VARIANT ORDER ITEMS */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      2. Order Items ({lines.length})
                    </h2>
                    <Badge variant="neutral" size="xs">
                      {financials.qty} unit{financials.qty === 1 ? '' : 's'} total
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Add one or multiple products, colors, models, or variants to this Pre-Order (max {MAX_PRE_ORDER_ITEMS})
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddLine}
                disabled={lines.length >= MAX_PRE_ORDER_ITEMS}
                leftIcon={<Plus className="w-3.5 h-3.5 text-[#D4AF37]" />}
              >
                Add Another Product
              </Button>
            </div>

            {fieldErrors.items && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{fieldErrors.items}</span>
              </div>
            )}

            <div className="space-y-4">
              {lines.map((line, idx) => {
                const linkedProd = line.linkedProductId
                  ? products.find((p) => p.id === line.linkedProductId)
                  : undefined;
                const prodVariants = linkedProd?.variants || [];
                const lineSelling = Math.max(0, Number(line.sellingUnitPrice) || 0);
                const lineTotal = roundMoney((Number(line.qty) || 0) * lineSelling);
                const dupInfo = duplicateMatches[line.itemId];
                const dismissKey = `${line.itemId}:${dupInfo?.sig || ''}`;
                const showDuplicateBanner = Boolean(dupInfo && !dismissedDuplicatePairs[dismissKey]);

                return (
                  <div
                    key={line.itemId}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-4 space-y-4"
                  >
                    {/* Line Card Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 dark:border-slate-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-900 dark:bg-slate-800 text-[#D4AF37] font-mono text-xs font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[240px] sm:max-w-xs">
                          {line.productName.trim() || `Item #${idx + 1}`}
                        </span>
                        {(line.variant || line.color) && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            ({[line.variant, line.color].filter(Boolean).join(' • ')})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 tabular-nums">
                          Line: {formatBDT(lineTotal)}
                        </span>

                        <button
                          type="button"
                          onClick={() => handleMoveLine(idx, -1)}
                          disabled={idx === 0}
                          title="Move up"
                          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveLine(idx, 1)}
                          disabled={idx === lines.length - 1}
                          title="Move down"
                          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-35 cursor-pointer disabled:cursor-not-allowed"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicateLine(idx)}
                          disabled={lines.length >= MAX_PRE_ORDER_ITEMS}
                          title="Duplicate item line (great for adding another color/variant)"
                          className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:border-[#D4AF37] cursor-pointer disabled:opacity-35"
                        >
                          <Copy className="w-3 h-3" />
                          Duplicate
                        </button>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRequestRemoveLine(line.itemId)}
                            title="Remove item line"
                            className="w-7 h-7 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center hover:bg-rose-100 dark:hover:bg-rose-950/60 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Optional Duplicate Detection Helper */}
                    {showDuplicateBanner && dupInfo && (
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-xs text-amber-900 dark:text-amber-200 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <GitMerge className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span>
                            Same product/variant as <strong>Item #{dupInfo.targetIdx + 1}</strong>. Merge quantity or keep separate?
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="primary"
                            size="xs"
                            onClick={() => handleMergeDuplicateLine(line.itemId, dupInfo.targetItemId)}
                          >
                            Merge Qty
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="xs"
                            onClick={() =>
                              setDismissedDuplicatePairs((prev) => ({
                                ...prev,
                                [dismissKey]: true,
                              }))
                            }
                          >
                            Keep Separate
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Optional Link to existing catalog product */}
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <FormField
                        label="Link to Existing Catalog Product (Optional)"
                        hint={
                          line.linkedProductId
                            ? 'Linked to catalog — stock is NOT changed now. Stock adds to this product on warehouse receipt.'
                            : 'Leave blank for brand-new China import items.'
                        }
                      >
                        <div className="flex items-center gap-2">
                          <Link2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <Select
                            options={productLinkOptions}
                            value={line.linkedProductId}
                            onChange={(val) => handleLinkProductChange(line.itemId, String(val || ''))}
                            placeholder="Search existing catalog product..."
                            searchable
                            isClearable
                          />
                        </div>
                      </FormField>

                      {line.linkedProductId && prodVariants.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                          <FormField label="Product Variant (Color / Model / Size)">
                            <Select
                              options={prodVariants.map((v) => {
                                const avail = Math.max(0, (v.stock || 0) - (v.reservedQty || 0));
                                return {
                                  value: v.id,
                                  label: `${v.color || 'Standard'} / ${v.model || 'Standard'}`,
                                  sublabel: `Avail: ${avail} • On hand: ${v.stock || 0} pcs`,
                                };
                              })}
                              value={line.linkedVariantId}
                              onChange={(val) =>
                                handleVariantSelect(line.itemId, line.linkedProductId, String(val || ''))
                              }
                              placeholder="Select variant..."
                            />
                          </FormField>
                        </div>
                      )}
                    </div>

                    {/* Product Attributes & Per-Line Pricing */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      <FormField
                        label="Product Name"
                        required
                        error={fieldErrors[`item_${line.itemId}_productName`]}
                        className="md:col-span-2 lg:col-span-2"
                      >
                        <Input
                          value={line.productName}
                          onChange={(e) => {
                            updateLine(line.itemId, { productName: e.target.value });
                            clearItemError(`item_${line.itemId}_productName`);
                          }}
                          placeholder="e.g. Zigbee Smart Curtain Motor Tuya WiFi"
                        />
                      </FormField>

                      <FormField label="Category">
                        <Select
                          options={baseCategoryNames}
                          value={line.category}
                          onChange={(val) => updateLine(line.itemId, { category: String(val || '') })}
                          placeholder="Select category..."
                          searchable
                          isClearable
                        />
                      </FormField>

                      <FormField label="SKU (Optional)">
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={line.sku}
                            onChange={(e) => updateLine(line.itemId, { sku: e.target.value })}
                            placeholder="SKU"
                            className="font-mono"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleAutoSku(line.itemId, line.productName, idx)}
                            leftIcon={<Sparkles className="w-3 h-3" />}
                            className="shrink-0"
                          >
                            Auto
                          </Button>
                        </div>
                      </FormField>

                      <FormField label="Model">
                        <Input
                          value={line.model}
                          onChange={(e) => updateLine(line.itemId, { model: e.target.value })}
                          placeholder="e.g. ZM85EL-2.0"
                        />
                      </FormField>

                      <FormField label="Variant / Spec">
                        <Input
                          value={line.variant}
                          onChange={(e) => updateLine(line.itemId, { variant: e.target.value })}
                          placeholder="e.g. 3 Meter / EU Plug"
                        />
                      </FormField>

                      <FormField label="Color">
                        <Input
                          value={line.color}
                          onChange={(e) => updateLine(line.itemId, { color: e.target.value })}
                          placeholder="e.g. Matte Black"
                        />
                      </FormField>

                      <FormField
                        label="Quantity"
                        required
                        error={fieldErrors[`item_${line.itemId}_qty`]}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.itemId, {
                                qty: Math.max(1, (Number(line.qty) || 1) - 1),
                              })
                            }
                            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={line.qty}
                            onChange={(e) => {
                              const n = Math.round(Number(e.target.value) || 0);
                              updateLine(line.itemId, { qty: n < 1 ? 1 : n });
                            }}
                            className="w-20 text-center font-mono font-bold tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.itemId, {
                                qty: (Number(line.qty) || 1) + 1,
                              })
                            }
                            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </FormField>

                      <FormField
                        label="Selling Price / Unit (৳)"
                        required
                        error={fieldErrors[`item_${line.itemId}_sellingUnitPrice`]}
                      >
                        <CurrencyInput
                          min={0}
                          value={line.sellingUnitPrice}
                          onChange={(e) => {
                            updateLine(line.itemId, { sellingUnitPrice: e.target.value });
                            clearItemError(`item_${line.itemId}_sellingUnitPrice`);
                          }}
                          placeholder="0"
                        />
                      </FormField>

                      {canViewChinaCost && (
                        <FormField
                          label="China Purchase / Unit (৳)"
                          error={fieldErrors[`item_${line.itemId}_chinaUnitCost`]}
                          hint="Stored in private cost record"
                        >
                          <CurrencyInput
                            min={0}
                            value={line.chinaUnitCost}
                            onChange={(e) => {
                              updateLine(line.itemId, { chinaUnitCost: e.target.value });
                              clearItemError(`item_${line.itemId}_chinaUnitCost`);
                            }}
                            placeholder="0"
                          />
                        </FormField>
                      )}

                      <FormField
                        label="Item Note (Optional)"
                        className={canViewChinaCost ? 'lg:col-span-2' : 'lg:col-span-3'}
                      >
                        <Input
                          value={line.notes}
                          onChange={(e) => updateLine(line.itemId, { notes: e.target.value })}
                          placeholder="Specific plug, engraving, or packing note for this item..."
                        />
                      </FormField>

                      {/* Per-line Photo Upload */}
                      <FormField
                        label="Product Photo (Optional)"
                        className="md:col-span-2 lg:col-span-3"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          {line.imagePreview ? (
                            <div className="relative w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                              <img
                                src={line.imagePreview}
                                alt={line.productName || 'Item preview'}
                                className="w-full h-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateLine(line.itemId, {
                                    imageFile: null,
                                    imagePreview: '',
                                    uploadedImageUrl: '',
                                  })
                                }
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 cursor-pointer shadow"
                                title="Remove image"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-[#D4AF37] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors">
                              <ImagePlus className="w-4 h-4 text-[#D4AF37]" />
                              Upload Photo
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={(e) => handleLineImageSelect(line.itemId, e)}
                              />
                            </label>
                          )}
                          {line.imageFile && (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              {line.imageFile.name} ({Math.round(line.imageFile.size / 1024)} KB)
                            </span>
                          )}
                        </div>
                      </FormField>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddLine}
                disabled={lines.length >= MAX_PRE_ORDER_ITEMS}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#D4AF37] bg-slate-50/70 dark:bg-slate-950/30 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4 text-[#D4AF37]" />
                Add Another Product or Variant ({lines.length}/{MAX_PRE_ORDER_ITEMS})
              </button>
            </div>
          </Card>

          {/* SECTION 3 — ORDER CHARGES & TOTALS */}
          <Card padding="md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    3. Order Charges &amp; Totals
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Order-level shipping estimate, customer delivery charge, and discount across all {lines.length} line item(s)
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {canViewChinaCost && (
                <FormField
                  label="Import Shipping Cost (Total ৳)"
                  error={fieldErrors.shippingCost}
                  hint="Freight & customs estimate for whole order"
                >
                  <CurrencyInput
                    min={0}
                    value={shippingCost}
                    onChange={(e) => setShippingCost(e.target.value)}
                    placeholder="0"
                  />
                </FormField>
              )}

              <FormField label="Customer Delivery Charge (৳)" error={fieldErrors.deliveryCharge}>
                <CurrencyInput
                  min={0}
                  value={deliveryCharge}
                  onChange={(e) => setDeliveryCharge(e.target.value)}
                  placeholder="0"
                />
              </FormField>

              <FormField
                label="Order Discount (৳)"
                error={fieldErrors.discount}
                hint={`Max: ${formatBDT(financials.subtotal)}`}
              >
                <CurrencyInput
                  min={0}
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                    clearItemError('discount');
                  }}
                  placeholder="0"
                />
              </FormField>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Items Subtotal ({financials.qty} pcs)
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
                    clearItemError('advanceAmount');
                  }}
                  placeholder="0"
                />
              </FormField>

              <FormField label="Payment Method">
                <Select
                  options={PRE_ORDER_PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
                  value={paymentMethod}
                  onChange={(val) => {
                    setPaymentMethod(val as PreOrderPaymentMethod);
                    setInitDuplicateNeedsOverride(false);
                    setInitDuplicateOverrideReason('');
                  }}
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
                        setInitDuplicateNeedsOverride(false);
                        setInitDuplicateOverrideReason('');
                        clearItemError('paymentRefNo');
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
                  {initDuplicateNeedsOverride && isAdminActor && (
                    <div className="sm:col-span-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-200">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Pending Duplicate Transaction ID Detected — Admin Override Required
                      </div>
                      <FormField
                        label="Admin Override Reason"
                        required
                        error={fieldErrors.initDuplicateOverrideReason}
                      >
                        <Input
                          value={initDuplicateOverrideReason}
                          onChange={(e) => {
                            setInitDuplicateOverrideReason(e.target.value);
                            clearItemError('initDuplicateOverrideReason');
                          }}
                          placeholder="Explain why this duplicate pending Transaction ID is valid..."
                        />
                      </FormField>
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
                    5. Supplier, Dates &amp; Notes
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
                    onChange={(val) => setSupplierId(String(val || ''))}
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
                    clearItemError('estimatedDeliveryDate');
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

              {/* Line Items Breakdown */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Items ({lines.length})</span>
                  <span>{financials.qty} pcs</span>
                </div>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5 scrollbar-thin">
                  {lines.map((line, idx) => {
                    const lt = roundMoney(
                      (Number(line.qty) || 0) * (Number(line.sellingUnitPrice) || 0)
                    );
                    return (
                      <div
                        key={line.itemId}
                        className="flex items-start justify-between gap-2 py-1.5 px-2 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/80"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 dark:text-slate-100 truncate">
                            {idx + 1}. {line.productName.trim() || 'Untitled item'}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {line.qty} × {formatBDT(Number(line.sellingUnitPrice) || 0)}
                            {line.variant || line.color
                              ? ` • ${[line.variant, line.color].filter(Boolean).join(' / ')}`
                              : ''}
                          </div>
                        </div>
                        <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 shrink-0 tabular-nums">
                          {formatBDT(lt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 tabular-nums">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Subtotal ({financials.qty} pcs)</span>
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
                    <span className="font-mono">{formatBDT(totalChinaProductCost)}</span>
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
              Unsaved changes ({lines.length} item{lines.length === 1 ? '' : 's'})
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
            Save Pre-Order ({lines.length} Item{lines.length === 1 ? '' : 's'})
          </Button>
        </div>
      </div>

      {/* Remove Touched Line Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(pendingRemoveLineId)}
        onClose={() => setPendingRemoveLineId(null)}
        onConfirm={confirmRemoveLine}
        title="Remove this item line?"
        message="This product line has entered details. Removing it will delete its quantity and pricing from this Pre-Order."
        confirmLabel="Remove Item"
        cancelLabel="Keep Item"
        variant="warning"
      />

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
            Reusable across Inventory &amp; Pre-Order procurement
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
