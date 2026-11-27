import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  Upload, 
  Download,
  ChevronDown,
  Tag, 
  Archive, 
  Grid, 
  Settings, 
  FileSpreadsheet, 
  ChevronRight, 
  ArrowUpDown,
  History,
  X,
  AlertCircle,
  Check,
  FolderPlus,
  Coins,
  PackagePlus,
  RefreshCw,
  Clock,
  Eye,
  User,
  ImageOff,
  Inbox,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { exportProductsToCSV, exportBrandsToCSV, exportCategoriesToCSV, exportProductsToExcel } from '../utils/excelExport';
import { ResellerSyncModal } from './ResellerSyncModal';
import ProductFormModal from './ProductFormModal';
import PendingProductReviewModal from './PendingProductReviewModal';
import Barcode from './Barcode';
import { QRCodeSVG } from 'qrcode.react';
import { generateBarcodePDF } from '../utils/barcodePdf';
import { getBrandLogo } from '../utils/brandLogos';
import {
  normalizeProductImages,
  buildCategoryPathLabel,
} from '../utils/productImageUpload';
import {
  Product,
  Category,
  Brand,
  UserProfile,
  StockLog,
  ProductColor,
  ProductModel,
  ProductEditHistoryEntry,
  SubBrand,
  CompanySettings,
} from '../types';
import {
  formatBrandBadgeMeta,
  getSellingSubBrands,
  isLegacySatCode,
  matchesGlobalBrandFilter,
  normalizeSubBrandCode,
  productNeedsBrandAssignment,
  resolveDefaultSellingSubBrand,
} from '../utils/subBrands';
import { applyBulkProductBrandAssignment } from '../firebase/subBrandsRegistry';
import { 
  updateProduct, 
  archiveProduct, 
  deleteProduct,
  addCategory, 
  deleteCategory,
  updateCategory,
  addBrand, 
  deleteBrand,
  updateBrand,
  getStockLogs,
  getOrders,
  getInvoices,
  addProduct,
  addProductColor,
  deleteProductColor,
  addProductModel,
  deleteProductModel,
  getProductAvailableStock,
  getVariantAvailableStock,
  addNotification,
  logAuditAction
} from '../firebase/db';

export type ProductSubTab =
  | 'catalog'
  | 'categories'
  | 'brands'
  | 'attributes'
  | 'out_of_stock'
  | 'pending'
  | 'archive'
  | 'deletion_requests';

interface ProductManagementProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  productColors: ProductColor[];
  productModels: ProductModel[];
  user: UserProfile | null;
  onRefreshData: () => Promise<void>;
  initialAddMode?: boolean; // opens drawer automatically if navigated from dashboard
  initialSubTab?: ProductSubTab;
  onSubTabChange?: (tab: ProductSubTab) => void;
  requireCheckIn?: () => boolean;
  initialProductId?: string | null;
  clearInitialProductId?: () => void;
  onNavigateToStock?: (productId: string) => void;
  subBrands?: SubBrand[];
  globalBrandFilter?: string;
  companySettings?: CompanySettings | null;
}

function ProductThumbnail({
  product,
  alt,
  className = 'w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700',
  fallbackClassName = 'w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500',
  wrapperClassName = 'relative inline-block shrink-0',
  showCountBadge = false,
}: {
  product: Partial<Product>;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
  wrapperClassName?: string;
  showCountBadge?: boolean;
}) {
  const images = normalizeProductImages(product);
  const fullSrc = images[0];
  const thumbSrc = Array.isArray(product.imageThumbs) && product.imageThumbs[0] ? product.imageThumbs[0] : fullSrc;
  const [useFullFallback, setUseFullFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = useFullFallback ? fullSrc : thumbSrc;

  useEffect(() => {
    setUseFullFallback(false);
    setFailed(false);
  }, [thumbSrc, fullSrc]);

  if (!src || failed) {
    return (
      <div className={fallbackClassName} title={src ? 'Image failed to load' : 'No image'}>
        {src ? <ImageOff size={15} /> : <Tag size={15} />}
      </div>
    );
  }

  return (
    <div className={wrapperClassName}>
      <img
        src={src}
        alt={alt || product.name || 'Product'}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => {
          if (!useFullFallback && fullSrc && src !== fullSrc) {
            setUseFullFallback(true);
          } else {
            setFailed(true);
          }
        }}
        className={className}
      />
      {showCountBadge && images.length > 1 && (
        <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-slate-900 text-white text-[9px] font-mono font-bold border border-white dark:border-slate-900 shadow-2xs">
          +{images.length - 1}
        </span>
      )}
    </div>
  );
}

