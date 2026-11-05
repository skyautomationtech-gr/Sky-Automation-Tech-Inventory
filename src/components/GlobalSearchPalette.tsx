import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Search, 
  X, 
  ArrowRight, 
  Package, 
  ShoppingBag, 
  Receipt, 
  Contact, 
  Truck, 
  Users, 
  LayoutDashboard, 
  Calculator, 
  DollarSign, 
  BarChart3, 
  ShieldCheck, 
  Settings, 
  Sparkles, 
  PlusCircle, 
  ArrowUpDown, 
  Clock,
  CheckCircle2,
  LogOut,
  Moon,
  Sun,
  Layers,
  Tag
} from 'lucide-react';
import { UserProfile, Product, Order, Invoice, Customer, Supplier } from '../types';
import { 
  getOrders, 
  getCustomers, 
  getInvoices, 
  getSuppliers, 
  getAllUsers, 
  getCategories, 
  getBrands 
} from '../firebase/db';
import { TAB_DIRECTORY } from './Breadcrumbs';

interface GlobalSearchPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string, subAction?: string, initialId?: string | null) => void;
  user: UserProfile | null;
  products: Product[];
  onToggleTheme?: () => void;
  onLogout?: () => void;
}

type FilterCategory = 'all' | 'pages' | 'products' | 'orders' | 'invoices' | 'people' | 'actions';

