import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  RefreshCw,
  GripVertical,
  Copy,
  Grid,
  Archive,
  RotateCcw,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'motion/react';
import Barcode from './Barcode';
import AttributeCombobox from './AttributeCombobox';
import {
  Product,
  Variant,
  Category,
  Brand,
  UserProfile,
  ProductColor,
  ProductModel,
  ProductEditHistoryEntry,
  SubBrand,
  CompanySettings,
  RolePermissionsMap,
} from '../types';
import {
  addProduct,
  updateProduct,
  addProductColor,
  addProductModel,
  getUniqueBarcodeValue,
  logAuditAction,
  addNotification,
  checkProductVariantHasHistory,
} from '../firebase/db';
import {
  uploadProductImage,
  deleteMediaObject,
  buildProductFieldDiff,
  buildCategoryPathLabel,
  normalizeProductImages,
} from '../utils/productImageUpload';
import {
  formatBytesCompact,
  MediaUploadError,
  validateImageUploadFile,
} from '../utils/mediaUpload';
import {
  MAX_VARIANTS_PER_PRODUCT,
  buildVariantUniquenessKey,
  canViewProductCost,
  computeVariantProfitMargin,
  formatPriceRange,
  generateNextVariantSku,
  getProductSellingPriceRange,
  normalizeAttributeCompareKey,
  normalizeAttributeName,
  resolveVariantCostPrice,
  resolveVariantSellingPrice,
} from '../utils/productVariants';
import { useToast } from '../design-system';
import {
  formatBrandBadgeMeta,
  getSellingSubBrands,
  isLegacySatCode,
  normalizeSubBrandCode,
  resolveDefaultSellingSubBrand,
  resolveSubBrandMeta,
} from '../utils/subBrands';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editModeProduct: Product | null;
  /** When true (e.g. reviewer or staff editing a pending item), saving keeps status as pending_review */
  preservePendingStatus?: boolean;
  isStaff: boolean;
  isSuperAdmin: boolean;
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  products: Product[];
  categories: Category[];
  brands: Brand[];
  productColors: ProductColor[];
  productModels: ProductModel[];
  subBrands?: SubBrand[];
  globalBrandFilter?: string;
  companySettings?: CompanySettings | null;
  requireCheckIn?: () => boolean;
  onOpenAttributeManagement?: () => void;
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
  rolePermissions,
  products,
  categories,
  brands,
  productColors,
  productModels,
  subBrands,
  globalBrandFilter,
  companySettings,
  requireCheckIn,
  onOpenAttributeManagement,
  onRefreshData,
  onSaved,
}: ProductFormModalProps) {
  const canViewCost = canViewProductCost(user, rolePermissions) && (!isStaff || user?.permissionOverrides?.viewProductCost === true);
  const hideCostFields = !canViewCost;

  const activeSellingSubBrands = React.useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: false, companySettings }),
    [subBrands, companySettings]
  );
  const defaultSellingSubBrand = React.useMemo(
    () => resolveDefaultSellingSubBrand({ globalBrandFilter, user, subBrands, companySettings }),
    [globalBrandFilter, user, subBrands, companySettings]
  );

  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formMainCategory, setFormMainCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formChildCategory, setFormChildCategory] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formSubBrand, setFormSubBrand] = useState<string>(defaultSellingSubBrand);
  const [formDescription, setFormDescription] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCostPrice, setFormCostPrice] = useState<number | ''>('');
  const [formSellingPrice, setFormSellingPrice] = useState<number | ''>('');
  const [formReorderThreshold, setFormReorderThreshold] = useState<number | ''>(5);
  const toast = useToast();
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formImageThumbs, setFormImageThumbs] = useState<string[]>([]);
  type PhotoUploadStatus = 'preparing' | 'uploading' | 'done' | 'failed';
  interface ProductPhotoItem {
    id: string;
    previewUrl: string;
    url: string;
    thumbUrl?: string;
    storagePath?: string;
    thumbStoragePath?: string;
    isExisting: boolean;
    status: PhotoUploadStatus;
    progress: number;
    sizeBytes?: number;
    originalSizeBytes?: number;
    fallbackUsed?: boolean;
    errorCode?: string;
    errorMessage?: string;
    file?: File;
    abortController?: AbortController;
  }
  const [photoItems, setPhotoItems] = useState<ProductPhotoItem[]>([]);
  const photoItemsRef = useRef<ProductPhotoItem[]>([]);
  const uploadPromisesRef = useRef<Map<string, Promise<ProductPhotoItem | null>>>(new Map());
  const sessionBucketWarnedRef = useRef(false);
  const [dragPhotoIdx, setDragPhotoIdx] = useState<number | null>(null);
  const [waitingForUploads, setWaitingForUploads] = useState(false);
  const [photoFallbackNotice, setPhotoFallbackNotice] = useState('');
  const [brokenImgIndexes, setBrokenImgIndexes] = useState<Record<number, boolean>>({});
  const [formVariants, setFormVariants] = useState<Variant[]>([
    {
      id: '1',
      color: 'Default',
      model: 'Standard',
      stock: 10,
      sameAsProductPrice: true,
    },
  ]);

  const uploadingImages = photoItems.some(
    (p) => p.status === 'preparing' || p.status === 'uploading'
  );
  const hasFailedImages = photoItems.some((p) => p.status === 'failed');

  const commitPhotoItems = (updater: (prev: ProductPhotoItem[]) => ProductPhotoItem[]) => {
    const next = updater(photoItemsRef.current);
    photoItemsRef.current = next;
    setPhotoItems(next);
    const completedUrls = next.filter((p) => p.status === 'done' && p.url).map((p) => p.url);
    const completedThumbs = next
      .filter((p) => p.status === 'done' && p.url)
      .map((p) => p.thumbUrl || p.url);
    setFormImages(completedUrls);
    setFormImageThumbs(completedThumbs);
  };

  const [isSkuDirty, setIsSkuDirty] = useState(false);
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardMaxStep, setWizardMaxStep] = useState<number>(1);
  const [stepErrors, setStepErrors] = useState<{ [key: string]: string }>({});
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showCombGenerator, setShowCombGenerator] = useState(false);
  const [selectedCombColors, setSelectedCombColors] = useState<string[]>(['Default']);
  const [selectedCombModels, setSelectedCombModels] = useState<string[]>(['Standard']);
  const [combDefaultStock, setCombDefaultStock] = useState<number>(0);
  const [combUseProductPrice, setCombUseProductPrice] = useState<boolean>(true);
  const [combCustomSellPrice, setCombCustomSellPrice] = useState<string>('');
  const [combCustomCostPrice, setCombCustomCostPrice] = useState<string>('');
  const [bulkApplySellPrice, setBulkApplySellPrice] = useState<string>('');
  const [bulkApplyCostPrice, setBulkApplyCostPrice] = useState<string>('');
  const [bulkApplyQty, setBulkApplyQty] = useState<string>('');
  const [archiveVariantConfirm, setArchiveVariantConfirm] = useState<{
    variant: Variant;
    reason: string;
  } | null>(null);
  const [checkingVariantId, setCheckingVariantId] = useState<string | null>(null);

  const generateSkuCode = (subBrand: string, category: string, brandName: string) => {
    const meta = resolveSubBrandMeta(subBrand, subBrands, companySettings);
    const normalized = normalizeSubBrandCode(subBrand);
    const div =
      meta?.skuPrefix ||
      meta?.shortCode ||
      (normalized && !isLegacySatCode(normalized) ? normalized : '') ||
      defaultSellingSubBrand ||
      'GZ';

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
    setWaitingForUploads(false);
    setPhotoFallbackNotice('');
    setDragPhotoIdx(null);
    sessionBucketWarnedRef.current = false;
    setShowCombGenerator(false);
    setArchiveVariantConfirm(null);
    setBulkApplySellPrice('');
    setBulkApplyCostPrice('');
    setBulkApplyQty('');

    // Abort & revoke any lingering uploads from prior modal session
    photoItemsRef.current.forEach((p) => {
      try {
        p.abortController?.abort();
      } catch {}
      if (p.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(p.previewUrl);
      }
    });
    uploadPromisesRef.current.clear();

    if (editModeProduct) {
      setIsSkuDirty(true);
      setFormName(editModeProduct.name || '');
      setFormSku(editModeProduct.sku || '');
      setFormMainCategory(editModeProduct.mainCategory || editModeProduct.category || '');
      setFormSubCategory(editModeProduct.subCategory || '');
      setFormChildCategory(editModeProduct.childCategory || '');
      setFormCategory(editModeProduct.category || editModeProduct.mainCategory || '');
      setFormBrand(editModeProduct.brand || '');
      const existingSub = normalizeSubBrandCode(editModeProduct.subBrand);
      setFormSubBrand(existingSub || defaultSellingSubBrand);
      setFormDescription(editModeProduct.description || '');
      setFormNotes(editModeProduct.notes || '');
      setFormCostPrice(editModeProduct.costPrice ?? 0);
      setFormSellingPrice(editModeProduct.sellingPrice ?? '');
      setFormReorderThreshold(editModeProduct.reorderThreshold ?? 5);
      const existingUrls = normalizeProductImages(editModeProduct);
      const existingThumbs = Array.isArray(editModeProduct.imageThumbs) ? editModeProduct.imageThumbs : [];
      const seededItems: ProductPhotoItem[] = existingUrls.map((url, idx) => ({
        id: `existing-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        previewUrl: url,
        url,
        thumbUrl: existingThumbs[idx] || url,
        isExisting: true,
        status: 'done',
        progress: 100,
      }));
      photoItemsRef.current = seededItems;
      setPhotoItems(seededItems);
      setFormImages(existingUrls);
      setFormImageThumbs(existingUrls.map((u, idx) => existingThumbs[idx] || u));
      setFormVariants(
        editModeProduct.variants && editModeProduct.variants.length > 0
          ? editModeProduct.variants.map((v, idx) => {
              const inherits =
                v.sameAsProductPrice !== undefined
                  ? v.sameAsProductPrice
                  : v.sellingPrice === undefined && v.costPrice === undefined;
              return {
                ...v,
                sameAsProductPrice: inherits,
                variantSku:
                  v.variantSku ||
                  `${(editModeProduct.sku || 'SKU').trim().toUpperCase()}-V${idx + 1}`,
                sellingPrice: resolveVariantSellingPrice(editModeProduct, v),
                costPrice: resolveVariantCostPrice(editModeProduct, v),
              };
            })
          : [
              {
                id: Date.now().toString(),
                color: 'Default',
                model: 'Standard',
                stock: 0,
                sameAsProductPrice: true,
                variantSku: `${(editModeProduct.sku || 'SKU').trim().toUpperCase()}-V1`,
              },
            ]
      );
      setWizardStep(1);
      setWizardMaxStep(5);
    } else {
      setIsSkuDirty(false);
      setFormName('');
      const mainCats = categories.filter((c) => c.level === 'main' || !c.level);
      const initialMain = mainCats[0]?.name || '';
      const initialBrand = brands[0]?.name || '';
      const initialSku = generateSkuCode(defaultSellingSubBrand, initialMain, initialBrand);
      setFormMainCategory(initialMain);
      setFormSubCategory('');
      setFormChildCategory('');
      setFormCategory(initialMain);
      setFormBrand(initialBrand);
      setFormSubBrand(defaultSellingSubBrand);
      setFormDescription('');
      setFormNotes('');
      setFormCostPrice(hideCostFields ? 0 : '');
      setFormSellingPrice('');
      setFormReorderThreshold(5);
      photoItemsRef.current = [];
      setPhotoItems([]);
      setFormImages([]);
      setFormImageThumbs([]);
      setFormVariants([
        {
          id: Date.now().toString(),
          color: 'Default',
          model: 'Standard',
          stock: 10,
          sameAsProductPrice: true,
          variantSku: `${initialSku}-V1`,
        },
      ]);
      setWizardStep(1);
      setWizardMaxStep(1);
      setFormSku(initialSku);
    }
  }, [isOpen, editModeProduct?.id, defaultSellingSubBrand]);

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
  }, [isOpen, submitting, formName, formSku, formSubBrand, formMainCategory, formSubCategory, formChildCategory, formBrand, formCostPrice, formSellingPrice, formReorderThreshold, formImages, formDescription, formNotes]);

  if (!isOpen) return null;

  const isPendingEditContext =
    preservePendingStatus || editModeProduct?.status === 'pending_review';

  const validateStep = (step: number): boolean => {
    const errors: { [key: string]: string } = {};

    if (step === 1) {
      if (!formName.trim()) errors.name = 'Product Display Name is required';
      if (!formSku.trim()) errors.sku = 'SKU Code is required';
      if (!formSubBrand || isLegacySatCode(formSubBrand)) {
        errors.subBrand = 'Select an active selling sub-brand (Parent SAT does not sell directly).';
      }
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
      if (!hideCostFields) {
        if (formCostPrice === '') {
          errors.costPrice = 'Purchase Price is required';
        } else if (Number(formCostPrice) < 0) {
          errors.costPrice = 'Purchase Price cannot be negative';
        }
      }
      if (formSellingPrice === '') {
        errors.sellingPrice = 'Selling Price is required';
      } else if (Number(formSellingPrice) < 0) {
        errors.sellingPrice = 'Selling Price cannot be negative';
      } else if (Number(formSellingPrice) === 0 && !formVariants.some((v) => !v.inactive && v.sameAsProductPrice === false && Number(v.sellingPrice) > 0)) {
        errors.sellingPrice = 'Selling Price must be greater than 0';
      }
      if (Number(formReorderThreshold) < 0) {
        errors.reorderThreshold = 'Reorder threshold cannot be negative';
      }
    } else if (step === 3) {
      const activeVariants = formVariants.filter((v) => !v.inactive);
      if (activeVariants.length === 0) {
        errors.variants = 'At least one active variant configuration is required';
      } else if (formVariants.length > MAX_VARIANTS_PER_PRODUCT) {
        errors.variants = `Maximum ${MAX_VARIANTS_PER_PRODUCT} variants allowed per product (currently ${formVariants.length}).`;
      } else {
        const keyMap = new Map<string, number>();
        formVariants.forEach((v, idx) => {
          if (v.inactive) return;
          const cleanColor = normalizeAttributeName(v.color);
          const cleanModel = normalizeAttributeName(v.model);
          if (!cleanColor) {
            errors[`variant-color-${v.id || idx}`] = `Color/Finish is required for Variant #${idx + 1}`;
          }
          if (!cleanModel) {
            errors[`variant-model-${v.id || idx}`] = `Model/Size is required for Variant #${idx + 1}`;
          }
          if (Number(v.stock) < 0) {
            errors[`variant-stock-${v.id || idx}`] = `Stock cannot be negative for Variant #${idx + 1}`;
          }
          const effectiveSell =
            v.sameAsProductPrice !== false ? Number(formSellingPrice || 0) : Number(v.sellingPrice ?? 0);
          const effectiveCost =
            v.sameAsProductPrice !== false ? Number(formCostPrice || 0) : Number(v.costPrice ?? 0);
          if (effectiveSell < 0) {
            errors[`variant-sell-${v.id || idx}`] = `Selling price cannot be negative`;
          }
          if (!hideCostFields && effectiveCost < 0) {
            errors[`variant-cost-${v.id || idx}`] = `Purchase price cannot be negative`;
          }
          if (v.reorderThreshold !== undefined && Number(v.reorderThreshold) < 0) {
            errors[`variant-threshold-${v.id || idx}`] = `Threshold cannot be negative`;
          }

          if (cleanColor && cleanModel) {
            const key = buildVariantUniquenessKey({
              color: cleanColor,
              model: cleanModel,
              variantNote: v.variantNote,
            });
            if (keyMap.has(key)) {
              const dupMsg = `Duplicate variant (${cleanColor} / ${cleanModel}${v.variantNote ? ` / ${v.variantNote}` : ''}). Change color, model, or note.`;
              errors[`variant-dup-${v.id || idx}`] = dupMsg;
              errors.variants = dupMsg;
            } else {
              keyMap.set(key, idx);
            }
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

  const cleanupUnsavedSessionUploads = async () => {
    const items = [...photoItemsRef.current];
    for (const p of items) {
      try {
        p.abortController?.abort();
      } catch {}
      if (p.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(p.previewUrl);
      }
      if (!p.isExisting && (p.storagePath || p.thumbStoragePath)) {
        void deleteMediaObject(p.storagePath, p.thumbStoragePath);
      }
    }
    uploadPromisesRef.current.clear();
  };

  const handleCancelForm = () => {
    const isDirty = editModeProduct
      ? formName !== editModeProduct.name ||
        formSku !== editModeProduct.sku ||
        formSubBrand !== (normalizeSubBrandCode(editModeProduct.subBrand) || defaultSellingSubBrand) ||
        formMainCategory !== (editModeProduct.mainCategory || editModeProduct.category) ||
        formSubCategory !== (editModeProduct.subCategory || '') ||
        formChildCategory !== (editModeProduct.childCategory || '') ||
        formBrand !== editModeProduct.brand ||
        formDescription !== (editModeProduct.description || '') ||
        formNotes !== (editModeProduct.notes || '') ||
        (!isStaff && Number(formCostPrice) !== Number(editModeProduct.costPrice)) ||
        Number(formSellingPrice) !== Number(editModeProduct.sellingPrice) ||
        Number(formReorderThreshold) !== Number(editModeProduct.reorderThreshold) ||
        photoItemsRef.current.some((p) => !p.isExisting) ||
        JSON.stringify(formImages) !== JSON.stringify(normalizeProductImages(editModeProduct)) ||
        JSON.stringify(formVariants) !== JSON.stringify(editModeProduct.variants || [])
      : formName.trim() !== '' ||
        Number(formSellingPrice) > 0 ||
        photoItemsRef.current.length > 0 ||
        formDescription.trim() !== '' ||
        formNotes.trim() !== '' ||
        formVariants.some((v) => v.color !== 'Default' || v.model !== 'Standard');

    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      void cleanupUnsavedSessionUploads();
      onClose();
    }
  };

  const addVariantField = () => {
    if (formVariants.length >= MAX_VARIANTS_PER_PRODUCT) {
      setStepErrors((prev) => ({
        ...prev,
        variants: `Maximum ${MAX_VARIANTS_PER_PRODUCT} variants allowed per product.`,
      }));
      return;
    }
    const nextSku = generateNextVariantSku(formSku || 'SKU', formVariants);
    setFormVariants((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        color: '',
        model: '',
        variantNote: '',
        variantSku: nextSku,
        sameAsProductPrice: true,
        sellingPrice: Number(formSellingPrice || 0),
        costPrice: Number(formCostPrice || 0),
        stock: 0,
      },
    ]);
  };

  const duplicateVariantField = (source: Variant) => {
    if (formVariants.length >= MAX_VARIANTS_PER_PRODUCT) {
      setStepErrors((prev) => ({
        ...prev,
        variants: `Maximum ${MAX_VARIANTS_PER_PRODUCT} variants allowed per product.`,
      }));
      return;
    }
    const nextSku = generateNextVariantSku(formSku || 'SKU', formVariants);
    setFormVariants((prev) => [
      ...prev,
      {
        ...source,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        variantSku: nextSku,
        barcodeValue: undefined,
        reservedQty: undefined,
        reservedForPreOrders: undefined,
        inactive: false,
      },
    ]);
  };

  const handleRequestRemoveVariant = async (variant: Variant) => {
    const activeCount = formVariants.filter((v) => !v.inactive).length;
    if (!variant.inactive && activeCount <= 1) {
      toast.warning('At least 1 active variant is required.');
      return;
    }
    if (editModeProduct?.id) {
      setCheckingVariantId(variant.id);
      try {
        const res = await checkProductVariantHasHistory(editModeProduct.id, variant.id, variant);
        if (res.hasHistory) {
          setArchiveVariantConfirm({
            variant,
            reason: res.reason || 'Variant has stock or sales history.',
          });
          return;
        }
      } finally {
        setCheckingVariantId(null);
      }
    } else if ((Number(variant.stock) || 0) > 0 && formVariants.length <= 1) {
      return;
    }
    setFormVariants((prev) => prev.filter((v) => v.id !== variant.id));
  };

  const confirmArchiveVariant = () => {
    if (!archiveVariantConfirm) return;
    const targetId = archiveVariantConfirm.variant.id;
    setFormVariants((prev) =>
      prev.map((v) => (v.id === targetId ? { ...v, inactive: true, stock: 0 } : v))
    );
    setArchiveVariantConfirm(null);
    toast.success('Variant archived and hidden from new sales.');
  };

  const reactivateVariant = (id: string) => {
    setFormVariants((prev) => prev.map((v) => (v.id === id ? { ...v, inactive: false } : v)));
  };

  const updateVariantFields = (id: string, patch: Partial<Variant>) => {
    setFormVariants((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const handleAddCustomColor = async (color: string): Promise<ProductColor> => {
    const trimmed = normalizeAttributeName(color);
    const existing = productColors.find(
      (c) => normalizeAttributeCompareKey(c.name) === normalizeAttributeCompareKey(trimmed)
    );
    if (existing) {
      return existing;
    }
    const created = await addProductColor(trimmed, '#000000');
    await onRefreshData();
    return created;
  };

  const handleAddCustomSize = async (size: string): Promise<ProductModel> => {
    const trimmed = normalizeAttributeName(size);
    const existing = productModels.find(
      (m) => normalizeAttributeCompareKey(m.name) === normalizeAttributeCompareKey(trimmed)
    );
    if (existing) {
      return existing;
    }
    const created = await addProductModel(trimmed);
    await onRefreshData();
    return created;
  };

  const handleGenerateCombinations = () => {
    const colors = selectedCombColors.map((c) => normalizeAttributeName(c)).filter(Boolean);
    const models = selectedCombModels.map((m) => normalizeAttributeName(m)).filter(Boolean);
    if (colors.length === 0 || models.length === 0) {
      toast.warning('Pick at least one color and one model to generate combinations.');
      return;
    }
    const existingKeys = new Set(
      formVariants.filter((v) => !v.inactive).map((v) => buildVariantUniquenessKey(v))
    );
    const newVariants: Variant[] = [];
    const customSell =
      !combUseProductPrice && combCustomSellPrice !== ''
        ? Math.max(0, Number(combCustomSellPrice) || 0)
        : Number(formSellingPrice || 0);
    const customCost =
      !combUseProductPrice && combCustomCostPrice !== '' && !hideCostFields
        ? Math.max(0, Number(combCustomCostPrice) || 0)
        : Number(formCostPrice || 0);

    for (const c of colors) {
      for (const m of models) {
        const key = buildVariantUniquenessKey({ color: c, model: m, variantNote: '' });
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const allSoFar = [...formVariants, ...newVariants];
        if (allSoFar.length >= MAX_VARIANTS_PER_PRODUCT) {
          toast.warning(`Stopped at ${MAX_VARIANTS_PER_PRODUCT} max variants per product.`);
          break;
        }
        newVariants.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${newVariants.length}`,
          color: c,
          model: m,
          variantNote: '',
          variantSku: generateNextVariantSku(formSku || 'SKU', allSoFar),
          sameAsProductPrice: combUseProductPrice,
          sellingPrice: customSell,
          costPrice: customCost,
          stock: Math.max(0, Number(combDefaultStock) || 0),
        });
      }
      if (formVariants.length + newVariants.length >= MAX_VARIANTS_PER_PRODUCT) break;
    }

    if (newVariants.length === 0) {
      toast.info('All selected combinations already exist.');
      return;
    }
    // Replace single untouched default stub if user didn't customize it
    const shouldReplaceUntouchedStub =
      formVariants.length === 1 &&
      !editModeProduct &&
      formVariants[0].color === 'Default' &&
      formVariants[0].model === 'Standard' &&
      !formVariants[0].variantNote &&
      newVariants.length > 0 &&
      !(colors.includes('Default') && models.includes('Standard'));

    if (shouldReplaceUntouchedStub) {
      setFormVariants(
        newVariants.map((v, idx) => ({
          ...v,
          variantSku: `${(formSku || 'SKU').trim().toUpperCase()}-V${idx + 1}`,
        }))
      );
    } else {
      setFormVariants((prev) => [...prev, ...newVariants]);
    }
    setShowCombGenerator(false);
    setStepErrors({});
    toast.success(`Added ${newVariants.length} variant combination(s).`);
  };

  const handleBulkApplyPriceToAll = () => {
    const sellVal = bulkApplySellPrice.trim();
    const costVal = bulkApplyCostPrice.trim();
    if (sellVal === '' && costVal === '') return;
    const nextSell = sellVal !== '' ? Math.max(0, Number(sellVal) || 0) : undefined;
    const nextCost = !hideCostFields && costVal !== '' ? Math.max(0, Number(costVal) || 0) : undefined;
    setFormVariants((prev) =>
      prev.map((v) => {
        if (v.inactive) return v;
        return {
          ...v,
          sameAsProductPrice: false,
          sellingPrice: nextSell !== undefined ? nextSell : resolveVariantSellingPrice(Number(formSellingPrice || 0), v),
          costPrice: nextCost !== undefined ? nextCost : resolveVariantCostPrice(Number(formCostPrice || 0), v),
        };
      })
    );
    toast.success('Applied price to all active variants.');
  };

  const handleBulkApplyQuantityToAll = () => {
    if (bulkApplyQty.trim() === '') return;
    const nextQty = Math.max(0, Number(bulkApplyQty) || 0);
    setFormVariants((prev) =>
      prev.map((v) => (v.inactive ? v : { ...v, stock: nextQty }))
    );
    toast.success(`Set stock quantity to ${nextQty} for all active variants.`);
  };

  const startUploadForPhotoItem = (item: ProductPhotoItem): Promise<ProductPhotoItem | null> => {
    const file = item.file;
    if (!file) return Promise.resolve(item);
    const controller = item.abortController || new AbortController();

    const promise = (async (): Promise<ProductPhotoItem | null> => {
      try {
        const res = await uploadProductImage(file, formSku || formName || 'product', {
          signal: controller.signal,
          onPhase: (phase) => {
            commitPhotoItems((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, status: phase } : p))
            );
          },
          onProgress: (pct) => {
            commitPhotoItems((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, progress: pct } : p))
            );
          },
        });

        if (controller.signal.aborted || !photoItemsRef.current.some((p) => p.id === item.id)) {
          if (res.storageUploaded && (res.storagePath || res.thumbStoragePath)) {
            void deleteMediaObject(res.storagePath, res.thumbStoragePath);
          }
          return null;
        }

        if (res.fallbackUsed && res.errorMessage) {
          setPhotoFallbackNotice(res.errorMessage);
          if (!sessionBucketWarnedRef.current) {
            sessionBucketWarnedRef.current = true;
            toast.warning(res.errorMessage);
          }
        }

        let updatedEntry: ProductPhotoItem | null = null;
        commitPhotoItems((prev) =>
          prev.map((p) => {
            if (p.id !== item.id) return p;
            updatedEntry = {
              ...p,
              url: res.url,
              thumbUrl: res.thumbUrl || res.url,
              storagePath: res.storagePath,
              thumbStoragePath: res.thumbStoragePath,
              status: 'done',
              progress: 100,
              sizeBytes: res.sizeBytes,
              originalSizeBytes: res.originalSizeBytes,
              fallbackUsed: res.fallbackUsed,
              errorCode: undefined,
              errorMessage: undefined,
            };
            return updatedEntry;
          })
        );
        return updatedEntry;
      } catch (err: any) {
        if (controller.signal.aborted || err?.code === 'storage/canceled') {
          return null;
        }
        const errCode = err instanceof MediaUploadError ? err.code : String(err?.code || 'upload-failed');
        const errMsg = err?.message || `Failed to upload "${file.name}".`;
        console.error('[ProductFormModal] Photo upload failed:', { id: item.id, errCode, errMsg, err });
        toast.error(`Photo upload failed (${errCode}): ${errMsg}`);
        commitPhotoItems((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? {
                  ...p,
                  status: 'failed',
                  errorCode: errCode,
                  errorMessage: errMsg,
                }
              : p
          )
        );
        return null;
      } finally {
        uploadPromisesRef.current.delete(item.id);
      }
    })();

    uploadPromisesRef.current.set(item.id, promise);
    return promise;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    e.target.value = '';
    if (files.length === 0) return;

    setFormError('');
    const rejectedErrors: string[] = [];
    const acceptedEntries: ProductPhotoItem[] = [];

    files.forEach((file, idx) => {
      const validationErr = validateImageUploadFile(file);
      if (validationErr) {
        rejectedErrors.push(validationErr);
        return;
      }
      const controller = new AbortController();
      const previewUrl = URL.createObjectURL(file);
      acceptedEntries.push({
        id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        previewUrl,
        url: '',
        isExisting: false,
        status: 'preparing',
        progress: 5,
        originalSizeBytes: file.size,
        file,
        abortController: controller,
      });
    });

    if (rejectedErrors.length > 0) {
      const msg = rejectedErrors.join(' ');
      setFormError(msg);
      toast.error(msg);
    }

    if (acceptedEntries.length === 0) return;

    // Instant preview immediately; Continue & Save stay enabled while uploading in background
    commitPhotoItems((prev) => [...prev, ...acceptedEntries]);
    acceptedEntries.forEach((entry) => {
      void startUploadForPhotoItem(entry);
    });
  };

  const retryPhotoUpload = (photoId: string) => {
    const target = photoItemsRef.current.find((p) => p.id === photoId);
    if (!target || !target.file) return;
    const nextController = new AbortController();
    let restarted: ProductPhotoItem | null = null;
    commitPhotoItems((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p;
        restarted = {
          ...p,
          status: 'preparing',
          progress: 5,
          errorCode: undefined,
          errorMessage: undefined,
          abortController: nextController,
        };
        return restarted;
      })
    );
    if (restarted) {
      void startUploadForPhotoItem(restarted);
    }
  };

  const moveImage = (fromIdx: number, toIdx: number) => {
    const len = photoItemsRef.current.length;
    if (toIdx < 0 || toIdx >= len || fromIdx === toIdx) return;
    commitPhotoItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setBrokenImgIndexes({});
  };

  const setAsPrimaryImage = (idx: number) => {
    if (idx <= 0 || idx >= photoItemsRef.current.length) return;
    moveImage(idx, 0);
  };

  const removeImage = (idx: number) => {
    const target = photoItemsRef.current[idx];
    if (!target) return;
    try {
      target.abortController?.abort();
    } catch {}
    uploadPromisesRef.current.delete(target.id);
    if (target.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(target.previewUrl);
    }
    if (!target.isExisting && (target.storagePath || target.thumbStoragePath)) {
      void deleteMediaObject(target.storagePath, target.thumbStoragePath);
    }
    commitPhotoItems((prev) => prev.filter((_, i) => i !== idx));
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

    if (submitting || waitingForUploads) return;
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
      if (v.inactive) continue;
      const cleanColor = normalizeAttributeName(v.color);
      const cleanModel = normalizeAttributeName(v.model);
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

    // Block only failed photos; if background uploads are still running, wait cleanly for them
    const currentFailed = photoItemsRef.current.filter((p) => p.status === 'failed');
    if (currentFailed.length > 0) {
      setFormError(
        `${currentFailed.length} photo(s) failed to upload (${currentFailed[0].errorCode || 'error'}). Please Retry or Remove the failed photo(s) before saving.`
      );
      setWizardStep(4);
      return;
    }

    const pendingPromises = Array.from(uploadPromisesRef.current.values());
    if (pendingPromises.length > 0) {
      setWaitingForUploads(true);
      try {
        await Promise.all(pendingPromises);
      } finally {
        setWaitingForUploads(false);
      }
    }

    const postWaitFailed = photoItemsRef.current.filter((p) => p.status === 'failed');
    if (postWaitFailed.length > 0) {
      setFormError(
        `${postWaitFailed.length} photo(s) failed to upload (${postWaitFailed[0].errorCode || 'error'}). Please Retry or Remove the failed photo(s) before saving.`
      );
      setWizardStep(4);
      return;
    }

    setSubmitting(true);

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

    const effectiveSubBrand =
      normalizeSubBrandCode(formSubBrand) && !isLegacySatCode(formSubBrand)
        ? normalizeSubBrandCode(formSubBrand)
        : defaultSellingSubBrand;
    const skuBrandPrefix =
      resolveSubBrandMeta(effectiveSubBrand, subBrands, companySettings)?.skuPrefix ||
      effectiveSubBrand;

    let mainBarcodeValue = editModeProduct?.barcodeValue;
    if (needsMigration(mainBarcodeValue, finalSku)) {
      mainBarcodeValue = getUniqueBarcodeValue(skuBrandPrefix, products, generatedInSession);
      generatedInSession.add(mainBarcodeValue);
    }

    const effectiveCostPrice = hideCostFields
      ? Number(editModeProduct?.costPrice ?? 0)
      : Number(formCostPrice || 0);
    const effectiveSellingPrice = Number(formSellingPrice || 0);

    const updatedVariants: Variant[] = formVariants.map((v, idx) => {
      const cleanColor = normalizeAttributeName(v.color) || 'Default';
      const cleanModel = normalizeAttributeName(v.model) || 'Standard';
      const cleanNote = normalizeAttributeName(v.variantNote);
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
        vBarcodeValue = getUniqueBarcodeValue(skuBrandPrefix, products, generatedInSession);
        generatedInSession.add(vBarcodeValue);
      }

      const inherits = v.sameAsProductPrice !== false;
      const resolvedSell = inherits
        ? effectiveSellingPrice
        : Math.max(0, Number(v.sellingPrice ?? effectiveSellingPrice) || 0);
      const resolvedCost = hideCostFields
        ? Number(existingV?.costPrice ?? effectiveCostPrice)
        : inherits
        ? effectiveCostPrice
        : Math.max(0, Number(v.costPrice ?? effectiveCostPrice) || 0);

      const preservedReserved = Number(existingV?.reservedQty ?? v.reservedQty) || 0;
      const vSku = (v.variantSku || '').trim().toUpperCase() || `${finalSku}-V${idx + 1}`;
      return {
        ...v,
        color: cleanColor,
        model: cleanModel,
        ...(cleanNote ? { variantNote: cleanNote } : { variantNote: undefined }),
        variantSku: vSku,
        sameAsProductPrice: inherits,
        sellingPrice: resolvedSell,
        costPrice: resolvedCost,
        ...(v.reorderThreshold !== undefined && v.reorderThreshold !== null && String(v.reorderThreshold) !== ''
          ? { reorderThreshold: Math.max(0, Number(v.reorderThreshold) || 0) }
          : { reorderThreshold: undefined }),
        ...(v.inactive ? { inactive: true } : { inactive: undefined }),
        stock: v.inactive ? 0 : Math.max(0, Number(v.stock) || 0),
        ...(preservedReserved > 0 ? { reservedQty: preservedReserved } : {}),
        barcodeValue: vBarcodeValue,
      };
    });

    const finalizedPhotos = photoItemsRef.current.filter((p) => p.status === 'done' && p.url);
    const cleanImages = finalizedPhotos.map((p) => p.url);
    const cleanThumbs = finalizedPhotos.map((p) => p.thumbUrl || p.url);
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
      subBrand: effectiveSubBrand,
      subBrandId: effectiveSubBrand,
      costPrice: effectiveCostPrice,
      sellingPrice: effectiveSellingPrice,
      reorderThreshold: Number(formReorderThreshold || 0),
      images: cleanImages,
      imageUrls: cleanImages,
      ...(cleanThumbs.length > 0 ? { imageThumbs: cleanThumbs } : {}),
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
        const changes = buildProductFieldDiff(editModeProduct, basePayload, canViewCost);
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
          (canViewCost && Number(editModeProduct.costPrice) !== effectiveCostPrice) ||
          Number(editModeProduct.sellingPrice) !== effectiveSellingPrice;
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
            subBrand: effectiveSubBrand,
            forRoles: ['superadmin', 'admin'],
          });
        }

        successMsg =
          finalStatus === 'pending_review'
            ? 'New product submitted for review and approval!'
            : 'New product published to catalog!';
      }

      setFormSuccess(successMsg);
      photoItemsRef.current.forEach((p) => {
        if (p.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(p.previewUrl);
        }
      });
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-product-form-modal="true"
      className="fixed inset-0 z-[80] flex justify-end bg-slate-950/60 backdrop-blur-xs"
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
                    Selling Sub-Brand <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formSubBrand}
                    onChange={(e) => {
                      setFormSubBrand(e.target.value);
                      if (stepErrors.subBrand) setStepErrors((prev) => ({ ...prev, subBrand: '' }));
                    }}
                    className={`w-full bg-white dark:bg-slate-900 border rounded-xl py-2.5 px-3 text-sm text-slate-900 dark:text-slate-100 cursor-pointer ${
                      stepErrors.subBrand
                        ? 'border-rose-400 focus:ring-rose-400/20'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {isLegacySatCode(formSubBrand) && (
                      <option value="SAT" disabled>
                        Legacy (SAT) — Assign Selling Sub-Brand
                      </option>
                    )}
                    {!formSubBrand && (
                      <option value="">-- Select Selling Sub-Brand --</option>
                    )}
                    {activeSellingSubBrands.map((sb) => (
                      <option key={sb.shortCode} value={sb.shortCode}>
                        {sb.name} ({sb.shortCode})
                      </option>
                    ))}
                    {editModeProduct?.subBrand &&
                      !isLegacySatCode(editModeProduct.subBrand) &&
                      !activeSellingSubBrands.some(
                        (s) => s.shortCode === normalizeSubBrandCode(editModeProduct.subBrand)
                      ) && (
                        <option value={normalizeSubBrandCode(editModeProduct.subBrand)}>
                          {formatBrandBadgeMeta(editModeProduct.subBrand, subBrands, companySettings).label}
                        </option>
                      )}
                  </select>
                  {isLegacySatCode(editModeProduct?.subBrand) && (
                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-1">
                      Parent company SAT does not sell directly. Pick a selling sub-brand (existing SKU &amp; barcode stay unchanged).
                    </p>
                  )}
                  {stepErrors.subBrand && (
                    <p className="text-xs font-semibold text-rose-500 mt-1">{stepErrors.subBrand}</p>
                  )}
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
                      placeholder={`${defaultSellingSubBrand}-GEN-PRO-001`}
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
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/50 text-[11px] text-amber-800 dark:text-amber-300">
                Default product-level price &amp; threshold. In Step 3, any variant can inherit these automatically or set its own custom price.
              </div>
              <div className={`grid ${hideCostFields ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
                {!hideCostFields && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                      Default Purchase Price <span className="text-rose-500">*</span>
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
                    Default Selling Price <span className="text-rose-500">*</span>
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

              {!hideCostFields && Number(formSellingPrice) > 0 && (
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
                  Default Reorder Alert Threshold (Units)
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
              className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4 sm:p-5 rounded-2xl space-y-4"
            >
              <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">
                      Variants &amp; Per-Variant Pricing ({formVariants.filter((v) => !v.inactive).length})
                    </h3>
                    {onOpenAttributeManagement && (
                      <button
                        type="button"
                        onClick={onOpenAttributeManagement}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                      >
                        Manage <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Type to search or add new colors/models inline. Set per-variant prices or inherit defaults.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCombGenerator((prev) => !prev)}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 border cursor-pointer transition-colors ${
                      showCombGenerator
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 border-slate-900 dark:border-slate-100'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-amber-400'
                    }`}
                  >
                    <Grid size={12} /> Generate Combinations
                  </button>
                  <button
                    type="button"
                    onClick={addVariantField}
                    disabled={formVariants.length >= MAX_VARIANTS_PER_PRODUCT}
                    className="text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Plus size={12} /> Add Variant
                  </button>
                </div>
              </div>

              {/* Generate Combinations Panel */}
              {showCombGenerator && (
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/70 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      Combination Generator
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCombGenerator(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                        Select Colors ({selectedCombColors.length})
                      </span>
                      <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        {Array.from(
                          new Map(
                            [
                              { id: 'builtin-default', name: 'Default' },
                              ...productColors,
                            ].map((c) => [normalizeAttributeCompareKey(c.name), c])
                          ).values()
                        ).map((c) => {
                          const checked = selectedCombColors.some(
                            (sc) => normalizeAttributeCompareKey(sc) === normalizeAttributeCompareKey(c.name)
                          );
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                setSelectedCombColors((prev) =>
                                  checked
                                    ? prev.filter(
                                        (x) => normalizeAttributeCompareKey(x) !== normalizeAttributeCompareKey(c.name)
                                      )
                                    : [...prev, c.name]
                                )
                              }
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-amber-400 text-slate-950 border-amber-500'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                        Select Models / Sizes ({selectedCombModels.length})
                      </span>
                      <div className="max-h-32 overflow-y-auto flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                        {Array.from(
                          new Map(
                            [
                              { id: 'builtin-std', name: 'Standard' },
                              ...productModels,
                            ].map((m) => [normalizeAttributeCompareKey(m.name), m])
                          ).values()
                        ).map((m) => {
                          const checked = selectedCombModels.some(
                            (sm) => normalizeAttributeCompareKey(sm) === normalizeAttributeCompareKey(m.name)
                          );
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setSelectedCombModels((prev) =>
                                  checked
                                    ? prev.filter(
                                        (x) => normalizeAttributeCompareKey(x) !== normalizeAttributeCompareKey(m.name)
                                      )
                                    : [...prev, m.name]
                                )
                              }
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer transition-colors ${
                                checked
                                  ? 'bg-amber-400 text-slate-950 border-amber-500'
                                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}
                            >
                              {m.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 block">
                        Default Qty
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={combDefaultStock}
                        onChange={(e) => setCombDefaultStock(Math.max(0, Number(e.target.value) || 0))}
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs font-mono"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer pb-1.5">
                      <input
                        type="checkbox"
                        checked={combUseProductPrice}
                        onChange={(e) => setCombUseProductPrice(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Use product price
                    </label>
                    {!combUseProductPrice && (
                      <>
                        {!hideCostFields && (
                          <div>
                            <label className="text-[10px] font-bold uppercase text-slate-500 block">
                              Cost (৳)
                            </label>
                            <input
                              type="number"
                              min={0}
                              placeholder={String(formCostPrice || 0)}
                              value={combCustomCostPrice}
                              onChange={(e) => setCombCustomCostPrice(e.target.value)}
                              className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-mono"
                            />
                          </div>
                        )}
                        <div>
                          <label className="text-[10px] font-bold uppercase text-slate-500 block">
                            Sell (৳)
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder={String(formSellingPrice || 0)}
                            value={combCustomSellPrice}
                            onChange={(e) => setCombCustomSellPrice(e.target.value)}
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-mono"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500 font-medium">
                      Will generate up to{' '}
                      <strong className="text-slate-900 dark:text-white">
                        {selectedCombColors.length * selectedCombModels.length}
                      </strong>{' '}
                      combinations (max {MAX_VARIANTS_PER_PRODUCT} total).
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateCombinations}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-lg text-xs cursor-pointer"
                    >
                      Generate ({selectedCombColors.length * selectedCombModels.length})
                    </button>
                  </div>
                </div>
              )}

              {/* Bulk Quick Apply Strip (shows when >= 2 active variants) */}
              {formVariants.filter((v) => !v.inactive).length >= 2 && (
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="flex items-end gap-1.5">
                    {!hideCostFields && (
                      <div className="flex-1 min-w-0">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block">
                          Cost (৳)
                        </label>
                        <input
                          type="number"
                          min={0}
                          placeholder="All"
                          value={bulkApplyCostPrice}
                          onChange={(e) => setBulkApplyCostPrice(e.target.value)}
                          className="mt-0.5 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-mono"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">
                        Sell (৳)
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="All"
                        value={bulkApplySellPrice}
                        onChange={(e) => setBulkApplySellPrice(e.target.value)}
                        className="mt-0.5 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBulkApplyPriceToAll}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold text-[11px] hover:bg-slate-800 shrink-0 cursor-pointer"
                    >
                      Apply price to all
                    </button>
                  </div>

                  <div className="flex items-end gap-1.5">
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block">
                        Stock Qty
                      </label>
                      <input
                        type="number"
                        min={0}
                        placeholder="Qty for all"
                        value={bulkApplyQty}
                        onChange={(e) => setBulkApplyQty(e.target.value)}
                        className="mt-0.5 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-1.5 px-2 text-xs font-mono"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleBulkApplyQuantityToAll}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold text-[11px] hover:bg-slate-800 shrink-0 cursor-pointer"
                    >
                      Apply quantity to all
                    </button>
                  </div>
                </div>
              )}

              {stepErrors.variants && (
                <p className="text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl">
                  {stepErrors.variants}
                </p>
              )}

              <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                {formVariants.map((variant, index) => {
                  const isArchivedVariant = Boolean(variant.inactive);
                  const inheritsProductPrice = variant.sameAsProductPrice !== false;
                  const effectiveSell = inheritsProductPrice
                    ? Number(formSellingPrice || 0)
                    : Number(variant.sellingPrice ?? formSellingPrice ?? 0);
                  const effectiveCost = inheritsProductPrice
                    ? Number(formCostPrice || 0)
                    : Number(variant.costPrice ?? formCostPrice ?? 0);
                  const { profit: vProfit, marginPercent: vMargin, isLoss } =
                    computeVariantProfitMargin(effectiveSell, effectiveCost);

                  if (isArchivedVariant) {
                    return (
                      <div
                        key={variant.id}
                        className="p-3 bg-slate-100/80 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between gap-2 opacity-80"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                            <Archive size={13} className="text-slate-400 shrink-0" />
                            <span className="truncate">
                              {variant.color} / {variant.model}
                              {variant.variantNote ? ` (${variant.variantNote})` : ''}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-500">
                              Archived
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Hidden from new orders while preserving historical reports.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => reactivateVariant(variant.id)}
                          className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 hover:border-amber-400 flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <RotateCcw size={11} /> Reactivate
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={variant.id}
                      className={`p-3.5 bg-white dark:bg-slate-900 rounded-xl border space-y-3 ${
                        stepErrors[`variant-dup-${variant.id}`]
                          ? 'border-rose-400 ring-2 ring-rose-400/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                            Variant #{index + 1}
                          </span>
                          {variant.variantSku && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                              {variant.variantSku}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={inheritsProductPrice}
                              onChange={(e) => {
                                const useSame = e.target.checked;
                                updateVariantFields(variant.id, {
                                  sameAsProductPrice: useSame,
                                  sellingPrice: Number(formSellingPrice || 0),
                                  costPrice: Number(formCostPrice || 0),
                                });
                              }}
                              className="rounded border-slate-300"
                            />
                            Same price as product
                          </label>
                          <button
                            type="button"
                            onClick={() => duplicateVariantField(variant)}
                            title="Duplicate Variant"
                            className="p-1 text-slate-400 hover:text-amber-500 cursor-pointer"
                          >
                            <Copy size={14} />
                          </button>
                          {formVariants.filter((v) => !v.inactive).length > 1 && (
                            <button
                              type="button"
                              disabled={checkingVariantId === variant.id}
                              onClick={() => void handleRequestRemoveVariant(variant)}
                              className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer disabled:opacity-40"
                              title="Remove or Archive Variant"
                            >
                              {checkingVariantId === variant.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Color / Finish <span className="text-rose-500">*</span>
                          </label>
                          <AttributeCombobox
                            value={variant.color}
                            options={productColors}
                            builtinDefault="Default"
                            placeholder="Select or add color..."
                            searchPlaceholder="Search or + Add color..."
                            hasError={Boolean(stepErrors[`variant-color-${variant.id}`])}
                            onChange={(val) => {
                              updateVariantFields(variant.id, { color: val });
                              setStepErrors((prev) => ({
                                ...prev,
                                [`variant-color-${variant.id}`]: '',
                                [`variant-dup-${variant.id}`]: '',
                                variants: '',
                              }));
                            }}
                            onCreateNew={handleAddCustomColor}
                          />
                          {stepErrors[`variant-color-${variant.id}`] && (
                            <p className="text-[11px] font-semibold text-rose-500 mt-1">
                              {stepErrors[`variant-color-${variant.id}`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Model / Size <span className="text-rose-500">*</span>
                          </label>
                          <AttributeCombobox
                            value={variant.model}
                            options={productModels}
                            builtinDefault="Standard"
                            placeholder="Select or add model..."
                            searchPlaceholder="Search or + Add model..."
                            hasError={Boolean(stepErrors[`variant-model-${variant.id}`])}
                            onChange={(val) => {
                              updateVariantFields(variant.id, { model: val });
                              setStepErrors((prev) => ({
                                ...prev,
                                [`variant-model-${variant.id}`]: '',
                                [`variant-dup-${variant.id}`]: '',
                                variants: '',
                              }));
                            }}
                            onCreateNew={handleAddCustomSize}
                          />
                          {stepErrors[`variant-model-${variant.id}`] && (
                            <p className="text-[11px] font-semibold text-rose-500 mt-1">
                              {stepErrors[`variant-model-${variant.id}`]}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Variant Note (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder='e.g. "with box", "EU plug"'
                            value={variant.variantNote || ''}
                            onChange={(e) => {
                              updateVariantFields(variant.id, { variantNote: e.target.value });
                              setStepErrors((prev) => ({
                                ...prev,
                                [`variant-dup-${variant.id}`]: '',
                                variants: '',
                              }));
                            }}
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Variant SKU (Editable)
                          </label>
                          <input
                            type="text"
                            placeholder={`${formSku || 'SKU'}-V${index + 1}`}
                            value={variant.variantSku || ''}
                            onChange={(e) =>
                              updateVariantFields(variant.id, {
                                variantSku: e.target.value.toUpperCase(),
                              })
                            }
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs font-mono uppercase text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      {/* Per-variant pricing, stock & threshold */}
                      <div className={`grid ${hideCostFields ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'} gap-2.5`}>
                        {!hideCostFields && (
                          <div>
                            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                              Purchase Price (৳)
                            </label>
                            <input
                              type="number"
                              min={0}
                              disabled={inheritsProductPrice}
                              value={effectiveCost}
                              onChange={(e) =>
                                updateVariantFields(variant.id, {
                                  sameAsProductPrice: false,
                                  costPrice: e.target.value === '' ? 0 : Number(e.target.value),
                                })
                              }
                              className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60"
                            />
                            {stepErrors[`variant-cost-${variant.id}`] && (
                              <p className="text-[10px] font-semibold text-rose-500 mt-0.5">
                                {stepErrors[`variant-cost-${variant.id}`]}
                              </p>
                            )}
                          </div>
                        )}

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Selling Price (৳)
                          </label>
                          <input
                            type="number"
                            min={0}
                            disabled={inheritsProductPrice}
                            value={effectiveSell}
                            onChange={(e) =>
                              updateVariantFields(variant.id, {
                                sameAsProductPrice: false,
                                sellingPrice: e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 disabled:opacity-60"
                          />
                          {stepErrors[`variant-sell-${variant.id}`] && (
                            <p className="text-[10px] font-semibold text-rose-500 mt-0.5">
                              {stepErrors[`variant-sell-${variant.id}`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Stock Qty
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={variant.stock}
                            onChange={(e) =>
                              updateVariantFields(variant.id, {
                                stock: e.target.value === '' ? 0 : Number(e.target.value),
                              })
                            }
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-mono font-bold text-slate-900 dark:text-slate-100"
                          />
                          {stepErrors[`variant-stock-${variant.id}`] && (
                            <p className="text-[10px] font-semibold text-rose-500 mt-0.5">
                              {stepErrors[`variant-stock-${variant.id}`]}
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                            Low-Stock Alert
                          </label>
                          <input
                            type="number"
                            min={0}
                            placeholder={String(formReorderThreshold || 5)}
                            value={variant.reorderThreshold ?? ''}
                            onChange={(e) =>
                              updateVariantFields(variant.id, {
                                reorderThreshold:
                                  e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-2.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      </div>

                      {!hideCostFields && effectiveSell > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] border-t border-slate-100 dark:border-slate-800">
                          <span className="text-slate-500 font-medium">
                            Profit:{' '}
                            <strong
                              className={`font-mono ${
                                vProfit >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              ৳{vProfit.toLocaleString()}
                            </strong>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold ${
                              vMargin > 0
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                : vMargin < 0
                                ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {vMargin}% {vMargin < 0 ? 'Loss' : 'Margin'}
                          </span>
                        </div>
                      )}

                      {!hideCostFields && isLoss && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                          <AlertTriangle size={13} className="shrink-0" />
                          <span>Selling price (৳{effectiveSell}) is lower than purchase price (৳{effectiveCost}).</span>
                        </div>
                      )}

                      {stepErrors[`variant-dup-${variant.id}`] && (
                        <p className="text-[11px] font-semibold text-rose-500">
                          {stepErrors[`variant-dup-${variant.id}`]}
                        </p>
                      )}
                    </div>
                  );
                })}
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
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      Product Photos ({photoItems.length})
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Drag or use arrows to reorder. First photo is Cover. Continue stays unlocked while uploading.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    {(() => {
                      const totalCompressedBytes = photoItems.reduce((s, p) => s + (p.sizeBytes || 0), 0);
                      return totalCompressedBytes > 0 ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {formatBytesCompact(totalCompressedBytes)} uploaded
                        </span>
                      ) : null;
                    })()}
                    {uploadingImages && (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-600 dark:text-amber-400">
                        <Loader2 size={13} className="animate-spin" />
                        Uploading in background...
                      </span>
                    )}
                  </div>
                </div>

                {photoFallbackNotice && (
                  <div className="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{photoFallbackNotice}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {photoItems.map((item, idx) => {
                    const displaySrc = item.previewUrl || item.url;
                    const isActiveUpload = item.status === 'preparing' || item.status === 'uploading';
                    const isFailed = item.status === 'failed';
                    return (
                      <div
                        key={item.id}
                        draggable={!submitting}
                        onDragStart={() => setDragPhotoIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragPhotoIdx !== null && dragPhotoIdx !== idx) {
                            moveImage(dragPhotoIdx, idx);
                          }
                          setDragPhotoIdx(null);
                        }}
                        onDragEnd={() => setDragPhotoIdx(null)}
                        className={`relative group aspect-square rounded-xl overflow-hidden border bg-white dark:bg-slate-900 transition-all ${
                          isFailed
                            ? 'border-rose-500 ring-2 ring-rose-500/30'
                            : isActiveUpload
                            ? 'border-amber-400'
                            : dragPhotoIdx === idx
                            ? 'border-amber-500 opacity-60 scale-95'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {brokenImgIndexes[idx] ? (
                          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-slate-100 dark:bg-slate-800 text-slate-400">
                            <ImageOff size={18} />
                            <span className="text-[10px] mt-1 font-semibold">Load error</span>
                          </div>
                        ) : (
                          <img
                            src={displaySrc}
                            alt={`Product ${idx + 1}`}
                            className={`w-full h-full object-cover ${isActiveUpload ? 'opacity-80' : ''}`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImgIndexes((prev) => ({ ...prev, [idx]: true }))
                            }
                          />
                        )}

                        {idx === 0 && (
                          <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-black uppercase shadow-xs">
                            Cover
                          </span>
                        )}

                        {!isActiveUpload && !isFailed && (
                          <span
                            title={item.fallbackUsed ? 'Compact <=40KB fallback' : 'Upload complete'}
                            className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 shadow-xs ${
                              item.fallbackUsed
                                ? 'bg-amber-500/90 text-slate-950'
                                : 'bg-emerald-600/90 text-white'
                            }`}
                          >
                            <Check size={10} />
                            {item.sizeBytes ? formatBytesCompact(item.sizeBytes) : item.fallbackUsed ? '40KB' : 'Done'}
                          </span>
                        )}

                        {isActiveUpload && (
                          <div className="absolute inset-x-0 top-7 mx-1.5 px-2 py-1 rounded-lg bg-slate-950/80 text-white text-[10px] font-mono font-bold text-center shadow">
                            <div className="w-full h-1 bg-slate-700 rounded-full overflow-hidden mb-1">
                              <div
                                className="h-full bg-amber-400 transition-all duration-150"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                            {item.status === 'preparing' ? 'Compressing...' : `Uploading ${item.progress}%`}
                          </div>
                        )}

                        {isFailed && (
                          <div className="absolute inset-0 bg-slate-950/80 p-2 flex flex-col items-center justify-center text-center text-white gap-1.5">
                            <AlertCircle size={16} className="text-rose-400 shrink-0" />
                            <span className="text-[9px] font-mono text-rose-300 leading-tight line-clamp-2">
                              {item.errorCode || 'Failed'}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              <button
                                type="button"
                                onClick={() => retryPhotoUpload(item.id)}
                                className="px-2 py-1 rounded bg-amber-400 hover:bg-amber-500 text-slate-950 text-[10px] font-black inline-flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw size={10} /> Retry
                              </button>
                              <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        )}

                        {!isFailed && (
                          <div className="absolute inset-x-0 bottom-0 p-1 bg-slate-950/75 flex items-center justify-between gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-0.5">
                              <span className="p-0.5 text-slate-300 cursor-grab hidden sm:inline-flex" title="Drag to reorder">
                                <GripVertical size={12} />
                              </span>
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
                                disabled={idx === photoItems.length - 1}
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
                        )}
                      </div>
                    );
                  })}

                  <label className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 cursor-pointer transition-colors">
                    <Upload size={18} />
                    <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">
                      Add Photo
                    </span>
                    <span className="text-[9px] text-slate-400 mt-0.5">Max 8 MB</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.heic,.heif"
                      multiple
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
                    <span className="text-slate-400 block">Brand &amp; Selling Sub-Brand</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formBrand || 'Generic'} ({formatBrandBadgeMeta(formSubBrand, subBrands, companySettings).label})
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Reorder Threshold</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {formReorderThreshold} units
                    </span>
                  </div>
                  {!hideCostFields && (
                    <div>
                      <span className="text-slate-400 block">Default Purchase Price</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ৳{Number(formCostPrice || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400 block">Selling Price (Range)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {formatPriceRange(
                        getProductSellingPriceRange({
                          sellingPrice: Number(formSellingPrice || 0),
                          variants: formVariants,
                        })
                      )}
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
                  Variants ({formVariants.filter((v) => !v.inactive).length} active) • Total{' '}
                  {formVariants.filter((v) => !v.inactive).reduce((s, v) => s + (Number(v.stock) || 0), 0)} pcs
                </h4>
                <div className="overflow-x-auto max-h-[210px] border border-slate-100 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-mono">
                      <tr>
                        <th className="py-1.5 px-2.5">Variant</th>
                        <th className="py-1.5 px-2">SKU</th>
                        {!hideCostFields && <th className="py-1.5 px-2 text-right">Cost</th>}
                        <th className="py-1.5 px-2 text-right">Sell</th>
                        {!hideCostFields && <th className="py-1.5 px-2 text-right">Margin</th>}
                        <th className="py-1.5 px-2.5 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {formVariants.map((v, i) => {
                        const effSell =
                          v.sameAsProductPrice !== false
                            ? Number(formSellingPrice || 0)
                            : Number(v.sellingPrice ?? formSellingPrice ?? 0);
                        const effCost =
                          v.sameAsProductPrice !== false
                            ? Number(formCostPrice || 0)
                            : Number(v.costPrice ?? formCostPrice ?? 0);
                        const { marginPercent: vMargin } = computeVariantProfitMargin(effSell, effCost);
                        return (
                          <tr key={v.id} className={v.inactive ? 'opacity-50 line-through' : ''}>
                            <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200">
                              #{i + 1}: {v.color} / {v.model}
                              {v.variantNote ? (
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  {v.variantNote}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1.5 px-2 font-mono text-slate-500">
                              {v.variantSku || `${formSku}-V${i + 1}`}
                            </td>
                            {!hideCostFields && (
                              <td className="py-1.5 px-2 text-right font-mono text-slate-600 dark:text-slate-300">
                                ৳{effCost.toLocaleString()}
                              </td>
                            )}
                            <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                              ৳{effSell.toLocaleString()}
                            </td>
                            {!hideCostFields && (
                              <td className="py-1.5 px-2 text-right font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                                {vMargin}%
                              </td>
                            )}
                            <td className="py-1.5 px-2.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                              {v.inactive ? 'Archived' : `${v.stock} pcs`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {photoItems.length > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      Photos ({photoItems.length})
                    </h4>
                    {uploadingImages && (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" />
                        Uploading in background...
                      </span>
                    )}
                    {hasFailedImages && (
                      <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                        Failed photo must be retried or removed
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {photoItems.map((p, idx) => (
                      <div key={p.id} className="relative shrink-0">
                        <img
                          src={p.previewUrl || p.url}
                          alt={`Thumb ${idx + 1}`}
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                          referrerPolicy="no-referrer"
                        />
                        {(p.status === 'preparing' || p.status === 'uploading') && (
                          <span className="absolute inset-x-0 bottom-0 bg-slate-950/80 text-amber-300 text-[9px] font-mono text-center rounded-b-lg">
                            {p.progress}%
                          </span>
                        )}
                        {p.status === 'failed' && (
                          <span className="absolute inset-0 bg-rose-950/80 text-rose-200 text-[9px] font-bold flex items-center justify-center rounded-lg">
                            ERR
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {waitingForUploads && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300">
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={14} className="animate-spin" />
                      Finishing photo upload...
                    </span>
                    <span className="font-mono">
                      {Math.round(
                        photoItems.reduce((s, p) => s + p.progress, 0) / Math.max(1, photoItems.length)
                      )}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-amber-200/70 dark:bg-amber-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-150"
                      style={{
                        width: `${Math.round(
                          photoItems.reduce((s, p) => s + p.progress, 0) / Math.max(1, photoItems.length)
                        )}%`,
                      }}
                    />
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
              disabled={submitting || waitingForUploads}
              onClick={handlePrevStep}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || waitingForUploads}
              onClick={handleCancelForm}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          <div className="flex items-center gap-2">
            {editModeProduct && wizardStep < 5 && (
              <button
                type="button"
                disabled={submitting || waitingForUploads || hasFailedImages}
                onClick={(e) => handleFormSubmit(e as any)}
                className="px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {waitingForUploads ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Finishing photo upload...</span>
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    <span>{submitting ? 'Saving...' : 'Save Changes'}</span>
                  </>
                )}
              </button>
            )}

            {wizardStep < 5 ? (
              <button
                type="button"
                disabled={submitting}
                onClick={handleNextStep}
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                Continue <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || waitingForUploads || hasFailedImages}
                onClick={(e) => handleFormSubmit(e as any)}
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {waitingForUploads ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Finishing photo upload...</span>
                  </>
                ) : submitting ? (
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

      {/* Archive Variant With History Confirmation */}
      {archiveVariantConfirm && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
          onClick={(e) => {
            e.stopPropagation();
            setArchiveVariantConfirm(null);
          }}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2.5">
              <Archive size={18} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Archive Variant Instead of Deleting?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  <strong>
                    {archiveVariantConfirm.variant.color} / {archiveVariantConfirm.variant.model}
                  </strong>{' '}
                  cannot be permanently deleted ({archiveVariantConfirm.reason}). Archiving hides it
                  from new sales while keeping historical orders and reports intact.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setArchiveVariantConfirm(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchiveVariant}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-xl text-xs font-bold cursor-pointer"
              >
                Archive Variant
              </button>
            </div>
          </div>
        </div>
      )}

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
                  void cleanupUnsavedSessionUploads();
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
    </div>,
    document.body
  );
}
