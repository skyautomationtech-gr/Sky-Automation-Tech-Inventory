import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Briefcase, 
  Building, 
  AlertTriangle, 
  ShoppingBag, 
  CreditCard, 
  Coins, 
  TrendingDown,
  Calculator
} from 'lucide-react';
import { UserProfile, AccountingBaselineSettings } from '../../types';
import { AccountingOverview } from './AccountingOverview';
import { InvestmentsTab } from './InvestmentsTab';
import { CompanyPurchasesTab } from './CompanyPurchasesTab';
import { CompanyLossesTab } from './CompanyLossesTab';
import { LossMakingOrdersTab } from './LossMakingOrdersTab';
import { PaymentPlatformTab } from './PaymentPlatformTab';
import { OtherReceivablesTab } from './OtherReceivablesTab';
import { ExpensesTab } from './ExpensesTab';
import ErrorBoundary from '../ErrorBoundary';
import { subscribeToAccountingBaselineSettings, DEFAULT_ACCOUNTING_BASELINE } from '../../firebase/db';

interface AccountingDeskProps {
  user: UserProfile;
}

export const AccountingDesk: React.FC<AccountingDeskProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [baseline, setBaseline] = useState<AccountingBaselineSettings>(DEFAULT_ACCOUNTING_BASELINE);

  useEffect(() => {
    const unsub = subscribeToAccountingBaselineSettings(data => {
      if (data) setBaseline(data);
    });
    return () => unsub();
  }, []);

  const tabs = [
    { id: 'overview', label: 'ক্যাশ ও লাভ-খরচের সারসংক্ষেপ (Cash & P/L)', icon: BarChart3 },
    { id: 'investments', label: 'মূলধন ও বিনিয়োগ (Capital)', icon: Briefcase },
    { id: 'purchases', label: 'কোম্পানি সম্পদ ও কেনাকাটা (Purchases)', icon: Building },
    { id: 'losses', label: 'কোম্পানি ক্ষতি (Losses)', icon: AlertTriangle },
    { id: 'loss_orders', label: 'লোকসানি অর্ডার (Loss Orders)', icon: ShoppingBag },
    { id: 'platforms', label: 'পেমেন্ট গেটওয়ে (Gateways)', icon: CreditCard },
    { id: 'receivables', label: 'অন্যান্য পাওনা ও অগ্রিম (Receivables)', icon: Coins },
    { id: 'expenses', label: 'দৈনন্দিন খরচ (Expenses)', icon: TrendingDown },
  ];

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-10">
      
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-600 dark:text-gold-400 shrink-0">
              <Calculator size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Accounting Desk</h1>
                <span className="text-xs font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  হাতে ক্যাশ ৳{(baseline.baselineCash || 0).toLocaleString()} | বিনিয়োগ ৳{(baseline.baselineInvestment || 0).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                ক্যাশ ব্যালেন্স, মোট বিনিয়োগ, আজকের ও চলতি মাসের লাভ-খরচের রিয়েলটাইম হিসাব (পূর্ববর্তী ডাটা বাদ দিয়ে)
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 scrollbar-thin">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive 
                    ? 'bg-gold-500 text-slate-950 shadow-xs' 
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[500px]">
        <ErrorBoundary fallbackTitle="Accounting Module Encountered an Issue">
          {activeTab === 'overview' && (
            <AccountingOverview user={user} onSelectTab={(t) => setActiveTab(t)} />
          )}
          {activeTab === 'investments' && (
            <InvestmentsTab user={user} />
          )}
          {activeTab === 'purchases' && (
            <CompanyPurchasesTab user={user} />
          )}
          {activeTab === 'losses' && (
            <CompanyLossesTab user={user} />
          )}
          {activeTab === 'loss_orders' && (
            <LossMakingOrdersTab user={user} />
          )}
          {activeTab === 'platforms' && (
            <PaymentPlatformTab user={user} />
          )}
          {activeTab === 'receivables' && (
            <OtherReceivablesTab user={user} />
          )}
          {activeTab === 'expenses' && (
            <ExpensesTab user={user} />
          )}
        </ErrorBoundary>
      </div>

    </div>
  );
};
