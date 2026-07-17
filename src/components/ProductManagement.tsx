import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit3, 
  QrCode, 
  Upload, 
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
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import Barcode from './Barcode';
import { generateBarcodePDF } from '../utils/barcodePdf';
import JsBarcode from 'jsbarcode';
import { Product, Variant, Category, Brand, UserProfile, StockLog } from '../types';
import { 
  getProducts, 
  addProduct, 
  updateProduct, 
  archiveProduct, 
  getCategories, 
  addCategory, 
  deleteCategory,
  updateCategory,
  getBrands, 
  addBrand, 
  deleteBrand,
  updateBrand,
  getStockLogs,
  getProductAttributes,
  saveProductAttributes
} from '../firebase/db';

interface ProductManagementProps {
  products: Product[];
  categories: Category[];
  brands: Brand[];
  user: UserProfile | null;
  onRefreshData: () => Promise<void>;
  initialAddMode?: boolean; // opens drawer automatically if navigated from dashboard
  requireCheckIn?: () => boolean;
}

export default function ProductManagement({
  products,
  categories,
  brands,
  user,
  onRefreshData,
  initialAddMode = false,
  requireCheckIn
}: ProductManagementProps) {
  const isStaff = user?.role === 'staff';

  // Sub tabs
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'categories' | 'brands' | 'pending'>('catalog');

  // List management states
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterSubBrand, setFilterSubBrand] = useState('');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'instock' | 'lowstock' | 'out'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Detail / Action States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productLogs, setProductLogs] = useState<StockLog[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editModeProduct, setEditModeProduct] = useState<Product | null>(null);

  // Category and Brand editing state
  const [newCatName, setNewCatName] = useState('');
  const [newCatSub, setNewCatSub] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  
  const [deletingCatId, setDeletingCatId] = useState<string | null>(null);
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);

  // Inline edit states for categories & brands
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState<string>('');
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editingBrandName, setEditingBrandName] = useState<string>('');

  // Rejection state for products
  const [rejectingProductId, setRejectingProductId] = useState<string | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('');

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
  const [csvError, setCsvError] = useState('');
  const [csvSuccess, setCsvSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formMainCategory, setFormMainCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formChildCategory, setFormChildCategory] = useState('');
  const [formCategory, setFormCategory] = useState(''); // kept for backward compatibility/displays
  const [formBrand, setFormBrand] = useState('');
  const [formSubBrand, setFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [formCostPrice, setFormCostPrice] = useState<number | ''>('');
  const [formSellingPrice, setFormSellingPrice] = useState<number | ''>('');
  const [formReorderThreshold, setFormReorderThreshold] = useState<number | ''>(5);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formVariants, setFormVariants] = useState<Variant[]>([
    { id: '1', color: 'Default', model: 'Standard', stock: 10 }
  ]);

  // Category CRUD states
  const [newCatLevel, setNewCatLevel] = useState<'main' | 'sub' | 'child'>('main');
  const [newCatParentMainId, setNewCatParentMainId] = useState('');
  const [newCatParentSubId, setNewCatParentSubId] = useState('');

  // Rejection states
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [productToReject, setProductToReject] = useState<Product | null>(null);

  // Wizard state variables
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [wizardMaxStep, setWizardMaxStep] = useState<number>(1);
  const [stepErrors, setStepErrors] = useState<{[key: string]: string}>({});

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

  const handleUpdateBrand = async (id: string, name: string) => {
    if (!name.trim()) return;
    setFormError('');
    setFormSuccess('');
    try {
      await updateBrand(id, name.trim());
      setEditingBrandId(null);
      await onRefreshData();
      setFormSuccess('Brand renamed successfully!');
      setTimeout(() => setFormSuccess(''), 3500);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update brand.');
      setTimeout(() => setFormError(''), 3500);
    }
  };

  const validateStep = (step: number): boolean => {
    const errors: {[key: string]: string} = {};
    
    if (step === 1) {
      if (!formName.trim()) {
        errors.name = 'Product Display Name is required';
      }
      if (!formSku.trim()) {
        errors.sku = 'SKU Code is required';
      }
      if (!formMainCategory) {
        errors.mainCategory = 'Main Category is required';
      }
      if (!formSubCategory) {
        errors.subCategory = 'Sub Category is required';
      }
      if (!formChildCategory) {
        errors.childCategory = 'Child Category is required';
      }
      if (!formBrand) {
        errors.brand = 'Brand is required';
      }
    } else if (step === 2) {
      if (formCostPrice === '') {
        errors.costPrice = 'Purchase Price is required';
      } else if (Number(formCostPrice) < 0) {
        errors.costPrice = 'Purchase Price cannot be negative';
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
          if (v.stock < 0) {
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
      const nextStep = wizardStep + 1;
      setWizardStep(nextStep);
      setWizardMaxStep(prev => Math.max(prev, nextStep));
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
    // Only allow jumping back, or jumping forward if the steps between are fully validated
    if (step < wizardStep) {
      setWizardStep(step);
      setStepErrors({});
    } else if (step <= wizardMaxStep) {
      // Validate all intermediate steps
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
      ? (formName !== editModeProduct.name || 
         formSku !== editModeProduct.sku || 
         formMainCategory !== editModeProduct.mainCategory || 
         formSubCategory !== editModeProduct.subCategory || 
         formChildCategory !== editModeProduct.childCategory || 
         formBrand !== editModeProduct.brand || 
         formCostPrice !== editModeProduct.costPrice || 
         formSellingPrice !== editModeProduct.sellingPrice || 
         formReorderThreshold !== editModeProduct.reorderThreshold || 
         formImages.length !== (editModeProduct.images?.length || 0))
      : (formName.trim() !== '' || Number(formSellingPrice) > 0 || formImages.length > 0 || formVariants.some(v => v.color !== 'Default' || v.model !== 'Standard'));

    if (isDirty) {
      showConfirm(
        "Discard Progress?",
        "Are you sure you want to discard your changes? Your progress will be lost.",
        () => {
          setIsDrawerOpen(false);
        }
      );
    } else {
      setIsDrawerOpen(false);
    }
  };

  // Enhanced form attributes, SKU, & submit status states
  const [submitting, setSubmitting] = useState(false);
  const [isSkuDirty, setIsSkuDirty] = useState(false);
  
  const DEFAULT_COLORS = ['Black', 'White', 'Blue', 'Red', 'Green', 'Gold', 'Silver', 'Rose Gold'];
  const DEFAULT_SIZES = ['Standard', 'Small', 'Medium', 'Large', 'XL', '128GB', '256GB', '512GB'];
  
  const [availableColors, setAvailableColors] = useState<string[]>(DEFAULT_COLORS);
  const [availableSizes, setAvailableSizes] = useState<string[]>(DEFAULT_SIZES);
  
  const [customColorValue, setCustomColorValue] = useState<{[key: string]: string}>({});
  const [customSizeValue, setCustomSizeValue] = useState<{[key: string]: string}>({});
  const [isCustomColorMode, setIsCustomColorMode] = useState<{[key: string]: boolean}>({});
  const [isCustomSizeMode, setIsCustomSizeMode] = useState<{[key: string]: boolean}>({});

  // Barcode & bulk printing states
  const [selectedBarcodeTab, setSelectedBarcodeTab] = useState<'sku' | 'variants'>('sku');
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // Helper to download a single barcode as a PNG image using canvas
  const downloadBarcodePng = (value: string, label: string) => {
    const canvas = document.createElement('canvas');
    try {
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: 2.5,
        height: 70,
        displayValue: true,
        fontSize: 13,
        margin: 15,
        background: '#ffffff',
        lineColor: '#000000',
      });
      
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
      // Print 24 copies of the primary barcode to fill a standard sheet
      for (let i = 0; i < 24; i++) {
        itemsToPrint.push({
          value: product.barcodeValue || product.sku,
          label: product.name,
          subLabel: 'Primary SKU Code'
        });
      }
    } else {
      // Print copies for all variants. Fill the 24-slot sheet as much as possible
      const repeatCount = Math.max(1, Math.floor(24 / (product.variants.length || 1)));
      product.variants.forEach(v => {
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

  // Helper functions for custom attributes
  const handleAddCustomColor = async (color: string) => {
    const trimmed = color.trim();
    if (trimmed && !availableColors.includes(trimmed)) {
      const updated = [...availableColors, trimmed];
      setAvailableColors(updated);
      await saveProductAttributes({ colors: updated, sizes: availableSizes });
    }
  };

  const handleAddCustomSize = async (size: string) => {
    const trimmed = size.trim();
    if (trimmed && !availableSizes.includes(trimmed)) {
      const updated = [...availableSizes, trimmed];
      setAvailableSizes(updated);
      await saveProductAttributes({ colors: availableColors, sizes: updated });
    }
  };

  // Helper function to dynamically generate SKU code
  const generateSkuCode = (subBrand: string, category: string, brandName: string) => {
    const div = subBrand || 'SAT';
    
    let cat = 'GEN';
    if (category) {
      const cleanCat = category.replace(/[^a-zA-Z ]/g, '');
      const parts = cleanCat.split(/\s+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
        cat = (parts[0].substring(0, 1) + parts[1].substring(0, 2)).toUpperCase();
      } else {
        cat = category.substring(0, 3).toUpperCase();
      }
    }

    let brnd = 'UNK';
    if (brandName) {
      const cleanBrnd = brandName.replace(/[^a-zA-Z ]/g, '');
      const parts = cleanBrnd.split(/\s+/).filter(p => p.length > 0);
      if (parts.length >= 2) {
        brnd = (parts[0].substring(0, 1) + parts[1].substring(0, 2)).toUpperCase();
      } else {
        brnd = brandName.substring(0, 3).toUpperCase();
      }
    }

    const prefix = `${div}-${cat}-${brnd}-`;
    const matchingProducts = products.filter(p => p.sku && p.sku.startsWith(prefix));
    let nextNum = matchingProducts.length + 1;
    
    while (products.some(p => p.sku === `${prefix}${String(nextNum).padStart(3, '0')}`)) {
      nextNum++;
    }
    
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  };

  // Fetch product attributes on mount
  useEffect(() => {
    getProductAttributes().then(attrs => {
      if (attrs) {
        if (attrs.colors && attrs.colors.length > 0) {
          setAvailableColors(attrs.colors);
        }
        if (attrs.sizes && attrs.sizes.length > 0) {
          setAvailableSizes(attrs.sizes);
        }
      }
    });
  }, []);

  // Auto generate SKU when brand/category/division changes
  useEffect(() => {
    if (!editModeProduct && !isSkuDirty) {
      const generated = generateSkuCode(formSubBrand, formCategory, formBrand);
      setFormSku(generated);
    }
  }, [formSubBrand, formCategory, formBrand, editModeProduct, isSkuDirty, products]);

  // Handle drawer auto-trigger
  useEffect(() => {
    if (initialAddMode) {
      openAddDrawer();
    }
  }, [initialAddMode]);

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

  // Open Add Product Drawer
  const openAddDrawer = () => {
    setEditModeProduct(null);
    setIsSkuDirty(false);
    setFormError('');
    setFormSuccess('');
    setFormName('');
    
    // Initialize 3-level categories
    const mainCats = categories.filter(c => c.level === 'main');
    const initialMain = mainCats[0]?.name || '';
    setFormMainCategory(initialMain);
    setFormSubCategory('');
    setFormChildCategory('');
    setFormCategory(initialMain);

    const initialBrand = brands[0]?.name || '';
    setFormBrand(initialBrand);
    setFormSubBrand('SAT');
    setFormCostPrice('');
    setFormSellingPrice('');
    setFormReorderThreshold(5);
    setFormImages([]);
    setFormVariants([{ id: Date.now().toString(), color: 'Default', model: 'Standard', stock: 10 }]);
    
    // Clear custom mode maps
    setCustomColorValue({});
    setCustomSizeValue({});
    setIsCustomColorMode({});
    setIsCustomSizeMode({});
    
    // Set wizard initial state
    setWizardStep(1);
    setWizardMaxStep(1);
    setStepErrors({});
    
    // Generate initial SKU
    const initialSku = generateSkuCode('SAT', initialMain, initialBrand);
    setFormSku(initialSku);
    setIsDrawerOpen(true);
  };

  // Open Edit Product Drawer
  const openEditDrawer = (product: Product) => {
    setEditModeProduct(product);
    setIsSkuDirty(true);
    setFormError('');
    setFormSuccess('');
    setFormName(product.name);
    setFormSku(product.sku);
    
    // Set 3-level categories for editing
    setFormMainCategory(product.mainCategory || product.category || '');
    setFormSubCategory(product.subCategory || '');
    setFormChildCategory(product.childCategory || '');
    setFormCategory(product.category || '');

    setFormBrand(product.brand);
    setFormSubBrand(product.subBrand);
    setFormCostPrice(product.costPrice);
    setFormSellingPrice(product.sellingPrice);
    setFormReorderThreshold(product.reorderThreshold);
    setFormImages(product.images || []);
    setFormVariants(product.variants.map(v => ({ ...v })));
    
    // Clear custom mode maps
    setCustomColorValue({});
    setCustomSizeValue({});
    setIsCustomColorMode({});
    setIsCustomSizeMode({});
    
    // Set wizard initial state
    setWizardStep(1);
    setWizardMaxStep(5);
    setStepErrors({});
    
    setIsDrawerOpen(true);
  };

  // Variants handlers
  const addVariantField = () => {
    setFormVariants([
      ...formVariants,
      { id: Date.now().toString(), color: '', model: '', stock: 0 }
    ]);
  };

  const removeVariantField = (id: string) => {
    if (formVariants.length > 1) {
      setFormVariants(formVariants.filter(v => v.id !== id));
    }
  };

  const updateVariantValue = (id: string, field: 'color' | 'model' | 'stock', value: string | number) => {
    setFormVariants(
      formVariants.map(v => (v.id === id ? { ...v, [field]: value } : v))
    );
  };

  // Image handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result && typeof reader.result === 'string') {
            setFormImages(prev => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file as any);
      });
    }
  };

  const removeImage = (idx: number) => {
    setFormImages(formImages.filter((_, i) => i !== idx));
  };

  // SKU auto generation
  const handleAutoGenerateSku = () => {
    const generated = generateSkuCode(formSubBrand, formCategory, formBrand);
    setFormSku(generated);
    setIsSkuDirty(false);
  };

  // Form Submit (Add or Edit Product)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // If not on step 5, just run next step logic and do not submit yet!
    if (wizardStep < 5) {
      handleNextStep();
      return;
    }

    if (submitting) return;

    setFormError('');
    setFormSuccess('');

    // Full validation check
    if (!validateStep(1)) {
      setFormError('Please complete Step 1 with correct inputs before submitting.');
      setWizardStep(1);
      return;
    }
    if (!validateStep(2)) {
      setFormError('Please complete Step 2 with correct inputs before submitting.');
      setWizardStep(2);
      return;
    }
    if (!validateStep(3)) {
      setFormError('Please complete Step 3 with correct inputs before submitting.');
      setWizardStep(3);
      return;
    }
    
    if (requireCheckIn && !requireCheckIn()) return;

    const finalSku = formSku.trim().toUpperCase();

    // SKU must be unique - check against existing active products
    const isDuplicateSku = products.some(
      p => p.sku.toUpperCase() === finalSku && 
      (!editModeProduct || p.id !== editModeProduct.id) && 
      !p.archived
    );
    if (isDuplicateSku) {
      setFormError(`SKU Code "${finalSku}" is already assigned to another active product. SKU must be unique.`);
      setWizardStep(1);
      return;
    }

    setSubmitting(true);

    // Determine status for workflow
    let finalStatus: 'pending_review' | 'approved' | 'rejected' = 'approved';
    if (!editModeProduct) {
      // New product
      finalStatus = isStaff ? 'pending_review' : 'approved';
    } else {
      // Edit mode
      const currentStatus = editModeProduct.status || 'approved';
      if (currentStatus === 'rejected') {
        // Rejected products are resubmitted for review
        finalStatus = 'pending_review';
      } else {
        // Keep existing status
        finalStatus = currentStatus;
      }
    }

    // Prepare payload
    const productPayload = {
      name: formName.trim(),
      sku: finalSku,
      category: formMainCategory || '', // for backward compatibility/displays
      mainCategory: formMainCategory || '',
      subCategory: formSubCategory || '',
      childCategory: formChildCategory || '',
      brand: formBrand || '',
      subBrand: formSubBrand || '',
      costPrice: Number(formCostPrice),
      sellingPrice: Number(formSellingPrice),
      reorderThreshold: Number(formReorderThreshold),
      images: formImages || [],
      variants: formVariants.map(v => {
        const cleanColor = v.color.trim();
        const cleanModel = v.model.trim();
        const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
        const variantBarcodeValue = `${finalSku}-${vColorCode}-${vModelCode}`;
        return {
          ...v,
          color: cleanColor,
          model: cleanModel,
          stock: Number(v.stock),
          barcodeValue: variantBarcodeValue
        };
      }),
      archived: false,
      createdAt: editModeProduct ? editModeProduct.createdAt : Date.now(),
      barcodeValue: finalSku,
      status: finalStatus,
      rejectionReason: finalStatus === 'pending_review' ? '' : (editModeProduct?.rejectionReason || '')
    };

    try {
      if (editModeProduct) {
        // Edit existing product
        await updateProduct(editModeProduct.id, productPayload);
        setFormSuccess(finalStatus === 'pending_review' && editModeProduct.status === 'rejected' 
          ? 'Product details updated and resubmitted for approval successfully!'
          : 'Product details updated successfully!'
        );
      } else {
        // Create new product
        await addProduct(productPayload, user?.id || 'demo', user?.name || 'Operator');
        setFormSuccess(finalStatus === 'pending_review'
          ? 'New product successfully submitted for review and approval!'
          : 'New product successfully published to catalog!'
        );
      }

      await onRefreshData();
      
      setTimeout(() => {
        setIsDrawerOpen(false);
        setSubmitting(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Failed to persist product record to cloud database.');
      setSubmitting(false);
    }
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
        } catch (err: any) {
          console.error("Archive product failed:", err);
          setFormError(`Failed to archive product: ${err.message || err}`);
        }
      }
    );
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
      await addBrand(newBrandName.trim());
      setFormSuccess(`Brand "${newBrandName}" created!`);
      setNewBrandName('');
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
          const pSubBrandRaw = subBrandIdx !== -1 ? cols[subBrandIdx].toUpperCase() : 'SAT';
          const pSubBrand = ['SAT', 'GZ', 'RTX'].includes(pSubBrandRaw) ? pSubBrandRaw as 'SAT' | 'GZ' | 'RTX' : 'SAT';
          const pCost = costPriceIdx !== -1 ? Number(cols[costPriceIdx]) || 0 : 0;
          const pSelling = sellingPriceIdx !== -1 ? Number(cols[sellingPriceIdx]) || 0 : 0;
          const pReorder = reorderIdx !== -1 ? Number(cols[reorderIdx]) || 5 : 5;

          const productPayload = {
            name: pName,
            sku: pSku.toUpperCase(),
            category: pCategory,
            brand: pBrand,
            subBrand: pSubBrand,
            costPrice: pCost,
            sellingPrice: pSelling,
            reorderThreshold: pReorder,
            images: [],
            variants: [{ id: Date.now().toString() + i, color: 'Default', model: 'Standard', stock: 10 }],
            archived: false,
            createdAt: Date.now()
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

  // Filtering & Sorting Logic
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(search.toLowerCase()) ||
                          product.sku.toLowerCase().includes(search.toLowerCase()) ||
                          product.brand.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory = !filterCategory || product.category === filterCategory;
    const matchesBrand = !filterBrand || product.brand === filterBrand;
    const matchesSubBrand = !filterSubBrand || product.subBrand === filterSubBrand;
    
    const totalQty = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    let matchesStock = true;
    if (filterStockStatus === 'instock') {
      matchesStock = totalQty > product.reorderThreshold;
    } else if (filterStockStatus === 'lowstock') {
      matchesStock = totalQty > 0 && totalQty <= product.reorderThreshold;
    } else if (filterStockStatus === 'out') {
      matchesStock = totalQty === 0;
    }

    return matchesSearch && matchesCategory && matchesBrand && matchesSubBrand && matchesStock;
  });

  // Sort
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let factor = sortOrder === 'asc' ? 1 : -1;
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name) * factor;
    } else if (sortBy === 'price') {
      return (a.sellingPrice - b.sellingPrice) * factor;
    } else if (sortBy === 'stock') {
      const stockA = a.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      const stockB = b.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      return (stockA - stockB) * factor;
    }
    return 0;
  });

  const toggleSort = (field: 'name' | 'stock' | 'price') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Tab Selectors */}
      <div className="border-b border-slate-200 overflow-x-auto no-scrollbar">
        <div className="flex gap-4 min-w-max pb-1">
          <button
            onClick={() => setActiveSubTab('catalog')}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'catalog'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Product Catalog
          </button>
          <button
            onClick={() => setActiveSubTab('categories')}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'categories'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Categories CRUD
          </button>
          <button
            onClick={() => setActiveSubTab('brands')}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'brands'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Brands CRUD
          </button>
          {!isStaff && (
            <button
              onClick={() => setActiveSubTab('pending')}
              className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeSubTab === 'pending'
                  ? 'border-amber-400 text-slate-900 font-extrabold'
                  : 'border-transparent text-slate-500 hover:text-slate-950'
              }`}
            >
              Pending Products
              {products.filter(p => p.status === 'pending_review' && !p.archived).length > 0 && (
                <span className="px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-black rounded-full leading-none">
                  {products.filter(p => p.status === 'pending_review' && !p.archived).length}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'catalog' && (
        <div className="flex flex-wrap gap-2 md:justify-end">
          <button
            onClick={() => setIsCsvModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-[10px] sm:text-xs font-semibold text-slate-700 rounded-xl cursor-pointer"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            Bulk CSV Import
          </button>
          <button
            onClick={openAddDrawer}
            className="flex items-center gap-1.5 py-1.5 px-4 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-[10px] sm:text-xs rounded-xl cursor-pointer"
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
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
              <p className="font-semibold">{formError}</p>
            </div>
          )}
          {formSuccess && (
            <div className="bg-teal-50 border border-teal-200 text-teal-700 p-4 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <Check size={16} className="text-teal-500" />
              <p className="font-semibold">{formSuccess}</p>
            </div>
          )}
        </div>
      )}

      {/* SUB TAB 1: PRODUCT CATALOG */}
      {activeSubTab === 'catalog' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Main List Column */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 space-y-3">
              <div className="relative">
                <Search className="absolute top-3 left-3 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by Name, SKU, or Brand..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 md:py-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                
                {/* Category Filter */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 md:py-1.5 px-2.5 text-xs text-slate-600 focus:outline-hidden"
                >
                  <option value="">All Categories</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>

                {/* Brand Filter */}
                <select
                  value={filterBrand}
                  onChange={(e) => setFilterBrand(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 md:py-1.5 px-2.5 text-xs text-slate-600 focus:outline-hidden"
                >
                  <option value="">All Brands</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>

                {/* Sub-Brand Division Filter */}
                <select
                  value={filterSubBrand}
                  onChange={(e) => setFilterSubBrand(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 md:py-1.5 px-2.5 text-xs text-slate-600 focus:outline-hidden"
                >
                  <option value="">All Sub-Brands</option>
                  <option value="SAT">SAT (Sky Auto)</option>
                  <option value="GZ">GadgetZu</option>
                  <option value="RTX">RTX Gadget</option>
                </select>

                {/* Stock Alert Filter */}
                <select
                  value={filterStockStatus}
                  onChange={(e) => setFilterStockStatus(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl py-2 md:py-1.5 px-2.5 text-xs text-slate-600 focus:outline-hidden"
                >
                  <option value="all">All Stocks</option>
                  <option value="instock">Adequate Stock</option>
                  <option value="lowstock">Low Stock Alerts</option>
                  <option value="out">Out of Stock</option>
                </select>

              </div>
            </div>

            {/* Products Table Card / Mobile Card View */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                      <th className="py-3 px-4 text-center font-bold w-10">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer size-3.5"
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
                      <th className="py-3 px-4 font-bold">Image</th>
                      <th className="py-3 px-3 font-bold cursor-pointer hover:text-slate-900" onClick={() => toggleSort('name')}>
                        Product Info <ArrowUpDown size={10} className="inline ml-1" />
                      </th>
                      <th className="py-3 px-3 font-bold text-center">Division</th>
                      <th className="py-3 px-3 font-bold cursor-pointer hover:text-slate-900" onClick={() => toggleSort('stock')}>
                        Stock <ArrowUpDown size={10} className="inline ml-1" />
                      </th>
                      <th className="py-3 px-3 font-bold cursor-pointer hover:text-slate-900 text-right" onClick={() => toggleSort('price')}>
                        Price <ArrowUpDown size={10} className="inline ml-1" />
                      </th>
                      <th className="py-3 px-4 text-center font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                    {sortedProducts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                          No active gadget catalog records found.
                        </td>
                      </tr>
                    ) : (
                      sortedProducts.map((product) => {
                        const totalQty = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
                        const isLow = totalQty <= product.reorderThreshold;
                        const defaultImg = product.images?.[0] || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&q=80&w=150';

                        return (
                          <tr 
                            key={product.id} 
                            onClick={() => setSelectedProduct(product)}
                            className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                              selectedProduct?.id === product.id ? 'bg-amber-50/40' : ''
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
                              <img 
                                src={defaultImg} 
                                alt={product.name} 
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 object-cover rounded-lg border border-slate-100 flex-shrink-0" 
                              />
                            </td>
                            <td className="py-3 px-3 min-w-[150px]">
                              <p className="font-bold text-slate-900 leading-tight">{product.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono mt-0.5">{product.sku}</p>
                              <div className="flex gap-1.5 mt-1">
                                <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                                  {product.brand}
                                </span>
                                <span className="bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1 rounded">
                                  {product.category}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`inline-block text-[9px] font-mono font-black px-2 py-0.5 rounded-full ${
                                product.subBrand === 'SAT' 
                                  ? 'bg-slate-900 text-amber-400' 
                                  : product.subBrand === 'GZ' 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-teal-50 text-teal-700 border border-teal-100'
                              }`}>
                                {product.subBrand}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-block font-mono font-black px-2 py-0.5 rounded-full ${
                                totalQty === 0 
                                  ? 'bg-red-100 text-red-700' 
                                  : isLow 
                                  ? 'bg-amber-100 text-amber-800' 
                                  : 'bg-teal-50 text-teal-700'
                              }`}>
                                {totalQty} pcs
                              </span>
                              {isLow && totalQty > 0 && (
                                <p className="text-[9px] text-amber-600 mt-1 font-sans italic font-medium">Reorder Alert</p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <p className="font-bold text-slate-900">৳ {product.sellingPrice.toLocaleString()}</p>
                              {!isStaff && (
                                <p className="text-[9px] text-slate-400 font-mono">Cost: ৳{product.costPrice}</p>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="flex gap-1.5 justify-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => openEditDrawer(product)}
                                  className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded"
                                  title="Edit Product"
                                >
                                  <Edit3 size={14} />
                                </button>
                                {!isStaff && (
                                  <button
                                    onClick={() => handleArchiveProduct(product)}
                                    className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                                    title="Archive Product"
                                  >
                                    <Archive size={14} />
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

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {sortedProducts.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 italic text-xs">
                    No active gadget catalog records found.
                  </div>
                ) : (
                  sortedProducts.map((product) => {
                    const totalQty = product.variants.reduce((s, v) => s + (v.stock || 0), 0);
                    const isLow = totalQty <= product.reorderThreshold;
                    const defaultImg = product.images?.[0] || 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&q=80&w=150';

                    return (
                      <div 
                        key={product.id}
                        onClick={() => setSelectedProduct(product)}
                        className={`p-4 active:bg-slate-50 transition-colors cursor-pointer ${
                          selectedProduct?.id === product.id ? 'bg-amber-50/40' : ''
                        }`}
                      >
                        <div className="flex gap-3">
                          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer size-4"
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
                          <img 
                            src={defaultImg} 
                            alt={product.name} 
                            referrerPolicy="no-referrer"
                            className="w-16 h-16 object-cover rounded-xl border border-slate-100 flex-shrink-0" 
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <h4 className="text-sm font-bold text-slate-900 leading-tight truncate">{product.name}</h4>
                              <span className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded-full ml-2 flex-shrink-0 ${
                                product.subBrand === 'SAT' ? 'bg-slate-900 text-amber-400' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {product.subBrand}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{product.sku}</p>
                            
                            <div className="flex items-center justify-between mt-3">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-bold ${totalQty === 0 ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-teal-600'}`}>
                                  {totalQty} in stock
                                </span>
                                {isLow && totalQty > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                              </div>
                              <span className="text-sm font-black text-slate-950 font-mono">
                                ৳ {product.sellingPrice.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openEditDrawer(product)}
                            className="flex-1 flex items-center justify-center gap-2 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold border border-slate-200 cursor-pointer"
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                          {!isStaff && (
                            <button
                              type="button"
                              onClick={() => handleArchiveProduct(product)}
                              className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold border border-red-100 cursor-pointer"
                            >
                              <Archive size={14} /> Archive
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Bulk Barcode Printing Floating Action Bar */}
            {selectedProductIds.length > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white py-3.5 px-5 rounded-2xl shadow-xl flex items-center gap-4 border border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-300 w-[90%] max-w-md">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold font-mono text-amber-400 block">
                    {selectedProductIds.length} {selectedProductIds.length === 1 ? 'Product' : 'Products'} Selected
                  </span>
                  <span className="text-[9px] text-slate-400 block mt-0.5 truncate">
                    Includes all physical product variants
                  </span>
                </div>
                <div className="h-6 w-px bg-slate-700" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBulkBarcodeDownload}
                    className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
                  >
                    <Tag size={12} />
                    Download PDF
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

          </div>

          {/* Details Column (Active selection) */}
          <div className={`
            fixed inset-0 z-50 lg:static lg:block bg-white lg:bg-white overflow-y-auto lg:overflow-visible transition-transform duration-300
            ${selectedProduct ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
            ${!selectedProduct && 'hidden lg:block'}
            rounded-t-3xl lg:rounded-2xl shadow-2xl lg:shadow-sm border-t border-slate-200 lg:border border-slate-100 p-5 space-y-5
          `}>
            {selectedProduct ? (
              <div className="space-y-5 pb-10 lg:pb-0">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-mono tracking-widest font-black text-amber-500 uppercase">
                      {selectedProduct.subBrand} Segment Product
                    </span>
                    <h3 className="text-base font-extrabold text-slate-900 mt-0.5 leading-tight">{selectedProduct.name}</h3>
                    <p className="text-xs font-mono text-slate-400 mt-0.5">{selectedProduct.sku}</p>
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-2 lg:p-1 bg-slate-100 lg:bg-transparent text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                  >
                    <X size={20} className="lg:size-4" />
                  </button>
                </div>

                {/* Advanced Scan & Label Station */}
                <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scan & Label Station</span>
                    <div className="flex bg-slate-200/60 p-0.5 rounded-lg text-[10px] font-bold">
                      <button 
                        type="button"
                        onClick={() => setSelectedBarcodeTab('sku')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${selectedBarcodeTab === 'sku' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-900'}`}
                      >
                        SKU
                      </button>
                      <button 
                        type="button"
                        onClick={() => setSelectedBarcodeTab('variants')}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${selectedBarcodeTab === 'variants' ? 'bg-white text-slate-900 shadow-3xs' : 'text-slate-500 hover:text-slate-900'}`}
                      >
                        Variants ({selectedProduct.variants?.length || 0})
                      </button>
                    </div>
                  </div>

                  {selectedBarcodeTab === 'sku' ? (
                    <div className="space-y-4 flex flex-col items-center">
                      <div className="bg-white p-4 rounded-xl border border-slate-150 flex flex-col items-center w-full">
                        <div className="bg-white py-2 px-1 rounded-lg border border-slate-100 w-full flex justify-center">
                          <Barcode 
                            value={selectedProduct.barcodeValue || selectedProduct.sku} 
                            height={45} 
                            width={1.6} 
                            fontSize={10}
                            margin={5}
                          />
                        </div>
                        <p className="text-[9px] text-slate-400 font-mono tracking-wider mt-1 uppercase text-center">{selectedProduct.barcodeValue || selectedProduct.sku}</p>
                      </div>

                      <div className="flex gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => downloadBarcodePng(selectedProduct.barcodeValue || selectedProduct.sku, selectedProduct.name)}
                          className="flex-1 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 flex items-center justify-center gap-1.5 transition-colors shadow-3xs cursor-pointer"
                          title="Download high-resolution PNG barcode image"
                        >
                          <Upload size={12} className="rotate-180 text-amber-500" />
                          Download PNG
                        </button>
                        <button
                          type="button"
                          onClick={() => printProductLabelSheet(selectedProduct, 'primary')}
                          className="flex-1 py-2 bg-amber-400 hover:bg-amber-500 rounded-xl text-[10px] font-bold text-slate-950 flex items-center justify-center gap-1.5 transition-colors shadow-3xs cursor-pointer"
                          title="Generate printable Avery-style sheet with 24 labels"
                        >
                          <Tag size={12} className="text-slate-950" />
                          Print 24-Label Sheet
                        </button>
                      </div>

                      {/* Display QR code in collapsible or smaller block for maximum scannability coverage */}
                      <div className="w-full border-t border-dashed border-slate-200 pt-3 flex items-center justify-between">
                        <div className="text-[10px] text-slate-500 font-medium">
                          <p className="font-bold text-slate-700">QR Code</p>
                          <p className="text-[9px] text-slate-400">Perfect for phone cameras</p>
                        </div>
                        <div className="bg-white p-1.5 rounded-lg border border-slate-200">
                          <QRCodeSVG 
                            value={selectedProduct.sku} 
                            size={44} 
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
                          <div className="flex justify-between items-center bg-amber-50 border border-amber-100 p-2.5 rounded-xl">
                            <span className="text-[9px] font-bold text-amber-800">Need labels for all variants?</span>
                            <button
                              type="button"
                              onClick={() => printProductLabelSheet(selectedProduct, 'variants')}
                              className="px-2.5 py-1 bg-amber-400 hover:bg-amber-500 rounded-lg text-[9px] font-bold text-slate-950 flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Tag size={10} />
                              Print Variant Sheet
                            </button>
                          </div>

                          <div className="max-h-[220px] overflow-y-auto pr-1 space-y-2.5">
                            {selectedProduct.variants.map((v) => {
                              const cleanColor = v.color.trim();
                              const cleanModel = v.model.trim();
                              const vColorCode = cleanColor.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
                              const vModelCode = cleanModel.toUpperCase().replace(/[^A-Z0-9]/g, '-').replace(/-+/g, '-');
                              const fallbackBarcode = `${selectedProduct.sku}-${vColorCode}-${vModelCode}`;
                              const val = v.barcodeValue || fallbackBarcode;

                              return (
                                <div key={v.id} className="bg-white p-3 rounded-xl border border-slate-150 space-y-2 relative group">
                                  <div className="flex justify-between items-start">
                                    <div className="min-w-0 flex-1 pr-1">
                                      <h5 className="text-[10px] font-bold text-slate-700 truncate">{v.color} • {v.model}</h5>
                                      <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tight truncate">{val}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => downloadBarcodePng(val, `${selectedProduct.name}_${v.color}_${v.model}`)}
                                      className="p-1 bg-slate-50 hover:bg-amber-100 text-slate-500 hover:text-amber-700 rounded-lg transition-colors border border-slate-100 cursor-pointer"
                                      title="Download Variant Barcode PNG"
                                    >
                                      <Upload size={11} className="rotate-180" />
                                    </button>
                                  </div>
                                  <div className="bg-slate-50/50 p-1.5 rounded-lg border border-slate-100 flex justify-center">
                                    <Barcode 
                                      value={val} 
                                      height={32} 
                                      width={1.2} 
                                      fontSize={8}
                                      margin={3}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic text-center py-4">This product does not have any variants.</p>
                      )}
                    </div>
                  )}
                </div>


                {/* Details list */}
                <div className="text-xs space-y-2 divide-y divide-slate-100">
                  <div className="flex justify-between pt-2">
                    <span className="text-slate-400">Category / Brand</span>
                    <span className="font-semibold text-slate-800">{selectedProduct.category} • {selectedProduct.brand}</span>
                  </div>
                  {!isStaff && (
                    <div className="flex justify-between pt-2">
                      <span className="text-slate-400">Purchase Price</span>
                      <span className="font-bold text-slate-800">৳ {selectedProduct.costPrice.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2">
                    <span className="text-slate-400">Selling Price</span>
                    <span className="font-extrabold text-teal-600">৳ {selectedProduct.sellingPrice.toLocaleString()}</span>
                  </div>
                  {!isStaff && (
                    <div className="flex justify-between pt-2">
                      <span className="text-slate-400">Estimated Margin</span>
                      <span className="font-bold text-emerald-600">
                        ৳ {(selectedProduct.sellingPrice - selectedProduct.costPrice).toLocaleString()} (
                        {Math.round(((selectedProduct.sellingPrice - selectedProduct.costPrice) / selectedProduct.sellingPrice) * 100) || 0}%)
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2">
                    <span className="text-slate-400">Reorder Threshold</span>
                    <span className="font-bold font-mono text-slate-800">{selectedProduct.reorderThreshold} units</span>
                  </div>
                </div>

                {/* Variants List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-900 font-sans">Variants Stock Grid</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedProduct.variants.map((v) => (
                      <div key={v.id} className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-center font-mono">
                        <p className="text-[10px] font-semibold text-slate-400 truncate">{v.color} - {v.model}</p>
                        <p className="text-xs font-black text-slate-800 mt-0.5">{v.stock} in stock</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stock history list */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1 text-xs font-bold text-slate-950 font-sans">
                    <History size={14} className="text-amber-500" />
                    <span>Live Stock Ledger History</span>
                  </div>
                  <div className="overflow-y-auto max-h-[150px] pr-1 space-y-1.5">
                    {productLogs.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic text-center py-4">No logged stock operations found.</p>
                    ) : (
                      productLogs.map((log) => (
                        <div key={log.id} className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-[10px]">
                          <div className="flex justify-between text-[9px] font-mono text-slate-400">
                            <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                            <span className="font-bold tracking-wider text-slate-500 uppercase">{log.reason}</span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="font-medium text-slate-700">Operator: {log.userName}</span>
                            <span className={`font-mono font-black ${
                              log.qty > 0 ? 'text-teal-600' : 'text-red-600'
                            }`}>
                              {log.qty > 0 ? `+${log.qty}` : log.qty} pcs
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-400 text-right mt-0.5">
                            Before: {log.beforeQty} | After: {log.afterQty}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 italic flex flex-col items-center space-y-3">
                <Tag size={36} className="text-slate-300" />
                <p className="text-xs max-w-xs font-sans leading-relaxed">
                  Select a product from the left catalog table list to display detailed variant configurations, live stock transactions, and barcodes.
                </p>
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Category Hierarchy Level</label>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {(['main', 'sub', 'child'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => { setNewCatLevel(level); setNewCatParentMainId(''); setNewCatParentSubId(''); }}
                      className={`py-1.5 px-3 text-xs font-bold rounded-xl transition-all border ${
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
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Parent Main Category</label>
                  <select
                    value={newCatParentMainId}
                    onChange={(e) => setNewCatParentMainId(e.target.value)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800"
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
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Filter Parent by Main Category</label>
                    <select
                      value={newCatParentMainId}
                      onChange={(e) => { setNewCatParentMainId(e.target.value); setNewCatParentSubId(''); }}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800"
                    >
                      <option value="">-- All Main Categories --</option>
                      {categories.filter(c => c.level === 'main' || !c.level).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Parent Sub Category</label>
                    <select
                      value={newCatParentSubId}
                      onChange={(e) => setNewCatParentSubId(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800"
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder={newCatLevel === 'main' ? "e.g. Audio" : newCatLevel === 'sub' ? "e.g. Earbuds" : "e.g. TWS"}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-all shadow-md cursor-pointer"
              >
                Create {newCatLevel === 'main' ? 'Main' : newCatLevel === 'sub' ? 'Sub' : 'Child'} Category
              </button>
            </form>
          </div>

          {/* List categories tree */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-950 font-sans">Active Product Categories Tree</h3>
            <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
              {categories.filter(c => c.level === 'main' || !c.level).length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-8">No categories seeded or created yet.</p>
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
                              className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-hidden"
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
                            <span className="text-xs font-black text-slate-900 uppercase tracking-tight">📁 {mainCat.name}</span>
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
                          <p className="text-[10px] text-slate-400 italic pl-3">No nested sub-categories.</p>
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
                                        className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-hidden"
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
                                      <span className="text-xs font-bold text-slate-800">↳ 📂 {subCat.name}</span>
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
                                              className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-hidden"
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
                                            <span className="text-[11px] font-medium text-slate-600">▪ {childCat.name}</span>
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

      {/* SUB TAB 3: BRAND CRUD */}
      {activeSubTab === 'brands' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Add form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-950 font-sans">Add Brand Record</h3>
            <form onSubmit={handleAddBrand} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Realme"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-all shadow-md"
              >
                Create Brand
              </button>
            </form>
          </div>

          {/* List brands */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-950 font-sans">Active Brand Catalog</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {brands.map((brand) => (
                <div key={brand.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center group">
                  {editingBrandId === brand.id ? (
                    <div className="flex items-center gap-1.5 flex-grow">
                      <input
                        type="text"
                        value={editingBrandName}
                        onChange={(e) => setEditingBrandName(e.target.value)}
                        className="bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-hidden"
                      />
                      <button
                        onClick={() => handleUpdateBrand(brand.id, editingBrandName)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md cursor-pointer"
                      >
                        <Check size={12} />
                      </button>
                      <button
                        onClick={() => setEditingBrandId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-50 rounded-md cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-xs font-bold text-slate-900">{brand.name}</h4>
                      {!isStaff && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingBrandId(brand.id);
                              setEditingBrandName(brand.name);
                            }}
                            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                            title="Rename Brand"
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteBrand(brand.id, brand.name)}
                            disabled={deletingBrandId === brand.id}
                            className={`p-1 rounded-lg ${deletingBrandId === brand.id ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                          >
                            {deletingBrandId === brand.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* SUB TAB: PENDING PRODUCTS FOR APPROVAL */}
      {activeSubTab === 'pending' && !isStaff && (
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-950 font-sans">Pending Products Approval Queue</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Approve or reject products submitted by staff operators.</p>
            </div>
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 font-extrabold text-[10px] uppercase rounded-full border border-amber-100 font-mono">
              {products.filter(p => p.status === 'pending_review' && !p.archived).length} Pending
            </span>
          </div>

          <div className="space-y-4">
            {products.filter(p => p.status === 'pending_review' && !p.archived).length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic flex flex-col items-center space-y-3">
                <Check size={36} className="text-emerald-500 bg-emerald-50 p-2.5 rounded-full" />
                <p className="text-xs font-semibold">All products approved! The queue is empty.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {products.filter(p => p.status === 'pending_review' && !p.archived).map((product) => {
                  return (
                    <div key={product.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 relative shadow-3xs flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider font-mono">
                              {product.subBrand || 'SAT'}
                            </span>
                            <h4 className="text-xs font-black text-slate-900 mt-1.5">{product.name}</h4>
                            <p className="text-[9px] font-mono font-bold text-slate-400 uppercase mt-0.5">SKU: {product.sku}</p>
                          </div>
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt="Product" className="w-12 h-12 object-cover rounded-xl border border-slate-200" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center text-slate-300">
                              <Tag size={16} />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 border-t border-slate-100 pt-2 text-[10px]">
                          <div>
                            <span className="text-slate-400 font-medium block">Category:</span>
                            <span className="font-semibold text-slate-700 truncate block">{product.category}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block">Brand:</span>
                            <span className="font-semibold text-slate-700 truncate block">{product.brand}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block">Purchase Price:</span>
                            <span className="font-bold text-slate-800">৳ {product.costPrice.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 font-medium block">Selling Price:</span>
                            <span className="font-bold text-slate-800">৳ {product.sellingPrice.toLocaleString()}</span>
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-xl border border-slate-150 space-y-1.5">
                          <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider block">Physical Variants ({product.variants?.length || 0})</span>
                          <div className="max-h-[100px] overflow-y-auto space-y-1 pr-1">
                            {product.variants?.map((v, idx) => (
                              <div key={v.id || idx} className="flex justify-between items-center text-[9px] font-mono">
                                <span className="font-semibold text-slate-600">{v.color} / {v.model}</span>
                                <span className="font-black text-slate-800">{v.stock} pcs</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Approval Controls */}
                      <div className="border-t border-slate-150 pt-3 space-y-2">
                        {rejectingProductId === product.id ? (
                          <div className="space-y-2 p-2.5 bg-rose-50 border border-rose-100 rounded-xl">
                            <label className="block text-[9px] font-bold text-rose-700 uppercase tracking-wider">Reason for Rejection</label>
                            <input
                              type="text"
                              value={rejectionReasonText}
                              onChange={(e) => setRejectionReasonText(e.target.value)}
                              placeholder="e.g. Price mismatch or typo in variant details..."
                              className="w-full bg-white border border-rose-200 rounded-lg py-1.5 px-2.5 text-[11px] text-slate-800 focus:outline-hidden"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingProductId(null);
                                  setRejectionReasonText('');
                                }}
                                className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 rounded-md text-[9px] font-bold text-slate-600 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!rejectionReasonText.trim()) {
                                    setFormError("Rejection reason is required.");
                                    setTimeout(() => setFormError(''), 3000);
                                    return;
                                  }
                                  try {
                                    await updateProduct(product.id, { status: 'rejected', rejectionReason: rejectionReasonText.trim() });
                                    await onRefreshData();
                                    setRejectingProductId(null);
                                    setRejectionReasonText('');
                                    setFormSuccess(`Successfully rejected "${product.name}"`);
                                    setTimeout(() => setFormSuccess(''), 3000);
                                  } catch (err) {
                                    setFormError(`Rejection failed`);
                                    setTimeout(() => setFormError(''), 3000);
                                  }
                                }}
                                className="px-2.5 py-1 bg-rose-500 hover:bg-rose-600 rounded-md text-[9px] font-bold text-white shadow-3xs cursor-pointer"
                              >
                                Confirm Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  await updateProduct(product.id, { status: 'approved' });
                                  await onRefreshData();
                                  setFormSuccess(`Successfully approved "${product.name}"`);
                                  setTimeout(() => setFormSuccess(''), 3000);
                                } catch (err) {
                                  setFormError(`Approval failed`);
                                  setTimeout(() => setFormError(''), 3000);
                                }
                              }}
                              className="flex-grow py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[10px] rounded-lg shadow-3xs cursor-pointer flex items-center justify-center gap-1"
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              onClick={() => {
                                setRejectingProductId(product.id);
                                setRejectionReasonText('');
                              }}
                              className="flex-grow py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-[10px] rounded-lg shadow-3xs cursor-pointer flex items-center justify-center gap-1"
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DRAWER FOR ADDING / EDITING PRODUCTS */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity" onClick={handleCancelForm} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 md:pl-10">
            <div className="w-screen md:max-w-md bg-white text-slate-900 shadow-2xl flex flex-col justify-between">
              
              {/* Drawer Header */}
              <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-900 text-white">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">
                    {editModeProduct ? 'Update Catalog Record' : 'Publish New Gadget'}
                  </h2>
                  <p className="text-[10px] text-slate-300 mt-0.5">Define variant details, thresholds & branding specs.</p>
                </div>
                <button
                  onClick={handleCancelForm}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full cursor-pointer transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <form onSubmit={handleFormSubmit} className="flex-grow overflow-y-auto p-5 md:p-6 space-y-6">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-xs flex items-start gap-2">
                    <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                    <p className="font-semibold">{formError}</p>
                  </div>
                )}

                {formSuccess && (
                  <div className="bg-teal-50 border border-teal-200 text-teal-700 p-4 rounded-xl text-xs flex items-center gap-2">
                    <Check size={16} className="text-teal-500" />
                    <p className="font-semibold">{formSuccess}</p>
                  </div>
                )}

                {/* Step Indicator */}
                <div className="mb-6">
                  {/* Desktop Indicator */}
                  <div className="hidden sm:flex items-center justify-between relative px-2 py-4">
                    {/* Progress Line Background */}
                    <div className="absolute top-[34px] left-4 right-4 h-0.5 bg-slate-100 rounded-full z-0" />
                    
                    {/* Active Progress Line */}
                    <div 
                      className="absolute top-[34px] left-4 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full z-0 transition-all duration-500"
                      style={{ width: `${((wizardMaxStep - 1) / 4) * (100 - (100 / 5))}%` }}
                    />
                    
                    {[1, 2, 3, 4, 5].map((step) => {
                      const isCompleted = step < wizardStep || (editModeProduct && wizardMaxStep >= step);
                      const isActive = step === wizardStep;
                      const isSelectable = step <= wizardMaxStep;
                      
                      let stepTitle = "";
                      if (step === 1) stepTitle = "Basic Info";
                      else if (step === 2) stepTitle = "Pricing";
                      else if (step === 3) stepTitle = "Variants";
                      else if (step === 4) stepTitle = "Photography";
                      else if (step === 5) stepTitle = "Review";

                      return (
                        <button
                          key={step}
                          type="button"
                          disabled={!isSelectable}
                          onClick={() => handleJumpToStep(step)}
                          className={`relative z-10 flex flex-col items-center group transition-all focus:outline-hidden ${
                            isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'
                          }`}
                        >
                          <div className={`size-7 rounded-full flex items-center justify-center font-black text-[10px] transition-all border ${
                            isActive 
                              ? 'bg-slate-900 text-amber-400 border-slate-900 scale-110 ring-4 ring-amber-400/20' 
                              : isCompleted 
                                ? 'bg-amber-400 text-slate-950 border-amber-400 font-extrabold' 
                                : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                          }`}>
                            {isCompleted ? '✓' : step}
                          </div>
                          <span className={`text-[9px] font-black tracking-widest uppercase mt-2 transition-colors ${
                            isActive ? 'text-slate-900' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                          }`}>
                            {stepTitle}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Mobile Indicator */}
                  <div className="sm:hidden space-y-2">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest font-mono">
                        Step {wizardStep} of 5
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {wizardStep === 1 && "Basic Info"}
                        {wizardStep === 2 && "Pricing & Thresholds"}
                        {wizardStep === 3 && "Variants & Stock"}
                        {wizardStep === 4 && "Photography & Barcode"}
                        {wizardStep === 5 && "Review & Submit"}
                      </span>
                    </div>
                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all duration-500"
                        style={{ width: `${(wizardStep / 5) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* STEP 1: BASIC INFO */}
                {wizardStep === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-3xs">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">Step 1 of 5</span>
                        <h3 className="text-sm font-black text-slate-900 mt-1">Basic Info</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Identify the product name, company division mapping, and unique SKU format.</p>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Product Display Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formName}
                          onChange={(e) => {
                            setFormName(e.target.value);
                            if (stepErrors.name) setStepErrors(prev => ({ ...prev, name: '' }));
                          }}
                          className={`w-full bg-white border rounded-xl py-2.5 px-3.5 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all ${
                            stepErrors.name 
                              ? 'border-red-350 focus:border-red-400 focus:ring-red-100' 
                              : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                          }`}
                          placeholder="e.g. Joyroom JR-T03S Pro Earbuds"
                        />
                        {stepErrors.name && (
                          <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.name}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Division <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={formSubBrand}
                            onChange={(e) => setFormSubBrand(e.target.value as any)}
                            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 transition-all cursor-pointer"
                          >
                            <option value="SAT">SAT (Sky Auto)</option>
                            <option value="GZ">GadgetZu</option>
                            <option value="RTX">RTX Gadget</option>
                          </select>
                        </div>

                        <div className="md:max-w-xs">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            SKU Code Serial <span className="text-red-500">*</span>
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              required
                              value={formSku}
                              onChange={(e) => {
                                setFormSku(e.target.value);
                                setIsSkuDirty(true);
                                if (stepErrors.sku) setStepErrors(prev => ({ ...prev, sku: '' }));
                              }}
                              className={`flex-1 bg-white border rounded-xl py-2.5 px-3 text-xs font-mono text-slate-800 focus:outline-hidden uppercase focus:ring-4 transition-all ${
                                stepErrors.sku
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                              placeholder="MODEL-001"
                            />
                            <button
                              type="button"
                              onClick={handleAutoGenerateSku}
                              className="px-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl border border-amber-350 transition-all flex items-center justify-center cursor-pointer shadow-3xs"
                              title="Regenerate SKU automatically"
                            >
                              <Settings size={14} className="animate-spin-slow text-slate-950" />
                            </button>
                          </div>
                          {stepErrors.sku && (
                            <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.sku}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Main Category <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={formMainCategory}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormMainCategory(val);
                                setFormSubCategory('');
                                setFormChildCategory('');
                                setFormCategory(val); // backward compatibility
                                if (stepErrors.mainCategory) setStepErrors(prev => ({ ...prev, mainCategory: '' }));
                              }}
                              className={`w-full bg-white border rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all cursor-pointer ${
                                stepErrors.mainCategory
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                            >
                              <option value="">-- Select Main --</option>
                              {categories.filter(c => c.level === 'main' || !c.level).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                            {stepErrors.mainCategory && (
                              <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.mainCategory}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Sub Category <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={formSubCategory}
                              disabled={!formMainCategory}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormSubCategory(val);
                                setFormChildCategory('');
                                if (stepErrors.subCategory) setStepErrors(prev => ({ ...prev, subCategory: '' }));
                              }}
                              className={`w-full bg-white border rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all cursor-pointer ${
                                !formMainCategory ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''
                              } ${
                                stepErrors.subCategory
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                            >
                              <option value="">{formMainCategory ? '-- Select Sub --' : 'Select Main first'}</option>
                              {categories.filter(c => {
                                const isSub = c.level === 'sub';
                                const mainParentId = categories.find(p => p.name === formMainCategory && (p.level === 'main' || !p.level))?.id;
                                return isSub && c.parentId === mainParentId;
                              }).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                            {stepErrors.subCategory && (
                              <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.subCategory}</p>
                            )}
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Child Category <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={formChildCategory}
                              disabled={!formSubCategory}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormChildCategory(val);
                                if (stepErrors.childCategory) setStepErrors(prev => ({ ...prev, childCategory: '' }));
                              }}
                              className={`w-full bg-white border rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all cursor-pointer ${
                                !formSubCategory ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''
                              } ${
                                stepErrors.childCategory
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                            >
                              <option value="">{formSubCategory ? '-- Select Child --' : 'Select Sub first'}</option>
                              {categories.filter(c => {
                                const isChild = c.level === 'child';
                                const mainParentId = categories.find(p => p.name === formMainCategory && (p.level === 'main' || !p.level))?.id;
                                const subParentId = categories.find(s => s.name === formSubCategory && s.level === 'sub' && s.parentId === mainParentId)?.id;
                                return isChild && c.parentId === subParentId;
                              }).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                            {stepErrors.childCategory && (
                              <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.childCategory}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col justify-start">
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Brand <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={formBrand}
                            onChange={(e) => {
                              setFormBrand(e.target.value);
                              if (stepErrors.brand) setStepErrors(prev => ({ ...prev, brand: '' }));
                            }}
                            className={`w-full bg-white border rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all cursor-pointer ${
                              stepErrors.brand
                                ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                            }`}
                          >
                            {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                          </select>
                          {stepErrors.brand && (
                            <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.brand}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: PRICING & THRESHOLDS */}
                {wizardStep === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-3xs">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">Step 2 of 5</span>
                        <h3 className="text-sm font-black text-slate-900 mt-1">Pricing & Thresholds</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Specify items' purchase costs, customer pricing structures, and inventory alarm ranges.</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Purchase Price</label>
                          <div className="relative flex rounded-xl shadow-3xs">
                            <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-slate-500 text-xs font-mono font-bold">
                              ৳
                            </span>
                            <input
                              type="number"
                              disabled={isStaff}
                              value={formCostPrice}
                              onChange={(e) => {
                                setFormCostPrice(e.target.value === '' ? '' : Number(e.target.value));
                                if (stepErrors.costPrice) setStepErrors(prev => ({ ...prev, costPrice: '' }));
                              }}
                              className={`block w-full min-w-0 flex-1 rounded-none rounded-r-xl border bg-white py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden font-mono focus:ring-4 transition-all ${
                                stepErrors.costPrice
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                            />
                          </div>
                          {stepErrors.costPrice && (
                            <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.costPrice}</p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                            Selling Price <span className="text-red-500">*</span>
                          </label>
                          <div className="relative flex rounded-xl shadow-3xs">
                            <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 px-3 text-slate-500 text-xs font-mono font-bold">
                              ৳
                            </span>
                            <input
                              type="number"
                              value={formSellingPrice}
                              onChange={(e) => {
                                setFormSellingPrice(e.target.value === '' ? '' : Number(e.target.value));
                                if (stepErrors.sellingPrice) setStepErrors(prev => ({ ...prev, sellingPrice: '' }));
                              }}
                              className={`block w-full min-w-0 flex-1 rounded-none rounded-r-xl border bg-white py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden font-mono font-bold focus:ring-4 transition-all ${
                                stepErrors.sellingPrice
                                  ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                                  : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                              }`}
                            />
                          </div>
                          {stepErrors.sellingPrice && (
                            <p className="text-[10px] font-semibold text-red-500 mt-1">{stepErrors.sellingPrice}</p>
                          )}
                        </div>
                      </div>

                      {/* Calculated profit display */}
                      {Number(formSellingPrice) > 0 && (
                        <div className="flex flex-col gap-2 p-3 bg-white border border-slate-150 rounded-xl shadow-3xs">
                          <div className="flex items-center justify-between text-[11px] font-bold">
                            <span className="text-slate-500">Calculated Profit (৳):</span>
                            <span className={`font-black font-mono text-xs ${
                              Number(formSellingPrice) - Number(formCostPrice) >= 0 ? "text-emerald-600" : "text-red-600"
                            }`}>
                              ৳{(Number(formSellingPrice) - Number(formCostPrice)).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-bold border-t border-slate-100 pt-2">
                            <span className="text-slate-500">Profit Margin:</span>
                            {(() => {
                              const marginPercent = Math.round(((Number(formSellingPrice) - Number(formCostPrice)) / Number(formSellingPrice)) * 100);
                              return (
                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                  marginPercent > 0 
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                                    : marginPercent < 0 
                                      ? "bg-red-50 text-red-700 border border-red-200" 
                                      : "bg-slate-50 text-slate-700 border border-slate-200"
                                }`}>
                                  {marginPercent}% {marginPercent > 0 ? "Profit" : marginPercent < 0 ? "Loss" : "Break-even"}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Warning: Selling price lower than cost price */}
                      {Number(formSellingPrice) > 0 && Number(formSellingPrice) < Number(formCostPrice) && (
                        <div className="bg-amber-50 border border-amber-200 text-amber-700 p-2.5 rounded-xl text-[10px] flex items-center gap-1.5 animate-pulse">
                          <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                          <span className="font-bold">Selling price is lower than purchase cost.</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Reorder Alert Level</label>
                        <input
                          type="number"
                          value={formReorderThreshold}
                          onChange={(e) => {
                            setFormReorderThreshold(e.target.value === '' ? '' : Number(e.target.value));
                            if (stepErrors.reorderThreshold) setStepErrors(prev => ({ ...prev, reorderThreshold: '' }));
                          }}
                          className={`w-full bg-white border rounded-xl py-2.5 px-3.5 text-xs text-slate-800 focus:outline-hidden focus:ring-4 transition-all ${
                            stepErrors.reorderThreshold
                              ? 'border-red-350 focus:border-red-400 focus:ring-red-100'
                              : 'border-slate-200 focus:border-amber-400 focus:ring-amber-400/10'
                          }`}
                        />
                        <p className="text-[10px] text-slate-400 mt-1 italic leading-tight">Recommended: 5-10 units. An alert triggers when physical variant stock falls below this number.</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: VARIANTS & STOCK */}
                {wizardStep === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-3xs">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <div>
                          <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">Step 3 of 5</span>
                          <h3 className="text-sm font-black text-slate-900 mt-1">Variants & Stock</h3>
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Map all physical product sizes and colors.</p>
                        </div>
                        <button
                          type="button"
                          onClick={addVariantField}
                          className="text-[10px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-500 px-3 py-1.5 rounded-lg border border-amber-350 transition-all flex items-center gap-1 shadow-3xs cursor-pointer"
                        >
                          <Plus size={12} /> Add Variant
                        </button>
                      </div>

                      {stepErrors.variants && (
                        <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">{stepErrors.variants}</p>
                      )}

                      <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
                        {formVariants.map((variant, index) => (
                          <div key={variant.id} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 relative group shadow-3xs">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                Variant #{index + 1}
                              </span>
                              {formVariants.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeVariantField(variant.id)}
                                  className="text-slate-300 hover:text-red-500 transition-colors cursor-pointer"
                                  title="Remove Variant"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Color/Finish</label>
                                {!isCustomColorMode[variant.id] ? (
                                  <select
                                    value={variant.color}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '__add_custom__') {
                                        setIsCustomColorMode(prev => ({ ...prev, [variant.id]: true }));
                                        updateVariantValue(variant.id, 'color', '');
                                      } else {
                                        updateVariantValue(variant.id, 'color', val);
                                      }
                                      if (stepErrors[`variant-color-${variant.id}`]) {
                                        setStepErrors(prev => ({ ...prev, [`variant-color-${variant.id}`]: '' }));
                                      }
                                    }}
                                    className={`mt-1 w-full bg-slate-50 border rounded-xl py-2 px-3 text-xs text-slate-800 cursor-pointer ${
                                      stepErrors[`variant-color-${variant.id}`] ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:ring-amber-400/10'
                                    }`}
                                  >
                                    <option value="">-- Select Color --</option>
                                    {availableColors.map(c => <option key={c} value={c}>{c}</option>)}
                                    <option value="__add_custom__" className="text-amber-600 font-bold">+ Add custom color...</option>
                                  </select>
                                ) : (
                                  <div className="mt-1 flex gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="e.g. Matte Gray"
                                      value={customColorValue[variant.id] || ''}
                                      onChange={(e) => setCustomColorValue(prev => ({ ...prev, [variant.id]: e.target.value }))}
                                      className="flex-grow bg-slate-50 border border-slate-200 rounded-xl py-1 px-2.5 text-xs focus:outline-hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const customVal = (customColorValue[variant.id] || '').trim();
                                        if (customVal) {
                                          await handleAddCustomColor(customVal);
                                          updateVariantValue(variant.id, 'color', customVal);
                                          setIsCustomColorMode(prev => ({ ...prev, [variant.id]: false }));
                                        }
                                      }}
                                      className="px-2 bg-amber-400 hover:bg-amber-500 font-bold rounded-lg text-[10px] text-slate-950 shadow-xs cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCustomColorMode(prev => ({ ...prev, [variant.id]: false }));
                                        updateVariantValue(variant.id, 'color', '');
                                      }}
                                      className="px-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] text-slate-500 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                                {stepErrors[`variant-color-${variant.id}`] && (
                                  <p className="text-[9px] font-semibold text-red-500 mt-1">{stepErrors[`variant-color-${variant.id}`]}</p>
                                )}
                              </div>

                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Model/Size</label>
                                {!isCustomSizeMode[variant.id] ? (
                                  <select
                                    value={variant.model}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === '__add_custom__') {
                                        setIsCustomSizeMode(prev => ({ ...prev, [variant.id]: true }));
                                        updateVariantValue(variant.id, 'model', '');
                                      } else {
                                        updateVariantValue(variant.id, 'model', val);
                                      }
                                      if (stepErrors[`variant-model-${variant.id}`]) {
                                        setStepErrors(prev => ({ ...prev, [`variant-model-${variant.id}`]: '' }));
                                      }
                                    }}
                                    className={`mt-1 w-full bg-slate-50 border rounded-xl py-2 px-3 text-xs text-slate-800 cursor-pointer ${
                                      stepErrors[`variant-model-${variant.id}`] ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:ring-amber-400/10'
                                    }`}
                                  >
                                    <option value="">-- Select Size/Model --</option>
                                    {availableSizes.map(s => <option key={s} value={s}>{s}</option>)}
                                    <option value="__add_custom__" className="text-amber-600 font-bold">+ Add custom size...</option>
                                  </select>
                                ) : (
                                  <div className="mt-1 flex gap-1.5">
                                    <input
                                      type="text"
                                      placeholder="e.g. 1TB"
                                      value={customSizeValue[variant.id] || ''}
                                      onChange={(e) => setCustomSizeValue(prev => ({ ...prev, [variant.id]: e.target.value }))}
                                      className="flex-grow bg-slate-50 border border-slate-200 rounded-xl py-1 px-2.5 text-xs focus:outline-hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const customVal = (customSizeValue[variant.id] || '').trim();
                                        if (customVal) {
                                          await handleAddCustomSize(customVal);
                                          updateVariantValue(variant.id, 'model', customVal);
                                          setIsCustomSizeMode(prev => ({ ...prev, [variant.id]: false }));
                                        }
                                      }}
                                      className="px-2 bg-amber-400 hover:bg-amber-500 font-bold rounded-lg text-[10px] text-slate-950 shadow-xs cursor-pointer"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCustomSizeMode(prev => ({ ...prev, [variant.id]: false }));
                                        updateVariantValue(variant.id, 'model', '');
                                      }}
                                      className="px-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] text-slate-500 cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                                {stepErrors[`variant-model-${variant.id}`] && (
                                  <p className="text-[9px] font-semibold text-red-500 mt-1">{stepErrors[`variant-model-${variant.id}`]}</p>
                                )}
                              </div>
                            </div>

                            <div>
                              <label className="text-[9px] font-bold text-slate-500 uppercase">Initial Stock</label>
                              <input
                                type="number"
                                value={variant.stock}
                                onChange={(e) => {
                                  updateVariantValue(variant.id, 'stock', e.target.value === '' ? '' : Number(e.target.value));
                                  if (stepErrors[`variant-stock-${variant.id}`]) {
                                    setStepErrors(prev => ({ ...prev, [`variant-stock-${variant.id}`]: '' }));
                                  }
                                }}
                                className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800 focus:outline-hidden focus:ring-4 focus:ring-amber-400/10 transition-all"
                              />
                              {stepErrors[`variant-stock-${variant.id}`] && (
                                <p className="text-[9px] font-semibold text-red-500 mt-1">{stepErrors[`variant-stock-${variant.id}`]}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 4: PHOTOGRAPHY & PREVIEW */}
                {wizardStep === 4 && (
                  <motion.div
                    key="step-4"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-3xs">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">Step 4 of 5</span>
                        <h3 className="text-sm font-black text-slate-900 mt-1">Product Photography & Barcode</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Upload visual gadget images and review auto-generated barcode configurations.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Photography Assets</label>
                        <div className="grid grid-cols-4 gap-2">
                          {formImages.map((img, idx) => (
                            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white shadow-3xs">
                              <img src={img} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <button
                                type="button"
                                onClick={() => removeImage(idx)}
                                className="absolute inset-0 flex items-center justify-center bg-slate-950/60 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-200"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ))}
                          <label className="aspect-square rounded-xl border-2 border-dashed border-slate-250 hover:border-amber-400 hover:bg-amber-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer transition-all">
                            <Upload size={18} />
                            <span className="text-[8px] font-extrabold mt-1 uppercase tracking-wider">Upload</span>
                            <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                          </label>
                        </div>
                      </div>

                      {/* Barcode Tag live rendering preview */}
                      <div className="border-t border-slate-200 pt-3.5 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">Live Barcode Tag Preview</span>
                          <span className="text-[9px] font-mono font-bold text-amber-500 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{formSku || 'TEMP-SKU'}</span>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-150 flex flex-col items-center justify-center shadow-3xs">
                          <Barcode 
                            value={formSku || 'TEMP-SKU-CODE'} 
                            height={44} 
                            width={1.4} 
                            fontSize={9} 
                            margin={5} 
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* STEP 5: REVIEW & SUBMIT */}
                {wizardStep === 5 && (
                  <motion.div
                    key="step-5"
                    initial={{ opacity: 0, x: 15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="space-y-4"
                  >
                    <div className="bg-slate-50 border border-slate-150 p-5 rounded-2xl space-y-4 shadow-3xs text-xs">
                      <div className="border-b border-slate-100 pb-3">
                        <span className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest font-mono">Step 5 of 5</span>
                        <h3 className="text-sm font-black text-slate-900 mt-1">Review & Submit</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">Review the entered specs and variant information before submission.</p>
                      </div>

                      <div className="space-y-3">
                        <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Basic Details</h4>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div>
                              <span className="text-slate-400 font-medium block">Display Name:</span>
                              <span className="font-bold text-slate-800">{formName}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">SKU Code:</span>
                              <span className="font-mono font-black text-slate-900 uppercase">{formSku}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">Hierarchy:</span>
                              <span className="font-semibold text-slate-700">
                                {formMainCategory} → {formSubCategory} → {formChildCategory}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">Brand & Division:</span>
                              <span className="font-semibold text-slate-700">{formBrand} ({formSubBrand})</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial & Stock specs</h4>
                          <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                            <div>
                              <span className="text-slate-400 font-medium block">Purchase Price:</span>
                              <span className="font-bold text-slate-800">৳{Number(formCostPrice).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">Selling Price:</span>
                              <span className="font-bold text-slate-800">৳{Number(formSellingPrice).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">Live Profit (৳):</span>
                              <span className={`font-black ${
                                Number(formSellingPrice) - Number(formCostPrice) >= 0 ? "text-emerald-600" : "text-red-600"
                              }`}>
                                ৳{(Number(formSellingPrice) - Number(formCostPrice)).toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 font-medium block">Alert Level:</span>
                              <span className="font-semibold text-slate-700">{formReorderThreshold} units</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2.5">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Variants Configured</h4>
                          <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                            {formVariants.map((v, i) => (
                              <div key={v.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px]">
                                <span className="font-bold text-slate-700">
                                  Variant #{i + 1}: {v.color} / {v.model}
                                </span>
                                <span className="font-mono text-slate-500">
                                  {v.stock} pcs | Code: {formSku}-{v.color.toUpperCase().replace(/\s+/g, '')}-{v.model.toUpperCase().replace(/\s+/g, '')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {formImages.length > 0 && (
                          <div className="bg-white p-4 rounded-xl border border-slate-150 space-y-2">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Uploaded Images ({formImages.length})</h4>
                            <div className="flex gap-2 overflow-x-auto py-1">
                              {formImages.map((img, idx) => (
                                <img key={idx} src={img} alt="Thumb" className="w-10 h-10 object-cover rounded-md border border-slate-200" referrerPolicy="no-referrer" />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </form>

              {/* Drawer Sticky Footer with Back/Next/Publish controls */}
              <div className="p-5 md:p-6 border-t border-slate-150 bg-slate-50 flex items-center justify-between gap-3">
                {wizardStep > 1 ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handlePrevStep}
                    className="px-4 py-3 bg-white border border-slate-250 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCancelForm}
                    className="px-4 py-3 bg-white border border-slate-250 text-slate-500 hover:text-slate-800 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {wizardStep < 5 ? (
                  <>
                    {wizardStep > 1 && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleCancelForm}
                        className="px-4 py-3 text-slate-500 hover:text-slate-800 font-bold text-xs transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleNextStep}
                      className="flex-grow py-3 bg-slate-900 hover:bg-slate-950 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer ml-auto"
                    >
                      Continue <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleCancelForm}
                      className="px-4 py-3 text-slate-500 hover:text-slate-800 font-bold text-xs transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-grow py-3 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Publishing...</span>
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          <span>{editModeProduct ? 'Commit Updates' : (user?.role === 'staff' ? 'Submit for Review' : 'Publish to Catalog')}</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
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
            
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Import a CSV dataset containing inventory records. Below are the required headers for columns:
            </p>
            <div className="mt-2 bg-slate-900 text-amber-400 p-3 rounded-xl font-mono text-[10px] select-all overflow-x-auto border border-slate-800">
              Name, SKU, Category, Brand, SubBrand, CostPrice, SellingPrice, ReorderThreshold
            </div>

            {csvError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <p>{csvError}</p>
              </div>
            )}

            {csvSuccess && (
              <div className="mt-4 bg-teal-50 border border-teal-200 text-teal-600 p-3 rounded-xl text-xs flex items-start gap-2">
                <p className="font-bold">{csvSuccess}</p>
              </div>
            )}

            <div className="mt-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-emerald-500 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
              <Upload size={32} className="text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">Click to upload CSV spreadsheet</p>
              <p className="text-[10px] text-slate-400 mt-1">Only .csv extensions supported</p>
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
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-150 p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="space-y-1.5">
              <h3 className="text-sm font-black text-slate-950 font-sans">{confirmDialog.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-sans">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
