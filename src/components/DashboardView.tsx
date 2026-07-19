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
  QrCode,
  ShoppingBag,
  Receipt,
  BarChart3,
  Users,
  CheckCircle,
  AlertCircle,
  Coins,
  Truck,
  Percent
} from 'lucide-react';
import { Product, UserProfile, Order, Customer, Invoice } from '../types';
import { 
  checkInUser, 
  checkOutUser, 
  getTodayAttendance, 
  getOrders, 
  getCustomers,
  getInvoices,
  getAllUsers
} from '../firebase/db';
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
  const isAdminOrSuperAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  
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
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoadingData(true);
      try {
        const [orders, customers, invoices, users] = await Promise.all([
          getOrders(),
          getCustomers(),
          getInvoices(),
          getAllUsers()
        ]);
        setAllOrders(orders || []);
        setAllCustomers(customers || []);
        setAllInvoices(invoices || []);
        setAllUsers(users || []);
      } catch (err) {
        console.error("Error fetching dashboard data", err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchDashboardData();
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
      if (!p.archived && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))) {
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
      const p = products.find(prod => !prod.archived && (prod.variants.some(v => v.barcodeValue === text) || prod.barcodeValue === text || prod.sku === text));
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
  const approvedProducts = products.filter(product => product.status === 'approved' && !product.archived);

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

  // Date helpers
  const isSameDay = (timestamp: number, targetDate: Date) => {
    const d = new Date(timestamp);
    return d.getFullYear() === targetDate.getFullYear() &&
           d.getMonth() === targetDate.getMonth() &&
           d.getDate() === targetDate.getDate();
  };

  const today = new Date();
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const lastMonthSameDay = new Date();
  lastMonthSameDay.setMonth(lastMonthSameDay.getMonth() - 1);

  const startOfThisMonth = new Date();
  startOfThisMonth.setDate(1);
  startOfThisMonth.setHours(0, 0, 0, 0);

  // Today's Sales
  const todayOrders = allOrders.filter(o => isSameDay(o.createdAt, today) && o.status !== 'Returned/Cancelled');
  const todaySales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  const todayOrdersCount = todayOrders.length;

  // Yesterday's Sales
  const yesterdayOrders = allOrders.filter(o => isSameDay(o.createdAt, yesterday) && o.status !== 'Returned/Cancelled');
  const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Last Month Same Day Sales
  const lastMonthSameDayOrders = allOrders.filter(o => isSameDay(o.createdAt, lastMonthSameDay) && o.status !== 'Returned/Cancelled');
  const lastMonthSameDaySales = lastMonthSameDayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

  // Percent indicators
  let vsYesterdayPercent = 0;
  if (yesterdaySales > 0) {
    vsYesterdayPercent = Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);
  } else if (todaySales > 0) {
    vsYesterdayPercent = 100;
  }

  let vsLastMonthSameDayPercent = 0;
  if (lastMonthSameDaySales > 0) {
    vsLastMonthSameDayPercent = Math.round(((todaySales - lastMonthSameDaySales) / lastMonthSameDaySales) * 100);
  } else if (todaySales > 0) {
    vsLastMonthSameDayPercent = 100;
  }

  // Profit Summary
  const productCostMap = new Map<string, number>();
  products.forEach(p => {
    productCostMap.set(p.id, p.costPrice || 0);
  });

  const getOrderProfit = (order: Order) => {
    return order.items.reduce((sum, item) => {
      const costPrice = productCostMap.has(item.productId) 
        ? productCostMap.get(item.productId)! 
        : (item.unitPrice * 0.7); // Fallback: 30% profit margin
      const profitPerUnit = item.unitPrice - costPrice;
      return sum + (profitPerUnit * item.qty);
    }, 0);
  };

  const isConfirmedOrDelivered = (o: Order) => ['Confirmed', 'Packed', 'Shipped', 'Delivered'].includes(o.status);

  const todayOrdersForProfit = allOrders.filter(o => isSameDay(o.createdAt, today) && isConfirmedOrDelivered(o));
  const todayProfit = todayOrdersForProfit.reduce((sum, o) => sum + getOrderProfit(o), 0);

  const thisMonthOrdersForProfit = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && isConfirmedOrDelivered(o));
  const thisMonthProfit = thisMonthOrdersForProfit.reduce((sum, o) => sum + getOrderProfit(o), 0);

  // Due Payments Summary (Receivables)
  const dueOrders = allOrders.filter(o => (o.paymentStatus === 'Due' || o.paymentStatus === 'Partial') && o.status !== 'Returned/Cancelled' && o.amountDue > 0);
  const totalDue = dueOrders.reduce((sum, o) => sum + o.amountDue, 0);
  
  const activeOrders = allOrders.filter(o => o.status !== 'Returned/Cancelled');
  const activePaidSum = activeOrders.reduce((sum, o) => sum + o.amountPaid, 0);
  const activeDueSum = activeOrders.reduce((sum, o) => sum + o.amountDue, 0);
  const collectionRate = (activePaidSum + activeDueSum) > 0 
    ? Math.round((activePaidSum / (activePaidSum + activeDueSum)) * 100) 
    : 100;

  // Pending Reviews
  const pendingProductsCount = products.filter(p => p.status === 'pending_review' && !p.archived).length;
  const pendingUsersCount = allUsers.filter(u => u.status === 'pending_approval').length;

  // Top Selling Products (This Month)
  const getTopSellingProducts = () => {
    const salesMap = new Map<string, { id: string; name: string; qty: number; revenue: number }>();
    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(order => {
      order.items.forEach(item => {
        const existing = salesMap.get(item.productId);
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.qty * item.unitPrice;
        } else {
          salesMap.set(item.productId, {
            id: item.productId,
            name: item.productName || 'Unknown Product',
            qty: item.qty,
            revenue: item.qty * item.unitPrice
          });
        }
      });
    });
    
    return Array.from(salesMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  };
  const topSellingProducts = getTopSellingProducts();

  // Courier Performance Breakdown
  const getCourierStats = () => {
    let steadfastShipped = 0;
    let steadfastPending = 0; // Shipped but not Delivered
    let carryBeeShipped = 0;
    let carryBeePending = 0; // Shipped but not Delivered

    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(o => {
      const isSteadfast = o.courier?.toLowerCase().includes('steadfast');
      const isCarryBee = o.courier?.toLowerCase().includes('carrybee');
      
      if (isSteadfast) {
        steadfastShipped++;
        if (o.status === 'Shipped') steadfastPending++;
      } else if (isCarryBee) {
        carryBeeShipped++;
        if (o.status === 'Shipped') carryBeePending++;
      }
    });

    return {
      steadfastShipped,
      steadfastPending,
      carryBeeShipped,
      carryBeePending
    };
  };
  const courierStats = getCourierStats();

  // Sub-brand Breakdown
  const getSubBrandSales = () => {
    const breakdown = {
      SAT: { revenue: 0, orders: 0 },
      GZ: { revenue: 0, orders: 0 },
      RTX: { revenue: 0, orders: 0 }
    };
    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(o => {
      const sub = o.subBrand || 'SAT';
      if (breakdown[sub]) {
        breakdown[sub].revenue += o.totalAmount;
        breakdown[sub].orders++;
      }
    });
    return breakdown;
  };
  const subBrandSales = getSubBrandSales();

  // Sales Channel Breakdown
  const getSalesChannelSales = () => {
    const breakdown: Record<string, { revenue: number; orders: number }> = {};
    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(o => {
      const channel = o.salesChannel || 'Direct/WhatsApp';
      if (!breakdown[channel]) {
        breakdown[channel] = { revenue: 0, orders: 0 };
      }
      breakdown[channel].revenue += o.totalAmount;
      breakdown[channel].orders++;
    });
    
    return Object.entries(breakdown)
      .map(([channel, data]) => ({ channel, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  };
  const salesChannelSales = getSalesChannelSales();

  // Reorder List
  const reorderList = products
    .filter(p => !p.archived && p.status === 'approved')
    .map(p => {
      const stock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      return { ...p, stock };
    })
    .filter(p => p.stock <= p.reorderThreshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  // Active Staff
  const activeStaff = allUsers.filter(u => u.currentSessionStatus === 'checked_in');

  // Weekly Trend
  const getWeeklySalesTrend = () => {
    const trend: { day: string; amount: number; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0,0,0,0);
      
      const dayOrders = allOrders.filter(o => {
        const orderDate = new Date(o.createdAt);
        return orderDate.getFullYear() === d.getFullYear() &&
               orderDate.getMonth() === d.getMonth() &&
               orderDate.getDate() === d.getDate() &&
               o.status !== 'Returned/Cancelled';
      });
      
      const dayAmount = dayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      const dayName = d.toLocaleDateString([], { weekday: 'short' });
      trend.push({
        day: dayName,
        amount: dayAmount,
        count: dayOrders.length
      });
    }
    return trend;
  };
  const weeklySalesTrend = getWeeklySalesTrend();

  // Recent Orders (5)
  const recentOrders = [...allOrders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  // Recent Invoices (5)
  const recentInvoices = [...allInvoices]
    .sort((a, b) => b.generatedAt - a.generatedAt)
    .slice(0, 5);

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

  if (loadingData) {
    return (
      <div className="space-y-6 animate-pulse p-2">
        {/* Dynamic Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div className="space-y-2">
            <div className="h-3 w-28 bg-slate-200 rounded"></div>
            <div className="h-6 w-48 bg-slate-200 rounded"></div>
          </div>
          <div className="h-12 w-32 bg-slate-200 rounded-xl"></div>
        </div>
        {/* Search Bar */}
        <div className="h-14 bg-slate-100 rounded-2xl w-full"></div>
        {/* Attendance Grid */}
        <div className="h-24 bg-slate-100 rounded-2xl w-full"></div>
        {/* Stat Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="h-40 bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4">
              <div className="h-3 w-1/3 bg-slate-200 rounded"></div>
              <div className="h-8 w-2/3 bg-slate-200 rounded"></div>
              <div className="h-3 w-1/2 bg-slate-200 rounded pt-2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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

      {/* Top Metrics Grid (4 columns) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        
        {/* Stat: Today's Sales */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-40">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Today's Sales</p>
              <span className="text-[10px] font-mono font-bold bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                {todayOrdersCount} Order{todayOrdersCount !== 1 ? 's' : ''}
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-slate-950 tracking-tight mt-2">৳ {todaySales.toLocaleString()}</h3>
          </div>
          <div className="text-[11px] text-slate-500 space-y-1 border-t border-slate-100 pt-2 flex flex-col mt-3">
            <div className="flex items-center justify-between">
              <span>Vs yesterday:</span>
              <span className={`font-bold font-mono ${vsYesterdayPercent > 0 ? 'text-emerald-600' : vsYesterdayPercent < 0 ? 'text-red-500' : 'text-amber-600'}`}>
                {vsYesterdayPercent > 0 ? `+${vsYesterdayPercent}` : vsYesterdayPercent}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Vs last month same day:</span>
              <span className={`font-bold font-mono ${vsLastMonthSameDayPercent > 0 ? 'text-emerald-600' : vsLastMonthSameDayPercent < 0 ? 'text-red-500' : 'text-amber-600'}`}>
                {vsLastMonthSameDayPercent > 0 ? `+${vsLastMonthSameDayPercent}` : vsLastMonthSameDayPercent}%
              </span>
            </div>
          </div>
        </div>

        {/* Stat: Profit Summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-40">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Profit Summary</p>
              <span className="text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
                Net Margin
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-emerald-600 tracking-tight mt-2">৳ {todayProfit.toLocaleString()}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Today's net profit (confirmed / delivered)</p>
          </div>
          <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-xs mt-3">
            <span className="text-slate-500">This Month's Profit:</span>
            <span className="font-extrabold text-slate-800 font-mono">৳ {thisMonthProfit.toLocaleString()}</span>
          </div>
        </div>

        {/* Stat: Due Payments Summary */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between min-h-40">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Summary</p>
              <button 
                onClick={() => onNavigateToTab('receivables')}
                className="text-[10px] font-bold text-amber-600 hover:underline flex items-center gap-0.5"
              >
                View Logs <ArrowRight size={10} />
              </button>
            </div>
            <h3 className="text-2xl md:text-3xl font-black text-red-500 tracking-tight mt-2">৳ {totalDue.toLocaleString()}</h3>
            <p className="text-[10px] text-slate-400 mt-1">Over {dueOrders.length} outstanding accounts</p>
          </div>
          <div className="border-t border-slate-100 pt-2 mt-3 space-y-1 text-[11px] text-slate-500">
            <div className="flex justify-between items-center">
              <span>Collection rate:</span>
              <span className="font-bold text-slate-800 font-mono">{collectionRate}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1">
              <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${collectionRate}%` }}></div>
            </div>
          </div>
        </div>

        {/* Stat: Inventory Valuation */}
        <div className="bg-[#008080] text-white border border-teal-800 rounded-2xl p-5 shadow-md flex flex-col justify-between min-h-40 transition-all duration-300 hover:shadow-lg">
          <div>
            <div className="flex justify-between items-start">
              <p className="text-[10px] font-bold text-teal-100 uppercase tracking-widest">Inventory Valuation</p>
              <span className="text-[10px] font-mono font-bold bg-teal-900/40 text-teal-200 border border-teal-700 px-1.5 py-0.5 rounded">
                Live Asset
              </span>
            </div>
            {isStaff ? (
              <h3 className="text-base font-bold text-teal-100 font-mono italic tracking-tight mt-4">Protected Context</h3>
            ) : (
              <h3 className="text-2xl md:text-3xl font-black tracking-tight mt-2">
                ৳ {totalStockValue.toLocaleString()}
              </h3>
            )}
          </div>
          <div className="text-[11px] text-teal-100 flex items-center justify-between border-t border-teal-700/60 pt-2 mt-3">
            <span>Total Units In Stock:</span>
            <span className="font-bold font-mono text-white">{totalStockUnits.toLocaleString()}</span>
          </div>
        </div>

      </div>

      {/* Main Operational Dashboard Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN (2/3 width on large screens) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Quick Actions Tile */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Layers size={16} className="text-amber-500" />
              Quick Task Dispatch
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={() => onNavigateToTab('products', 'add')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-all cursor-pointer group text-center"
              >
                <PlusCircle size={20} className="text-slate-600 group-hover:text-slate-950 mb-2 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-xs font-bold text-slate-800">New Product</span>
                <span className="text-[9px] text-slate-400 mt-0.5">Submit to review</span>
              </button>
              
              <button
                onClick={() => onNavigateToTab('stock', 'in')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-all cursor-pointer group text-center"
              >
                <TrendingUp size={20} className="text-slate-600 group-hover:text-slate-950 mb-2 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-xs font-bold text-slate-800">Add Stock</span>
                <span className="text-[9px] text-slate-400 mt-0.5">Increment inventory</span>
              </button>

              <button
                onClick={() => onNavigateToTab('receivables')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-all cursor-pointer group text-center"
              >
                <Coins size={20} className="text-slate-600 group-hover:text-slate-950 mb-2 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-xs font-bold text-slate-800">Record Paid</span>
                <span className="text-[9px] text-slate-400 mt-0.5">Collect due funds</span>
              </button>

              <button
                onClick={() => onNavigateToTab('orders')}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl transition-all cursor-pointer group text-center"
              >
                <ShoppingBag size={20} className="text-slate-600 group-hover:text-slate-950 mb-2 transition-transform duration-200 group-hover:scale-110" />
                <span className="text-xs font-bold text-slate-800">New Order</span>
                <span className="text-[9px] text-slate-400 mt-0.5">Book sales ticket</span>
              </button>
            </div>
          </div>

          {/* Recent Orders Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShoppingBag size={16} className="text-[#008080]" />
                Recent Orders Desk
              </h3>
              <button 
                onClick={() => onNavigateToTab('orders')}
                className="text-xs text-[#008080] font-bold hover:underline"
              >
                View All Desk
              </button>
            </div>
            
            {recentOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No orders recorded in the registry.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                      <th className="pb-2">Order ID</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Sub-Brand</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {recentOrders.map(order => (
                      <tr 
                        key={order.id} 
                        className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                        onClick={() => onNavigateToTab('orders', undefined, order.id)}
                      >
                        <td className="py-3 font-mono font-bold text-slate-800 group-hover:text-amber-600">
                          #{order.id.slice(0, 8)}
                        </td>
                        <td className="py-3">
                          <p className="font-bold text-slate-800">{order.customerName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{order.customerPhone}</p>
                        </td>
                        <td className="py-3">{getSubBrandBadge(order.subBrand)}</td>
                        <td className="py-3 text-right font-bold text-slate-900 font-mono">
                          ৳ {order.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                            order.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            order.status === 'Returned/Cancelled' ? 'bg-red-50 text-red-700 border-red-100' :
                            order.status === 'Shipped' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                            'bg-amber-50 text-amber-700 border-amber-100'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent Invoices Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt size={16} className="text-indigo-500" />
                Recent Invoices Desk
              </h3>
              <button 
                onClick={() => onNavigateToTab('invoices')}
                className="text-xs text-indigo-500 font-bold hover:underline"
              >
                View All Invoices
              </button>
            </div>
            
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No invoices generated yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-mono uppercase tracking-wider">
                      <th className="pb-2">Invoice No</th>
                      <th className="pb-2">Customer</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2 text-right">Amount</th>
                      <th className="pb-2 text-center">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs">
                    {recentInvoices.map(invoice => (
                      <tr 
                        key={invoice.id} 
                        className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                        onClick={() => onNavigateToTab('invoices', undefined, invoice.id)}
                      >
                        <td className="py-3 font-mono font-extrabold text-slate-800 group-hover:text-amber-600">
                          {invoice.invoiceNumber}
                        </td>
                        <td className="py-3">
                          <p className="font-bold text-slate-800">{invoice.customerName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{invoice.customerPhone}</p>
                        </td>
                        <td className="py-3 text-slate-500 font-mono">
                          {new Date(invoice.generatedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900 font-mono">
                          ৳ {invoice.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 text-center">
                          {invoice.voided ? (
                            <span className="px-2 py-0.5 bg-red-100 text-red-800 border border-red-200 text-[9px] font-bold rounded-full">
                              VOIDED
                            </span>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                              invoice.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>
                              {invoice.paymentStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sub-brand & Sales Channel Breakdown Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Sub-brand breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 size={16} className="text-teal-600" />
                  Sub-brand Contribution (This Month)
                </h3>
                <div className="space-y-3.5">
                  {Object.entries(subBrandSales).map(([sub, data]) => {
                    const totalMonthRevenue = Object.values(subBrandSales).reduce((sum, item) => sum + item.revenue, 0);
                    const percent = totalMonthRevenue > 0 ? Math.round((data.revenue / totalMonthRevenue) * 100) : 0;
                    
                    return (
                      <div key={sub} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-800">{sub === 'SAT' ? 'Sky Automation (SAT)' : sub === 'GZ' ? 'GadgetZu (GZ)' : 'RTX Gadget (RTX)'}</span>
                          <span className="font-mono text-slate-600 font-bold">{percent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              sub === 'SAT' ? 'bg-slate-700' : sub === 'GZ' ? 'bg-teal-500' : 'bg-orange-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                          <span>{data.orders} Order{data.orders !== 1 ? 's' : ''}</span>
                          <span>৳ {data.revenue.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sales Channel Breakdown */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Percent size={16} className="text-amber-500" />
                  Top Channels (This Month)
                </h3>
                {salesChannelSales.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No orders recorded this month.</p>
                ) : (
                  <div className="space-y-3">
                    {salesChannelSales.map((item, i) => {
                      const maxRevenue = Math.max(...salesChannelSales.map(ch => ch.revenue), 1);
                      const percent = Math.round((item.revenue / maxRevenue) * 100);
                      
                      return (
                        <div key={item.channel} className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-medium text-slate-700">{item.channel}</span>
                            <span className="font-mono text-slate-500 font-bold">৳ {item.revenue.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-50 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-amber-400 h-full rounded-full" 
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN (1/3 width on large screens) */}
        <div className="space-y-6">
          
          {/* Top Selling Products This Month */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Sparkles size={16} className="text-amber-500" />
              Best Sellers (This Month)
            </h3>
            
            {topSellingProducts.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No product sales logged this month.</p>
            ) : (
              <div className="space-y-3.5">
                {topSellingProducts.map((product, index) => (
                  <div 
                    key={product.id} 
                    className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                    onClick={() => onNavigateToTab('products', undefined, product.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-700 shrink-0">
                        {index + 1}
                      </div>
                      <div className="min-w-0 font-sans">
                        <p className="text-xs font-bold text-slate-800 truncate leading-tight">{product.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{product.qty} unit{product.qty !== 1 ? 's' : ''} sold</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-900 font-mono shrink-0">
                      ৳ {product.revenue.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Courier Performance Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Truck size={16} className="text-slate-700" />
              Courier Desk Performance
            </h3>
            <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Steadfast</p>
                <h4 className="text-xl font-black text-slate-800 mt-1 font-mono">{courierStats.steadfastShipped}</h4>
                <p className="text-[9px] text-red-500 mt-1 font-bold">{courierStats.steadfastPending} pending delivery</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CarryBee</p>
                <h4 className="text-xl font-black text-slate-800 mt-1 font-mono">{courierStats.carryBeeShipped}</h4>
                <p className="text-[9px] text-red-500 mt-1 font-bold">{courierStats.carryBeePending} pending delivery</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-3">Counts reflect active shipments processed this calendar month.</p>
          </div>

          {/* Weekly Sales Trend (7 days) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500" />
              Weekly Sales Velocity
            </h3>
            <div className="space-y-2.5">
              {weeklySalesTrend.map(dayData => {
                const maxAmount = Math.max(...weeklySalesTrend.map(d => d.amount), 1);
                const barPercent = Math.round((dayData.amount / maxAmount) * 100);
                
                return (
                  <div key={dayData.day} className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-slate-400 w-8">{dayData.day}</span>
                    <div className="flex-1 bg-slate-50 h-5 rounded-md overflow-hidden relative border border-slate-100">
                      <div 
                        className="bg-emerald-500/85 h-full rounded-r-sm transition-all duration-300" 
                        style={{ width: `${barPercent}%` }}
                      />
                      <span className="absolute inset-0 flex items-center pl-2 text-[9px] font-bold text-slate-700">
                        {dayData.count} order{dayData.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 font-mono w-16 text-right">
                      ৳ {dayData.amount.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reorder List Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500 animate-pulse" />
                Critical Low Stock List
              </h3>
              <span className="text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                {reorderList.length} Items
              </span>
            </div>
            
            {reorderList.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">All product stocks are safely above threshold.</p>
            ) : (
              <div className="space-y-3">
                {reorderList.map(prod => (
                  <div 
                    key={prod.id} 
                    className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                    onClick={() => onNavigateToTab('products', undefined, prod.id)}
                  >
                    <div className="min-w-0 pr-3 font-sans">
                      <p className="text-xs font-bold text-slate-800 truncate leading-tight">{prod.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Threshold: {prod.reorderThreshold} units</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-100 rounded text-[10px] font-bold font-mono">
                        {prod.stock} Left
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff Attendance Activity Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Users size={16} className="text-indigo-500" />
              Staff Desk Status
            </h3>
            <div className="flex justify-between items-center p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl mb-4">
              <span className="text-xs font-bold text-indigo-900">Operator Session Count:</span>
              <span className="text-xs font-extrabold font-mono text-indigo-700 bg-white border border-indigo-200 px-2.5 py-1 rounded-xl shadow-xs">
                {activeStaff.length} Checked In
              </span>
            </div>
            
            {activeStaff.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center italic font-sans">No operators currently active.</p>
            ) : (
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                {activeStaff.map(u => (
                  <div key={u.id} className="flex items-center justify-between text-xs p-2 border border-slate-50 bg-slate-50/20 rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                      <div>
                        <p className="font-bold text-slate-800 leading-tight">{u.name}</p>
                        <p className="text-[9px] text-slate-400 uppercase tracking-wide font-mono mt-0.5">{u.role}</p>
                      </div>
                    </div>
                    <div className="text-right font-mono text-[10px] text-slate-500">
                      {u.subBrandAccess?.length > 0 ? getSubBrandBadge(u.subBrandAccess[0]) : <span className="text-slate-400">All Brands</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
