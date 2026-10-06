import React, { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Calculator, DollarSign } from 'lucide-react';
import { CashReconciliation } from '../../types';

interface CashReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemBalance: number;
  userName: string;
  onSubmit: (data: Omit<CashReconciliation, 'id'>) => Promise<void>;
}

export const CashReconciliationModal: React.FC<CashReconciliationModalProps> = ({
  isOpen,
  onClose,
  systemBalance,
  userName,
  onSubmit
}) => {
  const [denominations, setDenominations] = useState<{ [key: number]: number }>({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0
  });

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const physicalCount = Object.entries(denominations).reduce(
    (sum, [noteVal, count]) => sum + (Number(noteVal) * (Number(count) || 0)), 
    0
  );

  const discrepancy = physicalCount - systemBalance;

  const handleDenomChange = (val: number, count: string) => {
    const num = parseInt(count) || 0;
    setDenominations(prev => ({ ...prev, [val]: Math.max(0, num) }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        systemBalance,
        physicalCount,
        discrepancy,
        notes: notes.trim(),
        date: new Date().toISOString().split('T')[0],
        reconciledBy: userName,
        createdAt: Date.now()
      });
      onClose();
    } catch (err: any) {
      alert('মিলকরণ সংরক্ষণ করতে সমস্যা: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl text-slate-100 max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Calculator size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">নগদ ক্যাশ ড্রয়ার মিলকরণ (Cash Audit)</h2>
              <p className="text-xs text-slate-400">শারীরিক ক্যাশ নোট গণনা এবং হিসাব সমন্বয়</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-slate-400">সিস্টেম ক্যাশ ব্যালেন্স:</div>
              <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                ৳{systemBalance.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="text-slate-400">গণনাকৃত বাস্তব ক্যাশ:</div>
              <div className="text-base font-bold text-white font-mono mt-0.5">
                ৳{physicalCount.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Discrepancy indicator */}
          <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            Math.abs(discrepancy) < 0.01 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
              : discrepancy > 0 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {Math.abs(discrepancy) < 0.01 ? (
                <CheckCircle2 size={16} className="text-emerald-400" />
              ) : (
                <AlertTriangle size={16} className={discrepancy > 0 ? "text-blue-400" : "text-rose-400"} />
              )}
              <span className="font-semibold">
                {Math.abs(discrepancy) < 0.01 
                  ? 'ক্যাশ সম্পূর্ণ মিলে গেছে (Exact Match)' 
                  : discrepancy > 0 
                    ? `ক্যাশ বেশি আছে (+৳${discrepancy.toLocaleString()})`
                    : `ক্যাশ ঘাটতি আছে (-৳${Math.abs(discrepancy).toLocaleString()})`
                }
              </span>
            </div>
            <span className="font-mono font-bold">
              {discrepancy >= 0 ? `+৳${discrepancy.toLocaleString()}` : `-৳${Math.abs(discrepancy).toLocaleString()}`}
            </span>
          </div>

          {/* Note Denomination counter */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              নোটের সংখ্যা লিখুন (Denomination Counter):
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[1000, 500, 200, 100, 50, 20, 10, 5].map((val) => (
                <div key={val} className="flex items-center justify-between bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-300 font-mono font-medium">৳{val} x</span>
                  <input 
                    type="number"
                    min="0"
                    placeholder="0"
                    value={denominations[val] || ''}
                    onChange={e => handleDenomChange(val, e.target.value)}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center font-mono text-white text-xs"
                  />
                  <span className="text-slate-400 text-[11px] font-mono w-16 text-right">
                    ৳{((denominations[val] || 0) * val).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              মিলকরণ নোট / কারণ (Reconciliation Note)
            </label>
            <textarea
              rows={2}
              placeholder="পার্থক্য বা অন্যান্য ব্যাখ্যা থাকলে লিখুন..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold transition"
            >
              বাতিল
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'মিলকরণ সম্পন্ন করুন'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
