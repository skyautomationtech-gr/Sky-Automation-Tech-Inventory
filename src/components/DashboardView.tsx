import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Package, 
  AlertTriangle, 
  PlusCircle, 
  TrendingUp, 
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  UserCircle,
  Clock,
  LogOut,
  LogIn,
  MessageSquare,
  Search,
  QrCode
} from 'lucide-react';
import { Product, UserProfile, Order, Customer } from '../types';
import { checkInUser, checkOutUser, getTodayAttendance, getOrders, getCustomers } from '../firebase/db';
import { BarcodeScanner } from './BarcodeScanner';

interface DashboardViewProps {
  products: Product[];
  user: UserProfile | null;
  onNavigateToTab: (tab: string, subAction?: string, initialId?: string | null) => void;
  onUserUpdate: () => void;
}

export default function DashboardView({
  products,
  user,
  onNavigateToTab,
  onUserUpdate
}: DashboardViewProps) {
  const isStaff = user?.role === 'staff';
  
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [processingAttendance, setProcessingAttendance] = useState(false);

  // Search and scan states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);

  useEffect(() => {
    const fetchSearchData = async () => {
      try {
        const [orders, customers] = await Promise.all([getOrders(), getCustomers()]);
        setAllOrders(orders);
        setAllCustomers(customers);
      } catch (err) {
        console.error("Error fetching search data", err);
      }
    };
    fetchSearchData();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, allOrders, allCustomers, products]);

  const performSearch = (query: string) => {
    setIsSearching(true);
    const q = query.toLowerCase();
    const results: any[] = [];
    
    // Search Products
    products.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) {
        results.push({ type: 'product', item: p });
      }
    });

    // Search Orders
    allOrders.forEach(o => {
      if (o.id.toLowerCase().includes(q) || o.invoiceId?.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.customerPhone.toLowerCase().includes(q)) {
        results.push({ type: 'order', item: o });
      }
    });

    // Search Customers
    allCustomers.forEach(c => {
      if (c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)) {
        results.push({ type: 'customer', item: c });
      }
    });

    setSearchResults(results.slice(0, 15));
    setIsSearching(false);
  };

  const handleScan = (text: string) => {
    setShowScanner(false);
    if (text.startsWith('INV:')) {
      const invId = text.substring(4);
      const order = allOrders.find(o => o.id === invId || o.invoiceId === invId);
      if (order) {
        onNavigateToTab('orders', undefined, order.id);
      } else {
        alert('No match found for this scan');
      }
    } else {
      const p = products.find(prod => prod.variants.some(v => v.barcodeValue === text) || prod.barcodeValue === text || prod.sku === text);
      if (p) {
        onNavigateToTab('products', undefined, p.id);
      } else {
        alert('No match found for this scan');
      }
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadAttendance();
    }
  }, [user]);

  const loadAttendance = async () => {
    if (!user) return;
    setLoadingAttendance(true);
    try {
      const records = await getTodayAttendance(user.id);
      setAttendanceRecords(records);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const handleCheckIn = async () => {
    if (!user || processingAttendance || isCheckedIn) return;
    setProcessingAttendance(true);
    try {
      await checkInUser(user.id, user.name, user.role, user.subBrandAccess?.[0] || 'Unknown');
      await onUserUpdate();
    } catch (err) {
      console.error(err);
      alert('Failed to check in');
    } finally {
      setProcessingAttendance(false);
    }
  };

  const handleCheckOut = async () => {
    if (!user || !user.currentSessionId || processingAttendance || !isCheckedIn) return;
    setProcessingAttendance(true);
    try {
      await checkOutUser(user.id, user.currentSessionId);
      await onUserUpdate();
    } catch (err) {
      console.error(err);
      alert('Failed to check out');
    } finally {
      setProcessingAttendance(false);
    }
  };

  const isCheckedIn = user?.currentSessionStatus === 'checked_in';
  
  // Filter approved products for dashboard metrics and display
  const approvedProducts = products.filter(product => product.status === 'approved');

  // Dynamic stats calculation
  let totalStockUnits = 0;
  let totalStockValue = 0;
  let lowStockCount = 0;

  approvedProducts.forEach(product => {
    const productQty = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
    totalStockUnits += productQty;
    
    // Total stock value is cost price * total product quantity
    totalStockValue += (product.costPrice || 0) * productQty;

    if (productQty <= product.reorderThreshold) {
      lowStockCount++;
    }
  });

  // Top 4 products to display in the Bento preview
  const recentProducts = approvedProducts.slice(0, 4);

  // Sub-brand badge styler
  const getSubBrandBadge = (subBrand: string) => {
    switch (subBrand?.toUpperCase()) {
      case 'GZ':
      case 'GADGETZU':
        return (
          <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-sm border border-teal-100">
            GadgetZu
          </span>
        );
      case 'RTX':
        return (
          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] font-bold rounded-sm border border-orange-100">
            RTX Gadget
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-sm border border-slate-200">
            Sky Auto
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">
            OPERATIONAL HUD
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Management Dashboard</h2>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-100 shadow-xs">
          <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
            {user?.role === 'admin' ? <ShieldCheck size={18} /> : <UserCircle size={18} />}
          </div>
          <div className="text-left pr-2">
            <p className="text-xs font-bold text-slate-800 leading-tight">{user?.name || 'Operator'}</p>
            <p className="text-[10px] text-slate-400 font-mono tracking-wider">{user?.role?.toUpperCase()} CONTEXT</p>
          </div>
        </div>
      </div>

      {/* Global Search and Scan Bar */}
      <div className="relative z-40 flex flex-col md:flex-row items-center gap-3">
        <div className="relative w-full">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search size={18} className="text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products, orders, or customers..."
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-hidden focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent shadow-sm transition-all text-slate-800 font-medium"
          />
          {/* Dropdown Results */}
          {searchQuery.trim() !== '' && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden max-h-96 overflow-y-auto">
              {isSearching ? (
                <div className="p-6 text-center text-slate-500 text-sm">Searching...</div>
              ) : searchResults.length > 0 ? (
                <div className="flex flex-col">
                  {searchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSearchQuery('');
                        onNavigateToTab(`${res.type}s`, undefined, res.item.id);
                      }}
                      className="flex items-start text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0"
                    >
                      {res.type === 'product' && (
                        <div>
                          <p className="text-sm font-bold text-slate-900">{res.item.name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">SKU: {res.item.sku}</p>
                        </div>
                      )}
                      {res.type === 'order' && (
                        <div>
                          <p className="text-sm font-bold text-slate-900">Order #{res.item.id.slice(0,8)}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{res.item.customerName}</p>
                        </div>
                      )}
                      {res.type === 'customer' && (
                        <div>
                          <p className="text-sm font-bold text-slate-900">{res.item.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{res.item.phone}</p>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-slate-500 text-sm">
                  No results found for '{searchQuery}'. Try checking the spelling.
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="shrink-0 flex items-center justify-center bg-[#16161b] hover:bg-black text-[#D4AF37] p-3.5 rounded-2xl shadow-sm transition-all active:scale-95"
          title="Scan Barcode / QR Code"
        >
          <QrCode size={22} />
        </button>
      </div>
      
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onCancel={() => setShowScanner(false)}
        />
      )}

      {/* Check In / Check Out Widget */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCheckedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
              <Clock size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Work Session</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="relative flex h-2.5 w-2.5">
                  {isCheckedIn && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isCheckedIn ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider ${isCheckedIn ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {isCheckedIn ? 'Active / Checked In' : 'Inactive / Checked Out'}
                </span>
              </div>
            </div>
          </div>

          <div>
            {!isCheckedIn ? (
              <button
                onClick={handleCheckIn}
                disabled={processingAttendance}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all active:scale-95 disabled:cursor-not-allowed"
              >
                {processingAttendance ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn size={18} /> 
                )}
                Check In to Start Work
              </button>
            ) : (
              <button
                onClick={handleCheckOut}
                disabled={processingAttendance}
                className="flex items-center gap-2 px-6 py-3 bg-red-50 hover:bg-red-100 disabled:opacity-50 border border-red-200 text-red-600 font-bold rounded-xl shadow-sm cursor-pointer transition-all active:scale-95 disabled:cursor-not-allowed"
              >
                {processingAttendance ? (
                  <div className="w-5 h-5 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                ) : (
                  <LogOut size={18} /> 
                )}
                Check Out Session
              </button>
            )}
          </div>
        </div>

        {/* Today's History */}
        {attendanceRecords.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-100 p-4">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Today's Check-in History</h4>
            <div className="flex flex-col gap-2">
              {attendanceRecords.map(record => (
                <div key={record.id} className="flex justify-between items-center text-xs font-mono text-slate-600 bg-white px-3 py-2 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">In:</span> 
                    <span className="font-bold text-slate-800">{new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {record.checkOutTime ? (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Out:</span> 
                        <span className="font-bold text-slate-800">{new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md font-bold">
                        {record.durationMinutes}m
                      </span>
                    </div>
                  ) : (
                    <span className="text-amber-500 font-bold bg-amber-50 px-2 py-1 rounded-md animate-pulse">
                      Currently Active
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bento Grid Core Container */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* Floating Feedback Button */}
        <a
          href="https://forms.gle/TH5uGex3LobzAyAu7"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 bg-[#D4AF37] text-slate-950 p-3 rounded-full shadow-lg hover:bg-amber-500 transition-all duration-200"
          title="সমস্যা জানান / Feedback"
        >
          <MessageSquare size={24} />
        </a>
        
        {/* Stat: Today's Sales */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between h-40 md:h-44">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Sales</p>
              <span className="text-[10px] font-mono font-bold bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded">
                0 Orders
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight mt-2">৳ 0</h3>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1 border-t border-slate-50 pt-2.5">
            <span className="text-amber-500 font-bold">0%</span> vs yesterday turnover
          </div>
        </div>

        {/* Stat: Total Stock Value */}
        <div className="bg-[#008080] text-white border border-teal-800 rounded-2xl p-5 shadow-md flex flex-col justify-between h-40 md:h-44 transition-all duration-300 hover:shadow-lg">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-teal-100 uppercase tracking-widest mb-1">Inventory Valuation</p>
              <span className="text-[10px] font-mono font-bold bg-teal-900/40 text-teal-200 border border-teal-700 px-1.5 py-0.5 rounded">
                Live Cost
              </span>
            </div>
            {isStaff ? (
              <h3 className="text-lg md:text-xl font-bold text-teal-100 font-mono italic tracking-tight mt-3">Protected Context</h3>
            ) : (
              <h3 className="text-xl md:text-2xl font-black tracking-tight mt-2">
                ৳ {totalStockValue.toLocaleString()}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-teal-100 flex items-center gap-1 border-t border-teal-600/30 pt-2.5 font-sans">
            <span className="px-1.5 py-0.5 bg-teal-900/50 rounded text-[9px] font-bold font-mono">
              {totalStockUnits} Units
            </span>
            <span>Current volume value</span>
          </div>
        </div>

        {/* Stat: Low Stock Alerts */}
        <div className="bg-white border-2 border-[#D4AF37] rounded-2xl p-5 shadow-xs flex flex-col justify-between h-40 md:h-44">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest mb-1">Reorder Required</p>
              <AlertTriangle className="text-[#D4AF37]" size={16} />
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight mt-2">
              {lowStockCount}
            </h3>
          </div>
          <div className="text-[11px] text-amber-700 font-bold flex items-center gap-1 border-t border-amber-50 pt-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            Critical thresholds breached
          </div>
        </div>

        {/* Quick Actions Tile */}
        <div className="bg-slate-950 rounded-2xl p-4 shadow-sm grid grid-cols-2 gap-3 h-40 md:h-44">
          <button 
            onClick={() => onNavigateToTab('products', 'add')}
            className="flex flex-col items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 rounded-xl transition-all border border-slate-800 hover:border-[#D4AF37]/30 text-white group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] group-hover:scale-105 transition-transform">
              <PlusCircle size={18} />
            </div>
            <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider">New Item</span>
          </button>
          
          <button 
            onClick={() => onNavigateToTab('stock', 'in')}
            className="flex flex-col items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 rounded-xl transition-all border border-slate-800 hover:border-teal-500/30 text-white group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-[#008080]/10 flex items-center justify-center text-teal-400 group-hover:scale-105 transition-transform">
              <Layers size={18} />
            </div>
            <span className="text-[9px] text-slate-300 font-bold uppercase tracking-wider">Stock In</span>
          </button>
        </div>

        {/* Product List Preview (Recent Items) */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col shadow-xs">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-[#008080] rounded-sm" />
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-700">Recent Inventory Items</h3>
            </div>
            <button 
              onClick={() => onNavigateToTab('products')}
              className="text-xs text-[#008080] hover:text-[#008080]/80 font-bold flex items-center gap-1 transition-all cursor-pointer"
            >
              <span className="hidden sm:inline">View All Products</span> <span className="sm:hidden">View All</span> <ArrowRight size={12} />
            </button>
          </div>
          
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left min-w-[600px] lg:min-w-0">
              <thead className="bg-slate-50 text-[9px] uppercase text-slate-400 font-black tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3 hidden md:table-cell">SKU</th>
                  <th className="px-5 py-3">Sub-Brand</th>
                  <th className="px-5 py-3 text-right">Total Stock</th>
                  <th className="px-5 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-xs text-slate-400 italic">
                      No active items found. Seed initial data in Settings!
                    </td>
                  </tr>
                ) : (
                  recentProducts.map((product) => {
                    const stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                    const isLowStock = stock <= product.reorderThreshold;
                    
                    return (
                      <tr key={product.id} className="text-xs hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                              {product.images && product.images[0] ? (
                                <img 
                                  src={product.images[0]} 
                                  alt={product.name} 
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                                  {product.name.slice(0, 2)}
                                </span>
                              )}
                            </div>
                            <span className="font-bold text-slate-800 line-clamp-1">{product.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-xs font-mono text-slate-500 font-medium hidden md:table-cell">
                          {product.sku}
                        </td>
                        <td className="px-5 py-3.5">
                          {getSubBrandBadge(product.subBrand)}
                        </td>
                        <td className={`px-5 py-3.5 text-right font-bold ${isLowStock ? 'text-red-500 font-extrabold' : 'text-slate-700'}`}>
                          {stock} pcs
                        </td>
                        <td className="px-5 py-3.5 text-right font-semibold text-slate-950 font-mono">
                          ৳ {product.sellingPrice?.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trend Visualization (Custom styled bento bar chart) */}
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-700 mb-4 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-[#008080]" />
              Stock Value Trend
            </h3>
            
            <div className="h-28 flex items-end justify-between gap-1 mt-4">
              <div className="w-full bg-teal-500/10 rounded-t-sm h-[30%] relative group">
                <div className="absolute -top-6 left-0 right-0 text-[8px] font-mono text-center opacity-0 group-hover:opacity-100 text-slate-600 transition-opacity">
                  1.2M
                </div>
              </div>
              <div className="w-full bg-teal-500/15 rounded-t-sm h-[45%] relative group">
                <div className="absolute -top-6 left-0 right-0 text-[8px] font-mono text-center opacity-0 group-hover:opacity-100 text-slate-600 transition-opacity">
                  1.4M
                </div>
              </div>
              <div className="w-full bg-teal-500/20 rounded-t-sm h-[35%] relative group"></div>
              <div className="w-full bg-teal-500/30 rounded-t-sm h-[60%] relative group"></div>
              <div className="w-full bg-teal-500/40 rounded-t-sm h-[55%] relative group"></div>
              <div className="w-full bg-[#008080]/60 rounded-t-sm h-[80%] relative group"></div>
              <div className="w-full bg-[#D4AF37] rounded-t-sm h-[95%] relative group">
                <div className="absolute -top-6 left-0 right-0 text-[8px] font-mono font-bold text-center opacity-100 text-[#D4AF37]">
                  Peak
                </div>
              </div>
            </div>
            
            <div className="flex justify-between mt-2.5 text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">
              <span>M</span>
              <span>T</span>
              <span>W</span>
              <span>T</span>
              <span>F</span>
              <span>S</span>
              <span>S</span>
            </div>
          </div>
          
          <div className="mt-6 pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Weekly Growth</span>
              <span className="text-emerald-600 font-bold">+12.4%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Utilization</span>
              <span className="text-slate-800 font-extrabold font-mono">78%</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
