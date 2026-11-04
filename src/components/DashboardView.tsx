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
  ShoppingBag,
  Receipt,
  BarChart3,
  Users,
  CheckCircle,
  AlertCircle,
  Coins,
  Truck,
  Percent,
  Calculator,
  Wallet,
  Building2,
  ChevronRight,
  RefreshCw,
  Zap
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid 
} from 'recharts';
import { 
  Product, 
  UserProfile, 
  Order, 
  Customer, 
  Invoice,
  Investment,
  OtherReceivable,
  CompanyPurchase,
  PaymentPlatformEntry,
  CompanyLoss,
  ImportShippingRecord,
  StockPurchaseRecord,
  Expense
} from '../types';
import { 
  checkInUser, 
  checkOutUser, 
  getTodayAttendance, 
  getOrders, 
  getCustomers,
  getInvoices,
  getAllUsers,
  getInvestments,
  getOtherReceivables,
  getCompanyPurchases,
  getPaymentPlatformEntries,
  getCompanyLosses,
  getImportShippingRecords,
  getExpenses,
  getAccountingBaselineSettings,
  subscribeToAccountingBaselineSettings,
  getCashTransactions,
  subscribeToCashTransactions
} from '../firebase/db';

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
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [liveLoginCodes, setLiveLoginCodes] = useState<any[]>([]);

  useEffect(() => {
    if (user?.role !== 'superadmin') return;
    
    let unsubscribe: any = null;
    let isMounted = true;
    
    const setupListener = async () => {
      try {
        const { collection, onSnapshot, query } = await import('firebase/firestore');
        const { db } = await import('../firebase/config');
        
        if (!isMounted) return;
        
        const q = query(collection(db, 'liveLoginCodes'));
        unsubscribe = onSnapshot(q, (snapshot: any) => {
          const codes: any[] = [];
          snapshot.forEach((docSnap: any) => {
            codes.unshift({ id: docSnap.id, ...docSnap.data() });
          });
          setLiveLoginCodes(codes);
        }, (err: any) => {
          console.warn('Live login codes listener notice:', err);
        });
      } catch (e) {
        console.warn('Live login codes setup notice:', e);
      }
    };
    
    setupListener();
    
    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [user]);

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
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    const results: any[] = [];
    
    // Search Products
    products.forEach(p => {
      if (!p) return;
      const pName = (p.name || '').toLowerCase();
      const pSku = (p.sku || '').toLowerCase();
      if (!p.archived && (pName.includes(q) || pSku.includes(q))) {
        results.push({ type: 'product', item: p });
      }
    });

    // Search Orders
    allOrders.forEach(o => {
      if (!o) return;
      const oId = (o.id || '').toLowerCase();
      const invId = (o.invoiceId || '').toLowerCase();
      const cName = (o.customerName || '').toLowerCase();
      const cPhone = o.customerPhone || '';
      if (oId.includes(q) || invId.includes(q) || cName.includes(q) || cPhone.includes(q)) {
        results.push({ type: 'order', item: o });
      }
    });

    // Search Customers
    allCustomers.forEach(c => {
      if (!c) return;
      const cName = (c.name || '').toLowerCase();
      const cPhone = c.phone || '';
      if (cName.includes(q) || cPhone.includes(q)) {
        results.push({ type: 'customer', item: c });
      }
    });

    setSearchResults(results.slice(0, 15));
    setIsSearching(false);
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
        : (item.unitPrice * 0.7);
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
    const salesMap = new Map<string, { id: string; name: string; shortName: string; qty: number; revenue: number }>();
    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(order => {
      order.items.forEach(item => {
        const pName = item.productName || 'Unknown Product';
        const existing = salesMap.get(item.productId);
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.qty * item.unitPrice;
        } else {
          salesMap.set(item.productId, {
            id: item.productId,
            name: pName,
            shortName: pName.length > 22 ? pName.slice(0, 20) + '…' : pName,
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

  // Sub-brand Breakdown
  const getSubBrandSales = () => {
    const breakdown = {
      SAT: { revenue: 0, orders: 0 },
      GZ: { revenue: 0, orders: 0 },
      RTX: { revenue: 0, orders: 0 }
    };
    const monthOrders = allOrders.filter(o => o.createdAt >= startOfThisMonth.getTime() && o.status !== 'Returned/Cancelled');
    
    monthOrders.forEach(o => {
      const sub = (o.subBrand || 'SAT') as keyof typeof breakdown;
      if (breakdown[sub]) {
        breakdown[sub].revenue += o.totalAmount;
        breakdown[sub].orders++;
      }
    });
    return breakdown;
  };
  const subBrandSales = getSubBrandSales();

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

  const getCategoryStockData = () => {
    const catMap: Record<string, number> = {};
    products.forEach(p => {
      if (p.archived || p.status !== 'approved') return;
      const cat = p.mainCategory || p.category || 'Uncategorized';
      const stock = p.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      catMap[cat] = (catMap[cat] || 0) + stock;
    });
    return Object.entries(catMap).map(([name, value]) => ({ name, value }));
  };
  const categoryStockData = getCategoryStockData();
  const COLORS = ['#D4AF37', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#008080'];

  // Recent Orders (5)
  const recentOrders = [...allOrders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  // Recent Invoices (5)
  const recentInvoices = [...allInvoices]
    .sort((a, b) => b.generatedAt - a.generatedAt)
    .slice(0, 5);

  const getSubBrandBadge = (subBrand: string) => {
    switch (subBrand?.toUpperCase()) {
      case 'GZ':
      case 'GADGETZU':
        return (
          <span className="px-2 py-0.5 bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold rounded border border-teal-500/20">
            GadgetZu
          </span>
        );
      case 'RTX':
        return (
          <span className="px-2 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-bold rounded border border-orange-500/20">
            RTX Gadget
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 bg-gold-500/10 text-gold-700 dark:text-gold-400 text-xs font-bold rounded border border-gold-500/20">
            Sky Auto
          </span>
        );
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-gold-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading Sky Inventory Pro Overview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-10">
      
      {/* Dashboard Top Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sky Inventory Overview
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-gold-500/10 text-gold-700 dark:text-gold-400 border border-gold-500/20">
              Live Desktop Console
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Realtime sales breakdown, active inventory valuation, receivable tracking, and staff session operations.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigateToTab('orders', 'create')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-900 bg-gold-400 hover:bg-gold-500 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <PlusCircle size={15} />
            + New Order
          </button>
          <button
            onClick={() => onNavigateToTab('products', 'create')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            <Package size={15} />
            Add Product
          </button>
          <button
            onClick={() => onNavigateToTab('accounting')}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            <Calculator size={15} />
            Accounting
          </button>
        </div>
      </div>

      {/* Row 1: Soft-UI KPI Cards Grid (12 Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        
        {/* KPI 1: Today's Sales */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Today's Sales</span>
            <div className="w-9 h-9 rounded-xl bg-gold-500/10 text-gold-600 dark:text-gold-400 flex items-center justify-center">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              ৳ {todaySales.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className={`font-semibold ${vsYesterdayPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {vsYesterdayPercent >= 0 ? `+${vsYesterdayPercent}%` : `${vsYesterdayPercent}%`}
              </span>
              <span className="text-slate-400">vs yesterday ({todayOrdersCount} orders)</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Inventory Stock Value */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Inventory Valuation</span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              ৳ {totalStockValue.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{totalStockUnits.toLocaleString()}</span> units across catalog
            </div>
          </div>
        </div>

        {/* KPI 3: Reorder Alerts */}
        <div 
          onClick={() => onNavigateToTab('products', 'reorder')}
          className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Low Stock Reorders</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <AlertTriangle size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              {lowStockCount} <span className="text-sm font-normal text-slate-400">SKUs</span>
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
              <span>View restock list</span>
              <ChevronRight size={14} />
            </div>
          </div>
        </div>

        {/* KPI 4: Due Receivables */}
        <div 
          onClick={() => onNavigateToTab('due_payments')}
          className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm transition-all hover:shadow-md cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Due Receivables</span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Coins size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">
              ৳ {totalDue.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{collectionRate}%</span>
              <span className="text-slate-400">collection rate</span>
            </div>
          </div>
        </div>

        {/* KPI 5 / Shift Widget: Compact Work Session */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Work Session</span>
            <span className={`w-2.5 h-2.5 rounded-full ${isCheckedIn ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-700'}`} />
          </div>
          <div className="mt-2">
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {user?.name || 'Staff User'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isCheckedIn ? 'Shift Active' : 'Not Checked In'}
            </div>
          </div>
          <div className="mt-3">
            {isCheckedIn ? (
              <button
                onClick={handleCheckOut}
                disabled={processingAttendance}
                className="w-full py-1.5 px-3 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                {processingAttendance ? 'Updating...' : 'End Shift / Check Out'}
              </button>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={processingAttendance}
                className="w-full py-1.5 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                {processingAttendance ? 'Updating...' : 'Start Shift / Check In'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Row 2: Wide Charts Grid (12 Cols: 8 Col Sales Trend + 4 Col Sub-Brand Distribution) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 8 Cols: Sales Performance Trend */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp size={18} className="text-gold-500" />
                7-Day Sales Trend & Volume
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Daily order revenues and confirmed transactions</p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">7-Day Total</span>
              <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                ৳ {weeklySalesTrend.reduce((sum, d) => sum + d.amount, 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklySalesTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `৳${v >= 1000 ? `${v/1000}k` : v}`} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#0f172a', 
                    borderColor: '#334155', 
                    borderRadius: '0.75rem', 
                    color: '#f8fafc',
                    fontSize: '12px'
                  }}
                  formatter={(value: any) => [`৳ ${Number(value).toLocaleString()}`, 'Revenue']}
                />
                <Bar dataKey="amount" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4 Cols: Category Stock Breakdown */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers size={18} className="text-gold-500" />
              Category Stock Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Inventory unit counts by category</p>
          </div>

          <div className="h-56 w-full my-4 flex items-center justify-center">
            {categoryStockData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryStockData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryStockData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#0f172a', 
                      borderColor: '#334155', 
                      borderRadius: '0.75rem', 
                      color: '#f8fafc',
                      fontSize: '12px'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400 italic text-center">No category data available</div>
            )}
          </div>

          {/* Sub-brand revenue pills */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Sub-Brand Monthly Revenue</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center border border-slate-200/50 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 block">SAT</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums">৳{subBrandSales.SAT.revenue.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center border border-slate-200/50 dark:border-slate-800">
                <span className="text-[10px] font-bold text-teal-500 block">GZ</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums">৳{subBrandSales.GZ.revenue.toLocaleString()}</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-2 text-center border border-slate-200/50 dark:border-slate-800">
                <span className="text-[10px] font-bold text-orange-500 block">RTX</span>
                <span className="text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums">৳{subBrandSales.RTX.revenue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Row 3: Desktop Operations Grid (12 Cols: 7 Col Orders & Invoices + 5 Col Best Sellers & Staff Activity) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 7 Cols: Recent Orders & Invoices */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Recent Orders Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingBag size={18} className="text-gold-500" />
                  Recent Orders
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Latest customer transactions</p>
              </div>
              <button
                onClick={() => onNavigateToTab('orders')}
                className="text-xs font-semibold text-gold-600 dark:text-gold-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                View all orders <ArrowRight size={13} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">Order ID</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Sub-Brand</th>
                    <th className="pb-3 text-right">Amount</th>
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOrders.length > 0 ? (
                    recentOrders.map((order) => (
                      <tr 
                        key={order.id}
                        onClick={() => onNavigateToTab('orders', 'view', order.id)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 pl-2 font-mono font-bold text-slate-900 dark:text-white">
                          #{order.id.slice(-6).toUpperCase()}
                        </td>
                        <td className="py-3 text-slate-700 dark:text-slate-300 font-medium">
                          {order.customerName || 'Guest'}
                        </td>
                        <td className="py-3">
                          {getSubBrandBadge(order.subBrand)}
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                          ৳ {order.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            order.status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                            order.status === 'Shipped' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                            order.status === 'Returned/Cancelled' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 italic">No recent orders found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Invoices Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Receipt size={18} className="text-gold-500" />
                  Generated Invoices
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Commercial sales documents</p>
              </div>
              <button
                onClick={() => onNavigateToTab('invoices')}
                className="text-xs font-semibold text-gold-600 dark:text-gold-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                View all invoices <ArrowRight size={13} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">Invoice #</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3 text-right">Grand Total</th>
                    <th className="pb-3 text-center">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentInvoices.length > 0 ? (
                    recentInvoices.map((inv) => (
                      <tr 
                        key={inv.id}
                        onClick={() => onNavigateToTab('invoices', 'view', inv.id)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 pl-2 font-mono font-bold text-slate-900 dark:text-white">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-3 text-slate-700 dark:text-slate-300 font-medium">
                          {inv.customerName}
                        </td>
                        <td className="py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">
                          ৳ {inv.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 text-center">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                            inv.paymentStatus === 'Paid' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                            inv.paymentStatus === 'Partial' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                            'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          }`}>
                            {inv.paymentStatus}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-slate-400 italic">No invoices generated yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* 5 Cols: Best Sellers & Active Staff Activity */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Best Sellers Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-gold-500" />
                  Top Best Sellers
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Highest volume SKUs this month</p>
              </div>
            </div>

            <div className="space-y-3">
              {topSellingProducts.length > 0 ? (
                topSellingProducts.map((p, idx) => (
                  <div 
                    key={p.id}
                    onClick={() => onNavigateToTab('products', 'view', p.id)}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800 hover:border-gold-500/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-gold-500/10 text-gold-700 dark:text-gold-400 font-black text-xs flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">{p.name}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{p.qty} units sold</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-slate-900 dark:text-white tabular-nums">৳ {p.revenue.toLocaleString()}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic text-center py-6">No sales recorded this month</div>
              )}
            </div>
          </div>

          {/* Pending Approvals & Restock Alerts */}
          {(pendingProductsCount > 0 || pendingUsersCount > 0) && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold text-sm">
                <AlertCircle size={18} />
                Action Required ({pendingProductsCount + pendingUsersCount})
              </div>
              <div className="mt-2 space-y-2 text-xs">
                {pendingProductsCount > 0 && (
                  <div 
                    onClick={() => onNavigateToTab('products', 'pending')}
                    className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 cursor-pointer hover:underline"
                  >
                    <span className="text-amber-900 dark:text-amber-300 font-medium">{pendingProductsCount} products awaiting review</span>
                    <ChevronRight size={14} className="text-amber-600" />
                  </div>
                )}
                {pendingUsersCount > 0 && (
                  <div 
                    onClick={() => onNavigateToTab('users', 'pending')}
                    className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/40 cursor-pointer hover:underline"
                  >
                    <span className="text-amber-900 dark:text-amber-300 font-medium">{pendingUsersCount} employee registrations pending</span>
                    <ChevronRight size={14} className="text-amber-600" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Staff Sessions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users size={18} className="text-gold-500" />
                  Active Staff On Duty
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{activeStaff.length} team members checked in</p>
              </div>
            </div>

            <div className="space-y-2">
              {activeStaff.length > 0 ? (
                activeStaff.map((staff) => (
                  <div key={staff.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gold-500/20 text-gold-700 dark:text-gold-300 font-bold text-xs flex items-center justify-center">
                        {staff.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{staff.name}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{staff.role}</div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      On Shift
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-400 italic text-center py-4">No staff checked in currently</div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