function formatShortDateTime(ts?: number): string {
  if (!ts || Number.isNaN(ts)) return '—';
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProductManagement({
  products,
  categories,
  brands,
  productColors,
  productModels,
  user,
  onRefreshData,
  initialAddMode = false,
  initialSubTab,
  onSubTabChange,
  requireCheckIn,
  initialProductId,
  clearInitialProductId,
  onNavigateToStock,
  subBrands,
  globalBrandFilter = 'ALL',
  companySettings,
}: ProductManagementProps) {
  const isStaff = user?.role === 'staff';
  const isSuperAdmin = user?.role === 'superadmin' || (user?.role as string) === 'super_admin';
  const isAdminOrOwner = isSuperAdmin || user?.role === 'admin';

  const activeSellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: false, companySettings }),
    [subBrands, companySettings]
  );
  const allSellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: true, companySettings }),
    [subBrands, companySettings]
  );
  const defaultSellingSubBrand = useMemo(
    () => resolveDefaultSellingSubBrand({ globalBrandFilter, user, subBrands, companySettings }),
    [globalBrandFilter, user, subBrands, companySettings]
  );

  const renderSubBrandBadge = (code?: string | null, withLogo = false) => {
    const badge = formatBrandBadgeMeta(code, subBrands, companySettings);
    return (
      <span
        style={badge.badgeStyle}
        className="inline-flex items-center gap-1 text-[10px] font-mono font-black px-2 py-0.5 rounded-full border"
        title={badge.label}
      >
        {withLogo && !badge.isNeedsAssignment && (
          <img
            src={getBrandLogo(code || undefined, undefined, subBrands)}
            alt={badge.shortLabel}
            className="w-3.5 h-3.5 object-contain rounded-xs"
          />
        )}
        <span>{badge.shortLabel}</span>
      </span>
    );
  };

  // Sub tabs
  const [activeSubTab, setActiveSubTab] = useState<ProductSubTab>(initialSubTab || 'catalog');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // List management states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSubBrand, setFilterSubBrand] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'instock' | 'lowstock' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, filterCategory, filterBrand, filterSubBrand, filterStockStatus, sortBy, sortOrder, activeSubTab, globalBrandFilter]);

  // Detail / Action States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productLogs, setProductLogs] = useState<StockLog[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editModeProduct, setEditModeProduct] = useState<Product | null>(null);

  // Bulk Selling Sub-Brand Assignment Modal
  const [isBulkBrandModalOpen, setIsBulkBrandModalOpen] = useState(false);
  const [bulkTargetBrand, setBulkTargetBrand] = useState<string>(defaultSellingSubBrand);
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Category and Brand editing state
  const [newCatName, setNewCatName] = useState('');
  const [newCatSub, setNewCatSub] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandLogoUrl, setNewBrandLogoUrl] = useState('');
  const [newBrandSubBrands, setNewBrandSubBrands] = useState<string[]>([defaultSellingSubBrand]);
  const [newBrandCategories, setNewBrandCategories] = useState<string[]>([]);

  const [editingBrandLogoUrl, setEditingBrandLogoUrl] = useState('');
  const [editingBrandSubBrands, setEditingBrandSubBrands] = useState<string[]>([]);
  const [editingBrandCategories, setEditingBrandCategories] = useState<string[]>([]);
  
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);

  // Attributes states
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#000000');
  const [newModelName, setNewModelName] = useState('');
  const [deletingColorId, setDeletingColorId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  
  // Inline edit states for categories & brands
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState<string>('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = useState<string>('');

  // Pending Products Queue & Review states
  const [preservePendingEdit, setPreservePendingEdit] = useState(false);
  const [reviewProductId, setReviewProductId] = useState<string | null>(null);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingSubBrandFilter, setPendingSubBrandFilter] = useState('');
  const [pendingSubmitterFilter, setPendingSubmitterFilter] = useState('');
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingActionLoadingId, setPendingActionLoadingId] = useState<string | null>(null);
  const [rejectModalProduct, setRejectModalProduct] = useState<Product | null>(null);
  const [rejectModalReason, setRejectModalReason] = useState('');
  const [rejectModalError, setRejectModalError] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // General Status State
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Bulk CSV Upload State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isResellerSyncModalOpen, setIsResellerSyncModalOpen] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [csvSuccess, setCsvSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Export State & Dropdown
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reload Catalog data automatically when page opens
  const refreshQueueWithState = async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      await onRefreshData?.();
    } catch (err: any) {
      setPendingError(err?.message || 'Failed to load pending products queue.');
    } finally {
      setPendingLoading(false);
    }
  };

  useEffect(() => {
    refreshQueueWithState();
  }, []);

  // Quick Inline Pricing & Stock Edit State
  const [inlineEditProductId, setInlineEditProductId] = useState<string | null>(null);
  const [inlinePrice, setInlinePrice] = useState<number>(0);
  const [inlineStock, setInlineStock] = useState<number>(0);

  const handleStartInlineEdit = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (requireCheckIn && !requireCheckIn()) return;
    setInlineEditProductId(product.id);
    setInlinePrice(product.sellingPrice || 0);
    const totalStock = (product.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
    setInlineStock(totalStock);
  };

  const handleSaveInlineEdit = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormError('');
    setFormSuccess('');
    try {
      const reservedSum = (product.variants || []).reduce((s, v) => s + (Number(v.reservedQty) || 0), 0);
      const nextStock = Number(inlineStock) || 0;
      if (nextStock < reservedSum) {
        setFormError(`Cannot reduce stock below ${reservedSum} pcs currently reserved for Pre-Orders.`);
        setTimeout(() => setFormError(''), 4000);
        return;
      }

      const newVariants = [...(product.variants || [])];
      if (newVariants.length > 0) {
        const otherVariantsStock = newVariants.slice(1).reduce((s, v) => s + (Number(v.stock) || 0), 0);
        const firstReserved = Number(newVariants[0].reservedQty) || 0;
        const firstNewStock = Math.max(0, nextStock - otherVariantsStock);
        if (firstNewStock < firstReserved) {
          setFormError(`First variant has ${firstReserved} pcs reserved for Pre-Orders.`);
          setTimeout(() => setFormError(''), 4000);
          return;
        }
        newVariants[0] = { ...newVariants[0], stock: firstNewStock };
      } else {
        newVariants.push({ id: '1', color: 'Default', model: 'Standard', stock: nextStock });
      }

      await updateProduct(product.id, {
        sellingPrice: Number(inlinePrice) || 0,
        variants: newVariants
      });

      setInlineEditProductId(null);
      await onRefreshData();
      setFormSuccess(`Updated "${product.name}" price & stock successfully!`);
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update product inline.');
      setTimeout(() => setFormError(''), 4000);
    }
  };

  // Category CRUD states
  const [newCatLevel, setNewCatLevel] = useState<'main' | 'sub' | 'child'>('main');
  const [newCatParentMainId, setNewCatParentMainId] = useState('');
  const [newCatParentSubId, setNewCatParentSubId] = useState('');

  // Custom confirmation trigger
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirm();
        setConfirmDialog(null);
      }
    });
  };

  const handleUpdateCategory = async (id: string, name: string, level: 'main' | 'sub' | 'child', parentId: string | null) => {
    if (!name.trim()) return;
    setFormError('');
    setFormSuccess('');
    try {
      await updateCategory(id, name.trim(), level, parentId);
      setEditingCatId(null);
      await onRefreshData();
      setFormSuccess('Category renamed successfully!');
      setTimeout(() => setFormSuccess(''), 3500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update category.');
      setTimeout(() => setFormError(''), 3500);
    }
  };

  const handleUpdateBrand = async (
    id: string, 
    name: string, 
    logoUrl?: string, 
    subBrands?: string[], 
    categories?: string[]
  ) => {
    if (!name.trim()) return;
    setFormError('');
    setFormSuccess('');
    try {
      await updateBrand(id, name.trim(), logoUrl, subBrands, categories);
      setEditingBrandId(null);
      await onRefreshData();
      setFormSuccess('Brand updated successfully!');
      setTimeout(() => setFormSuccess(''), 3500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update brand.');
      setTimeout(() => setFormError(''), 3500);
    }
  };


  // Barcode & bulk printing states
  const [selectedBarcodeTab, setSelectedBarcodeTab] = useState<'sku' | 'variants'>('sku');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Helper to download a single barcode as a PNG image using canvas
  const downloadBarcodePng = async (value: string, label: string, subLabel?: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 450;  // 1.5 inches @ 300 DPI
    canvas.height = 300; // 1.0 inches @ 300 DPI
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const { default: JsBarcode } = await import('jsbarcode');
      // 1. White Background with adequate margin
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 450, 300);

      // 2. Product name (small bold text at the top)
      ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
      ctx.fillStyle = '#0f172a'; // Slate 900
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      let displayName = label;
      if (displayName.length > 25) {
        displayName = displayName.substring(0, 23) + '...';
      }
      ctx.fillText(displayName, 225, 25);

      // 3. Variant info (e.g. "Black / Standard") - smaller text below product name
      if (subLabel) {
        ctx.font = '16px Helvetica, Arial, sans-serif';
        ctx.fillStyle = '#64748b'; // Slate 500
        let displaySub = subLabel;
        if (displaySub.length > 30) {
          displaySub = displaySub.substring(0, 27) + '...';
        }
        ctx.fillText(displaySub, 225, 55);
      }

      // 4. Barcode image
      const tempCanvas = document.createElement('canvas');
      JsBarcode(tempCanvas, value, {
        format: 'CODE128',
        width: 3.5, // Thick bars for perfect scannability
        height: 100,
        displayValue: false, // Rendered manually
        margin: 0,
        background: '#ffffff',
      });

      // Draw the barcode image wide as possible (with 20px padding left/right) and centered
      const barcodeWidth = 410; // 450 - 20 * 2
      const barcodeHeight = 145;
      const barcodeX = 20;
      const barcodeY = subLabel ? 85 : 70;
      ctx.drawImage(tempCanvas, barcodeX, barcodeY, barcodeWidth, barcodeHeight);

      // 5. Short code below the barcode (Courier/Monospace, Slate 800)
      ctx.font = 'bold 20px "Courier New", Courier, monospace';
      ctx.fillStyle = '#1e293b';
      ctx.fillText(value, 225, 255);

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `barcode-${label.replace(/[^a-zA-Z0-9]/g, '_')}-${value}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to generate PNG download:', err);
    }
  };

  // Helper to print sheet of barcodes for a single product (primary or variants)
  const printProductLabelSheet = async (product: Product, mode: 'primary' | 'variants') => {
    const itemsToPrint: { value: string; label: string; subLabel?: string }[] = [];
    
    if (mode === 'primary') {
      // Print 36 copies of the primary barcode to fill a standard A4 sheet (4x9 grid)
      for (let i = 0; i < 36; i++) {
        itemsToPrint.push({
          value: product.barcodeValue || product.sku,
          label: product.name,
          subLabel: 'Primary SKU Code'
        });
      }
    } else {
      // Print copies for all variants. Fill the 36-slot sheet as much as possible
      const variantsList = product.variants || [];
      const repeatCount = Math.max(1, Math.floor(36 / (variantsList.length || 1)));
      variantsList.forEach(v => {
        const cleanColor = v.color.trim();
        const cleanModel = v.model.trim();
        const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const fallbackBarcode = `${product.sku}-${vColorCode}-${vModelCode}`;
        
        for (let i = 0; i < repeatCount; i++) {
          itemsToPrint.push({
            value: v.barcodeValue || fallbackBarcode,
            label: product.name,
            subLabel: `${v.color} / ${v.model}`
          });
        }
      });
    }

    await generateBarcodePDF(itemsToPrint, `${product.name}_Labels`);
  };

  // Helper to bulk download barcode sheets for selected products
  const handleBulkBarcodeDownload = async () => {
    const selectedProducts = products.filter(p => selectedProductIds.includes(p.id));
    if (selectedProducts.length === 0) return;

    const itemsToPrint: { value: string; label: string; subLabel?: string }[] = [];
    selectedProducts.forEach(product => {
      if (product.variants && product.variants.length > 0) {
        product.variants.forEach(v => {
          const cleanColor = v.color.trim();
          const cleanModel = v.model.trim();
          const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
          const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
          const fallbackBarcode = `${product.sku}-${vColorCode}-${vModelCode}`;
          
          itemsToPrint.push({
            value: v.barcodeValue || fallbackBarcode,
            label: product.name,
            subLabel: `${v.color} / ${v.model}`
          });
        });
      } else {
        itemsToPrint.push({
          value: product.barcodeValue || product.sku,
          label: product.name,
          subLabel: 'Standard Unit'
        });
      }
    });

  await generateBarcodePDF(itemsToPrint, `Bulk_${selectedProducts.length}_Products`);
  };

  // Handle drawer auto-trigger
  useEffect(() => {
    if (initialAddMode) {
      openAddDrawer();
    }
  }, [initialAddMode]);

  useEffect(() => {
    if (!initialSubTab) return;
    if (initialSubTab === 'attributes' && isStaff) {
      setActiveSubTab('catalog');
      return;
    }
    if (
      (initialSubTab === 'pending' || initialSubTab === 'archive' || initialSubTab === 'deletion_requests') &&
      !isSuperAdmin
    ) {
      setActiveSubTab('catalog');
      return;
    }
    setActiveSubTab(initialSubTab);
  }, [initialSubTab, isStaff, isSuperAdmin]);

  const handleSelectSubTab = (tab: ProductSubTab) => {
    setActiveSubTab(tab);
    onSubTabChange?.(tab);
  };

  useEffect(() => {
    if (initialProductId) {
      const p = products.find(p => p.id === initialProductId);
      if (p) {
        if (p.status === 'pending_review' && (isSuperAdmin || p.submittedBy?.uid === user?.id || p.createdById === user?.id)) {
          setReviewProductId(p.id);
        } else {
          setSelectedProduct(p);
        }
      }
      if (clearInitialProductId) {
        clearInitialProductId();
      }
    }
  }, [initialProductId, products, clearInitialProductId, isSuperAdmin, user?.id]);

  // Fetch product logs on product selection
  useEffect(() => {
    if (selectedProduct) {
      getStockLogs(selectedProduct.id).then(logs => {
        setProductLogs(logs);
      });
    } else {
      setProductLogs([]);
    }
  }, [selectedProduct]);

  // Open Add Product Modal
  const openAddDrawer = () => {
    setEditModeProduct(null);
    setPreservePendingEdit(false);
    setIsDrawerOpen(true);
  };

  // Open Edit Product Modal
  const openEditDrawer = (product: Product, preservePending: boolean = false) => {
    setEditModeProduct(product);
    setPreservePendingEdit(preservePending || product.status === 'pending_review');
    setIsDrawerOpen(true);
  };

  // Pending Queue Approval & Rejection Logic (preserves Super Admin only approval rules)
  const executeApproveProduct = async (product: Product) => {
    if (!isSuperAdmin) return;
    setPendingActionLoadingId(product.id);
    setFormError('');
    setFormSuccess('');
    try {
      const nowTs = Date.now();
      const existingHistory: ProductEditHistoryEntry[] = Array.isArray(product.editHistory)
        ? product.editHistory
        : [];
      const approvedEntry: ProductEditHistoryEntry = {
        id: `eh-${nowTs}-${Math.random().toString(36).slice(2, 6)}`,
        editedByUid: user?.id || '',
        editedByName: user?.name || 'Super Admin',
        editedByRole: user?.role || 'superadmin',
        editedAt: nowTs,
        action: 'approved',
        changes: [],
      };

      await updateProduct(product.id, {
        status: 'approved',
        rejectionReason: '',
        approvedBy: {
          uid: user?.id || '',
          name: user?.name || 'Super Admin',
          role: user?.role || 'superadmin',
        },
        approvedAt: nowTs,
        editHistory: [...existingHistory, approvedEntry],
      });

      await logAuditAction(
        'UPDATE',
        'Product',
        product.id,
        product.name,
        `Approved pending product (SKU: ${product.sku}, Selling: ৳${product.sellingPrice})`,
        user
      );

      const submitterUid = product.submittedBy?.uid || product.createdById;
      await addNotification({
        type: 'product_review',
        title: 'Product Approved',
        message: `Your product "${product.name}" (SKU: ${product.sku}) was approved by ${user?.name || 'Super Admin'} and published to the catalog.`,
        targetScreen: 'products',
        subAction: 'catalog',
        targetId: product.id,
        ...(submitterUid ? { targetUserId: submitterUid } : {}),
        forRoles: ['admin', 'manager', 'staff'],
      });

      await onRefreshData();
      if (reviewProductId === product.id) {
        setReviewProductId(null);
      }
      setFormSuccess(`Approved "${product.name}" and notified submitter.`);
      setTimeout(() => setFormSuccess(''), 3500);
    } catch (err: any) {
      console.error('Approval failed:', err);
      setFormError(err?.message || `Failed to approve "${product.name}".`);
      setTimeout(() => setFormError(''), 4000);
    } finally {
      setPendingActionLoadingId(null);
    }
  };

  const handleRequestApproveProduct = (product: Product) => {
    if (!isSuperAdmin) return;
    showConfirm(
      'Approve Pending Product?',
      `Approve "${product.name}" (SKU: ${product.sku}) and publish it to the active catalog?`,
      () => {
        executeApproveProduct(product);
      }
    );
  };

  const handleConfirmRejectProduct = async (product: Product, reason: string) => {
    if (!isSuperAdmin) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new Error('Rejection reason is required.');
    }
    setPendingActionLoadingId(product.id);
    setFormError('');
    setFormSuccess('');
    try {
      const nowTs = Date.now();
      const existingHistory: ProductEditHistoryEntry[] = Array.isArray(product.editHistory)
        ? product.editHistory
        : [];
      const rejectedEntry: ProductEditHistoryEntry = {
        id: `eh-${nowTs}-${Math.random().toString(36).slice(2, 6)}`,
        editedByUid: user?.id || '',
        editedByName: user?.name || 'Super Admin',
        editedByRole: user?.role || 'superadmin',
        editedAt: nowTs,
        action: 'rejected',
        note: trimmedReason,
        changes: [],
      };

      await updateProduct(product.id, {
        status: 'rejected',
        rejectionReason: trimmedReason,
        rejectedBy: {
          uid: user?.id || '',
          name: user?.name || 'Super Admin',
          role: user?.role || 'superadmin',
        },
        rejectedAt: nowTs,
        editHistory: [...existingHistory, rejectedEntry],
      });

      await logAuditAction(
        'UPDATE',
        'Product',
        product.id,
        product.name,
        `Rejected pending product (SKU: ${product.sku}). Reason: ${trimmedReason}`,
        user
      );

      const submitterUid = product.submittedBy?.uid || product.createdById;
      await addNotification({
        type: 'product_review',
        title: 'Product Rejected',
        message: `Your product "${product.name}" (SKU: ${product.sku}) was rejected. Reason: ${trimmedReason}`,
        rejectionReason: trimmedReason,
        targetScreen: 'products',
        subAction: 'catalog',
        targetId: product.id,
        ...(submitterUid ? { targetUserId: submitterUid } : {}),
        forRoles: ['admin', 'manager', 'staff'],
      });

      await onRefreshData();
      if (reviewProductId === product.id) {
        setReviewProductId(null);
      }
      setFormSuccess(`Rejected "${product.name}" and notified submitter.`);
      setTimeout(() => setFormSuccess(''), 3500);
    } catch (err: any) {
      console.error('Rejection failed:', err);
      setFormError(err?.message || `Failed to reject "${product.name}".`);
      setTimeout(() => setFormError(''), 4000);
      throw err;
    } finally {
      setPendingActionLoadingId(null);
    }
  };

  const handleApproveAllPending = (itemsToApprove: Product[]) => {
    if (!isSuperAdmin || itemsToApprove.length === 0) return;
    showConfirm(
      `Approve All ${itemsToApprove.length} Pending Products?`,
      `This will immediately publish all ${itemsToApprove.length} filtered pending product(s) to the active catalog and notify submitters.`,
      async () => {
        setPendingLoading(true);
        setFormError('');
        setFormSuccess('');
        try {
          for (const item of itemsToApprove) {
            const nowTs = Date.now();
            const existingHistory: ProductEditHistoryEntry[] = Array.isArray(item.editHistory)
              ? item.editHistory
              : [];
            const approvedEntry: ProductEditHistoryEntry = {
              id: `eh-${nowTs}-${Math.random().toString(36).slice(2, 6)}`,
              editedByUid: user?.id || '',
              editedByName: user?.name || 'Super Admin',
              editedByRole: user?.role || 'superadmin',
              editedAt: nowTs,
              action: 'approved',
              changes: [],
            };
            await updateProduct(item.id, {
              status: 'approved',
              rejectionReason: '',
              approvedBy: {
                uid: user?.id || '',
                name: user?.name || 'Super Admin',
                role: user?.role || 'superadmin',
              },
              approvedAt: nowTs,
              editHistory: [...existingHistory, approvedEntry],
            });
            await logAuditAction(
              'UPDATE',
              'Product',
              item.id,
              item.name,
              `Bulk approved pending product (SKU: ${item.sku})`,
              user
            );
            const submitterUid = item.submittedBy?.uid || item.createdById;
            await addNotification({
              type: 'product_review',
              title: 'Product Approved',
              message: `Your product "${item.name}" (SKU: ${item.sku}) was approved by ${user?.name || 'Super Admin'} and published to the catalog.`,
              targetScreen: 'products',
              subAction: 'catalog',
              targetId: item.id,
              ...(submitterUid ? { targetUserId: submitterUid } : {}),
              forRoles: ['admin', 'manager', 'staff'],
            });
          }
          await onRefreshData();
          setFormSuccess(`Successfully approved all ${itemsToApprove.length} pending products!`);
          setTimeout(() => setFormSuccess(''), 3500);
        } catch (err: any) {
          setFormError(err?.message || 'Failed to approve all pending products.');
          setTimeout(() => setFormError(''), 4000);
        } finally {
          setPendingLoading(false);
        }
      }
    );
  };

  // Archive / Soft Delete product
  const handleArchiveProduct = async (product: Product) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return; // restricted
    showConfirm(
      "Confirm Product Archival",
      `Are you sure you want to archive "${product.name}"?`,
      async () => {
        try {
          await archiveProduct(product.id);
          await onRefreshData();
          if (selectedProduct?.id === product.id) {
            setSelectedProduct(null);
          }
          setFormSuccess(`Successfully archived "${product.name}".`);
          setTimeout(() => setFormSuccess(''), 3000);
        } catch (err: any) {
          console.error("Archive product failed:", err);
          setFormError(`Failed to archive product: ${err.message || err}`);
        }
      }
    );
  };

  const handleUnarchiveProduct = async (product: Product) => {
    if (requireCheckIn && !requireCheckIn()) return;
    try {
      await updateProduct(product.id, { archived: false });
      await onRefreshData();
      setFormSuccess(`Successfully restored "${product.name}" to catalog.`);
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      console.error("Unarchive product failed:", err);
      setFormError(`Failed to restore product: ${err.message || err}`);
    }
  };

  const checkProductReferences = async (productId: string): Promise<{ ordersCount: number, invoicesCount: number, logsCount: number }> => {
    try {
      const [allOrders, allInvoices, allLogs] = await Promise.all([
        getOrders({ limitCount: 300 }),
        getInvoices({ limitCount: 300 }),
        getStockLogs(productId)
      ]);

      const ordersCount = (allOrders || []).filter(o => o.items?.some(item => item.productId === productId)).length;
      const invoicesCount = (allInvoices || []).filter(i => i.items?.some(item => item.productId === productId)).length;
      const logsCount = (allLogs || []).length;

      return { ordersCount, invoicesCount, logsCount };
    } catch (error) {
      console.error("[checkProductReferences] Error checking product references:", error);
      return { ordersCount: 0, invoicesCount: 0, logsCount: 0 };
    }
  };

  const executePermanentDelete = async (product: Product, successCallback: () => void) => {
    try {
      const { ordersCount, invoicesCount, logsCount } = await checkProductReferences(product.id);
      
      const isReferenced = ordersCount > 0 || invoicesCount > 0 || logsCount > 0;
      
      if (isReferenced) {
        const warningDetails: string[] = [];
        if (ordersCount > 0) warningDetails.push(`${ordersCount} order(s)`);
        if (invoicesCount > 0) warningDetails.push(`${invoicesCount} invoice(s)`);
        if (logsCount > 0) warningDetails.push(`${logsCount} stock log(s)`);
        
        const warningMessage = `This product is referenced in ${warningDetails.join(', ')}. Permanently deleting it may cause those historical records to show incomplete/missing product info. Delete anyway?`;
        
        showConfirm(
          "Warning: Historical References Found!",
          warningMessage,
          async () => {
            try {
              await deleteProduct(product.id);
              successCallback();
            } catch (err: any) {
              setFormError(`Failed to delete product: ${err.message || err}`);
              setTimeout(() => setFormError(''), 3000);
            }
          }
        );
      } else {
        // No references, delete directly
        await deleteProduct(product.id);
        successCallback();
      }
    } catch (err: any) {
      setFormError(`Failed during deletion check: ${err.message || err}`);
      setTimeout(() => setFormError(''), 3000);
    }
  };

  const handleDeleteClick = (product: Product) => {
    if (requireCheckIn && !requireCheckIn()) {
      return;
    }
    if (user?.role === 'superadmin') {
      showConfirm(
        "Permanently Delete Product?",
        `Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`,
        async () => {
          await executePermanentDelete(product, async () => {
            await onRefreshData();
            if (selectedProduct?.id === product.id) {
              setSelectedProduct(null);
            }
            setFormSuccess(`Permanently deleted "${product.name}".`);
            setTimeout(() => setFormSuccess(''), 3000);
          });
        }
      );
    } else if (user?.role === 'admin') {
      showConfirm(
        "Submit Deletion Request?",
        `Are you sure you want to submit a deletion request for "${product.name}"? This product will be marked as "Deletion Pending" until a Super Admin approves it.`,
        async () => {
          try {
            await updateProduct(product.id, { 
              deletionStatus: 'pending_approval',
              deletionRequestedBy: user?.name || user?.email || 'Admin',
              deletionRequestedAt: Date.now()
            });
            await onRefreshData();
            setFormSuccess(`Deletion request submitted for "${product.name}".`);
            setTimeout(() => setFormSuccess(''), 3000);
          } catch (err: any) {
            console.error("Submit deletion request failed:", err);
            setFormError(`Failed to submit deletion request: ${err.message || err}`);
            setTimeout(() => setFormError(''), 3000);
          }
        }
      );
    } else {
      console.warn("[handleDeleteClick] User role is not superadmin or admin. Blocked action.", user?.role);
    }
  };

  // Category CRUD Handlers
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    
    if (requireCheckIn && !requireCheckIn()) return;
    if (!newCatName.trim()) return;
    
    try {
      let parentId: string | null = null;
      if (newCatLevel === 'sub') {
        if (!newCatParentMainId) {
          setFormError('Please select a Main Category parent.');
          return;
        }
        parentId = newCatParentMainId;
      } else if (newCatLevel === 'child') {
        if (!newCatParentSubId) {
          setFormError('Please select a Sub Category parent.');
          return;
        }
        parentId = newCatParentSubId;
      }

      await addCategory(newCatName.trim(), newCatLevel, parentId);
      setFormSuccess(`Category "${newCatName}" created under ${newCatLevel} level!`);
      setNewCatName('');
      setNewCatParentMainId('');
      setNewCatParentSubId('');
      await onRefreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create category.');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return;
    
    setFormError('');
    setFormSuccess('');
    
    // Check if category is in use
    const inUse = products.some(p => 
      (p.category === name || p.mainCategory === name || p.subCategory === name || p.childCategory === name) && 
      !p.archived
    );
    if (inUse) {
      setFormError(`Cannot delete category "${name}" because it or its child nodes are currently in use by active products. Please reassign those products first.`);
      return;
    }
    
    showConfirm(
      "Delete Category?",
      `Are you sure you want to delete the category "${name}"? This will recursively delete all its nested sub and child categories.`,
      async () => {
        setDeletingCatId(id);
        try {
          await deleteCategory(id);
          await onRefreshData();
          setFormSuccess(`Successfully deleted category "${name}"`);
          setTimeout(() => setFormSuccess(''), 3500);
        } catch (err: any) {
          console.warn("Delete category failed:", err.message || err);
          setFormError(`Failed to delete category: ${err.message || 'Permission denied'}`);
        } finally {
          setDeletingCatId(null);
        }
      }
    );
  };

  // Brand CRUD Handlers
  const handleAddBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    
    if (requireCheckIn && !requireCheckIn()) return;
    if (!newBrandName.trim()) return;
    
    try {
      await addBrand(
        newBrandName.trim(),
        newBrandLogoUrl.trim() || undefined,
        newBrandSubBrands,
        newBrandCategories
      );
      setFormSuccess(`Brand "${newBrandName}" created successfully!`);
      setNewBrandName('');
      setNewBrandLogoUrl('');
      setNewBrandSubBrands([defaultSellingSubBrand]);
      setNewBrandCategories([]);
      await onRefreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create brand.');
    }
  };

  const handleDeleteBrand = async (id: string, name: string) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return;
    
    setFormError('');
    setFormSuccess('');
    
    // Check if brand is in use
    const inUse = products.some(p => p.brand === name && !p.archived);
    if (inUse) {
      setFormError(`Cannot delete brand "${name}" because it is currently in use by one or more products. Please reassign those products first.`);
      return;
    }
    
    showConfirm(
      "Delete Brand?",
      `Are you sure you want to delete the brand "${name}"?`,
      async () => {
        setDeletingBrandId(id);
        try {
          await deleteBrand(id);
          await onRefreshData();
          setFormSuccess(`Successfully deleted brand "${name}"`);
          setTimeout(() => setFormSuccess(''), 3500);
        } catch (err: any) {
          console.warn("Delete brand failed:", err.message || err);
          setFormError(`Failed to delete brand: ${err.message || 'Permission denied'}`);
        } finally {
          setDeletingBrandId(null);
        }
      }
    );
  };

  const handleAddColor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    
    if (requireCheckIn && !requireCheckIn()) return;
    if (!newColorName.trim()) return;
    
    try {
      await addProductColor(newColorName.trim(), newColorHex);
      setFormSuccess(`Color "${newColorName}" created!`);
      setNewColorName('');
      setNewColorHex('#000000');
      await onRefreshData();
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      setFormError(`Failed to create color: ${err.message || 'Permission denied'}`);
    }
  };

  const handleDeleteColor = async (id: string, name: string) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return;
    
    setFormError('');
    setFormSuccess('');
    
    // Check if color is in use
    const inUse = products.some(p => (p.variants || []).some(v => v.color === name) && !p.archived);
    if (inUse) {
      setFormError(`Cannot delete color "${name}" because it is currently in use by one or more products.`);
      return;
    }
    
    showConfirm(
      "Delete Color?",
      `Are you sure you want to delete the color "${name}"?`,
      async () => {
        setDeletingColorId(id);
        try {
          await deleteProductColor(id);
          await onRefreshData();
          setFormSuccess(`Successfully deleted color "${name}"`);
          setTimeout(() => setFormSuccess(''), 3500);
        } catch (err: any) {
          setFormError(`Failed to delete color: ${err.message || 'Permission denied'}`);
        } finally {
          setDeletingColorId(null);
        }
      }
    );
  };

  const handleAddModel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    
    if (requireCheckIn && !requireCheckIn()) return;
    if (!newModelName.trim()) return;
    
    try {
      await addProductModel(newModelName.trim());
      setFormSuccess(`Model/Size "${newModelName}" created!`);
      setNewModelName('');
      await onRefreshData();
      setTimeout(() => setFormSuccess(''), 3000);
    } catch (err: any) {
      setFormError(`Failed to create model: ${err.message || 'Permission denied'}`);
    }
  };

  const handleDeleteModel = async (id: string, name: string) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return;
    
    setFormError('');
    setFormSuccess('');
    
    // Check if model is in use
    const inUse = products.some(p => (p.variants || []).some(v => v.model === name) && !p.archived);
    if (inUse) {
      setFormError(`Cannot delete model/size "${name}" because it is currently in use by one or more products.`);
      return;
    }
    
    showConfirm(
      "Delete Model/Size?",
      `Are you sure you want to delete the model/size "${name}"?`,
      async () => {
        setDeletingModelId(id);
        try {
          await deleteProductModel(id);
          await onRefreshData();
          setFormSuccess(`Successfully deleted model/size "${name}"`);
          setTimeout(() => setFormSuccess(''), 3500);
        } catch (err: any) {
          setFormError(`Failed to delete model: ${err.message || 'Permission denied'}`);
        } finally {
          setDeletingModelId(null);
        }
      }
    );
  };

  // Bulk Import CSV Handler
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (requireCheckIn && !requireCheckIn()) {
      e.target.value = '';
      return;
    }
    setCsvError('');
    setCsvSuccess('');
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) return;

        // Parse CSV lines simply
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) {
          setCsvError('Empty CSV or missing header columns.');
          return;
        }

        // Header mapping validation
        const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
        const nameIdx = headers.indexOf('name');
        const skuIdx = headers.indexOf('sku');
        const categoryIdx = headers.indexOf('category');
        const brandIdx = headers.indexOf('brand');
        const subBrandIdx = headers.indexOf('subbrand');
        const costPriceIdx = headers.indexOf('costprice');
        const sellingPriceIdx = headers.indexOf('sellingprice');
        const reorderIdx = headers.indexOf('reorderthreshold');

        if (nameIdx === -1 || skuIdx === -1) {
          setCsvError('CSV must at least contain "Name" and "SKU" columns.');
          return;
        }

        let importCount = 0;
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          if (cols.length < headers.length) continue;

          const pName = cols[nameIdx];
          const pSku = cols[skuIdx];
          if (!pName || !pSku) continue;

          // Build a basic product payload from row
          const pCategory = categoryIdx !== -1 ? cols[categoryIdx] : 'Smart Phones';
          const pBrand = brandIdx !== -1 ? cols[brandIdx] : 'Generic';
          const pSubBrandRaw = subBrandIdx !== -1 ? normalizeSubBrandCode(cols[subBrandIdx]) : '';
          const matchedSelling = allSellingSubBrands.find((b) => b.shortCode === pSubBrandRaw);
          const pSubBrand = matchedSelling ? matchedSelling.shortCode : defaultSellingSubBrand;
          const pCost = costPriceIdx !== -1 ? Number(cols[costPriceIdx]) || 0 : 0;
          const pSelling = sellingPriceIdx !== -1 ? Number(cols[sellingPriceIdx]) || 0 : 0;
          const pReorder = reorderIdx !== -1 ? Number(cols[reorderIdx]) || 5 : 5;

          const productPayload: Omit<Product, 'id'> = {
            name: pName,
            sku: pSku.toUpperCase(),
            category: pCategory,
            brand: pBrand,
            subBrand: pSubBrand,
            subBrandId: pSubBrand,
            costPrice: pCost,
            sellingPrice: pSelling,
            reorderThreshold: pReorder,
            images: [],
            variants: [{ id: Date.now().toString() + i, color: 'Default', model: 'Standard', stock: 10 }],
            archived: false,
            createdAt: Date.now(),
            status: isSuperAdmin ? 'approved' : 'pending_review'
          };

          await addProduct(productPayload, user?.id || 'csv-import', user?.name || 'CSV Bulk Agent');
          importCount++;
        }

        setCsvSuccess(`Successfully imported ${importCount} products!`);
        await onRefreshData();
      } catch (err: any) {
        setCsvError('Parsing failed. Ensure your CSV is formatted properly with commas.');
      }
    };
    reader.readAsText(file);
  };

  // Filtering & Sorting Logic (memoized + 250ms debounced)
  const filteredProducts = useMemo(() => products.filter((product) => {
    if (!product) return false;
    const query = (debouncedSearch || '').toLowerCase().trim();
    const pName = (product.name || '').toLowerCase();
    const pSku = (product.sku || '').toLowerCase();
    const pBrand = (product.brand || '').toLowerCase();
    const pBarcode = (product.barcodeValue || '').toLowerCase();
    
    const matchesSearch = !query || 
                          pName.includes(query) ||
                          pSku.includes(query) ||
                          pBrand.includes(query) ||
                          pBarcode.includes(query);
    
    const matchesCategory = !filterCategory || product.category === filterCategory || product.mainCategory === filterCategory;
    const matchesBrand = !filterBrand || product.brand === filterBrand;
    const matchesGlobalBrand = matchesGlobalBrandFilter(product.subBrand, globalBrandFilter);
    const matchesSubBrand =
      !filterSubBrand
        ? true
        : filterSubBrand === 'NEEDS_ASSIGNMENT'
        ? productNeedsBrandAssignment(product, subBrands, companySettings)
        : filterSubBrand === 'LEGACY_SAT'
        ? isLegacySatCode(product.subBrand)
        : normalizeSubBrandCode(product.subBrand) === normalizeSubBrandCode(filterSubBrand);
    
    const availQty = getProductAvailableStock(product);
    const threshold = product.reorderThreshold ?? 5;

    let matchesStock = true;
    if (filterStockStatus === 'instock') {
      matchesStock = availQty > threshold;
    } else if (filterStockStatus === 'lowstock') {
      matchesStock = availQty > 0 && availQty <= threshold;
    } else if (filterStockStatus === 'out') {
      matchesStock = availQty <= 0;
    }

    const matchesStatus = product.status === 'approved';
    const matchesArchived = !product.archived;
    const matchesStockStatus = product.stockStatus !== 'out_of_stock';
    
    return matchesSearch && matchesCategory && matchesBrand && matchesGlobalBrand && matchesSubBrand && matchesStock && matchesStatus && matchesArchived && matchesStockStatus;
  }), [products, debouncedSearch, filterCategory, filterBrand, filterSubBrand, filterStockStatus, globalBrandFilter, subBrands, companySettings]);

  // Sort
  const sortedProducts = useMemo(() => [...filteredProducts].sort((a, b) => {
    let factor = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name) * factor;
    } else if (sortBy === 'price') {
      return (a.sellingPrice - b.sellingPrice) * factor;
    } else if (sortBy === 'stock') {
      const stockA = (a.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
      const stockB = (b.variants || []).reduce((sum, v) => sum + (v.stock || 0), 0);
      return (stockA - stockB) * factor;
    }
    return 0;
  }), [filteredProducts, sortBy, sortOrder]);

  const totalCatalogPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const safeCatalogPage = Math.min(currentPage, totalCatalogPages);
  const paginatedProducts = useMemo(() => {
    const start = (safeCatalogPage - 1) * pageSize;
    return sortedProducts.slice(start, start + pageSize);
  }, [sortedProducts, safeCatalogPage]);

  const toggleSort = (field: 'name' | 'stock' | 'price') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const reviewProduct = reviewProductId
    ? products.find((p) => p.id === reviewProductId) || null
    : null;

  return (
    <div className="space-y-6">


      {activeSubTab === 'catalog' && (
        <div className="flex flex-wrap gap-2 md:justify-end items-center">
          {/* Bulk CSV / Excel Export Dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <button
              type="button"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-sm font-bold text-emerald-800 rounded-xl cursor-pointer transition-colors shadow-2xs"
              title="Bulk Export Products to CSV or Excel"
            >
              <Download size={14} className="text-emerald-600" />
              Bulk CSV Export
              <ChevronDown size={13} className={`text-emerald-600 transition-transform ${isExportDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isExportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3.5 py-1.5 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Export Catalog Options
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportProductsToCSV(filteredProducts, `products-filtered-${filteredProducts.length}-${new Date().toISOString().split('T')[0]}.csv`);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Download size={13} className="text-emerald-600" />
                    <span>Export Filtered ({filteredProducts.length})</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded">.CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    const activeProds = products.filter(p => !p.archived);
                    exportProductsToCSV(activeProds, `products-all-${activeProds.length}-${new Date().toISOString().split('T')[0]}.csv`);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Download size={13} className="text-emerald-600" />
                    <span>Export All Catalog ({products.filter(p => !p.archived).length})</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-100/70 px-1.5 py-0.5 rounded">.CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    exportProductsToExcel(filteredProducts);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-between cursor-pointer transition-colors border-t border-slate-100"
                >
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet size={13} className="text-teal-600" />
                    <span>Export to Excel Workbook</span>
                  </div>
                  <span className="text-[10px] font-mono text-teal-700 font-bold bg-teal-100/70 px-1.5 py-0.5 rounded">.XLSX</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Table View"
            >
              <FileSpreadsheet size={13} />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                viewMode === 'grid' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Grid View"
            >
              <Grid size={13} />
              Grid
            </button>
          </div>

          <button
            onClick={() => setIsResellerSyncModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold text-indigo-700 rounded-xl cursor-pointer transition-colors"
          >
            Sky Inventory Sync
          </button>
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-sm sm:text-sm font-semibold text-slate-700 rounded-xl cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Bulk CSV Import
          </button>
          <button
            onClick={openAddDrawer}
            className="flex items-center gap-1.5 py-1.5 px-4 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-sm sm:text-sm rounded-xl cursor-pointer"
          >
            <Plus size={14} />
            Add Product
          </button>
        </div>
      )}

      {/* GLOBAL ALERTS */}
      {(formError || formSuccess) && (
        <div className="space-y-2">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <p className="font-semibold">{formError}</p>
            </div>
          )}
          {formSuccess && (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 p-4 rounded-2xl text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Check size={16} className="text-teal-500" />
              <p className="font-semibold">{formSuccess}</p>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB 1: PRODUCT CATALOG */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-4">
          {/* Submitter's Own Pending / Rejected Submissions (Non-SuperAdmin) */}
          {!isSuperAdmin && (() => {
            const mySubmissions = products.filter(
              (p) =>
                !p.archived &&
                (p.status === 'pending_review' || p.status === 'rejected') &&
                ((p.submittedBy?.uid && p.submittedBy.uid === user?.id) ||
                  (p.createdById && p.createdById === user?.id))
            );
            if (mySubmissions.length === 0) return null;
            return (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/60 p-4 sm:p-5 space-y-3 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                      <Clock size={16} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">
                        My Submitted Products ({mySubmissions.length})
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        You can review and edit your own pending submissions before approval.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3 font-bold">Image</th>
                        <th className="py-2.5 px-3 font-bold">Product & SKU</th>
                        <th className="py-2.5 px-3 font-bold">Category / Brand</th>
                        <th className="py-2.5 px-3 font-bold text-right">Selling Price</th>
                        <th className="py-2.5 px-3 font-bold text-center">Stock</th>
                        <th className="py-2.5 px-3 font-bold">Status</th>
                        <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {mySubmissions.map((item) => {
                        const totalQty = (item.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
                        const canEditOwn = item.status === 'pending_review';
                        return (
                          <tr
                            key={item.id}
                            onClick={() => setReviewProductId(item.id)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <ProductThumbnail product={item} showCountBadge />
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900 dark:text-white leading-tight">
                                {item.name}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                                {item.sku}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300">
                              <span className="block font-medium">{buildCategoryPathLabel(item)}</span>
                              <span className="text-[11px] text-slate-400">{item.brand}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                              ৳{Number(item.sellingPrice || 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold tabular-nums text-slate-700 dark:text-slate-200">
                              {totalQty} pcs
                            </td>
                            <td className="py-2.5 px-3">
                              {item.status === 'rejected' ? (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold">
                                    <XCircle size={11} /> Rejected
                                  </span>
                                  {item.rejectionReason && (
                                    <p className="text-[11px] text-rose-600 dark:text-rose-400 line-clamp-1">
                                      {item.rejectionReason}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                  <Clock size={11} /> Pending Review
                                </span>
                              )}
                            </td>
                            <td
                              className="py-2.5 px-3 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setReviewProductId(item.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye size={13} /> View
                                </button>
                                {canEditOwn && (
                                  <button
                                    type="button"
                                    onClick={() => openEditDrawer(item, true)}
                                    className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Edit3 size={13} /> Edit
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          
          {/* Main List Column */}
          <div className="space-y-4">
            
            {/* Filters Bar */}
            <div className="bg-gradient-to-br from-white via-slate-50/60 to-teal-50/10 p-5 rounded-3xl shadow-xs border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-teal-100/60 text-teal-800 rounded-xl">
                    <Filter size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Advanced Product Filters</h3>
                    <p className="text-[11px] text-slate-500 font-medium">Filter catalog by category, brand, division, or stock status</p>
                  </div>
                </div>
                {(search || filterCategory || filterBrand || filterSubBrand || filterStockStatus !== 'all') && (
                  <button
                    onClick={() => {
                      setSearch('');
                      setFilterCategory('');
                      setFilterBrand('');
                      setFilterSubBrand('');
                      setFilterStockStatus('all');
                    }}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all cursor-pointer border border-rose-200/60 shadow-2xs"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute top-3.5 left-4 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Search products by name, SKU code, or brand..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-11 w-full bg-white border border-slate-200 rounded-2xl py-3 text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 font-medium shadow-2xs transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                
                {/* Category Filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-white border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all"
                >
                  <option value="">📁 All Categories</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>

                {/* Brand Filter */}
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className="bg-white border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all"
                >
                  <option value="">🏷️ All Brands</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>

                {/* Sub-Brand Division Filter */}
                <select
                  value={filterSubBrand}
                  onChange={(e) => setFilterSubBrand(e.target.value)}
                  className="bg-white border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all"
                >
                  <option value="">🏪 All Selling Sub-Brands</option>
                  {allSellingSubBrands.map((sb) => (
                    <option key={sb.shortCode} value={sb.shortCode}>
                      {sb.name} ({sb.shortCode}){!sb.active ? ' — Inactive' : ''}
                    </option>
                  ))}
                  <option value="NEEDS_ASSIGNMENT">⚠️ Needs Brand Assignment</option>
                  {!isStaff && <option value="LEGACY_SAT">🏛️ Legacy (SAT)</option>}
                </select>

                {/* Stock Alert Filter */}
                <select
                  value={filterStockStatus}
                  onChange={(e) => setFilterStockStatus(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-2xl py-2.5 px-3.5 text-sm text-slate-700 font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 shadow-2xs transition-all"
                >
                  <option value="all">📦 All Stock States</option>
                  <option value="instock">🟢 Adequate Stock</option>
                  <option value="lowstock">🟡 Low Stock Alert</option>
                  <option value="out">🔴 Out of Stock</option>
                </select>

              </div>

              {/* Quick stock pill filters */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 text-xs">
                <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mr-1">Quick Stock Filter:</span>
                <button
                  onClick={() => setFilterStockStatus('all')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs ${
                    filterStockStatus === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All Items ({products.filter(p => !p.archived && p.status === 'approved').length})
                </button>
                <button
                  onClick={() => setFilterStockStatus('instock')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs ${
                    filterStockStatus === 'instock' ? 'bg-teal-700 text-white shadow-xs' : 'bg-teal-50 text-teal-800 border border-teal-200/60 hover:bg-teal-100'
                  }`}
                >
                  🟢 In Stock
                </button>
                <button
                  onClick={() => setFilterStockStatus('lowstock')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs ${
                    filterStockStatus === 'lowstock' ? 'bg-amber-600 text-white shadow-xs' : 'bg-amber-50 text-amber-800 border border-amber-200/60 hover:bg-amber-100'
                  }`}
                >
                  🟡 Low Stock
                </button>
                <button
                  onClick={() => setFilterStockStatus('out')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer shadow-2xs ${
                    filterStockStatus === 'out' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-800 border border-rose-200/60 hover:bg-rose-100'
                  }`}
                >
                  🔴 Out of Stock
                </button>
              </div>
            </div>

            {/* Products Table Card / Mobile Card View */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden">
              {/* Desktop View (Table vs Grid depending on viewMode) */}
              {viewMode === 'table' ? (
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-xs font-mono tracking-wider text-slate-500 uppercase">
                        <th className="py-4 px-4 text-center font-black w-12">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer size-4"
                            checked={sortedProducts.length > 0 && selectedProductIds.length === sortedProducts.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedProductIds(sortedProducts.map(p => p.id));
                              } else {
                                setSelectedProductIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className="py-4 px-4 font-black">Image</th>
                        <th className="py-4 px-4 font-black cursor-pointer hover:text-slate-950" onClick={() => toggleSort('name')}>
                          Product Info <ArrowUpDown size={12} className="inline ml-1 text-slate-400" />
                        </th>
                        <th className="py-4 px-4 font-black text-center">Division</th>
                        <th className="py-4 px-4 font-black cursor-pointer hover:text-slate-950" onClick={() => toggleSort('stock')}>
                          Stock Status <ArrowUpDown size={12} className="inline ml-1 text-slate-400" />
                        </th>
                        <th className="py-4 px-4 font-black cursor-pointer hover:text-slate-950 text-right" onClick={() => toggleSort('price')}>
                          Pricing (৳) <ArrowUpDown size={12} className="inline ml-1 text-slate-400" />
                        </th>
                        <th className="py-4 px-4 text-center font-black">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                      {paginatedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                            No active gadget catalog records found.
                          </td>
                        </tr>
                      ) : (
                        paginatedProducts.map((product) => {
                          const totalQty = (product.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
                          const reservedQty = Number(product.reservedQty) || 0;
                          const availQty = getProductAvailableStock(product);
                          const isLow = availQty <= (product.reorderThreshold ?? 5);

                          return (
                            <tr 
                              key={product.id} 
                              onClick={() => setSelectedProduct(product)}
                              className={`hover:bg-amber-500/5 transition-colors cursor-pointer ${
                                selectedProduct?.id === product.id ? 'bg-amber-500/10' : ''
                              }`}
                            >
                              <td className="py-3 px-4 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer size-3.5"
                                  checked={selectedProductIds.includes(product.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductIds([...selectedProductIds, product.id]);
                                    } else {
                                      setSelectedProductIds(selectedProductIds.filter(id => id !== product.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="py-3 px-4">
                                <ProductThumbnail product={product} />
                              </td>
                              <td className="py-3 px-3 min-w-[150px]">
                                <p className="font-bold text-slate-900 leading-tight">{product.name}</p>
                                <p className="text-sm text-slate-400 font-mono mt-0.5">{product.sku}</p>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                                    {product.brand}
                                  </span>
                                  <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                                    {product.category}
                                  </span>
                                  {product.deletionStatus === 'pending_approval' && (
                                    <span className="bg-rose-100 text-rose-700 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded animate-pulse">
                                      Deletion Pending
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-center">
                                {renderSubBrandBadge(product.subBrand, true)}
                              </td>
                              <td className="py-3 px-3">
                                {inlineEditProductId === product.id ? (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="number"
                                      value={inlineStock}
                                      onChange={(e) => setInlineStock(Number(e.target.value))}
                                      className="w-16 bg-white border border-amber-400 rounded px-1 py-0.5 text-xs font-mono font-bold"
                                      placeholder="Stock"
                                    />
                                    <span className="text-xs text-slate-500 font-mono">pcs</span>
                                  </div>
                                ) : (
                                  <>
                                    <span className={`inline-block font-mono font-black px-2 py-0.5 rounded-full ${
                                      availQty <= 0 
                                        ? 'bg-red-100 text-red-700' 
                                        : isLow 
                                        ? 'bg-amber-100 text-amber-800' 
                                        : 'bg-teal-50 text-teal-700'
                                    }`}>
                                      {reservedQty > 0 ? `${availQty} avail` : `${totalQty} pcs`}
                                    </span>
                                    {reservedQty > 0 && (
                                      <p className="text-[10px] text-amber-700 mt-1 font-mono font-bold" title={(product.reservedForPreOrders || []).map(r => `${r.preOrderNumber}: ${r.qty}`).join(', ')}>
                                        Total: {totalQty} • Reserved: {reservedQty}
                                      </p>
                                    )}
                                    {isLow && availQty > 0 && (
                                      <p className="text-[9px] text-amber-600 mt-1 font-sans italic font-medium">Reorder Alert</p>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                {inlineEditProductId === product.id ? (
                                  <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                                    <span className="text-xs font-mono text-slate-400">৳</span>
                                    <input
                                      type="number"
                                      value={inlinePrice}
                                      onChange={(e) => setInlinePrice(Number(e.target.value))}
                                      className="w-24 bg-white border border-amber-400 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right"
                                      placeholder="Price"
                                    />
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-bold text-slate-900">৳ {product.sellingPrice.toLocaleString()}</p>
                                    {!isStaff && (
                                      <p className="text-[9px] text-slate-400 font-mono">Cost: ৳{product.costPrice}</p>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <div className="flex gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                                  {inlineEditProductId === product.id ? (
                                    <>
                                      <button
                                        onClick={(e) => handleSaveInlineEdit(product, e)}
                                        className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer transition-colors shadow-xs"
                                        title="Save Quick Edit"
                                      >
                                        <Check size={14} />
                                      </button>
                                      <button
                                        onClick={() => setInlineEditProductId(null)}
                                        className="p-1.5 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 cursor-pointer transition-colors"
                                        title="Cancel"
                                      >
                                        <X size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={(e) => handleStartInlineEdit(product, e)}
                                        className="p-1 text-teal-600 hover:text-teal-800 hover:bg-teal-50 rounded cursor-pointer transition-colors"
                                        title="Quick Price & Stock Edit (Inline)"
                                      >
                                        <Coins size={14} />
                                      </button>
                                      <button
                                        onClick={() => openEditDrawer(product)}
                                        className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer transition-colors"
                                        title="Edit Product"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleArchiveProduct(product)}
                                        className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded cursor-pointer transition-colors"
                                        title="Archive Product"
                                      >
                                        <Archive size={14} />
                                      </button>
                                      {(user?.role === 'admin' || user?.role === 'superadmin') && (
                                        <button
                                          onClick={() => handleDeleteClick(product)}
                                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                          title={user?.role === 'superadmin' ? "Permanently Delete Product" : "Submit Deletion Request"}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Desktop Grid View */
                <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4">
                  {paginatedProducts.length === 0 ? (
                    <div className="col-span-full py-10 text-center text-slate-400 italic text-xs">
                      No active gadget catalog records found.
                    </div>
                  ) : (
                    paginatedProducts.map((product) => {
                      const totalQty = (product.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
                      const reservedQty = Number(product.reservedQty) || 0;
                      const availQty = getProductAvailableStock(product);
                      const isLow = availQty <= (product.reorderThreshold ?? 5);

                      return (
                        <div 
                          key={product.id}
                          className={`bg-white border border-slate-200 rounded-2xl p-3 flex flex-col justify-between shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer ${
                            selectedProduct?.id === product.id ? 'border-amber-400 ring-2 ring-amber-300' : ''
                          }`}
                          onClick={() => setSelectedProduct(product)}
                        >
                          <div>
                            <div className="aspect-square w-full rounded-xl overflow-hidden bg-slate-50 relative flex items-center justify-center mb-3">
                              <ProductThumbnail
                                product={product}
                                wrapperClassName="relative w-full h-full block"
                                className="w-full h-full object-cover"
                                fallbackClassName="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400"
                              />
                              <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer size-4 bg-white/90"
                                  checked={selectedProductIds.includes(product.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductIds([...selectedProductIds, product.id]);
                                    } else {
                                      setSelectedProductIds(selectedProductIds.filter(id => id !== product.id));
                                    }
                                  }}
                                />
                              </div>
                              <div className="absolute top-2 right-2">
                                {renderSubBrandBadge(product.subBrand)}
                              </div>
                              <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md shadow-xs ${
                                  availQty <= 0 ? 'bg-rose-500 text-white' : isLow ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white'
                                }`}>
                                  {availQty <= 0 ? (reservedQty > 0 ? '0 Avail (Reserved)' : 'Out of Stock') : reservedQty > 0 ? `${availQty} avail / ${totalQty}` : `${totalQty} in stock`}
                                </span>
                                {reservedQty > 0 && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 shadow-xs">
                                    Res: {reservedQty}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                              <span className="truncate">{product.brand || product.category || 'Gadget'}</span>
                              <span className="font-mono text-xs text-slate-400">{product.sku}</span>
                            </div>

                            <h4 
                              className="text-sm font-bold text-slate-900 line-clamp-2 leading-tight mb-2 hover:text-amber-600 transition-colors min-h-[40px]"
                              title={product.name}
                            >
                              {product.name}
                            </h4>

                            <div className="flex items-baseline justify-between mb-3">
                              <span className="text-lg font-black text-amber-600 font-mono">
                                ৳{product.sellingPrice.toLocaleString()}
                              </span>
                              {!isStaff && (
                                <span className="text-xs text-slate-400 font-mono">
                                  Profit: ৳{(product.sellingPrice - product.costPrice).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => openEditDrawer(product)}
                              className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedProduct(product)}
                              className="py-1.5 px-2 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                            >
                              Overview
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Mobile Compact 2-Column Card Grid (8-10px gaps, 8px padding, 1:1 square cover image, 34-36px buttons) */}
              <div className="md:hidden grid grid-cols-2 gap-2 p-2">
                {paginatedProducts.length === 0 ? (
                  <div className="col-span-full py-10 text-center text-slate-400 italic text-xs">
                    No active gadget catalog records found.
                  </div>
                ) : (
                  paginatedProducts.map((product) => {
                    const totalQty = (product.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
                    const reservedQty = Number(product.reservedQty) || 0;
                    const availQty = getProductAvailableStock(product);
                    const isLow = availQty <= (product.reorderThreshold ?? 5);

                    return (
                      <div 
                        key={product.id}
                        className={`bg-white border border-slate-200/80 rounded-xl p-2 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all ${
                          selectedProduct?.id === product.id ? 'border-amber-400 ring-1 ring-amber-300' : ''
                        }`}
                      >
                        <div>
                          {/* Image area: 1:1 square ratio, object-fit: cover, corner radius 10-12px */}
                          <div 
                            onClick={() => setSelectedProduct(product)}
                            className="aspect-square w-full rounded-lg overflow-hidden bg-slate-50 relative flex items-center justify-center cursor-pointer mb-1.5"
                          >
                            <ProductThumbnail
                              product={product}
                              wrapperClassName="relative w-full h-full block"
                              className="w-full h-full object-cover"
                              fallbackClassName="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400"
                            />

                            {/* Checkbox overlay */}
                            <div className="absolute top-1.5 left-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer size-3.5 bg-white/90"
                                checked={selectedProductIds.includes(product.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedProductIds([...selectedProductIds, product.id]);
                                  } else {
                                    setSelectedProductIds(selectedProductIds.filter(id => id !== product.id));
                                  }
                                }}
                              />
                            </div>

                            {/* SubBrand Badge */}
                            <div className="absolute top-1.5 right-1.5">
                              {renderSubBrandBadge(product.subBrand)}
                            </div>

                            {/* Stock Badge */}
                            <div className="absolute bottom-1.5 left-1.5 flex gap-1 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs ${
                                availQty <= 0 ? 'bg-rose-500 text-white' : isLow ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600/90 text-white'
                              }`}>
                                {availQty <= 0 ? (reservedQty > 0 ? 'Out (Res)' : 'Out') : reservedQty > 0 ? `${availQty} avail` : `${totalQty} in stock`}
                              </span>
                            </div>
                          </div>

                          {/* Secondary info (Brand, SKU) - 11-12px */}
                          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                            <span className="truncate">{product.brand || product.category || 'Gadget'}</span>
                            <span className="font-mono text-[10px] text-slate-400 truncate">{product.sku}</span>
                          </div>

                          {/* Product Title - 13-14px, max 2 lines, ellipsis */}
                          <h4 
                            onClick={() => setSelectedProduct(product)}
                            className="text-[13px] font-semibold text-slate-900 line-clamp-2 leading-tight cursor-pointer hover:text-amber-600 transition-colors mb-1 min-h-[32px]"
                            title={product.name}
                          >
                            {product.name}
                          </h4>

                          {/* Price - 14-15px bold */}
                          <div className="text-[15px] font-bold text-amber-600 font-mono tracking-tight mb-2">
                            ৳{product.sellingPrice.toLocaleString()}
                          </div>
                        </div>

                        {/* Action buttons: Height 34-36px, text 12-13px, icon 16px */}
                        <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openEditDrawer(product)}
                            className="h-[34px] flex items-center justify-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedProduct(product)}
                            className="h-[34px] flex items-center justify-center gap-1 bg-slate-950 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                          >
                            Overview
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {sortedProducts.length > pageSize && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-600">
                  <span>
                    Showing {(safeCatalogPage - 1) * pageSize + 1}–{Math.min(safeCatalogPage * pageSize, sortedProducts.length)} of {sortedProducts.length} products
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={safeCatalogPage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer font-semibold"
                    >
                      Prev
                    </button>
                    <span className="font-mono font-bold">Page {safeCatalogPage}/{totalCatalogPages}</span>
                    <button
                      type="button"
                      disabled={safeCatalogPage >= totalCatalogPages}
                      onClick={() => setCurrentPage(p => Math.min(totalCatalogPages, p + 1))}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white disabled:opacity-40 cursor-pointer font-semibold"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bulk Barcode Printing, CSV Export & Brand Assignment Floating Action Bar */}
            {selectedProductIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white py-3.5 px-5 rounded-2xl shadow-xl flex flex-wrap items-center gap-3 border border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[94%] max-w-2xl">
                <div className="flex-1 min-w-[140px]">
                  <span className="text-sm font-bold font-mono text-amber-400 block">
                    {selectedProductIds.length} {selectedProductIds.length === 1 ? 'Product' : 'Products'} Selected
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                    Assign selling brand, export CSV, or print labels
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-700 hidden sm:block" />
                <div className="flex flex-wrap items-center gap-2">
                  {isAdminOrOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setBulkTargetBrand(defaultSellingSubBrand);
                        setIsBulkBrandModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                      title="Assign selling sub-brand without modifying SKU or barcode"
                    >
                      <Tag size={12} />
                      Assign Brand
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const selectedItems = products.filter(p => selectedProductIds.includes(p.id));
                      exportProductsToCSV(selectedItems, `selected-products-${selectedItems.length}-${new Date().toISOString().split('T')[0]}.csv`);
                    }}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    title="Export selected products to CSV"
                  >
                    <Download size={12} />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkBarcodeDownload}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Tag size={12} />
                    Barcodes
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedProductIds([])}
                    className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* BULK BRAND ASSIGNMENT MODAL */}
            {isBulkBrandModalOpen && isAdminOrOwner && typeof document !== 'undefined' && createPortal(
              <div
                className="fixed inset-0 z-[95] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
                onClick={() => !bulkAssigning && setIsBulkBrandModalOpen(false)}
              >
                <div
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        Assign Selling Sub-Brand
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Update {selectedProductIds.length} selected product(s). Existing SKUs &amp; printed barcodes will NOT be altered.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={bulkAssigning}
                      onClick={() => setIsBulkBrandModalOpen(false)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Target Selling Sub-Brand
                    </label>
                    <select
                      value={bulkTargetBrand}
                      onChange={(e) => setBulkTargetBrand(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      {activeSellingSubBrands.map((sb) => (
                        <option key={sb.shortCode} value={sb.shortCode}>
                          {sb.name} ({sb.shortCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={bulkAssigning}
                      onClick={() => setIsBulkBrandModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={bulkAssigning || !bulkTargetBrand}
                      onClick={async () => {
                        setBulkAssigning(true);
                        setFormError('');
                        try {
                          const count = await applyBulkProductBrandAssignment({
                            productIds: selectedProductIds,
                            targetSubBrandId: bulkTargetBrand,
                            actor: {
                              id: user?.id || '',
                              name: user?.name || 'Admin',
                              role: user?.role || 'admin',
                            },
                          });
                          setIsBulkBrandModalOpen(false);
                          setSelectedProductIds([]);
                          await onRefreshData();
                          setFormSuccess(`Assigned ${count} product(s) to ${bulkTargetBrand} without modifying SKU or barcode.`);
                          setTimeout(() => setFormSuccess(''), 4000);
                        } catch (err: any) {
                          setFormError(err?.message || 'Failed to bulk assign sub-brand.');
                        } finally {
                          setBulkAssigning(false);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {bulkAssigning && <Loader2 size={13} className="animate-spin" />}
                      <span>Apply Brand Tag</span>
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* FULL SCREEN PRODUCT OVERVIEW MODAL */}
            {selectedProduct && (
              <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] overflow-y-auto flex flex-col">
                  
                  {/* Modal Header */}
                  <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono tracking-widest font-extrabold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full uppercase">
                        {formatBrandBadgeMeta(selectedProduct.subBrand, subBrands, companySettings).shortLabel} Product Overview
                      </span>
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{selectedProduct.name}</h2>
                      <p className="text-xs font-mono text-slate-500">SKU: {selectedProduct.sku}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const prod = selectedProduct;
                          setSelectedProduct(null);
                          openEditDrawer(prod);
                        }}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Edit3 size={14} /> Edit Product
                      </button>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="p-2 bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-full transition-colors cursor-pointer flex items-center justify-center"
                        title="Close Full Screen View"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  {/* Modal Content */}
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Left Column: Barcode & Label Station */}
                    <div className="md:col-span-1 space-y-5">
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Scan & Barcode Station</span>
                          <div className="flex bg-slate-200 p-1 rounded-xl text-xs font-bold">
                            <button 
                              type="button"
                              onClick={() => setSelectedBarcodeTab('sku')}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${selectedBarcodeTab === 'sku' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              SKU
                            </button>
                            <button 
                              type="button"
                              onClick={() => setSelectedBarcodeTab('variants')}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${selectedBarcodeTab === 'variants' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                              Variants ({selectedProduct.variants?.length || 0})
                            </button>
                          </div>
                        </div>

                        {selectedBarcodeTab === 'sku' ? (
                          <div className="space-y-4 flex flex-col items-center">
                            <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col items-center w-full shadow-3xs">
                              <div className="bg-white py-3 px-2 rounded-xl border border-slate-100 w-full flex justify-center">
                                <Barcode 
                                  value={selectedProduct.barcodeValue || selectedProduct.sku} 
                                  height={80} 
                                  width={2.5} 
                                  fontSize={11}
                                  margin={5}
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 font-mono tracking-wider mt-2 uppercase text-center font-bold">{selectedProduct.barcodeValue || selectedProduct.sku}</p>
                            </div>

                            <div className="flex gap-2 w-full">
                              <button
                                type="button"
                                onClick={() => downloadBarcodePng(selectedProduct.barcodeValue || selectedProduct.sku, selectedProduct.name, 'Primary SKU Code')}
                                className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors shadow-3xs cursor-pointer"
                              >
                                <Upload size={14} className="rotate-180 text-amber-500" />
                                Download PNG
                              </button>
                              <button
                                type="button"
                                onClick={() => printProductLabelSheet(selectedProduct, 'primary')}
                                className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-500 rounded-xl text-xs font-bold text-slate-950 flex items-center justify-center gap-1.5 transition-colors shadow-3xs cursor-pointer"
                              >
                                <Tag size={14} />
                                Print Labels
                              </button>
                            </div>

                            <div className="w-full border-t border-dashed border-slate-200 pt-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs font-bold text-slate-800">QR Code</p>
                                <p className="text-[10px] text-slate-500">Scan via phone camera</p>
                              </div>
                              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-3xs">
                                <QRCodeSVG 
                                  value={selectedProduct.sku} 
                                  size={56} 
                                  bgColor={"#ffffff"} 
                                  fgColor={"#0f172a"} 
                                  level={"L"}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {selectedProduct.variants && selectedProduct.variants.length > 0 ? (
                              <>
                                <div className="flex justify-between items-center bg-amber-50 border border-amber-200 p-3 rounded-xl">
                                  <span className="text-xs font-bold text-amber-900">All Variants Barcodes</span>
                                  <button
                                    type="button"
                                    onClick={() => printProductLabelSheet(selectedProduct, 'variants')}
                                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 rounded-lg text-xs font-bold text-slate-950 flex items-center gap-1 transition-all cursor-pointer shadow-3xs"
                                  >
                                    <Tag size={12} />
                                    Print Sheet
                                  </button>
                                </div>

                                <div className="max-h-[280px] overflow-y-auto pr-1 space-y-2.5">
                                  {selectedProduct.variants.map((v) => {
                                    const cleanColor = v.color.trim();
                                    const cleanModel = v.model.trim();
                                    const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
                                    const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
                                    const fallbackBarcode = `${selectedProduct.sku}-${vColorCode}-${vModelCode}`;
                                    const val = v.barcodeValue || fallbackBarcode;

                                    return (
                                      <div key={v.id} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2 shadow-3xs">
                                        <div className="flex justify-between items-start">
                                          <div className="min-w-0 flex-1 pr-1">
                                            <h5 className="text-xs font-bold text-slate-800 truncate">{v.color} • {v.model}</h5>
                                            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-tight truncate">{val}</p>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => downloadBarcodePng(val, selectedProduct.name, `${v.color} / ${v.model}`)}
                                            className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                                          >
                                            <Upload size={12} className="rotate-180" />
                                          </button>
                                        </div>
                                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex justify-center">
                                          <Barcode 
                                            value={val} 
                                            height={60} 
                                            width={2.0} 
                                            fontSize={9}
                                            margin={3}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </>
                            ) : (
                              <p className="text-sm text-slate-400 italic text-center py-6">No variants configured.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Column / Center: Financials, Variants Grid, Live Stock Ledger */}
                    <div className="md:col-span-2 space-y-6">
                      
                      {/* Financial Summary Box */}
                      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-5 shadow-md grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Category</span>
                          <p className="text-sm font-bold mt-0.5 truncate">{selectedProduct.category}</p>
                        </div>
                        <div>
                          <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Brand</span>
                          <p className="text-sm font-bold mt-0.5 truncate">{selectedProduct.brand}</p>
                        </div>
                        {!isStaff && (
                          <div>
                            <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Cost Price</span>
                            <p className="text-base font-mono font-bold mt-0.5 text-amber-400">৳ {selectedProduct.costPrice.toLocaleString()}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-xs text-teal-300 uppercase tracking-wider font-bold">Selling Price</span>
                          <p className="text-lg font-mono font-black mt-0.5 text-teal-300">৳ {selectedProduct.sellingPrice.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* Variants Stock Grid */}
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-slate-900">Variants Stock Distribution</h4>
                          <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                            Reorder Threshold: {selectedProduct.reorderThreshold} pcs
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(selectedProduct.variants || []).map((v) => {
                            const avail = getVariantAvailableStock(v);
                            const res = Number(v.reservedQty) || 0;
                            return (
                              <div key={v.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center font-mono relative shadow-3xs">
                                {avail <= 0 && (
                                   <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full shadow-xs z-10">
                                     {res > 0 ? 'Reserved' : 'Out'}
                                   </span>
                                )}
                                <p className="text-xs font-bold text-slate-600 truncate">{v.color} • {v.model}</p>
                                <p className={`text-base font-black mt-1 ${avail <= 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                                  {res > 0 ? `${avail} avail` : `${v.stock} pcs`}
                                </p>
                                {res > 0 && (
                                  <p className="text-[10px] font-bold text-amber-700 mt-0.5">
                                    Total: {v.stock} • Res: {res}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Stock Ledger History */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                          <History size={16} className="text-teal-600" />
                          <span>Live Stock Ledger History & Audit Trail</span>
                        </div>
                        <div className="overflow-y-auto max-h-[220px] pr-1 space-y-2">
                          {productLogs.length === 0 ? (
                            <p className="text-sm text-slate-400 italic text-center py-6 bg-slate-50 rounded-2xl border border-slate-200">No stock operations logged yet.</p>
                          ) : (
                            productLogs.map((log) => (
                              <div key={log.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm shadow-3xs">
                                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                                  <span className="font-semibold">{new Date(log.timestamp).toLocaleString()}</span>
                                  <span className="font-bold uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">{log.reason}</span>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                  <span className="font-bold text-slate-800">Operator: {log.userName}</span>
                                  <span className={`font-mono font-black text-base ${
                                    log.qty > 0 ? 'text-teal-700' : 'text-rose-600'
                                  }`}>
                                    {log.qty > 0 ? `+${log.qty}` : log.qty} pcs
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 text-right mt-1">
                                  Before: {log.beforeQty} ➔ After: {log.afterQty}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                  </div>

                  {/* Modal Footer Actions */}
                  <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const prod = selectedProduct;
                          setSelectedProduct(null);
                          openEditDrawer(prod);
                        }}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Edit3 size={14} /> Edit Full Product Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const prod = selectedProduct;
                          setSelectedProduct(null);
                          handleArchiveProduct(prod);
                        }}
                        className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-3xs"
                      >
                        <Archive size={14} /> Archive
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      Done / Close
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* SUB TAB 2: CATEGORY CRUD */}
      {activeSubTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Add form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-950 font-sans">Add Category Record</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Category Hierarchy Level</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(['main', 'sub', 'child'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { setNewCatLevel(level); setNewCatParentMainId(''); setNewCatParentSubId(''); }}
                      className={`py-1.5 px-3 text-sm font-bold rounded-xl transition-all border ${
                        newCatLevel === level 
                          ? 'bg-slate-900 text-amber-400 border-slate-900' 
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {level === 'main' ? 'Main' : level === 'sub' ? 'Sub' : 'Child'}
                    </button>
                  ))}
                </div>
              </div>

              {newCatLevel === 'sub' && (
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Parent Main Category</label>
                  <select
                    value={newCatParentMainId}
                    onChange={(e) => setNewCatParentMainId(e.target.value)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800"
                    required
                  >
                    <option value="">-- Select Main Category Parent --</option>
                    {categories.filter(c => c.level === 'main' || !c.level).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {newCatLevel === 'child' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Filter Parent by Main Category</label>
                    <select
                      value={newCatParentMainId}
                      onChange={(e) => { setNewCatParentMainId(e.target.value); setNewCatParentSubId(''); }}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800"
                    >
                      <option value="">-- All Main Categories --</option>
                      {categories.filter(c => c.level === 'main' || !c.level).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Parent Sub Category</label>
                    <select
                      value={newCatParentSubId}
                      onChange={(e) => setNewCatParentSubId(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800"
                      required
                    >
                      <option value="">-- Select Sub Category Parent --</option>
                      {categories.filter(c => {
                        const matchesLevel = c.level === 'sub';
                        const matchesParent = !newCatParentMainId || c.parentId === newCatParentMainId;
                        return matchesLevel && matchesParent;
                      }).map(c => {
                        const mainParentName = categories.find(p => p.id === c.parentId)?.name || '';
                        return (
                          <option key={c.id} value={c.id}>
                            {c.name} {mainParentName ? `(under ${mainParentName})` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder={newCatLevel === 'main' ? "e.g. Audio" : newCatLevel === 'sub' ? "e.g. Earbuds" : "e.g. TWS"}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition-all shadow-md cursor-pointer"
              >
                Create {newCatLevel === 'main' ? 'Main' : newCatLevel === 'sub' ? 'Sub' : 'Child'} Category
              </button>
            </form>
          </div>

          {/* List categories tree */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-950 font-sans">Active Product Categories Tree</h3>
                <p className="text-[11px] text-slate-500 font-medium">{categories.length} Categories in hierarchical tree</p>
              </div>
              <button
                type="button"
                onClick={() => exportCategoriesToCSV(categories, products)}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-800 rounded-xl cursor-pointer transition-colors shadow-2xs"
                title="Bulk Export all Categories to CSV"
              >
                <Download size={13} className="text-emerald-600" />
                Bulk CSV Export
              </button>
            </div>
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {categories.filter(c => c.level === 'main' || !c.level).length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-8">No categories seeded or created yet.</p>
              ) : (
                categories.filter(c => c.level === 'main' || !c.level).map((mainCat) => {
                  const subCats = categories.filter(c => c.level === 'sub' && c.parentId === mainCat.id);
                  
                  return (
                    <div key={mainCat.id} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2">
                      <div className="flex justify-between items-center bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                        {editingCatId === mainCat.id ? (
                          <div className="flex items-center gap-1.5 flex-grow">
                            <input
                              type="text"
                              value={editingCatName}
                              onChange={(e) => setEditingCatName(e.target.value)}
                              className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-sm font-semibold text-slate-800 focus:outline-hidden"
                            />
                            <button
                              onClick={() => handleUpdateCategory(mainCat.id, editingCatName, 'main', null)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md cursor-pointer"
                            >
                              <Check size={12} />
                            </button>
                            <button
                              onClick={() => setEditingCatId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-50 rounded-md cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight">📁 {mainCat.name}</span>
                            {!isStaff && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingCatId(mainCat.id);
                                    setEditingCatName(mainCat.name);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer"
                                  title="Rename Category"
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteCategory(mainCat.id, mainCat.name)}
                                  disabled={deletingCatId === mainCat.id}
                                  className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
 
                      {/* Render Sub categories */}
                      <div className="pl-4 space-y-2">
                        {subCats.length === 0 ? (
                          <p className="text-sm text-slate-400 italic pl-3">No nested sub-categories.</p>
                        ) : (
                          subCats.map((subCat) => {
                            const childCats = categories.filter(c => c.level === 'child' && c.parentId === subCat.id);
                            
                            return (
                              <div key={subCat.id} className="border-l-2 border-amber-200 pl-3 py-1 space-y-1">
                                <div className="flex justify-between items-center group">
                                  {editingCatId === subCat.id ? (
                                    <div className="flex items-center gap-1.5 flex-grow">
                                      <input
                                        type="text"
                                        value={editingCatName}
                                        onChange={(e) => setEditingCatName(e.target.value)}
                                        className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-sm font-semibold text-slate-800 focus:outline-hidden"
                                      />
                                      <button
                                        onClick={() => handleUpdateCategory(subCat.id, editingCatName, 'sub', mainCat.id)}
                                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md cursor-pointer"
                                      >
                                        <Check size={12} />
                                      </button>
                                      <button
                                        onClick={() => setEditingCatId(null)}
                                        className="p-1 text-slate-400 hover:bg-slate-50 rounded-md cursor-pointer"
                                      >
                                        <X size={12} />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <span className="text-sm font-bold text-slate-800">↳ 📂 {subCat.name}</span>
                                      {!isStaff && (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => {
                                              setEditingCatId(subCat.id);
                                              setEditingCatName(subCat.name);
                                            }}
                                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                                            title="Rename Subcategory"
                                          >
                                            <Edit3 size={11} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteCategory(subCat.id, subCat.name)}
                                            disabled={deletingCatId === subCat.id}
                                            className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                          >
                                            <Trash2 size={10} />
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
 
                                {/* Render Child categories */}
                                <div className="pl-4 space-y-1">
                                  {childCats.length === 0 ? (
                                    <p className="text-[9px] text-slate-400 italic pl-3">No nested child-categories.</p>
                                  ) : (
                                    childCats.map((childCat) => (
                                      <div key={childCat.id} className="flex justify-between items-center bg-white border border-slate-100 px-2 py-1 rounded-md group">
                                        {editingCatId === childCat.id ? (
                                          <div className="flex items-center gap-1.5 flex-grow">
                                            <input
                                              type="text"
                                              value={editingCatName}
                                              onChange={(e) => setEditingCatName(e.target.value)}
                                              className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-sm font-semibold text-slate-800 focus:outline-hidden"
                                            />
                                            <button
                                              onClick={() => handleUpdateCategory(childCat.id, editingCatName, 'child', subCat.id)}
                                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md cursor-pointer"
                                            >
                                              <Check size={12} />
                                            </button>
                                            <button
                                              onClick={() => setEditingCatId(null)}
                                              className="p-1 text-slate-400 hover:bg-slate-50 rounded-md cursor-pointer"
                                            >
                                              <X size={12} />
                                            </button>
                                          </div>
                                        ) : (
                                          <>
                                            <span className="text-sm font-medium text-slate-600">▪ {childCat.name}</span>
                                            {!isStaff && (
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => {
                                                    setEditingCatId(childCat.id);
                                                    setEditingCatName(childCat.name);
                                                  }}
                                                  className="p-0.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                                                  title="Rename Child Category"
                                                >
                                                  <Edit3 size={11} />
                                                </button>
                                                <button
                                                  onClick={() => handleDeleteCategory(childCat.id, childCat.name)}
                                                  disabled={deletingCatId === childCat.id}
                                                  className="p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                                >
                                                  <Trash2 size={10} />
                                                </button>
                                              </div>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* SUB TAB 3: BRAND & DIVISION MODULE */}
      {activeSubTab === 'brands' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Add Brand Form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 lg:col-span-1">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Add Brand Record</h3>
                <p className="text-[11px] text-slate-500 font-medium">Create a new brand or sub-brand division</p>
              </div>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Tag size={16} />
              </span>
            </div>

            <form onSubmit={handleAddBrand} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Brand Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sky Automation Tech"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:bg-white focus:border-amber-400 focus:outline-hidden font-medium"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Logo Image URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={newBrandLogoUrl}
                  onChange={(e) => setNewBrandLogoUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:bg-white focus:border-amber-400 focus:outline-hidden text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Associated Selling Sub-Brands
                </label>
                <div className="flex flex-wrap gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  {activeSellingSubBrands.map((brandMeta) => {
                    const sb = brandMeta.shortCode;
                    const isChecked = newBrandSubBrands.includes(sb);
                    return (
                      <label 
                        key={sb} 
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all border ${
                          isChecked ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewBrandSubBrands([...newBrandSubBrands, sb]);
                            } else {
                              setNewBrandSubBrands(newBrandSubBrands.filter(s => s !== sb));
                            }
                          }}
                          className="sr-only"
                        />
                        <span>{brandMeta.name} ({sb})</span>
                        {isChecked && <Check size={12} className="text-amber-700" />}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Associated Categories
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  {categories.filter(c => c.level === 'main' || !c.level).map((cat) => {
                    const isChecked = newBrandCategories.includes(cat.name);
                    return (
                      <label 
                        key={cat.id} 
                        className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white text-xs font-medium text-slate-700 cursor-pointer"
                      >
                        <span>{cat.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewBrandCategories([...newBrandCategories, cat.name]);
                            } else {
                              setNewBrandCategories(newBrandCategories.filter(c => c !== cat.name));
                            }
                          }}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                Create Brand
              </button>
            </form>
          </div>

          {/* List Brands & Computed Metrics */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Brand Management & Metrics</h3>
                <p className="text-[11px] text-slate-500 font-medium">{brands.length} Brands registered in SkyMart catalog</p>
              </div>
              <button
                type="button"
                onClick={() => exportBrandsToCSV(brands, products)}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-xs font-bold text-emerald-800 rounded-xl cursor-pointer transition-colors shadow-2xs"
                title="Bulk Export all Brands to CSV with stock metrics"
              >
                <Download size={13} className="text-emerald-600" />
                Bulk CSV Export
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-1">
              {brands.length === 0 ? (
                <div className="col-span-2 py-12 text-center text-slate-400 text-xs font-medium">
                  No brands registered yet. Create your first brand on the left.
                </div>
              ) : (
                brands.map((brand) => {
                  // Compute Metrics
                  const brandProds = products.filter(p => p.brand === brand.name && !p.archived);
                  const totalProds = brandProds.length;
                  let inStockCount = 0;
                  let outOfStockCount = 0;
                  let totalUnits = 0;

                  brandProds.forEach(p => {
                    const stock = p.variants?.reduce((sum, v) => sum + (v.stock || 0), 0) ?? (p.totalStock || 0);
                    totalUnits += stock;
                    if (stock > 0) inStockCount++;
                    else outOfStockCount++;
                  });

                  const isEditing = editingBrandId === brand.id;

                  return (
                    <div key={brand.id} className="p-4 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3 transition-all group">
                      
                      {isEditing ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500">Name</label>
                            <input
                              type="text"
                              value={editingBrandName}
                              onChange={(e) => setEditingBrandName(e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-500">Logo URL</label>
                            <input
                              type="text"
                              value={editingBrandLogoUrl}
                              onChange={(e) => setEditingBrandLogoUrl(e.target.value)}
                              placeholder="https://..."
                              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-mono text-slate-800"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleUpdateBrand(
                                brand.id, 
                                editingBrandName, 
                                editingBrandLogoUrl, 
                                editingBrandSubBrands, 
                                editingBrandCategories
                              )}
                              className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 cursor-pointer flex items-center gap-1"
                            >
                              <Check size={12} /> Save
                            </button>
                            <button
                              onClick={() => setEditingBrandId(null)}
                              className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 cursor-pointer flex items-center gap-1"
                            >
                              <X size={12} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Brand Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              {brand.logoUrl ? (
                                <img src={brand.logoUrl} alt={brand.name} className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 border border-amber-200 font-extrabold text-xs flex items-center justify-center shrink-0">
                                  {brand.name.substring(0, 2).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-900 leading-tight">{brand.name}</h4>
                                {brand.associatedSubBrands && brand.associatedSubBrands.length > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {brand.associatedSubBrands.map(sb => (
                                      <span key={sb} className="text-[9px] font-bold uppercase tracking-wider bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded">
                                        {sb}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>

                            {!isStaff && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setEditingBrandId(brand.id);
                                    setEditingBrandName(brand.name);
                                    setEditingBrandLogoUrl(brand.logoUrl || '');
                                    setEditingBrandSubBrands(brand.associatedSubBrands || []);
                                    setEditingBrandCategories(brand.associatedCategories || []);
                                  }}
                                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                                  title="Edit Brand"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteBrand(brand.id, brand.name)}
                                  disabled={deletingBrandId === brand.id}
                                  className={`p-1 rounded-lg ${deletingBrandId === brand.id ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                                  title="Delete Brand"
                                >
                                  {deletingBrandId === brand.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={13} />}
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Categories Badges */}
                          {brand.associatedCategories && brand.associatedCategories.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {brand.associatedCategories.map(cat => (
                                <span key={cat} className="text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60 px-1.5 py-0.2 rounded-md">
                                  {cat}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Auto-computed Metrics Grid */}
                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                            <div className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Products</span>
                              <span className="text-sm font-black text-slate-900 mt-0.5">{totalProds} items</span>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-slate-100 flex flex-col">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Inventory</span>
                              <span className="text-sm font-black text-indigo-700 mt-0.5">{totalUnits} units</span>
                            </div>
                            <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100 flex flex-col">
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">In Stock</span>
                              <span className="text-sm font-black text-emerald-800 mt-0.5">{inStockCount} items</span>
                            </div>
                            <div className="bg-rose-50/60 p-2 rounded-xl border border-rose-100 flex flex-col">
                              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Out of Stock</span>
                              <span className="text-sm font-black text-rose-800 mt-0.5">{outOfStockCount} items</span>
                            </div>
                          </div>
                        </>
                      )}

                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* SUB TAB: PENDING PRODUCTS FOR APPROVAL */}
      {/* SUB TAB: ATTRIBUTES CRUD */}
      {activeSubTab === 'attributes' && !isStaff && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Colors Management */}
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-950 font-sans">Add Color Record</h3>
              <form onSubmit={handleAddColor} className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-3">
                    <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Color Name</label>
                    <input
                      type="text"
                      required
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="e.g. Space Black"
                      className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#D4AF37] transition-all"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Color Hex</label>
                    <input
                      type="color"
                      value={newColorHex}
                      onChange={(e) => setNewColorHex(e.target.value)}
                      className="mt-1 w-full h-10 p-1 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={!newColorName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[#16161b] hover:bg-black text-[#D4AF37] p-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} /> Add Color
                </button>
              </form>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-950 font-sans">Active Product Colors</h3>
              {productColors.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">No colors added yet.</div>
              ) : (
                <div className="space-y-2">
                  {productColors.sort((a,b) => a.name.localeCompare(b.name)).map((c) => (
                    <div key={c.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-slate-300 transition-colors bg-white">
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-full border border-slate-200 shadow-sm" style={{ backgroundColor: c.hexCode || '#000000' }} />
                        <span className="text-sm font-bold text-slate-700">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteColor(c.id, c.name)}
                          disabled={deletingColorId === c.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          title="Delete Color"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Models Management */}
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-950 font-sans">Add Model/Size Record</h3>
              <form onSubmit={handleAddModel} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">Model/Size Name</label>
                  <input
                    type="text"
                    required
                    value={newModelName}
                    onChange={(e) => setNewModelName(e.target.value)}
                    placeholder="e.g. 256GB / XL / Standard"
                    className="mt-1 w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#D4AF37] transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newModelName.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-[#16161b] hover:bg-black text-[#D4AF37] p-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={16} /> Add Model/Size
                </button>
              </form>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-950 font-sans">Active Product Models & Sizes</h3>
              {productModels.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">No models/sizes added yet.</div>
              ) : (
                <div className="space-y-2">
                  {productModels.sort((a,b) => a.name.localeCompare(b.name)).map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-slate-300 transition-colors bg-white">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-700">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteModel(m.id, m.name)}
                          disabled={deletingModelId === m.id}
                          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                          title="Delete Model/Size"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'pending' && isSuperAdmin && (() => {
        const allPendingProducts = products
          .filter((p) => p.status === 'pending_review' && !p.archived)
          .sort((a, b) => (b.submittedAt || b.createdAt || 0) - (a.submittedAt || a.createdAt || 0));

        // Build unique submitters for filter dropdown
        const submitterOptionsMap = new Map<string, string>();
        allPendingProducts.forEach((p) => {
          const key = p.submittedBy?.uid || p.createdById || p.submittedBy?.name || p.createdBy || 'unknown';
          const label = p.submittedBy?.name || p.createdBy || 'Unknown';
          if (!submitterOptionsMap.has(key)) {
            submitterOptionsMap.set(key, label);
          }
        });
        const submitterOptions = Array.from(submitterOptionsMap.entries());

        const searchLower = pendingSearch.trim().toLowerCase();
        const filteredPendingProducts = allPendingProducts.filter((p) => {
          const subName = (p.submittedBy?.name || p.createdBy || 'Unknown').toLowerCase();
          const subKey = p.submittedBy?.uid || p.createdById || p.submittedBy?.name || p.createdBy || 'unknown';
          const catPath = buildCategoryPathLabel(p).toLowerCase();

          const matchesQuery =
            !searchLower ||
            (p.name || '').toLowerCase().includes(searchLower) ||
            (p.sku || '').toLowerCase().includes(searchLower) ||
            (p.brand || '').toLowerCase().includes(searchLower) ||
            catPath.includes(searchLower) ||
            subName.includes(searchLower);

          const matchesSubBrand =
            !pendingSubBrandFilter
              ? true
              : pendingSubBrandFilter === 'NEEDS_ASSIGNMENT'
              ? productNeedsBrandAssignment(p, subBrands, companySettings)
              : pendingSubBrandFilter === 'LEGACY_SAT'
              ? isLegacySatCode(p.subBrand)
              : normalizeSubBrandCode(p.subBrand) === normalizeSubBrandCode(pendingSubBrandFilter);

          const matchesSubmitter =
            !pendingSubmitterFilter || subKey === pendingSubmitterFilter;

          return matchesQuery && matchesSubBrand && matchesSubmitter;
        });

        const hasActiveFilters = Boolean(
          pendingSearch.trim() || pendingSubBrandFilter || pendingSubmitterFilter
        );

        return (
          <div className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            {/* Queue Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/60">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Pending Products Approval Queue
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-xs font-mono font-bold tabular-nums">
                    {allPendingProducts.length} Pending
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Click any row or Review to inspect full photos, barcode, variants, and edit before approving.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={refreshQueueWithState}
                  disabled={pendingLoading}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={13} className={pendingLoading ? 'animate-spin' : ''} />
                  <span>Refresh</span>
                </button>

                {filteredPendingProducts.length > 0 && (
                  <button
                    type="button"
                    disabled={pendingLoading || Boolean(pendingActionLoadingId)}
                    onClick={() => handleApproveAllPending(filteredPendingProducts)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    <Check size={13} />
                    <span>
                      Approve All ({filteredPendingProducts.length})
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Search & Filters Row */}
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-6 relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={pendingSearch}
                  onChange={(e) => setPendingSearch(e.target.value)}
                  placeholder="Search by product name, SKU, category, brand, or submitter..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={pendingSubBrandFilter}
                  onChange={(e) => setPendingSubBrandFilter(e.target.value)}
                  aria-label="Filter by Sub-Brand"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                >
                  <option value="">All Selling Sub-Brands</option>
                  {allSellingSubBrands.map((sb) => (
                    <option key={sb.shortCode} value={sb.shortCode}>
                      {sb.shortCode} — {sb.name}
                    </option>
                  ))}
                  <option value="NEEDS_ASSIGNMENT">Needs Brand Assignment</option>
                  <option value="LEGACY_SAT">Legacy (SAT)</option>
                </select>
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <select
                  value={pendingSubmitterFilter}
                  onChange={(e) => setPendingSubmitterFilter(e.target.value)}
                  aria-label="Filter by Submitter"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-200 font-semibold cursor-pointer"
                >
                  <option value="">Submitted By: Everyone</option>
                  {submitterOptions.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingSearch('');
                      setPendingSubBrandFilter('');
                      setPendingSubmitterFilter('');
                    }}
                    className="px-2.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 text-xs font-bold cursor-pointer shrink-0"
                    title="Reset filters"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* Body States: Error / Skeleton / Empty / Full-Width Table */}
            {pendingError ? (
              <div className="p-8 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center border border-rose-500/25">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Unable to Load Pending Queue
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {pendingError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={refreshQueueWithState}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  <span>Retry</span>
                </button>
              </div>
            ) : pendingLoading && allPendingProducts.length === 0 ? (
              <div className="p-5 space-y-3" aria-busy="true" aria-label="Loading pending products">
                {[0, 1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-3 rounded-xl bg-slate-100/70 dark:bg-slate-800/50 animate-pulse"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0" />
                    <div className="flex-1 grid grid-cols-4 gap-3">
                      <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
                      <div className="h-4 rounded bg-slate-200 dark:bg-slate-700" />
                    </div>
                  </div>
                ))}
              </div>
            ) : allPendingProducts.length === 0 ? (
              <div className="py-16 px-6 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Inbox size={26} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    No products waiting for approval
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    New or edited items submitted by Staff & Admin operators will appear here.
                  </p>
                </div>
              </div>
            ) : filteredPendingProducts.length === 0 ? (
              <div className="py-12 px-6 text-center flex flex-col items-center justify-center space-y-3">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                  No pending products match your current search or filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPendingSearch('');
                    setPendingSubBrandFilter('');
                    setPendingSubmitterFilter('');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Clear Filters
                </button>
              </div>
            ) : (
              <>
                {/* Full-Width Desktop / Laptop Table */}
                <div className="hidden md:block w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="py-3.5 px-4 font-bold">Image</th>
                        <th className="py-3.5 px-3 font-bold">Product Name & SKU</th>
                        <th className="py-3.5 px-3 font-bold text-center">Sub-Brand</th>
                        <th className="py-3.5 px-3 font-bold">Category / Brand</th>
                        {!isStaff && (
                          <th className="py-3.5 px-3 font-bold text-right">Purchase Price</th>
                        )}
                        <th className="py-3.5 px-3 font-bold text-right">Selling Price</th>
                        <th className="py-3.5 px-3 font-bold text-right">Total Stock</th>
                        <th className="py-3.5 px-3 font-bold">Submitted By</th>
                        <th className="py-3.5 px-3 font-bold">Submitted Date</th>
                        <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                      {filteredPendingProducts.map((product) => {
                        const totalQty = (product.variants || []).reduce(
                          (s, v) => s + (Number(v.stock) || 0),
                          0
                        );
                        const submitterName =
                          product.submittedBy?.name || product.createdBy || 'Unknown';
                        const submitterRole = product.submittedBy?.role || 'operator';
                        const submittedAt = product.submittedAt || product.createdAt;
                        const isBusy = pendingActionLoadingId === product.id;

                        return (
                          <tr
                            key={product.id}
                            onClick={() => setReviewProductId(product.id)}
                            className="hover:bg-amber-50/40 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                          >
                            <td className="py-3 px-4">
                              <ProductThumbnail
                                product={product}
                                showCountBadge
                                className="w-11 h-11 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                                fallbackClassName="w-11 h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400"
                              />
                            </td>
                            <td className="py-3 px-3 min-w-[210px] max-w-[300px]">
                              <p className="font-bold text-slate-900 dark:text-white leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                                {product.name}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                                  {product.sku}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                  {(product.variants || []).length} var
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              {renderSubBrandBadge(product.subBrand)}
                            </td>
                            <td className="py-3 px-3 min-w-[160px] max-w-[240px]">
                              <p
                                className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate"
                                title={buildCategoryPathLabel(product)}
                              >
                                {buildCategoryPathLabel(product)}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {product.brand || 'Generic'}
                              </p>
                            </td>
                            {!isStaff && (
                              <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                ৳{Number(product.costPrice || 0).toLocaleString()}
                              </td>
                            )}
                            <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                              ৳{Number(product.sellingPrice || 0).toLocaleString()}
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                              {totalQty} pcs
                            </td>
                            <td className="py-3 px-3 min-w-[140px]">
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-800 dark:text-amber-300 border border-amber-400/30 flex items-center justify-center text-[10px] font-black shrink-0">
                                  <User size={13} />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                    {submitterName}
                                  </p>
                                  <p className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                                    {submitterRole}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatShortDateTime(submittedAt)}
                            </td>
                            <td
                              className="py-3 px-4 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => setReviewProductId(product.id)}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <Eye size={13} />
                                  <span>Review</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => openEditDrawer(product, true)}
                                  title="Edit pending product"
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 cursor-pointer disabled:opacity-50"
                                >
                                  <Edit3 size={13} />
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleRequestApproveProduct(product)}
                                  title="Approve product"
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  {isBusy ? (
                                    <Loader2 size={13} className="animate-spin" />
                                  ) : (
                                    <Check size={13} />
                                  )}
                                  <span>Approve</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setRejectModalProduct(product);
                                    setRejectModalReason('');
                                    setRejectModalError('');
                                  }}
                                  title="Reject product"
                                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                >
                                  <X size={13} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Compact Card List */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPendingProducts.map((product) => {
                    const totalQty = (product.variants || []).reduce(
                      (s, v) => s + (Number(v.stock) || 0),
                      0
                    );
                    const submitterName =
                      product.submittedBy?.name || product.createdBy || 'Unknown';
                    const submittedAt = product.submittedAt || product.createdAt;
                    const isBusy = pendingActionLoadingId === product.id;

                    return (
                      <div
                        key={product.id}
                        onClick={() => setReviewProductId(product.id)}
                        className="p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <ProductThumbnail
                            product={product}
                            showCountBadge
                            className="w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                            fallbackClassName="w-12 h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {renderSubBrandBadge(product.subBrand)}
                              <span className="text-[11px] font-mono text-slate-500 truncate">
                                {product.sku}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                              {product.name}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {buildCategoryPathLabel(product)} • {product.brand}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                          {!isStaff && (
                            <div>
                              <span className="text-[10px] text-slate-400 block">Cost</span>
                              <span className="font-mono font-bold">
                                ৳{Number(product.costPrice || 0).toLocaleString()}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="text-[10px] text-slate-400 block">Selling</span>
                            <span className="font-mono font-bold">
                              ৳{Number(product.sellingPrice || 0).toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Stock</span>
                            <span className="font-mono font-bold">{totalQty} pcs</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                          <span>By {submitterName}</span>
                          <span className="font-mono">{formatShortDateTime(submittedAt)}</span>
                        </div>

                        <div
                          className="grid grid-cols-4 gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setReviewProductId(product.id)}
                            className="py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-950 text-xs font-bold cursor-pointer"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditDrawer(product, true)}
                            className="py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRequestApproveProduct(product)}
                            className="py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setRejectModalProduct(product);
                              setRejectModalReason('');
                              setRejectModalError('');
                            }}
                            className="py-2 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* SUB TAB: OUT OF STOCK */}
      {activeSubTab === 'out_of_stock' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900">Out of Stock</h3>
              <p className="text-sm text-slate-500">Products with 0 inventory remaining. Restock to move them back to the active catalog.</p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-slate-600">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-sm font-mono tracking-wider text-slate-400 uppercase">
                  <th className="py-3 px-4 font-bold">Image</th>
                  <th className="py-3 px-3 font-bold">Product Info</th>
                  <th className="py-3 px-3 font-bold text-center">Division</th>
                  <th className="py-3 px-3 font-bold text-right">Price</th>
                  <th className="py-3 px-3 font-bold text-center">Stock</th>
                  <th className="py-3 px-4 text-center font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.filter(p => (p.stockStatus === 'out_of_stock' || getProductAvailableStock(p) <= 0) && !p.archived).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400 italic">
                      No out of stock products found.
                    </td>
                  </tr>
                ) : (
                  products.filter(p => (p.stockStatus === 'out_of_stock' || getProductAvailableStock(p) <= 0) && !p.archived).map((product) => {
                    const totalQty = (product.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
                    const reservedQty = Number(product.reservedQty) || 0;
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <ProductThumbnail product={product} />
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900 leading-tight">{product.name}</p>
                          <p className="text-sm text-slate-400 font-mono mt-0.5">{product.sku}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                              {product.brand}
                            </span>
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                              {product.category}
                            </span>
                            {reservedQty > 0 && (
                              <span className="bg-amber-100 text-amber-800 text-[9px] font-mono font-bold px-1.5 rounded">
                                {(product.reservedForPreOrders || []).map(r => r.preOrderNumber).join(', ') || 'Pre-Order Reserved'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderSubBrandBadge(product.subBrand)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <p className="font-bold text-slate-900">৳ {product.sellingPrice.toLocaleString()}</p>
                        </td>
                        <td className="py-3 px-3 text-center">
                           {reservedQty > 0 && totalQty > 0 ? (
                             <span className="text-amber-700 font-black text-xs bg-amber-50 border border-amber-200 px-2 py-1 rounded-md">
                               0 avail (Res: {reservedQty} / {totalQty})
                             </span>
                           ) : (
                             <span className="text-rose-600 font-black text-sm bg-rose-50 px-2 py-1 rounded-md">0 pcs</span>
                           )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              if (onNavigateToStock) {
                                onNavigateToStock(product.id);
                              } else {
                                setSelectedProduct(product);
                                handleSelectSubTab('catalog');
                              }
                            }}
                            className="bg-amber-400 hover:bg-amber-500 text-slate-900 px-3 py-1.5 font-bold text-sm rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow-xs transition-colors mx-auto"
                          >
                            <PackagePlus size={14} /> Restock
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB: ARCHIVE */}
      {activeSubTab === 'archive' && isSuperAdmin && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-black text-slate-900">Archived Products</h3>
              <p className="text-sm text-slate-500">Soft-deleted products that have been hidden from the active catalog.</p>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm text-slate-600">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-sm font-mono tracking-wider text-slate-400 uppercase">
                  <th className="py-3 px-4 font-bold">Image</th>
                  <th className="py-3 px-3 font-bold">Product Info</th>
                  <th className="py-3 px-3 font-bold text-center">Division</th>
                  <th className="py-3 px-3 font-bold text-right">Price</th>
                  <th className="py-3 px-4 text-center font-bold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.filter(p => p.archived).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                      No archived products found.
                    </td>
                  </tr>
                ) : (
                  products.filter(p => p.archived).map((product) => {
                    return (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <ProductThumbnail product={product} />
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-900 leading-tight">{product.name}</p>
                          <p className="text-sm text-slate-400 font-mono mt-0.5">{product.sku}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                              {product.brand}
                            </span>
                            <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                              {product.category}
                            </span>
                            {product.deletionStatus === 'pending_approval' && (
                              <span className="bg-rose-100 text-rose-700 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded animate-pulse">
                                Deletion Pending
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {renderSubBrandBadge(product.subBrand)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <p className="font-bold text-slate-900">৳ {product.sellingPrice.toLocaleString()}</p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleUnarchiveProduct(product)}
                              disabled={product.deletionStatus === 'pending_approval'}
                              className={`px-3 py-1.5 font-bold text-sm rounded-lg cursor-pointer flex items-center justify-center gap-1.5 transition-all ${
                                product.deletionStatus === 'pending_approval'
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-50'
                                  : 'bg-amber-400 hover:bg-amber-500 text-slate-950'
                              }`}
                              title={product.deletionStatus === 'pending_approval' ? "Cannot restore a product with pending deletion." : "Restore to Catalog"}
                            >
                              Restore to Catalog
                            </button>
                            {(user?.role === 'admin' || user?.role === 'superadmin') && (
                              <button
                                onClick={() => handleDeleteClick(product)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg cursor-pointer transition-colors flex items-center justify-center"
                                title={user?.role === 'superadmin' ? "Permanently Delete Product" : "Submit Deletion Request"}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB: DELETION REQUESTS */}
      {activeSubTab === 'deletion_requests' && user?.role === 'superadmin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden p-6 space-y-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Pending Deletion Requests</h3>
            <p className="text-sm text-slate-500">Products flagged for deletion by administrators. Super Admin review required.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {products.filter(p => p.deletionStatus === 'pending_approval').length === 0 ? (
              <div className="col-span-full py-10 text-center text-slate-400 italic text-sm">
                No pending deletion requests found.
              </div>
            ) : (
              products.filter(p => p.deletionStatus === 'pending_approval').map((product) => {
                return (
                  <div key={product.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-200">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          {renderSubBrandBadge(product.subBrand)}
                          <h4 className="text-sm font-black text-slate-900 mt-1.5">{product.name}</h4>
                          <p className="text-[9px] font-mono font-bold text-slate-400 uppercase mt-0.5">SKU: {product.sku}</p>
                        </div>
                        <ProductThumbnail
                          product={product}
                          className="w-12 h-12 object-cover rounded-xl border border-slate-200"
                          fallbackClassName="w-12 h-12 rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-100 pt-2 text-sm">
                        <div>
                          <span className="text-slate-400 font-medium block">Category:</span>
                          <span className="font-semibold text-slate-700 truncate block">{product.category}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium block">Brand:</span>
                          <span className="font-semibold text-slate-700 truncate block">{product.brand}</span>
                        </div>
                      </div>
                    </div>
                    
                    {!isSuperAdmin ? (
                      <div className="border-t border-slate-200 pt-3 p-2.5 bg-amber-50 border border-amber-200/80 rounded-xl text-center text-xs text-amber-800 font-bold flex items-center justify-center gap-1.5">
                        <Clock size={13} className="text-amber-600" />
                        Awaiting Super Admin Approval
                      </div>
                    ) : (
                      <div className="border-t border-slate-200 pt-3 flex gap-2">
                        <button
                          onClick={() => {
                            showConfirm(
                              "Approve Deletion?",
                              `Are you sure you want to permanently delete "${product.name}"? This action cannot be undone.`,
                              async () => {
                                await executePermanentDelete(product, async () => {
                                  await onRefreshData();
                                  setFormSuccess(`Permanently deleted "${product.name}".`);
                                  setTimeout(() => setFormSuccess(''), 3000);
                                });
                              }
                            );
                          }}
                          className="flex-grow py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-sm rounded-lg shadow-3xs cursor-pointer flex items-center justify-center gap-1 transition-all"
                        >
                          <Check size={12} /> Approve (Delete)
                        </button>
                        <button
                          onClick={async () => {
                            showConfirm(
                              "Reject Deletion?",
                              `Are you sure you want to reject the deletion request for "${product.name}"? The product will remain in the catalog.`,
                              async () => {
                                try {
                                  await updateProduct(product.id, { deletionStatus: null });
                                  await onRefreshData();
                                  setFormSuccess(`Rejected deletion request for "${product.name}".`);
                                  setTimeout(() => setFormSuccess(''), 3000);
                                } catch (err: any) {
                                  setFormError(`Failed to reject deletion request: ${err.message || err}`);
                                }
                              }
                            );
                          }}
                          className="flex-grow py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm rounded-lg cursor-pointer flex items-center justify-center gap-1 transition-all"
                        >
                          <X size={12} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* UNIFIED ADD / EDIT PRODUCT MODAL (Same Photo Compression/Upload & Validation Across Roles) */}
      <ProductFormModal
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false);
          setEditModeProduct(null);
          setPreservePendingEdit(false);
        }}
        editModeProduct={editModeProduct}
        preservePendingStatus={preservePendingEdit}
        isStaff={isStaff}
        isSuperAdmin={isSuperAdmin}
        user={user}
        products={products}
        categories={categories}
        brands={brands}
        productColors={productColors}
        productModels={productModels}
        subBrands={subBrands}
        globalBrandFilter={globalBrandFilter}
        companySettings={companySettings}
        requireCheckIn={requireCheckIn}
        onRefreshData={onRefreshData}
        onSaved={({ message }) => {
          setFormSuccess(message);
          setTimeout(() => setFormSuccess(''), 3500);
        }}
      />

      {/* FULL-SCREEN PENDING PRODUCT REVIEW MODAL & IMAGE LIGHTBOX */}
      <PendingProductReviewModal
        product={reviewProduct}
        isOpen={Boolean(reviewProduct)}
        isStaff={isStaff}
        canApprove={isSuperAdmin}
        canEdit={Boolean(
          reviewProduct &&
            (isSuperAdmin ||
              (reviewProduct.status === 'pending_review' &&
                ((reviewProduct.submittedBy?.uid &&
                  reviewProduct.submittedBy.uid === user?.id) ||
                  (reviewProduct.createdById &&
                    reviewProduct.createdById === user?.id))))
        )}
        actionLoading={Boolean(
          reviewProduct && pendingActionLoadingId === reviewProduct.id
        )}
        subBrands={subBrands}
        companySettings={companySettings}
        onClose={() => setReviewProductId(null)}
        onEdit={(prod) => openEditDrawer(prod, true)}
        onRequestApprove={(prod) => handleRequestApproveProduct(prod)}
        onConfirmReject={handleConfirmRejectProduct}
      />

      {/* PENDING QUEUE QUICK REJECTION DIALOG (When rejecting directly from Queue Table) */}
      {rejectModalProduct &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-confirm-dialog="true"
            role="dialog"
            aria-modal="true"
            aria-label="Reject Pending Product"
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
            onClick={() => !submittingReject && setRejectModalProduct(null)}
          >
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const trimmed = rejectModalReason.trim();
                if (!trimmed) {
                  setRejectModalError('Please enter a rejection reason.');
                  return;
                }
                setRejectModalError('');
                setSubmittingReject(true);
                try {
                  await handleConfirmRejectProduct(rejectModalProduct, trimmed);
                  setRejectModalProduct(null);
                  setRejectModalReason('');
                } catch (err: any) {
                  setRejectModalError(err?.message || 'Failed to reject product.');
                } finally {
                  setSubmittingReject(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Reject Pending Product
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Rejecting &ldquo;{rejectModalProduct.name}&rdquo; — reason will be sent to{' '}
                    {rejectModalProduct.submittedBy?.name ||
                      rejectModalProduct.createdBy ||
                      'the submitter'}
                    .
                  </p>
                </div>
                <button
                  type="button"
                  disabled={submittingReject}
                  onClick={() => setRejectModalProduct(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                  Rejection Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  required
                  value={rejectModalReason}
                  onChange={(e) => {
                    setRejectModalReason(e.target.value);
                    if (rejectModalError) setRejectModalError('');
                  }}
                  placeholder="e.g. Incorrect price, incomplete variants, or low-quality product image..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />
                {rejectModalError && (
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
                    {rejectModalError}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={submittingReject}
                  onClick={() => setRejectModalProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReject || !rejectModalReason.trim()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingReject && <Loader2 size={13} className="animate-spin" />}
                  <span>Confirm Rejection</span>
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}

      {/* BULK CSV IMPORT MODAL */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white text-slate-900 rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 relative">
            <button
              onClick={() => setIsCsvModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-900"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" />
              Bulk Product CSV Upload
            </h3>
            
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Import a CSV dataset containing inventory records. Below are the required headers for columns:
            </p>
            <div className="mt-2 bg-slate-900 text-amber-400 p-3 rounded-xl font-mono text-sm select-all overflow-x-auto border border-slate-800">
              Name, SKU, Category, Brand, SubBrand, CostPrice, SellingPrice, ReorderThreshold
            </div>

            {csvError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <p>{csvError}</p>
              </div>
            )}

            {csvSuccess && (
              <div className="mt-4 bg-teal-50 border border-teal-200 text-teal-600 p-3 rounded-xl text-sm flex items-start gap-2">
                <p className="font-bold">{csvSuccess}</p>
              </div>
            )}

            <div className="mt-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-emerald-500 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Upload size={32} className="text-slate-400 mb-2" />
              <p className="text-sm font-bold text-slate-700">Click to upload CSV spreadsheet</p>
              <p className="text-sm text-slate-400 mt-1">Only .csv extensions supported</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvImport}
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setIsCsvModalOpen(false)}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog?.isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            data-confirm-dialog="true"
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setConfirmDialog(null)}
          >
            <div
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full space-y-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-1.5">
                <h3 className="text-sm font-black text-slate-950 dark:text-white font-sans">{confirmDialog.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-sans">{confirmDialog.message}</p>
              </div>
              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 rounded-xl text-sm font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    confirmDialog.onConfirm();
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-950 dark:bg-amber-400 dark:hover:bg-amber-500 text-white dark:text-slate-950 rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Sky Inventory Product-Only Sync Integration Modal */}
      <ResellerSyncModal
        isOpen={isResellerSyncModalOpen}
        onClose={() => setIsResellerSyncModalOpen(false)}
        products={products}
      />

    </div>
  );
}
