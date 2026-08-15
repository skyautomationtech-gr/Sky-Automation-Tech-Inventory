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
  Image as ImageIcon,
  Download,
  Sparkles,
  PlusCircle,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard,
  Tag,
  Package,
  Layers,
  Check
} from 'lucide-react';
import { 
  getExpenses, 
  addExpense, 
  updateExpense, 
  deleteExpense, 
  generateExpenseId,
  getIncomes,
  addIncome,
  updateIncome,
  deleteIncome,
  generateIncomeId,
  getOrders, 
  getStockLogs 
} from '../firebase/db';
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  UserProfile, 
  Order, 
  StockLog, 
  Expense, 
  ExpenseCategory, 
  ExpensePaymentMethod,
  Income, 
  IncomeCategory, 
  IncomePaymentMethod 
} from '../types';

interface FinancialOverviewProps {
  user: UserProfile;
  products: any[];
  onRefreshData?: () => void;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Product Purchase',
  'Supplier Delivery/Transport',
  'Packaging',
  'Warehouse/Rent',
  'Electricity',
  'Internet',
  'Mobile/Phone Bill',
  'Staff Salary',
  'Courier/Delivery Expense',
  'Facebook/Instagram Ads',
  'Marketing/Design',
  'Software/Subscription',
  'Equipment/Repair',
  'Bank/MFS Charge',
  'Supplier Payment',
  'Customer Refund',
  'Other Expense',
  // legacy categories for backward compatibility
  'Rent',
  'Salary',
  'Utility Bill',
  'Marketing',
  'Courier/Delivery Charge',
  'Office Supplies',
  'Maintenance',
  'Other'
];

