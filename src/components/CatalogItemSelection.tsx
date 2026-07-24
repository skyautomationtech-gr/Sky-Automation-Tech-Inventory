import React, { useState, useMemo } from 'react';
import { Product, OrderItem } from '../types';
import { getBrandLogo } from '../utils/brandLogos';
import { 
  ShoppingCart, 
  Plus, 
  Minus, 
  Trash2, 
  ArrowRight, 
  Image as ImageIcon, 
  Search, 
  Zap, 
  Filter, 
  X, 
  ShoppingBag, 
  CheckCircle2
} from 'lucide-react';

interface CatalogItemSelectionProps {
  products: Product[];
  orderItems: OrderItem[];
  setOrderItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  onNext: () => void;
}

export default function CatalogItemSelection({
  products,
  orderItems,
  setOrderItems,
  onNext
}: CatalogItemSelectionProps) {
  // Local state for product selections: productId -> { color?, model?, variantId, qty }
  const [selections, setSelections] = useState<Record<string, { color?: string; model?: string; variantId: string; qty: number }>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedBrand, setSelectedBrand] = useState<string>('All');
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [addedNotification, setAddedNotification] = useState<string | null>(null);

  // Extract unique categories & brands for filtering
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.brand) set.add(p.brand);
    });
    return ['All', ...Array.from(set)];
  }, [products]);

  // Filter products by search, category, and brand
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
      const matchesBrand = selectedBrand === 'All' || p.brand === selectedBrand;
      const matchesStockStatus = p.stockStatus !== 'out_of_stock';
      return matchesSearch && matchesCategory && matchesBrand && matchesStockStatus;
    });
  }, [products, searchQuery, selectedCategory, selectedBrand]);

  // Helper to get selection state for a product
  const getSelection = (product: Product) => {
    const current = selections[product.id];
    if (current) return current;

    // Default to first variant if exists
    const firstVariant = product.variants?.[0];
    return {
      color: firstVariant?.color || '',
      model: firstVariant?.model || '',
      variantId: firstVariant?.id || 'no-variant',
      qty: 1
    };
  };

  const updateSelection = (productId: string, updates: Partial<{ color: string; model: string; variantId: string; qty: number }>) => {
    setSelections(prev => {
      const existing = prev[productId] || { variantId: '', qty: 1 };
      return {
        ...prev,
        [productId]: { ...existing, ...updates }
      };
    });
  };

  // Color selection update
  const handleColorSelect = (product: Product, color: string) => {
    const sel = getSelection(product);
    const targetModel = sel.model;
    
    // Find matching variant with this color and current model (or first matching color)
    const matchedVariant = product.variants?.find(v => v.color === color && (!targetModel || v.model === targetModel)) ||
                           product.variants?.find(v => v.color === color) ||
                           product.variants?.[0];

    updateSelection(product.id, {
      color,
      model: matchedVariant?.model || targetModel,
      variantId: matchedVariant?.id || 'no-variant'
    });
  };

  // Model selection update
  const handleModelSelect = (product: Product, model: string) => {
    const sel = getSelection(product);
    const targetColor = sel.color;

    const matchedVariant = product.variants?.find(v => v.model === model && (!targetColor || v.color === targetColor)) ||
                           product.variants?.find(v => v.model === model) ||
                           product.variants?.[0];

    updateSelection(product.id, {
      model,
      color: matchedVariant?.color || targetColor,
      variantId: matchedVariant?.id || 'no-variant'
    });
  };

  // Unified variant selection
  const handleVariantSelect = (product: Product, variantId: string) => {
    const variant = product.variants?.find(v => v.id === variantId);
    if (variant) {
      updateSelection(product.id, {
        variantId: variant.id,
        color: variant.color || '',
        model: variant.model || ''
      });
    }
  };

  // Quantity stepper
  const handleQtyChange = (product: Product, delta: number) => {
    const current = getSelection(product).qty;
    const newQty = Math.max(1, current + delta);
    updateSelection(product.id, { qty: newQty });
  };

  // Add to Cart
  const handleAddToCart = (product: Product) => {
    const sel = getSelection(product);
    const variant = product.variants?.find(v => v.id === sel.variantId) || product.variants?.[0];
    
    const vLabel = variant 
      ? (`${variant.color || ''} ${variant.model || ''}`.trim() || 'Standard') 
      : 'Standard';
    const vId = variant ? variant.id : 'no-variant';

    const newItem: OrderItem = {
      productId: product.id,
      variantId: vId,
      productName: product.name,
      variantLabel: vLabel,
      qty: sel.qty,
      unitPrice: product.sellingPrice
    };

    setOrderItems(prev => {
      const existingIdx = prev.findIndex(item => item.productId === newItem.productId && item.variantId === newItem.variantId);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].qty += newItem.qty;
        return copy;
      }
      return [...prev, newItem];
    });

    // Reset product local qty back to 1
    updateSelection(product.id, { qty: 1 });

    // Toast feedback
    setAddedNotification(`Added ${sel.qty}x ${product.name} (${vLabel})`);
    setTimeout(() => setAddedNotification(null), 2500);
  };

  // Buy Now (Fast Single/Direct Checkout)
  const handleBuyNow = (product: Product) => {
    const sel = getSelection(product);
    const variant = product.variants?.find(v => v.id === sel.variantId) || product.variants?.[0];
    
    const vLabel = variant 
      ? (`${variant.color || ''} ${variant.model || ''}`.trim() || 'Standard') 
      : 'Standard';
    const vId = variant ? variant.id : 'no-variant';

    const newItem: OrderItem = {
      productId: product.id,
      variantId: vId,
      productName: product.name,
      variantLabel: vLabel,
      qty: sel.qty,
      unitPrice: product.sellingPrice
    };

    setOrderItems(prev => {
      const existingIdx = prev.findIndex(item => item.productId === newItem.productId && item.variantId === newItem.variantId);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].qty += newItem.qty;
        return copy;
      }
      return [...prev, newItem];
    });

    // Move directly to next step (Customer Connection / Payment Review)
    onNext();
  };

  // Cart quantity controls
  const updateCartQty = (index: number, delta: number) => {
    setOrderItems(prev => {
      const copy = [...prev];
      const newQty = copy[index].qty + delta;
      if (newQty < 1) return copy;
      copy[index].qty = newQty;
      return copy;
    });
  };

  const removeCartItem = (index: number) => {
    setOrderItems(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setOrderItems([]);
  };

  const orderTotal = orderItems.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
  const totalItemCount = orderItems.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start relative min-h-[500px]">
      
      {/* Toast Notification */}
      {addedNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-950 text-white border border-amber-400/40 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-up">
          <CheckCircle2 size={18} className="text-amber-400" />
          <span className="text-xs font-bold font-sans">{addedNotification}</span>
        </div>
      )}

      {/* Main Catalog View */}
      <div className="flex-1 w-full space-y-5">
        
        {/* Search & Filters Header */}
        <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-3xl space-y-3 shadow-xs">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search catalog by product name or SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-medium focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 placeholder-slate-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Brand Dropdown Filter */}
            {brands.length > 2 && (
              <div className="w-full sm:w-48">
                <select
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl py-2.5 px-3 text-xs font-bold text-slate-700 focus:outline-hidden focus:border-amber-400"
                >
                  <option value="All">All Brands</option>
                  {brands.filter(b => b !== 'All').map(brand => (
                    <option key={brand} value={brand}>{brand}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Category Filter Pills */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 mr-1 flex items-center gap-1">
                <Filter size={12} /> Category:
              </span>
              {categories.map(cat => {
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all duration-150 text-[11px] ${
                      isActive 
                        ? 'bg-slate-950 text-amber-400 shadow-xs border border-slate-950' 
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Catalog Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map(product => {
            const currentSel = getSelection(product);
            const activeVariant = product.variants?.find(v => v.id === currentSel.variantId) || product.variants?.[0];
            const activeStock = activeVariant ? activeVariant.stock : undefined;

            // Collect unique colors and models available in variants
            const uniqueColors = Array.from(new Set(product.variants?.map(v => v.color).filter(Boolean) || [])) as string[];
            const uniqueModels = Array.from(new Set(product.variants?.map(v => v.model).filter(Boolean) || [])) as string[];

            return (
              <div 
                key={product.id} 
                className="bg-white border border-slate-200/90 rounded-3xl overflow-hidden flex flex-col hover:border-amber-400/60 hover:shadow-lg transition-all duration-200 group"
              >
                {/* Product Image & Badges */}
                <div className="aspect-video sm:aspect-4/3 bg-slate-50 relative overflow-hidden border-b border-slate-100 flex items-center justify-center p-3">
                  {product.images && product.images.length > 0 ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name} 
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300" 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1">
                      <ImageIcon size={36} />
                      <span className="text-[10px] font-mono uppercase font-bold text-slate-400">No Image</span>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                    {product.subBrand && (
                      <span className="bg-slate-950 text-amber-400 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border border-amber-400/30 shadow-xs inline-flex items-center gap-1">
                        <img src={getBrandLogo(product.subBrand)} alt={product.subBrand} className="w-3 h-3 object-contain rounded-2xs" />
                        {product.subBrand}
                      </span>
                    )}
                    {product.brand && (
                      <span className="bg-white/90 backdrop-blur-xs text-slate-800 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border border-slate-200 shadow-xs">
                        {product.brand}
                      </span>
                    )}
                  </div>

                  {/* Stock Badge Overlay */}
                  {activeStock !== undefined && (
                    <div className="absolute bottom-2.5 right-2.5">
                      {activeStock === 0 ? (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          Out of Stock
                        </span>
                      ) : activeStock <= (product.reorderThreshold || 5) ? (
                        <span className="bg-amber-500 text-slate-950 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-xs">
                          Low Stock: {activeStock}
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                          Stock: {activeStock}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4 flex flex-col flex-1">
                  
                  {/* Category & Title */}
                  <div className="text-[10px] font-mono font-bold uppercase text-slate-400 tracking-wider mb-1">
                    {product.category || 'General'}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-2 line-clamp-2 leading-snug group-hover:text-amber-600 transition-colors" title={product.name}>
                    {product.name}
                  </h3>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-3">
                    <span className="text-amber-500 font-black text-xl tracking-tight">
                      ৳{product.sellingPrice.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">/ unit</span>
                  </div>

                  {/* E-Commerce Swatch Variant Selector (Daraz Style) */}
                  {product.variants && product.variants.length > 0 ? (
                    <div className="space-y-2.5 mb-4 bg-slate-50/80 border border-slate-100 p-2.5 rounded-2xl">
                      
                      {/* Color Swatches */}
                      {uniqueColors.length > 0 && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Color: <strong className="text-slate-800">{currentSel.color || 'Default'}</strong>
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {uniqueColors.map(color => {
                              const isSelected = currentSel.color === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  onClick={() => handleColorSelect(product, color!)}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border transition-all duration-150 ${
                                    isSelected 
                                      ? 'bg-slate-950 text-amber-400 border-amber-400 shadow-xs scale-105' 
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                  }`}
                                >
                                  {color}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Model Swatches */}
                      {uniqueModels.length > 0 && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                            Model/Type: <strong className="text-slate-800">{currentSel.model || 'Standard'}</strong>
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {uniqueModels.map(model => {
                              const isSelected = currentSel.model === model;
                              return (
                                <button
                                  key={model}
                                  type="button"
                                  onClick={() => handleModelSelect(product, model!)}
                                  className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border transition-all duration-150 ${
                                    isSelected 
                                      ? 'bg-slate-950 text-amber-400 border-amber-400 shadow-xs scale-105' 
                                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                  }`}
                                >
                                  {model}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Unified fallback if no explicit color/model distinction */}
                      {uniqueColors.length === 0 && uniqueModels.length === 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {product.variants.map(v => {
                            const isSelected = currentSel.variantId === v.id;
                            const vName = `${v.color || ''} ${v.model || ''}`.trim() || 'Standard';
                            return (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => handleVariantSelect(product, v.id)}
                                className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border transition-all duration-150 ${
                                  isSelected 
                                    ? 'bg-slate-950 text-amber-400 border-amber-400 shadow-xs scale-105' 
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                              >
                                {vName}
                              </button>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="mb-4 text-[11px] text-slate-400 italic bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
                      Standard Product (No Variants)
                    </div>
                  )}

                  {/* Quantity Stepper & Dual Action Buttons */}
                  <div className="mt-auto space-y-3 pt-1">
                    
                    {/* Quantity Stepper */}
                    <div className="flex items-center justify-between bg-slate-100 border border-slate-200 rounded-2xl p-1">
                      <button 
                        type="button"
                        onClick={() => handleQtyChange(product, -1)}
                        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all shadow-2xs"
                      >
                        <Minus size={14} />
                      </button>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Qty:</span>
                        <span className="font-mono font-black text-sm text-slate-900 w-6 text-center">{currentSel.qty}</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => handleQtyChange(product, 1)}
                        className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 font-extrabold rounded-xl transition-all shadow-2xs"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    {/* Action Buttons: Add to Cart & Buy Now */}
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        type="button"
                        disabled={activeStock === 0}
                        onClick={() => handleAddToCart(product)}
                        className={`text-[11px] font-black uppercase tracking-wider rounded-2xl py-2.5 flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                          activeStock === 0
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
                            : 'bg-amber-400 hover:bg-amber-500 text-slate-950 active:scale-[0.97] cursor-pointer'
                        }`}
                      >
                        <ShoppingCart size={14} />
                        {activeStock === 0 ? 'Out of Stock' : 'Add to Cart'}
                      </button>
                      <button 
                        type="button"
                        disabled={activeStock === 0}
                        onClick={() => handleBuyNow(product)}
                        className={`text-[11px] font-black uppercase tracking-wider rounded-2xl py-2.5 flex items-center justify-center gap-1.5 transition-all shadow-xs ${
                          activeStock === 0
                            ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed opacity-60'
                            : 'bg-slate-950 hover:bg-slate-900 text-white active:scale-[0.97] cursor-pointer'
                        }`}
                      >
                        <Zap size={14} className={activeStock === 0 ? 'text-slate-300' : 'text-amber-400'} />
                        Buy Now
                      </button>
                    </div>

                  </div>

                </div>
              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-16 text-center bg-slate-50 border border-slate-200/80 rounded-3xl p-6">
              <ShoppingBag size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 font-bold text-sm">No products matched your search or filters.</p>
              <button 
                onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedBrand('All'); }}
                className="mt-3 text-xs font-bold text-amber-600 hover:underline"
              >
                Reset Filters & Search
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Floating Mobile Cart Trigger (Visible on small screens) */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
        <button
          onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
          className="w-full bg-slate-950 text-white border border-amber-400/40 p-4 rounded-2xl shadow-2xl flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart size={20} className="text-amber-400" />
              {totalItemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">
                  {totalItemCount}
                </span>
              )}
            </div>
            <span className="font-bold text-sm">Order Cart ({totalItemCount})</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-amber-400 font-black text-base">৳{orderTotal.toLocaleString()}</span>
            <ArrowRight size={16} />
          </div>
        </button>
      </div>

      {/* Cart View Sidebar (Desktop) & Drawer (Mobile) */}
      <div className={`
        w-full lg:w-96 flex-shrink-0 transition-all duration-300
        ${isMobileCartOpen ? 'fixed inset-x-0 bottom-0 top-16 z-50 bg-white p-4 overflow-y-auto' : 'hidden lg:block'}
      `}>
        <div className="bg-slate-950 border border-slate-800 text-white rounded-3xl p-5 sticky top-6 shadow-xl">
          
          {/* Cart Header */}
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-400/10 border border-amber-400/20 rounded-xl">
                <ShoppingCart size={18} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-black text-white uppercase tracking-wider">
                  Order Cart
                </h2>
                <span className="text-[10px] font-mono text-slate-400">
                  {totalItemCount} {totalItemCount === 1 ? 'unit' : 'units'} selected
                </span>
              </div>
            </div>

            {orderItems.length > 0 && (
              <button 
                onClick={clearCart}
                className="text-[11px] text-slate-400 hover:text-red-400 underline font-medium transition-colors"
              >
                Clear
              </button>
            )}

            {isMobileCartOpen && (
              <button 
                onClick={() => setIsMobileCartOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-white"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
            {orderItems.length === 0 ? (
              <div className="text-center py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-600">
                  <ShoppingCart size={24} />
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-bold">Your order cart is empty.</p>
                  <p className="text-slate-500 text-xs mt-1">Select products and click "Add to Cart" or "Buy Now".</p>
                </div>
              </div>
            ) : (
              orderItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex gap-3 shadow-xs relative group"
                >
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="font-bold text-white text-xs truncate" title={item.productName}>
                      {item.productName}
                    </div>
                    <div className="text-[10px] text-amber-400 font-medium mt-0.5">
                      {item.variantLabel}
                    </div>
                    <div className="text-white font-black text-sm mt-1.5">
                      ৳{(item.unitPrice * item.qty).toLocaleString()} 
                      <span className="text-[10px] text-slate-500 font-mono font-normal ml-1">
                        (৳{item.unitPrice} ea)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    {/* Delete item button */}
                    <button 
                      onClick={() => removeCartItem(idx)} 
                      className="text-slate-500 hover:text-red-400 p-1 transition-colors rounded-lg"
                      title="Remove item"
                    >
                      <Trash2 size={14} />
                    </button>

                    {/* Quantity Stepper inside cart */}
                    <div className="flex items-center gap-1.5 bg-slate-950 rounded-xl p-1 border border-slate-800">
                      <button 
                        onClick={() => updateCartQty(idx, -1)} 
                        className="w-5 h-5 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="text-xs font-mono font-bold text-white w-4 text-center">{item.qty}</span>
                      <button 
                        onClick={() => updateCartQty(idx, 1)} 
                        className="w-5 h-5 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer Summary */}
          <div className="mt-6 pt-4 border-t border-slate-800 space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                <span>Subtotal Items ({totalItemCount})</span>
                <span>৳{orderTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">Total Payable</span>
                <span className="text-2xl font-black text-amber-400 tracking-tight">
                  ৳{orderTotal.toLocaleString()}
                </span>
              </div>
            </div>
            
            <button 
              type="button"
              onClick={onNext}
              disabled={orderItems.length === 0}
              className="w-full bg-amber-400 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-black uppercase tracking-wider text-xs rounded-2xl py-4 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-[0.98]"
            >
              Proceed to Checkout <ArrowRight size={16} />
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
