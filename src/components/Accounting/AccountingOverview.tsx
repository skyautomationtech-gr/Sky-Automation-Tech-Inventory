import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Briefcase, 
  Building, 
  AlertTriangle, 
  CreditCard, 
  Coins, 
  RotateCcw,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  X,
  Wallet,
  Calendar,
  Clock,
  PlusCircle,
  MinusCircle,
  Sliders,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  History
} from 'lucide-react';
import { 
  UserProfile, 
  InvestmentEntry, 
  CompanyPurchase, 
  CompanyLoss, 
  PaymentPlatformLedger, 
  OtherReceivable, 
  Expense, 
  Order,
  AccountingBaselineSettings,
  CashTransaction
} from '../../types';
import { 
  subscribeToAccountingBaselineSettings,
  saveAccountingBaselineSettings,
  subscribeToCashTransactions,
  addCashTransaction,
  deleteCashTransaction,
  subscribeToInvestments, 
  addInvestment,
  subscribeToCompanyPurchases, 
  subscribeToCompanyLosses, 
  subscribeToPaymentPlatformLedger, 
  subscribeToOtherReceivables, 
  subscribeToExpenses, 
  subscribeToOrders,
  clearAllAccountingData,
  DEFAULT_ACCOUNTING_BASELINE 
} from '../../firebase/db';

interface AccountingOverviewProps {
  user: UserProfile;
  onSelectTab: (tab: string) => void;
}

