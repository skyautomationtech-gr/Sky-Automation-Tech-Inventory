import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Download, 
  Printer, 
  ShoppingBag, 
  PieChart as PieIcon, 
  Layers, 
  Award, 
  ArrowDownRight, 
  ShieldAlert,
  Search,
  Filter,
  FileSpreadsheet
} from 'lucide-react';
import { 
  Order, 
  Expense, 
  Product, 
  UserProfile, 
  SalesChannel 
} from '../types';
import { getOrders, getExpenses, getProducts } from '../firebase/db';

interface ReportsAnalyticsProps {
  user: UserProfile | null;
}

export default function ReportsAnalytics({ user }: ReportsAnalyticsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [activeReportTab, setActiveReportTab] = useState<'sales' | 'profit_loss' | 'products_rank' | 'subbrand_comp' | 'channels'>('sales');
  const [dateRangeType, setDateRangeType] = useState<'today' | 'this_week' | 'this_month' | 'last_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');
  const [filterLossMakingOnly, setFilterLossMakingOnly] = useState(false);

  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  const canViewFinancials = isSuperAdmin; // Super Admin only for financial totals/profit

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [oList, eList, pList] = await Promise.all([
        getOrders(),
        getExpenses(),
        getProducts()
      ]);
      setOrders(oList || []);
      setExpenses(eList || []);
      setProducts(pList || []);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Compute start and end timestamps based on range selection
  const { rangeStartTs, rangeEndTs } = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);

    if (dateRangeType === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateRangeType === 'this_week') {
      const day = now.getDay();
      start.setDate(now.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (dateRangeType === 'this_month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (dateRangeType === 'last_month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (dateRangeType === 'this_year') {
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (dateRangeType === 'custom' && startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    }

    return { rangeStartTs: start.getTime(), rangeEndTs: end.getTime() };
  }, [dateRangeType, startDate, endDate]);

  // COGS Calculation Map
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => map.set(p.id, Number(p.costPrice || p.purchasePrice) || 0));
    return map;
  }, [products]);

  // Filter Orders within Date Range & Sub-Brand & Loss-Making toggle
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const inDate = o.createdAt >= rangeStartTs && o.createdAt <= rangeEndTs;
      const inSubBrand = subBrandFilter === 'ALL' || o.subBrand === subBrandFilter;
      if (!inDate || !inSubBrand) return false;

      if (filterLossMakingOnly) {
        let totalCost = 0;
        (o.items || []).forEach(it => {
          const c = productCostMap.get(it.productId) || 0;
          totalCost += c * (Number(it.qty) || 1);
        });
        const profit = (Number(o.totalAmount) || 0) - totalCost;
        if (profit >= 0) return false;
      }

      return true;
    });
  }, [orders, rangeStartTs, rangeEndTs, subBrandFilter, filterLossMakingOnly, productCostMap]);

  // Filter Expenses within Date Range & Sub-Brand
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const eTime = new Date(e.date).getTime();
      const inDate = eTime >= rangeStartTs && eTime <= rangeEndTs;
      const inSubBrand = subBrandFilter === 'ALL' || !e.subBrand || e.subBrand === subBrandFilter;
      return inDate && inSubBrand;
    });
  }, [expenses, rangeStartTs, rangeEndTs, subBrandFilter]);

  // Key Aggregations
  const totalSalesRevenue = useMemo(() => {
    return filteredOrders
      .filter(o => o.status !== 'Returned/Cancelled')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [filteredOrders]);

  const totalDeliveredOrders = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'Delivered').length;
  }, [filteredOrders]);

  const totalOperatingExpenses = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }, [filteredExpenses]);

  const totalCOGS = useMemo(() => {
    let cogs = 0;
    filteredOrders
      .filter(o => o.status !== 'Returned/Cancelled')
      .forEach(o => {
        o.items.forEach(item => {
          const cost = productCostMap.get(item.productId) || 0;
          cogs += cost * item.qty;
        });
      });
    return cogs;
  }, [filteredOrders, productCostMap]);

  const netProfit = totalSalesRevenue - totalCOGS - totalOperatingExpenses;

  // Product Rankings (Best-selling vs Slow-moving)
  const productSalesMap = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number; name: string; sku: string; stock: number }>();
    
    // Initialize with all products
    products.forEach(p => {
      const totalStock = p.variants?.reduce((s, v) => s + v.stock, 0) || 0;
      map.set(p.id, { qty: 0, revenue: 0, name: p.name, sku: p.sku, stock: totalStock });
    });

    // Populate sold quantities from non-cancelled orders
    filteredOrders
      .filter(o => o.status !== 'Returned/Cancelled')
      .forEach(o => {
        o.items.forEach(item => {
          const existing = map.get(item.productId);
          if (existing) {
            existing.qty += item.qty;
            existing.revenue += item.qty * item.unitPrice;
          } else {
            map.set(item.productId, {
              qty: item.qty,
              revenue: item.qty * item.unitPrice,
              name: item.productName,
              sku: 'N/A',
              stock: 0
            });
          }
        });
      });

    return Array.from(map.values());
  }, [products, filteredOrders]);

  const bestSellingProducts = useMemo(() => {
    return [...productSalesMap].sort((a, b) => b.qty - a.qty);
  }, [productSalesMap]);

  // Sales Channels Breakdown
  const channelBreakdown = useMemo(() => {
    const channels: Record<string, { count: number; revenue: number }> = {};
    filteredOrders.forEach(o => {
      const ch = o.salesChannel || 'Direct/WhatsApp';
      if (!channels[ch]) channels[ch] = { count: 0, revenue: 0 };
      channels[ch].count += 1;
      if (o.status !== 'Returned/Cancelled') {
        channels[ch].revenue += o.totalAmount;
      }
    });
    return Object.entries(channels).map(([name, data]) => ({ name, ...data }));
  }, [filteredOrders]);

  // Sub-brand Comparison Stats
  const subBrandComparisonStats = useMemo(() => {
    const subs: ('SAT' | 'GZ' | 'RTX')[] = ['SAT', 'GZ', 'RTX'];
    return subs.map(sb => {
      const sbOrders = orders.filter(o => o.subBrand === sb && o.createdAt >= rangeStartTs && o.createdAt <= rangeEndTs);
      const validOrders = sbOrders.filter(o => o.status !== 'Returned/Cancelled');
      const rev = validOrders.reduce((sum, o) => sum + o.totalAmount, 0);
      
      let sbCogs = 0;
      validOrders.forEach(o => {
        o.items.forEach(item => {
          sbCogs += (productCostMap.get(item.productId) || 0) * item.qty;
        });
      });

      const sbExp = expenses
        .filter(e => e.subBrand === sb && new Date(e.date).getTime() >= rangeStartTs && new Date(e.date).getTime() <= rangeEndTs)
        .reduce((sum, e) => sum + e.amount, 0);

      const netProf = rev - sbCogs - sbExp;

      return {
        subBrand: sb,
        totalOrders: sbOrders.length,
        deliveredOrders: sbOrders.filter(o => o.status === 'Delivered').length,
        cancelledOrders: sbOrders.filter(o => o.status === 'Returned/Cancelled').length,
        revenue: rev,
        cogs: sbCogs,
        expenses: sbExp,
        netProfit: netProf
      };
    });
  }, [orders, expenses, rangeStartTs, rangeEndTs, productCostMap]);

  // CSV Export
  const handleExportCSV = () => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    if (activeReportTab === 'sales') {
      csvContent += 'Order ID,Date,Customer Name,Sub-Brand,Channel,Total Amount (BDT),Status\n';
      filteredOrders.forEach(o => {
        const row = [
          o.id,
          new Date(o.createdAt).toLocaleDateString(),
          `"${o.customerName}"`,
          o.subBrand,
          o.salesChannel,
          o.totalAmount,
          o.status
        ].join(',');
        csvContent += row + '\n';
      });
    } else if (activeReportTab === 'products_rank') {
      csvContent += 'Product Name,SKU,Units Sold,Revenue Generated (BDT),Current Stock\n';
      bestSellingProducts.forEach(p => {
        const row = [`"${p.name}"`, p.sku, p.qty, p.revenue, p.stock].join(',');
        csvContent += row + '\n';
      });
    } else if (activeReportTab === 'channels') {
      csvContent += 'Sales Channel,Total Orders,Revenue Generated (BDT)\n';
      channelBreakdown.forEach(c => {
        const row = [c.name, c.count, c.revenue].join(',');
        csvContent += row + '\n';
      });
    } else if (activeReportTab === 'subbrand_comp') {
      csvContent += 'Sub-Brand,Total Orders,Delivered Orders,Cancelled Orders,Revenue (BDT),Expenses (BDT),Net Profit (BDT)\n';
      subBrandComparisonStats.forEach(s => {
        const row = [s.subBrand, s.totalOrders, s.deliveredOrders, s.cancelledOrders, s.revenue, s.expenses, s.netProfit].join(',');
        csvContent += row + '\n';
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `report_${activeReportTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-gold-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Compiling Analytics Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-10">
      
      {/* Pinned Desktop Filter & Export Bar */}
      <div className="sticky top-16 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        
        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <Calendar size={14} className="text-gold-500" />
            <select
              value={dateRangeType}
              onChange={(e: any) => setDateRangeType(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {dateRangeType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Sub-Brand Filter */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
            <Filter size={14} className="text-gold-500" />
            <select
              value={subBrandFilter}
              onChange={(e: any) => setSubBrandFilter(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sub-Brands</option>
              <option value="SAT">Sky Auto</option>
              <option value="GZ">GadgetZu</option>
              <option value="RTX">RTX Gadget</option>
            </select>
          </div>

          {/* Loss-making filter toggle */}
          <button
            onClick={() => setFilterLossMakingOnly(!filterLossMakingOnly)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              filterLossMakingOnly
                ? 'bg-rose-500 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert size={14} />
            Loss-Making Orders Only
          </button>
        </div>

        {/* Grouped Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            Export CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <Printer size={14} />
            Print Report
          </button>
        </div>

      </div>

      {/* Navigation Segmented Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit overflow-x-auto border border-slate-200/60 dark:border-slate-700">
        <button
          onClick={() => setActiveReportTab('sales')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeReportTab === 'sales'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <BarChart3 size={15} />
          Sales & Revenue
        </button>
        {canViewFinancials && (
          <button
            onClick={() => setActiveReportTab('profit_loss')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeReportTab === 'profit_loss'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <DollarSign size={15} />
            Profit & Loss (P&L)
          </button>
        )}
        <button
          onClick={() => setActiveReportTab('products_rank')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeReportTab === 'products_rank'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Award size={15} />
          Product Ranks
        </button>
        <button
          onClick={() => setActiveReportTab('subbrand_comp')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeReportTab === 'subbrand_comp'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers size={15} />
          Sub-Brand Matrix
        </button>
        <button
          onClick={() => setActiveReportTab('channels')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap cursor-pointer ${
            activeReportTab === 'channels'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200/80 dark:border-slate-700'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <PieIcon size={15} />
          Sales Channels
        </button>
      </div>

      {/* Main Analytics Content Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[500px]">
        
        {/* Tab 1: Sales & Revenue Overview */}
        {activeReportTab === 'sales' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">Total Revenue</span>
                <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                  ৳ {totalSalesRevenue.toLocaleString()}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">Delivered Orders</span>
                <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                  {totalDeliveredOrders} / {filteredOrders.length}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
                <span className="text-xs text-slate-500 dark:text-slate-400">Average Order Value</span>
                <div className="text-xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">
                  ৳ {filteredOrders.length > 0 ? Math.round(totalSalesRevenue / filteredOrders.length).toLocaleString() : 0}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">Order ID</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Customer</th>
                    <th className="pb-3">Sub-Brand</th>
                    <th className="pb-3">Channel</th>
                    <th className="pb-3 text-right">Amount</th>
                    <th className="pb-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredOrders.map(o => (
                    <tr key={o.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pl-2 font-mono font-bold text-slate-900 dark:text-white">#{o.id.slice(-6).toUpperCase()}</td>
                      <td className="py-3 text-slate-600 dark:text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 font-medium text-slate-800 dark:text-slate-200">{o.customerName}</td>
                      <td className="py-3 font-semibold text-slate-700 dark:text-slate-300">{o.subBrand || 'SAT'}</td>
                      <td className="py-3 text-slate-500">{o.salesChannel || 'Direct'}</td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-white tabular-nums">৳ {o.totalAmount.toLocaleString()}</td>
                      <td className="py-3 text-center">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          o.status === 'Delivered' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          o.status === 'Returned/Cancelled' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                          'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Profit & Loss (Super-Admin Only) */}
        {activeReportTab === 'profit_loss' && canViewFinancials && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-6 bg-slate-50/50 dark:bg-slate-800/30">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Financial Statement (P&L)</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Gross Sales Revenue</span>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">৳ {totalSalesRevenue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Cost of Goods Sold (COGS)</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">- ৳ {totalCOGS.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 rounded-xl">
                  <span className="font-bold text-slate-900 dark:text-white">Gross Profit Margin</span>
                  <span className="font-black text-slate-900 dark:text-white tabular-nums">৳ {(totalSalesRevenue - totalCOGS).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-800">
                  <span className="text-slate-600 dark:text-slate-400">Operating Expenses</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">- ৳ {totalOperatingExpenses.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-3 bg-gold-500/10 border border-gold-500/20 px-4 rounded-xl text-base font-black">
                  <span className="text-gold-700 dark:text-gold-400">Net Profit</span>
                  <span className={`tabular-nums ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    ৳ {netProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Product Ranks */}
        {activeReportTab === 'products_rank' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Best-Selling Product Rankings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Product Name</th>
                    <th className="pb-3 text-center">SKU</th>
                    <th className="pb-3 text-center">Units Sold</th>
                    <th className="pb-3 text-right">Revenue Generated</th>
                    <th className="pb-3 text-center">Available Stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bestSellingProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pl-2 font-mono font-bold text-gold-600 dark:text-gold-400">#{idx + 1}</td>
                      <td className="py-3 font-semibold text-slate-900 dark:text-white">{p.name}</td>
                      <td className="py-3 text-center font-mono text-slate-500">{p.sku}</td>
                      <td className="py-3 text-center font-bold text-slate-900 dark:text-white tabular-nums">{p.qty}</td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white tabular-nums">৳ {p.revenue.toLocaleString()}</td>
                      <td className="py-3 text-center text-slate-600 dark:text-slate-400 tabular-nums">{p.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Sub-Brand Comparison Matrix */}
        {activeReportTab === 'subbrand_comp' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Sub-Brand Performance Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {subBrandComparisonStats.map(sb => (
                <div key={sb.subBrand} className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold text-slate-900 dark:text-white">{sb.subBrand}</span>
                    <span className="text-xs text-slate-400">{sb.totalOrders} total orders</span>
                  </div>
                  <div className="space-y-2 text-xs pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Gross Revenue</span>
                      <span className="font-bold text-slate-900 dark:text-white tabular-nums">৳ {sb.revenue.toLocaleString()}</span>
                    </div>
                    {canViewFinancials && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Expenses</span>
                          <span className="font-medium text-rose-500 tabular-nums">৳ {sb.expenses.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 font-bold">
                          <span className="text-slate-700 dark:text-slate-300">Net Profit</span>
                          <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">৳ {sb.netProfit.toLocaleString()}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 5: Sales Channels */}
        {activeReportTab === 'channels' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Sales Channels Distribution</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">Channel Name</th>
                    <th className="pb-3 text-center">Total Orders</th>
                    <th className="pb-3 text-right">Revenue Generated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {channelBreakdown.map((ch, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pl-2 font-bold text-slate-900 dark:text-white">{ch.name}</td>
                      <td className="py-3 text-center font-medium text-slate-700 dark:text-slate-300 tabular-nums">{ch.count}</td>
                      <td className="py-3 text-right font-black text-slate-900 dark:text-white tabular-nums">৳ {ch.revenue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
