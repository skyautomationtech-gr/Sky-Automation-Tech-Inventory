import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Settings,
  X,
  AlertCircle,
  Check,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  Star,
} from 'lucide-react';
import { motion } from 'motion/react';
import Barcode from './Barcode';
import {
  Product,
  Variant,
  Category,
  Brand,
  UserProfile,
  ProductColor,
  ProductModel,
  ProductEditHistoryEntry,
} from '../types';
import {
  addProduct,
  updateProduct,
  addProductColor,
  addProductModel,
  getUniqueBarcodeValue,
  logAuditAction,
  addNotification,
} from '../firebase/db';
import {
  uploadProductImage,
  buildProductFieldDiff,
  buildCategoryPathLabel,
  normalizeProductImages,
} from '../utils/productImageUpload';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editModeProduct: Product | null;
  /** When true (e.g. reviewer or staff editing a pending item), saving keeps status as pending_review */
  preservePendingStatus?: boolean;
  isStaff: boolean;
  isSuperAdmin: boolean;
  user: UserProfile | null;
  products: Product[];
  categories: Category[];
  brands: Brand[];
  productColors: ProductColor[];
  productModels: ProductModel[];
  requireCheckIn?: () => boolean;
  onRefreshData: () => Promise<void>;
  onSaved?: (info: { message: string; productId: string; status: 'pending_review' | 'approved' | 'rejected' }) => void;
}

