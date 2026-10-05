import React, { useState, useEffect, useMemo } from 'react';
import { 
  Landmark, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Package, 
  AlertTriangle, 
  Plus, 
  Calendar, 
  Download, 
  ShoppingBag, 
  Trash2, 
  Edit, 
  Check, 
  X, 
  Search, 
  Filter, 
  ChevronRight, 
  RefreshCw, 
  Sparkles,
  Building,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  FileSpreadsheet,
  Lock
} from 'lucide-react';
import { 
  UserProfile, 
  Product, 
  Order, 
  Expense, 
  StockLog, 
  SupplierPayment,
  InvestmentEntry,
  CompanyPurchase,
  CompanyLoss,
  CompanyPurchaseCategory,
  CompanyLossType,
  CashReconciliation,
  CashBalanceSettings
} from '../types';
import { 
  getOrders, 
  getExpenses, 
  getStockLogs, 
  getSupplierPayments,
  getInvestments,
  ensureInitialInvestmentIfEmpty,
  addInvestment,
  updateInvestment,
  deleteInvestment,
  getCompanyPurchases,
  addCompanyPurchase,
  updateCompanyPurchase,
  deleteCompanyPurchase,
  getCompanyLosses,
  addCompanyLoss,
  updateCompanyLoss,
  deleteCompanyLoss,
  getCashBalanceSettings,
  setCashBalanceSettings,
  getCashReconciliations,
  addCashReconciliation
} from '../firebase/db';

interface AccountingOverviewProps {
  user: UserProfile;
  products: Product[];
  onRefreshData?: () => void;
  onNavigateToTab?: (tab: string, subAction?: string, initialId?: string | null) => void;
}

export const COMPANY_PURCHASE_CATEGORIES: CompanyPurchaseCategory[] = [
  'Equipment',
  'Furniture',
  'Vehicle',
  'Electronics',
  'Packaging Supplies',
  'Other'
];

export const COMPANY_LOSS_TYPES: CompanyLossType[] = [
  'Damaged Stock',
  'Bad Debt Written Off',
  'Theft/Missing Inventory',
  'Clearance Sale Loss',
  'Other'
];

