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
  CheckCircle2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Layers
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

  // Product Detail Modal state
  const [detailModalProduct, setDetailModalProduct] = useState<Product | null>(null);
  const [modalImageIndex, setModalImageIndex] = useState(0);

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

    updateSelection(product.id, { qty: 1 });
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

    onNext();
  };

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
    <div className="flex flex-col lg:flex-row gap-3 items-start relative min-h-[500px]">
      
      {/* Toast Notification */}
      {addedNotification && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-950 text-white border border-amber-400/40 px-3.5 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up">
          <CheckCircle2 size={16} className="text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">{addedNotification}</span>
        </div>
      )}

      {/* Main Catalog View */}
      <div className="flex-1 w-full space-y-3 min-w-0">
        
        {/* Page Title & Subtitle */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
          <div>
            <h1 className="text-[19px] font-bold text-slate-900 leading-tight">
              Product Catalog
            </h1>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Select gadgets to add to order cart or buy directly
            </p>
          </div>
          <span className="text-[11px] font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
            {filteredProducts.length} items
          </span>
        </div>

        {/* Search Bar & Filter Chips (Height 40px Search, Height 30-32px Chips, 12px section gap) */}
        <div className="bg-slate-50/90 border border-slate-200/80 p-2.5 rounded-xl space-y-2.5 shadow-xs">
          
          {/* Search Bar - Height 40px */}
          <div className="relative w-full">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search catalog by product name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-white border border-slate-200 rounded-lg py-2 pl-9 pr-8 text-xs font-medium focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 placeholder-slate-400"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 h-5 w-5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Filter Chips - Height 30-32px, text 12px, horizontal scroll */}
          {brands.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[11px] font-semibold text-slate-400 shrink-0 flex items-center gap-1 mr-1">
                <Filter size={12} /> Brand:
              </span>
              {brands.map(brand => {
                const isActive = selectedBrand === brand;
                return (
                  <button
                    key={brand}
                    onClick={() => setSelectedBrand(brand)}
                    className={`h-[30px] px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors shrink-0 cursor-pointer border ${
                      isActive 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs' 
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                    }`}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Category Chips/Icons (52-56px container, labels 11px, horizontal scroll) */}
        {categories.length > 1 && (
          <div className="space-y-1.5">
            <h2 className="text-base font-bold text-slate-900">
              Categories
            </h2>
            <div className="flex items-start gap-2.5 overflow-x-auto no-scrollbar py-1">
              {categories.map(cat => {
                const isActive = selectedCategory === cat;
                const initial = cat === 'All' ? '★' : cat.charAt(0).toUpperCase();
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className="flex flex-col items-center shrink-0 group cursor-pointer focus:outline-hidden"
                  >
                    <div className={`w-[54px] h-[54px] rounded-xl flex items-center justify-center text-sm font-bold transition-all border ${
                      isActive 
                        ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs ring-2 ring-amber-300/40' 
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400/70 hover:bg-slate-50'
                    }`}>
                      {cat === 'All' ? <Layers size={20} /> : <span className="text-base font-black">{initial}</span>}
                    </div>
                    <span className={`text-[11px] mt-1 text-center w-[58px] truncate leading-tight ${
                      isActive ? 'font-bold text-amber-700' : 'text-slate-600 font-medium'
                    }`}>
                      {cat}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Section Heading: Products */}
        <div className="flex items-center justify-between pt-1">
          <h2 className="text-base font-bold text-slate-900">
            Products ({filteredProducts.length})
          </h2>
          {(searchQuery || selectedCategory !== 'All' || selectedBrand !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
                setSelectedBrand('All');
              }}
              className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Product Cards Grid: 2 columns on phones with 8-10px gaps (3 on tablets, 4-5 on desktop) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5">
          {filteredProducts.map(product => {
            const currentSel = getSelection(product);
            const activeVariant = product.variants?.find(v => v.id === currentSel.variantId) || product.variants?.[0];
            const activeStock = activeVariant ? activeVariant.stock : undefined;
            const uniqueColors = Array.from(new Set(product.variants?.map(v => v.color).filter(Boolean) || [])) as string[];
            const uniqueModels = Array.from(new Set(product.variants?.map(v => v.model).filter(Boolean) || [])) as string[];
            const isOutOfStock = activeStock === 0 || product.stockStatus === 'out_of_stock';
            const isLowStock = !isOutOfStock && activeStock !== undefined && activeStock <= (product.reorderThreshold || 5);

            return (
              <div 
                key={product.id} 
                className="bg-white border border-slate-200/80 rounded-xl p-2 flex flex-col justify-between shadow-xs hover:shadow-sm transition-all duration-150 group"
              >
                {/* Product Image Area: Fixed square 1:1 ratio, object-fit: cover, corner radius 10-12px */}
                <div>
                  <div 
                    onClick={() => {
                      setDetailModalProduct(product);
                      setModalImageIndex(0);
                    }}
                    className="aspect-square w-full rounded-lg overflow-hidden bg-slate-100 relative flex items-center justify-center cursor-pointer mb-1.5"
                  >
                    {product.images && product.images.length > 0 ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name} 
                        className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-200" 
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-0.5">
                        <ImageIcon size={22} />
                        <span className="text-[10px] font-mono text-slate-400">No Image</span>
                      </div>
                    )}

                    {/* Sub-brand / Brand Badge - 10-11px text, small padding */}
                    <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1 max-w-[85%]">
                      {product.subBrand && (
                        <span className="bg-slate-950/90 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs inline-flex items-center gap-0.5">
                          {product.subBrand}
                        </span>
                      )}
                    </div>

                    {/* Stock Badge - 10-11px text, small padding */}
                    <div className="absolute bottom-1.5 right-1.5">
                      {isOutOfStock ? (
                        <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                          Out
                        </span>
                      ) : isLowStock ? (
                        <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                          Low: {activeStock}
                        </span>
                      ) : activeStock !== undefined ? (
                        <span className="bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-xs">
                          {activeStock} in stock
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Secondary info (Brand, SKU) - 11-12px text */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5 gap-1">
                    <span className="truncate">{product.brand || product.category || 'Gadget'}</span>
                    <span className="font-mono text-[10px] text-slate-400 truncate">{product.sku}</span>
                  </div>

                  {/* Product Name - 13-14px, max 2 lines, ellipsis */}
                  <h3 
                    onClick={() => {
                      setDetailModalProduct(product);
                      setModalImageIndex(0);
                    }}
                    className="text-[13px] font-semibold text-slate-900 line-clamp-2 leading-tight cursor-pointer hover:text-amber-600 transition-colors mb-1 min-h-[32px]"
                    title={product.name}
                  >
                    {product.name}
                  </h3>

                  {/* Price - 14-15px bold */}
                  <div className="flex items-baseline gap-1 mb-1.5">
                    <span className="text-[15px] font-bold text-amber-600 font-mono tracking-tight">
                      ৳{product.sellingPrice.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">/ unit</span>
                  </div>

                  {/* Compact Variant Swatches if available */}
                  {product.variants && product.variants.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {uniqueColors.length > 0 && (
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">C:</span>
                          {uniqueColors.slice(0, 3).map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => handleColorSelect(product, color!)}
                              className={`h-5 px-1.5 text-[10px] font-bold rounded border truncate max-w-[60px] ${
                                currentSel.color === color 
                                  ? 'bg-slate-900 text-amber-400 border-amber-400' 
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {color}
                            </button>
                          ))}
                          {uniqueColors.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{uniqueColors.length - 3}</span>
                          )}
                        </div>
                      )}
                      {uniqueModels.length > 0 && (
                        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">M:</span>
                          {uniqueModels.slice(0, 2).map(model => (
                            <button
                              key={model}
                              type="button"
                              onClick={() => handleModelSelect(product, model!)}
                              className={`h-5 px-1.5 text-[10px] font-bold rounded border truncate max-w-[65px] ${
                                currentSel.model === model 
                                  ? 'bg-slate-900 text-amber-400 border-amber-400' 
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {model}
                            </button>
                          ))}
                          {uniqueModels.length > 2 && (
                            <span className="text-[10px] text-slate-400">+{uniqueModels.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Controls: Quantity Stepper & Buttons (Height 34-36px, text 12-13px, icon 16px) */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  
                  {/* Quantity Stepper */}
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-0.5">
                    <button 
                      type="button"
                      onClick={() => handleQtyChange(product, -1)}
                      className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      <Minus size={12} />
                    </button>
                    <span className="font-mono font-bold text-xs text-slate-900">
                      {currentSel.qty}
                    </span>
                    <button 
                      type="button"
                      onClick={() => handleQtyChange(product, 1)}
                      className="w-6 h-6 flex items-center justify-center bg-white hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Buttons: View / Add / Order (Height 34-36px, text 12-13px, icon 16px) */}
                  <div className="grid grid-cols-3 gap-1">
                    <button 
                      type="button"
                      onClick={() => {
                        setDetailModalProduct(product);
                        setModalImageIndex(0);
                      }}
                      className="h-[34px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition shadow-2xs px-1"
                      title="View Details"
                    >
                      <Eye size={16} className="shrink-0" />
                      <span className="hidden sm:inline">View</span>
                    </button>

                    <button 
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(product)}
                      className={`h-[34px] rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition shadow-2xs px-1 ${
                        isOutOfStock
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-amber-400 hover:bg-amber-500 text-slate-950 active:scale-[0.98] cursor-pointer'
                      }`}
                      title="Add to Cart"
                    >
                      <ShoppingCart size={16} className="shrink-0" />
                      <span>Add</span>
                    </button>

                    <button 
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => handleBuyNow(product)}
                      className={`h-[34px] rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition shadow-2xs px-1 ${
                        isOutOfStock
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-950 hover:bg-slate-900 text-white active:scale-[0.98] cursor-pointer'
                      }`}
                      title="Order Now"
                    >
                      <Zap size={16} className={`shrink-0 ${isOutOfStock ? 'text-slate-400' : 'text-amber-400'}`} />
                      <span>Order</span>
                    </button>
                  </div>

                </div>

              </div>
            );
          })}

          {filteredProducts.length === 0 && (
            <div className="col-span-full py-12 text-center bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <ShoppingBag size={28} className="mx-auto text-slate-300 mb-1.5" />
              <p className="text-slate-600 font-bold text-xs">No products matched your search or filters.</p>
              <button 
                onClick={() => { setSearchQuery(''); setSelectedCategory('All'); setSelectedBrand('All'); }}
                className="mt-2 text-[11px] font-bold text-amber-600 hover:underline cursor-pointer"
              >
                Reset Filters & Search
              </button>
            </div>
          )}
        </div>

      </div>

      {/* Floating Mobile Cart Trigger */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-40">
        <button
          onClick={() => setIsMobileCartOpen(!isMobileCartOpen)}
          className="w-full bg-slate-950 text-white border border-amber-400/40 p-3 rounded-xl shadow-2xl flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <ShoppingCart size={18} className="text-amber-400" />
              {totalItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {totalItemCount}
                </span>
              )}
            </div>
            <span className="font-bold text-xs">Order Cart ({totalItemCount})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-amber-400 font-bold text-sm font-mono">৳{orderTotal.toLocaleString()}</span>
            <ArrowRight size={14} />
          </div>
        </button>
      </div>

      {/* Cart View Sidebar (Desktop) & Drawer (Mobile) */}
      <div className={`
        w-full lg:w-80 shrink-0 transition-all duration-200
        ${isMobileCartOpen ? 'fixed inset-x-0 bottom-0 top-16 z-50 bg-white p-3 overflow-y-auto' : 'hidden lg:block'}
      `}>
        <div className="bg-slate-950 border border-slate-800 text-white rounded-xl p-3.5 sticky top-4 shadow-xl">
          
          {/* Cart Header */}
          <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-400/10 border border-amber-400/20 rounded-lg">
                <ShoppingCart size={16} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
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
                className="text-[11px] text-slate-400 hover:text-red-400 underline font-medium cursor-pointer"
              >
                Clear
              </button>
            )}

            {isMobileCartOpen && (
              <button 
                onClick={() => setIsMobileCartOpen(false)}
                className="lg:hidden p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1 no-scrollbar">
            {orderItems.length === 0 ? (
              <div className="text-center py-8 flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-slate-600">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <p className="text-slate-300 text-xs font-semibold">Your cart is empty.</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">Select products to add to cart.</p>
                </div>
              </div>
            ) : (
              orderItems.map((item, idx) => (
                <div 
                  key={idx} 
                  className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg flex gap-2.5 shadow-xs relative"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <div className="font-semibold text-white text-xs truncate" title={item.productName}>
                      {item.productName}
                    </div>
                    <div className="text-[10px] text-amber-400 font-medium">
                      {item.variantLabel}
                    </div>
                    <div className="text-white font-bold text-xs mt-1 font-mono">
                      ৳{(item.unitPrice * item.qty).toLocaleString()} 
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        (৳{item.unitPrice} ea)
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end justify-between">
                    <button 
                      onClick={() => removeCartItem(idx)} 
                      className="text-slate-500 hover:text-red-400 p-0.5 cursor-pointer"
                      title="Remove item"
                    >
                      <Trash2 size={13} />
                    </button>

                    <div className="flex items-center gap-1 bg-slate-950 rounded-md p-0.5 border border-slate-800">
                      <button 
                        onClick={() => updateCartQty(idx, -1)} 
                        className="w-4 h-4 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer"
                      >
                        <Minus size={9} />
                      </button>
                      <span className="text-[11px] font-mono font-bold text-white w-3.5 text-center">{item.qty}</span>
                      <button 
                        onClick={() => updateCartQty(idx, 1)} 
                        className="w-4 h-4 flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-slate-300 rounded text-[10px] cursor-pointer"
                      >
                        <Plus size={9} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Footer Summary */}
          <div className="mt-4 pt-3 border-t border-slate-800 space-y-2.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Subtotal ({totalItemCount} items)</span>
              <span className="text-sm font-bold text-amber-400 font-mono">৳{orderTotal.toLocaleString()}</span>
            </div>
            
            <button 
              type="button"
              onClick={onNext}
              disabled={orderItems.length === 0}
              className="w-full h-[36px] bg-amber-400 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <span>Proceed to Checkout</span>
              <ArrowRight size={14} />
            </button>
          </div>

        </div>
      </div>

      {/* Product Detail Modal Opened from Catalog (Image Gallery max-height ~40% of screen) */}
      {detailModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
            
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 uppercase">
                  {detailModalProduct.subBrand || 'SAT'} • {detailModalProduct.brand || 'Product Details'}
                </span>
                <h2 className="text-[18px] font-bold text-slate-900 leading-tight">
                  {detailModalProduct.name}
                </h2>
              </div>
              <button
                onClick={() => setDetailModalProduct(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer transition shrink-0 ml-2"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3.5 space-y-3">
              
              {/* Image Gallery - max-height about 40% of screen (max-h-[40vh]) */}
              <div className="space-y-2">
                <div className="w-full max-h-[40vh] h-60 bg-slate-100 rounded-lg overflow-hidden relative flex items-center justify-center border border-slate-200">
                  {detailModalProduct.images && detailModalProduct.images.length > 0 ? (
                    <img 
                      src={detailModalProduct.images[modalImageIndex] || detailModalProduct.images[0]} 
                      alt={detailModalProduct.name} 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 gap-1">
                      <ImageIcon size={32} />
                      <span className="text-xs">No image available</span>
                    </div>
                  )}

                  {detailModalProduct.images && detailModalProduct.images.length > 1 && (
                    <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex items-center justify-between pointer-events-none">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalImageIndex(prev => (prev > 0 ? prev - 1 : (detailModalProduct.images?.length || 1) - 1));
                        }}
                        className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center pointer-events-auto hover:bg-black cursor-pointer shadow-md"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setModalImageIndex(prev => (prev < (detailModalProduct.images?.length || 1) - 1 ? prev + 1 : 0));
                        }}
                        className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center pointer-events-auto hover:bg-black cursor-pointer shadow-md"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Thumbnail Strip */}
                {detailModalProduct.images && detailModalProduct.images.length > 1 && (
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                    {detailModalProduct.images.map((img, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setModalImageIndex(i)}
                        className={`w-12 h-12 rounded-md overflow-hidden border shrink-0 cursor-pointer ${
                          modalImageIndex === i ? 'border-amber-500 ring-2 ring-amber-400/40' : 'border-slate-200 opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Price & Stock info - 14-15px bold price, 11-12px secondary text */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-medium">Selling Price:</span>
                  <div className="text-[15px] font-bold text-amber-600 font-mono tracking-tight">
                    ৳{detailModalProduct.sellingPrice.toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 font-medium">SKU Code:</span>
                  <div className="text-xs font-mono font-bold text-slate-800">
                    {detailModalProduct.sku}
                  </div>
                </div>
              </div>

              {/* Variant Swatches inside Modal */}
              {detailModalProduct.variants && detailModalProduct.variants.length > 0 && (
                <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <span className="text-xs font-bold text-slate-700 block">Select Variant:</span>
                  
                  {/* Colors */}
                  {Array.from(new Set(detailModalProduct.variants.map(v => v.color).filter(Boolean))).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-500 font-medium">Color:</span>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set<string>(detailModalProduct.variants.map(v => v.color).filter((c): c is string => Boolean(c)))).map(col => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => handleColorSelect(detailModalProduct, col)}
                            className={`h-[30px] px-2.5 rounded-md text-xs font-semibold border cursor-pointer ${
                              getSelection(detailModalProduct).color === col 
                                ? 'bg-slate-900 text-amber-400 border-amber-400' 
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            {col}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Models */}
                  {Array.from(new Set(detailModalProduct.variants.map(v => v.model).filter(Boolean))).length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-500 font-medium">Model / Size:</span>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(new Set<string>(detailModalProduct.variants.map(v => v.model).filter((m): m is string => Boolean(m)))).map(mod => (
                          <button
                            key={mod}
                            type="button"
                            onClick={() => handleModelSelect(detailModalProduct, mod)}
                            className={`h-[30px] px-2.5 rounded-md text-xs font-semibold border cursor-pointer ${
                              getSelection(detailModalProduct).model === mod 
                                ? 'bg-slate-900 text-amber-400 border-amber-400' 
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                            }`}
                          >
                            {mod}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity Stepper & Modal Action Buttons */}
              <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                <div className="flex items-center bg-slate-100 border border-slate-200 rounded-lg px-2 h-[36px]">
                  <button 
                    type="button"
                    onClick={() => handleQtyChange(detailModalProduct, -1)}
                    className="w-5 h-5 flex items-center justify-center text-slate-700 font-bold"
                  >
                    <Minus size={12} />
                  </button>
                  <span className="font-mono font-bold text-xs text-slate-900 px-2">
                    {getSelection(detailModalProduct).qty}
                  </span>
                  <button 
                    type="button"
                    onClick={() => handleQtyChange(detailModalProduct, 1)}
                    className="w-5 h-5 flex items-center justify-center text-slate-700 font-bold"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    handleAddToCart(detailModalProduct);
                    setDetailModalProduct(null);
                  }}
                  className="flex-1 h-[36px] bg-amber-400 hover:bg-amber-500 text-slate-950 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <ShoppingCart size={16} />
                  Add to Cart
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleBuyNow(detailModalProduct);
                    setDetailModalProduct(null);
                  }}
                  className="flex-1 h-[36px] bg-slate-950 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
                >
                  <Zap size={16} className="text-amber-400" />
                  Order Now
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