export const EXPENSE_CATEGORY_CONFIG: { id: ExpenseCategory; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { id: 'Product Purchase', label: 'Product Purchase', icon: '📦', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'Supplier Delivery/Transport', label: 'Supplier Delivery/Transport', icon: '🚚', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'Packaging', label: 'Packaging', icon: '📦', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'Warehouse/Rent', label: 'Warehouse/Rent', icon: '🏪', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'Electricity', label: 'Electricity', icon: '⚡', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  { id: 'Internet', label: 'Internet', icon: '🌐', color: 'text-cyan-700', bg: 'bg-cyan-50', border: 'border-cyan-200' },
  { id: 'Mobile/Phone Bill', label: 'Mobile/Phone Bill', icon: '📱', color: 'text-sky-700', bg: 'bg-sky-50', border: 'border-sky-200' },
  { id: 'Staff Salary', label: 'Staff Salary', icon: '👨‍💼', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'Courier/Delivery Expense', label: 'Courier/Delivery Expense', icon: '🛵', color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  { id: 'Facebook/Instagram Ads', label: 'Facebook/Instagram Ads', icon: '📢', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200' },
  { id: 'Marketing/Design', label: 'Marketing/Design', icon: '🎨', color: 'text-pink-700', bg: 'bg-pink-50', border: 'border-pink-200' },
  { id: 'Software/Subscription', label: 'Software/Subscription', icon: '🧾', color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-200' },
  { id: 'Equipment/Repair', label: 'Equipment/Repair', icon: '🛠️', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-300' },
  { id: 'Bank/MFS Charge', label: 'Bank/MFS Charge', icon: '🏦', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  { id: 'Supplier Payment', label: 'Supplier Payment', icon: '💰', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' },
  { id: 'Customer Refund', label: 'Customer Refund', icon: '🔄', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'Other Expense', label: 'Other Expense', icon: '📝', color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }
];

export const EXPENSE_PAYMENT_METHODS: { id: ExpensePaymentMethod; label: string; icon: string; bg: string; text: string; border: string }[] = [
  { id: 'bKash', label: 'bKash', icon: '🌸', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  { id: 'Nagad', label: 'Nagad', icon: '🔶', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { id: 'Rocket', label: 'Rocket', icon: '🟣', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { id: 'Bank', label: 'Bank Transfer', icon: '🏛️', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { id: 'Upay', label: 'Upay', icon: '🟡', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { id: 'Cash', label: 'Cash', icon: '💵', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { id: 'Other', label: 'Other', icon: '💳', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }
];

export const INCOME_CATEGORY_CONFIG: { id: IncomeCategory; label: string; icon: string; color: string; bg: string; border: string }[] = [
  { id: 'Product Sale', label: 'Product Sale', icon: '🛒', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'Delivery/Courier Income', label: 'Delivery/Courier Income', icon: '🚚', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'Digital Service / Top-up', label: 'Digital Service / Top-up', icon: '💎', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'Other Income', label: 'Other Income', icon: '💳', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  { id: 'Customer Refund Received', label: 'Customer Refund Received', icon: '↩️', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  { id: 'Other Business Income', label: 'Other Business Income', icon: '📦', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200' }
];

export const PAYMENT_METHODS: { id: IncomePaymentMethod; label: string; icon: string; bg: string; text: string; border: string }[] = [
  { id: 'Cash', label: 'Cash', icon: '💵', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { id: 'bKash', label: 'bKash', icon: '🌸', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  { id: 'Nagad', label: 'Nagad', icon: '🔶', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  { id: 'Rocket', label: 'Rocket', icon: '🟣', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { id: 'Bank', label: 'Bank Transfer', icon: '🏛️', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { id: 'Other', label: 'Other', icon: '💳', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' }
];

export default function FinancialOverview({ user, products, onRefreshData }: FinancialOverviewProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<'overview' | 'income' | 'expenses'>('overview');

  // Permission evaluation
  const canManageFinances = useMemo(() => {
    return user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager';
  }, [user]);

  // Master Data States
  const [orders, setOrders] = useState<Order[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
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

  // Income Ledger Filters
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeCategoryFilter, setIncomeCategoryFilter] = useState<string>('All');
  const [incomePaymentFilter, setIncomePaymentFilter] = useState<string>('All');
  const [incomeSourceFilter, setIncomeSourceFilter] = useState<'All' | 'auto_sale' | 'manual'>('All');

  // Expense-specific Ledger Filters
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState<string>('All');
  const [ledgerPaymentFilter, setLedgerPaymentFilter] = useState<string>('All');

  // Income Modal State
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [incomeFormId, setIncomeFormId] = useState('');
  const [incomeFormCategory, setIncomeFormCategory] = useState<IncomeCategory>('Other Income');
  const [incomeFormAmount, setIncomeFormAmount] = useState<number | ''>('');
  const [incomeFormDate, setIncomeFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [incomeFormTime, setIncomeFormTime] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  const [incomeFormPaymentMethod, setIncomeFormPaymentMethod] = useState<IncomePaymentMethod>('Cash');
  const [incomeFormCustomerName, setIncomeFormCustomerName] = useState('');
  const [incomeFormInvoiceNo, setIncomeFormInvoiceNo] = useState('');
  const [incomeFormReference, setIncomeFormReference] = useState('');
  const [incomeFormSubBrand, setIncomeFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL' | ''>('');
  const [incomeFormNotes, setIncomeFormNotes] = useState('');
  const [isSubmittingIncome, setIsSubmittingIncome] = useState(false);

  // Expense Modal & Form State
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseFormId, setExpenseFormId] = useState('');
  const [expenseFormCategory, setExpenseFormCategory] = useState<ExpenseCategory>('Product Purchase');
  const [expenseFormAmount, setExpenseFormAmount] = useState<number | ''>('');
  const [expenseFormDate, setExpenseFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expenseFormTime, setExpenseFormTime] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  const [expenseFormPaymentMethod, setExpenseFormPaymentMethod] = useState<ExpensePaymentMethod>('bKash');
  const [expenseFormSupplierName, setExpenseFormSupplierName] = useState('');
  const [expenseFormReference, setExpenseFormReference] = useState('');
  const [expenseFormInvoiceNo, setExpenseFormInvoiceNo] = useState('');
  const [expenseFormSubBrand, setExpenseFormSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL' | ''>('');
  const [expenseFormNotes, setExpenseFormNotes] = useState('');
  const [expenseReceiptFile, setExpenseReceiptFile] = useState<File | null>(null);
  const [expenseReceiptUrl, setExpenseReceiptUrl] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
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
      const [allOrders, allLogs, allExpenses, allIncomes] = await Promise.all([
        getOrders(),
        getStockLogs(),
        getExpenses(),
        getIncomes()
      ]);

      setOrders(allOrders || []);
      setStockLogs(allLogs || []);
      setExpenses(allExpenses || []);
      setIncomes(allIncomes || []);
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

  // Quick preset ranges
  const setPresetRange = (rangeType: 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'allTime') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (rangeType === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (rangeType === 'thisWeek') {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (rangeType === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (rangeType === 'lastMonth') {
      const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(firstDayLastMonth.toISOString().split('T')[0]);
      setEndDate(lastDayLastMonth.toISOString().split('T')[0]);
    } else if (rangeType === 'thisYear') {
      const firstDay = new Date(today.getFullYear(), 0, 1);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (rangeType === 'allTime') {
      setStartDate('2024-01-01');
      setEndDate(todayStr);
    }
  };

  // Convert Sales Orders to Automatic Income items
  const autoSalesIncomes = useMemo(() => {
    const validStatuses = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];
    
    return orders
      .filter(order => validStatuses.includes(order.status) || order.amountPaid > 0)
      .map(order => {
        const orderDateStr = new Date(order.createdAt).toISOString().split('T')[0];
        const orderTimeStr = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const effectiveAmount = (order.amountPaid && order.amountPaid > 0) ? order.amountPaid : order.totalAmount;
        
        let pMethod: IncomePaymentMethod = 'Cash';
        if (order.paymentMethod === 'bKash') pMethod = 'bKash';
        else if (order.paymentMethod === 'Nagad') pMethod = 'Nagad';
        else if (order.paymentMethod === 'Bank Transfer') pMethod = 'Bank';
        else if (order.paymentMethod) pMethod = order.paymentMethod as any;

        const autoIncome: Income = {
          id: `order_${order.id}`,
          incomeId: order.invoiceId || `ORD-${order.id.slice(-6).toUpperCase()}`,
          category: 'Product Sale',
          amount: effectiveAmount || 0,
          date: orderDateStr,
          time: orderTimeStr,
          paymentMethod: pMethod,
          customerName: order.customerName || 'Direct Customer',
          invoiceNo: order.invoiceId || order.id,
          reference: order.courierTrackingNumber || '',
          notes: `Sales Channel: ${order.salesChannel || 'Direct'} | Courier: ${order.courier || 'N/A'} | Status: ${order.status}`,
          subBrand: order.subBrand || '',
          addedBy: order.createdBy || 'Sales System (Auto)',
          createdAt: order.createdAt,
          source: 'order_sale',
          orderId: order.id
        };

        return autoIncome;
      });
  }, [orders]);

  // Combined Incomes (Auto Sales + Manual Incomes)
  const allCombinedIncomes = useMemo(() => {
    return [...incomes, ...autoSalesIncomes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [incomes, autoSalesIncomes]);

  // Recalculated values based on filters (applied to metrics)
  const financialMetrics = useMemo(() => {
    const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

    // 1. Filtered Incomes
    const filteredIncomes = allCombinedIncomes.filter(inc => {
      const incTime = inc.createdAt || new Date(inc.date + 'T00:00:00').getTime();
      const dateMatch = incTime >= startMs && incTime <= endMs;
      const subBrandMatch = subBrandFilter === 'All' || inc.subBrand === subBrandFilter || inc.subBrand === 'ALL' || inc.subBrand === '';
      return dateMatch && subBrandMatch;
    });

    const totalIncome = filteredIncomes.reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const totalSalesIncome = filteredIncomes
      .filter(inc => inc.source === 'order_sale' || inc.category === 'Product Sale')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const totalManualIncome = filteredIncomes
      .filter(inc => inc.source === 'manual')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    // 2. Product Cost (sum of purchasePrice * quantity for stockLogs of type "in" in range)
    const productCostMap = new Map<string, number>();
    products.forEach(p => {
      productCostMap.set(p.id, p.costPrice || 0);
    });

    const filteredStockIns = stockLogs.filter(log => {
      const logDate = log.timestamp || 0;
      const dateInMatch = logDate >= startMs && logDate <= endMs;
      const typeMatch = log.type === 'in';
      
      let subBrandMatch = true;
      if (subBrandFilter !== 'All') {
        const prod = products.find(p => p.id === log.productId);
        subBrandMatch = prod ? prod.subBrand === subBrandFilter : false;
      }

      return dateInMatch && typeMatch && subBrandMatch;
    });

    const totalProductCost = filteredStockIns.reduce((sum, log) => {
      const price = log.purchasePrice !== undefined ? log.purchasePrice : (productCostMap.get(log.productId) || 0);
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
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    // 5. Today & This Month Calculations
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Apply subBrand filter for today & month calculations
    const subBrandIncomes = allCombinedIncomes.filter(inc => {
      return subBrandFilter === 'All' || inc.subBrand === subBrandFilter || inc.subBrand === 'ALL' || inc.subBrand === '';
    });
    const subBrandExpenses = expenses.filter(exp => {
      return subBrandFilter === 'All' || exp.subBrand === subBrandFilter || exp.subBrand === '';
    });

    const todayIncome = subBrandIncomes
      .filter(inc => inc.date === todayStr)
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const todayIncomeCount = subBrandIncomes.filter(inc => inc.date === todayStr).length;

    const todayExpense = subBrandExpenses
      .filter(exp => exp.date === todayStr)
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const todayExpenseCount = subBrandExpenses.filter(exp => exp.date === todayStr).length;

    const thisMonthIncome = subBrandIncomes
      .filter(inc => inc.date && inc.date.startsWith(currentMonthPrefix))
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const thisMonthIncomeCount = subBrandIncomes.filter(inc => inc.date && inc.date.startsWith(currentMonthPrefix)).length;

    const thisMonthExpense = subBrandExpenses
      .filter(exp => exp.date && exp.date.startsWith(currentMonthPrefix))
      .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const thisMonthExpenseCount = subBrandExpenses.filter(exp => exp.date && exp.date.startsWith(currentMonthPrefix)).length;

    // Cash vs Bank/MFS Balances (from filtered or all income)
    const cashIncome = filteredIncomes
      .filter(inc => inc.paymentMethod === 'Cash')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const cashIncomeCount = filteredIncomes.filter(inc => inc.paymentMethod === 'Cash').length;

    const bKashIncome = filteredIncomes
      .filter(inc => inc.paymentMethod === 'bKash')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    const nagadIncome = filteredIncomes
      .filter(inc => inc.paymentMethod === 'Nagad')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    const rocketIncome = filteredIncomes
      .filter(inc => inc.paymentMethod === 'Rocket')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    const bankIncome = filteredIncomes
      .filter(inc => inc.paymentMethod === 'Bank')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);

    const bankMfsBalance = filteredIncomes
      .filter(inc => inc.paymentMethod !== 'Cash')
      .reduce((sum, inc) => sum + (inc.amount || 0), 0);
    const bankMfsCount = filteredIncomes.filter(inc => inc.paymentMethod !== 'Cash').length;

    // 6. Daily / Breakdown
    const incomeByDay: Record<string, number> = {};
    const subBrandTotals: Record<string, number> = { SAT: 0, GZ: 0, RTX: 0 };
    const incomeByCategory: Record<string, number> = {};
    const incomeByPaymentMethod: Record<string, number> = {};

    filteredIncomes.forEach(inc => {
      const dayStr = inc.date || new Date(inc.createdAt).toISOString().split('T')[0];
      incomeByDay[dayStr] = (incomeByDay[dayStr] || 0) + inc.amount;
      
      if (inc.subBrand && inc.subBrand in subBrandTotals) {
        subBrandTotals[inc.subBrand] += inc.amount;
      }
      
      incomeByCategory[inc.category] = (incomeByCategory[inc.category] || 0) + inc.amount;
      incomeByPaymentMethod[inc.paymentMethod] = (incomeByPaymentMethod[inc.paymentMethod] || 0) + inc.amount;
    });

    // Group expenses in date range by category
    const expenseByCategory: Record<string, number> = {};
    filteredExpenses.forEach(exp => {
      expenseByCategory[exp.category] = (expenseByCategory[exp.category] || 0) + exp.amount;
    });

    return {
      totalIncome,
      totalSalesIncome,
      totalManualIncome,
      totalProductCost,
      totalExpenses,
      netProfit,
      profitMargin,
      todayIncome,
      todayIncomeCount,
      todayExpense,
      todayExpenseCount,
      thisMonthIncome,
      thisMonthIncomeCount,
      thisMonthExpense,
      thisMonthExpenseCount,
      cashIncome,
      cashIncomeCount,
      bankMfsBalance,
      bankMfsCount,
      bKashIncome,
      nagadIncome,
      rocketIncome,
      bankIncome,
      incomeByDay,
      subBrandTotals,
      incomeByCategory,
      incomeByPaymentMethod,
      expenseByCategory,
      filteredIncomesCount: filteredIncomes.length,
      filteredStockInsCount: filteredStockIns.length,
      filteredExpensesCount: filteredExpenses.length
    };
  }, [startDate, endDate, subBrandFilter, allCombinedIncomes, stockLogs, expenses, products]);

  // Filtered Income Ledger Rows
  const filteredLedgerIncomes = useMemo(() => {
    const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

    return allCombinedIncomes.filter(inc => {
      const incTime = inc.createdAt || new Date(inc.date + 'T00:00:00').getTime();
      const dateMatch = incTime >= startMs && incTime <= endMs;
      const subBrandMatch = subBrandFilter === 'All' || inc.subBrand === subBrandFilter || inc.subBrand === 'ALL' || inc.subBrand === '';
      
      const categoryMatch = incomeCategoryFilter === 'All' || inc.category === incomeCategoryFilter;
      const paymentMatch = incomePaymentFilter === 'All' || inc.paymentMethod === incomePaymentFilter;
      const sourceMatch = incomeSourceFilter === 'All' || 
        (incomeSourceFilter === 'auto_sale' && inc.source === 'order_sale') ||
        (incomeSourceFilter === 'manual' && inc.source === 'manual');

      const searchLower = incomeSearch.toLowerCase();
      const textMatch = !incomeSearch || 
        (inc.incomeId && inc.incomeId.toLowerCase().includes(searchLower)) ||
        (inc.customerName && inc.customerName.toLowerCase().includes(searchLower)) ||
        (inc.invoiceNo && inc.invoiceNo.toLowerCase().includes(searchLower)) ||
        (inc.reference && inc.reference.toLowerCase().includes(searchLower)) ||
        (inc.notes && inc.notes.toLowerCase().includes(searchLower)) ||
        (inc.addedBy && inc.addedBy.toLowerCase().includes(searchLower)) ||
        inc.amount.toString().includes(searchLower);

      return dateMatch && subBrandMatch && categoryMatch && paymentMatch && sourceMatch && textMatch;
    });
  }, [allCombinedIncomes, startDate, endDate, subBrandFilter, incomeCategoryFilter, incomePaymentFilter, incomeSourceFilter, incomeSearch]);

  // Render variables for Expense Ledger (filtered by ledger controls)
  const filteredLedgerExpenses = useMemo(() => {
    const startMs = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endMs = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;

    return expenses.filter(exp => {
      const expTime = exp.createdAt || new Date(exp.date + 'T00:00:00').getTime();
      const dateMatch = expTime >= startMs && expTime <= endMs;
      const subBrandMatch = subBrandFilter === 'All' || exp.subBrand === subBrandFilter || exp.subBrand === 'ALL' || exp.subBrand === '' || !exp.subBrand;

      const categoryMatch = ledgerCategory === 'All' || exp.category === ledgerCategory;
      const paymentMatch = ledgerPaymentFilter === 'All' || exp.paymentMethod === ledgerPaymentFilter;

      const searchLower = ledgerSearch.toLowerCase();
      const textMatch = !ledgerSearch || 
        (exp.expenseId && exp.expenseId.toLowerCase().includes(searchLower)) ||
        (exp.category && exp.category.toLowerCase().includes(searchLower)) || 
        (exp.supplierName && exp.supplierName.toLowerCase().includes(searchLower)) ||
        (exp.reference && exp.reference.toLowerCase().includes(searchLower)) ||
        (exp.invoiceNo && exp.invoiceNo.toLowerCase().includes(searchLower)) ||
        (exp.notes && exp.notes.toLowerCase().includes(searchLower)) ||
        (exp.addedBy && exp.addedBy.toLowerCase().includes(searchLower)) ||
        (exp.createdBy && exp.createdBy.toLowerCase().includes(searchLower)) ||
        (exp.paymentMethod && exp.paymentMethod.toLowerCase().includes(searchLower)) ||
        exp.amount.toString().includes(searchLower);
      
      return dateMatch && subBrandMatch && categoryMatch && paymentMatch && textMatch;
    });
  }, [expenses, startDate, endDate, subBrandFilter, ledgerSearch, ledgerCategory, ledgerPaymentFilter]);

  // Handle Open Add Expense Modal
  const handleOpenAddExpense = () => {
    if (!canManageFinances) return;
    setEditingExpense(null);
    setExpenseFormId(generateExpenseId());
    setExpenseFormCategory('Product Purchase');
    setExpenseFormAmount('');
    setExpenseFormDate(new Date().toISOString().split('T')[0]);
    setExpenseFormTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setExpenseFormPaymentMethod('bKash');
    setExpenseFormSupplierName('');
    setExpenseFormReference('');
    setExpenseFormInvoiceNo('');
    setExpenseFormSubBrand('');
    setExpenseFormNotes('');
    setExpenseReceiptFile(null);
    setExpenseReceiptUrl('');
    setShowAddExpenseModal(true);
  };

  // Handle Open Add Income Modal
  const handleOpenAddIncome = () => {
    if (!canManageFinances) return;
    setEditingIncome(null);
    setIncomeFormId(generateIncomeId());
    setIncomeFormCategory('Other Income');
    setIncomeFormAmount('');
    setIncomeFormDate(new Date().toISOString().split('T')[0]);
    setIncomeFormTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIncomeFormPaymentMethod('Cash');
    setIncomeFormCustomerName('');
    setIncomeFormInvoiceNo('');
    setIncomeFormReference('');
    setIncomeFormSubBrand('');
    setIncomeFormNotes('');
    setShowAddIncomeModal(true);
  };

  // Handle Edit Income
  const handleEditIncomeClick = (income: Income) => {
    if (!canManageFinances || income.source === 'order_sale') return;
    setEditingIncome(income);
    setIncomeFormId(income.incomeId || generateIncomeId());
    setIncomeFormCategory(income.category);
    setIncomeFormAmount(income.amount);
    setIncomeFormDate(income.date);
    setIncomeFormTime(income.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIncomeFormPaymentMethod(income.paymentMethod || 'Cash');
    setIncomeFormCustomerName(income.customerName || '');
    setIncomeFormInvoiceNo(income.invoiceNo || '');
    setIncomeFormReference(income.reference || '');
    setIncomeFormSubBrand(income.subBrand || '');
    setIncomeFormNotes(income.notes || '');
    setShowAddIncomeModal(true);
  };

  // Handle Delete Income
  const handleDeleteIncomeClick = async (income: Income) => {
    if (!canManageFinances || income.source === 'order_sale') return;
    if (confirm(`Are you sure you want to permanently delete income record ${income.incomeId} of ৳${income.amount}?`)) {
      setLoading(true);
      try {
        await deleteIncome(income.id);
        setSuccessMsg(`Income record ${income.incomeId} deleted successfully.`);
        await loadFinancialData();
        if (onRefreshData) onRefreshData();
        setTimeout(() => setSuccessMsg(''), 3500);
      } catch (err: any) {
        setErrorMsg(`Failed to delete income: ${err.message || err}`);
        setTimeout(() => setErrorMsg(''), 4000);
      } finally {
        setLoading(false);
      }
    }
  };

  // Submit Income Form
  const handleIncomeFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFinances) return;
    if (!incomeFormAmount || Number(incomeFormAmount) <= 0) {
      setErrorMsg("Please enter a valid amount greater than 0");
      return;
    }

    setIsSubmittingIncome(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const finalIncomeId = incomeFormId || generateIncomeId();
      const incomeData: Omit<Income, 'id'> = {
        incomeId: finalIncomeId,
        category: incomeFormCategory,
        amount: Number(incomeFormAmount),
        date: incomeFormDate,
        time: incomeFormTime,
        paymentMethod: incomeFormPaymentMethod,
        customerName: incomeFormCustomerName.trim() || undefined,
        invoiceNo: incomeFormInvoiceNo.trim() || undefined,
        reference: incomeFormReference.trim() || undefined,
        subBrand: incomeFormSubBrand || undefined,
        notes: incomeFormNotes.trim() || undefined,
        addedBy: user.name || user.email || 'Admin',
        createdAt: editingIncome ? (editingIncome.createdAt || Date.now()) : Date.now(),
        source: 'manual'
      };

      if (editingIncome) {
        await updateIncome(editingIncome.id, incomeData);
        setSuccessMsg(`Income record ${finalIncomeId} updated successfully.`);
      } else {
        await addIncome(incomeData);
        setSuccessMsg(`New income record ${finalIncomeId} (৳${Number(incomeFormAmount).toLocaleString()}) recorded successfully.`);
      }

      setShowAddIncomeModal(false);
      setEditingIncome(null);
      await loadFinancialData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("[FinancialOverview] Income submit failed:", err);
      setErrorMsg(`Failed to save income: ${err.message || err}`);
    } finally {
      setIsSubmittingIncome(false);
    }
  };

  // Export Incomes to CSV
  const handleExportIncomesCSV = () => {
    if (filteredLedgerIncomes.length === 0) {
      alert("No income records found to export.");
      return;
    }
    const headers = ['Income ID', 'Date', 'Time', 'Source', 'Category', 'SubBrand', 'Payment Method', 'Customer Name', 'Invoice No', 'Reference / TxID', 'Amount (BDT)', 'Notes', 'Added By'];
    const rows = filteredLedgerIncomes.map(inc => [
      `"${inc.incomeId || ''}"`,
      inc.date,
      `"${inc.time || ''}"`,
      `"${inc.source === 'order_sale' ? 'Auto (Sales Order)' : 'Manual Entry'}"`,
      `"${inc.category || ''}"`,
      `"${inc.subBrand || 'Shared'}"`,
      `"${inc.paymentMethod || 'Cash'}"`,
      `"${(inc.customerName || '').replace(/"/g, '""')}"`,
      `"${(inc.invoiceNo || '').replace(/"/g, '""')}"`,
      `"${(inc.reference || '').replace(/"/g, '""')}"`,
      inc.amount,
      `"${(inc.notes || '').replace(/"/g, '""')}"`,
      `"${(inc.addedBy || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `income_ledger_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Seed Sample Incomes
  const [seedingIncomes, setSeedingIncomes] = useState(false);
  const handleSeedSampleIncomes = async () => {
    if (!canManageFinances) return;
    setSeedingIncomes(true);
    setErrorMsg('');
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const samples: Omit<Income, 'id'>[] = [
        {
          incomeId: generateIncomeId(),
          category: 'Delivery/Courier Income',
          amount: 3200,
          date: todayStr,
          time: '11:30 AM',
          paymentMethod: 'Cash',
          customerName: 'Steadfast Courier COD Settlement',
          reference: 'COD-SETTLE-8831',
          notes: 'Excess courier charge collection and COD reconciliation balance',
          subBrand: 'SAT',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 2,
          source: 'manual'
        },
        {
          incomeId: generateIncomeId(),
          category: 'Digital Service / Top-up',
          amount: 6500,
          date: todayStr,
          time: '02:45 PM',
          paymentMethod: 'bKash',
          customerName: 'Ahmed Tanvir',
          reference: 'BK-TRX-948123',
          notes: 'Software installation & custom device configuration fee',
          subBrand: 'GZ',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 1,
          source: 'manual'
        },
        {
          incomeId: generateIncomeId(),
          category: 'Customer Refund Received',
          amount: 1800,
          date: todayStr,
          time: '04:15 PM',
          paymentMethod: 'Nagad',
          customerName: 'Supplier Partial Rebate',
          reference: 'NG-REB-20419',
          notes: 'Received refund for damaged packaging batch',
          subBrand: 'RTX',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 3600000 * 4,
          source: 'manual'
        },
        {
          incomeId: generateIncomeId(),
          category: 'Other Business Income',
          amount: 4500,
          date: todayStr,
          time: '05:20 PM',
          paymentMethod: 'Bank',
          customerName: 'Dhaka Recyclers Ltd',
          reference: 'BANK-TRF-55201',
          notes: 'Sale of old cartons, scrap plastic & warehouse waste packaging',
          subBrand: '',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now(),
          source: 'manual'
        }
      ];

      for (const sample of samples) {
        await addIncome(sample);
      }

      setSuccessMsg("4 diverse sample income records added successfully!");
      await loadFinancialData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("Failed to seed sample incomes:", err);
      setErrorMsg("Failed to seed sample records: " + (err.message || err));
    } finally {
      setSeedingIncomes(false);
    }
  };

  // Export Expenses to CSV
  const handleExportExpensesCSV = () => {
    if (filteredLedgerExpenses.length === 0) {
      alert("No expense records to export.");
      return;
    }
    const headers = ['Expense ID', 'Date', 'Time', 'Category', 'SubBrand', 'Payment Method', 'Supplier/Vendor', 'Reference / TxID', 'Invoice No', 'Amount (BDT)', 'Notes', 'Added By'];
    const rows = filteredLedgerExpenses.map(e => [
      `"${e.expenseId || e.id}"`,
      `"${e.date}"`,
      `"${e.time || ''}"`,
      `"${e.category || ''}"`,
      `"${e.subBrand || 'Shared'}"`,
      `"${e.paymentMethod || 'Cash'}"`,
      `"${(e.supplierName || '').replace(/"/g, '""')}"`,
      `"${(e.reference || '').replace(/"/g, '""')}"`,
      `"${(e.invoiceNo || '').replace(/"/g, '""')}"`,
      e.amount,
      `"${(e.notes || '').replace(/"/g, '""')}"`,
      `"${e.addedBy || e.createdBy || ''}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `expenses_ledger_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick Seed Sample Expenses for Mobile Accessories Business
  const [seedingExpenses, setSeedingExpenses] = useState(false);
  const handleSeedSampleExpenses = async () => {
    if (!canManageFinances) return;
    setSeedingExpenses(true);
    setErrorMsg('');
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const samples: Omit<Expense, 'id'>[] = [
        {
          expenseId: generateExpenseId(),
          category: 'Product Purchase',
          amount: 48500,
          date: todayStr,
          time: '10:30 AM',
          paymentMethod: 'Bank',
          supplierName: 'Guangzhou Baseus Direct Co',
          reference: 'BANK-LC-88412',
          invoiceNo: 'GZ-INV-2026-99',
          subBrand: 'GZ',
          notes: 'Fast chargers 65W GaN, braided Type-C cables & magnetic power banks',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 3
        },
        {
          expenseId: generateExpenseId(),
          category: 'Packaging',
          amount: 3800,
          date: todayStr,
          time: '01:15 PM',
          paymentMethod: 'bKash',
          supplierName: 'Chawkbazar Poly & Bubble Store',
          reference: 'BK-TRX-19482',
          invoiceNo: 'CB-9942',
          subBrand: '',
          notes: 'Bubble wrap rolls, custom printed security poly bags, barcode label stickers',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 2
        },
        {
          expenseId: generateExpenseId(),
          category: 'Facebook/Instagram Ads',
          amount: 15000,
          date: todayStr,
          time: '04:45 PM',
          paymentMethod: 'Upay',
          supplierName: 'Meta Ads BD Agency',
          reference: 'UPAY-TX-77319',
          invoiceNo: 'ADS-AUG-01',
          subBrand: 'SAT',
          notes: 'Targeted conversion campaign for Wireless Earbuds & Smartwatch Cases',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 1
        },
        {
          expenseId: generateExpenseId(),
          category: 'Staff Salary',
          amount: 35000,
          date: todayStr,
          time: '05:00 PM',
          paymentMethod: 'Bank',
          supplierName: 'Store Staff & Dispatch Team',
          reference: 'SALARY-2026-AUG',
          invoiceNo: 'PAYROLL-08',
          subBrand: '',
          notes: 'Monthly salary for packing staff, customer care & dispatch team',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000
        },
        {
          expenseId: generateExpenseId(),
          category: 'Warehouse/Rent',
          amount: 25000,
          date: todayStr,
          time: '11:00 AM',
          paymentMethod: 'Cash',
          supplierName: 'Motijheel Commercial Complex',
          reference: 'RENT-REC-08',
          invoiceNo: 'RENT-AUG-2026',
          subBrand: '',
          notes: 'Central fulfillment inventory warehouse monthly rental payment',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now() - 86400000 * 4
        },
        {
          expenseId: generateExpenseId(),
          category: 'Courier/Delivery Expense',
          amount: 6200,
          date: todayStr,
          time: '03:20 PM',
          paymentMethod: 'Nagad',
          supplierName: 'Steadfast Courier Line',
          reference: 'NG-TRX-55102',
          invoiceNo: 'ST-INV-4410',
          subBrand: '',
          notes: 'Weekly courier freight and return parcel handling charges',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now()
        },
        {
          expenseId: generateExpenseId(),
          category: 'Supplier Delivery/Transport',
          amount: 2400,
          date: todayStr,
          time: '06:10 PM',
          paymentMethod: 'Rocket',
          supplierName: 'Airport Cargo Pickup Transport',
          reference: 'RK-TRX-33190',
          invoiceNo: 'CARGO-7721',
          subBrand: 'RTX',
          notes: 'Customs port clearance & local van transit to central warehouse',
          createdBy: user.name || user.email || 'Admin',
          addedBy: user.name || user.email || 'Admin',
          createdAt: Date.now()
        }
      ];

      for (const sample of samples) {
        await addExpense(sample);
      }

      setSuccessMsg("7 realistic mobile accessories business expense records added successfully!");
      await loadFinancialData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("Failed to seed sample expenses:", err);
      setErrorMsg("Failed to seed sample records: " + (err.message || err));
    } finally {
      setSeedingExpenses(false);
    }
  };

  // Handle Edit Expense Action
  const handleEditExpenseClick = (expense: Expense) => {
    if (!canManageFinances) return;
    setEditingExpense(expense);
    setExpenseFormId(expense.expenseId || generateExpenseId());
    setExpenseFormCategory(expense.category);
    setExpenseFormAmount(expense.amount);
    setExpenseFormDate(expense.date);
    setExpenseFormTime(expense.time || new Date(expense.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setExpenseFormPaymentMethod(expense.paymentMethod || 'bKash');
    setExpenseFormSupplierName(expense.supplierName || '');
    setExpenseFormReference(expense.reference || '');
    setExpenseFormInvoiceNo(expense.invoiceNo || '');
    setExpenseFormSubBrand(expense.subBrand || '');
    setExpenseFormNotes(expense.notes || '');
    setExpenseReceiptUrl(expense.receiptUrl || '');
    setExpenseReceiptFile(null);
    setShowAddExpenseModal(true);
  };

  // Handle Delete Expense Action
  const handleDeleteExpenseClick = (id: string, category: string, amount: number) => {
    if (!canManageFinances) return;
    if (confirm(`Are you sure you want to permanently delete this expense record of ৳${amount.toLocaleString()} for "${category}"?`)) {
      setLoading(true);
      deleteExpense(id)
        .then(() => {
          setSuccessMsg("Expense record deleted successfully.");
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

  // Submit Expense Form (Modal & Form)
  const handleExpenseFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageFinances) return;
    if (!expenseFormAmount || Number(expenseFormAmount) <= 0) {
      setErrorMsg("Please enter a valid expense amount greater than 0");
      return;
    }

    setIsSubmittingExpense(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let finalReceiptUrl = expenseReceiptUrl;

      if (expenseReceiptFile) {
        const fileExtension = expenseReceiptFile.name.split('.').pop();
        const timestamp = Date.now();
        const path = `receipts/${timestamp}_${Math.random().toString(36).substring(2, 7)}.${fileExtension}`;
        
        try {
          if (storage) {
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, expenseReceiptFile);
            finalReceiptUrl = await getDownloadURL(snapshot.ref);
          } else {
            finalReceiptUrl = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(expenseReceiptFile);
            });
          }
        } catch (uploadError) {
          finalReceiptUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(expenseReceiptFile);
          });
        }
      }

      const finalExpenseId = expenseFormId || generateExpenseId();
      const expenseData: Omit<Expense, 'id'> = {
        expenseId: finalExpenseId,
        category: expenseFormCategory,
        amount: Number(expenseFormAmount),
        date: expenseFormDate,
        time: expenseFormTime,
        paymentMethod: expenseFormPaymentMethod,
        supplierName: expenseFormSupplierName.trim() || undefined,
        reference: expenseFormReference.trim() || undefined,
        invoiceNo: expenseFormInvoiceNo.trim() || undefined,
        subBrand: expenseFormSubBrand || undefined,
        notes: expenseFormNotes.trim() || undefined,
        receiptUrl: finalReceiptUrl || undefined,
        createdBy: user.name || user.email || 'Admin',
        addedBy: user.name || user.email || 'Admin',
        createdAt: editingExpense ? (editingExpense.createdAt || Date.now()) : Date.now()
      };

      if (editingExpense) {
        await updateExpense(editingExpense.id, expenseData);
        setSuccessMsg(`Expense record ${finalExpenseId} updated successfully.`);
      } else {
        await addExpense(expenseData);
        setSuccessMsg(`New expense record ${finalExpenseId} (৳${Number(expenseFormAmount).toLocaleString()}) recorded successfully.`);
      }

      setShowAddExpenseModal(false);
      setEditingExpense(null);
      await loadFinancialData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error("[FinancialOverview] Expense submit failed:", err);
      setErrorMsg(`Failed to save expense: ${err.message || err}`);
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  const handleExpenseFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg("Receipt image size must not exceed 5MB.");
        return;
      }
      setExpenseReceiptFile(file);
    }
  };

  // SVG Visual Charts
  const renderSVGDonut = () => {
    const categories = Object.keys(financialMetrics.expenseByCategory);
    const totalExp = financialMetrics.totalExpenses;

    if (totalExp === 0 || categories.length === 0) {
      return (
        <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
          <Lightbulb size={24} className="text-slate-300 mb-1" />
          <p className="text-xs">No overhead expenses registered for this range.</p>
        </div>
      );
    }

    const colors = [
      '#EF4444', '#F59E0B', '#10B981', '#3B82F6', 
      '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'
    ];

    let currentAngle = 0;
    const segments = categories.map((cat, idx) => {
      const val = financialMetrics.expenseByCategory[cat];
      const percentage = (val / totalExp) * 100;
      const angle = (val / totalExp) * 360;
      const startPercentage = currentAngle;
      currentAngle += percentage;
      return {
        name: cat,
        val,
        percentage,
        color: colors[idx % colors.length],
        startPercentage
      };
    });

    return (
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            {segments.map((seg, i) => {
              const r = 38;
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
            <p className="text-xs font-black text-slate-800 font-mono">৳{totalExp.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex-1 space-y-1.5 w-full max-h-48 overflow-y-auto pr-1">
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
    const sortedDates = Object.keys(financialMetrics.incomeByDay).sort();
    if (sortedDates.length === 0) {
      return (
        <div className="h-44 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
          <TrendingUp size={28} className="text-slate-300 mb-2 animate-pulse" />
          <p className="text-sm">No active income recorded for this timeframe.</p>
        </div>
      );
    }

    const values = sortedDates.map(d => financialMetrics.incomeByDay[d]);
    const maxVal = Math.max(...values, 1000);

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
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <line x1={padding} y1={height/2} x2={width-padding} y2={height/2} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
          <polygon points={fillPoints} fill="url(#chartGradient)" />
          <polyline
            fill="transparent"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={polylinePoints}
          />
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

        <div className="flex justify-between px-4 mt-1 text-xs font-bold text-slate-400 font-mono">
          <span>{sortedDates[0]}</span>
          {sortedDates.length > 2 && <span>{sortedDates[Math.floor(sortedDates.length / 2)]}</span>}
          <span>{sortedDates[sortedDates.length - 1]}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xs relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none translate-x-10 translate-y-10">
          <DollarSign size={280} className="text-emerald-400" />
        </div>
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 bg-[#D4AF37]/20 border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3">
              <TrendingUp size={12} /> Financial Operations
            </div>
            <h1 className="text-xl lg:text-2xl font-black tracking-tight font-sans">INCOME & EXPENSE (আয় ও ব্যয়)</h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mt-1 leading-relaxed">
              Consolidated financial tracking across operations. Sales orders automatically sync as revenue, and manual income/overhead expenses can be recorded with complete audit trails.
            </p>
          </div>
          
          {/* Main Module Tabs */}
          <div className="bg-slate-800/90 p-1.5 rounded-2xl flex border border-slate-700/50 self-start shadow-inner">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-[#D4AF37] text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp size={14} />
              <span>Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'income'
                  ? 'bg-emerald-500 text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <DollarSign size={14} />
              <span>💵 Income (আয়)</span>
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'expenses'
                  ? 'bg-[#D4AF37] text-slate-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building size={14} />
              <span>🧾 Expenses (ব্যয়)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-white p-4 lg:p-5 rounded-2xl border border-slate-100 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 justify-between shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <button 
            type="button"
            onClick={() => setPresetRange('today')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            Today
          </button>
          <button 
            type="button"
            onClick={() => setPresetRange('thisWeek')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            This Week
          </button>
          <button 
            type="button"
            onClick={() => setPresetRange('thisMonth')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            This Month
          </button>
          <button 
            type="button"
            onClick={() => setPresetRange('lastMonth')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            Last Month
          </button>
          <button 
            type="button"
            onClick={() => setPresetRange('thisYear')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            This Year
          </button>
          <button 
            type="button"
            onClick={() => setPresetRange('allTime')} 
            className="px-2.5 sm:px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors border border-slate-200 text-slate-700 cursor-pointer"
          >
            All Time
          </button>

          {/* Quick Add Income & Expense buttons directly in header bar */}
          {canManageFinances && (
            <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
              <button
                type="button"
                onClick={handleOpenAddIncome}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>Add Income</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddExpense}
                className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c39e2d] text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>Add Expense</span>
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
          {/* Start Date */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-hidden"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-tight mb-1">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-medium focus:outline-hidden"
            />
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
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl p-2 flex items-center justify-center border border-slate-200 transition-all h-9 cursor-pointer"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 4.89M9 17h.01" />
            </svg>
          </button>
        </div>
      </div>

      {/* Success / Error Messages */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3 text-emerald-800 text-sm font-semibold animate-slide-up">
          <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          <p>{successMsg}</p>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-800 text-sm font-semibold animate-slide-up">
          <AlertCircle size={18} className="text-red-500 shrink-0" />
          <p>{errorMsg}</p>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & KPI DASHBOARD                                           */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* SECTION 1: Top 5 Primary KPI Cards */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#D4AF37]" /> Core Financial Metrics (মূল আর্থিক সারসংক্ষেপ)
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
              {/* 1. Total Income */}
              <div className="bg-gradient-to-br from-white to-emerald-50/30 p-4 rounded-2xl border border-emerald-100/80 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[125px] hover:border-emerald-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Total Income (মোট আয়)</span>
                  <span className="p-1.5 bg-emerald-100/70 text-emerald-700 rounded-xl"><TrendingUp size={15} /></span>
                </div>
                <div className="mt-1">
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight">
                    ৳{financialMetrics.totalIncome.toLocaleString()}
                  </h3>
                  <div className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-x-1.5 font-medium">
                    <span>Sales: <strong className="text-slate-700">৳{financialMetrics.totalSalesIncome.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Other: <strong className="text-slate-700">৳{financialMetrics.totalManualIncome.toLocaleString()}</strong></span>
                  </div>
                </div>
              </div>

              {/* 2. Total Expense */}
              <div className="bg-gradient-to-br from-white to-rose-50/30 p-4 rounded-2xl border border-rose-100/80 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[125px] hover:border-rose-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Total Expense (মোট খরচ)</span>
                  <span className="p-1.5 bg-rose-100/70 text-rose-700 rounded-xl"><TrendingDown size={15} /></span>
                </div>
                <div className="mt-1">
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight">
                    ৳{financialMetrics.totalExpenses.toLocaleString()}
                  </h3>
                  <div className="text-[10px] text-slate-400 mt-1 font-medium">
                    <span>{financialMetrics.filteredExpensesCount} recorded expense entries</span>
                  </div>
                </div>
              </div>

              {/* 3. Net Profit (Income - Expense) */}
              <div className={`p-4 rounded-2xl border shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[125px] transition-all ${
                financialMetrics.netProfit >= 0 
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-600 text-white shadow-emerald-500/10' 
                  : 'bg-gradient-to-br from-rose-500 to-rose-600 border-rose-600 text-white shadow-rose-500/10'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold text-emerald-100 uppercase tracking-tight">Net Profit (নিট লাভ)</span>
                  <span className="p-1.5 bg-white/20 text-white rounded-xl backdrop-blur-xs"><DollarSign size={15} /></span>
                </div>
                <div className="mt-1">
                  <h3 className="text-xl lg:text-2xl font-black font-mono tracking-tight text-white">
                    {financialMetrics.netProfit < 0 ? '-' : ''}৳{Math.abs(financialMetrics.netProfit).toLocaleString()}
                  </h3>
                  <div className="text-[10px] text-emerald-100/90 mt-1 font-semibold flex items-center gap-1">
                    <span>Income − Expense</span>
                    <span>•</span>
                    <span>{Math.round(financialMetrics.profitMargin)}% Margin</span>
                  </div>
                </div>
              </div>

              {/* 4. Today Income */}
              <div className="bg-gradient-to-br from-white to-teal-50/30 p-4 rounded-2xl border border-teal-100/80 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[125px] hover:border-teal-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Today Income (আজকের আয়)</span>
                  <span className="p-1.5 bg-teal-100/70 text-teal-700 rounded-xl"><ArrowUpRight size={15} /></span>
                </div>
                <div className="mt-1">
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight">
                    ৳{financialMetrics.todayIncome.toLocaleString()}
                  </h3>
                  <div className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                    <span>{financialMetrics.todayIncomeCount} collection{financialMetrics.todayIncomeCount === 1 ? '' : 's'} today</span>
                  </div>
                </div>
              </div>

              {/* 5. Today Expense */}
              <div className="bg-gradient-to-br from-white to-amber-50/30 p-4 rounded-2xl border border-amber-100/80 shadow-2xs relative overflow-hidden flex flex-col justify-between min-h-[125px] hover:border-amber-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight">Today Expense (আজকের খরচ)</span>
                  <span className="p-1.5 bg-amber-100/70 text-amber-700 rounded-xl"><ArrowDownRight size={15} /></span>
                </div>
                <div className="mt-1">
                  <h3 className="text-xl lg:text-2xl font-black text-slate-900 font-mono tracking-tight">
                    ৳{financialMetrics.todayExpense.toLocaleString()}
                  </h3>
                  <div className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>{financialMetrics.todayExpenseCount} expense log{financialMetrics.todayExpenseCount === 1 ? '' : 's'} today</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: 4 Secondary Balance & Month Cards */}
          <div>
            <div className="flex items-center justify-between mb-2.5 px-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calendar size={13} className="text-blue-500" /> Monthly Period & Account Balances (চলতি মাস ও একাউন্ট ব্যালেন্স)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 6. This Month Income */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-2xs flex flex-col justify-between min-h-[135px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Calendar size={16} /></span>
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">This Month Income</span>
                      <p className="text-[10px] text-slate-400">চলতি মাসের আয়</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                    {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900 font-mono">
                    ৳{financialMetrics.thisMonthIncome.toLocaleString()}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    Total <strong className="text-slate-700 font-mono">{financialMetrics.thisMonthIncomeCount}</strong> income transactions this month
                  </p>
                </div>
              </div>

              {/* 7. This Month Expense */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-2xs flex flex-col justify-between min-h-[135px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-purple-50 text-purple-600 rounded-xl"><Building size={16} /></span>
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">This Month Expense</span>
                      <p className="text-[10px] text-slate-400">চলতি মাসের খরচ</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full border border-purple-100">
                    {new Date().toLocaleString('default', { month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900 font-mono">
                    ৳{financialMetrics.thisMonthExpense.toLocaleString()}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    Total <strong className="text-slate-700 font-mono">{financialMetrics.thisMonthExpenseCount}</strong> expense items this month
                  </p>
                </div>
              </div>

              {/* 8. Cash Balance */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-2xs flex flex-col justify-between min-h-[135px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><CreditCard size={16} /></span>
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Cash Balance</span>
                      <p className="text-[10px] text-slate-400">নগদ ক্যাশ ব্যালেন্স</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                    💵 In-Hand
                  </span>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-emerald-700 font-mono">
                    ৳{financialMetrics.cashIncome.toLocaleString()}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    From <strong className="text-slate-700 font-mono">{financialMetrics.cashIncomeCount}</strong> cash payment receipts
                  </p>
                </div>
              </div>

              {/* 9. Bank/MFS Balance */}
              <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-100 shadow-2xs flex flex-col justify-between min-h-[135px]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl"><Building size={16} /></span>
                    <div>
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Bank / MFS Balance</span>
                      <p className="text-[10px] text-slate-400">ব্যাংক ও মোবাইল ব্যাংকিং</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
                    📱 Digital Funds
                  </span>
                </div>
                <div className="mt-2.5">
                  <h3 className="text-2xl font-black text-indigo-700 font-mono">
                    ৳{financialMetrics.bankMfsBalance.toLocaleString()}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {financialMetrics.bKashIncome > 0 && (
                      <span className="text-[9px] font-mono font-bold bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded border border-pink-100">
                        🌸 bKash: ৳{financialMetrics.bKashIncome.toLocaleString()}
                      </span>
                    )}
                    {financialMetrics.nagadIncome > 0 && (
                      <span className="text-[9px] font-mono font-bold bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded border border-orange-100">
                        🔶 Nagad: ৳{financialMetrics.nagadIncome.toLocaleString()}
                      </span>
                    )}
                    {financialMetrics.bankIncome > 0 && (
                      <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100">
                        🏛️ Bank: ৳{financialMetrics.bankIncome.toLocaleString()}
                      </span>
                    )}
                    {financialMetrics.bKashIncome === 0 && financialMetrics.nagadIncome === 0 && financialMetrics.bankIncome === 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {financialMetrics.bankMfsCount} digital payment records
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analytical Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Income Timeline (আয় ট্রেন্ড)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Plotting chronological revenue across selected timeframe</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
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
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Expenses Distribution (ব্যয়ের অনুপাত)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Interactive proportional share of overhead categories</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-mono font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
                    Overhead: {Math.round((financialMetrics.totalExpenses / (financialMetrics.totalIncome || 1)) * 100)}%
                  </span>
                </div>
              </div>
              <div className="pt-2">
                {renderSVGDonut()}
              </div>
            </div>
          </div>

          {/* Income Sources & Payment Method Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income by Category */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Income by Source Category</h3>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  {Object.keys(financialMetrics.incomeByCategory).length} categories
                </span>
              </div>
              <div className="space-y-3">
                {INCOME_CATEGORY_CONFIG.map((cat) => {
                  const amt = financialMetrics.incomeByCategory[cat.id] || 0;
                  const pct = financialMetrics.totalIncome > 0 ? (amt / financialMetrics.totalIncome) * 100 : 0;
                  return (
                    <div key={cat.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </span>
                        <span className="font-mono font-bold text-slate-800">
                          ৳{amt.toLocaleString()} <span className="text-slate-400 font-normal">({Math.round(pct)}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                          style={{ width: `${pct}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Income by Payment Method */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Income by Payment Method</h3>
                <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                  Channels
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PAYMENT_METHODS.map((pm) => {
                  const amt = financialMetrics.incomeByPaymentMethod[pm.id] || 0;
                  const pct = financialMetrics.totalIncome > 0 ? (amt / financialMetrics.totalIncome) * 100 : 0;
                  return (
                    <div key={pm.id} className={`p-3 rounded-2xl border ${pm.border} ${pm.bg} flex flex-col justify-between`}>
                      <div className="flex items-center justify-between">
                        <span className="text-base">{pm.icon}</span>
                        <span className={`text-[10px] font-bold ${pm.text}`}>{Math.round(pct)}%</span>
                      </div>
                      <div className="mt-2">
                        <p className={`text-xs font-bold ${pm.text}`}>{pm.label}</p>
                        <p className="text-sm font-mono font-black text-slate-800 mt-0.5">৳{amt.toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sub-brand Breakdown */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 space-y-6 shadow-2xs">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-tight">Operational Sub-brand Breakdown</h3>
              <p className="text-xs text-slate-400 mt-0.5">Revenue segmented per business identity</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* SAT */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between bg-slate-50/50">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-slate-700">SKY AUTOMATION</span>
                    <span className="text-xs font-mono font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 px-2 py-0.5 rounded-md">SAT</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.SAT.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.SAT / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>

              {/* GZ */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between bg-slate-50/50">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-slate-700">GADGETZU</span>
                    <span className="text-xs font-mono font-bold bg-teal-500/10 text-teal-600 border border-teal-500/20 px-2 py-0.5 rounded-md">GZ</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.GZ.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.GZ / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>

              {/* RTX */}
              <div className="border border-slate-100 rounded-2xl p-4 hover:border-slate-200 transition-colors flex flex-col justify-between bg-slate-50/50">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-black text-slate-700">RTX GADGET</span>
                    <span className="text-xs font-mono font-bold bg-orange-500/10 text-orange-600 border border-orange-500/20 px-2 py-0.5 rounded-md">RTX</span>
                  </div>
                  <p className="text-lg font-black text-slate-800 font-mono">৳{financialMetrics.subBrandTotals.RTX.toLocaleString()}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-400">
                  <span>Relative Share</span>
                  <span className="font-bold text-slate-600">{Math.round((financialMetrics.subBrandTotals.RTX / (financialMetrics.totalIncome || 1)) * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INCOME LEDGER (💵 আয় / Income Management)                         */}
      {/* ========================================================================= */}
      {activeTab === 'income' && (
        <div className="space-y-4">
          <div className="bg-white p-5 lg:p-6 rounded-3xl border border-slate-100 shadow-2xs space-y-4">
            {/* Header & Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-50 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <span>💵 Income Ledger (আয় খতিয়ান)</span>
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Auto-Synced with Sales
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Complete register of all income streams (Sales orders are automatically logged; custom income can be recorded manually).
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {canManageFinances && (
                  <button
                    type="button"
                    onClick={handleOpenAddIncome}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Plus size={14} />
                    <span>Add Income (নতুন আয়)</span>
                  </button>
                )}

                {canManageFinances && incomes.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedSampleIncomes}
                    disabled={seedingIncomes}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold border border-amber-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={13} className="text-amber-600" />
                    <span>{seedingIncomes ? 'Adding Samples...' : 'Seed Sample Incomes'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportIncomesCSV}
                  className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold border border-teal-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={13} className="text-teal-600" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
                <input
                  type="text"
                  placeholder="Search ID, customer, invoice..."
                  value={incomeSearch}
                  onChange={(e) => setIncomeSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              {/* Source Filter */}
              <div>
                <select
                  value={incomeSourceFilter}
                  onChange={(e) => setIncomeSourceFilter(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden"
                >
                  <option value="All">All Sources (সব উৎস)</option>
                  <option value="auto_sale">🛒 Auto (Sales Orders)</option>
                  <option value="manual">💎 Manual Income Entries</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <select
                  value={incomeCategoryFilter}
                  onChange={(e) => setIncomeCategoryFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden"
                >
                  <option value="All">All Income Categories</option>
                  {INCOME_CATEGORY_CONFIG.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
              </div>

              {/* Payment Method Filter */}
              <div>
                <select
                  value={incomePaymentFilter}
                  onChange={(e) => setIncomePaymentFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden"
                >
                  <option value="All">All Payment Methods</option>
                  {PAYMENT_METHODS.map(pm => (
                    <option key={pm.id} value={pm.id}>{pm.icon} {pm.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Summary Ribbon */}
            <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
              <span className="font-semibold text-emerald-900">
                Showing {filteredLedgerIncomes.length} income record(s)
              </span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-emerald-800">
                  Sales: <strong>৳{filteredLedgerIncomes.filter(i => i.source === 'order_sale').reduce((s, i) => s + i.amount, 0).toLocaleString()}</strong>
                </span>
                <span className="font-mono text-emerald-800">
                  Manual: <strong>৳{filteredLedgerIncomes.filter(i => i.source === 'manual').reduce((s, i) => s + i.amount, 0).toLocaleString()}</strong>
                </span>
                <span className="font-mono font-black text-emerald-950 text-sm border-l border-emerald-200 pl-4">
                  Total: ৳{filteredLedgerIncomes.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Income Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="py-3 px-2.5">Income ID & Date</th>
                    <th className="py-3 px-2.5">Source & Category</th>
                    <th className="py-3 px-2.5">Payment Method</th>
                    <th className="py-3 px-2.5">Customer / Reference</th>
                    <th className="py-3 px-2.5">Sub-Brand</th>
                    <th className="py-3 px-2.5 text-right">Amount (৳)</th>
                    <th className="py-3 px-2.5">Notes</th>
                    <th className="py-3 px-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLedgerIncomes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                        No matching income records found.
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerIncomes.map((inc) => {
                      const catConfig = INCOME_CATEGORY_CONFIG.find(c => c.id === inc.category) || INCOME_CATEGORY_CONFIG[3];
                      const pmConfig = PAYMENT_METHODS.find(p => p.id === inc.paymentMethod) || PAYMENT_METHODS[0];

                      return (
                        <tr key={inc.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Income ID & Date */}
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            <p className="font-mono font-bold text-slate-800">{inc.incomeId}</p>
                            <p className="text-[10px] text-slate-400">{inc.date} {inc.time ? `• ${inc.time}` : ''}</p>
                          </td>

                          {/* Source & Category */}
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {inc.source === 'order_sale' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                  <span>🛒 Auto (Sales)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-100">
                                  <span>💎 Manual</span>
                                </span>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${catConfig.color}`}>
                              <span>{catConfig.icon}</span>
                              <span>{inc.category}</span>
                            </span>
                          </td>

                          {/* Payment Method */}
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${pmConfig.border} ${pmConfig.bg} ${pmConfig.text}`}>
                              <span>{pmConfig.icon}</span>
                              <span>{inc.paymentMethod || 'Cash'}</span>
                            </span>
                          </td>

                          {/* Customer / Reference */}
                          <td className="py-3 px-2.5 max-w-[160px]">
                            <p className="font-semibold text-slate-800 truncate" title={inc.customerName || 'N/A'}>
                              {inc.customerName || <span className="text-slate-300 font-normal">N/A</span>}
                            </p>
                            {(inc.invoiceNo || inc.reference) && (
                              <p className="text-[10px] text-slate-400 font-mono truncate" title={`Invoice: ${inc.invoiceNo || ''} | Ref: ${inc.reference || ''}`}>
                                {inc.invoiceNo ? `Inv: ${inc.invoiceNo}` : ''} {inc.reference ? `Ref: ${inc.reference}` : ''}
                              </p>
                            )}
                          </td>

                          {/* Sub-Brand */}
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            {inc.subBrand ? (
                              <span className={`inline-block text-[9px] font-mono font-black uppercase px-1.5 py-0.5 rounded-sm ${
                                inc.subBrand === 'SAT' 
                                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                  : inc.subBrand === 'GZ' 
                                    ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20' 
                                    : 'bg-orange-500/10 text-orange-600 border border-orange-500/20'
                              }`}>
                                {inc.subBrand}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">Shared</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-2.5 text-right font-black text-emerald-700 font-mono whitespace-nowrap text-sm">
                            ৳{inc.amount.toLocaleString()}
                          </td>

                          {/* Notes */}
                          <td className="py-3 px-2.5 max-w-[150px] truncate text-slate-600 text-[11px]" title={inc.notes}>
                            {inc.notes || <span className="text-slate-300 italic">No notes</span>}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-2.5 text-center whitespace-nowrap">
                            {inc.source === 'manual' ? (
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleEditIncomeClick(inc)}
                                  disabled={!canManageFinances}
                                  title="Edit Manual Income Record"
                                  className="p-1 bg-slate-50 hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 rounded-sm cursor-pointer"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteIncomeClick(inc)}
                                  disabled={!canManageFinances}
                                  title="Delete Manual Income Record"
                                  className="p-1 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 rounded-sm cursor-pointer"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic" title="Recorded automatically from Sales Desk">
                                Auto-linked
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: EXPENSES LEDGER & ENTRY (💸 খরচ / Expenses)                        */}
      {/* ========================================================================= */}
      {activeTab === 'expenses' && (
        <div className="space-y-5">
          {/* Top Control Bar & Expense Summary */}
          <div className="bg-white p-5 lg:p-6 rounded-3xl border border-slate-100 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">💸</span>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                    Operational Expense Ledger (ব্যয় খতিয়ান)
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider border border-amber-200">
                    {filteredLedgerExpenses.length} Records
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Track inventory procurement, logistics, Meta ads, salaries, rent, and overheads
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {canManageFinances && (
                  <button
                    type="button"
                    onClick={handleOpenAddExpense}
                    className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c39e2d] text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-transform active:scale-95"
                  >
                    <Plus size={14} />
                    <span>Add Expense (নতুন খরচ)</span>
                  </button>
                )}

                {canManageFinances && expenses.length === 0 && (
                  <button
                    type="button"
                    onClick={handleSeedSampleExpenses}
                    disabled={seedingExpenses}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-bold border border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Sparkles size={13} className="text-amber-600" />
                    <span>{seedingExpenses ? 'Seeding...' : 'Seed Sample Expenses'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleExportExpensesCSV}
                  className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold border border-teal-200 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Download size={13} className="text-teal-600" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-center">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
                <input
                  type="text"
                  placeholder="Search ID, vendor, ref, note..."
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-all"
                />
              </div>

              {/* Category Filter */}
              <div>
                <select
                  value={ledgerCategory}
                  onChange={(e) => setLedgerCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden focus:border-amber-500 focus:bg-white"
                >
                  <option value="All">All Categories (সকল ক্যাটাগরি)</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Payment Method Filter */}
              <div>
                <select
                  value={ledgerPaymentFilter}
                  onChange={(e) => setLedgerPaymentFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden focus:border-amber-500 focus:bg-white"
                >
                  <option value="All">All Payment Methods (সকল মাধ্যম)</option>
                  {EXPENSE_PAYMENT_METHODS.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.icon} {pm.label}</option>
                  ))}
                </select>
              </div>

              {/* Stats pill */}
              <div className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500">Total Filtered:</span>
                <span className="font-mono font-black text-amber-700 text-xs sm:text-sm">
                  ৳{filteredLedgerExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Quick Category Chips for Fast Filtering */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setLedgerCategory('All')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  ledgerCategory === 'All'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({expenses.length})
              </button>
              {EXPENSE_CATEGORY_CONFIG.slice(0, 10).map((cfg) => {
                const count = expenses.filter(e => e.category === cfg.id).length;
                const isSelected = ledgerCategory === cfg.id;
                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => setLedgerCategory(isSelected ? 'All' : cfg.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                    {count > 0 && <span className="opacity-75 font-mono text-[10px]">({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expense Records Table */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="py-3 px-3">Expense ID & Date</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Payment Method</th>
                    <th className="py-3 px-3">Supplier / Ref / Inv</th>
                    <th className="py-3 px-3">Sub-Brand</th>
                    <th className="py-3 px-3 text-right">Amount (৳)</th>
                    <th className="py-3 px-3">Note / Details</th>
                    <th className="py-3 px-3 text-center">Added By</th>
                    <th className="py-3 px-3 text-center">Receipt</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredLedgerExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 space-y-2">
                        <span className="text-3xl block">🧾</span>
                        <p className="font-bold text-slate-600 text-sm">No expense records found</p>
                        <p className="text-xs text-slate-400">
                          {ledgerSearch || ledgerCategory !== 'All' || ledgerPaymentFilter !== 'All'
                            ? 'Try clearing the search filters or date range.'
                            : 'Click "Add Expense" to record your first operational expenditure.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredLedgerExpenses.map((exp) => {
                      const catConfig = EXPENSE_CATEGORY_CONFIG.find(c => c.id === exp.category);
                      const pmConfig = EXPENSE_PAYMENT_METHODS.find(p => p.id === exp.paymentMethod);

                      return (
                        <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Expense ID & Date / Time */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-800 text-xs">
                              {exp.expenseId || exp.id.slice(0, 10)}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {exp.date} {exp.time ? `• ${exp.time}` : ''}
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${catConfig ? `${catConfig.bg} ${catConfig.color} ${catConfig.border}` : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                              <span>{catConfig ? catConfig.icon : '📝'}</span>
                              <span>{exp.category}</span>
                            </span>
                          </td>

                          {/* Payment Method */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${pmConfig ? `${pmConfig.bg} ${pmConfig.text} ${pmConfig.border}` : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                              <span>{pmConfig ? pmConfig.icon : '💳'}</span>
                              <span>{exp.paymentMethod || 'Cash'}</span>
                            </span>
                          </td>

                          {/* Supplier / Ref / Inv */}
                          <td className="py-3 px-3 max-w-[180px]">
                            {exp.supplierName ? (
                              <div className="font-bold text-slate-800 truncate" title={exp.supplierName}>
                                {exp.supplierName}
                              </div>
                            ) : (
                              <div className="text-slate-400 italic text-[11px]">—</div>
                            )}
                            <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400 font-mono">
                              {exp.reference && <span title="Reference/TxID">Ref: {exp.reference}</span>}
                              {exp.invoiceNo && <span title="Invoice No">Inv: {exp.invoiceNo}</span>}
                            </div>
                          </td>

                          {/* Sub-Brand */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            {exp.subBrand ? (
                              <span className={`inline-block text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded-md ${
                                exp.subBrand === 'SAT' 
                                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                  : exp.subBrand === 'GZ' 
                                    ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20' 
                                    : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                              }`}>
                                {exp.subBrand}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Shared</span>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="py-3 px-3 text-right font-black text-amber-800 font-mono text-sm whitespace-nowrap">
                            ৳{Number(exp.amount).toLocaleString()}
                          </td>

                          {/* Notes */}
                          <td className="py-3 px-3 max-w-[160px] truncate text-slate-600 text-xs" title={exp.notes}>
                            {exp.notes || <span className="text-slate-300 italic text-[11px]">No notes</span>}
                          </td>

                          {/* Added By */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium text-[10px]">
                              {exp.addedBy || exp.createdBy || 'Admin'}
                            </span>
                          </td>

                          {/* Receipt */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            {exp.receiptUrl ? (
                              <button
                                type="button"
                                onClick={() => setViewingReceiptUrl(exp.receiptUrl || null)}
                                className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 hover:text-teal-800 hover:underline cursor-pointer"
                              >
                                <Eye size={12} />
                                <span>View</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-300">None</span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditExpenseClick(exp)}
                                disabled={!canManageFinances}
                                title="Edit Expense Record"
                                className="p-1.5 bg-slate-50 hover:bg-amber-50 text-slate-500 hover:text-amber-700 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                              >
                                <Edit size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExpenseClick(exp.id, exp.category, exp.amount)}
                                disabled={!canManageFinances}
                                title="Delete Expense Record"
                                className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-colors disabled:opacity-30 cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT EXPENSE (💸 খরচ যোগ / এডিট)                              */}
      {/* ========================================================================= */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 my-8 space-y-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wider mb-1 border border-amber-200">
                  💸 Expense Entry (খরচ যোগ)
                </div>
                <h3 className="text-lg font-black text-slate-800">
                  {editingExpense ? 'Edit Expense Record' : 'Record New Expense (নতুন খরচ)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddExpenseModal(false); setEditingExpense(null); }}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExpenseFormSubmit} className="space-y-4">
              {/* Expense ID (Auto) & Date/Time (Auto) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Expense ID (Auto)</label>
                  <input
                    type="text"
                    value={expenseFormId}
                    readOnly
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Date (Auto)</label>
                  <input
                    type="date"
                    value={expenseFormDate}
                    onChange={(e) => setExpenseFormDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-medium text-slate-700 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Time (Auto)</label>
                  <input
                    type="text"
                    value={expenseFormTime}
                    onChange={(e) => setExpenseFormTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-mono font-medium text-slate-700 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Category Selection Chips */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight mb-1.5">
                  Expense Category (খরচের ধরন) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50/50 rounded-2xl border border-slate-100">
                  {EXPENSE_CATEGORY_CONFIG.map((cat) => {
                    const isSelected = expenseFormCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setExpenseFormCategory(cat.id)}
                        className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-600 font-black shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50/30'
                        }`}
                      >
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold truncate">{cat.label}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount Input with Quick Increment Chips */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight">
                    Amount (টাকার পরিমাণ ৳) <span className="text-red-500">*</span>
                  </label>
                  {expenseFormAmount !== '' && (
                    <button
                      type="button"
                      onClick={() => setExpenseFormAmount('')}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 5000"
                  value={expenseFormAmount}
                  onChange={(e) => setExpenseFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3.5 text-base font-mono font-black text-slate-900 focus:outline-hidden focus:border-amber-500 focus:bg-white transition-all"
                  required
                  autoFocus
                />
                {/* Quick Increment Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[500, 1000, 2500, 5000, 10000, 25000].map((quickAmt) => (
                    <button
                      key={quickAmt}
                      type="button"
                      onClick={() => setExpenseFormAmount((prev) => (typeof prev === 'number' ? prev + quickAmt : quickAmt))}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-amber-100 hover:text-amber-900 rounded-lg text-xs font-mono font-bold text-slate-600 transition-colors border border-slate-200 cursor-pointer"
                    >
                      +৳{quickAmt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight mb-1.5">
                  Payment Method (পেমেন্ট মাধ্যম) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                  {EXPENSE_PAYMENT_METHODS.map((pm) => {
                    const isSelected = expenseFormPaymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setExpenseFormPaymentMethod(pm.id)}
                        className={`py-2 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-base">{pm.icon}</span>
                        <span className="text-[10px] font-bold truncate">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supplier/Vendor Name & Invoice/Ref No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Supplier / Vendor Name (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Guangzhou Baseus, Steadfast Courier"
                    value={expenseFormSupplierName}
                    onChange={(e) => setExpenseFormSupplierName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Invoice / Reference No (যদি থাকে)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-2026-081"
                    value={expenseFormInvoiceNo}
                    onChange={(e) => setExpenseFormInvoiceNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Reference / TxID & Sub-Brand Allocation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Reference / Transaction ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. bKash TrxID, Bank Ref, Voucher #"
                    value={expenseFormReference}
                    onChange={(e) => setExpenseFormReference(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Allocate to Sub-Brand
                  </label>
                  <select
                    value={expenseFormSubBrand}
                    onChange={(e) => setExpenseFormSubBrand(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-semibold focus:outline-hidden focus:border-amber-500 focus:bg-white"
                  >
                    <option value="">Shared (All Brands)</option>
                    <option value="SAT">Sky Auto (SAT)</option>
                    <option value="GZ">GadgetZu (GZ)</option>
                    <option value="RTX">RTX Gadget (RTX)</option>
                  </select>
                </div>
              </div>

              {/* Note / Description */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                  Note / Remarks (বিবরণ)
                </label>
                <textarea
                  placeholder="Additional details about the expense..."
                  value={expenseFormNotes}
                  onChange={(e) => setExpenseFormNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-500 focus:bg-white resize-none"
                />
              </div>

              {/* Attachment / Receipt */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                  Receipt / Proof of Payment (Optional)
                </label>
                {expenseReceiptUrl && !expenseReceiptFile ? (
                  <div className="flex items-center justify-between p-2 rounded-xl border border-slate-200 bg-slate-50">
                    <span className="text-xs text-slate-600 truncate flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-teal-600" /> Existing Receipt Attached
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingReceiptUrl(expenseReceiptUrl)}
                        className="text-xs font-bold text-teal-600 hover:underline cursor-pointer"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpenseReceiptUrl('')}
                        className="p-1 bg-red-50 text-red-500 rounded-md hover:bg-red-100 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50 hover:bg-slate-100/60 transition-colors relative cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleExpenseFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload size={16} className="text-slate-400 mb-1" />
                    <span className="text-xs text-slate-600 font-semibold">
                      {expenseReceiptFile ? expenseReceiptFile.name : 'Choose receipt image or snapshot'}
                    </span>
                    <span className="text-[9px] text-slate-400">Max size 5MB</span>
                  </div>
                )}
              </div>

              {/* Added By (Auto) */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <span>Added By (Auto):</span>
                <span className="font-bold text-slate-700">{user.name || user.email || 'Admin'}</span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddExpenseModal(false); setEditingExpense(null); }}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="flex-1 py-3 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#c39e2d] text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  {isSubmittingExpense ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Recording Expense...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      {editingExpense ? 'Update Expense' : 'Confirm & Record Expense'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT INCOME                                                  */}
      {/* ========================================================================= */}
      {showAddIncomeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 my-8 space-y-5 animate-scale-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider mb-1">
                  💵 Income Entry (আয় যোগ)
                </div>
                <h3 className="text-lg font-black text-slate-800">
                  {editingIncome ? 'Edit Income Record' : 'Record New Income (নতুন আয়)'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowAddIncomeModal(false); setEditingIncome(null); }}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleIncomeFormSubmit} className="space-y-4">
              {/* Income ID (Auto) & Date/Time (Auto) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Income ID (Auto)</label>
                  <input
                    type="text"
                    value={incomeFormId}
                    readOnly
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-slate-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Date (Auto)</label>
                  <input
                    type="date"
                    value={incomeFormDate}
                    onChange={(e) => setIncomeFormDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-medium text-slate-700 focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Time (Auto)</label>
                  <input
                    type="text"
                    value={incomeFormTime}
                    onChange={(e) => setIncomeFormTime(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-medium text-slate-700 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Income Category Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight mb-2">
                  Income Category (আয়ের ধরন) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {INCOME_CATEGORY_CONFIG.map((cat) => {
                    const isSelected = incomeFormCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setIncomeFormCategory(cat.id)}
                        className={`p-2.5 rounded-2xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-700 text-white shadow-sm ring-2 ring-emerald-300'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-lg">{cat.icon}</span>
                        <span className="text-xs font-bold leading-tight line-clamp-2">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount (৳) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight">
                    Amount (টাকার পরিমাণ ৳) <span className="text-red-500">*</span>
                  </label>
                  {incomeFormAmount !== '' && (
                    <button
                      type="button"
                      onClick={() => setIncomeFormAmount('')}
                      className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 2500"
                  value={incomeFormAmount}
                  onChange={(e) => setIncomeFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-3.5 text-base font-mono font-black text-slate-900 focus:outline-hidden focus:border-emerald-500 focus:bg-white transition-all"
                  required
                  autoFocus
                />
                {/* Quick Increment Chips */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[500, 1000, 2500, 5000, 10000, 25000].map((quickAmt) => (
                    <button
                      key={quickAmt}
                      type="button"
                      onClick={() => setIncomeFormAmount((prev) => (typeof prev === 'number' ? prev + quickAmt : quickAmt))}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-emerald-100 hover:text-emerald-900 rounded-lg text-xs font-mono font-bold text-slate-600 transition-colors border border-slate-200 cursor-pointer"
                    >
                      +৳{quickAmt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-tight mb-1.5">
                  Payment Method (পেমেন্ট মাধ্যম) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {PAYMENT_METHODS.map((pm) => {
                    const isSelected = incomeFormPaymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setIncomeFormPaymentMethod(pm.id)}
                        className={`py-2 px-1.5 rounded-xl border text-center flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-slate-900 border-slate-900 text-white font-bold shadow-xs'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-base">{pm.icon}</span>
                        <span className="text-[10px] font-bold truncate">{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Name & Invoice No */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Customer / Client Name (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rahim Ahmed"
                    value={incomeFormCustomerName}
                    onChange={(e) => setIncomeFormCustomerName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Invoice No (যদি থাকে)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-202608-001"
                    value={incomeFormInvoiceNo}
                    onChange={(e) => setIncomeFormInvoiceNo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Reference / TxID & Sub-Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Reference / Transaction ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. bKash TrxID, Bank Ref"
                    value={incomeFormReference}
                    onChange={(e) => setIncomeFormReference(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                    Allocate to Sub-Brand
                  </label>
                  <select
                    value={incomeFormSubBrand}
                    onChange={(e) => setIncomeFormSubBrand(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-semibold focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  >
                    <option value="">Shared (All Brands)</option>
                    <option value="SAT">Sky Auto (SAT)</option>
                    <option value="GZ">GadgetZu (GZ)</option>
                    <option value="RTX">RTX Gadget (RTX)</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-tight mb-1">
                  Note / Remarks (বিবরণ)
                </label>
                <textarea
                  placeholder="Additional notes about this income transaction..."
                  value={incomeFormNotes}
                  onChange={(e) => setIncomeFormNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white resize-none"
                />
              </div>

              {/* Added By (Auto) */}
              <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                <span>Added By (Auto):</span>
                <span className="font-bold text-slate-700">{user.name || user.email || 'Admin'}</span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddIncomeModal(false); setEditingIncome(null); }}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingIncome}
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-md"
                >
                  {isSubmittingIncome ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Recording...
                    </>
                  ) : (
                    <>
                      <Check size={16} />
                      {editingIncome ? 'Update Income' : 'Confirm & Record Income'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL: View attached receipt */}
      {viewingReceiptUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4 backdrop-blur-xs">
          <div className="relative max-w-3xl w-full flex flex-col gap-3">
            <button
              onClick={() => setViewingReceiptUrl(null)}
              className="absolute -top-10 right-0 bg-slate-900 border border-slate-700 text-white p-2 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
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
