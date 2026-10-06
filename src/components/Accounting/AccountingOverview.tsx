import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { 
  UserProfile, 
  InvestmentEntry, 
  CompanyPurchase, 
  CompanyLoss, 
  PaymentPlatformLedger, 
  OtherReceivable, 
  Expense, 
  Order 
} from '../../types';
import { 
  subscribeToInvestments, 
  subscribeToCompanyPurchases, 
  subscribeToCompanyLosses, 
  subscribeToPaymentPlatformLedger, 
  subscribeToOtherReceivables, 
  subscribeToExpenses, 
  subscribeToOrders,
  clearAllAccountingData 
} from '../../firebase/db';

interface AccountingOverviewProps {
  user: UserProfile;
  onSelectTab: (tab: string) => void;
}

export const AccountingOverview: React.FC<AccountingOverviewProps> = ({ user, onSelectTab }) => {
  const [investments, setInvestments] = useState<InvestmentEntry[]>([]);
  const [purchases, setPurchases] = useState<CompanyPurchase[]>([]);
  const [losses, setLosses] = useState<CompanyLoss[]>([]);
  const [platforms, setPlatforms] = useState<PaymentPlatformLedger[]>([]);
  const [receivables, setReceivables] = useState<OtherReceivable[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const [isWiping, setIsWiping] = useState(false);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsubInv = subscribeToInvestments(list => setInvestments(list || []));
    const unsubPur = subscribeToCompanyPurchases(list => setPurchases(list || []));
    const unsubLos = subscribeToCompanyLosses(list => setLosses(list || []));
    const unsubPlat = subscribeToPaymentPlatformLedger(list => setPlatforms(list || []));
    const unsubRec = subscribeToOtherReceivables(list => setReceivables(list || []));
    const unsubExp = subscribeToExpenses(list => setExpenses(list || []));
    const unsubOrd = subscribeToOrders(list => setOrders(list || []));

    return () => {
      unsubInv();
      unsubPur();
      unsubLos();
      unsubPlat();
      unsubRec();
      unsubExp();
      unsubOrd();
    };
  }, []);

  // Safe Total Calculations
  const totalInvested = (investments || []).reduce((s, i) => s + (Number(i?.amount) || 0), 0);
  const totalPurchases = (purchases || []).reduce((s, p) => s + (Number(p?.amount) || 0), 0);
  const totalLosses = (losses || []).reduce((s, l) => s + (Number(l?.amount) || 0), 0);
  const totalPlatformBalance = (platforms || []).reduce((s, p) => s + (Number(p?.currentBalance) || 0), 0);
  const totalReceivableDue = (receivables || []).reduce((s, r) => s + Math.max(0, (Number(r?.amount) || 0) - (Number(r?.recoveredAmount) || 0)), 0);
  const totalExpenses = (expenses || []).reduce((s, e) => s + (Number(e?.amount) || 0), 0);

  // Safe Loss-making orders calculation
  const lossMakingOrders = (orders || []).filter(o => {
    if (!o || o.status === 'Returned/Cancelled') return false;
    const saleAmount = Number(o.totalAmount) || 0;
    const items = Array.isArray(o.items) ? o.items : [];
    const costAmount = items.reduce((sum, item) => sum + ((Number(item?.unitPrice) || 0) * (Number(item?.qty) || 1)), 0);
    return saleAmount < costAmount;
  });

  const totalOrderLoss = lossMakingOrders.reduce((sum, o) => {
    if (!o) return sum;
    const saleAmount = Number(o.totalAmount) || 0;
    const items = Array.isArray(o.items) ? o.items : [];
    const costAmount = items.reduce((s, item) => s + ((Number(item?.unitPrice) || 0) * (Number(item?.qty) || 1)), 0);
    return sum + Math.max(0, costAmount - saleAmount);
  }, 0);

  const handleExecuteWipe = async () => {
    setIsWiping(true);
    try {
      await clearAllAccountingData(false);
      setInvestments([]);
      setPurchases([]);
      setLosses([]);
      setPlatforms([]);
      setReceivables([]);
      setExpenses([]);
      setShowWipeConfirm(false);
      setNotification({ type: 'success', message: 'অ্যাকাউন্টিং এর সকল ডাটা সফলভাবে মুছে খালি করা হয়েছে।' });
      setTimeout(() => setNotification(null), 5000);
    } catch (e: any) {
      setNotification({ type: 'error', message: 'ডাটা খালি করতে সমস্যা হয়েছে: ' + (e?.message || 'Error') });
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`p-4 rounded-xl flex items-center justify-between gap-3 text-sm font-semibold transition-all ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded cursor-pointer">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck size={18} className="text-amber-500" />
            অ্যাকাউন্টিং সারসংক্ষেপ (Accounting Overview)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">কোম্পানির মূলধন, স্থায়ী সম্পদ, গেটওয়ে ব্যালেন্স ও খরচের হিসাব</p>
        </div>
        
        {user?.role === 'superadmin' && (
          <button
            onClick={() => setShowWipeConfirm(true)}
            disabled={isWiping}
            className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw size={14} className={isWiping ? 'animate-spin' : ''} />
            অ্যাকাউন্টিং ডাটা খালি করুন
          </button>
        )}
      </div>

      {/* Wipe Confirmation Modal */}
      {showWipeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-slate-900">ডাটা খালি করার নিশ্চিতকরণ</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                আপনি কি নিশ্চিত যে অ্যাকাউন্টিং সেকশনের সমস্ত বিনিয়োগ, সম্পদ ক্রয়, ক্ষতি, গেটওয়ে ও অন্যান্য পাওনা সংক্রান্ত ডাটা মুছে সম্পূর্ণ খালি করতে চান?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowWipeConfirm(false)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                বাতিল
              </button>
              <button
                onClick={handleExecuteWipe}
                disabled={isWiping}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                {isWiping ? 'মুছে ফেলা হচ্ছে...' : 'হ্যাঁ, সব মুছে ফেলুন'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid of 7 Key Accounting Modules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* 1. Investments & Capital */}
        <div 
          onClick={() => onSelectTab('investments')}
          className="bg-white border border-slate-200 hover:border-amber-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center">
                <Briefcase size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">মূলধন ও বিনিয়োগ (Capital)</div>
                <div className="text-[11px] text-slate-500 font-medium">{(investments || []).length} টি এন্ট্রি</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-amber-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট মূলধন:</span>
            <span className="text-xl font-black font-mono text-amber-600">
              ৳{totalInvested.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 2. Company Purchases */}
        <div 
          onClick={() => onSelectTab('purchases')}
          className="bg-white border border-slate-200 hover:border-purple-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-200/60 flex items-center justify-center">
                <Building size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">কোম্পানি সম্পদ ও ক্রয় (Assets)</div>
                <div className="text-[11px] text-slate-500 font-medium">{(purchases || []).length} টি কেনাকাটা</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-purple-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট স্থায়ী সম্পদ:</span>
            <span className="text-xl font-black font-mono text-purple-600">
              ৳{totalPurchases.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 3. Company Losses */}
        <div 
          onClick={() => onSelectTab('losses')}
          className="bg-white border border-slate-200 hover:border-rose-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60 flex items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">কোম্পানির ক্ষতি (Losses)</div>
                <div className="text-[11px] text-slate-500 font-medium">{(losses || []).length} টি রেকর্ড</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-rose-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট ক্ষতি ও অপচয়:</span>
            <span className="text-xl font-black font-mono text-rose-600">
              ৳{totalLosses.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 4. Loss-Making Orders */}
        <div 
          onClick={() => onSelectTab('loss_orders')}
          className="bg-white border border-slate-200 hover:border-orange-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 border border-orange-200/60 flex items-center justify-center">
                <ShoppingBag size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">লোকসানি অর্ডার (Loss Orders)</div>
                <div className="text-[11px] text-slate-500 font-medium">{lossMakingOrders.length} টি লোকসানি অর্ডার</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-orange-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট অর্ডার লোকসান:</span>
            <span className="text-xl font-black font-mono text-orange-600">
              ৳{totalOrderLoss.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 5. Payment Platforms */}
        <div 
          onClick={() => onSelectTab('platforms')}
          className="bg-white border border-slate-200 hover:border-blue-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60 flex items-center justify-center">
                <CreditCard size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">পেমেন্ট গেটওয়ে ও ব্যাংক</div>
                <div className="text-[11px] text-slate-500 font-medium">{(platforms || []).length} টি অ্যাকাউন্ট</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট গেটওয়ে ব্যালেন্স:</span>
            <span className="text-xl font-black font-mono text-blue-600">
              ৳{totalPlatformBalance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 6. Other Receivables */}
        <div 
          onClick={() => onSelectTab('receivables')}
          className="bg-white border border-slate-200 hover:border-teal-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-200/60 flex items-center justify-center">
                <Coins size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">অন্যান্য পাওনা ও স্টাফ অগ্রিম</div>
                <div className="text-[11px] text-slate-500 font-medium">{(receivables || []).length} টি রেকর্ড</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-teal-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">অবশিষ্ট বকেয়া পাওনা:</span>
            <span className="text-xl font-black font-mono text-teal-600">
              ৳{totalReceivableDue.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 7. Expenses */}
        <div 
          onClick={() => onSelectTab('expenses')}
          className="bg-white border border-slate-200 hover:border-emerald-400 hover:shadow-sm p-4 rounded-xl cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center">
                <TrendingDown size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">দৈনন্দিন খরচ (Expenses)</div>
                <div className="text-[11px] text-slate-500 font-medium">{(expenses || []).length} টি খরচ এন্ট্রি</div>
              </div>
            </div>
            <ArrowRight size={16} className="text-slate-400 group-hover:text-emerald-500 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
            <span className="text-[11px] font-semibold text-slate-500">মোট দৈনন্দিন খরচ:</span>
            <span className="text-xl font-black font-mono text-emerald-600">
              ৳{totalExpenses.toLocaleString()}
            </span>
          </div>
        </div>

      </div>

    </div>
  );
};