export default function AccountingOverview({
  user,
  products,
  onRefreshData,
  onNavigateToTab
}: AccountingOverviewProps) {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'purchases' | 'losses' | 'loss_orders'>('overview');

  // Master Data
  const [orders, setOrders] = useState<Order[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [companyPurchases, setCompanyPurchases] = useState<CompanyPurchase[]>([]);
  const [companyLosses, setCompanyLosses] = useState<CompanyLoss[]>([]);
  const [cashSettings, setCashSettings] = useState<CashBalanceSettings>({ openingBalance: 0 });
  const [cashReconciliations, setCashReconciliations] = useState<CashReconciliation[]>([]);
  const [loading, setLoading] = useState(true);

  // Global Time Period Filter for calculations
  const [timePeriod, setTimePeriod] = useState<'all' | 'year' | 'month' | 'week' | 'today'>('all');
  const [subBrandFilter, setSubBrandFilter] = useState<'ALL' | 'SAT' | 'GZ' | 'RTX'>('ALL');

  // Modal States
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<InvestmentEntry | null>(null);
  const [invAmount, setInvAmount] = useState<number | ''>('');
  const [invDate, setInvDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [invNote, setInvNote] = useState('');
  const [invSubBrand, setInvSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL' | ''>('');

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<CompanyPurchase | null>(null);
  const [purItemName, setPurItemName] = useState('');
  const [purCategory, setPurCategory] = useState<CompanyPurchaseCategory>('Equipment');
  const [purAmount, setPurAmount] = useState<number | ''>('');
  const [purDate, setPurDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [purVendor, setPurVendor] = useState('');
  const [purNotes, setPurNotes] = useState('');
  const [purSubBrand, setPurSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL' | ''>('');

  const [showLossModal, setShowLossModal] = useState(false);
  const [editingLoss, setEditingLoss] = useState<CompanyLoss | null>(null);
  const [lossType, setLossType] = useState<CompanyLossType>('Damaged Stock');
  const [lossAmount, setLossAmount] = useState<number | ''>('');
  const [lossDate, setLossDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [lossNotes, setLossNotes] = useState('');
  const [lossLinkedProductId, setLossLinkedProductId] = useState('');
  const [lossCustomerName, setLossCustomerName] = useState('');
  const [lossSubBrand, setLossSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL' | ''>('');

  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [reconcileNote, setReconcileNote] = useState('');

  const [showOpeningBalanceModal, setShowOpeningBalanceModal] = useState(false);
  const [newOpeningBalance, setNewOpeningBalance] = useState<number | ''>('');

  // Search & Filters within lists
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseCategoryFilter, setPurchaseCategoryFilter] = useState<string>('All');
  const [lossSearch, setLossSearch] = useState('');
  const [lossTypeFilter, setLossTypeFilter] = useState<string>('All');
  const [lossOrderSearch, setLossOrderSearch] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [
        oList, 
        eList, 
        sList, 
        spList, 
        iList, 
        cpList, 
        clList, 
        cSettings, 
        crList
      ] = await Promise.all([
        getOrders(),
        getExpenses(),
        getStockLogs(),
        getSupplierPayments(),
        getInvestments(),
        getCompanyPurchases(),
        getCompanyLosses(),
        getCashBalanceSettings(),
        getCashReconciliations()
      ]);
      setOrders(oList || []);
      setExpenses(eList || []);
      setStockLogs(sList || []);
      setSupplierPayments(spList || []);
      let finalInvestments = iList || [];
      if (finalInvestments.length === 0) {
        await ensureInitialInvestmentIfEmpty();
        finalInvestments = (await getInvestments()) || [];
      }
      setInvestments(finalInvestments);
      setCompanyPurchases(cpList || []);
      setCompanyLosses(clList || []);
      if (cSettings) setCashSettings(cSettings);
      setCashReconciliations(crList || []);
    } catch (err: any) {
      console.error('Failed to load accounting data:', err);
      setErrorMsg('Failed to load accounting records.');
    } finally {
      setLoading(false);
    }
  };

  // Helper date window
  const dateWindow = useMemo(() => {
    const now = new Date();
    let start = 0;
    const end = Infinity;

    if (timePeriod === 'today') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      start = d.getTime();
    } else if (timePeriod === 'week') {
      const day = now.getDay();
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
      start = d.getTime();
    } else if (timePeriod === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      start = d.getTime();
    } else if (timePeriod === 'year') {
      const d = new Date(now.getFullYear(), 0, 1);
      start = d.getTime();
    }

    return { start, end };
  }, [timePeriod]);

  // Product cost map (Product ID -> unit cost price)
  const productCostMap = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => {
      map.set(p.id, p.costPrice || 0);
    });
    return map;
  }, [products]);

  // =========================================================================
  // 1. TOTAL INVESTMENT
  // =========================================================================
  const totalInvestmentAllTime = useMemo(() => {
    return investments.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  }, [investments]);

  // Filtered investments
  const filteredInvestments = useMemo(() => {
    return investments.filter(inv => {
      const matchBrand = subBrandFilter === 'ALL' || inv.subBrand === subBrandFilter || inv.subBrand === 'ALL' || !inv.subBrand;
      const invTime = inv.createdAt || new Date(inv.date + 'T00:00:00').getTime();
      const matchDate = invTime >= dateWindow.start && invTime <= dateWindow.end;
      return matchBrand && matchDate;
    });
  }, [investments, subBrandFilter, dateWindow]);

  const totalInvestmentPeriod = useMemo(() => {
    return filteredInvestments.reduce((sum, inv) => sum + (inv.amount || 0), 0);
  }, [filteredInvestments]);

  // =========================================================================
  // 2. TOTAL PROFIT (Comprehensive Business Profit)
  // =========================================================================
  const profitMetrics = useMemo(() => {
    // A. Confirmed & Delivered Orders
    const confirmedOrders = orders.filter(o => {
      const isConfirmed = o.status === 'Confirmed' || o.status === 'Packed' || o.status === 'Shipped' || o.status === 'Delivered';
      const matchBrand = subBrandFilter === 'ALL' || o.subBrand === subBrandFilter;
      const oTime = o.createdAt;
      const matchDate = oTime >= dateWindow.start && oTime <= dateWindow.end;
      return isConfirmed && matchBrand && matchDate;
    });

    const totalSalesRevenue = confirmedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // B. Total Product Cost (from Stock In purchases / or COGS on confirmed orders)
    // First, sum stock in logs in period
    const inLogs = stockLogs.filter(log => {
      const isIn = log.type === 'stock_in' || log.qty > 0;
      const logTime = log.timestamp;
      const matchDate = logTime >= dateWindow.start && logTime <= dateWindow.end;
      return isIn && matchDate;
    });

    const totalStockInPurchases = inLogs.reduce((sum, log) => {
      const price = log.purchasePrice ?? (productCostMap.get(log.productId) || 0);
      return sum + (price * Math.abs(log.qty));
    }, 0);

    // Also calculate COGS of confirmed orders as alternate view
    const totalOrderCOGS = confirmedOrders.reduce((sum, order) => {
      const orderCost = (order.items || []).reduce((itemSum, item) => {
        const unitCost = productCostMap.get(item.productId) ?? (item.unitPrice * 0.7);
        return itemSum + (unitCost * item.qty);
      }, 0);
      return sum + orderCost;
    }, 0);

    // We use stock-in purchases if recorded, otherwise fallback to order COGS
    const effectiveProductCost = totalStockInPurchases > 0 ? totalStockInPurchases : totalOrderCOGS;

    // C. Total Other Business Expenses (from existing Expense entries)
    const periodExpenses = expenses.filter(exp => {
      const matchBrand = subBrandFilter === 'ALL' || exp.subBrand === subBrandFilter || exp.subBrand === 'ALL' || !exp.subBrand;
      const expTime = exp.createdAt || new Date(exp.date + 'T00:00:00').getTime();
      const matchDate = expTime >= dateWindow.start && expTime <= dateWindow.end;
      return matchBrand && matchDate;
    });
    const totalExpenses = periodExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // D. Total Company Purchases / Assets
    const periodPurchases = companyPurchases.filter(cp => {
      const matchBrand = subBrandFilter === 'ALL' || cp.subBrand === subBrandFilter || cp.subBrand === 'ALL' || !cp.subBrand;
      const cpTime = cp.createdAt || new Date(cp.purchaseDate + 'T00:00:00').getTime();
      const matchDate = cpTime >= dateWindow.start && cpTime <= dateWindow.end;
      return matchBrand && matchDate;
    });
    const totalCompanyPurchases = periodPurchases.reduce((sum, cp) => sum + (cp.amount || 0), 0);

    // E. Total Company Losses
    const periodLosses = companyLosses.filter(cl => {
      const matchBrand = subBrandFilter === 'ALL' || cl.subBrand === subBrandFilter || cl.subBrand === 'ALL' || !cl.subBrand;
      const clTime = cl.createdAt || new Date(cl.date + 'T00:00:00').getTime();
      const matchDate = clTime >= dateWindow.start && clTime <= dateWindow.end;
      return matchBrand && matchDate;
    });
    const totalCompanyLosses = periodLosses.reduce((sum, cl) => sum + (cl.amount || 0), 0);

    // Net Business Profit
    const netBusinessProfit = totalSalesRevenue - effectiveProductCost - totalExpenses - totalCompanyPurchases - totalCompanyLosses;

    return {
      totalSalesRevenue,
      confirmedOrdersCount: confirmedOrders.length,
      totalStockInPurchases,
      totalOrderCOGS,
      effectiveProductCost,
      totalExpenses,
      expensesCount: periodExpenses.length,
      totalCompanyPurchases,
      purchasesCount: periodPurchases.length,
      totalCompanyLosses,
      lossesCount: periodLosses.length,
      netBusinessProfit
    };
  }, [orders, stockLogs, expenses, companyPurchases, companyLosses, subBrandFilter, dateWindow, productCostMap]);

  // All-time Net Profit for Dashboard Widget
  const allTimeNetProfit = useMemo(() => {
    const rev = orders
      .filter(o => o.status === 'Confirmed' || o.status === 'Packed' || o.status === 'Shipped' || o.status === 'Delivered')
      .reduce((s, o) => s + (o.totalAmount || 0), 0);

    const cogs = orders
      .filter(o => o.status === 'Confirmed' || o.status === 'Packed' || o.status === 'Shipped' || o.status === 'Delivered')
      .reduce((s, o) => {
        return s + (o.items || []).reduce((is, item) => {
          const cost = productCostMap.get(item.productId) ?? (item.unitPrice * 0.7);
          return is + (cost * item.qty);
        }, 0);
      }, 0);

    const exp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const cp = companyPurchases.reduce((s, c) => s + (c.amount || 0), 0);
    const cl = companyLosses.reduce((s, l) => s + (l.amount || 0), 0);

    return rev - cogs - exp - cp - cl;
  }, [orders, expenses, companyPurchases, companyLosses, productCostMap]);

  // =========================================================================
  // 3. CASH ON HAND TRACKER
  // =========================================================================
  const cashMetrics = useMemo(() => {
    const opening = cashSettings.openingBalance || 0;

    // + Cash payments received from customers (Paid or partially paid with Cash)
    let cashFromOrders = 0;
    let totalAllReceivablesCollected = 0;

    orders.forEach(order => {
      if (order.paymentHistory && order.paymentHistory.length > 0) {
        order.paymentHistory.forEach(ph => {
          totalAllReceivablesCollected += (ph.amount || 0);
          if (ph.method === 'Cash') {
            cashFromOrders += (ph.amount || 0);
          }
        });
      } else if (order.amountPaid > 0) {
        totalAllReceivablesCollected += order.amountPaid;
        if (order.paymentMethod === 'Cash') {
          cashFromOrders += order.amountPaid;
        }
      }
    });

    // − Cash spent on Stock In purchases (where paymentMethod or reason is Cash)
    // For general stock in, assume cash unless specified
    const cashSpentOnStockIn = stockLogs
      .filter(l => (l.type === 'stock_in' || l.qty > 0) && (l as any).paymentMethod === 'Cash')
      .reduce((sum, l) => sum + ((l.purchasePrice || (productCostMap.get(l.productId) || 0)) * Math.abs(l.qty)), 0);

    // − Cash spent on Expenses
    const cashSpentOnExpenses = expenses
      .filter(e => e.paymentMethod === 'Cash')
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    // − Cash spent on Company Purchases (all company asset purchases default to cash/bank outflow)
    const cashSpentOnPurchases = companyPurchases
      .reduce((sum, cp) => sum + (cp.amount || 0), 0);

    // − Cash paid to Suppliers
    const cashPaidToSuppliers = supplierPayments
      .filter(sp => sp.paymentMethod === 'Cash')
      .reduce((sum, sp) => sum + (sp.amount || 0), 0);

    // Calculated Cash In Hand
    const calculatedCashOnHand = opening + cashFromOrders - cashSpentOnStockIn - cashSpentOnExpenses - cashSpentOnPurchases - cashPaidToSuppliers;

    // Total Liquid Funds (all collections minus all expenses)
    const allExpensesOutflow = expenses.reduce((s, e) => s + (e.amount || 0), 0) + companyPurchases.reduce((s, cp) => s + (cp.amount || 0), 0) + supplierPayments.reduce((s, sp) => s + (sp.amount || 0), 0);
    const totalLiquidFunds = opening + totalAllReceivablesCollected - allExpensesOutflow;

    return {
      opening,
      cashFromOrders,
      totalAllReceivablesCollected,
      cashSpentOnStockIn,
      cashSpentOnExpenses,
      cashSpentOnPurchases,
      cashPaidToSuppliers,
      calculatedCashOnHand,
      totalLiquidFunds
    };
  }, [cashSettings, orders, stockLogs, expenses, companyPurchases, supplierPayments, productCostMap]);

  // =========================================================================
  // 4. INVENTORY VALUE (At Cost vs At Retail)
  // =========================================================================
  const inventoryValuation = useMemo(() => {
    let totalCostAll = 0;
    let totalRetailAll = 0;
    let totalStockUnits = 0;

    const brandStats: Record<string, { cost: number; retail: number; qty: number; products: number }> = {
      SAT: { cost: 0, retail: 0, qty: 0, products: 0 },
      GZ: { cost: 0, retail: 0, qty: 0, products: 0 },
      RTX: { cost: 0, retail: 0, qty: 0, products: 0 }
    };

    products.filter(prod => prod.status === 'approved' && !prod.archived).forEach(prod => {
      const brand = (prod.subBrand as 'SAT' | 'GZ' | 'RTX') || 'SAT';
      if (!brandStats[brand]) {
        brandStats[brand] = { cost: 0, retail: 0, qty: 0, products: 0 };
      }
      brandStats[brand].products += 1;

      if (prod.variants && prod.variants.length > 0) {
        prod.variants.forEach(v => {
          const qty = v.stock || 0;
          const cost = prod.costPrice || 0;
          const retail = prod.sellingPrice || 0;

          const itemCostVal = cost * qty;
          const itemRetailVal = retail * qty;

          totalCostAll += itemCostVal;
          totalRetailAll += itemRetailVal;
          totalStockUnits += qty;

          brandStats[brand].cost += itemCostVal;
          brandStats[brand].retail += itemRetailVal;
          brandStats[brand].qty += qty;
        });
      } else {
        const qty = prod.totalStock || 0;
        const cost = prod.costPrice || 0;
        const retail = prod.sellingPrice || 0;

        const itemCostVal = cost * qty;
        const itemRetailVal = retail * qty;

        totalCostAll += itemCostVal;
        totalRetailAll += itemRetailVal;
        totalStockUnits += qty;

        brandStats[brand].cost += itemCostVal;
        brandStats[brand].retail += itemRetailVal;
        brandStats[brand].qty += qty;
      }
    });

    const potentialGrossProfit = totalRetailAll - totalCostAll;
    const potentialMarginPercent = totalRetailAll > 0 ? (potentialGrossProfit / totalRetailAll) * 100 : 0;

    return {
      totalCostAll,
      totalRetailAll,
      totalStockUnits,
      potentialGrossProfit,
      potentialMarginPercent,
      brandStats
    };
  }, [products]);

  // =========================================================================
  // 7. PER-TRANSACTION PROFIT/LOSS & LOSS-MAKING ORDERS
  // =========================================================================
  const orderProfitAnalysis = useMemo(() => {
    return orders.map(order => {
      let orderCost = 0;
      let orderRevenue = order.totalAmount || 0;
      const lineItemProfits: {
        productName: string;
        variantLabel: string;
        qty: number;
        unitPrice: number;
        costPrice: number;
        lineProfit: number;
        isLoss: boolean;
      }[] = [];

      (order.items || []).forEach(item => {
        const unitCost = productCostMap.get(item.productId) ?? (item.unitPrice * 0.7);
        const lineCost = unitCost * item.qty;
        const lineRev = item.unitPrice * item.qty;
        const lineProfit = lineRev - lineCost;
        orderCost += lineCost;

        lineItemProfits.push({
          productName: item.productName,
          variantLabel: item.variantLabel,
          qty: item.qty,
          unitPrice: item.unitPrice,
          costPrice: unitCost,
          lineProfit,
          isLoss: lineProfit < 0
        });
      });

      const netOrderProfit = orderRevenue - orderCost;
      const isLossOrder = netOrderProfit < 0;

      return {
        order,
        orderRevenue,
        orderCost,
        netOrderProfit,
        isLossOrder,
        lineItemProfits
      };
    });
  }, [orders, productCostMap]);

  const lossMakingOrders = useMemo(() => {
    return orderProfitAnalysis
      .filter(item => item.isLossOrder || item.lineItemProfits.some(l => l.isLoss))
      .filter(item => {
        if (!lossOrderSearch.trim()) return true;
        const q = lossOrderSearch.toLowerCase();
        return (
          item.order.id.toLowerCase().includes(q) ||
          item.order.customerName.toLowerCase().includes(q) ||
          item.order.customerPhone.includes(q) ||
          item.order.items.some(i => i.productName.toLowerCase().includes(q))
        );
      });
  }, [orderProfitAnalysis, lossOrderSearch]);

  // =========================================================================
  // ACTIONS / HANDLERS
  // =========================================================================

  // 1. Add / Edit Investment (One-Time Only Guard)
  const isInvestmentLocked = investments.length > 0;

  const handleOpenAddInvestment = () => {
    if (isInvestmentLocked) {
      setErrorMsg('ব্যবসায়িক মূলধন বিনিয়োগ একবারই প্রযোজ্য (One-Time Capital Investment)। নতুন বিনিয়োগ যোগ করার সুযোগ বন্ধ (Locked) রাখা হয়েছে।');
      setTimeout(() => setErrorMsg(''), 4500);
      return;
    }
    setEditingInvestment(null);
    setInvAmount('');
    setInvDate(new Date().toISOString().split('T')[0]);
    setInvNote('');
    setInvSubBrand('');
    setShowInvestmentModal(true);
  };

  const handleEditInvestment = (inv: InvestmentEntry) => {
    setEditingInvestment(inv);
    setInvAmount(inv.amount);
    setInvDate(inv.date);
    setInvNote(inv.note);
    setInvSubBrand(inv.subBrand || '');
    setShowInvestmentModal(true);
  };

  const handleSaveInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingInvestment && isInvestmentLocked) {
      setErrorMsg('ব্যবসায়িক মূলধন বিনিয়োগ একবারই প্রযোজ্য (One-Time Capital Investment)। আর নতুন বিনিয়োগ যোগ করা যাবে না।');
      setTimeout(() => setErrorMsg(''), 4500);
      return;
    }
    if (!invAmount || Number(invAmount) <= 0) {
      setErrorMsg('Please enter a valid investment amount.');
      return;
    }
    try {
      if (editingInvestment) {
        await updateInvestment(editingInvestment.id, {
          amount: Number(invAmount),
          date: invDate,
          note: invNote.trim(),
          subBrand: invSubBrand || undefined
        });
        setSuccessMsg('Investment entry updated successfully.');
      } else {
        await addInvestment({
          amount: Number(invAmount),
          date: invDate,
          note: invNote.trim(),
          subBrand: invSubBrand || undefined,
          createdBy: user.name || user.email || 'Super Admin',
          createdAt: Date.now()
        });
        setSuccessMsg('Initial capital investment recorded successfully.');
      }
      setShowInvestmentModal(false);
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg('Failed to save investment: ' + (err.message || err));
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleDeleteInvestment = async (id: string) => {
    if (!confirm('সতর্কতা: এটি আপনার ব্যবসার এককালীন মূলধন বিনিয়োগ (Initial Investment)। আপনি কি নিশ্চিত এটি ডিলিট করতে চান?')) return;
    try {
      await deleteInvestment(id);
      setSuccessMsg('Investment record removed.');
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg('Failed to delete investment: ' + (err.message || err));
    }
  };

  // 2. Add / Edit Company Purchase
  const handleOpenAddPurchase = () => {
    setEditingPurchase(null);
    setPurItemName('');
    setPurCategory('Equipment');
    setPurAmount('');
    setPurDate(new Date().toISOString().split('T')[0]);
    setPurVendor('');
    setPurNotes('');
    setPurSubBrand('');
    setShowPurchaseModal(true);
  };

  const handleEditPurchase = (cp: CompanyPurchase) => {
    setEditingPurchase(cp);
    setPurItemName(cp.itemName);
    setPurCategory(cp.category);
    setPurAmount(cp.amount);
    setPurDate(cp.purchaseDate);
    setPurVendor(cp.vendor || '');
    setPurNotes(cp.notes || '');
    setPurSubBrand(cp.subBrand || '');
    setShowPurchaseModal(true);
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purItemName.trim() || !purAmount || Number(purAmount) <= 0) {
      setErrorMsg('Please enter item name and valid purchase amount.');
      return;
    }
    try {
      if (editingPurchase) {
        await updateCompanyPurchase(editingPurchase.id, {
          itemName: purItemName.trim(),
          category: purCategory,
          amount: Number(purAmount),
          purchaseDate: purDate,
          vendor: purVendor.trim() || undefined,
          notes: purNotes.trim() || undefined,
          subBrand: purSubBrand || undefined
        });
        setSuccessMsg('Company asset purchase updated.');
      } else {
        await addCompanyPurchase({
          itemName: purItemName.trim(),
          category: purCategory,
          amount: Number(purAmount),
          purchaseDate: purDate,
          vendor: purVendor.trim() || undefined,
          notes: purNotes.trim() || undefined,
          subBrand: purSubBrand || undefined,
          createdBy: user.name || user.email || 'Super Admin',
          createdAt: Date.now()
        });
        setSuccessMsg('New company purchase recorded.');
      }
      setShowPurchaseModal(false);
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg('Failed to save purchase: ' + (err.message || err));
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleDeletePurchase = async (id: string) => {
    if (!confirm('Are you sure you want to delete this company asset purchase record?')) return;
    try {
      await deleteCompanyPurchase(id);
      setSuccessMsg('Company purchase record deleted.');
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg('Failed to delete purchase: ' + (err.message || err));
    }
  };

  // 3. Add / Edit Company Loss
  const handleOpenAddLoss = () => {
    setEditingLoss(null);
    setLossType('Damaged Stock');
    setLossAmount('');
    setLossDate(new Date().toISOString().split('T')[0]);
    setLossNotes('');
    setLossLinkedProductId('');
    setLossCustomerName('');
    setLossSubBrand('');
    setShowLossModal(true);
  };

  const handleEditLoss = (cl: CompanyLoss) => {
    setEditingLoss(cl);
    setLossType(cl.lossType);
    setLossAmount(cl.amount);
    setLossDate(cl.date);
    setLossNotes(cl.notes || '');
    setLossLinkedProductId(cl.linkedProductId || '');
    setLossCustomerName(cl.linkedCustomerName || '');
    setLossSubBrand(cl.subBrand || '');
    setShowLossModal(true);
  };

  const handleSaveLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lossAmount || Number(lossAmount) <= 0) {
      setErrorMsg('Please enter a valid loss amount.');
      return;
    }
    const linkedProd = products.find(p => p.id === lossLinkedProductId);
    try {
      if (editingLoss) {
        await updateCompanyLoss(editingLoss.id, {
          lossType,
          amount: Number(lossAmount),
          date: lossDate,
          notes: lossNotes.trim() || undefined,
          linkedProductId: lossLinkedProductId || undefined,
          linkedProductName: linkedProd ? linkedProd.name : undefined,
          linkedCustomerName: lossCustomerName.trim() || undefined,
          subBrand: lossSubBrand || undefined
        });
        setSuccessMsg('Company loss record updated.');
      } else {
        await addCompanyLoss({
          lossType,
          amount: Number(lossAmount),
          date: lossDate,
          notes: lossNotes.trim() || undefined,
          linkedProductId: lossLinkedProductId || undefined,
          linkedProductName: linkedProd ? linkedProd.name : undefined,
          linkedCustomerName: lossCustomerName.trim() || undefined,
          subBrand: lossSubBrand || undefined,
          createdBy: user.name || user.email || 'Super Admin',
          createdAt: Date.now()
        });
        setSuccessMsg('New business loss logged.');
      }
      setShowLossModal(false);
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg('Failed to save loss: ' + (err.message || err));
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleDeleteLoss = async (id: string) => {
    if (!confirm('Are you sure you want to delete this business loss record?')) return;
    try {
      await deleteCompanyLoss(id);
      setSuccessMsg('Company loss record deleted.');
      await fetchAllData();
      if (onRefreshData) onRefreshData();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg('Failed to delete loss: ' + (err.message || err));
    }
  };

  // 4. Cash Reconciliation
  const handleSaveReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countedCash === '' || Number(countedCash) < 0) {
      setErrorMsg('Please enter the counted cash amount.');
      return;
    }
    const actual = Number(countedCash);
    const calculated = cashMetrics.calculatedCashOnHand;
    const diff = actual - calculated;

    try {
      await addCashReconciliation({
        actualAmount: actual,
        calculatedAmount: calculated,
        difference: diff,
        note: reconcileNote.trim() || undefined,
        reconciledBy: user.name || user.email || 'Super Admin',
        createdAt: Date.now(),
        date: new Date().toISOString().split('T')[0]
      });

      // Update cashSettings
      await setCashBalanceSettings({
        lastReconciledAt: Date.now(),
        lastReconciledAmount: actual,
        reconciledBy: user.name || user.email || 'Super Admin'
      });

      setSuccessMsg('Cash balance reconciled and audit logged.');
      setShowReconcileModal(false);
      setCountedCash('');
      setReconcileNote('');
      await fetchAllData();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg('Failed to record reconciliation: ' + (err.message || err));
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleSaveOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOpeningBalance === '' || Number(newOpeningBalance) < 0) {
      setErrorMsg('Please enter a valid opening balance.');
      return;
    }
    try {
      await setCashBalanceSettings({
        openingBalance: Number(newOpeningBalance)
      });
      setSuccessMsg('Opening cash balance baseline updated.');
      setShowOpeningBalanceModal(false);
      await fetchAllData();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err: any) {
      setErrorMsg('Failed to update opening balance: ' + (err.message || err));
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // CSV Export for Accounting Report
  const handleExportAccountingCSV = () => {
    const rows = [
      ['ACCOUNTING & FINANCIAL HEALTH SUMMARY'],
      ['Generated On', new Date().toLocaleString()],
      ['Sub-Brand Filter', subBrandFilter],
      ['Time Period', timePeriod],
      [''],
      ['1. CAPITAL INVESTMENT'],
      ['Total Investment (All-Time)', totalInvestmentAllTime],
      ['Total Investment (Period)', totalInvestmentPeriod],
      [''],
      ['2. COMPREHENSIVE PROFIT CALCULATION'],
      ['Sales Revenue (Confirmed Orders)', profitMetrics.totalSalesRevenue],
      ['Less: Product Cost', -profitMetrics.effectiveProductCost],
      ['Less: Operational Expenses', -profitMetrics.totalExpenses],
      ['Less: Company Purchases / Assets', -profitMetrics.totalCompanyPurchases],
      ['Less: Company Losses', -profitMetrics.totalCompanyLosses],
      ['= Net Business Profit', profitMetrics.netBusinessProfit],
      [''],
      ['3. CASH POSITION'],
      ['Opening Cash Balance', cashMetrics.opening],
      ['Total Cash Received From Orders', cashMetrics.cashFromOrders],
      ['Less: Cash Spent on Stock In', -cashMetrics.cashSpentOnStockIn],
      ['Less: Cash Spent on Expenses', -cashMetrics.cashSpentOnExpenses],
      ['Less: Cash Spent on Assets', -cashMetrics.cashSpentOnPurchases],
      ['Less: Cash Paid to Suppliers', -cashMetrics.cashPaidToSuppliers],
      ['= Calculated Physical Cash on Hand', cashMetrics.calculatedCashOnHand],
      ['Total Liquid Funds (All Methods)', cashMetrics.totalLiquidFunds],
      [''],
      ['4. INVENTORY VALUATION'],
      ['Total Units in Stock', inventoryValuation.totalStockUnits],
      ['Total Inventory Value at Cost', inventoryValuation.totalCostAll],
      ['Total Inventory Value at Retail', inventoryValuation.totalRetailAll],
      ['Potential Gross Profit', inventoryValuation.potentialGrossProfit],
      ['Potential Profit Margin %', inventoryValuation.potentialMarginPercent.toFixed(2) + '%']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(r => r.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `accounting_financial_health_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setSuccessMsg('Accounting report exported to CSV successfully.');
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header Card - Standard Compact Size */}
      <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] rounded-md font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Landmark size={11} />
                <span>Super Admin</span>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                Accounting & Equity
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>BUSINESS ACCOUNTING & EQUITY</span>
            </h1>
            <p className="text-slate-400 text-xs mt-0.5 line-clamp-1">
              Capital investments, net profit, liquid cash, inventory assets & loss auditing.
            </p>
          </div>

          {/* Quick Actions & Navigation to Day-to-Day Financials */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAddPurchase}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <Building size={13} />
              <span>+ Purchase</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddLoss}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <AlertTriangle size={13} />
              <span>+ Record Loss</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigateToTab && onNavigateToTab('financials')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              title="Open day-to-day revenue & cost entries"
            >
              <Receipt size={13} className="text-[#D4AF37]" />
              <span>Income & Expense ↗</span>
            </button>

            <button
              type="button"
              onClick={handleExportAccountingCSV}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 rounded-xl transition-all cursor-pointer"
              title="Export complete accounting summary to CSV"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Global Filter Bar inside Header */}
        <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-950/70 p-1 rounded-xl border border-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'overview'
                  ? 'bg-[#D4AF37] text-slate-950 font-black shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp size={12} />
              <span>Overview & Balances</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-blue-500 text-white font-black shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building size={12} />
              <span>Company Assets ({companyPurchases.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('losses')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'losses'
                  ? 'bg-rose-500 text-white font-black shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <AlertTriangle size={12} />
              <span>Company Losses ({companyLosses.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('loss_orders')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'loss_orders'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldAlert size={12} />
              <span>Loss Orders ({lossMakingOrders.length})</span>
            </button>
          </div>

          {/* Sub-brand & Period Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Period selector */}
            <div className="flex items-center bg-slate-950/70 p-0.5 rounded-xl border border-slate-800/80 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setTimePeriod('all')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${timePeriod === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                All Time
              </button>
              <button
                type="button"
                onClick={() => setTimePeriod('year')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${timePeriod === 'year' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                This Year
              </button>
              <button
                type="button"
                onClick={() => setTimePeriod('month')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${timePeriod === 'month' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => setTimePeriod('week')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${timePeriod === 'week' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => setTimePeriod('today')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${timePeriod === 'today' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                Today
              </button>
            </div>

            {/* Sub-brand selector */}
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value as any)}
              className="bg-slate-950/90 border border-slate-800 text-slate-200 text-xs font-bold rounded-xl py-1.5 px-2.5 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">All Sub-Brands</option>
              <option value="SAT">SAT - Sky Automation</option>
              <option value="GZ">GZ - Gadget Zone</option>
              <option value="RTX">RTX - RTX Gadget</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-shake">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')} className="cursor-pointer"><X size={14} /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & BALANCES (Sections 1, 2, 3, 4)                           */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Pillars Highlight Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Total Investment */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-emerald-50 text-emerald-700 rounded-xl font-bold">
                  <Landmark size={18} />
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-full flex items-center gap-1">
                  <Lock size={10} className="text-amber-600" />
                  <span>One-Time Capital Locked</span>
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Capital Investment</span>
                <h3 className="text-2xl font-black text-slate-900 font-mono mt-1">
                  ৳{totalInvestmentAllTime.toLocaleString()}
                </h3>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Fixed initial capital • <span className="text-emerald-700 font-bold">No further injections</span>
                </span>
              </div>
            </div>

            {/* 2. Comprehensive Net Profit */}
            <div className={`p-5 rounded-2xl border shadow-xs flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow ${
              profitMetrics.netBusinessProfit >= 0
                ? 'bg-gradient-to-br from-emerald-50/70 via-white to-white border-emerald-200'
                : 'bg-gradient-to-br from-rose-50/70 via-white to-white border-rose-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`p-2 rounded-xl font-bold ${
                  profitMetrics.netBusinessProfit >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {profitMetrics.netBusinessProfit >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                </span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  profitMetrics.netBusinessProfit >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  {profitMetrics.netBusinessProfit >= 0 ? 'Net Profit' : 'Net Business Loss'}
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Net Business Profit</span>
                <h3 className={`text-2xl font-black font-mono mt-1 ${
                  profitMetrics.netBusinessProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  ৳{profitMetrics.netBusinessProfit.toLocaleString()}
                </h3>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  All-time total: <strong className="font-mono text-slate-700">৳{allTimeNetProfit.toLocaleString()}</strong>
                </span>
              </div>
            </div>

            {/* 3. Cash on Hand */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-amber-50 text-amber-700 rounded-xl font-bold">
                  <Wallet size={18} />
                </span>
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(true)}
                  className="text-[10px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 transition-colors cursor-pointer"
                  title="Count & reconcile cash balance"
                >
                  Reconcile ↻
                </button>
              </div>
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Cash on Hand (Physical)</span>
                <h3 className="text-2xl font-black text-amber-700 font-mono mt-1">
                  ৳{cashMetrics.calculatedCashOnHand.toLocaleString()}
                </h3>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Total Liquid Funds: <strong className="font-mono text-slate-800">৳{cashMetrics.totalLiquidFunds.toLocaleString()}</strong>
                </span>
              </div>
            </div>

            {/* 4. Inventory Value (At Cost) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between min-h-[145px] hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="p-2 bg-blue-50 text-blue-700 rounded-xl font-bold">
                  <Package size={18} />
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-blue-50 text-blue-800 rounded-full border border-blue-100">
                  {inventoryValuation.totalStockUnits} Units
                </span>
              </div>
              <div className="mt-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Inventory Value (At Cost)</span>
                <h3 className="text-2xl font-black text-blue-700 font-mono mt-1">
                  ৳{inventoryValuation.totalCostAll.toLocaleString()}
                </h3>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  At Retail: <strong className="font-mono text-slate-800">৳{inventoryValuation.totalRetailAll.toLocaleString()}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Comprehensive Business Profit Formula Breakdown */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-600" />
                  <span>Comprehensive Net Business Profit Calculation</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Total Sales Revenue − Total Product Cost − Operational Expenses − Company Asset Purchases − Business Losses
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block font-medium">Selected Period ({timePeriod.toUpperCase()})</span>
                <span className={`text-lg font-black font-mono ${profitMetrics.netBusinessProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                  = ৳{profitMetrics.netBusinessProfit.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Visual Formula Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
                <div className="flex items-center justify-between text-emerald-800">
                  <span className="text-[11px] font-black uppercase tracking-wider">+ Sales Revenue</span>
                  <span className="text-[10px] font-bold">1</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-lg font-black text-emerald-800 font-mono">
                    ৳{profitMetrics.totalSalesRevenue.toLocaleString()}
                  </h4>
                  <p className="text-[10px] text-emerald-600 mt-0.5">{profitMetrics.confirmedOrdersCount} Confirmed Orders</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[11px] font-black uppercase tracking-wider">− Product Cost</span>
                  <span className="text-[10px] font-bold">2</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-lg font-black text-slate-800 font-mono">
                    ৳{profitMetrics.effectiveProductCost.toLocaleString()}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">Stock In purchases / COGS</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div className="flex items-center justify-between text-slate-700">
                  <span className="text-[11px] font-black uppercase tracking-wider">− Operating Expenses</span>
                  <span className="text-[10px] font-bold">3</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-lg font-black text-slate-800 font-mono">
                    ৳{profitMetrics.totalExpenses.toLocaleString()}
                  </h4>
                  <p className="text-[10px] text-slate-500 mt-0.5">{profitMetrics.expensesCount} Recorded Expenses</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 flex flex-col justify-between">
                <div className="flex items-center justify-between text-blue-800">
                  <span className="text-[11px] font-black uppercase tracking-wider">− Company Purchases</span>
                  <span className="text-[10px] font-bold">4</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-lg font-black text-blue-800 font-mono">
                    ৳{profitMetrics.totalCompanyPurchases.toLocaleString()}
                  </h4>
                  <p className="text-[10px] text-blue-600 mt-0.5">{profitMetrics.purchasesCount} Equipment / Assets</p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/60 border border-rose-100 flex flex-col justify-between">
                <div className="flex items-center justify-between text-rose-800">
                  <span className="text-[11px] font-black uppercase tracking-wider">− Company Losses</span>
                  <span className="text-[10px] font-bold">5</span>
                </div>
                <div className="mt-2">
                  <h4 className="text-lg font-black text-rose-800 font-mono">
                    ৳{profitMetrics.totalCompanyLosses.toLocaleString()}
                  </h4>
                  <p className="text-[10px] text-rose-600 mt-0.5">{profitMetrics.lossesCount} Damage / Theft / Bad debt</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3 & 4: Cash Balance & Inventory Valuation Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Section 3: Cash On Hand Tracker */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Wallet size={16} className="text-amber-600" />
                    <span>Cash on Hand & Liquid Flow Tracker</span>
                  </h3>
                  <p className="text-xs text-slate-400">Actual physical cash vs total multi-channel collected funds</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewOpeningBalance(cashSettings.openingBalance || 0);
                      setShowOpeningBalanceModal(true);
                    }}
                    className="text-[10px] font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    Edit Opening
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowReconcileModal(true)}
                    className="text-[10px] font-black text-white bg-amber-600 hover:bg-amber-700 px-3 py-1 rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    Reconcile Cash
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-amber-900 block">Available Cash on Hand</span>
                    <span className="text-[11px] text-amber-700/80">Physical cash in drawer/vault</span>
                  </div>
                  <span className="text-2xl font-black text-amber-800 font-mono">
                    ৳{cashMetrics.calculatedCashOnHand.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Opening Baseline</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">৳{cashMetrics.opening.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">+ Cash Orders</span>
                    <span className="font-mono font-bold text-emerald-700 text-sm">৳{cashMetrics.cashFromOrders.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">− Cash Expenses</span>
                    <span className="font-mono font-bold text-rose-600 text-sm">৳{cashMetrics.cashSpentOnExpenses.toLocaleString()}</span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">− Cash to Suppliers</span>
                    <span className="font-mono font-bold text-rose-600 text-sm">৳{cashMetrics.cashPaidToSuppliers.toLocaleString()}</span>
                  </div>
                </div>

                {/* Last Reconciled Info */}
                {cashSettings.lastReconciledAt && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-center justify-between">
                    <span>Last Reconciled by <strong className="text-slate-700">{cashSettings.reconciledBy || 'Super Admin'}</strong></span>
                    <span className="font-mono text-[11px] text-slate-400">{new Date(cashSettings.lastReconciledAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section 4: Inventory Valuation (Cost vs Retail) */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Package size={16} className="text-blue-600" />
                    <span>Inventory Worth: At Cost vs At Retail</span>
                  </h3>
                  <p className="text-xs text-slate-400">Total invested stock cost vs potential retail revenue</p>
                </div>
                <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
                  {inventoryValuation.totalStockUnits} Units
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">At Cost (Amount Spent)</span>
                  <h4 className="text-xl sm:text-2xl font-black text-blue-900 font-mono mt-1">
                    ৳{inventoryValuation.totalCostAll.toLocaleString()}
                  </h4>
                  <span className="text-[10px] text-blue-500 mt-1 block">Purchase price × Stock</span>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">At Retail (Potential Rev)</span>
                  <h4 className="text-xl sm:text-2xl font-black text-emerald-900 font-mono mt-1">
                    ৳{inventoryValuation.totalRetailAll.toLocaleString()}
                  </h4>
                  <span className="text-[10px] text-emerald-500 mt-1 block">Selling price × Stock</span>
                </div>
              </div>

              {/* Potential Gross Profit Difference */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider block">Potential Gross Profit</span>
                  <span className="text-[11px] text-slate-400">If all current inventory is sold at full price</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-emerald-400 font-mono">
                    +৳{inventoryValuation.potentialGrossProfit.toLocaleString()}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400 block font-mono">
                    Margin: {inventoryValuation.potentialMarginPercent.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Sub-brand Inventory Breakdown */}
              <div className="overflow-x-auto pt-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px]">
                      <th className="py-2 px-1">Sub-Brand</th>
                      <th className="py-2 px-1 text-center">Items</th>
                      <th className="py-2 px-1 text-right">Cost Value</th>
                      <th className="py-2 px-1 text-right">Retail Value</th>
                      <th className="py-2 px-1 text-right">Potential Gain</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 font-mono text-[11px]">
                    {(['SAT', 'GZ', 'RTX'] as const).map(b => {
                      const stats = inventoryValuation.brandStats[b] || { cost: 0, retail: 0, qty: 0, products: 0 };
                      const diff = stats.retail - stats.cost;
                      return (
                        <tr key={b} className="hover:bg-slate-50/50">
                          <td className="py-2 px-1 font-bold text-slate-800">{b}</td>
                          <td className="py-2 px-1 text-center text-slate-500">{stats.qty}</td>
                          <td className="py-2 px-1 text-right font-bold text-slate-700">৳{stats.cost.toLocaleString()}</td>
                          <td className="py-2 px-1 text-right font-bold text-slate-700">৳{stats.retail.toLocaleString()}</td>
                          <td className="py-2 px-1 text-right font-bold text-emerald-600">+৳{diff.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Section 1: Capital Investment History List */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <Landmark size={16} className="text-emerald-600" />
                  <span>Capital Investment History (মূলধন বিনিয়োগ খতিয়ান)</span>
                </h3>
                <p className="text-xs text-slate-400">Initial business capital (এককালীন প্রারম্ভিক মূলধন)</p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold shadow-xs">
                <Lock size={12} className="text-amber-600" />
                <span>One-Time Capital Locked (এককালীন মূলধন বিনিয়োগ)</span>
              </div>
            </div>

            {/* One-Time Capital Notice */}
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
              <Lock size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                <span className="font-extrabold text-amber-950">এককালীন মূলধন বিনিয়োগ নীতি (One-Time Fixed Capital):</span> ব্যবসার প্রারম্ভিক মূলধন হিসেবে <strong>৳{totalInvestmentAllTime.toLocaleString()}</strong> একবারই বিনিয়োগ করা হয়েছে। ব্যবসায় অতিরিক্ত বা দ্বিতীয়বার ইনভেস্টমেন্ট নেওয়ার কোনো নিয়ম নেই, ফলে নতুন কোনো ইনভেস্টমেন্ট যোগ করার অপশন স্থায়ীভাবে বন্ধ (Locked) রাখা হয়েছে।
              </div>
            </div>

            {investments.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No investment entries recorded yet. Click "+ Add Investment" to record initial business capital.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Amount (৳)</th>
                      <th className="py-2.5 px-3">Source / Note</th>
                      <th className="py-2.5 px-3">Sub-Brand</th>
                      <th className="py-2.5 px-3">Recorded By</th>
                      <th className="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {investments.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">
                          {inv.date}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-emerald-800 text-sm">
                          ৳{inv.amount.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {inv.note}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {inv.subBrand ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700">
                              {inv.subBrand}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">All / General</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {inv.createdBy}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditInvestment(inv)}
                              className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                              title="Edit Investment"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInvestment(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete Investment"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: COMPANY PURCHASES / ASSETS (Section 5)                              */}
      {/* ========================================================================= */}
      {activeTab === 'purchases' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-50 text-blue-700 rounded-xl font-bold"><Building size={16} /></span>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Company Capital Assets & Equipment Purchases
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                One-time business assets/equipment used to run the company (NOT for resale, e.g. laptops, delivery bikes, printers, furniture)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Asset Spending</span>
                <span className="text-lg font-black text-blue-800 font-mono">
                  ৳{companyPurchases.reduce((s, cp) => s + (cp.amount || 0), 0).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenAddPurchase}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>+ New Asset Purchase</span>
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
              <input
                type="text"
                placeholder="Search item name, vendor, notes..."
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
            <div>
              <select
                value={purchaseCategoryFilter}
                onChange={(e) => setPurchaseCategoryFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden"
              >
                <option value="All">All Categories</option>
                {COMPANY_PURCHASE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Vendor / Store</th>
                  <th className="py-2.5 px-3">Sub-Brand</th>
                  <th className="py-2.5 px-3 text-right">Amount (৳)</th>
                  <th className="py-2.5 px-3">Notes</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {companyPurchases
                  .filter(cp => {
                    const matchCat = purchaseCategoryFilter === 'All' || cp.category === purchaseCategoryFilter;
                    const matchSearch = !purchaseSearch.trim() || 
                      cp.itemName.toLowerCase().includes(purchaseSearch.toLowerCase()) ||
                      (cp.vendor && cp.vendor.toLowerCase().includes(purchaseSearch.toLowerCase())) ||
                      (cp.notes && cp.notes.toLowerCase().includes(purchaseSearch.toLowerCase()));
                    return matchCat && matchSearch;
                  })
                  .map(cp => (
                    <tr key={cp.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">{cp.purchaseDate}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{cp.itemName}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                          {cp.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{cp.vendor || '—'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[10px] font-mono text-slate-500">{cp.subBrand || 'General'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-800 text-sm">
                        ৳{cp.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-500" title={cp.notes || ''}>
                        {cp.notes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditPurchase(cp)}
                            className="p-1.5 text-slate-400 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePurchase(cp.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: COMPANY LOSSES (Section 6)                                         */}
      {/* ========================================================================= */}
      {activeTab === 'losses' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-50 text-rose-700 rounded-xl font-bold"><AlertTriangle size={16} /></span>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Explicit Business Loss Tracking
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Damaged/unsellable inventory write-offs, bad debts from uncollected customers, missing stock, and clearance losses
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Losses</span>
                <span className="text-lg font-black text-rose-700 font-mono">
                  ৳{companyLosses.reduce((s, cl) => s + (cl.amount || 0), 0).toLocaleString()}
                </span>
              </div>
              <button
                type="button"
                onClick={handleOpenAddLoss}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>+ Record Loss</span>
              </button>
            </div>
          </div>

          {/* Search & Loss Type Filter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
              <input
                type="text"
                placeholder="Search notes, linked product, customer..."
                value={lossSearch}
                onChange={(e) => setLossSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
            <div>
              <select
                value={lossTypeFilter}
                onChange={(e) => setLossTypeFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-hidden"
              >
                <option value="All">All Loss Types</option>
                {COMPANY_LOSS_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Loss Type</th>
                  <th className="py-2.5 px-3">Linked Entity</th>
                  <th className="py-2.5 px-3">Sub-Brand</th>
                  <th className="py-2.5 px-3 text-right">Loss Amount (৳)</th>
                  <th className="py-2.5 px-3">Notes</th>
                  <th className="py-2.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {companyLosses
                  .filter(cl => {
                    const matchType = lossTypeFilter === 'All' || cl.lossType === lossTypeFilter;
                    const matchSearch = !lossSearch.trim() ||
                      (cl.notes && cl.notes.toLowerCase().includes(lossSearch.toLowerCase())) ||
                      (cl.linkedProductName && cl.linkedProductName.toLowerCase().includes(lossSearch.toLowerCase())) ||
                      (cl.linkedCustomerName && cl.linkedCustomerName.toLowerCase().includes(lossSearch.toLowerCase()));
                    return matchType && matchSearch;
                  })
                  .map(cl => (
                    <tr key={cl.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600">{cl.date}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                          {cl.lossType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">
                        {cl.linkedProductName && (
                          <span className="block font-semibold">📦 {cl.linkedProductName}</span>
                        )}
                        {cl.linkedCustomerName && (
                          <span className="block text-[11px] text-slate-500">👤 {cl.linkedCustomerName}</span>
                        )}
                        {!cl.linkedProductName && !cl.linkedCustomerName && (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[10px] font-mono text-slate-500">{cl.subBrand || 'General'}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 text-sm">
                        −৳{cl.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-500" title={cl.notes || ''}>
                        {cl.notes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditLoss(cl)}
                            className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLoss(cl.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: LOSS-MAKING ORDERS (Section 7)                                     */}
      {/* ========================================================================= */}
      {activeTab === 'loss_orders' && (
        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-50 text-amber-700 rounded-xl font-bold"><ShieldAlert size={16} /></span>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-tight">
                  Loss-Making & Below-Cost Orders Audit
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Audit pricing mistakes or clearance sales where items were sold below purchase cost
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Flagged Orders</span>
              <span className="text-lg font-black text-amber-800 font-mono">
                {lossMakingOrders.length} Orders
              </span>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400 size-3.5" />
            <input
              type="text"
              placeholder="Search by Order ID, customer name, phone, product..."
              value={lossOrderSearch}
              onChange={(e) => setLossOrderSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-800 focus:outline-hidden"
            />
          </div>

          {/* Table */}
          {lossMakingOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              🎉 No loss-making orders found! All sales are priced above product purchase cost.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[9px] tracking-wider">
                    <th className="py-2.5 px-3">Order ID & Date</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Sub-Brand</th>
                    <th className="py-2.5 px-3">Items Sold</th>
                    <th className="py-2.5 px-3 text-right">Selling Total</th>
                    <th className="py-2.5 px-3 text-right">Cost Total</th>
                    <th className="py-2.5 px-3 text-right">Net Profit / Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lossMakingOrders.map(({ order, orderRevenue, orderCost, netOrderProfit, lineItemProfits }) => (
                    <tr key={order.id} className="hover:bg-amber-50/20 transition-colors">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800">{order.id}</span>
                        <span className="block text-[10px] text-slate-400">{new Date(order.createdAt).toLocaleDateString()}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-slate-800 block">{order.customerName}</span>
                        <span className="font-mono text-[10px] text-slate-400">{order.customerPhone}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {order.subBrand}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-1">
                          {lineItemProfits.map((line, idx) => (
                            <div key={idx} className="flex items-center gap-1.5 text-[11px]">
                              <span className="truncate max-w-[150px] font-medium text-slate-700">{line.productName} ({line.qty}x)</span>
                              {line.isLoss ? (
                                <span className="px-1.5 py-0.2 rounded-sm bg-rose-100 text-rose-700 font-mono font-bold text-[9px]">
                                  Loss −৳{Math.abs(line.lineProfit).toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-emerald-600 font-mono text-[9px]">
                                  +৳{line.lineProfit.toLocaleString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                        ৳{orderRevenue.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        ৳{orderCost.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className={`font-mono font-black text-sm px-2 py-0.5 rounded-lg ${
                          netOrderProfit < 0 ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {netOrderProfit < 0 ? `−৳${Math.abs(netOrderProfit).toLocaleString()}` : `+৳${netOrderProfit.toLocaleString()}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD/EDIT INVESTMENT                                              */}
      {/* ========================================================================= */}
      {showInvestmentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold"><Landmark size={16} /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {editingInvestment ? 'Edit Capital Investment' : 'Record Capital Investment'}
                </h3>
              </div>
              <button onClick={() => setShowInvestmentModal(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Amount (টাকার পরিমাণ ৳) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 500000"
                  value={invAmount}
                  onChange={(e) => setInvAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-base font-mono font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Investment Date *
                </label>
                <input
                  type="date"
                  required
                  value={invDate}
                  onChange={(e) => setInvDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-medium text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Source / Note (উৎস বা বিবরণ) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Initial capital, Partner equity, August injection"
                  value={invNote}
                  onChange={(e) => setInvNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Earmarked Sub-Brand (ঐচ্ছিক)
                </label>
                <select
                  value={invSubBrand}
                  onChange={(e) => setInvSubBrand(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                >
                  <option value="">General / All Brands</option>
                  <option value="SAT">SAT - Sky Automation Tech</option>
                  <option value="GZ">GZ - Gadget Zone</option>
                  <option value="RTX">RTX - RTX Gadget</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInvestmentModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Save Investment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: ADD/EDIT COMPANY PURCHASE                                        */}
      {/* ========================================================================= */}
      {showPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-blue-100 text-blue-700 rounded-xl font-bold"><Building size={16} /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {editingPurchase ? 'Edit Company Purchase' : 'Record Company Asset Purchase'}
                </h3>
              </div>
              <button onClick={() => setShowPurchaseModal(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePurchase} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Item / Asset Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dell Core i7 Laptop, Thermal Receipt Printer"
                  value={purItemName}
                  onChange={(e) => setPurItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Category *
                  </label>
                  <select
                    value={purCategory}
                    onChange={(e) => setPurCategory(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-800 focus:outline-hidden"
                  >
                    {COMPANY_PURCHASE_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Amount (৳) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 45000"
                    value={purAmount}
                    onChange={(e) => setPurAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Purchase Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={purDate}
                    onChange={(e) => setPurDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Vendor / Store
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Star Tech, IDB Bhaban"
                    value={purVendor}
                    onChange={(e) => setPurVendor(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Sub-Brand
                </label>
                <select
                  value={purSubBrand}
                  onChange={(e) => setPurSubBrand(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                >
                  <option value="">General / Shared</option>
                  <option value="SAT">SAT</option>
                  <option value="GZ">GZ</option>
                  <option value="RTX">RTX</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Notes / Specs
                </label>
                <textarea
                  rows={2}
                  placeholder="Warranty details, model number, serial..."
                  value={purNotes}
                  onChange={(e) => setPurNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPurchaseModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Save Asset Purchase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: RECORD LOSS                                                      */}
      {/* ========================================================================= */}
      {showLossModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-100 text-rose-700 rounded-xl font-bold"><AlertTriangle size={16} /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  {editingLoss ? 'Edit Business Loss' : 'Record Business Loss'}
                </h3>
              </div>
              <button onClick={() => setShowLossModal(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveLoss} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Loss Type *
                  </label>
                  <select
                    value={lossType}
                    onChange={(e) => setLossType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-800 focus:outline-hidden"
                  >
                    {COMPANY_LOSS_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Loss Amount (৳) *
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 5200"
                    value={lossAmount}
                    onChange={(e) => setLossAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs font-mono font-bold text-rose-700 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Loss Date *
                </label>
                <input
                  type="date"
                  required
                  value={lossDate}
                  onChange={(e) => setLossDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Linked Product (ঐচ্ছিক - যদি পণ্য নষ্ট হয়)
                </label>
                <select
                  value={lossLinkedProductId}
                  onChange={(e) => setLossLinkedProductId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                >
                  <option value="">None / Not Product Specific</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (৳{p.costPrice || 0})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Linked Customer (ঐচ্ছিক - যদি বাকির দেনা হয়)
                </label>
                <input
                  type="text"
                  placeholder="Customer name or phone"
                  value={lossCustomerName}
                  onChange={(e) => setLossCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Reason / Notes *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Explain why this loss occurred (e.g. water damaged box during transit)..."
                  value={lossNotes}
                  onChange={(e) => setLossNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLossModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Record Loss
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: RECONCILE CASH BALANCE                                           */}
      {/* ========================================================================= */}
      {showReconcileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-amber-100 text-amber-700 rounded-xl font-bold"><RefreshCw size={16} /></span>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                  Reconcile Cash Balance
                </h3>
              </div>
              <button onClick={() => setShowReconcileModal(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="flex justify-between">
                <span>Calculated System Balance:</span>
                <strong className="font-mono">৳{cashMetrics.calculatedCashOnHand.toLocaleString()}</strong>
              </div>
              <p className="text-[10px] text-amber-700">
                Physically count all paper cash and enter the exact counted amount below. Any discrepancy will be logged with an audit trail note.
              </p>
            </div>

            <form onSubmit={handleSaveReconciliation} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Actual Counted Cash (বাস্তব নগদ গণনা ৳) *
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 42500"
                  value={countedCash}
                  onChange={(e) => setCountedCash(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-base font-mono font-bold text-slate-900 focus:outline-hidden"
                />
              </div>

              {countedCash !== '' && (
                <div className="p-3 bg-slate-50 rounded-xl text-xs flex justify-between items-center">
                  <span className="text-slate-500">Difference:</span>
                  <span className={`font-mono font-black ${
                    Number(countedCash) - cashMetrics.calculatedCashOnHand >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {Number(countedCash) - cashMetrics.calculatedCashOnHand >= 0 ? '+' : ''}
                    ৳{(Number(countedCash) - cashMetrics.calculatedCashOnHand).toLocaleString()}
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Audit Reason / Note (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Weekly vault count, minor petty cash rounding"
                  value={reconcileNote}
                  onChange={(e) => setReconcileNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Confirm & Log Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: EDIT OPENING CASH BALANCE                                        */}
      {/* ========================================================================= */}
      {showOpeningBalanceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">
                Set Opening Cash Balance
              </h3>
              <button onClick={() => setShowOpeningBalanceModal(false)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveOpeningBalance} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Starting Cash Baseline (৳) *
                </label>
                <input
                  type="number"
                  required
                  min="0"
                  value={newOpeningBalance}
                  onChange={(e) => setNewOpeningBalance(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowOpeningBalanceModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs cursor-pointer"
                >
                  Save Baseline
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
