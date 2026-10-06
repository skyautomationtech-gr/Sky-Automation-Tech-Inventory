import React, { useState } from 'react';
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
import { UserProfile } from '../../types';
import { AccountingOverview } from './AccountingOverview';
import { InvestmentsTab } from './InvestmentsTab';
import { CompanyPurchasesTab } from './CompanyPurchasesTab';
import { CompanyLossesTab } from './CompanyLossesTab';
import { LossMakingOrdersTab } from './LossMakingOrdersTab';
import { PaymentPlatformTab } from './PaymentPlatformTab';
import { OtherReceivablesTab } from './OtherReceivablesTab';
import { ExpensesTab } from './ExpensesTab';
import ErrorBoundary from '../ErrorBoundary';

interface AccountingDeskProps {
  user: UserProfile;
}

export const AccountingDesk: React.FC<AccountingDeskProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<string>('overview');

  const tabs = [
    { id: 'overview', label: 'সারসংক্ষেপ (Overview)', icon: BarChart3 },
    { id: 'investments', label: 'মূলধন ও বিনিয়োগ (Capital)', icon: Briefcase },
    { id: 'purchases', label: 'কোম্পানি সম্পদ ও কেনাকাটা (Purchases)', icon: Building },
    { id: 'losses', label: 'কোম্পানি ক্ষতি (Losses)', icon: AlertTriangle },
    { id: 'loss_orders', label: 'লোকসানি অর্ডার (Loss Orders)', icon: ShoppingBag },
    { id: 'platforms', label: 'পেমেন্ট গেটওয়ে (Gateways)', icon: CreditCard },
    { id: 'receivables', label: 'অন্যান্য পাওনা ও অগ্রিম (Receivables)', icon: Coins },
    { id: 'expenses', label: 'দৈনন্দিন খরচ (Expenses)', icon: TrendingDown },
  ];

  return (
    <div className="space-y-5 max-w-7xl mx-auto font-sans text-slate-800">
      
      {/* Top Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shadow-2xs">
              <Calculator size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Accounting Desk</h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                ব্যবসায়ের মূলধন, স্থায়ী সম্পদ, ক্ষতি, গেটওয়ে ব্যালেন্স, পাওনা ও খরচের পূর্ণাঙ্গ লেজার
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto mt-5 pt-3 border-t border-slate-100 scrollbar-thin">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive 
                    ? 'bg-amber-500 text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 bg-slate-50/80 border border-slate-200/60'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-2xs min-h-[450px]">
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
