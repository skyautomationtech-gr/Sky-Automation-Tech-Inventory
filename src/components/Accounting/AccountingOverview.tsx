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
    baselineCash: 2250,
    baselineInvestment: 39550,
    cutoffDate: new Date().toISOString().split('T')[0],
    note: 'Accounting baseline reset: Cash 2,250 BDT, Investment 39,550 BDT. Past records excluded.'
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
          baselineCash: Number(data.baselineCash) || 2250,
          baselineInvestment: Number(data.baselineInvestment) || 39550,
          cutoffDate: data.cutoffDate || new Date().toISOString().split('T')[0],
          note: data.note || ''
        });
      }
    });

    const unsubCash = subscribeToCashTransactions(list => setCashTxns(list || []));
    const unsubInv = subscribeToInvestments(list => setInvestments(list || []));
    const unsubPur = subscribeToCompanyPurchases(list => setPurchases(list || []));
    const unsubLos = subscribeToCompanyLosses(list => setLosses(list || []));
    const unsubPlat = subscribeToPaymentPlatformLedger(list => setPlatforms(list || []));
    const unsubRec = subscribeToOtherReceivables(list => setReceivables(list || []));
    const unsubExp = subscribeToExpenses(list => setExpenses(list || []));
    const unsubOrd = subscribeToOrders(list => setOrders(list || []));

    return () => {
      unBaseSafely(unsubBase);
      unBaseSafely(unsubCash);
      unBaseSafely(unsubInv);
      unBaseSafely(unsubPur);
      unBaseSafely(unsubLos);
      unBaseSafely(unsubPlat);
      unBaseSafely(unsubRec);
      unBaseSafely(unsubExp);
      unBaseSafely(unsubOrd);
    };
  }, []);

  function unBaseSafely(unsub: any) {
    if (typeof unsub === 'function') {
      try { unsub(); } catch (e) {}
    }
  }

  // Baseline Cutoff Timestamp
  const cutoffTimestamp = baseline?.cutoffTimestamp || 0;

  // Filtered Datasets strictly AFTER the baseline cutoff ("ay ager kono kishu akhon dorba na")
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

  // Calculations for Today & This Month
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

  // 1. CASH COLLECTED FROM DUE PAYMENTS (পূর্ববর্তী ও বর্তমান সকল অর্ডারের বকেয়া আদায়)
  // Check ALL orders across the database (even if created before cutoff):
  // If ANY payment was recorded in paymentHistory on or after cutoffTimestamp with method === 'Cash',
  // this is real cash in hand received after the baseline was reset!
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

  // 2. CASH FROM NEW ORDERS CREATED POST-CUTOFF
  let newOrdersCashIncome = 0;
  postCutoffOrders.forEach(o => {
    if (!o || o.status === 'Returned/Cancelled') return;
    const history = Array.isArray(o.paymentHistory) ? o.paymentHistory : [];
    const isCashOrder = o.paymentMethod === 'Cash' || (o.paymentMethod as string) === 'Cash on Delivery';
    
    if (history.length > 0) {
      // payments in history were already captured above if cash.
      // Now add initial cash down payment (if any) made at order creation that isn't in history:
      const histSum = history.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const initialCashPaid = isCashOrder ? Math.max(0, (Number(o.amountPaid) || 0) - histSum) : 0;
      newOrdersCashIncome += initialCashPaid;
      // If order is delivered via COD and has remaining unrecorded delivery payment:
      if (o.status === 'Delivered' && isCashOrder && (Number(o.totalAmount) || 0) > (Number(o.amountPaid) || 0)) {
        newOrdersCashIncome += Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.amountPaid) || 0));
      }
    } else {
      // No paymentHistory entries:
      if (o.status === 'Delivered' && isCashOrder) {
        newOrdersCashIncome += (Number(o.totalAmount) || 0);
      } else if (isCashOrder && (Number(o.amountPaid) || 0) > 0) {
        newOrdersCashIncome += (Number(o.amountPaid) || 0);
      }
    }
  });

  // 3. MANUAL CASH IN & OUT TRANSACTIONS
  const cashInPostCutoff = postCutoffCashTxns
    .filter(t => t.type === 'cash_in' || t.type === 'deposit')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const cashOutPostCutoff = postCutoffCashTxns
    .filter(t => t.type === 'cash_out' || t.type === 'withdrawal')
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // 4. CASH EXPENSES & PURCHASES
  const cashExpensesPostCutoff = postCutoffExpenses
    .filter(e => e.paymentMethod === 'Cash' || !e.paymentMethod)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const cashPurchasesPostCutoff = postCutoffPurchases
    .filter(p => p.paidVia === 'Cash')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // TOTAL CASH IN HAND
  const totalCashInHand = Math.max(0, 
    (Number(baseline.baselineCash) || 2250) +
    cashInPostCutoff +
    dueCashCollectedPostCutoff +
    newOrdersCashIncome -
    cashOutPostCutoff -
    cashExpensesPostCutoff -
    cashPurchasesPostCutoff
  );

  // 2. TOTAL INVESTMENT (আমাদের ইনভেস্ট কত)
  // Baseline Investment (39550) + New Investments post-cutoff
  const addedInvestmentsPostCutoff = postCutoffInvestments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalInvestment = (Number(baseline.baselineInvestment) || 39550) + addedInvestmentsPostCutoff;

  // 3. EXPENSES: TODAY & THIS MONTH (আজকের ও চলতি মাসের খরচ)
  const todayExpenses = postCutoffExpenses
    .filter(e => isToday(e.date || e.createdAt))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const monthExpenses = postCutoffExpenses
    .filter(e => isCurrentMonth(e.date || e.createdAt))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // 4. PROFIT: TODAY & THIS MONTH (আজকের ও চলতি মাসের লাভ)
  // Order profit = Revenue - Product Cost (COGS)
  const getOrderNetProfit = (order: Order) => {
    if (order.status === 'Returned/Cancelled') return 0;
    const saleRevenue = Number(order.totalAmount) || 0;
    const items = Array.isArray(order.items) ? order.items : [];
    const cost = items.reduce((sum, it) => sum + ((Number(it.unitPrice) || 0) * (Number(it.qty) || 1)), 0);
    return saleRevenue - cost;
  };

  // Today's orders profit
  const todayDeliveredOrders = postCutoffOrders.filter(o => 
    (o.status === 'Delivered' || o.paymentStatus === 'Paid') && isToday(o.createdAt)
  );
  const todayGrossProfit = todayDeliveredOrders.reduce((s, o) => s + getOrderNetProfit(o), 0);
  const todayNetProfit = todayGrossProfit - todayExpenses;

  // Month's orders profit
  const monthDeliveredOrders = postCutoffOrders.filter(o => 
    (o.status === 'Delivered' || o.paymentStatus === 'Paid') && isCurrentMonth(o.createdAt)
  );
  const monthGrossProfit = monthDeliveredOrders.reduce((s, o) => s + getOrderNetProfit(o), 0);
  const monthNetProfit = monthGrossProfit - monthExpenses;

  // Handlers for Save Baseline
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

  // Handler for Cash In / Out
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

  // Handler for Add Investment
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

  // Handler for Wipe
  const handleExecuteWipe = async () => {
    setIsWiping(true);
    try {
      await clearAllAccountingData(false);
      setShowWipeConfirm(false);
      setNotification({ type: 'success', message: 'অ্যাকাউন্টিং ডাটা সফলভাবে মুছে ফেলা হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'মুছে ফেলা যায়নি: ' + (e?.message || 'Error') });
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-sm font-semibold transition-all shadow-sm ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertTriangle size={18} className="text-rose-600" />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded-lg cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* 6 Core Requested Metrics (Cash, Investment, Profit Today & Month, Expense Today & Month) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        
        {/* Card 1: CASH IN HAND */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-white to-white border-2 border-emerald-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                <Wallet size={16} className="text-emerald-600" />
                ক্যাশ এ কত টাকা আছে (Cash in Hand)
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  লাইভ ক্যাশ
                </span>
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                  title="বেসলাইন সেটিংস (Baseline Settings)"
                >
                  <Sliders size={13} />
                </button>
              </div>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-700 tracking-tight">
              ৳{totalCashInHand.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              ভিত্তি ক্যাশ: ৳{Number(baseline.baselineCash || 2250).toLocaleString()} {dueCashCollectedPostCutoff > 0 && `+ বকেয়া আদায়: ৳${dueCashCollectedPostCutoff.toLocaleString()}`} {newOrdersCashIncome > 0 && `+ নতুন অর্ডার: ৳${newOrdersCashIncome.toLocaleString()}`} {cashInPostCutoff > 0 && `+ জমা: ৳${cashInPostCutoff.toLocaleString()}`} {cashOutPostCutoff > 0 && `- উত্তোলন: ৳${cashOutPostCutoff.toLocaleString()}`}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-emerald-100 flex items-center gap-2">
            <button
              onClick={() => {
                setCashActionType('cash_in');
                setShowCashActionModal(true);
              }}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <PlusCircle size={14} />
              + ক্যাশ জমা (In)
            </button>
            <button
              onClick={() => {
                setCashActionType('cash_out');
                setShowCashActionModal(true);
              }}
              className="flex-1 py-2 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <MinusCircle size={14} />
              - ক্যাশ খরচ (Out)
            </button>
          </div>
        </div>

        {/* Card 2: TOTAL INVESTMENT */}
        <div className="bg-gradient-to-br from-amber-500/10 via-white to-white border-2 border-amber-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-amber-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-amber-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-2">
                <Briefcase size={16} className="text-amber-600" />
                আমাদের মোট বিনিয়োগ (Investment)
              </span>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                ক্যাপিটাল
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-amber-700 tracking-tight">
              ৳{totalInvestment.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              ভিত্তি বিনিয়োগ: ৳{Number(baseline.baselineInvestment || 39550).toLocaleString()} {addedInvestmentsPostCutoff > 0 && `+ নতুন: ৳${addedInvestmentsPostCutoff.toLocaleString()}`}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-amber-100">
            <button
              onClick={() => setShowInvestmentModal(true)}
              className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              <PlusCircle size={14} />
              + নতুন বিনিয়োগ যোগ করুন
            </button>
          </div>
        </div>

        {/* Card 3: TODAY'S PROFIT */}
        <div className="bg-gradient-to-br from-blue-500/10 via-white to-white border-2 border-blue-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-blue-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-600" />
                আজকের লাভ (Today's Profit)
              </span>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                আজকের সেলস লাভ - খরচ
              </span>
            </div>
            <div className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${todayNetProfit >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
              ৳{todayNetProfit.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              আজ ডেলিভারি অর্ডার লাভ: ৳{todayGrossProfit.toLocaleString()} | আজকের খরচ: ৳{todayExpenses.toLocaleString()}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-blue-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">আজকের সম্পন্ন অর্ডার:</span>
            <span className="font-bold font-mono text-blue-700">{todayDeliveredOrders.length} টি</span>
          </div>
        </div>

        {/* Card 4: THIS MONTH'S PROFIT */}
        <div className="bg-gradient-to-br from-indigo-500/10 via-white to-white border-2 border-indigo-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-indigo-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-indigo-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                <Calendar size={16} className="text-indigo-600" />
                চলতি মাসের লাভ (Month's Profit)
              </span>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                চলতি মাস
              </span>
            </div>
            <div className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${monthNetProfit >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
              ৳{monthNetProfit.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              চলতি মাসের গ্রস লাভ: ৳{monthGrossProfit.toLocaleString()} | মোট খরচ: ৳{monthExpenses.toLocaleString()}
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-indigo-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">মাসের সম্পন্ন অর্ডার:</span>
            <span className="font-bold font-mono text-indigo-700">{monthDeliveredOrders.length} টি</span>
          </div>
        </div>

        {/* Card 5: TODAY'S EXPENSE */}
        <div className="bg-gradient-to-br from-rose-500/10 via-white to-white border-2 border-rose-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-rose-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-rose-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-900 flex items-center gap-2">
                <TrendingDown size={16} className="text-rose-600" />
                আজকের খরচ (Today's Expense)
              </span>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                আজকের খরচ
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-rose-600 tracking-tight">
              ৳{todayExpenses.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              আজকে লিপিবদ্ধ হওয়া সকল দৈনন্দিন খরচ (বেসলাইনের পর)
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-rose-100">
            <button
              onClick={() => onSelectTab('expenses')}
              className="w-full py-2 px-3 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition"
            >
              + খরচ এন্ট্রি দেখুন / যোগ করুন
            </button>
          </div>
        </div>

        {/* Card 6: THIS MONTH'S EXPENSE */}
        <div className="bg-gradient-to-br from-purple-500/10 via-white to-white border-2 border-purple-400/60 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col justify-between relative overflow-hidden group hover:border-purple-500 transition-all">
          <div className="absolute top-0 right-0 w-28 h-28 bg-purple-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-2">
                <TrendingDown size={16} className="text-purple-600" />
                চলতি মাসের খরচ (Month's Expense)
              </span>
              <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                মাসের মোট খরচ
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-black font-mono text-purple-700 tracking-tight">
              ৳{monthExpenses.toLocaleString()}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
              চলতি মাসের সর্বমোট প্রাতিষ্ঠানিক ও পরিচালন ব্যয়
            </p>
          </div>

          <div className="mt-5 pt-3.5 border-t border-purple-100 flex items-center justify-between text-xs text-slate-600">
            <span className="font-medium">মাসের মোট খরচ রেকর্ড:</span>
            <span className="font-bold font-mono text-purple-700">
              {postCutoffExpenses.filter(e => isCurrentMonth(e.date || e.createdAt)).length} টি
            </span>
          </div>
        </div>

      </div>

      {/* Recent Cash Transactions Ledger */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <History size={18} className="text-slate-600" />
            <h3 className="text-sm font-bold text-slate-900">সাম্প্রতিক ক্যাশ লেনদেন (Recent Cash In / Out)</h3>
          </div>
          <div className="text-xs text-slate-500 font-medium">
            মোট রেকর্ড: <strong className="font-mono text-slate-800">{postCutoffCashTxns.length}</strong>
          </div>
        </div>

        {postCutoffCashTxns.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-xs font-semibold text-slate-500">বেসলাইন রিসেটের পর এখনো নতুন কোনো ম্যানুয়াল ক্যাশ লেনদেন হয়নি।</p>
            <p className="text-[11px] text-slate-400 mt-0.5">ক্যাশ জমা বা উত্তোলন করতে উপরের বোতামগুলো ব্যবহার করুন।</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">তারিখ</th>
                  <th className="py-2.5 px-3">ধরন</th>
                  <th className="py-2.5 px-3">কারণ / বিবরণ</th>
                  <th className="py-2.5 px-3 text-right">পরিমাণ</th>
                  <th className="py-2.5 px-3">অপারেটর</th>
                  <th className="py-2.5 px-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {postCutoffCashTxns.slice(0, 8).map(txn => (
                  <tr key={txn.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {txn.date || new Date(txn.timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        txn.type === 'cash_in' || txn.type === 'deposit'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {txn.type === 'cash_in' || txn.type === 'deposit' ? (
                          <>
                            <ArrowDownRight size={12} /> ক্যাশ জমা
                          </>
                        ) : (
                          <>
                            <ArrowUpRight size={12} /> ক্যাশ খরচ
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {txn.reason}
                      {txn.note && <span className="block text-[10px] text-slate-400">{txn.note}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold">
                      <span className={txn.type === 'cash_in' || txn.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'}>
                        {txn.type === 'cash_in' || txn.type === 'deposit' ? '+' : '-'}৳{(Number(txn.amount) || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{txn.recordedBy || 'System'}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={async () => {
                          if (confirm('এই ক্যাশ লেনদেনটি মুছে ফেলতে চান?')) {
                            await deleteCashTransaction(txn.id);
                          }
                        }}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition"
                        title="মুছে ফেলুন"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Due Collections in Cash Ledger */}
      {recentDueCashCollections.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Coins size={18} className="text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">নগদ বকেয়া আদায় রেকর্ড (Recent Due Collections in Cash)</h3>
                <p className="text-[11px] text-slate-500">পূর্ববর্তী ও চলমান গ্রাহকদের কাছ থেকে সংগৃহীত নগদ টাকা যা সরাসরি ক্যাশে যোগ হয়েছে</p>
              </div>
            </div>
            <div className="text-xs text-slate-600 font-medium bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
              মোট সংগৃহীত বকেয়া: <strong className="font-mono text-emerald-700">৳{dueCashCollectedPostCutoff.toLocaleString()}</strong> ({recentDueCashCollections.length} টি রেকর্ড)
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">তারিখ</th>
                  <th className="py-2.5 px-3">অর্ডার আইডি</th>
                  <th className="py-2.5 px-3">গ্রাহকের নাম</th>
                  <th className="py-2.5 px-3">পেমেন্ট মেথড</th>
                  <th className="py-2.5 px-3 text-right">আদায়কৃত ক্যাশ</th>
                  <th className="py-2.5 px-3">সংগ্রহকারী</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentDueCashCollections.slice(0, 10).map((due, idx) => (
                  <tr key={`${due.orderId}-${due.date}-${idx}`} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {new Date(due.date).toLocaleDateString()} {new Date(due.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                      #{due.orderId.substring(0, 8).toUpperCase()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {due.customerName}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        {due.method}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                      +৳{due.amount.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{due.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Secondary Detailed Accounting Tabs Navigation */}
      <div className="pt-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
          বিস্তারিত অ্যাকাউন্টিং মডিউলসমূহ (Detailed Ledgers)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          
          <div 
            onClick={() => onSelectTab('investments')}
            className="p-3.5 bg-white hover:bg-amber-50/50 border border-slate-200 hover:border-amber-300 rounded-xl cursor-pointer transition flex items-center justify-between group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Briefcase size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">মূলধন লেজার</div>
                <div className="text-[10px] text-slate-500">{investments.length} টি রেকর্ড</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-slate-400 group-hover:text-amber-600 transition" />
          </div>

          <div 
            onClick={() => onSelectTab('purchases')}
            className="p-3.5 bg-white hover:bg-purple-50/50 border border-slate-200 hover:border-purple-300 rounded-xl cursor-pointer transition flex items-center justify-between group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Building size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">কোম্পানি সম্পদ ও ক্রয়</div>
                <div className="text-[10px] text-slate-500">{purchases.length} টি এন্ট্রি</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-slate-400 group-hover:text-purple-600 transition" />
          </div>

          <div 
            onClick={() => onSelectTab('platforms')}
            className="p-3.5 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl cursor-pointer transition flex items-center justify-between group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <CreditCard size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">গেটওয়ে ও ব্যাংক</div>
                <div className="text-[10px] text-slate-500">{platforms.length} টি অ্যাকাউন্ট</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-slate-400 group-hover:text-blue-600 transition" />
          </div>

          <div 
            onClick={() => onSelectTab('receivables')}
            className="p-3.5 bg-white hover:bg-teal-50/50 border border-slate-200 hover:border-teal-300 rounded-xl cursor-pointer transition flex items-center justify-between group shadow-2xs"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                <Coins size={16} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">অন্যান্য পাওনা ও অগ্রিম</div>
                <div className="text-[10px] text-slate-500">{receivables.length} টি রেকর্ড</div>
              </div>
            </div>
            <ArrowRight size={14} className="text-slate-400 group-hover:text-teal-600 transition" />
          </div>

        </div>
      </div>

      {/* MODAL 1: Accounting Baseline Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Sliders size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">অ্যাকাউন্টিং বেসলাইন সেটিংস</h3>
                  <p className="text-xs text-slate-500">প্রারম্ভিক ক্যাশ ও বিনিয়োগ কনফিগারেশন</p>
                </div>
              </div>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveBaseline} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  প্রারম্ভিক ক্যাশ ব্যালেন্স (Baseline Cash) ৳
                </label>
                <input
                  type="number"
                  step="any"
                  value={settingsForm.baselineCash}
                  onChange={e => setSettingsForm({ ...settingsForm, baselineCash: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="2250"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">ইউজার কর্তৃক নির্দিষ্ট ক্যাশ: ৳২,২৫০</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  মোট প্রারম্ভিক বিনিয়োগ (Baseline Investment) ৳
                </label>
                <input
                  type="number"
                  step="any"
                  value={settingsForm.baselineInvestment}
                  onChange={e => setSettingsForm({ ...settingsForm, baselineInvestment: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="39550"
                  required
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block">ইউজার কর্তৃক নির্দিষ্ট বিনিয়োগ: ৳৩৯,৫৫০</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কাট-অফ তারিখ (Cutoff Date)
                </label>
                <input
                  type="date"
                  value={settingsForm.cutoffDate}
                  onChange={e => setSettingsForm({ ...settingsForm, cutoffDate: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  required
                />
                <span className="text-[10px] text-amber-700 mt-0.5 block">
                  * এই তারিখের পূর্ববর্তী কোনো পুরনো অর্ডার, খরচ বা লেনদেন হিসাবে ধরা হবে না।
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  বিবরণ / নোট
                </label>
                <textarea
                  value={settingsForm.note}
                  onChange={e => setSettingsForm({ ...settingsForm, note: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="রিসেট কারণ বা নোট"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-xs cursor-pointer transition disabled:opacity-50"
                >
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'বেসলাইন সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Cash In / Out */}
      {showCashActionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  cashActionType === 'cash_in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {cashActionType === 'cash_in' ? <PlusCircle size={20} /> : <MinusCircle size={20} />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {cashActionType === 'cash_in' ? 'ক্যাশ জমা করুন (Cash In)' : 'ক্যাশ খরচ / উত্তোলন (Cash Out)'}
                  </h3>
                  <p className="text-xs text-slate-500">হাতে নগদ ক্যাশ পরিবর্তন</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCashActionModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCashTxn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  টাকার পরিমাণ (BDT) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={cashForm.amount}
                  onChange={e => setCashForm({ ...cashForm, amount: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-base font-mono font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  কারণ / খাতের নাম *
                </label>
                <input
                  type="text"
                  value={cashForm.reason}
                  onChange={e => setCashForm({ ...cashForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder={cashActionType === 'cash_in' ? 'যেমন: কুরিয়ার কালেকশন জমা, ব্যাংক থেকে উত্তোলন' : 'যেমন: জরুরি অফিস খরচ, নাস্তা, ভ্যান ভাড়া'}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  অতিরিক্ত মন্তব্য (ঐচ্ছিক)
                </label>
                <input
                  type="text"
                  value={cashForm.note}
                  onChange={e => setCashForm({ ...cashForm, note: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  placeholder="রেফারেন্স নম্বর বা নোট"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCashActionModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex-1 py-2.5 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition disabled:opacity-50 ${
                    cashActionType === 'cash_in' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : (cashActionType === 'cash_in' ? 'জমা নিশ্চিত করুন' : 'খরচ নিশ্চিত করুন')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Add Investment */}
      {showInvestmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">নতুন বিনিয়োগ যোগ করুন</h3>
                  <p className="text-xs text-slate-500">কোম্পানির মূলধন বৃদ্ধি</p>
                </div>
              </div>
              <button 
                onClick={() => setShowInvestmentModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddInvestment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  বিনিয়োগের পরিমাণ (BDT) *
                </label>
                <input
                  type="number"
                  step="any"
                  value={invForm.amount}
                  onChange={e => setInvForm({ ...invForm, amount: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-base font-mono font-bold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  তারিখ
                </label>
                <input
                  type="date"
                  value={invForm.date}
                  onChange={e => setInvForm({ ...invForm, date: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  সাব-ব্র্যান্ড
                </label>
                <select
                  value={invForm.subBrand}
                  onChange={e => setInvForm({ ...invForm, subBrand: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden bg-white"
                >
                  <option value="SAT">Sky Automation Tech (SAT)</option>
                  <option value="GZ">GadgetZu (GZ)</option>
                  <option value="RTX">RTX Gadget (RTX)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  বিবরণ / নোট
                </label>
                <input
                  type="text"
                  value={invForm.note}
                  onChange={e => setInvForm({ ...invForm, note: e.target.value })}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  placeholder="উৎস বা বিনিয়োগকারীর নাম"
                />
              </div>

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowInvestmentModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl shadow-xs cursor-pointer transition disabled:opacity-50"
                >
                  {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'বিনিয়োগ যুক্ত করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Wipe Confirm */}
      {showWipeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">অ্যাকাউন্টিং ডাটা রিসেট করবেন?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                এটি অ্যাকাউন্টিং এর নতুন রেকর্ডগুলো মুছে বেসলাইনে ফিরিয়ে নিয়ে যাবে।
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowWipeConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                বাতিল
              </button>
              <button
                onClick={handleExecuteWipe}
                disabled={isWiping}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition"
              >
                {isWiping ? 'মুছে ফেলা হচ্ছে...' : 'হ্যাঁ, রিসেট করুন'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