export const GlobalSearchPalette: React.FC<GlobalSearchPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  user,
  products = [],
  onToggleTheme,
  onLogout,
}) => {
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // Lazy loaded supplementary data caches
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`sat_recent_searches_${user?.id || 'guest'}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = user?.role === 'superadmin';
  const isAdminOrManager = isSuperAdmin || user?.role === 'admin' || user?.role === 'manager';
  const isPrivileged = isSuperAdmin || user?.role === 'admin';

  // Load supplementary data once when palette opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const loadData = async () => {
        setLoading(true);
        try {
          const [ord, inv, cust, sup, usr, cats, brds] = await Promise.all([
            getOrders().catch(() => []),
            getInvoices().catch(() => []),
            getCustomers().catch(() => []),
            getSuppliers().catch(() => []),
            isPrivileged ? getAllUsers().catch(() => []) : Promise.resolve([]),
            getCategories().catch(() => []),
            getBrands().catch(() => [])
          ]);
          setOrders(ord || []);
          setInvoices(inv || []);
          setCustomers(cust || []);
          setSuppliers(sup || []);
          setStaffUsers(usr || []);
          setCategories(cats || []);
          setBrands(brds || []);
        } catch (e) {
          console.warn('Global search data load notice:', e);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    } else {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen, isPrivileged, user]);

  const saveRecentSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    try {
      const updated = [searchTerm, ...recentSearches.filter(s => s !== searchTerm)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem(`sat_recent_searches_${user?.id || 'guest'}`, JSON.stringify(updated));
    } catch {}
  };

  // 1. Pages / Modules
  const pageResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'pages') return [];
    return Object.entries(TAB_DIRECTORY)
      .filter(([id, meta]) => {
        if (id === 'financials' && !isAdminOrManager) return false;
        if (id === 'attendance' && !isSuperAdmin) return false;
        if (id === 'users' && !isPrivileged) return false;
        if (id === 'audit_logs' && !isPrivileged) return false;

        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return meta.label.toLowerCase().includes(q) || meta.group.toLowerCase().includes(q) || id.includes(q);
      })
      .map(([id, meta]) => ({
        type: 'page' as const,
        id,
        title: meta.label,
        subtitle: `Module · ${meta.group}`,
        icon: meta.icon,
        action: () => {
          saveRecentSearch(meta.label);
          onNavigate(id);
          onClose();
        }
      }));
  }, [query, activeFilter, isAdminOrManager, isSuperAdmin, isPrivileged, onNavigate, onClose]);

  // 2. Products
  const productResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'products') return [];
    if (!query.trim() && query.length === 0 && activeFilter === 'all') return products.slice(0, 3).map(p => wrapProduct(p));
    const q = query.toLowerCase().trim();
    return products
      .filter(p => {
        if (!p) return false;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.barcodeValue && p.barcodeValue.toLowerCase().includes(q)) ||
          (p.variants && p.variants.some(v => v.color?.toLowerCase().includes(q) || v.model?.toLowerCase().includes(q)))
        );
      })
      .slice(0, 8)
      .map(p => wrapProduct(p));

    function wrapProduct(p: Product) {
      return {
        type: 'product' as const,
        id: p.id,
        title: p.name,
        subtitle: `SKU: ${p.sku} · Stock: ${p.totalStock} · ৳${p.sellingPrice.toLocaleString()}`,
        image: p.images?.[0] || p.imageUrls?.[0],
        icon: Package,
        action: () => {
          saveRecentSearch(p.name);
          onNavigate('products', 'detail', p.id);
          onClose();
        }
      };
    }
  }, [query, activeFilter, products, onNavigate, onClose]);

  // 3. Orders
  const orderResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'orders') return [];
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return orders
      .filter(o => {
        if (!o) return false;
        return (
          o.id.toLowerCase().includes(q) ||
          (o.invoiceId && o.invoiceId.toLowerCase().includes(q)) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.customerPhone && o.customerPhone.includes(q)) ||
          (o.status && o.status.toLowerCase().includes(q))
        );
      })
      .slice(0, 6)
      .map(o => ({
        type: 'order' as const,
        id: o.id,
        title: `Order #${o.id.substring(0, 8)} (${o.customerName || 'Walk-in'})`,
        subtitle: `Total: ৳${(o.totalAmount || 0).toLocaleString()} · Status: ${o.status || 'Pending'}`,
        icon: ShoppingBag,
        action: () => {
          saveRecentSearch(o.id);
          onNavigate('orders', 'detail', o.id);
          onClose();
        }
      }));
  }, [query, activeFilter, orders, onNavigate, onClose]);

  // 4. Invoices
  const invoiceResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'invoices') return [];
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return invoices
      .filter(inv => {
        if (!inv) return false;
        return (
          (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
          inv.id.toLowerCase().includes(q) ||
          (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
          (inv.customerPhone && inv.customerPhone.includes(q))
        );
      })
      .slice(0, 6)
      .map(inv => ({
        type: 'invoice' as const,
        id: inv.id,
        title: `Invoice ${inv.invoiceNumber || inv.id}`,
        subtitle: `Customer: ${inv.customerName || 'Walk-in'} · Amount: ৳${(inv.totalAmount || 0).toLocaleString()}`,
        icon: Receipt,
        action: () => {
          saveRecentSearch(inv.invoiceNumber || inv.id);
          onNavigate('invoices', 'detail', inv.id);
          onClose();
        }
      }));
  }, [query, activeFilter, invoices, onNavigate, onClose]);

  // 5. People (Customers, Suppliers, Staff)
  const peopleResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'people') return [];
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const results: any[] = [];

    // Customers
    customers.forEach(c => {
      if (c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.id?.toLowerCase().includes(q)) {
        results.push({
          type: 'customer' as const,
          id: c.id,
          title: c.name,
          subtitle: `Customer · Phone: ${c.phone || 'N/A'}`,
          icon: Contact,
          action: () => {
            saveRecentSearch(c.name);
            onNavigate('customers', 'detail', c.id);
            onClose();
          }
        });
      }
    });

    // Suppliers
    suppliers.forEach(s => {
      if (s.name?.toLowerCase().includes(q) || s.phone?.includes(q)) {
        results.push({
          type: 'supplier' as const,
          id: s.id,
          title: s.name,
          subtitle: `Supplier · Phone: ${s.phone || 'N/A'}`,
          icon: Truck,
          action: () => {
            saveRecentSearch(s.name);
            onNavigate('suppliers', 'detail', s.id);
            onClose();
          }
        });
      }
    });

    // Staff (if privileged)
    if (isPrivileged) {
      staffUsers.forEach(u => {
        if (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.phone?.includes(q)) {
          results.push({
            type: 'staff' as const,
            id: u.id,
            title: u.name,
            subtitle: `Staff Member · Role: ${u.role || 'Staff'} · Email: ${u.email}`,
            icon: Users,
            action: () => {
              saveRecentSearch(u.name);
              onNavigate('users');
              onClose();
            }
          });
        }
      });
    }

    return results.slice(0, 8);
  }, [query, activeFilter, customers, suppliers, staffUsers, isPrivileged, onNavigate, onClose]);

  // 6. Categories & Brands
  const catBrandResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'products') return [];
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const results: any[] = [];

    categories.forEach(c => {
      if (c.name?.toLowerCase().includes(q)) {
        results.push({
          type: 'category' as const,
          id: c.id,
          title: `Category: ${c.name}`,
          subtitle: `Product Category`,
          icon: Layers,
          action: () => {
            onNavigate('products');
            onClose();
          }
        });
      }
    });

    brands.forEach(b => {
      if (b.name?.toLowerCase().includes(q)) {
        results.push({
          type: 'brand' as const,
          id: b.id,
          title: `Brand: ${b.name}`,
          subtitle: `Product Brand`,
          icon: Tag,
          action: () => {
            onNavigate('products');
            onClose();
          }
        });
      }
    });

    return results.slice(0, 5);
  }, [query, activeFilter, categories, brands, onNavigate, onClose]);

  // 7. Quick Actions
  const actionResults = useMemo(() => {
    if (activeFilter !== 'all' && activeFilter !== 'actions') return [];
    const actions = [
      {
        title: 'Add New Product',
        subtitle: 'Quick Action · Open Product Creation Wizard',
        icon: PlusCircle,
        action: () => {
          onNavigate('products', 'add');
          onClose();
        }
      },
      {
        title: 'Stock In / Receive Goods',
        subtitle: 'Quick Action · Inventory Stock Operation',
        icon: ArrowUpDown,
        action: () => {
          onNavigate('stock', 'in');
          onClose();
        }
      },
      {
        title: 'New Sales Order',
        subtitle: 'Quick Action · Order Desk',
        icon: ShoppingBag,
        action: () => {
          onNavigate('orders', 'new');
          onClose();
        }
      },
      ...(isAdminOrManager ? [{
        title: 'Record New Expense',
        subtitle: 'Quick Action · Income & Expense',
        icon: DollarSign,
        action: () => {
          onNavigate('financials', 'expense');
          onClose();
        }
      }] : []),
      {
        title: 'Check In / Check Out Session',
        subtitle: 'Quick Action · Attendance & Work Session',
        icon: Clock,
        action: () => {
          onNavigate('dashboard');
          onClose();
        }
      },
      ...(onToggleTheme ? [{
        title: 'Toggle Light / Dark Theme',
        subtitle: 'Quick Action · Switch UI Appearance',
        icon: Sun,
        action: () => {
          onToggleTheme();
          onClose();
        }
      }] : []),
      ...(onLogout ? [{
        title: 'Sign Out of Platform',
        subtitle: 'Quick Action · End Session',
        icon: LogOut,
        action: () => {
          onLogout();
          onClose();
        }
      }] : [])
    ];

    if (!query.trim()) return actions.slice(0, 4);
    const q = query.toLowerCase().trim();
    return actions.filter(a => a.title.toLowerCase().includes(q) || a.subtitle.toLowerCase().includes(q));
  }, [query, activeFilter, isAdminOrManager, onNavigate, onClose, onToggleTheme, onLogout]);

  // Combine all items into a flat list for keyboard navigation
  const allFlattenedResults = useMemo(() => {
    return [
      ...pageResults,
      ...productResults,
      ...orderResults,
      ...invoiceResults,
      ...peopleResults,
      ...catBrandResults,
      ...actionResults
    ];
  }, [pageResults, productResults, orderResults, invoiceResults, peopleResults, catBrandResults, actionResults]);

  // Keyboard navigation handler inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < allFlattenedResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : allFlattenedResults.length - 1));
      } else if (e.key === 'Enter' && allFlattenedResults.length > 0) {
        e.preventDefault();
        if (allFlattenedResults[selectedIndex]) {
          allFlattenedResults[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allFlattenedResults, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[70vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header Input Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shrink-0">
          <Search size={22} className="text-[#D4AF37] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search anything… (Products, SKU, Orders, Invoices, Customers, Pages, Actions)"
            className="w-full bg-transparent text-sm lg:text-base font-semibold text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={18} />
            </button>
          )}
          <kbd className="px-2.5 py-1 text-xs font-mono font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Filter Chips Bar */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0 scrollbar-none">
          {[
            { id: 'all', label: 'All Results' },
            { id: 'pages', label: 'Pages' },
            { id: 'products', label: 'Products' },
            { id: 'orders', label: 'Orders' },
            { id: 'invoices', label: 'Invoices' },
            { id: 'people', label: 'People' },
            { id: 'actions', label: 'Quick Actions' },
          ].map(chip => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setActiveFilter(chip.id as FilterCategory);
                setSelectedIndex(0);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                activeFilter === chip.id
                  ? 'bg-[#D4AF37] text-slate-950 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Results Container */}
        <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-3 space-y-5 custom-scrollbar min-h-[300px]">
          {loading && (
            <div className="py-12 text-center text-xs font-mono text-slate-400 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin" />
              Loading system index...
            </div>
          )}

          {!loading && allFlattenedResults.length === 0 && (
            <div className="py-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                <Search size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No matching results found for "{query}"</p>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">Try searching by product name, SKU, customer phone number, invoice ID, or module name.</p>
            </div>
          )}

          {!loading && !query.trim() && recentSearches.length > 0 && (
            <div className="px-2">
              <p className="text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Searches</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setQuery(term)}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clock size={12} className="text-slate-400" />
                    <span>{term}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Groups */}
          {!loading && pageResults.length > 0 && (
            <div className="space-y-1">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                <span>Workspace Pages ({pageResults.length})</span>
              </p>
              {pageResults.map((item, idx) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-[#D4AF37]/20 text-[#D4AF37] transition-colors shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && productResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Products ({productResults.length})
              </p>
              {productResults.map((item) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.image ? (
                        <img src={item.image} alt={item.title} className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-[#D4AF37] flex items-center justify-center shrink-0">
                          <Package size={16} />
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && orderResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Orders ({orderResults.length})
              </p>
              {orderResults.map((item) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-teal-500 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && invoiceResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Invoices ({invoiceResults.length})
              </p>
              {invoiceResults.map((item) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-blue-500 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && peopleResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                People & CRM ({peopleResults.length})
              </p>
              {peopleResults.map((item, idx) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-purple-500 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && catBrandResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Categories & Brands ({catBrandResults.length})
              </p>
              {catBrandResults.map((item, idx) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id || idx}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-amber-500 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && actionResults.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                Quick Actions ({actionResults.length})
              </p>
              {actionResults.map((item, idx) => {
                const globalIdx = allFlattenedResults.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(globalIdx)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-colors cursor-pointer group ${
                      isSelected ? 'bg-[#D4AF37]/15 dark:bg-[#D4AF37]/20 text-slate-900 dark:text-white border border-[#D4AF37]/40 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-500 shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="font-bold truncate">{item.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0 font-mono">
          <span>↑↓ navigate · Enter open · Esc close</span>
          <span className="text-[#D4AF37] font-bold">SAT Global Search Engine</span>
        </div>
      </div>
    </div>
  );
};
