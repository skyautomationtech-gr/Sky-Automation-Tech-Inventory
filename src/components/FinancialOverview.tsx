import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  FileText, 
  Upload, 
  X, 
  Filter, 
  ChevronRight, 
  AlertCircle,
  Eye,
  Info,
  Building,
  Users,
  Lightbulb,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { 
  getExpenses, 
  addExpense, 
  updateExpense, 
  deleteExpense, 
  getOrders, 
  getStockLogs 
} from '../firebase/db';
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UserProfile, Order, StockLog, Expense, ExpenseCategory } from '../types';

interface FinancialOverviewProps {
  user: UserProfile;
  products: any[];
  onRefreshData?: () => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'Rent',
  'Salary',
  'Utility Bill',
  'Marketing',
  'Courier/Delivery Charge',
  'Office Supplies',
  'Maintenance',
  'Other'
];

export default function FinancialOverview({ user, products, onRefreshData }: FinancialOverviewProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'overview' | 'expenses'>('overview');

  // Permission evaluation
  const canManageExpenses = useMemo(() => {
    return user.role === 'superadmin';
  }, [user]);

  // Master Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Global Filters (applies to summary calculation)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1); // Default to 1st of current month
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [subBrandFilter, setSubBrandFilter] = useState<'All' | 'SAT' | 'GZ' | 'RTX'>('All');

  // Expense-specific Ledger Filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState<string>('All');

  // Expense Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Other');
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formSubBrand, setFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | ''>('');
  const [formNotes, setFormNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // UI state for image light-box
  const [viewingReceiptUrl, setViewingReceiptUrl] = useState<string | null>(null);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all necessary financial information
  const loadFinancialData = async () => {
    setLoading(true);
    try {
      console.log("[FinancialOverview] Fetching master orders, logs, and expenses...");
      const [allOrders, allLogs, allExpenses] = await Promise.all([
        getOrders(),
        getStockLogs(),
        getExpenses()
      ]);

      setOrders(allOrders || []);
      setStockLogs(allLogs || []);
      setExpenses(allExpenses || []);
    } catch (err: any) {
      console.error("[FinancialOverview] Error loading financial datasets:", err);
      setErrorMsg("Failed to load financial information. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinancialData();
  }, []);

  // Recalculated values based on filters (applied to metrics)
  const financialMetrics = useMemo(() => {
    const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

    // 1. Income (sum of totalAmount from Confirmed/Packed/Shipped/Delivered Orders)
    const validStatuses = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];
    const filteredOrders = orders.filter(order => {
      const orderDate = order.createdAt;
      const dateInMatch = orderDate >= startMs && orderDate <= endMs;
      const statusMatch = validStatuses.includes(order.status);
      const subBrandMatch = subBrandFilter === 'All' || order.subBrand === subBrandFilter;
      return dateInMatch && statusMatch && subBrandMatch;
    });

    const totalIncome = filteredOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    // 2. Product Cost (sum of purchasePrice * quantity for stockLogs of type "in" in range)
    // If purchasePrice is missing on logs, fall back to product's current costPrice
    const productCostMap = new Map<string, number>();
    products.forEach(p => {
      productCostMap.set(p.id, p.costPrice || 0);
    });

    const filteredStockIns = stockLogs.filter(log => {
      const logDate = log.timestamp || 0;
      const dateInMatch = logDate >= startMs && logDate <= endMs;
      const typeMatch = log.type === 'in';
      
      // Determine product's sub-brand for filtering
      let subBrandMatch = true;
      if (subBrandFilter !== 'All') {
        const prod = products.find(p => p.id === log.productId);
        subBrandMatch = prod ? prod.subBrand === subBrandFilter : false;
      }

      return dateInMatch && typeMatch && subBrandMatch;
    });

    const totalProductCost = filteredStockIns.reduce((sum, log) => {
      const price = log.purchasePrice !== undefined ? log.purchasePrice : (productCostMap.get(log.productId) || 0);
      // qty in stock logs is absolute change (usually positive for "in" but let's take absolute just in case)
      const quantity = Math.abs(log.qty || 0);
      return sum + (price * quantity);
    }, 0);

    // 3. Other Business Expenses (from manually entered expenses)
    const filteredExpenses = expenses.filter(exp => {
      const expTime = new Date(exp.date + 'T00:00:00').getTime();
      const dateInMatch = expTime >= startMs && expTime <= endMs;
      const subBrandMatch = subBrandFilter === 'All' || exp.subBrand === subBrandFilter || exp.subBrand === '';
      return dateInMatch && subBrandMatch;
    });

    const totalExpenses = filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

    // 4. Net Profit/Loss
    const netProfit = totalIncome - totalProductCost - totalExpenses;

    // 5. Daily / Weekly / Monthly breakdown of income
    // Group orders in date range by day
    const incomeByDay: Record<string, number> = {};
    const subBrandTotals: Record<string, number> = { SAT: 0, GZ: 0, RTX: 0 };

    filteredOrders.forEach(order => {
      const orderDateStr = new Date(order.createdAt).toISOString().split('T')[0];
      incomeByDay[orderDateStr] = (incomeByDay[orderDateStr] || 0) + order.totalAmount;
      if (order.subBrand in subBrandTotals) {
        subBrandTotals[order.subBrand] += order.totalAmount;
      }
    });

    // Group expenses in date range by category
    const expenseByCategory: Record<string, number> = {};
    filteredExpenses.forEach(exp => {
      expenseByCategory[exp.category] = (expenseByCategory[exp.category] || 0) + exp.amount;
    });

    return {
      totalIncome,
      totalProductCost,
      totalExpenses,
      netProfit,
      incomeByDay,
      subBrandTotals,
      expenseByCategory,
      filteredOrdersCount: filteredOrders.length,
      filteredStockInsCount: filteredStockIns.length,
      filteredExpensesCount: filteredExpenses.length
    };
  }, [startDate, endDate, subBrandFilter, orders, stockLogs, expenses, products]);

  // Render variables for Expense Ledger (filtered by ledger controls)
  const filteredLedgerExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const searchLower = ledgerSearch.toLowerCase();
      const categoryMatch = ledgerCategory === 'All' || exp.category === ledgerCategory;
      const textMatch = !ledgerSearch || 
                        exp.category.toLowerCase().includes(searchLower) || 
                        (exp.notes && exp.notes.toLowerCase().includes(searchLower)) ||
                        (exp.createdBy && exp.createdBy.toLowerCase().includes(searchLower)) ||
                        exp.amount.toString().includes(searchLower);
      
      const subBrandMatch = subBrandFilter === 'All' || exp.subBrand === subBrandFilter || exp.subBrand === '';
      return categoryMatch && textMatch && subBrandMatch;
    });
  }, [expenses, ledgerSearch, ledgerCategory, subBrandFilter]);

  // Handle Edit Action
  const handleEditExpenseClick = (expense: Expense) => {
    if (!canManageExpenses) return;
    setEditingExpense(expense);
    setFormCategory(expense.category);
    setFormAmount(expense.amount);
    setFormDate(expense.date);
    setFormSubBrand(expense.subBrand || '');
    setFormNotes(expense.notes || '');
    setReceiptUrl(expense.receiptUrl || '');
    setReceiptFile(null);
    setShowAddForm(true);
    setActiveTab('expenses');
  };

  // Handle Delete Action
  const handleDeleteExpenseClick = (id: string, category: string, amount: number) => {
    if (!canManageExpenses) return;
    if (confirm(`Are you sure you want to permanently delete this expense of ৳${amount} for ${category}?`)) {
      setLoading(true);
      deleteExpense(id)
        .then(() => {
          setSuccessMsg("Expense deleted successfully.");
          loadFinancialData();
          if (onRefreshData) onRefreshData();
          setTimeout(() => setSuccessMsg(''), 3000);
        })
        .catch(err => {
          setErrorMsg(`Delete failed: ${err.message || err}`);
          setTimeout(() => setErrorMsg(''), 3000);
        })
        .finally(() => setLoading(false));
    }
  };

  // Submit Expense Form (Add / Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageExpenses) return;
    if (!formAmount || Number(formAmount) <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalReceiptUrl = receiptUrl;

      // Photo upload
      if (receiptFile) {
        const fileExtension = receiptFile.name.split('.').pop();
        const timestamp = Date.now();
        const path = `receipts/${timestamp}_${Math.random().toString(36).substring(2, 7)}.${fileExtension}`;
        
        try {
          if (storage) {
            console.log("[FinancialOverview] Uploading receipt file to Storage:", path);
            const storageRef = ref(storage, path);
            const uploadResult = await uploadBytes(storageRef, receiptFile);
            finalReceiptUrl = await getDownloadURL(uploadResult.ref);
            console.log("[FinancialOverview] Receipt uploaded successfully:", finalReceiptUrl);
          } else {
            console.warn("[FinancialOverview] Firebase Storage is not available, falling back to Base64 serialization.");
            finalReceiptUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(receiptFile);
            });
          }
        } catch (uploadError) {
          console.error("[FinancialOverview] Upload failed, converting to Base64 local asset...", uploadError);
          finalReceiptUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(receiptFile);
          });
        }
      }

      const expensePayload = {
        category: formCategory,
        amount: Number(formAmount),
        date: formDate,
        subBrand: formSubBrand || '',
        notes: formNotes.trim(),
        receiptUrl: finalReceiptUrl,
        createdBy: user.name || user.email || 'Admin',
        createdAt: editingExpense ? editingExpense.createdAt : Date.now()
      };

      if (editingExpense) {
        console.log("[FinancialOverview] Updating existing expense ID:", editingExpense.id);
        await updateExpense(editingExpense.id, expensePayload);
        setSuccessMsg("Expense record updated successfully.");
      } else {
        console.log("[FinancialOverview] Creating new expense record in database...");
        await addExpense(expensePayload);
        setSuccessMsg("New expense record saved successfully.");
      }

      // Reset form & state
      setShowAddForm(false);
      setEditingExpense(null);
      setFormAmount('');
      setFormNotes('');
      setReceiptFile(null);
      setReceiptUrl('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      await loadFinancialData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("[FinancialOverview] Submit failed:", err);
      setErrorMsg(`Failed to save expense details: ${err.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setReceiptFile(e.target.files[0]);
    }
  };

  // Quick preset ranges
  const setPresetRange = (rangeType: 'thisMonth' | 'last30Days' | 'thisYear') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (rangeType === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (rangeType === 'last30Days') {
      const start = new Date();
      start.setDate(today.getDate() - 30);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (rangeType === 'thisYear') {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    }
  };

  // Custom Chart Builders (Generates responsive SVG curves or grid bars)
  const renderSVGDonut = () => {
    const categoriesWithVal = CATEGORIES.map(cat => ({
      name: cat,
      val: financialMetrics.expenseByCategory[cat] || 0
    })).filter(c => c.val > 0);

    const totalExp = categoriesWithVal.reduce((sum, c) => sum + c.val, 0);

    if (totalExp === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
          <Info size={28} className="text-slate-300 mb-2" />
          <p className="text-xs">No expenses entered for this timeframe.</p>
        </div>
      );
    }

    const colors = [
      '#EF4444', // Red (Rent/Salary)
      '#3B82F6', // Blue (Utility)
      '#10B981', // Green (Marketing)
      '#F59E0B', // Amber (Courier)
      '#8B5CF6', // Purple (Supplies)
      '#EC4899', // Pink (Maintenance)
      '#06B6D4', // Cyan (Other)
      '#64748B'  // Slate
    ];

    let accumulatedPercentage = 0;
    const segments = categoriesWithVal.map((item, idx) => {
      const percentage = (item.val / totalExp) * 100;
      const startPercentage = accumulatedPercentage;
      accumulatedPercentage += percentage;
      return {
        ...item,
        percentage,
        startPercentage,
        color: colors[idx % colors.length]
      };
    });

    return (
      <div className="flex flex-col md:flex-row items-center gap-6 py-2">
        <div className="relative w-40 h-40 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {segments.map((seg, i) => {
              // Stroke calculations
              const r = 35;
              const circ = 2 * Math.PI * r;
              const strokeLength = (seg.percentage / 100) * circ;
              const strokeOffset = circ - ((seg.startPercentage / 100) * circ);

              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="transparent"
                  stroke={seg.color}
                  strokeWidth="15"
                  strokeDasharray={`${strokeLength} ${circ}`}
                  strokeDashoffset={strokeOffset}
                  className="transition-all duration-300 hover:stroke-[18px] cursor-pointer"
                  title={`${seg.name}: ৳${seg.val.toLocaleString()}`}
                />
              );
            })}
            <circle cx="50" cy="50" r="24" fill="white" />
          </svg>
          <div className="absolute text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</p>
            <p className="text-sm font-extrabold text-slate-800">৳{totalExp.toLocaleString()}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-1.5 w-full max-h-52 overflow-y-auto pr-1">
          {segments.map((seg, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-slate-600 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: seg.color }}></span>
                {seg.name}
              </span>
              <span className="font-mono text-slate-800 font-semibold">
                ৳{seg.val.toLocaleString()} <span className="text-slate-400 font-normal">({Math.round(seg.percentage)}%)</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSVGIncomeCurve = () => {
    // Sort keys chronologically
    const sortedDates = Object.keys(financialMetrics.incomeByDay).sort();
    if (sortedDates.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
          <TrendingUp size={28} className="text-slate-300 mb-2 animate-pulse" />
          <p className="text-xs">No active sales recorded for this timeframe.</p>
        </div>
      );
    }

    const values = sortedDates.map(d => financialMetrics.incomeByDay[d]);
    const maxVal = Math.max(...values, 1000);

    // Build SVG polyline points
    const width = 500;
    const height = 150;
    const padding = 20;

    const points = sortedDates.map((date, idx) => {
      const x = padding + (idx / (sortedDates.length - 1 || 1)) * (width - padding * 2);
      const y = height - padding - (financialMetrics.incomeByDay[date] / maxVal) * (height - padding * 2);
      return `${x},${y}`;
    }).join(' ');

    const polylinePoints = points;
    const fillPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

    return (
      <div className="w-full">
        <svg className="w-full h-36" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {/* Horizontal Grid lines */}
          <line x1={padding} y1={height/2} x2={width-padding} y2={height/2} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
          
          {/* Fill Area */}
          <polygon points={fillPoints} fill="url(#chartGradient)" />

          {/* Spark Line */}
          <polyline
            fill="transparent"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />

          {/* Points */}
          {sortedDates.map((date, idx) => {
            const x = padding + (idx / (sortedDates.length - 1 || 1)) * (width - padding * 2);
            const y = height - padding - (financialMetrics.incomeByDay[date] / maxVal) * (height - padding * 2);
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r="3.5"
                className="fill-white stroke-emerald-500 stroke-2 hover:r-5 cursor-pointer transition-all"
                title={`${date}: ৳${financialMetrics.incomeByDay[date].toLocaleString()}`}
              />
            );
          })}
        </svg>

        {/* X Axis Labels */}
        <div className="flex justify-between px-4 mt-1 text-[10px] font-bold text-slate-400 font-mono">
          <span>{sortedDates[0]}</span>
          {sortedDates.length > 2 && <span>{sortedDates[Math.floor(sortedDates.length / 2)]}</span>}
          <span>{sortedDates[sortedDates.length - 1]}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xs relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-10 translate-y-10">
          <DollarSign size={280} className="text-emerald-400" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3">
              <TrendingUp size={12} /> Financial Operations
            </div>
            <h1 className="text-xl lg:text-2xl font-black tracking-tight font-sans">INCOME & EXPENSE</h1>
            <p className="text-xs text-slate-400 max-w-xl mt-1 leading-relaxed">
              Consolidated financial tracking across operations. Analyzes real-time sales revenue, product purchase cost logs, and other administrative expenses.
            </p>
          </div>
          
          {/* Tabs switch */}
          <div className="bg-slate-800/80 p-1.5 rounded-2xl flex border border-slate-700/50 self-start">
            <button
              onClick={() => { setActiveTab('overview'); setShowAddForm(false); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'overview'
                  ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => { setActiveTab('expenses'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'expenses'
                  ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Expenses Ledger
            </button>
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setPresetRange('thisMonth')} 
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs text-slate-600 font-bold transition-colors border border-slate-100"
          >
            This Month
          </button>
          <button 
            onClick={() => setPresetRange('last30Days')} 
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs text-slate-600 font-bold transition-colors border border-slate-100"
          >
            Last 30 Days
          </button>
          <button 
            onClick={() => setPresetRange('thisYear')} 
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs text-slate-600 font-bold transition-colors border border-slate-100"
          >
            This Year
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          {/* Start Date */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">From</label>
            <div className="relative">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-hidden"
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">To</label>
            <div className="relative">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-hidden"
              />
            </div>
          </div>

          {/* Sub-brand selector */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">Sub-Brand</label>
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-2.5 text-xs text-slate-700 font-semibold focus:outline-hidden"
            >
              <option value="All">All Brands</option>
              <option value="SAT">Sky Auto (SAT)</option>
              <option value="GZ">GadgetZu (GZ)</option>
              <option value="RTX">RTX Gadget (RTX)</option>
            </select>
          </div>

          {/* Sync Trigger */}
          <button
            onClick={loadFinancialData}
            title="Reload financial records"
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl p-2 flex items-center justify-center border border-slate-200 transition-all h-9"
          >
            <svg className="w-4 h-4 animate-spin-slow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.89M9 17h.01" />
            </svg>
          </button>
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 text-xs font-semibold animate-slide-up">
          <CheckCircle2 size={18} className="text-emerald-500" />
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-800 text-xs font-semibold animate-slide-up">
          <AlertCircle size={18} className="text-red-500" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* VIEW 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Sales Revenue Card */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs relative overflow-hidden flex flex-col justify-between h-36">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sales Revenue</span>
                <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp size={16} /></span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 font-mono">
                  ৳{financialMetrics.totalIncome.toLocaleString()}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  Auto-calculated from <span className="font-semibold text-slate-600">{financialMetrics.filteredOrdersCount}</span> confirmed orders
                </p>
              </div>
            </div>

            {/* Product Costs Card */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs relative overflow-hidden flex flex-col justify-between h-36">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Cost</span>
                <span className="p-2 bg-amber-50 text-amber-600 rounded-xl"><TrendingDown size={16} /></span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 font-mono">
                  ৳{financialMetrics.totalProductCost.toLocaleString()}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  From <span className="font-semibold text-slate-600">{financialMetrics.filteredStockInsCount}</span> Stock In operations
                </p>
              </div>
            </div>

            {/* Other Expenses Card */}
            <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs relative overflow-hidden flex flex-col justify-between h-36">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Other Expenses</span>
                <span className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Building size={16} /></span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black text-slate-900 font-mono">
                  ৳{financialMetrics.totalExpenses.toLocaleString()}
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 font-sans">
                  From <span className="font-semibold text-slate-600">{financialMetrics.filteredExpensesCount}</span> ledger entries
                </p>
              </div>
            </div>

            {/* Net Profit Card */}
            <div className={`p-5 rounded-3xl border shadow-xs relative overflow-hidden flex flex-col justify-between h-36 transition-all ${
              financialMetrics.netProfit >= 0 
                ? 'bg-emerald-50/50 border-emerald-100/80 text-emerald-900' 
                : 'bg-red-50/50 border-red-100/80 text-red-900'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Net Profit / Loss</span>
                <span className={`p-2 rounded-xl ${
                  financialMetrics.netProfit >= 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                }`}>
                  <DollarSign size={16} />
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-black font-mono">
                  {financialMetrics.netProfit < 0 ? '-' : ''}৳{Math.abs(financialMetrics.netProfit).toLocaleString()}
                </h3>
                <p className="text-[10px] mt-1 font-semibold flex items-center gap-1">
                  {financialMetrics.netProfit >= 0 ? (
                    <span className="text-emerald-700 flex items-center gap-0.5">
                      <TrendingUp size={12} strokeWidth={3} /> Positive Margin ({Math.round((financialMetrics.netProfit / (financialMetrics.totalIncome || 1)) * 100)}%)
                    </span>
                  ) : (
                    <span className="text-red-700 flex items-center gap-0.5">
                      <TrendingDown size={12} strokeWidth={3} /> Negative Margin ({Math.round((financialMetrics.netProfit / (financialMetrics.totalIncome || 1)) * 100)}%)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Analytical Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-tight">Revenue Timeline</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Plotting sales revenue chronologically within current range</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-sm">
                    Avg ৳{Math.round(financialMetrics.totalIncome / (Object.keys(financialMetrics.incomeByDay).length || 1)).toLocaleString()} / Day
                  </span>
                </div>
              </div>
              <div className="pt-2">
                {renderSVGIncomeCurve()}
              </div>
            </div>

            {/* Expenses Distribution */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div>
                  <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-tight">Expenses Distribution</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Interactive proportional share of overhead categories</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono font-bold text-red-600 bg-red-50 px-2 py-1 rounded-sm">
                    Overhead: {Math.round((financialMetrics.totalExpenses / (financialMetrics.totalIncome || 1)) * 100)}%
                  </span>
                </div>
              </div>
              <div className="pt-2">
                {renderSVGDonut()}
              </div>
            </div>
          </div>

          {/* Sub-brand Breakdown */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6 shadow-2xs">
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-tight">Operational Sub-brand Breakdown</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Sales performance segmented per business entity</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* SAT */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-black text-slate-700">SKY AUTOMATION</span>
                    <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-sm">SAT</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.SAT.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.SAT / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>

              {/* GZ */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-black text-slate-700">GADGETZU</span>
                    <span className="text-[10px] font-mono font-bold bg-teal-500/10 text-teal-600 border border-teal-500/20 px-2 py-0.5 rounded-sm">GZ</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.GZ.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.GZ / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>

              {/* RTX */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-black text-slate-700">RTX GADGET</span>
                    <span className="text-[10px] font-mono font-bold bg-orange-500/10 text-orange-500 border border-orange-500/20 px-2 py-0.5 rounded-sm">RTX</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.RTX.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.RTX / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Expenses Ledger & Entry */}
      {activeTab === 'expenses' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Form to enter expenses (Shown for eligible staff, conditionally rendered) */}
          <div className="xl:col-span-1 space-y-4">
            <div className="bg-white p-5 lg:p-6 rounded-3xl border border-slate-100 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                    {editingExpense ? 'Modify Expense Record' : 'Log New Expense'}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {editingExpense ? 'Amend incorrect operational entries' : 'Manually register miscellaneous expenses'}
                  </p>
                </div>
                {editingExpense && (
                  <button 
                    onClick={() => {
                      setEditingExpense(null);
                      setFormAmount('');
                      setFormNotes('');
                    }}
                    className="text-xs font-bold text-red-500 hover:underline flex items-center gap-0.5"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>

              {canManageExpenses ? (
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* Category */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Expense Category</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-800 font-semibold focus:outline-hidden focus:border-slate-200"
                      required
                    >
                      {CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Amount (৳)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 5000"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-slate-200"
                      required
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Transaction Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-slate-200 font-medium"
                      required
                    />
                  </div>

                  {/* Sub-brand attachment (optional) */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Allocate to Sub-Brand (Optional)</label>
                    <select
                      value={formSubBrand}
                      onChange={(e) => setFormSubBrand(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-slate-200 font-medium"
                    >
                      <option value="">Shared Across All Brands</option>
                      <option value="SAT">Sky Auto (SAT)</option>
                      <option value="GZ">GadgetZu (GZ)</option>
                      <option value="RTX">RTX Gadget (RTX)</option>
                    </select>
                  </div>

                  {/* Notes/Description */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight mb-1.5">Notes / Description</label>
                    <textarea
                      placeholder="Add brief details about the expense..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-slate-200 resize-none"
                    />
                  </div>

                  {/* Attachment/Receipt (Optional file upload) */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-tight">Receipt / Proof (Optional)</label>
                    
                    {receiptUrl && !receiptFile ? (
                      <div className="flex items-center justify-between p-2 rounded-xl border border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                          <ImageIcon size={12} /> Existing Receipt Attached
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewingReceiptUrl(receiptUrl)}
                            className="text-xs font-bold text-teal-600 hover:underline"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => setReceiptUrl('')}
                            className="p-1 bg-red-50 text-red-500 rounded-xs hover:bg-red-100"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 hover:bg-slate-100/50 transition-colors relative cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Upload size={16} className="text-slate-400 mb-1" />
                        <span className="text-[10px] text-slate-500 font-semibold">
                          {receiptFile ? receiptFile.name : 'Choose receipt image'}
                        </span>
                        <span className="text-[8px] text-slate-400">Max size 5MB</span>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#D4AF37] hover:bg-[#c39e2d] text-slate-950 font-black tracking-tight rounded-xl py-3 text-xs transition-colors flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Saving Record...
                      </>
                    ) : (
                      <>
                        <Plus size={14} /> {editingExpense ? 'Update Expense' : 'Record Expense'}
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-center text-xs text-red-800 space-y-2">
                  <AlertCircle className="mx-auto text-red-500" size={24} />
                  <p className="font-bold">Access Restrained</p>
                  <p className="text-[10px]">Your current credentials do not have permissions to record expenses. This action is restricted to Super Admins only.</p>
                </div>
              )}
            </div>
          </div>

          {/* Expenses List View Ledger */}
          <div className="xl:col-span-2 space-y-4">
            <div className="bg-white p-5 lg:p-6 rounded-3xl border border-slate-100 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-50 pb-4">
                <div>
                  <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight">Overhead Expense Ledger</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Detailed audit trail of administrative investments</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  {/* Search bar */}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
                    <input
                      type="text"
                      placeholder="Search ledger..."
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      className="bg-slate-50 border border-slate-100 rounded-xl py-1.5 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>

                  {/* Category select */}
                  <select
                    value={ledgerCategory}
                    onChange={(e) => setLedgerCategory(e.target.value)}
                    className="bg-slate-50 border border-slate-100 rounded-xl py-1.5 px-2.5 text-xs text-slate-700 font-semibold focus:outline-hidden"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary of listed ledger rows */}
              <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-600">
                  Showing {filteredLedgerExpenses.length} expense record(s)
                </span>
                <span className="font-mono font-bold text-slate-800 text-sm">
                  Total listed: ৳{filteredLedgerExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}
                </span>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                      <th className="py-3 px-2">Date</th>
                      <th className="py-3 px-2">Category</th>
                      <th className="py-3 px-2">Allocation</th>
                      <th className="py-3 px-2 text-right">Amount</th>
                      <th className="py-3 px-2">Description</th>
                      <th className="py-3 px-2 text-center">Receipt</th>
                      <th className="py-3 px-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLedgerExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                          No matching expense records found.
                        </td>
                      </tr>
                    ) : (
                      filteredLedgerExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Date */}
                          <td className="py-3.5 px-2 font-mono text-slate-700 whitespace-nowrap">{exp.date}</td>
                          
                          {/* Category */}
                          <td className="py-3.5 px-2 font-bold text-slate-800">
                            <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px]">
                              {exp.category}
                            </span>
                          </td>
                          
                          {/* Sub-Brand allocation */}
                          <td className="py-3.5 px-2 whitespace-nowrap">
                            {exp.subBrand ? (
                              <span className={`inline-block text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded-sm ${
                                exp.subBrand === 'SAT' 
                                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                  : exp.subBrand === 'GZ' 
                                    ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20' 
                                    : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                              }`}>
                                {exp.subBrand}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Shared</span>
                            )}
                          </td>
                          
                          {/* Amount */}
                          <td className="py-3.5 px-2 text-right font-black text-slate-800 font-mono">
                            ৳{exp.amount.toLocaleString()}
                          </td>
                          
                          {/* Notes */}
                          <td className="py-3.5 px-2 max-w-[150px] truncate text-slate-600" title={exp.notes}>
                            {exp.notes || <span className="text-slate-300 italic">No description</span>}
                          </td>

                          {/* Receipt */}
                          <td className="py-3.5 px-2 text-center whitespace-nowrap">
                            {exp.receiptUrl ? (
                              <button
                                onClick={() => setViewingReceiptUrl(exp.receiptUrl || null)}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:underline"
                              >
                                <Eye size={12} /> View
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">None</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-2 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditExpenseClick(exp)}
                                disabled={!canManageExpenses}
                                title="Edit Operational Expense"
                                className="p-1 bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 rounded-sm disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <Edit size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteExpenseClick(exp.id, exp.category, exp.amount)}
                                disabled={!canManageExpenses}
                                title="Permanently Delete Operational Expense"
                                className="p-1 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-sm disabled:opacity-30 disabled:pointer-events-none"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL: View attached receipt */}
      {viewingReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-xs">
          <div className="relative max-w-3xl w-full flex flex-col gap-3">
            <button
              onClick={() => setViewingReceiptUrl(null)}
              className="absolute -top-10 right-0 bg-slate-900 border border-slate-700 text-white p-2 rounded-full hover:bg-slate-800 transition-colors"
            >
              <X size={16} />
            </button>
            <div className="bg-white rounded-3xl overflow-hidden p-3 border border-slate-800 shadow-2xl flex items-center justify-center max-h-[75vh]">
              <img
                src={viewingReceiptUrl}
                alt="Expense Invoice/Receipt"
                className="max-w-full max-h-[70vh] object-contain rounded-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="text-center text-xs text-slate-400">
              Receipt document viewer. Referrer policy secured.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