export default function ProductFormModal({
  isOpen,
  onClose,
  editModeProduct,
  preservePendingStatus = false,
  isStaff,
  isSuperAdmin,
  user,
  products,
  categories,
  brands,
  productColors,
  productModels,
  requireCheckIn,
  onRefreshData,
  onSaved,
}: ProductFormModalProps) {
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formMainCategory, setFormMainCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formChildCategory, setFormChildCategory] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formSubBrand, setFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [formDescription, setFormDescription] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCostPrice, setFormCostPrice] = useState<number | ''>('');
  const [formSellingPrice, setFormSellingPrice] = useState<number | ''>('');
  const [formReorderThreshold, setFormReorderThreshold] = useState<number | ''>(5);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [brokenImgIndexes, setBrokenImgIndexes] = useState<Record<number, boolean>>({});
  const [uploadingImages, setUploadingImages] = useState(false);
  const [formVariants, setFormVariants] = useState<Variant[]>([
    { id: '1', color: 'Default', model: 'Standard', stock: 10 },
  ]);

  const [isSkuDirty, setIsSkuDirty] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardMaxStep, setWizardMaxStep] = useState<number>(1);
  const [stepErrors, setStepErrors] = useState<{ [key: string]: string }>({});
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [customColorValue, setCustomColorValue] = useState<{ [key: string]: string }>({});
  const [customSizeValue, setCustomSizeValue] = useState<{ [key: string]: string }>({});
  const [isCustomColorMode, setIsCustomColorMode] = useState<{ [key: string]: boolean }>({});
  const [isCustomSizeMode, setIsCustomSizeMode] = useState<{ [key: string]: boolean }>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const generateSkuCode = (subBrand: string, category: string, brandName: string) => {
    const div = subBrand || 'SAT';

    let cat = 'GEN';
    if (category) {
      const cleanCat = category.replace(/[^a-zA-Z ]/g, '');
      const parts = cleanCat.split(/\s+/).filter((p) => p.length > 0);
      if (parts.length >= 2) {
        cat = (parts[0].substring(0, 1) + parts[1].substring(0, 2)).toUpperCase();
      } else {
        cat = category.substring(0, 3).toUpperCase();
      }
    }

    let brnd = 'UNK';
    if (brandName) {
      const cleanBrnd = brandName.replace(/[^a-zA-Z ]/g, '');
      const parts = cleanBrnd.split(/\s+/).filter((p) => p.length > 0);
      if (parts.length >= 2) {
        brnd = (parts[0].substring(0, 1) + parts[1].substring(0, 2)).toUpperCase();
      } else {
        brnd = brandName.substring(0, 3).toUpperCase();
      }
    }

    const prefix = `${div}-${cat}-${brnd}-`;
    const matchingProducts = products.filter((p) => p.sku && p.sku.startsWith(prefix));
    let nextNum = matchingProducts.length + 1;

    while (products.some((p) => p.sku === `${prefix}${String(nextNum).padStart(3, '0')}`)) {
      nextNum++;
    }

    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  };

  // Initialize form whenever modal opens or target product changes
  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    setFormSuccess('');
    setStepErrors({});
    setBrokenImgIndexes({});
    setShowDiscardConfirm(false);
    setCustomColorValue({});
    setCustomSizeValue({});
    setIsCustomColorMode({});
    setIsCustomSizeMode({});

    if (editModeProduct) {
      setIsSkuDirty(true);
      setFormName(editModeProduct.name || '');
      setFormSku(editModeProduct.sku || '');
      setFormMainCategory(editModeProduct.mainCategory || editModeProduct.category || '');
      setFormSubCategory(editModeProduct.subCategory || '');
      setFormChildCategory(editModeProduct.childCategory || '');
      setFormCategory(editModeProduct.category || editModeProduct.mainCategory || '');
      setFormBrand(editModeProduct.brand || '');
      setFormSubBrand((editModeProduct.subBrand as 'SAT' | 'GZ' | 'RTX') || 'SAT');
      setFormDescription(editModeProduct.description || '');
      setFormNotes(editModeProduct.notes || '');
      setFormCostPrice(editModeProduct.costPrice ?? 0);
      setFormSellingPrice(editModeProduct.sellingPrice ?? '');
      setFormReorderThreshold(editModeProduct.reorderThreshold ?? 5);
      setFormImages(normalizeProductImages(editModeProduct));
      setFormVariants(
        editModeProduct.variants && editModeProduct.variants.length > 0
          ? editModeProduct.variants.map((v) => ({ ...v }))
          : [{ id: Date.now().toString(), color: 'Default', model: 'Standard', stock: 0 }]
      );
      setWizardStep(1);
      setWizardMaxStep(5);
    } else {
      setIsSkuDirty(false);
      setFormName('');
      const mainCats = categories.filter((c) => c.level === 'main' || !c.level);
      const initialMain = mainCats[0]?.name || '';
      const initialBrand = brands[0]?.name || '';
      setFormMainCategory(initialMain);
      setFormSubCategory('');
      setFormChildCategory('');
      setFormCategory(initialMain);
      setFormBrand(initialBrand);
      setFormSubBrand('SAT');
      setFormDescription('');
      setFormNotes('');
      setFormCostPrice(isStaff ? 0 : '');
      setFormSellingPrice('');
      setFormReorderThreshold(5);
      setFormImages([]);
      setFormVariants([{ id: Date.now().toString(), color: 'Default', model: 'Standard', stock: 10 }]);
      setWizardStep(1);
      setWizardMaxStep(1);
      setFormSku(generateSkuCode('SAT', initialMain, initialBrand));
    }
  }, [isOpen, editModeProduct?.id]);

  // Auto-generate SKU in add mode when user hasn't manually edited SKU
  useEffect(() => {
    if (isOpen && !editModeProduct && !isSkuDirty) {
      setFormSku(generateSkuCode(formSubBrand, formCategory, formBrand));
    }
  }, [isOpen, formSubBrand, formCategory, formBrand, editModeProduct, isSkuDirty]);

  // Esc key closes form modal (if not submitting)
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        e.stopPropagation();
        handleCancelForm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, submitting, formName, formSku, formMainCategory, formSubCategory, formChildCategory, formBrand, formCostPrice, formSellingPrice, formReorderThreshold, formImages, formDescription, formNotes]);

  if (!isOpen) return null;

  const isPendingEditContext =
    preservePendingStatus || editModeProduct?.status === 'pending_review';

  const validateStep = (step: number): boolean => {
    const errors: { [key: string]: string } = {};

    if (step === 1) {
      if (!formName.trim()) errors.name = 'Product Display Name is required';
      if (!formSku.trim()) errors.sku = 'SKU Code is required';
      if (!formMainCategory) errors.mainCategory = 'Main Category is required';

      const mainParentId = categories.find(
        (p) => p.name === formMainCategory && (p.level === 'main' || !p.level)
      )?.id;
      const availableSubCats = formMainCategory
        ? categories.filter((c) => c.level === 'sub' && c.parentId === mainParentId)
        : [];
      if (availableSubCats.length > 0 && !formSubCategory) {
        errors.subCategory = 'Sub Category is required';
      }

      const subParentId = categories.find(
        (s) => s.name === formSubCategory && s.level === 'sub' && s.parentId === mainParentId
      )?.id;
      const availableChildCats = formSubCategory
        ? categories.filter((c) => c.level === 'child' && c.parentId === subParentId)
        : [];
      if (availableChildCats.length > 0 && !formChildCategory) {
        errors.childCategory = 'Child Category is required';
      }

      if (!formBrand && brands.length > 0) {
        errors.brand = 'Brand is required';
      }
    } else if (step === 2) {
      if (!isStaff) {
        if (formCostPrice === '') {
          errors.costPrice = 'Purchase Price is required';
        } else if (Number(formCostPrice) < 0) {
          errors.costPrice = 'Purchase Price cannot be negative';
        }
      }
      if (formSellingPrice === '') {
        errors.sellingPrice = 'Selling Price is required';
      } else if (Number(formSellingPrice) <= 0) {
        errors.sellingPrice = 'Selling Price must be greater than 0';
      }
      if (Number(formReorderThreshold) < 0) {
        errors.reorderThreshold = 'Reorder threshold cannot be negative';
      }
    } else if (step === 3) {
      if (formVariants.length === 0) {
        errors.variants = 'At least one variant configuration is required';
      } else {
        formVariants.forEach((v, idx) => {
          if (!v.color || !v.color.trim()) {
            errors[`variant-color-${v.id || idx}`] = `Color/Finish is required for Variant #${idx + 1}`;
          }
          if (!v.model || !v.model.trim()) {
            errors[`variant-model-${v.id || idx}`] = `Model/Size is required for Variant #${idx + 1}`;
          }
          if (Number(v.stock) < 0) {
            errors[`variant-stock-${v.id || idx}`] = `Stock cannot be negative for Variant #${idx + 1}`;
          }
        });
      }
    }

    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(wizardStep)) {
      const nextStep = Math.min(5, wizardStep + 1);
      setWizardStep(nextStep);
      setWizardMaxStep((prev) => Math.max(prev, nextStep));
      setStepErrors({});
    }
  };

  const handlePrevStep = () => {
    if (wizardStep > 1) {
      setWizardStep(wizardStep - 1);
      setStepErrors({});
    }
  };

  const handleJumpToStep = (step: number) => {
    if (step < wizardStep) {
      setWizardStep(step);
      setStepErrors({});
    } else if (step <= wizardMaxStep) {
      let allValid = true;
      for (let s = 1; s < step; s++) {
        if (!validateStep(s)) {
          allValid = false;
          setWizardStep(s);
          break;
        }
      }
      if (allValid) {
        setWizardStep(step);
        setStepErrors({});
      }
    }
  };

  const handleCancelForm = () => {
    const isDirty = editModeProduct
      ? formName !== editModeProduct.name ||
        formSku !== editModeProduct.sku ||
        formMainCategory !== (editModeProduct.mainCategory || editModeProduct.category) ||
        formSubCategory !== (editModeProduct.subCategory || '') ||
        formChildCategory !== (editModeProduct.childCategory || '') ||
        formBrand !== editModeProduct.brand ||
        formDescription !== (editModeProduct.description || '') ||
        formNotes !== (editModeProduct.notes || '') ||
        (!isStaff && Number(formCostPrice) !== Number(editModeProduct.costPrice)) ||
        Number(formSellingPrice) !== Number(editModeProduct.sellingPrice) ||
        Number(formReorderThreshold) !== Number(editModeProduct.reorderThreshold) ||
        JSON.stringify(formImages) !== JSON.stringify(normalizeProductImages(editModeProduct))
      : formName.trim() !== '' ||
        Number(formSellingPrice) > 0 ||
        formImages.length > 0 ||
        formDescription.trim() !== '' ||
        formNotes.trim() !== '' ||
        formVariants.some((v) => v.color !== 'Default' || v.model !== 'Standard');

    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const addVariantField = () => {
    setFormVariants((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, color: '', model: '', stock: 0 },
    ]);
  };

  const removeVariantField = (id: string) => {
    if (formVariants.length > 1) {
      setFormVariants((prev) => prev.filter((v) => v.id !== id));
    }
  };

  const updateVariantValue = (
    id: string,
    field: 'color' | 'model' | 'stock',
    value: string | number
  ) => {
    setFormVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  const handleAddCustomColor = async (color: string) => {
    const trimmed = color.trim();
    if (
      trimmed &&
      !productColors.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      try {
        await addProductColor(trimmed, '#000000');
        await onRefreshData();
      } catch (err) {
        console.error('Failed to add custom color', err);
      }
    }
  };

  const handleAddCustomSize = async (size: string) => {
    const trimmed = size.trim();
    if (
      trimmed &&
      !productModels.find((m) => m.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      try {
        await addProductModel(trimmed);
        await onRefreshData();
      } catch (err) {
        console.error('Failed to add custom model/size', err);
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (files.length === 0) return;

    setFormError('');
    setUploadingImages(true);
    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const res = await uploadProductImage(file, formSku || formName || 'product');
        uploadedUrls.push(res.url);
      } catch (err: any) {
        errors.push(err?.message || `Failed to process "${file.name}".`);
      }
    }

    if (uploadedUrls.length > 0) {
      setFormImages((prev) => [...prev, ...uploadedUrls]);
    }
    if (errors.length > 0) {
      setFormError(errors.join(' '));
    }
    setUploadingImages(false);
  };

  const moveImage = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= formImages.length || fromIdx === toIdx) return;
    setFormImages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setBrokenImgIndexes({});
  };

  const setAsPrimaryImage = (idx: number) => {
    if (idx <= 0 || idx >= formImages.length) return;
    moveImage(idx, 0);
  };

  const removeImage = (idx: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== idx));
    setBrokenImgIndexes({});
  };

  const handleAutoGenerateSku = () => {
    setFormSku(generateSkuCode(formSubBrand, formCategory, formBrand));
    setIsSkuDirty(false);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wizardStep < 5 && !editModeProduct) {
      handleNextStep();
      return;
    }

    if (submitting || uploadingImages) return;
    setFormError('');
    setFormSuccess('');

    if (!validateStep(1)) {
      setFormError('Please complete Step 1 with valid details before saving.');
      setWizardStep(1);
      return;
    }
    if (!validateStep(2)) {
      setFormError('Please complete Step 2 pricing details before saving.');
      setWizardStep(2);
      return;
    }
    if (!validateStep(3)) {
      setFormError('Please complete Step 3 variants & stock before saving.');
      setWizardStep(3);
      return;
    }

    if (requireCheckIn && !requireCheckIn()) return;

    const finalSku = formSku.trim().toUpperCase();
    const isDuplicateSku = products.some(
      (p) =>
        p.sku.toUpperCase() === finalSku &&
        (!editModeProduct || p.id !== editModeProduct.id) &&
        !p.archived
    );
    if (isDuplicateSku) {
      setFormError(`SKU Code "${finalSku}" is already assigned to another active product.`);
      setWizardStep(1);
      return;
    }

    for (const v of formVariants) {
      const cleanColor = v.color.trim();
      const cleanModel = v.model.trim();
      const existingV = editModeProduct?.variants?.find(
        (ev) => ev.id === v.id || (ev.color === cleanColor && ev.model === cleanModel)
      );
      const reservedQty = Number(existingV?.reservedQty ?? v.reservedQty) || 0;
      if (Number(v.stock) < reservedQty) {
        setFormError(
          `Variant "${cleanColor} / ${cleanModel}" has ${reservedQty} pcs reserved for Pre-Orders and cannot go below ${reservedQty}.`
        );
        setWizardStep(3);
        return;
      }
    }

    setSubmitting(true);

    // Determine final workflow status:
    // - Editing a pending_review item ALWAYS stays pending_review (editing never auto-approves!)
    // - Creating or resubmitting by non-SuperAdmin goes to pending_review
    // - SuperAdmin creating or editing an approved catalog item stays approved
    let finalStatus: 'pending_review' | 'approved' | 'rejected' = 'approved';
    if (isPendingEditContext) {
      finalStatus = 'pending_review';
    } else if (!isSuperAdmin) {
      finalStatus = 'pending_review';
    } else {
      finalStatus = 'approved';
    }

    const generatedInSession = new Set<string>();
    const needsMigration = (val: string | undefined, originalSku?: string): boolean => {
      if (!val) return true;
      if (originalSku && val === originalSku) return true;
      if (val.includes('-') && val.length > 10) return true;
      if (!val.includes('-')) return true;
      return false;
    };

    let mainBarcodeValue = editModeProduct?.barcodeValue;
    if (needsMigration(mainBarcodeValue, finalSku)) {
      mainBarcodeValue = getUniqueBarcodeValue(formSubBrand, products, generatedInSession);
      generatedInSession.add(mainBarcodeValue);
    }

    const updatedVariants = formVariants.map((v) => {
      const cleanColor = v.color.trim();
      const cleanModel = v.model.trim();
      const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
      const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
      const oldLongBarcodeValue = `${finalSku}-${vColorCode}-${vModelCode}`;

      const existingV = editModeProduct?.variants?.find(
        (ev) => ev.id === v.id || (ev.color === cleanColor && ev.model === cleanModel)
      );
      let vBarcodeValue = v.barcodeValue || existingV?.barcodeValue;

      if (
        needsMigration(vBarcodeValue, oldLongBarcodeValue) ||
        needsMigration(vBarcodeValue, finalSku)
      ) {
        vBarcodeValue = getUniqueBarcodeValue(formSubBrand, products, generatedInSession);
        generatedInSession.add(vBarcodeValue);
      }

      const preservedReserved = Number(existingV?.reservedQty ?? v.reservedQty) || 0;
      return {
        ...v,
        color: cleanColor,
        model: cleanModel,
        stock: Number(v.stock),
        ...(preservedReserved > 0 ? { reservedQty: preservedReserved } : {}),
        barcodeValue: vBarcodeValue,
      };
    });

    const effectiveCostPrice = isStaff
      ? Number(editModeProduct?.costPrice ?? 0)
      : Number(formCostPrice || 0);
    const cleanImages = formImages.filter(Boolean);
    const nowTs = Date.now();

    const basePayload: Omit<Product, 'id'> = {
      name: formName.trim(),
      sku: finalSku,
      description: formDescription.trim(),
      notes: formNotes.trim(),
      category: formMainCategory || '',
      mainCategory: formMainCategory || '',
      subCategory: formSubCategory || '',
      childCategory: formChildCategory || '',
      brand: formBrand || '',
      subBrand: formSubBrand || 'SAT',
      costPrice: effectiveCostPrice,
      sellingPrice: Number(formSellingPrice),
      reorderThreshold: Number(formReorderThreshold || 0),
      images: cleanImages,
      imageUrls: cleanImages,
      variants: updatedVariants,
      archived: false,
      createdAt: editModeProduct ? editModeProduct.createdAt : nowTs,
      barcodeValue: mainBarcodeValue,
      status: finalStatus,
      rejectionReason:
        finalStatus === 'pending_review' ? '' : editModeProduct?.rejectionReason || '',
      createdById: editModeProduct?.createdById || user?.id || '',
      createdBy: editModeProduct?.createdBy || user?.name || 'Unknown',
      submittedBy: editModeProduct?.submittedBy || {
        uid: user?.id || '',
        name: user?.name || 'Unknown',
        role: user?.role || 'staff',
        ...(user?.photoUrl ? { photoUrl: user.photoUrl } : {}),
      },
      submittedAt: editModeProduct?.submittedAt || editModeProduct?.createdAt || nowTs,
      ...(editModeProduct?.reservedQty !== undefined
        ? { reservedQty: editModeProduct.reservedQty }
        : {}),
      ...(editModeProduct?.reservedForPreOrders
        ? { reservedForPreOrders: editModeProduct.reservedForPreOrders }
        : {}),
    };

    try {
      let targetProductId = editModeProduct?.id || '';
      let successMsg = '';

      if (editModeProduct) {
        const changes = buildProductFieldDiff(editModeProduct, basePayload, !isStaff);
        const existingHistory: ProductEditHistoryEntry[] = Array.isArray(
          editModeProduct.editHistory
        )
          ? editModeProduct.editHistory
          : [];
        const isResubmission = editModeProduct.status === 'rejected' && finalStatus === 'pending_review';
        const historyEntry: ProductEditHistoryEntry = {
          id: `eh-${nowTs}-${Math.random().toString(36).slice(2, 6)}`,
          editedByUid: user?.id || '',
          editedByName: user?.name || 'Operator',
          editedByRole: user?.role || 'staff',
          editedAt: nowTs,
          action: isResubmission ? 'resubmitted' : 'edited',
          changes,
        };

        await updateProduct(editModeProduct.id, {
          ...basePayload,
          editHistory: [...existingHistory, historyEntry],
        });

        const priceChanged =
          (!isStaff && Number(editModeProduct.costPrice) !== effectiveCostPrice) ||
          Number(editModeProduct.sellingPrice) !== Number(formSellingPrice);
        const diffSummary =
          changes.length > 0
            ? changes.map((c) => `${c.label}: "${c.before}" → "${c.after}"`).join(' | ')
            : 'Saved product details without field diffs';

        await logAuditAction(
          priceChanged ? 'PRICE_CHANGE' : 'UPDATE',
          'Product',
          editModeProduct.id,
          basePayload.name,
          `${isPendingEditContext ? '[Pending Queue Edit] ' : ''}${diffSummary}`,
          user
        );

        successMsg =
          finalStatus === 'pending_review'
            ? isResubmission
              ? 'Product updated and resubmitted for approval.'
              : 'Changes saved. Product remains pending until approved.'
            : 'Product details updated successfully!';
      } else {
        const initialHistory: ProductEditHistoryEntry = {
          id: `eh-${nowTs}`,
          editedByUid: user?.id || '',
          editedByName: user?.name || 'Operator',
          editedByRole: user?.role || 'staff',
          editedAt: nowTs,
          action: 'created',
          changes: [],
        };

        targetProductId = await addProduct(
          {
            ...basePayload,
            editHistory: [initialHistory],
          },
          user?.id || '',
          user?.name || 'Operator'
        );

        await logAuditAction(
          'CREATE',
          'Product',
          targetProductId,
          basePayload.name,
          `Created ${finalStatus === 'pending_review' ? 'pending review' : 'approved'} product (SKU: ${basePayload.sku}, Category: ${buildCategoryPathLabel(basePayload)}, Price: ৳${basePayload.sellingPrice})`,
          user
        );

        if (finalStatus === 'pending_review') {
          await addNotification({
            type: 'pending_approval',
            title: 'New Product Pending Approval',
            message: `${user?.name || 'Staff'} submitted "${basePayload.name}" (SKU: ${basePayload.sku}) for review.`,
            targetScreen: 'products',
            subAction: 'pending',
            targetId: targetProductId,
            forRoles: ['superadmin', 'admin'],
          });
        }

        successMsg =
          finalStatus === 'pending_review'
            ? 'New product submitted for review and approval!'
            : 'New product published to catalog!';
      }

      setFormSuccess(successMsg);
      await onRefreshData();
      onSaved?.({ message: successMsg, productId: targetProductId, status: finalStatus });
      setSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error(err);
      setFormError(err?.message || 'Failed to save product record.');
      setSubmitting(false);
    }
  };

  const profitValue = Number(formSellingPrice || 0) - Number(formCostPrice || 0);
  const marginPercent =
    Number(formSellingPrice) > 0
      ? Math.round((profitValue / Number(formSellingPrice)) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-[75] flex justify-end bg-slate-950/60 backdrop-blur-xs"
      onClick={() => !submitting && handleCancelForm()}
    >
      <div
        className="w-full max-w-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-full overflow-y-auto shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20 flex justify-between items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-black text-slate-900 dark:text-white truncate">
              {editModeProduct
                ? isPendingEditContext
                  ? 'Edit Pending Product'
                  : 'Edit Catalog Product'
                : 'Register New Product'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {isPendingEditContext
                ? 'Saving updates keeps status pending until explicitly approved.'
                : 'Complete all steps to submit inventory specification.'}
            </p>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={handleCancelForm}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
            title="Close (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main Wizard Body */}
        <form onSubmit={handleFormSubmit} className="p-6 flex-1 space-y-5">
          {formError && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-500" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2">
              <Check size={16} className="shrink-0 text-emerald-500" />
              <span>{formSuccess}</span>
            </div>
          )}

          {/* Step Indicator */}
          <div>
            <div className="hidden sm:flex items-center justify-between relative px-2 py-3">
              <div className="absolute top-[29px] left-6 right-6 h-0.5 bg-slate-200 dark:bg-slate-800 rounded-full z-0" />
              <div
                className="absolute top-[29px] left-6 h-0.5 bg-amber-400 rounded-full z-0 transition-all duration-300"
                style={{ width: `${((wizardMaxStep - 1) / 4) * 86}%` }}
              />
              {[1, 2, 3, 4, 5].map((step) => {
                const isCompleted = step < wizardStep || (Boolean(editModeProduct) && wizardMaxStep >= step);
                const isActive = step === wizardStep;
                const isSelectable = step <= wizardMaxStep;
                const labels = ['Basic Info', 'Pricing', 'Variants', 'Photos', 'Review'];

                return (
                  <button
                    key={step}
                    type="button"
                    disabled={!isSelectable}
                    onClick={() => handleJumpToStep(step)}
                    className={`relative z-10 flex flex-col items-center transition-all ${
                      isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                    }`}
                  >
                    <div
                      className={`size-7 rounded-full flex items-center justify-center font-black text-xs border transition-all ${
                        isActive
                          ? 'bg-slate-900 dark:bg-[#D4AF37] text-amber-400 dark:text-slate-950 border-slate-900 dark:border-[#D4AF37] ring-4 ring-amber-400/20'
                          : isCompleted
                          ? 'bg-amber-400 text-slate-950 border-amber-400'
                          : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isCompleted && !isActive ? '✓' : step}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider mt-1.5 ${
                        isActive
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {labels[step - 1]}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="sm:hidden flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-300">
              <span>Step {wizardStep} of 5</span>
              <span>
                {['Basic Info', 'Pricing & Thresholds', 'Variants & Stock', 'Photos & Barcode', 'Review & Save'][wizardStep - 1]}
              </span>
            </div>
          </div>

          {/* STEP 1: BASIC INFO */}
          {wizardStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Product Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (stepErrors.name) setStepErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  placeholder="e.g. Realme Neo 8 5G Anti-Shock Back Cover"
                  className={`w-full bg-white dark:bg-slate-900 border rounded-xl py-2.5 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                    stepErrors.name
                      ? 'border-rose-400 focus:ring-rose-400/20'
                      : 'border-slate-200 dark:border-slate-700 focus:ring-amber-400/30'
                  }`}
                />
                {stepErrors.name && (
                  <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.name}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Sub-Brand / Division <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formSubBrand}
                    onChange={(e) => setFormSubBrand(e.target.value as 'SAT' | 'GZ' | 'RTX')}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="SAT">Sky Automation Tech (SAT)</option>
                    {editModeProduct?.subBrand === 'GZ' && <option value="GZ">GadgetZu (GZ)</option>}
                    {editModeProduct?.subBrand === 'RTX' && <option value="RTX">RTX Gadget (RTX)</option>}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    SKU Code <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={formSku}
                      onChange={(e) => {
                        setFormSku(e.target.value);
                        setIsSkuDirty(true);
                        if (stepErrors.sku) setStepErrors((prev) => ({ ...prev, sku: '' }));
                      }}
                      placeholder="SAT-PRO-001"
                      className={`flex-1 min-w-0 bg-white dark:bg-slate-900 border rounded-xl py-2.5 px-3 text-sm font-mono uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                        stepErrors.sku
                          ? 'border-rose-400 focus:ring-rose-400/20'
                          : 'border-slate-200 dark:border-slate-700 focus:ring-amber-400/30'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={handleAutoGenerateSku}
                      title="Auto-generate SKU"
                      className="px-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl cursor-pointer transition-colors"
                    >
                      <Settings size={14} />
                    </button>
                  </div>
                  {stepErrors.sku && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.sku}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Main Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formMainCategory}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormMainCategory(val);
                        setFormSubCategory('');
                        setFormChildCategory('');
                        setFormCategory(val);
                        if (stepErrors.mainCategory) setStepErrors((prev) => ({ ...prev, mainCategory: '' }));
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
                    >
                      <option value="">-- Select Main --</option>
                      {categories
                        .filter((c) => c.level === 'main' || !c.level)
                        .map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                    {stepErrors.mainCategory && (
                      <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.mainCategory}</p>
                    )}
                  </div>

                  <div>
                    {(() => {
                      const mainParentId = categories.find(
                        (p) => p.name === formMainCategory && (p.level === 'main' || !p.level)
                      )?.id;
                      const availableSubCats = formMainCategory
                        ? categories.filter((c) => c.level === 'sub' && c.parentId === mainParentId)
                        : [];
                      return (
                        <>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                            Sub Category {availableSubCats.length > 0 && <span className="text-rose-500">*</span>}
                          </label>
                          <select
                            value={formSubCategory}
                            disabled={!formMainCategory}
                            onChange={(e) => {
                              setFormSubCategory(e.target.value);
                              setFormChildCategory('');
                              if (stepErrors.subCategory) setStepErrors((prev) => ({ ...prev, subCategory: '' }));
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
                          >
                            <option value="">
                              {formMainCategory
                                ? availableSubCats.length > 0
                                  ? '-- Select Sub --'
                                  : 'None (N/A)'
                                : 'Select Main first'}
                            </option>
                            {availableSubCats.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </>
                      );
                    })()}
                    {stepErrors.subCategory && (
                      <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.subCategory}</p>
                    )}
                  </div>

                  <div>
                    {(() => {
                      const mainParentId = categories.find(
                        (p) => p.name === formMainCategory && (p.level === 'main' || !p.level)
                      )?.id;
                      const subParentId = categories.find(
                        (s) => s.name === formSubCategory && s.level === 'sub' && s.parentId === mainParentId
                      )?.id;
                      const availableChildCats = formSubCategory
                        ? categories.filter((c) => c.level === 'child' && c.parentId === subParentId)
                        : [];
                      return (
                        <>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                            Child Category {availableChildCats.length > 0 && <span className="text-rose-500">*</span>}
                          </label>
                          <select
                            value={formChildCategory}
                            disabled={!formSubCategory}
                            onChange={(e) => {
                              setFormChildCategory(e.target.value);
                              if (stepErrors.childCategory) setStepErrors((prev) => ({ ...prev, childCategory: '' }));
                            }}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-50"
                          >
                            <option value="">
                              {formSubCategory
                                ? availableChildCats.length > 0
                                  ? '-- Select Child --'
                                  : 'None (N/A)'
                                : 'Select Sub first'}
                            </option>
                            {availableChildCats.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </>
                      );
                    })()}
                    {stepErrors.childCategory && (
                      <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.childCategory}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Brand {brands.length > 0 && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    value={formBrand}
                    onChange={(e) => {
                      setFormBrand(e.target.value);
                      if (stepErrors.brand) setStepErrors((prev) => ({ ...prev, brand: '' }));
                    }}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <option value="">-- Select Brand --</option>
                    {formBrand && !brands.some((b) => b.name === formBrand) && (
                      <option value={formBrand}>{formBrand}</option>
                    )}
                    {brands.map((b) => (
                      <option key={b.id} value={b.name}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {stepErrors.brand && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.brand}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Material, compatibility, key product specifications..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Internal / Submission Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional supplier note, packaging detail, or reviewer context..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>
            </motion.div>
          )}

          {/* STEP 2: PRICING & THRESHOLDS */}
          {wizardStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4"
            >
              <div className={`grid ${isStaff ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                {!isStaff && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Purchase Price <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative flex rounded-xl">
                      <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 text-slate-500 dark:text-slate-400 text-sm font-mono font-bold">
                        ৳
                      </span>
                      <input
                        type="number"
                        value={formCostPrice}
                        onChange={(e) => {
                          setFormCostPrice(e.target.value === '' ? '' : Number(e.target.value));
                          if (stepErrors.costPrice) setStepErrors((prev) => ({ ...prev, costPrice: '' }));
                        }}
                        className="block w-full min-w-0 flex-1 rounded-r-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 px-3 text-sm font-mono text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {stepErrors.costPrice && (
                      <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.costPrice}</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Selling Price <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative flex rounded-xl">
                    <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 text-slate-500 dark:text-slate-400 text-sm font-mono font-bold">
                      ৳
                    </span>
                    <input
                      type="number"
                      value={formSellingPrice}
                      onChange={(e) => {
                        setFormSellingPrice(e.target.value === '' ? '' : Number(e.target.value));
                        if (stepErrors.sellingPrice) setStepErrors((prev) => ({ ...prev, sellingPrice: '' }));
                      }}
                      className="block w-full min-w-0 flex-1 rounded-r-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-2.5 px-3 text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {stepErrors.sellingPrice && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.sellingPrice}</p>
                  )}
                </div>
              </div>

              {!isStaff && Number(formSellingPrice) > 0 && (
                <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500 dark:text-slate-400">Calculated Profit:</span>
                    <span
                      className={`font-mono text-sm ${
                        profitValue >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      ৳{profitValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-bold border-t border-slate-100 dark:border-slate-800 pt-2">
                    <span className="text-slate-500 dark:text-slate-400">Profit Margin:</span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono ${
                        marginPercent > 0
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                          : marginPercent < 0
                          ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {marginPercent}% {marginPercent > 0 ? 'Margin' : marginPercent < 0 ? 'Loss' : 'Break-even'}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                  Reorder Alert Threshold (Units)
                </label>
                <input
                  type="number"
                  value={formReorderThreshold}
                  onChange={(e) => {
                    setFormReorderThreshold(e.target.value === '' ? '' : Number(e.target.value));
                    if (stepErrors.reorderThreshold) setStepErrors((prev) => ({ ...prev, reorderThreshold: '' }));
                  }}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2.5 px-3.5 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
                {stepErrors.reorderThreshold && (
                  <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.reorderThreshold}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* STEP 3: VARIANTS & STOCK */}
          {wizardStep === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">Variants & Stock</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add physical color/model variants and quantities.</p>
                </div>
                <button
                  type="button"
                  onClick={addVariantField}
                  className="text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> Add Variant
                </button>
              </div>

              {stepErrors.variants && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl">
                  {stepErrors.variants}
                </p>
              )}

              <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                {formVariants.map((variant, index) => (
                  <div
                    key={variant.id}
                    className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        Variant #{index + 1}
                      </span>
                      {formVariants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeVariantField(variant.id)}
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Remove Variant"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Color / Finish
                        </label>
                        {!isCustomColorMode[variant.id] ? (
                          <select
                            value={variant.color}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__add_custom__') {
                                setIsCustomColorMode((prev) => ({ ...prev, [variant.id]: true }));
                                updateVariantValue(variant.id, 'color', '');
                              } else {
                                updateVariantValue(variant.id, 'color', val);
                              }
                            }}
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm text-slate-900 dark:text-slate-100"
                          >
                            <option value="">-- Select Color --</option>
                            {variant.color &&
                              !productColors.some((c) => c.name.toLowerCase() === variant.color.toLowerCase()) && (
                                <option value={variant.color}>{variant.color}</option>
                              )}
                            {productColors.map((c) => (
                              <option key={c.id} value={c.name}>
                                {c.name}
                              </option>
                            ))}
                            <option value="__add_custom__">+ Add custom color...</option>
                          </select>
                        ) : (
                          <div className="mt-1 flex gap-1">
                            <input
                              type="text"
                              placeholder="Color name"
                              value={customColorValue[variant.id] || ''}
                              onChange={(e) =>
                                setCustomColorValue((prev) => ({ ...prev, [variant.id]: e.target.value }))
                              }
                              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 px-2.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const customVal = (customColorValue[variant.id] || '').trim();
                                if (customVal) {
                                  await handleAddCustomColor(customVal);
                                  updateVariantValue(variant.id, 'color', customVal);
                                  setIsCustomColorMode((prev) => ({ ...prev, [variant.id]: false }));
                                }
                              }}
                              className="px-2 bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        )}
                        {stepErrors[`variant-color-${variant.id}`] && (
                          <p className="text-[11px] font-semibold text-rose-500 mt-1">
                            {stepErrors[`variant-color-${variant.id}`]}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          Model / Size
                        </label>
                        {!isCustomSizeMode[variant.id] ? (
                          <select
                            value={variant.model}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '__add_custom__') {
                                setIsCustomSizeMode((prev) => ({ ...prev, [variant.id]: true }));
                                updateVariantValue(variant.id, 'model', '');
                              } else {
                                updateVariantValue(variant.id, 'model', val);
                              }
                            }}
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm text-slate-900 dark:text-slate-100"
                          >
                            <option value="">-- Select Model --</option>
                            {variant.model &&
                              !productModels.some((s) => s.name.toLowerCase() === variant.model.toLowerCase()) && (
                                <option value={variant.model}>{variant.model}</option>
                              )}
                            {productModels.map((s) => (
                              <option key={s.id} value={s.name}>
                                {s.name}
                              </option>
                            ))}
                            <option value="__add_custom__">+ Add custom model...</option>
                          </select>
                        ) : (
                          <div className="mt-1 flex gap-1">
                            <input
                              type="text"
                              placeholder="Model/Size"
                              value={customSizeValue[variant.id] || ''}
                              onChange={(e) =>
                                setCustomSizeValue((prev) => ({ ...prev, [variant.id]: e.target.value }))
                              }
                              className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 px-2.5 text-sm"
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const customVal = (customSizeValue[variant.id] || '').trim();
                                if (customVal) {
                                  await handleAddCustomSize(customVal);
                                  updateVariantValue(variant.id, 'model', customVal);
                                  setIsCustomSizeMode((prev) => ({ ...prev, [variant.id]: false }));
                                }
                              }}
                              className="px-2 bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        )}
                        {stepErrors[`variant-model-${variant.id}`] && (
                          <p className="text-[11px] font-semibold text-rose-500 mt-1">
                            {stepErrors[`variant-model-${variant.id}`]}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                        Stock Quantity
                      </label>
                      <input
                        type="number"
                        value={variant.stock}
                        onChange={(e) =>
                          updateVariantValue(
                            variant.id,
                            'stock',
                            e.target.value === '' ? 0 : Number(e.target.value)
                          )
                        }
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-900 dark:text-slate-100"
                      />
                      {stepErrors[`variant-stock-${variant.id}`] && (
                        <p className="text-[11px] font-semibold text-rose-500 mt-1">
                          {stepErrors[`variant-stock-${variant.id}`]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* STEP 4: PHOTOGRAPHY & BARCODE (WITH ADD, REMOVE, REORDER) */}
          {wizardStep === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Product Photos ({formImages.length})
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      First photo is used as the cover thumbnail. Use arrows to reorder.
                    </p>
                  </div>
                  {uploadingImages && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                      <Loader2 size={14} className="animate-spin" />
                      Uploading...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {formImages.map((img, idx) => (
                    <div
                      key={`${idx}-${img.slice(0, 24)}`}
                      className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      {brokenImgIndexes[idx] ? (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-100 dark:bg-slate-800 text-slate-400">
                          <ImageOff size={18} />
                          <span className="text-[10px] mt-1 font-semibold">Load error</span>
                        </div>
                      ) : (
                        <img
                          src={img}
                          alt={`Product ${idx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenImgIndexes((prev) => ({ ...prev, [idx]: true }))
                          }
                        />
                      )}

                      {idx === 0 && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase">
                          Cover
                        </span>
                      )}

                      <div className="absolute inset-x-0 bottom-0 p-1 bg-slate-950/75 flex items-center justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveImage(idx, idx - 1)}
                            title="Move Left"
                            className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === formImages.length - 1}
                            onClick={() => moveImage(idx, idx + 1)}
                            title="Move Right"
                            className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronRight size={13} />
                          </button>
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => setAsPrimaryImage(idx)}
                              title="Make Cover Photo"
                              className="p-1 rounded text-amber-300 hover:bg-white/20 cursor-pointer"
                            >
                              <Star size={12} />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          title="Remove Photo"
                          className="p-1 rounded text-rose-400 hover:bg-rose-500/30 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 cursor-pointer transition-colors">
                    {uploadingImages ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">
                      {uploadingImages ? 'Adding...' : 'Add Photo'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      multiple
                      disabled={uploadingImages}
                      onChange={handleImageUpload}
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-700 pt-3.5 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Live Barcode Tag Preview
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400">
                    {editModeProduct?.barcodeValue || formSku || 'TEMP-SKU'}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 flex justify-center">
                  <Barcode
                    value={editModeProduct?.barcodeValue || formSku || 'TEMP-SKU-CODE'}
                    height={44}
                    width={1.4}
                    fontSize={9}
                    margin={5}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 5: REVIEW & SAVE */}
          {wizardStep === 5 && (
            <motion.div
              key="step-5"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl space-y-3 text-sm"
            >
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Product Summary
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Name</span>
                    <span className="font-bold text-slate-900 dark:text-white">{formName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">SKU</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formSku}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 block">Category Path</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {buildCategoryPathLabel({
                        mainCategory: formMainCategory,
                        subCategory: formSubCategory,
                        childCategory: formChildCategory,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Brand & Division</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formBrand || 'Generic'} ({formSubBrand})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Reorder Threshold</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formReorderThreshold} units
                    </span>
                  </div>
                  {!isStaff && (
                    <div>
                      <span className="text-slate-400 block">Purchase Price</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ৳{Number(formCostPrice || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block">Selling Price</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ৳{Number(formSellingPrice || 0).toLocaleString()}
                    </span>
                  </div>
                </div>
                {formDescription.trim() && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-400 block">Description</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{formDescription}</p>
                  </div>
                )}
                {formNotes.trim() && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-400 block">Notes</span>
                    <p className="text-slate-700 dark:text-slate-300 mt-0.5">{formNotes}</p>
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Variants ({formVariants.length}) • Total {formVariants.reduce((s, v) => s + (Number(v.stock) || 0), 0)} pcs
                </h4>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto text-xs">
                  {formVariants.map((v, i) => (
                    <div
                      key={v.id}
                      className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        #{i + 1}: {v.color} / {v.model}
                      </span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {v.stock} pcs
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {formImages.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Photos ({formImages.length})
                  </h4>
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {formImages.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`Thumb ${idx + 1}`}
                        className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </form>

        {/* Sticky Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between gap-2.5 sticky bottom-0">
          {wizardStep > 1 ? (
            <button
              type="button"
              disabled={submitting}
              onClick={handlePrevStep}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleCancelForm}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <div className="flex items-center gap-2">
            {editModeProduct && wizardStep < 5 && (
              <button
                type="button"
                disabled={submitting || uploadingImages}
                onClick={(e) => handleFormSubmit(e as any)}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check size={14} />
                <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
              </button>
            )}

            {wizardStep < 5 ? (
              <button
                type="button"
                disabled={submitting || uploadingImages}
                onClick={handleNextStep}
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || uploadingImages}
                onClick={(e) => handleFormSubmit(e as any)}
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>
                      {editModeProduct
                        ? 'Save Changes'
                        : isSuperAdmin
                        ? 'Publish to Catalog'
                        : 'Submit for Review'}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Discard Confirmation */}
      {showDiscardConfirm && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            e.stopPropagation();
            setShowDiscardConfirm(false);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-slate-900 dark:text-white">Discard Unsaved Changes?</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your edits have not been saved yet. Closing now will discard them.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
