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
      setOrders(oList);
      setExpenses(eList);
      setProducts(pList);
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } fontally: {
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

  // Filter Orders within Date Range & Sub-Brand
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const inDate = o.createdAt >= rangeStartTs && o.createdAt <= rangeEndTs;
      const inSubBrand = subBrandFilter === 'ALL' || o.subBrand === subBrandFilter;
      return inDate && inSubBrand;
    });
  }, [orders, rangeStartTs, rangeEndTs, subBrandFilter]);

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

  // COGS Calculation: Sum of item cost prices for non-cancelled orders
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => map.set(p.id, p.costPrice || 0));
    return map;
  }, [products]);

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

    const list = Array.from(map.values());
    return list;
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
    link.setAttribute('download', `Report_${activeReportTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Printable Header - visible only when printing */}
      <div className="hidden print:block p-6 bg-white text-slate-900 border-b border-slate-300 mb-6">
        <h1 className="text-2xl font-black">Sky Automation Inventory — Analytics Report</h1>
        <p className="text-xs text-slate-500 mt-1">Generated on {new Date().toLocaleString()}</p>
      </div>

      {/* Screen Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600">
              <BarChart3 size={24} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Reports & Analytics</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Comprehensive performance insights across sales, product movement, sub-brands, and channels.</p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer border border-slate-200"
          >
            <FileSpreadsheet size={16} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
          >
            <Printer size={16} />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* Controls Bar: Range & Sub-Brand Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 print:hidden">
        <div className="flex items-center gap-2 flex-1">
          <Calendar size={18} className="text-slate-400 shrink-0" />
          <select
            value={dateRangeType}
            onChange={(e) => setDateRangeType(e.target.value as any)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Date Range</option>
          </select>

          {dateRangeType === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Filter size={18} className="text-slate-400 shrink-0" />
          <select
            value={subBrandFilter}
            onChange={(e) => setSubBrandFilter(e.target.value as any)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="ALL">All Sub-Brands (SAT / GZ / RTX)</option>
            <option value="SAT">SAT (Sky Auto)</option>
            <option value="GZ">GZ (GadgetZu)</option>
            <option value="RTX">RTX (RTX Gadget)</option>
          </select>
        </div>
      </div>

      {/* Report Navigation Tabs */}
      <div className="border-b border-slate-200 flex flex-wrap gap-2 print:hidden">
        <button
          onClick={() => setActiveReportTab('sales')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeReportTab === 'sales' ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <TrendingUp size={16} />
            <span>Sales Report</span>
          </div>
        </button>

        <button
          onClick={() => setActiveReportTab('profit_loss')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeReportTab === 'profit_loss' ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign size={16} />
            <span>Profit & Loss</span>
          </div>
        </button>

        <button
          onClick={() => setActiveReportTab('products_rank')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeReportTab === 'products_rank' ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Award size={16} />
            <span>Best Sellers & Slow Moving</span>
          </div>
        </button>

        <button
          onClick={() => setActiveReportTab('subbrand_comp')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeReportTab === 'subbrand_comp' ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers size={16} />
            <span>Sub-Brand Comparison</span>
          </div>
        </button>

        <button
          onClick={() => setActiveReportTab('channels')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeReportTab === 'channels' ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl' : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <PieIcon size={16} />
            <span>Sales Channels</span>
          </div>
        </button>
      </div>

      {/* Main Tab Views */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-500">Processing real-time report calculations...</p>
        </div>
      ) : activeReportTab === 'sales' ? (
        /* TAB 1: SALES REPORT */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Sales Revenue</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {canViewFinancials ? `৳${totalSalesRevenue.toLocaleString('en-BD')}` : 'Restricted (Super Admin)'}
              </div>
              <p className="text-xs text-slate-500 mt-1">Non-cancelled orders in selected period</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders Placed</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{filteredOrders.length}</div>
              <p className="text-xs text-slate-500 mt-1">Delivered: {totalDeliveredOrders}</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Order Value</div>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {canViewFinancials && filteredOrders.length > 0 
                  ? `৳${Math.round(totalSalesRevenue / (filteredOrders.filter(o => o.status !== 'Returned/Cancelled').length || 1)).toLocaleString('en-BD')}` 
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Orders Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">
              Period Sales Log ({filteredOrders.length} Orders)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <th className="p-3">Date</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Sub-Brand</th>
                    <th className="p-3">Sales Channel</th>
                    <th className="p-3">Status</th>
                    {canViewFinancials && <th className="p-3 text-right">Total Amount</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.slice(0, 50).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/80">
                      <td className="p-3 font-mono text-slate-600">{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td className="p-3 font-bold text-slate-900">{order.customerName}</td>
                      <td className="p-3">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                          {order.subBrand}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{order.salesChannel}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.status === 'Delivered' ? 'bg-emerald-50 text-emerald-700' :
                          order.status === 'Returned/Cancelled' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      {canViewFinancials && (
                        <td className="p-3 text-right font-bold text-slate-900 font-mono">
                          ৳{order.totalAmount.toLocaleString('en-BD')}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeReportTab === 'profit_loss' ? (
        /* TAB 2: PROFIT & LOSS REPORT */
        !canViewFinancials ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
            <ShieldAlert size={40} className="mx-auto text-amber-500 mb-3" />
            <h3 className="text-base font-bold text-slate-900">Restricted Financial Access</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Profit & Loss financial figures are strictly confidential and visible to Super Admin users only.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Sales Revenue</div>
                <div className="text-2xl font-black text-slate-900 mt-1">৳{totalSalesRevenue.toLocaleString('en-BD')}</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cost of Goods Sold (COGS)</div>
                <div className="text-2xl font-black text-amber-600 mt-1">৳{totalCOGS.toLocaleString('en-BD')}</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Operating Expenses</div>
                <div className="text-2xl font-black text-rose-600 mt-1">৳{totalOperatingExpenses.toLocaleString('en-BD')}</div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Net Profit</div>
                <div className={`text-2xl font-black mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ৳{netProfit.toLocaleString('en-BD')}
                </div>
              </div>
            </div>

            {/* P&L Statement Summary Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">Financial Statement Summary</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="font-bold text-slate-700">(+) Total Sales Revenue</span>
                  <span className="font-mono font-bold text-slate-900">৳{totalSalesRevenue.toLocaleString('en-BD')}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 text-rose-600">
                  <span className="font-bold">(-) Cost of Goods Sold (Unit Cost Prices)</span>
                  <span className="font-mono font-bold">-৳{totalCOGS.toLocaleString('en-BD')}</span>
                </div>
                <div className="flex justify-between items-center py-1 bg-amber-50/50 p-2 rounded-xl font-bold text-amber-900">
                  <span>(=) Gross Profit Margin</span>
                  <span className="font-mono">৳{(totalSalesRevenue - totalCOGS).toLocaleString('en-BD')}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 text-rose-600">
                  <span className="font-bold">(-) Total Business Expenses (Rent, Salary, Utilities)</span>
                  <span className="font-mono font-bold">-৳{totalOperatingExpenses.toLocaleString('en-BD')}</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-slate-900 text-white p-3 rounded-xl font-black text-sm">
                  <span>(=) NET PROFIT / (LOSS)</span>
                  <span className="font-mono text-amber-400">৳{netProfit.toLocaleString('en-BD')}</span>
                </div>
              </div>
            </div>
          </div>
        )
      ) : activeReportTab === 'products_rank' ? (
        /* TAB 3: BEST-SELLING & SLOW MOVING PRODUCTS */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Product Sales Movement Rankings</h3>
            <span className="text-xs text-slate-500 font-mono">Ranked by Units Sold</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <th className="p-3">Rank</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3 text-center">Units Sold</th>
                  <th className="p-3 text-center">Current Stock</th>
                  {canViewFinancials && <th className="p-3 text-right">Revenue Generated</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bestSellingProducts.map((p, index) => (
                  <tr key={p.sku + index} className="hover:bg-slate-50/80">
                    <td className="p-3 font-bold text-slate-400">#{index + 1}</td>
                    <td className="p-3 font-bold text-slate-900">{p.name}</td>
                    <td className="p-3 font-mono text-slate-500">{p.sku}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        p.qty > 0 ? 'bg-emerald-50 text-emerald-700 font-mono' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {p.qty} units
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono text-slate-700">{p.stock}</td>
                    {canViewFinancials && (
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        ৳{p.revenue.toLocaleString('en-BD')}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeReportTab === 'subbrand_comp' ? (
        /* TAB 4: SUB-BRAND COMPARISON */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {subBrandComparisonStats.map((sb) => (
            <div key={sb.subBrand} className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${
                    sb.subBrand === 'SAT' ? 'bg-amber-500' : sb.subBrand === 'GZ' ? 'bg-teal-600' : 'bg-orange-500'
                  }`} />
                  <h3 className="text-lg font-black text-slate-900">
                    {sb.subBrand === 'SAT' ? 'Sky Auto (SAT)' : sb.subBrand === 'GZ' ? 'GadgetZu (GZ)' : 'RTX Gadget (RTX)'}
                  </h3>
                </div>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Orders:</span>
                  <span className="font-bold text-slate-900">{sb.totalOrders}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivered Orders:</span>
                  <span className="font-bold text-emerald-600">{sb.deliveredOrders}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Returned / Cancelled:</span>
                  <span className="font-bold text-rose-600">{sb.cancelledOrders}</span>
                </div>

                {canViewFinancials && (
                  <>
                    <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-slate-800">
                      <span>Total Revenue:</span>
                      <span className="font-mono">৳{sb.revenue.toLocaleString('en-BD')}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>Expenses:</span>
                      <span className="font-mono">-৳{sb.expenses.toLocaleString('en-BD')}</span>
                    </div>
                    <div className="flex justify-between font-black text-sm pt-2 bg-slate-50 p-2 rounded-xl text-slate-900">
                      <span>Net Profit:</span>
                      <span className="font-mono text-emerald-600">৳{sb.netProfit.toLocaleString('en-BD')}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* TAB 5: SALES CHANNELS REPORT */
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">
            Sales Performance by Channel
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <th className="p-3">Sales Channel</th>
                  <th className="p-3 text-center">Total Orders</th>
                  <th className="p-3 text-center">% Share of Orders</th>
                  {canViewFinancials && <th className="p-3 text-right">Revenue Generated</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {channelBreakdown.map((ch) => {
                  const sharePct = filteredOrders.length > 0 ? ((ch.count / filteredOrders.length) * 100).toFixed(1) : '0';
                  return (
                    <tr key={ch.name} className="hover:bg-slate-50/80">
                      <td className="p-3 font-bold text-slate-900">{ch.name}</td>
                      <td className="p-3 text-center font-bold text-slate-800">{ch.count}</td>
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-mono font-bold text-[10px]">
                          {sharePct}%
                        </span>
                      </td>
                      {canViewFinancials && (
                        <td className="p-3 text-right font-mono font-bold text-slate-900">
                          ৳{ch.revenue.toLocaleString('en-BD')}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
