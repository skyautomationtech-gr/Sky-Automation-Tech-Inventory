import React, { useState } from 'react';
import { 
  X, 
  DollarSign, 
  ArrowRightLeft, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  Briefcase, 
  AlertTriangle, 
  BookOpen, 
  CheckCircle2, 
  Calendar,
  Building,
  CreditCard,
  Tag
} from 'lucide-react';
import { AccountingVoucher, VoucherType, VoucherEntry, ChartOfAccount } from '../../types';

interface QuickTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (voucher: Omit<AccountingVoucher, 'id'>) => Promise<void>;
  chartOfAccounts: ChartOfAccount[];
  userName: string;
}

type QuickMode = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'INVESTMENT' | 'ASSET' | 'LOSS' | 'JOURNAL';

export const QuickTransactionModal: React.FC<QuickTransactionModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  chartOfAccounts,
  userName
}) => {
  const [mode, setMode] = useState<QuickMode>('EXPENSE');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [subBrand, setSubBrand] = useState<'SAT' | 'GZ' | 'RTX' | 'ALL'>('SAT');
  const [amount, setAmount] = useState<string>('');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick form specific selectors
  const [paymentAccount, setPaymentAccount] = useState<string>('1010'); // Cash in Hand
  const [targetAccount, setTargetAccount] = useState<string>('5120'); // Rent/Utilities
  const [transferToAccount, setTransferToAccount] = useState<string>('1020'); // bKash

  // Custom Journal Lines (for JOURNAL mode)
  const [journalLines, setJournalLines] = useState<Array<{ accountCode: string; debit: number; credit: number; narration: string }>>([
    { accountCode: '1010', debit: 0, credit: 0, narration: '' },
    { accountCode: '4010', debit: 0, credit: 0, narration: '' },
  ]);

  if (!isOpen) return null;

  // Account Helpers - if chartOfAccounts is empty in database, provide option presets so user can pick immediately
  const availableAccounts = chartOfAccounts.length > 0 ? chartOfAccounts : [
    { id: '1010', code: '1010', name: 'নগদ ক্যাশ (Cash in Hand)', category: 'Asset' as const, subType: 'Current Asset', balance: 0 },
    { id: '1020', code: '1020', name: 'বিকাশ মার্চেন্ট (bKash Balance)', category: 'Asset' as const, subType: 'Current Asset', balance: 0 },
    { id: '1040', code: '1040', name: 'ব্যাংক হিসাব (Bank Account)', category: 'Asset' as const, subType: 'Current Asset', balance: 0 },
    { id: '4010', code: '4010', name: 'পণ্য বিক্রয় আয় (Sales Revenue)', category: 'Revenue' as const, subType: 'Operating Revenue', balance: 0 },
    { id: '5120', code: '5120', name: 'দোকান / অফিস ভাড়া (Rent Expense)', category: 'Expense' as const, subType: 'Operating Expense', balance: 0 },
    { id: '5130', code: '5130', name: 'স্টাফ বেতন (Staff Salaries)', category: 'Expense' as const, subType: 'Operating Expense', balance: 0 },
    { id: '5110', code: '5110', name: 'বিজ্ঞাপন ও প্রমোশন (Meta Ads)', category: 'Expense' as const, subType: 'Operating Expense', balance: 0 },
    { id: '5020', code: '5020', name: 'কুরিয়ার ও ডেলিভারি খরচ (Courier Bill)', category: 'Expense' as const, subType: 'Operating Expense', balance: 0 },
    { id: '1500', code: '1500', name: 'অফিস যন্ত্রপাতি ও সরঞ্জাম (Equipment)', category: 'Asset' as const, subType: 'Fixed Asset', balance: 0 },
    { id: '3010', code: '3010', name: 'মালিকের মূলধন (Owner Capital)', category: 'Equity' as const, subType: 'Equity', balance: 0 },
  ];

  const cashAndBankAccounts = availableAccounts.filter(a => 
    a.category === 'Asset' && (a.code.startsWith('10') || a.subType.includes('Current'))
  );
  const expenseAccounts = availableAccounts.filter(a => a.category === 'Expense');
  const revenueAccounts = availableAccounts.filter(a => a.category === 'Revenue');
  const assetAccounts = availableAccounts.filter(a => a.category === 'Asset');
  const equityAccounts = availableAccounts.filter(a => a.category === 'Equity');

  const getAccountByCode = (code: string) => availableAccounts.find(a => a.code === code);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount) || 0;

    if (mode !== 'JOURNAL' && numAmount <= 0) {
      alert('অনুগ্রহ করে সঠিক টাকার পরিমাণ লিখুন (Please enter a valid amount)');
      return;
    }

    setIsSubmitting(true);
    try {
      const voucherNo = `VOU-${Date.now().toString().slice(-6)}`;
      let voucherType: VoucherType = 'Payment';
      let entries: VoucherEntry[] = [];

      if (mode === 'EXPENSE') {
        voucherType = 'Payment';
        const expAcc = getAccountByCode(targetAccount) || { id: targetAccount, name: 'Expense Account' };
        const payAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Payment Account' };

        entries = [
          {
            accountId: targetAccount,
            accountName: expAcc.name,
            debit: numAmount,
            credit: 0,
            narration: notes || 'খরচ পরিশোধ'
          },
          {
            accountId: paymentAccount,
            accountName: payAcc.name,
            debit: 0,
            credit: numAmount,
            narration: `পরিশোধিত মাধ্যম: ${payAcc.name}`
          }
        ];
      } else if (mode === 'INCOME') {
        voucherType = 'Receipt';
        const revAcc = getAccountByCode(targetAccount) || { id: targetAccount, name: 'Revenue Account' };
        const recAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Deposit Account' };

        entries = [
          {
            accountId: paymentAccount,
            accountName: recAcc.name,
            debit: numAmount,
            credit: 0,
            narration: `জমা মাধ্যম: ${recAcc.name}`
          },
          {
            accountId: targetAccount,
            accountName: revAcc.name,
            debit: 0,
            credit: numAmount,
            narration: notes || 'আয় / বিক্রয় বাবদ প্রাপ্তি'
          }
        ];
      } else if (mode === 'TRANSFER') {
        voucherType = 'Contra';
        const fromAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Source' };
        const toAcc = getAccountByCode(transferToAccount) || { id: transferToAccount, name: 'Destination' };

        entries = [
          {
            accountId: transferToAccount,
            accountName: toAcc.name,
            debit: numAmount,
            credit: 0,
            narration: `${fromAcc.name} থেকে স্থানান্তর প্রাপ্তি`
          },
          {
            accountId: paymentAccount,
            accountName: fromAcc.name,
            debit: 0,
            credit: numAmount,
            narration: `${toAcc.name}-এ স্থানান্তর`
          }
        ];
      } else if (mode === 'INVESTMENT') {
        voucherType = 'Receipt';
        const depAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Bank/Cash' };
        const eqAcc = getAccountByCode('3010') || { id: '3010', name: 'মালিকের মূলধন (Owner Capital)' };

        entries = [
          {
            accountId: paymentAccount,
            accountName: depAcc.name,
            debit: numAmount,
            credit: 0,
            narration: 'মূলধন ক্যাশ/ব্যাংকে জমা'
          },
          {
            accountId: eqAcc.id || '3010',
            accountName: eqAcc.name,
            debit: 0,
            credit: numAmount,
            narration: notes || 'ব্যবসায়িক মূলধন বিনিয়োগ'
          }
        ];
      } else if (mode === 'ASSET') {
        voucherType = 'Purchase';
        const assetAcc = getAccountByCode(targetAccount) || { id: targetAccount, name: 'Fixed Asset' };
        const payAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Payment Account' };

        entries = [
          {
            accountId: targetAccount,
            accountName: assetAcc.name,
            debit: numAmount,
            credit: 0,
            narration: notes || 'স্থায়ী অফিস সম্পদ ক্রয়'
          },
          {
            accountId: paymentAccount,
            accountName: payAcc.name,
            debit: 0,
            credit: numAmount,
            narration: `পরিশোধিত মাধ্যম: ${payAcc.name}`
          }
        ];
      } else if (mode === 'LOSS') {
        voucherType = 'Journal';
        const lossAcc = getAccountByCode('5190') || { id: '5190', name: 'পণ্য ক্ষতি ও অপচয় (Loss & Damages)' };
        const creditAcc = getAccountByCode(paymentAccount) || { id: paymentAccount, name: 'Inventory/Cash' };

        entries = [
          {
            accountId: '5190',
            accountName: lossAcc.name,
            debit: numAmount,
            credit: 0,
            narration: notes || 'ক্ষতি / নষ্ট পণ্য বাবদ ডেবিট'
          },
          {
            accountId: paymentAccount,
            accountName: creditAcc.name,
            debit: 0,
            credit: numAmount,
            narration: notes || 'ক্ষতি বাবদ ক্রেডিট'
          }
        ];
      } else if (mode === 'JOURNAL') {
        voucherType = 'Journal';
        const totalDebit = journalLines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
        const totalCredit = journalLines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
          alert(`জার্নাল ব্যালেন্স সমান নয়! মোট ডেবিট: ৳${totalDebit}, মোট ক্রেডিট: ৳${totalCredit}। উভয় পাশ সমান হতে হবে।`);
          setIsSubmitting(false);
          return;
        }

        entries = journalLines.map(l => {
          const acc = getAccountByCode(l.accountCode) || { id: l.accountCode, name: l.accountCode };
          return {
            accountId: l.accountCode,
            accountName: acc.name,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            narration: l.narration || notes
          };
        });
      }

      const totalVal = mode === 'JOURNAL' 
        ? journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0)
        : numAmount;

      await onSubmit({
        voucherNo,
        voucherType,
        date,
        reference: reference.trim(),
        entries,
        totalAmount: totalVal,
        notes: notes.trim(),
        subBrand: subBrand === 'ALL' ? undefined : subBrand,
        createdBy: userName || 'Admin',
        createdAt: Date.now()
      });

      onClose();
    } catch (err: any) {
      console.error('Error posting transaction:', err);
      alert('লেনদেন সম্পন্ন করতে সমস্যা হয়েছে: ' + (err.message || 'অজানা ত্রুটি'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl text-slate-100 my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <DollarSign size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                দ্রুত লেনদেন এন্ট্রি (Direct Voucher Entry)
              </h2>
              <p className="text-xs text-slate-400">
                কিছু আগে তৈরি করার প্রয়োজন নেই — এক ক্লিকে ব্যালেন্সড ভাউচার যোগ করুন
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/30 overflow-x-auto shrink-0">
          <div className="flex items-center gap-2 min-w-max">
            <button
              type="button"
              onClick={() => { setMode('EXPENSE'); setTargetAccount('5120'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'EXPENSE' 
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <TrendingDown size={15} />
              খরচ পরিশোধ (Expense)
            </button>

            <button
              type="button"
              onClick={() => { setMode('INCOME'); setTargetAccount('4010'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'INCOME' 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <TrendingUp size={15} />
              আয় / জমা (Income)
            </button>

            <button
              type="button"
              onClick={() => { setMode('TRANSFER'); setPaymentAccount('1010'); setTransferToAccount('1020'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'TRANSFER' 
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ArrowRightLeft size={15} />
              ট্রান্সফার (Contra)
            </button>

            <button
              type="button"
              onClick={() => { setMode('INVESTMENT'); setPaymentAccount('1010'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'INVESTMENT' 
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Briefcase size={15} />
              মূলধন বিনিয়োগ (Capital)
            </button>

            <button
              type="button"
              onClick={() => { setMode('ASSET'); setTargetAccount('1500'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'ASSET' 
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Building size={15} />
              স্থায়ী সম্পদ ক্রয় (Asset)
            </button>

            <button
              type="button"
              onClick={() => { setMode('LOSS'); setPaymentAccount('1100'); }}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'LOSS' 
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <AlertTriangle size={15} />
              ক্ষতি / অপচয় (Loss)
            </button>

            <button
              type="button"
              onClick={() => setMode('JOURNAL')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                mode === 'JOURNAL' 
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm' 
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <BookOpen size={15} />
              ম্যানুয়াল জার্নাল (Custom)
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">

          {/* Date, Sub-brand & Reference row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                তারিখ (Date)
              </label>
              <input 
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                সাব-ব্র্যান্ড (Sub Brand)
              </label>
              <select
                value={subBrand}
                onChange={e => setSubBrand(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
              >
                <option value="SAT">Sky Automation Tech (SAT)</option>
                <option value="GZ">GadgetZu (GZ)</option>
                <option value="RTX">RTX Gadget (RTX)</option>
                <option value="ALL">সাধারণ / সার্বিক (General)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                রেফারেন্স / ভাউচার নং
              </label>
              <input 
                type="text"
                placeholder="যেমন: TR-1049 / বিল নং"
                value={reference}
                onChange={e => setReference(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
              />
            </div>
          </div>

          {/* Quick Standard Modes */}
          {mode !== 'JOURNAL' && (
            <>
              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  টাকার পরিমাণ (Amount in BDT ৳) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-base font-bold">
                    ৳
                  </span>
                  <input 
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2.5 text-lg font-bold text-white focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              {/* Mode-specific accounts */}
              {mode === 'EXPENSE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      খরচের খাত (Expense Category)
                    </label>
                    <select
                      value={targetAccount}
                      onChange={e => setTargetAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {expenseAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      পরিশোধিত মাধ্যম (Paid From)
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === 'INCOME' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      আয়ের খাত (Revenue Category)
                    </label>
                    <select
                      value={targetAccount}
                      onChange={e => setTargetAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {revenueAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      জমা হয়েছে (Deposited In)
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === 'TRANSFER' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      উৎস অ্যাকাউন্ট (Transfer From)
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      গন্তব্য অ্যাকাউন্ট (Transfer To)
                    </label>
                    <select
                      value={transferToAccount}
                      onChange={e => setTransferToAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === 'INVESTMENT' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      বিনিয়োগকৃত মূলধন জমা হয়েছে
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      ইকুইটি হিসাব (Equity Account)
                    </label>
                    <input 
                      type="text" 
                      disabled 
                      value="3010 - মালিকের মূলধন (Owner Initial Capital)"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                    />
                  </div>
                </div>
              )}

              {mode === 'ASSET' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      সম্পদ খাত (Asset Account)
                    </label>
                    <select
                      value={targetAccount}
                      onChange={e => setTargetAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {assetAccounts.filter(a => a.category === 'Asset').map(a => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      টাকা পরিশোধ হয়েছে
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      {cashAndBankAccounts.map(a => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {mode === 'LOSS' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      লোকসান খাত (Loss Expense)
                    </label>
                    <input 
                      type="text" 
                      disabled 
                      value="5190 - পণ্য ক্ষতি ও অপচয় (Loss & Damages)"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      সম্পদ হ্রাস (Credit Account)
                    </label>
                    <select
                      value={paymentAccount}
                      onChange={e => setPaymentAccount(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
                    >
                      <option value="1100">1100 - পণ্য স্টক মূল্য (Inventory Asset)</option>
                      <option value="1010">1010 - নগদ ক্যাশ (Cash Drawer)</option>
                      <option value="1200">1200 - গ্রাহকের বাকি ঋণ (Bad Debt / Dues)</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Custom Journal Mode */}
          {mode === 'JOURNAL' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  জার্নাল এন্ট্রি লাইন (Journal Lines)
                </span>
                <button
                  type="button"
                  onClick={() => setJournalLines([...journalLines, { accountCode: '1010', debit: 0, credit: 0, narration: '' }])}
                  className="text-xs text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                >
                  + লাইন যোগ করুন
                </button>
              </div>

              <div className="space-y-2 border border-slate-800 rounded-xl p-3 bg-slate-950/50">
                {journalLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        value={line.accountCode}
                        onChange={e => {
                          const updated = [...journalLines];
                          updated[idx].accountCode = e.target.value;
                          setJournalLines(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200"
                      >
                        {chartOfAccounts.map(a => (
                          <option key={a.code} value={a.code}>
                            {a.code} - {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-3">
                      <input 
                        type="number"
                        placeholder="ডেবিট ৳"
                        value={line.debit || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...journalLines];
                          updated[idx].debit = val;
                          if (val > 0) updated[idx].credit = 0;
                          setJournalLines(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-emerald-400 font-semibold"
                      />
                    </div>

                    <div className="col-span-3">
                      <input 
                        type="number"
                        placeholder="ক্রেডিট ৳"
                        value={line.credit || ''}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = [...journalLines];
                          updated[idx].credit = val;
                          if (val > 0) updated[idx].debit = 0;
                          setJournalLines(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-rose-400 font-semibold"
                      />
                    </div>

                    <div className="col-span-1 text-center">
                      {journalLines.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setJournalLines(journalLines.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-rose-400 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Balance Verification Footer */}
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800/40 rounded-xl text-xs">
                <div>
                  মোট ডেবিট: <span className="font-bold text-emerald-400">৳{journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toLocaleString()}</span>
                </div>
                <div>
                  মোট ক্রেডিট: <span className="font-bold text-rose-400">৳{journalLines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toLocaleString()}</span>
                </div>
                <div>
                  {journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0) === journalLines.reduce((s, l) => s + (Number(l.credit) || 0), 0) ? (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} /> ব্যালেন্স ঠিক আছে
                    </span>
                  ) : (
                    <span className="text-rose-400 font-semibold">
                      পার্থক্য: ৳{Math.abs(journalLines.reduce((s, l) => s + (Number(l.debit) || 0), 0) - journalLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Narration / Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              বিবরণ / নোট (Narration / Description)
            </label>
            <textarea
              rows={2}
              placeholder="লেনদেনের প্রয়োজনীয় বিবরণ..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:bg-slate-800 text-sm font-medium transition cursor-pointer"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'পোস্টিং হচ্ছে...' : 'লেনদেন সাবমিট করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
