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
  Coins
} from 'lucide-react';
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
  getBrands, 
  addBrand, 
  deleteBrand,
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
  const [activeSubTab, setActiveSubTab] = useState<'catalog' | 'categories' | 'brands'>('catalog');

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
  const [formCategory, setFormCategory] = useState('');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formSubBrand, setFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [formCostPrice, setFormCostPrice] = useState<number>(0);
  const [formSellingPrice, setFormSellingPrice] = useState<number>(0);
  const [formReorderThreshold, setFormReorderThreshold] = useState<number>(5);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formVariants, setFormVariants] = useState<Variant[]>([
    { id: '1', color: 'Default', model: 'Standard', stock: 10 }
  ]);

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
    const initialCategory = categories[0]?.name || '';
    const initialBrand = brands[0]?.name || '';
    setFormCategory(initialCategory);
    setFormSubCategory('');
    setFormBrand(initialBrand);
    setFormSubBrand('SAT');
    setFormCostPrice(0);
    setFormSellingPrice(0);
    setFormReorderThreshold(5);
    setFormImages([]);
    setFormVariants([{ id: Date.now().toString(), color: 'Default', model: 'Standard', stock: 10 }]);
    
    // Clear custom mode maps
    setCustomColorValue({});
    setCustomSizeValue({});
    setIsCustomColorMode({});
    setIsCustomSizeMode({});
    
    // Generate initial SKU
    const initialSku = generateSkuCode('SAT', initialCategory, initialBrand);
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
    setFormCategory(product.category);
    setFormSubCategory(product.subCategory || '');
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
    if (submitting) return;

    setFormError('');
    setFormSuccess('');
    
    if (requireCheckIn && !requireCheckIn()) return;

    // Required fields validation
    if (!formName.trim()) {
      setFormError('Product Display Name is required.');
      return;
    }
    if (!formSku.trim()) {
      setFormError('SKU Code is required.');
      return;
    }
    if (!formCategory) {
      setFormError('Category is required.');
      return;
    }
    if (!formBrand) {
      setFormError('Brand is required.');
      return;
    }
    if (!formSubBrand) {
      setFormError('Division is required.');
      return;
    }
    if (Number(formSellingPrice) <= 0) {
      setFormError('Selling Price is required and must be greater than zero.');
      return;
    }

    const finalSku = formSku.trim().toUpperCase();

    // SKU must be unique - check against existing active products
    const isDuplicateSku = products.some(
      p => p.sku.toUpperCase() === finalSku && 
      (!editModeProduct || p.id !== editModeProduct.id) && 
      !p.archived
    );
    if (isDuplicateSku) {
      setFormError(`SKU Code "${finalSku}" is already assigned to another active product. SKU must be unique.`);
      return;
    }

    // Validate variants
    for (const v of formVariants) {
      if (!v.color.trim()) {
        setFormError('Please select or specify a Color/Finish for all variants.');
        return;
      }
      if (!v.model.trim()) {
        setFormError('Please select or specify a Model/Size for all variants.');
        return;
      }
    }

    setSubmitting(true);

    // Prepare payload
    const productPayload = {
      name: formName.trim(),
      sku: finalSku,
      category: formCategory || '',
      subCategory: formSubCategory || '',
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
      barcodeValue: finalSku
    };

    try {
      if (editModeProduct) {
        // Edit existing product
        await updateProduct(editModeProduct.id, productPayload);
        setFormSuccess('Product details updated successfully!');
      } else {
        // Create new product
        await addProduct(productPayload, user?.id || 'demo', user?.name || 'Operator');
        setFormSuccess('New product successfully published to catalog!');
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
    if (confirm(`Are you sure you want to archive "${product.name}"?`)) {
      await archiveProduct(product.id);
      await onRefreshData();
      if (selectedProduct?.id === product.id) {
        setSelectedProduct(null);
      }
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
      const subs = newCatSub.split(',').map(s => s.trim()).filter(s => s.length > 0);
      await addCategory(newCatName.trim(), subs);
      setFormSuccess(`Category "${newCatName}" created!`);
      setNewCatName('');
      setNewCatSub('');
      await onRefreshData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create category.');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (isStaff) return;
    
    // Check if category is in use
    const inUse = products.some(p => p.category === name && !p.archived);
    if (inUse) {
      alert(`Cannot delete category "${name}" because it is currently in use by one or more products. Please reassign those products first.`);
      return;
    }
    
    if (confirm(`Are you sure you want to delete the category "${name}"?`)) {
      setDeletingCatId(id);
      try {
        await deleteCategory(id);
        await onRefreshData();
      } catch (err: any) {
        console.warn("Delete category failed:", err.message || err);
        alert(`Failed to delete category: ${err.message || 'Permission denied'}`);
      } finally {
        setDeletingCatId(null);
      }
    }
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
    
    // Check if brand is in use
    const inUse = products.some(p => p.brand === name && !p.archived);
    if (inUse) {
      alert(`Cannot delete brand "${name}" because it is currently in use by one or more products. Please reassign those products first.`);
      return;
    }
    
    if (confirm(`Are you sure you want to delete the brand "${name}"?`)) {
      setDeletingBrandId(id);
      try {
        await deleteBrand(id);
        await onRefreshData();
      } catch (err: any) {
        console.warn("Delete brand failed:", err.message || err);
        alert(`Failed to delete brand: ${err.message || 'Permission denied'}`);
      } finally {
        setDeletingBrandId(null);
      }
    }
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
                      <span className="text-slate-400">Cost Price</span>
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
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Category Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Smart Glasses"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Sub-categories (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Audio, Video, VR"
                  value={newCatSub}
                  onChange={(e) => setNewCatSub(e.target.value)}
                  className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition-all shadow-md"
              >
                Create Category
              </button>
            </form>
          </div>

          {/* List categories */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-950 font-sans">Active Product Categories</h3>
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{cat.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Subs: {cat.subCategories.join(', ') || 'None'}
                    </p>
                  </div>
                  {!isStaff && (
                    <button
                      onClick={() => handleDeleteCategory(cat.id, cat.name)}
                      disabled={deletingCatId === cat.id}
                      className={`p-1 rounded-lg ${deletingCatId === cat.id ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                    >
                      {deletingCatId === cat.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              ))}
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
                <div key={brand.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-900">{brand.name}</h4>
                  {!isStaff && (
                    <button
                      onClick={() => handleDeleteBrand(brand.id, brand.name)}
                      disabled={deletingBrandId === brand.id}
                      className={`p-1 rounded-lg ${deletingBrandId === brand.id ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                    >
                      {deletingBrandId === brand.id ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* DRAWER FOR ADDING / EDITING PRODUCTS */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-0 md:pl-10">
            <div className="w-screen md:max-w-md bg-white text-slate-900 shadow-2xl flex flex-col justify-between">
              
              {/* Drawer Header */}
              <div className="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    {editModeProduct ? 'Edit Gadget Record' : 'Add New Gadget to Catalog'}
                  </h2>
                  <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">Specify complete variant, pricing & brand context.</p>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Drawer Scrollable Content */}
              <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
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

                {/* Form Progress Indicators (1, 2, 3, 4) */}
                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Form Progress</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all ${formName.trim() && formSku.trim() ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-slate-200 text-slate-500'}`}>1</span>
                    <span className="text-slate-300 text-[10px]">➔</span>
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all ${Number(formSellingPrice) > 0 ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-slate-200 text-slate-500'}`}>2</span>
                    <span className="text-slate-300 text-[10px]">➔</span>
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all ${formVariants.length > 0 && formVariants.every(v => v.color && v.model) ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-slate-200 text-slate-500'}`}>3</span>
                    <span className="text-slate-300 text-[10px]">➔</span>
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold transition-all ${formImages.length > 0 ? 'bg-amber-400 text-slate-950 font-extrabold' : 'bg-slate-200 text-slate-500'}`}>4</span>
                  </div>
                </div>
                
                {/* Section 1: Basic Info */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-5 h-5 flex items-center justify-center bg-slate-900 text-amber-400 rounded-full text-[10px] font-bold font-mono">1</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Basic Info</h3>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Product Display Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                      placeholder="e.g. Joyroom JR-T03S Pro Earbuds"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Division <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formSubBrand}
                        onChange={(e) => setFormSubBrand(e.target.value as any)}
                        className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                      >
                        <option value="SAT">SAT (Sky Auto)</option>
                        <option value="GZ">GadgetZu</option>
                        <option value="RTX">RTX Gadget</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        SKU Code Serial <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-1.5 mt-1">
                        <input
                          type="text"
                          required
                          value={formSku}
                          onChange={(e) => {
                            setFormSku(e.target.value);
                            setIsSkuDirty(true);
                          }}
                          className="flex-1 bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs font-mono text-slate-800 focus:outline-hidden uppercase focus:ring-1 focus:ring-amber-400"
                          placeholder="MODEL-001"
                        />
                        <button
                          type="button"
                          onClick={handleAutoGenerateSku}
                          className="px-2.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl border border-amber-300 transition-colors flex items-center justify-center"
                          title="Regenerate SKU automatically"
                        >
                          <Settings size={14} className="animate-spin-slow text-slate-950" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                      >
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Brand <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formBrand}
                        onChange={(e) => setFormBrand(e.target.value)}
                        className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                      >
                        {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Pricing & Thresholds */}
                <div className="bg-amber-50/20 p-4 rounded-2xl border border-amber-100/50 space-y-4 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-amber-100/50">
                    <span className="w-5 h-5 flex items-center justify-center bg-amber-400 text-slate-950 rounded-full text-[10px] font-bold font-mono">2</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <Coins size={12} /> Pricing & Thresholds
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">Cost Price</label>
                      <div className="relative mt-1 flex rounded-xl shadow-2xs">
                        <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-slate-500 text-sm md:text-xs">
                          ৳
                        </span>
                        <input
                          type="number"
                          disabled={isStaff}
                          value={formCostPrice}
                          onChange={(e) => setFormCostPrice(Number(e.target.value))}
                          className="block w-full min-w-0 flex-1 rounded-none rounded-r-xl border border-slate-200 bg-white py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase">Selling Price <span className="text-red-500">*</span></label>
                      <div className="relative mt-1 flex rounded-xl shadow-2xs">
                        <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-slate-500 text-sm md:text-xs">
                          ৳
                        </span>
                        <input
                          type="number"
                          value={formSellingPrice}
                          onChange={(e) => setFormSellingPrice(Number(e.target.value))}
                          className="block w-full min-w-0 flex-1 rounded-none rounded-r-xl border border-slate-200 bg-white py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calculated profit margin percentage */}
                  {Number(formSellingPrice) > 0 && (
                    <div className="flex items-center justify-between text-[11px] font-bold p-2.5 bg-slate-50 border border-slate-150 rounded-xl">
                      <span className="text-slate-500">Calculated Profit Margin:</span>
                      {(() => {
                        const marginPercent = Math.round(((Number(formSellingPrice) - Number(formCostPrice)) / Number(formSellingPrice)) * 100);
                        return (
                          <span className={marginPercent > 0 ? "text-emerald-600" : marginPercent < 0 ? "text-red-500" : "text-slate-500"}>
                            {marginPercent}% {marginPercent > 0 ? "Profit" : marginPercent < 0 ? "Loss" : "Break-even"}
                          </span>
                        );
                      })()}
                    </div>
                  )}

                  {/* Warning: Selling price lower than cost price */}
                  {Number(formSellingPrice) > 0 && Number(formSellingPrice) < Number(formCostPrice) && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 p-2.5 rounded-xl text-[10px] flex items-center gap-1.5 animate-pulse">
                      <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
                      <span>⚠ Selling price is lower than cost price</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase">Reorder Alert Level</label>
                    <input
                      type="number"
                      value={formReorderThreshold}
                      onChange={(e) => setFormReorderThreshold(Number(e.target.value))}
                      className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-3 md:py-2 px-3 text-sm md:text-xs text-slate-800 focus:outline-hidden"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 italic font-sans">Suggested: 5-10 units</p>
                  </div>
                </div>

                {/* Section 3: Variants & Stock */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-4 shadow-2xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-slate-900 text-amber-400 rounded-full text-[10px] font-bold font-mono">3</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Variants & Stock</h3>
                    </div>
                    <button
                      type="button"
                      onClick={addVariantField}
                      className="text-[10px] font-bold text-[#008080] bg-[#008080]/5 hover:bg-[#008080]/10 px-2.5 py-1.5 rounded-lg border border-[#008080]/25 transition-colors flex items-center gap-1"
                    >
                      <Plus size={12} /> Add Variant
                    </button>
                  </div>
                  
                  <div className="space-y-4">
                    {formVariants.map((variant, index) => (
                      <div key={variant.id} className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3 relative group shadow-2xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Variant #{index + 1}
                          </span>
                          {formVariants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeVariantField(variant.id)}
                              className="text-slate-300 hover:text-red-500 transition-colors"
                              title="Remove Variant"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Color/Finish</label>
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
                                }}
                                className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800"
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
                                  className="px-2 bg-amber-400 hover:bg-amber-500 font-bold rounded-lg text-[10px] text-slate-950 shadow-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsCustomColorMode(prev => ({ ...prev, [variant.id]: false }));
                                    updateVariantValue(variant.id, 'color', '');
                                  }}
                                  className="px-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] text-slate-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase">Model/Size</label>
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
                                }}
                                className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800"
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
                                  className="px-2 bg-amber-400 hover:bg-amber-500 font-bold rounded-lg text-[10px] text-slate-950 shadow-xs"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsCustomSizeMode(prev => ({ ...prev, [variant.id]: false }));
                                    updateVariantValue(variant.id, 'model', '');
                                  }}
                                  className="px-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] text-slate-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-[9px] font-bold text-slate-400 uppercase">Initial Stock</label>
                          <input
                            type="number"
                            value={variant.stock}
                            onChange={(e) => updateVariantValue(variant.id, 'stock', Number(e.target.value))}
                            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-800"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section 4: Product Photography */}
                <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 space-y-3 shadow-2xs">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <span className="w-5 h-5 flex items-center justify-center bg-slate-900 text-amber-400 rounded-full text-[10px] font-bold font-mono">4</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Product Photography</h3>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {formImages.map((img, idx) => (
                      <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white">
                        <img src={img} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                    <label className="aspect-square rounded-xl border-2 border-dashed border-slate-200 hover:border-amber-400 hover:bg-amber-50 flex flex-col items-center justify-center text-slate-400 cursor-pointer transition-all">
                      <Upload size={20} />
                      <span className="text-[9px] font-bold mt-1 uppercase">Upload</span>
                      <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
                    </label>
                  </div>
                </div>

              </form>

              {/* Drawer Sticky Footer with loading spinner and submit button */}
              <div className="p-5 md:p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsDrawerOpen(false)}
                  className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFormSubmit}
                  disabled={submitting}
                  className="flex-[2] py-3.5 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Saving to Catalog...</span>
                    </>
                  ) : (
                    <span>{editModeProduct ? 'Commit Updates' : 'Publish to Catalog'}</span>
                  )}
                </button>
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

    </div>
  );
}
