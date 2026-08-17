import React, { useState, useMemo } from 'react';
import { 
  X, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ShoppingBag, 
  Layers, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownRight, 
  Tag, 
  ChevronRight, 
  Sparkles, 
  Award, 
  Percent, 
  Info,
  Calendar,
  Building,
  HelpCircle,
  FileSpreadsheet,
  PieChart
} from 'lucide-react';
import { Order, Expense, Income } from '../types';

interface NetProfitBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  incomes: Income[];
  expenses: Expense[];
  products: any[];
  startDate: string;
  endDate: string;
  subBrandFilter: string;
  financialMetrics: {
    totalIncome: number;
    totalSalesIncome: number;
    totalManualIncome: number;
    totalSoldProductCost: number;
    totalExpenses: number;
    grossProfit: number;
    netProfit: number;
    profitMargin: number;
  };
}

export const NetProfitBreakdownModal: React.FC<NetProfitBreakdownModalProps> = ({
  isOpen,
  onClose,
  orders,
  incomes,
  expenses,
  products,
  startDate,
  endDate,
  subBrandFilter,
  financialMetrics
}) => {
  const [activeTab, setActiveTab] = useState<'products' | 'orders' | 'channels' | 'expenses'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubBrand, setSelectedSubBrand] = useState<string>(subBrandFilter === 'All' ? 'All' : subBrandFilter);
  const [sortBy, setSortBy] = useState<'profit_desc' | 'profit_asc' | 'revenue_desc' | 'qty_desc' | 'margin_desc'>('profit_desc');
  const [orderChannelFilter, setOrderChannelFilter] = useState<string>('All');

  // Map of product cost prices by productId
  const productCostMap = useMemo(() => {
    const map = new Map<string, { costPrice: number; name: string; category?: string; subBrand?: string; sku?: string }>();
    products.forEach(p => {
      map.set(p.id, {
        costPrice: Number(p.costPrice) || 0,
        name: p.name || 'Unnamed Product',
        category: p.category || 'General',
        subBrand: p.subBrand || 'SAT',
        sku: p.sku || ''
      });
    });
    return map;
  }, [products]);

  // Date range timestamps
  const { startMs, endMs } = useMemo(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
    return { startMs: start, endMs: end };
  }, [startDate, endDate]);

  // Filtered eligible orders (excluding cancelled/returned)
  const eligibleOrders = useMemo(() => {
    return orders.filter(order => {
      if (order.status === 'Returned/Cancelled') return false;
      const orderTime = order.createdAt || new Date(order.createdAt).getTime();
      const dateMatch = orderTime >= startMs && orderTime <= endMs;
      const brandMatch = selectedSubBrand === 'All' || order.subBrand === selectedSubBrand;
      return dateMatch && brandMatch;
    });
  }, [orders, startMs, endMs, selectedSubBrand]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const expTime = new Date(exp.date + 'T00:00:00').getTime();
      const dateMatch = expTime >= startMs && expTime <= endMs;
      const brandMatch = selectedSubBrand === 'All' || exp.subBrand === selectedSubBrand || exp.subBrand === '' || exp.subBrand === 'ALL';
      return dateMatch && brandMatch;
    });
  }, [expenses, startMs, endMs, selectedSubBrand]);

  // 1. PRODUCT PROFIT BREAKDOWN
  const productBreakdown = useMemo(() => {
    interface ProdRow {
      productId: string;
      productName: string;
      category: string;
      subBrand: string;
      sku: string;
      unitsSold: number;
      unitCostPrice: number;
      avgSellingPrice: number;
      totalRevenue: number;
      totalCost: number;
      grossProfit: number;
      profitMargin: number;
      avgProfitPerUnit: number;
      ordersCount: number;
      variantsSold: { [variantLabel: string]: number };
    }

    const map = new Map<string, ProdRow>();

    eligibleOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const prodInfo = productCostMap.get(item.productId);
        const name = prodInfo?.name || item.productName || 'Unknown Product';
        const category = prodInfo?.category || 'General';
        const subBrand = prodInfo?.subBrand || order.subBrand || 'SAT';
        const sku = prodInfo?.sku || '';
        
        // Accurate cost price: from product profile or fallback to 70% of sale price
        const unitCost = prodInfo?.costPrice !== undefined && prodInfo.costPrice > 0 
          ? prodInfo.costPrice 
          : (item.unitPrice * 0.7);

        const qty = Number(item.qty) || 1;
        const lineRevenue = (Number(item.unitPrice) || 0) * qty;
        const lineCost = unitCost * qty;
        const lineProfit = lineRevenue - lineCost;

        if (!map.has(item.productId)) {
          map.set(item.productId, {
            productId: item.productId,
            productName: name,
            category,
            subBrand,
            sku,
            unitsSold: qty,
            unitCostPrice: unitCost,
            avgSellingPrice: item.unitPrice,
            totalRevenue: lineRevenue,
            totalCost: lineCost,
            grossProfit: lineProfit,
            profitMargin: lineRevenue > 0 ? (lineProfit / lineRevenue) * 100 : 0,
            avgProfitPerUnit: qty > 0 ? lineProfit / qty : 0,
            ordersCount: 1,
            variantsSold: { [item.variantLabel || 'Standard']: qty }
          });
        } else {
          const row = map.get(item.productId)!;
          row.unitsSold += qty;
          row.totalRevenue += lineRevenue;
          row.totalCost += lineCost;
          row.grossProfit += lineProfit;
          row.avgSellingPrice = row.unitsSold > 0 ? row.totalRevenue / row.unitsSold : 0;
          row.profitMargin = row.totalRevenue > 0 ? (row.grossProfit / row.totalRevenue) * 100 : 0;
          row.avgProfitPerUnit = row.unitsSold > 0 ? row.grossProfit / row.unitsSold : 0;
          row.ordersCount += 1;
          const vLabel = item.variantLabel || 'Standard';
          row.variantsSold[vLabel] = (row.variantsSold[vLabel] || 0) + qty;
        }
      });
    });

    let list = Array.from(map.values());

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p => 
        p.productName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.subBrand.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'profit_desc') return b.grossProfit - a.grossProfit;
      if (sortBy === 'profit_asc') return a.grossProfit - b.grossProfit;
      if (sortBy === 'revenue_desc') return b.totalRevenue - a.totalRevenue;
      if (sortBy === 'qty_desc') return b.unitsSold - a.unitsSold;
      if (sortBy === 'margin_desc') return b.profitMargin - a.profitMargin;
      return 0;
    });

    return list;
  }, [eligibleOrders, productCostMap, searchQuery, sortBy]);

  // 2. ORDER PROFIT BREAKDOWN
  const orderBreakdown = useMemo(() => {
    interface OrderRow {
      orderId: string;
      createdAt: number;
      customerName: string;
      customerPhone: string;
      subBrand: string;
      salesChannel: string;
      status: string;
      itemsCount: number;
      totalAmount: number;
      amountPaid: number;
      orderCost: number;
      grossProfit: number;
      profitMargin: number;
      items: { name: string; variant: string; qty: number; unitPrice: number; costPrice: number }[];
    }

    let list: OrderRow[] = eligibleOrders.map(order => {
      let orderCost = 0;
      const itemsList = (order.items || []).map(item => {
        const prodInfo = productCostMap.get(item.productId);
        const cost = prodInfo?.costPrice !== undefined && prodInfo.costPrice > 0 
          ? prodInfo.costPrice 
          : (item.unitPrice * 0.7);
        const itemQty = Number(item.qty) || 1;
        orderCost += cost * itemQty;
        return {
          name: prodInfo?.name || item.productName || 'Product',
          variant: item.variantLabel || 'Standard',
          qty: itemQty,
          unitPrice: item.unitPrice,
          costPrice: cost
        };
      });

      const effectiveTotal = (order.amountPaid && order.amountPaid > 0) ? order.amountPaid : order.totalAmount;
      const profit = effectiveTotal - orderCost;
      const margin = effectiveTotal > 0 ? (profit / effectiveTotal) * 100 : 0;

      return {
        orderId: order.id,
        createdAt: order.createdAt,
        customerName: order.customerName || 'Direct Customer',
        customerPhone: order.customerPhone || '',
        subBrand: order.subBrand || 'SAT',
        salesChannel: order.salesChannel || 'Direct/WhatsApp',
        status: order.status,
        itemsCount: (order.items || []).reduce((sum, i) => sum + (Number(i.qty) || 1), 0),
        totalAmount: order.totalAmount,
        amountPaid: order.amountPaid || 0,
        orderCost,
        grossProfit: profit,
        profitMargin: margin,
        items: itemsList
      };
    });

    // Filter by channel if selected
    if (orderChannelFilter !== 'All') {
      list = list.filter(o => o.salesChannel === orderChannelFilter);
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(o => 
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.salesChannel.toLowerCase().includes(q) ||
        o.subBrand.toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'profit_desc') return b.grossProfit - a.grossProfit;
      if (sortBy === 'profit_asc') return a.grossProfit - b.grossProfit;
      if (sortBy === 'revenue_desc') return b.totalAmount - a.totalAmount;
      if (sortBy === 'qty_desc') return b.itemsCount - a.itemsCount;
      if (sortBy === 'margin_desc') return b.profitMargin - a.profitMargin;
      return b.createdAt - a.createdAt;
    });

    return list;
  }, [eligibleOrders, productCostMap, searchQuery, sortBy, orderChannelFilter]);

  // 3. SUB-BRAND & CHANNEL BREAKDOWN
  const channelAndBrandBreakdown = useMemo(() => {
    // Brands
    const brandMap = new Map<string, { name: string; revenue: number; cost: number; profit: number; ordersCount: number }>();
    // Channels
    const channelMap = new Map<string, { name: string; revenue: number; cost: number; profit: number; ordersCount: number }>();

    eligibleOrders.forEach(order => {
      let orderCost = 0;
      (order.items || []).forEach(item => {
        const prodInfo = productCostMap.get(item.productId);
        const cost = prodInfo?.costPrice !== undefined && prodInfo.costPrice > 0 
          ? prodInfo.costPrice 
          : (item.unitPrice * 0.7);
        orderCost += cost * (Number(item.qty) || 1);
      });

      const effectiveTotal = (order.amountPaid && order.amountPaid > 0) ? order.amountPaid : order.totalAmount;
      const profit = effectiveTotal - orderCost;

      // Brand
      const bKey = order.subBrand || 'SAT';
      if (!brandMap.has(bKey)) {
        brandMap.set(bKey, { name: bKey, revenue: effectiveTotal, cost: orderCost, profit, ordersCount: 1 });
      } else {
        const b = brandMap.get(bKey)!;
        b.revenue += effectiveTotal;
        b.cost += orderCost;
        b.profit += profit;
        b.ordersCount += 1;
      }

      // Channel
      const cKey = order.salesChannel || 'Direct/WhatsApp';
      if (!channelMap.has(cKey)) {
        channelMap.set(cKey, { name: cKey, revenue: effectiveTotal, cost: orderCost, profit, ordersCount: 1 });
      } else {
        const c = channelMap.get(cKey)!;
        c.revenue += effectiveTotal;
        c.cost += orderCost;
        c.profit += profit;
        c.ordersCount += 1;
      }
    });

    return {
      brands: Array.from(brandMap.values()).sort((a, b) => b.profit - a.profit),
      channels: Array.from(channelMap.values()).sort((a, b) => b.profit - a.profit)
    };
  }, [eligibleOrders, productCostMap]);

  // 4. EXPENSE DEDUCTIONS BY CATEGORY
  const expenseCategoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; amount: number; count: number }>();
    filteredExpenses.forEach(exp => {
      const cat = exp.category || 'Other Expense';
      const amt = Number(exp.amount) || 0;
      if (!map.has(cat)) {
        map.set(cat, { category: cat, amount: amt, count: 1 });
      } else {
        const row = map.get(cat)!;
        row.amount += amt;
        row.count += 1;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // Totals for top cards inside modal
  const totalRevenue = productBreakdown.reduce((s, p) => s + p.totalRevenue, 0);
  const totalCost = productBreakdown.reduce((s, p) => s + p.totalCost, 0);
  const totalGrossProfit = totalRevenue - totalCost;
  const totalExpensesAmt = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const finalCalculatedNetProfit = totalGrossProfit - totalExpensesAmt;
  const netMargin = totalRevenue > 0 ? (finalCalculatedNetProfit / totalRevenue) * 100 : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] animate-scale-up">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-950 text-white p-5 sm:p-6 flex justify-between items-center shrink-0 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 rounded-2xl font-black shadow-lg shadow-emerald-500/20">
              <DollarSign size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black font-sans uppercase tracking-tight text-white flex items-center gap-2">
                  Net Profit Breakdown <span className="text-emerald-400 font-bold">(নিট লাভ ও প্রফিট বিশ্লেষণ)</span>
                </h2>
                <span className="text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                  {selectedSubBrand === 'All' ? 'All Brands' : `Brand: ${selectedSubBrand}`}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                কোন পণ্যে কত টাকা লাভ, কোন অর্ডারে কত লাভ এবং ব্যবসার প্রকৃত নিট লাভের পুঙ্খানুপুঙ্খ হিসাব
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X size={22} />
          </button>
        </div>

        {/* SUMMARY KPI CARDS */}
        <div className="bg-slate-900 px-5 sm:px-6 py-4 border-b border-slate-800 shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            
            {/* Total Revenue */}
            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Sales (মোট বিক্রয়)</span>
              <div className="text-base sm:text-lg font-black font-mono text-white mt-0.5">
                ৳{totalRevenue.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{eligibleOrders.length} orders sold</span>
            </div>

            {/* Total Product Cost */}
            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider block">Product Cost (কেনা দাম)</span>
              <div className="text-base sm:text-lg font-black font-mono text-rose-400 mt-0.5">
                -৳{totalCost.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">COGS (ক্রয়মূল্য)</span>
            </div>

            {/* Total Expenses */}
            <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800/80">
              <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider block">Business Exp (অন্যান্য খরচ)</span>
              <div className="text-base sm:text-lg font-black font-mono text-amber-400 mt-0.5">
                -৳{totalExpensesAmt.toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">{filteredExpenses.length} expense logs</span>
            </div>

            {/* True Net Profit */}
            <div className={`p-3 rounded-2xl border shadow-md ${
              finalCalculatedNetProfit >= 0 
                ? 'bg-gradient-to-br from-emerald-600/90 to-teal-700/90 border-emerald-500 text-white' 
                : 'bg-gradient-to-br from-rose-600/90 to-red-700/90 border-rose-500 text-white'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-emerald-100 uppercase tracking-wider">True Net Profit (নিট লাভ)</span>
                <span className="text-[10px] font-black bg-white/20 px-1.5 py-0.5 rounded font-mono">
                  {Math.round(netMargin)}% Margin
                </span>
              </div>
              <div className="text-base sm:text-xl font-black font-mono mt-0.5">
                {finalCalculatedNetProfit < 0 ? '-' : ''}৳{Math.abs(finalCalculatedNetProfit).toLocaleString()}
              </div>
              <span className="text-[10px] text-emerald-100/80 font-medium">Gross Profit: ৳{totalGrossProfit.toLocaleString()}</span>
            </div>

          </div>
        </div>

        {/* CONTROLS: TABS & FILTERS */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 sm:px-6 py-3 shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setActiveTab('products')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'products'
                  ? 'bg-slate-950 text-emerald-400 shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Package size={14} />
              <span>পণ্যভিত্তিক লাভ (Product Profit)</span>
              <span className="bg-emerald-500/20 text-emerald-700 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {productBreakdown.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'orders'
                  ? 'bg-slate-950 text-emerald-400 shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <ShoppingBag size={14} />
              <span>অর্ডারভিত্তিক লাভ (Order Profit)</span>
              <span className="bg-emerald-500/20 text-emerald-700 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-black">
                {orderBreakdown.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('channels')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'channels'
                  ? 'bg-slate-950 text-emerald-400 shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Layers size={14} />
              <span>ব্র্যান্ড ও চ্যানেল (Brand & Channel)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'expenses'
                  ? 'bg-slate-950 text-emerald-400 shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <TrendingDown size={14} className="text-rose-500" />
              <span>খরচের হিসাব (Expenses)</span>
              <span className="bg-rose-100 text-rose-700 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-black">
                ৳{totalExpensesAmt.toLocaleString()}
              </span>
            </button>
          </div>

          {/* Search and Sort controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-48">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, SKU, order..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-7 pr-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Sub-Brand Filter */}
            <select
              value={selectedSubBrand}
              onChange={(e) => setSelectedSubBrand(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs text-slate-700 font-bold focus:outline-hidden focus:border-amber-400"
            >
              <option value="All">All Brands (সকল ব্র্যান্ড)</option>
              <option value="SAT">SAT</option>
              <option value="GZ">GZ</option>
              <option value="RTX">RTX</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs text-slate-700 font-medium focus:outline-hidden focus:border-amber-400"
            >
              <option value="profit_desc">Highest Profit (সর্বোচ্চ লাভ)</option>
              <option value="profit_asc">Lowest Profit (কম লাভ)</option>
              <option value="revenue_desc">Highest Revenue (সর্বোচ্চ বিক্রি)</option>
              <option value="qty_desc">Most Units Sold (সর্বাধিক পিস)</option>
              <option value="margin_desc">Highest Margin % (সর্বোচ্চ মার্জিন %)</option>
            </select>
          </div>

        </div>

        {/* MODAL BODY CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          
          {/* TAB 1: PRODUCT-WISE PROFIT BREAKDOWN */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                    <Package size={16} className="text-emerald-600" />
                    Product-wise Profit & Margin Matrix (পণ্যভিত্তিক লাভের তালিকা)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    প্রতিটি পণ্যের বিক্রিত সংখ্যা, কেনা দাম (Cost Price), বিক্রয়মূল্য এবং অর্জিত নিট মোট লাভ
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                  Total Products Sold: <strong className="text-slate-900">{productBreakdown.reduce((s, p) => s + p.unitsSold, 0)} pcs</strong>
                </div>
              </div>

              {productBreakdown.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Package size={36} className="mx-auto text-slate-300 mb-2" />
                  <h4 className="text-sm font-bold text-slate-700">No sold products found for this date range</h4>
                  <p className="text-xs text-slate-400 mt-1">Try changing the date range or search filter.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-100 text-[11px] font-mono font-black uppercase text-slate-600 tracking-wider border-b border-slate-200">
                          <th className="py-3 px-4">Product Details (পণ্যের বিবরণ)</th>
                          <th className="py-3 px-3 text-center">Units Sold</th>
                          <th className="py-3 px-3 text-right">Cost Price (কেনা দাম)</th>
                          <th className="py-3 px-3 text-right">Avg Sale Price</th>
                          <th className="py-3 px-3 text-right">Total Revenue</th>
                          <th className="py-3 px-3 text-right">Total Cost</th>
                          <th className="py-3 px-4 text-right">Total Profit (মোট লাভ)</th>
                          <th className="py-3 px-3 text-center">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {productBreakdown.map((prod, idx) => {
                          const isTopEarner = idx === 0 && sortBy === 'profit_desc';
                          const isNegative = prod.grossProfit < 0;

                          return (
                            <tr 
                              key={prod.productId} 
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isTopEarner ? 'bg-amber-50/30' : ''
                              }`}
                            >
                              {/* Product Info */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {isTopEarner && (
                                    <span title="Top Earner" className="p-1 bg-amber-400 text-slate-950 rounded-md font-bold shrink-0">
                                      <Award size={13} />
                                    </span>
                                  )}
                                  <div>
                                    <div className="font-bold text-slate-900 leading-snug flex items-center gap-1.5">
                                      <span>{prod.productName}</span>
                                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                                        {prod.subBrand}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                                      <span>Cat: {prod.category}</span>
                                      {prod.sku && <span>• SKU: {prod.sku}</span>}
                                      <span>• in {prod.ordersCount} orders</span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Units Sold */}
                              <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                                <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                                  {prod.unitsSold} pcs
                                </span>
                              </td>

                              {/* Unit Cost */}
                              <td className="py-3 px-3 text-right font-mono text-slate-600 text-xs">
                                ৳{Math.round(prod.unitCostPrice).toLocaleString()}
                              </td>

                              {/* Avg Selling Price */}
                              <td className="py-3 px-3 text-right font-mono text-slate-800 text-xs font-semibold">
                                ৳{Math.round(prod.avgSellingPrice).toLocaleString()}
                              </td>

                              {/* Total Revenue */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                ৳{prod.totalRevenue.toLocaleString()}
                              </td>

                              {/* Total Cost */}
                              <td className="py-3 px-3 text-right font-mono text-rose-600 text-xs font-medium">
                                -৳{prod.totalCost.toLocaleString()}
                              </td>

                              {/* Gross Profit */}
                              <td className="py-3 px-4 text-right font-mono font-black text-sm">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl ${
                                  isNegative 
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200 font-black'
                                }`}>
                                  {isNegative ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                                  {isNegative ? '-' : '+'}৳{Math.abs(prod.grossProfit).toLocaleString()}
                                </span>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  (৳{Math.round(prod.avgProfitPerUnit).toLocaleString()}/pc)
                                </div>
                              </td>

                              {/* Profit Margin */}
                              <td className="py-3 px-3 text-center">
                                <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
                                  prod.profitMargin >= 30 
                                    ? 'bg-emerald-100 text-emerald-800' 
                                    : prod.profitMargin >= 15 
                                      ? 'bg-amber-100 text-amber-800' 
                                      : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {Math.round(prod.profitMargin)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ORDER-WISE PROFIT BREAKDOWN */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                    <ShoppingBag size={16} className="text-emerald-600" />
                    Order-wise Profit Breakdown (অর্ডারভিত্তিক লাভের তালিকা)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    প্রতিটি অর্ডারে বিক্রিত পণ্যের কেনা দাম ও অর্জিত নিট লাভের পুঙ্খানুপুঙ্খ বিবরণ
                  </p>
                </div>

                {/* Sales Channel filter for orders */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400">Channel:</span>
                  <select
                    value={orderChannelFilter}
                    onChange={(e) => setOrderChannelFilter(e.target.value)}
                    className="bg-slate-100 border border-slate-200 rounded-xl py-1 px-2.5 text-xs text-slate-700 font-semibold focus:outline-hidden"
                  >
                    <option value="All">All Channels</option>
                    <option value="Facebook">Facebook</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Instagram">Instagram</option>
                    <option value="Daraz">Daraz</option>
                    <option value="CartUp">CartUp</option>
                    <option value="Packly">Packly</option>
                    <option value="Direct/WhatsApp">Direct / WhatsApp</option>
                  </select>
                </div>
              </div>

              {orderBreakdown.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <ShoppingBag size={36} className="mx-auto text-slate-300 mb-2" />
                  <h4 className="text-sm font-bold text-slate-700">No orders found for this selection</h4>
                  <p className="text-xs text-slate-400 mt-1">Try modifying your date or search filter.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[750px]">
                      <thead>
                        <tr className="bg-slate-100 text-[11px] font-mono font-black uppercase text-slate-600 tracking-wider border-b border-slate-200">
                          <th className="py-3 px-4">Order & Customer</th>
                          <th className="py-3 px-3">Sub-Brand & Channel</th>
                          <th className="py-3 px-3">Items Sold</th>
                          <th className="py-3 px-3 text-right">Order Sale Price</th>
                          <th className="py-3 px-3 text-right">Item Cost (কেনা দাম)</th>
                          <th className="py-3 px-4 text-right">Order Profit (লাভ)</th>
                          <th className="py-3 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {orderBreakdown.map((ord) => {
                          const isNegative = ord.grossProfit < 0;

                          return (
                            <tr key={ord.orderId} className="hover:bg-slate-50/80 transition-colors">
                              {/* Order & Customer */}
                              <td className="py-3 px-4">
                                <div className="font-mono font-black text-slate-900 text-xs">
                                  #{ord.orderId.substring(0, 8).toUpperCase()}
                                </div>
                                <div className="font-bold text-slate-800 text-xs mt-0.5">
                                  {ord.customerName}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {new Date(ord.createdAt).toLocaleDateString()}
                                </div>
                              </td>

                              {/* Sub-Brand & Channel */}
                              <td className="py-3 px-3">
                                <span className="inline-block font-mono text-[10px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded mr-1">
                                  {ord.subBrand}
                                </span>
                                <span className="text-xs text-slate-600 font-medium">
                                  {ord.salesChannel}
                                </span>
                              </td>

                              {/* Items Sold */}
                              <td className="py-3 px-3">
                                <div className="text-xs text-slate-700 font-medium max-w-xs">
                                  {ord.items.map((it, i) => (
                                    <div key={i} className="truncate text-xs">
                                      • <span className="font-bold">{it.qty}x</span> {it.name} <span className="text-slate-400 text-[10px]">({it.variant})</span>
                                    </div>
                                  ))}
                                </div>
                              </td>

                              {/* Order Sale Price */}
                              <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                                ৳{ord.totalAmount.toLocaleString()}
                              </td>

                              {/* Item Cost */}
                              <td className="py-3 px-3 text-right font-mono text-rose-600 text-xs font-semibold">
                                -৳{ord.orderCost.toLocaleString()}
                              </td>

                              {/* Order Profit */}
                              <td className="py-3 px-4 text-right font-mono font-black">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs ${
                                  isNegative 
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                }`}>
                                  {isNegative ? '-' : '+'}৳{Math.abs(ord.grossProfit).toLocaleString()}
                                </span>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  {Math.round(ord.profitMargin)}% margin
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-3 px-3 text-center">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  ord.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                                  ord.status === 'Shipped' ? 'bg-blue-100 text-blue-800' :
                                  ord.status === 'Confirmed' ? 'bg-indigo-100 text-indigo-800' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {ord.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BRAND & SALES CHANNEL BREAKDOWN */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              
              {/* Sub-Brands Profitability */}
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                  <Building size={16} className="text-indigo-600" />
                  Sub-Brand Profitability (ব্র্যান্ডভিত্তিক লাভ)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {channelAndBrandBreakdown.brands.map(b => {
                    const margin = b.revenue > 0 ? (b.profit / b.revenue) * 100 : 0;
                    return (
                      <div key={b.name} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-black text-sm text-slate-900 uppercase px-2 py-0.5 bg-white border border-slate-200 rounded-lg">
                            {b.name}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-500">
                            {b.ordersCount} orders
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-xs pt-1 border-t border-slate-200">
                          <div className="flex justify-between text-slate-600">
                            <span>Revenue:</span>
                            <strong className="text-slate-900">৳{b.revenue.toLocaleString()}</strong>
                          </div>
                          <div className="flex justify-between text-rose-600">
                            <span>Cost of Goods:</span>
                            <strong>-৳{b.cost.toLocaleString()}</strong>
                          </div>
                          <div className="flex justify-between text-emerald-700 font-bold pt-1 border-t border-slate-200 text-sm">
                            <span>Gross Profit:</span>
                            <span>৳{b.profit.toLocaleString()}</span>
                          </div>
                          <div className="text-right text-[10px] text-slate-400 font-semibold">
                            {Math.round(margin)}% Profit Margin
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sales Channels Profitability */}
              <div className="space-y-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                  <Layers size={16} className="text-amber-600" />
                  Sales Channel Profitability (চ্যানেলভিত্তিক লাভ)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {channelAndBrandBreakdown.channels.map(c => {
                    const margin = c.revenue > 0 ? (c.profit / c.revenue) * 100 : 0;
                    return (
                      <div key={c.name} className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-800">
                            {c.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {c.ordersCount} orders
                          </span>
                        </div>
                        <div className="space-y-1 font-mono text-xs pt-1 border-t border-slate-100">
                          <div className="flex justify-between text-slate-500">
                            <span>Sales:</span>
                            <span className="text-slate-800 font-bold">৳{c.revenue.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-rose-500 text-[11px]">
                            <span>Cost:</span>
                            <span>-৳{c.cost.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-emerald-600 font-bold pt-1 border-t border-slate-100">
                            <span>Profit:</span>
                            <span>৳{c.profit.toLocaleString()}</span>
                          </div>
                          <div className="text-right text-[10px] text-slate-400">
                            {Math.round(margin)}% margin
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}

          {/* TAB 4: EXPENSE DEDUCTIONS */}
          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                    <TrendingDown size={16} className="text-rose-600" />
                    Business Expenses Deducted (ব্যবসায়িক খরচ যা লাভ থেকে কর্তন করা হয়েছে)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    গ্রস প্রফিট (মোট লাভ) থেকে এই খরচের টাকাগুলো বাদ দিয়ে চূড়ান্ত নিট লাভ পাওয়া যায়
                  </p>
                </div>
                <div className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-xl border border-rose-200">
                  Total Deductions: -৳{totalExpensesAmt.toLocaleString()}
                </div>
              </div>

              {/* Profit Formula Card */}
              <div className="bg-slate-950 text-white p-4 rounded-2xl font-mono text-xs space-y-2">
                <div className="text-amber-400 font-bold text-[11px] uppercase tracking-wider">
                  Net Profit Calculation Formula (নিট লাভ নির্ণয়ের সমীকরণ):
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                  <span className="text-slate-300">Total Sales (৳{totalRevenue.toLocaleString()})</span>
                  <span className="text-rose-400 font-black">-</span>
                  <span className="text-rose-300">Product Cost (৳{totalCost.toLocaleString()})</span>
                  <span className="text-emerald-400 font-black">=</span>
                  <span className="text-emerald-300 font-bold">Gross Profit (৳{totalGrossProfit.toLocaleString()})</span>
                  <span className="text-amber-400 font-black">-</span>
                  <span className="text-amber-300">Total Expenses (৳{totalExpensesAmt.toLocaleString()})</span>
                  <span className="text-emerald-400 font-black">=</span>
                  <span className="text-white font-black bg-emerald-600 px-2 py-0.5 rounded">
                    Net Profit (৳{finalCalculatedNetProfit.toLocaleString()})
                  </span>
                </div>
              </div>

              {/* Category-wise Breakdown */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-[11px] font-mono font-black uppercase text-slate-600 tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-4">Expense Category (খরচের খাত)</th>
                      <th className="py-2.5 px-3 text-center">Entries</th>
                      <th className="py-2.5 px-4 text-right">Total Amount (টাকার পরিমাণ)</th>
                      <th className="py-2.5 px-4 text-right">% of Total Expenses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {expenseCategoryBreakdown.map((cat) => {
                      const pct = totalExpensesAmt > 0 ? (cat.amount / totalExpensesAmt) * 100 : 0;
                      return (
                        <tr key={cat.category} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-slate-800">
                            {cat.category}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-xs text-slate-500">
                            {cat.count} log{cat.count === 1 ? '' : 's'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-rose-600">
                            ৳{cat.amount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-500">
                            {Math.round(pct)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="bg-slate-50 px-5 sm:px-6 py-3 border-t border-slate-200 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info size={14} className="text-amber-500" />
            <span>Figures based on real order sale prices, product purchase costs, and logged expenses.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer shadow-xs"
          >
            Close (বন্ধ করুন)
          </button>
        </div>

      </div>
    </div>
  );
};