export const AccountingOverview: React.FC<AccountingOverviewProps> = ({ user, onSelectTab }) => {
  // Baseline settings state
  const [baseline, setBaseline] = useState<AccountingBaselineSettings>(DEFAULT_ACCOUNTING_BASELINE);
  
  // Data collections state
  const [cashTxns, setCashTxns] = useState<CashTransaction[]>([]);
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [purchases, setPurchases] = useState<CompanyPurchase[]>([]);
  const [losses, setLosses] = useState<CompanyLoss[]>([]);
  const [platforms, setPlatforms] = useState<PaymentPlatformLedger[]>([]);
  const [receivables, setReceivables] = useState<OtherReceivable[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Modals state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCashActionModal, setShowCashActionModal] = useState(false);
  const [cashActionType, setCashActionType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [showInvestmentModal, setShowInvestmentModal] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [isWiping, setIsWiping] = useState(false);

  // Form states for modals
  const [settingsForm, setSettingsForm] = useState({
    baselineCash: 0,
    baselineInvestment: 0,
    cutoffDate: new Date().toISOString().split('T')[0],
    note: 'Accounting baseline initialized.'
  });

  const [cashForm, setCashForm] = useState({
    amount: '',
    reason: '',
    note: ''
  });

  const [invForm, setInvForm] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    note: 'নতুন মূলধন বিনিয়োগ',
    subBrand: 'SAT'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Subscriptions
  useEffect(() => {
    const unsubBase = subscribeToAccountingBaselineSettings(data => {
      if (data) {
        setBaseline(data);
        setSettingsForm({
          baselineCash: Number(data.baselineCash) || 0,
          baselineInvestment: Number(data.baselineInvestment) || 0,
          cutoffDate: data.cutoffDate || new Date().toISOString().split('T')[0],
          note: data.note || ''
        });
      }
    });

    const unsubCash = subscribeToCashTransactions(setCashTxns);
    const unsubInv = subscribeToInvestments(setInvestments);
    const unsubPur = subscribeToCompanyPurchases(setPurchases);
    const unsubLoss = subscribeToCompanyLosses(setLosses);
    const unsubPlat = subscribeToPaymentPlatformLedger(setPlatforms);
    const unsubRec = subscribeToOtherReceivables(setReceivables);
    const unsubExp = subscribeToExpenses(setExpenses);
    const unsubOrd = subscribeToOrders(setOrders);

    return () => {
      unsubBase();
      unsubCash();
      unsubInv();
      unsubPur();
      unsubLoss();
      unsubPlat();
      unsubRec();
      unsubExp();
      unsubOrd();
    };
  }, []);

  const cutoffTimestamp = baseline?.cutoffTimestamp || 0;

  const postCutoffCashTxns = useMemo(() => {
    return cashTxns.filter(t => (t.timestamp || 0) >= cutoffTimestamp);
  }, [cashTxns, cutoffTimestamp]);

  const postCutoffInvestments = useMemo(() => {
    return investments.filter(i => (i.createdAt || 0) >= cutoffTimestamp);
  }, [investments, cutoffTimestamp]);

  const postCutoffExpenses = useMemo(() => {
    return expenses.filter(e => (e.createdAt || 0) >= cutoffTimestamp);
  }, [expenses, cutoffTimestamp]);

  const postCutoffPurchases = useMemo(() => {
    return purchases.filter(p => (p.createdAt || 0) >= cutoffTimestamp);
  }, [purchases, cutoffTimestamp]);

  const postCutoffOrders = useMemo(() => {
    return orders.filter(o => (o.createdAt || 0) >= cutoffTimestamp);
  }, [orders, cutoffTimestamp]);

  const now = new Date();
  const todayDateString = now.toISOString().split('T')[0];
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const isToday = (timestampOrDateStr?: number | string) => {
    if (!timestampOrDateStr) return false;
    if (typeof timestampOrDateStr === 'string') {
      return timestampOrDateStr.startsWith(todayDateString);
    }
    const d = new Date(timestampOrDateStr);
    return d.toDateString() === now.toDateString();
  };

  const isCurrentMonth = (timestampOrDateStr?: number | string) => {
    if (!timestampOrDateStr) return false;
    const d = typeof timestampOrDateStr === 'number' 
      ? new Date(timestampOrDateStr) 
      : new Date(timestampOrDateStr);
    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
  };

  let dueCashCollectedPostCutoff = 0;
  let dueCashCollectedToday = 0;
  let dueCashCollectedThisMonth = 0;
  const recentDueCashCollections: {
    orderId: string;
    customerName: string;
    amount: number;
    method: string;
    date: number;
    recordedBy: string;
  }[] = [];

  (orders || []).forEach(o => {
    if (!o) return;
    const history = Array.isArray(o.paymentHistory) ? o.paymentHistory : [];
    history.forEach(p => {
      const pDate = p.date || 0;
      const isCash = p.method === 'Cash' || (p.method as string) === 'Cash on Delivery';
      if (isCash && pDate >= cutoffTimestamp) {
        const pAmt = Number(p.amount) || 0;
        dueCashCollectedPostCutoff += pAmt;
        if (isToday(pDate)) dueCashCollectedToday += pAmt;
        if (isCurrentMonth(pDate)) dueCashCollectedThisMonth += pAmt;
        recentDueCashCollections.push({
          orderId: o.id,
          customerName: o.customerName || 'Customer',
          amount: pAmt,
          method: p.method,
          date: pDate,
          recordedBy: p.recordedBy || 'Operator'
        });
      }
    });
  });

  recentDueCashCollections.sort((a, b) => b.date - a.date);

  let newOrdersCashIncome = 0;
  postCutoffOrders.forEach(o => {
    if (!o || o.status === 'Returned/Cancelled') return;
    const history = Array.isArray(o.paymentHistory) ? o.paymentHistory : [];
    const isCashOrder = o.paymentMethod === 'Cash' || (o.paymentMethod as string) === 'Cash on Delivery';
    
    if (history.length > 0) {
      const histSum = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const initialCashPaid = isCashOrder ? Math.max(0, (Number(o.amountPaid) || 0) - histSum) : 0;
      newOrdersCashIncome += initialCashPaid;
      if (o.status === 'Delivered' && isCashOrder && (Number(o.totalAmount) || 0) > (Number(o.amountPaid) || 0)) {
        newOrdersCashIncome += Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.amountPaid) || 0));
      }
    } else {
      if (o.status === 'Delivered' && isCashOrder) {
        newOrdersCashIncome += (Number(o.totalAmount) || 0);
      } else if (isCashOrder && (Number(o.amountPaid) || 0) > 0) {
        newOrdersCashIncome += (Number(o.amountPaid) || 0);
      }
    }
  });

  const cashInPostCutoff = postCutoffCashTxns
    .filter(t => t.type === 'cash_in' || t.type === 'deposit')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const cashOutPostCutoff = postCutoffCashTxns
    .filter(t => t.type === 'cash_out' || t.type === 'withdrawal')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const cashExpensesPostCutoff = postCutoffExpenses
    .filter(e => e.paymentMethod === 'Cash' || !e.paymentMethod)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const cashPurchasesPostCutoff = postCutoffPurchases
    .filter(p => p.paidVia === 'Cash')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const totalCashInHand = Math.max(0, 
    (Number(baseline.baselineCash) || 2250) +
    cashInPostCutoff +
    dueCashCollectedPostCutoff +
    newOrdersCashIncome -
    cashOutPostCutoff -
    cashExpensesPostCutoff -
    cashPurchasesPostCutoff
  );

  const addedInvestmentsPostCutoff = postCutoffInvestments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalInvestment = (Number(baseline.baselineInvestment) || 39550) + addedInvestmentsPostCutoff;

  const todayExpenses = postCutoffExpenses
    .filter(e => isToday(e.date || e.createdAt))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const monthExpenses = postCutoffExpenses
    .filter(e => isCurrentMonth(e.date || e.createdAt))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const getOrderNetProfit = (order: Order) => {
    if (order.status === 'Returned/Cancelled') return 0;
    const saleRevenue = Number(order.totalAmount) || 0;
    const items = Array.isArray(order.items) ? order.items : [];
    const cost = items.reduce((sum, it) => sum + ((Number(it.unitPrice) || 0) * (Number(it.qty) || 1)), 0);
    return saleRevenue - cost;
  };

  const todayDeliveredOrders = postCutoffOrders.filter(o => 
    (o.status === 'Delivered' || o.paymentStatus === 'Paid') && isToday(o.createdAt)
  );
  const todayGrossProfit = todayDeliveredOrders.reduce((s, o) => s + getOrderNetProfit(o), 0);
  const todayNetProfit = todayGrossProfit - todayExpenses;

  const monthDeliveredOrders = postCutoffOrders.filter(o => 
    (o.status === 'Delivered' || o.paymentStatus === 'Paid') && isCurrentMonth(o.createdAt)
  );
  const monthGrossProfit = monthDeliveredOrders.reduce((s, o) => s + getOrderNetProfit(o), 0);
  const monthNetProfit = monthGrossProfit - monthExpenses;

  const handleSaveBaseline = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const bCash = parseFloat(String(settingsForm.baselineCash));
      const bInv = parseFloat(String(settingsForm.baselineInvestment));
      if (isNaN(bCash) || isNaN(bInv)) {
        setNotification({ type: 'error', message: 'অনুগ্রহ করে সঠিক সংখ্যা লিখুন' });
        setIsSubmitting(false);
        return;
      }

      await saveAccountingBaselineSettings({
        baselineCash: bCash,
        baselineInvestment: bInv,
        cutoffDate: settingsForm.cutoffDate,
        cutoffTimestamp: new Date(settingsForm.cutoffDate).getTime() || Date.now(),
        note: settingsForm.note.trim(),
        updatedBy: user?.name || 'Admin'
      });

      setShowSettingsModal(false);
      setNotification({ type: 'success', message: 'অ্যাকাউন্টিং বেসলাইন সফলভাবে আপডেট করা হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'বেসলাইন সেভ করা যায়নি: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCashTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(cashForm.amount);
    if (isNaN(amt) || amt <= 0) {
      setNotification({ type: 'error', message: 'অনুগ্রহ করে সঠিক টাকার পরিমাণ দিন' });
      return;
    }
    if (!cashForm.reason.trim()) {
      setNotification({ type: 'error', message: 'লেনদেনের কারণ উল্লেখ করুন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addCashTransaction({
        type: cashActionType,
        amount: amt,
        reason: cashForm.reason.trim(),
        date: new Date().toISOString().split('T')[0],
        timestamp: Date.now(),
        note: cashForm.note.trim(),
        recordedBy: user?.name || 'Admin'
      });

      setCashForm({ amount: '', reason: '', note: '' });
      setShowCashActionModal(false);
      setNotification({ 
        type: 'success', 
        message: cashActionType === 'cash_in' 
          ? `৳${amt.toLocaleString()} ক্যাশ জমা করা হয়েছে।` 
          : `৳${amt.toLocaleString()} ক্যাশ উত্তোলন/খরচ রেকর্ড করা হয়েছে।` 
      });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'ক্যাশ রেকর্ড করা যায়নি: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(invForm.amount);
    if (isNaN(amt) || amt <= 0) {
      setNotification({ type: 'error', message: 'অনুগ্রহ করে সঠিক বিনিয়োগের পরিমাণ দিন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addInvestment({
        amount: amt,
        date: invForm.date,
        note: invForm.note.trim(),
        subBrand: invForm.subBrand,
        createdBy: user?.name || 'Admin',
        createdAt: Date.now()
      });

      setInvForm({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        note: 'নতুন মূলধন বিনিয়োগ',
        subBrand: 'SAT'
      });
      setShowInvestmentModal(false);
      setNotification({ type: 'success', message: `৳${amt.toLocaleString()} নতুন মূলধন বিনিয়োগ হিসেবে যোগ করা হয়েছে।` });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'বিনিয়োগ যোগ করা যায়নি: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-sm font-semibold transition-all shadow-sm ${
          notification.type === 'success' 
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400' 
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-500" /> : <AlertTriangle size={18} className="text-rose-500" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 6 Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Card 1: CASH IN HAND */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <Wallet size={16} />
                ক্যাশ এ কত টাকা আছে (Cash in Hand)
              </span>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                title="বেসলাইন সেটিংস"
              >
                <Sliders size={14} />
              </button>
            </div>
            <div className="text-3xl font-black font-mono text-emerald-600 dark:text-emerald-400 tracking-tight tabular-nums">
              ৳{totalCashInHand.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              ভিত্তি ক্যাশ: ৳{Number(baseline.baselineCash || 2250).toLocaleString()} {dueCashCollectedPostCutoff > 0 && `+ বকেয়া: ৳${dueCashCollectedPostCutoff.toLocaleString()}`} {newOrdersCashIncome > 0 && `+ অর্ডার: ৳${newOrdersCashIncome.toLocaleString()}`}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <button
              onClick={() => {
                setCashActionType('cash_in');
                setShowCashActionModal(true);
              }}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <PlusCircle size={14} />
              + ক্যাশ জমা (In)
            </button>
            <button
              onClick={() => {
                setCashActionType('cash_out');
                setShowCashActionModal(true);
              }}
              className="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <MinusCircle size={14} />
              - ক্যাশ খরচ (Out)
            </button>
          </div>
        </div>

        {/* Card 2: TOTAL INVESTMENT */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-2">
                <Briefcase size={16} />
                আমাদের মোট বিনিয়োগ (Investment)
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
              ৳{totalInvestment.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              ভিত্তি বিনিয়োগ: ৳{Number(baseline.baselineInvestment || 39550).toLocaleString()} {addedInvestmentsPostCutoff > 0 && `+ নতুন: ৳${addedInvestmentsPostCutoff.toLocaleString()}`}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setShowInvestmentModal(true)}
              className="w-full py-2 px-3 bg-gold-400 hover:bg-gold-500 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <PlusCircle size={14} />
              + নতুন বিনিয়োগ যোগ করুন
            </button>
          </div>
        </div>

        {/* Card 3: TODAY'S PROFIT */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <TrendingUp size={16} />
                আজকের লাভ (Today's Profit)
              </span>
            </div>
            <div className={`text-3xl font-black font-mono tracking-tight tabular-nums ${todayNetProfit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}`}>
              ৳{todayNetProfit.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              আজ ডেলিভারি অর্ডার লাভ: ৳{todayGrossProfit.toLocaleString()} | খরচ: ৳{todayExpenses.toLocaleString()}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>আজকের সম্পন্ন অর্ডার:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{todayDeliveredOrders.length} টি</span>
          </div>
        </div>

        {/* Card 4: THIS MONTH'S PROFIT */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                <Calendar size={16} />
                চলতি মাসের লাভ (Month's Profit)
              </span>
            </div>
            <div className={`text-3xl font-black font-mono tracking-tight tabular-nums ${monthNetProfit >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'}`}>
              ৳{monthNetProfit.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              মাসের গ্রস লাভ: ৳{monthGrossProfit.toLocaleString()} | খরচ: ৳{monthExpenses.toLocaleString()}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>মাসের সম্পন্ন অর্ডার:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">{monthDeliveredOrders.length} টি</span>
          </div>
        </div>

        {/* Card 5: TODAY'S EXPENSE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-2">
                <TrendingDown size={16} />
                আজকের খরচ (Today's Expense)
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-rose-600 dark:text-rose-400 tracking-tight tabular-nums">
              ৳{todayExpenses.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              আজকের নিবন্ধিত খরচ তালিকা
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => onSelectTab('expenses')}
              className="w-full py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              + খরচ এন্ট্রি দেখুন / যোগ করুন
            </button>
          </div>
        </div>

        {/* Card 6: THIS MONTH'S EXPENSE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-400 flex items-center gap-2">
                <TrendingDown size={16} />
                চলতি মাসের খরচ (Month's Expense)
              </span>
            </div>
            <div className="text-3xl font-black font-mono text-purple-600 dark:text-purple-400 tracking-tight tabular-nums">
              ৳{monthExpenses.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              চলতি মাসের সর্বমোট প্রাতিষ্ঠানিক ব্যয়
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>মাসের মোট খরচ এন্ট্রি:</span>
            <span className="font-bold text-slate-900 dark:text-white font-mono">
              {postCutoffExpenses.filter(e => isCurrentMonth(e.date || e.createdAt)).length} টি
            </span>
          </div>
        </div>

      </div>

      {/* Two-Column Clean Reconciliation Statement Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left 7 Cols: Recent Cash Transactions Table */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History size={18} className="text-gold-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">সাম্প্রতিক ক্যাশ লেনদেন (Recent Cash Records)</h3>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
              {postCutoffCashTxns.length} records
            </span>
          </div>

          {postCutoffCashTxns.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
              <Wallet size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">বেসলাইন রিসেটের পর নতুন কোনো ম্যানুয়াল ক্যাশ লেনদেন রেকর্ড করা হয়নি।</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                    <th className="pb-3 pl-2">তারিখ</th>
                    <th className="pb-3">ধরন</th>
                    <th className="pb-3">বিবরণ</th>
                    <th className="pb-3 text-right">পরিমাণ</th>
                    <th className="pb-3 text-center">অ্যাকশন</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {postCutoffCashTxns.slice(0, 8).map(txn => (
                    <tr key={txn.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 pl-2 font-mono text-slate-600 dark:text-slate-400">
                        {txn.date || new Date(txn.timestamp).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          txn.type === 'cash_in' || txn.type === 'deposit'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                        }`}>
                          {txn.type === 'cash_in' || txn.type === 'deposit' ? 'ক্যাশ জমা' : 'ক্যাশ খরচ'}
                        </span>
                      </td>
                      <td className="py-3 font-medium text-slate-800 dark:text-slate-200">
                        {txn.reason}
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums">
                        <span className={txn.type === 'cash_in' || txn.type === 'deposit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {txn.type === 'cash_in' || txn.type === 'deposit' ? '+' : '-'}৳{(Number(txn.amount) || 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={async () => {
                            if (confirm('এই ক্যাশ লেনদেনটি মুছে ফেলতে চান?')) {
                              await deleteCashTransaction(txn.id);
                            }
                          }}
                          className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
                        >
                          মুছুন
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 5 Cols: Net Reconciliation Statement Summary */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <ShieldCheck size={18} className="text-gold-500" />
              ক্যাশ রিকনসিলিয়েশন স্টেটমেন্ট (Cash Statement)
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">ভিত্তি ক্যাশ (Baseline Starting Cash)</span>
                <span className="font-bold text-slate-900 dark:text-white tabular-nums">৳{(Number(baseline.baselineCash) || 2250).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">বকেয়া আদায় (Due Collections)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+ ৳{dueCashCollectedPostCutoff.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">নতুন অর্ডার ক্যাশ (New Order Cash)</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">+ ৳{newOrdersCashIncome.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">ক্যাশ ব্যয়/উত্তোলন (Cash Out & Exp)</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">- ৳{(cashOutPostCutoff + cashExpensesPostCutoff + cashPurchasesPostCutoff).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-3 bg-emerald-500/10 border border-emerald-500/20 px-4 rounded-xl text-sm font-black">
                <span className="text-emerald-700 dark:text-emerald-400">হাতে নিট ক্যাশ ব্যালেন্স</span>
                <span className="text-emerald-700 dark:text-emerald-400 tabular-nums">৳{totalCashInHand.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-400 text-center">
              কাট-অফ তারিখ: {baseline.cutoffDate || 'N/A'} (পরবর্তী সকল হিসাব লাইভ আপডেট হয়)
            </p>
          </div>
        </div>

      </div>

      {/* Modals for Settings & Cash Action */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">বেসলাইন সেটিং রিসেট (Baseline Settings)</h3>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveBaseline} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">ভিত্তি ক্যাশ (BDT)</label>
                <input
                  type="number"
                  value={settingsForm.baselineCash}
                  onChange={e => setSettingsForm({ ...settingsForm, baselineCash: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">ভিত্তি বিনিয়োগ (BDT)</label>
                <input
                  type="number"
                  value={settingsForm.baselineInvestment}
                  onChange={e => setSettingsForm({ ...settingsForm, baselineInvestment: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">কাট-অফ তারিখ</label>
                <input
                  type="date"
                  value={settingsForm.cutoffDate}
                  onChange={e => setSettingsForm({ ...settingsForm, cutoffDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                >
                  {isSubmitting ? 'সেভ হচ্ছে...' : 'সেভ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cash Action Modal */}
      {showCashActionModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {cashActionType === 'cash_in' ? 'ক্যাশ জমা ইনপুট (+ Cash In)' : 'ক্যাশ খরচ/উত্তোলন (- Cash Out)'}
              </h3>
              <button onClick={() => setShowCashActionModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddCashTxn} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">টাকার পরিমাণ (BDT)</label>
                <input
                  type="number"
                  placeholder="যেমন: 500"
                  value={cashForm.amount}
                  onChange={e => setCashForm({ ...cashForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">কারণ / বিবরণ</label>
                <input
                  type="text"
                  placeholder="যেমন: খুচরা খরচের জন্য ক্যাশ উত্তোলন"
                  value={cashForm.reason}
                  onChange={e => setCashForm({ ...cashForm, reason: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCashActionModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                >
                  {isSubmitting ? 'প্রসেস হচ্ছে...' : 'জমা দিন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Investment Modal */}
      {showInvestmentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">নতুন মূলধন বিনিয়োগ (+ Investment)</h3>
              <button onClick={() => setShowInvestmentModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddInvestment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">বিনিয়োগের পরিমাণ (BDT)</label>
                <input
                  type="number"
                  placeholder="যেমন: 10000"
                  value={invForm.amount}
                  onChange={e => setInvForm({ ...invForm, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">নোট / বিবরণ</label>
                <input
                  type="text"
                  value={invForm.note}
                  onChange={e => setInvForm({ ...invForm, note: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInvestmentModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                >
                  {isSubmitting ? 'প্রসেস হচ্ছে...' : 'যোগ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
