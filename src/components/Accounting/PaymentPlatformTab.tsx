import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CreditCard, Edit2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { UserProfile, PaymentPlatformLedger } from '../../types';
import { 
  subscribeToPaymentPlatformLedger, 
  addPaymentPlatformEntry, 
  updatePaymentPlatformEntry, 
  deletePaymentPlatformEntry 
} from '../../firebase/db';

interface PaymentPlatformTabProps {
  user: UserProfile;
}

export const PaymentPlatformTab: React.FC<PaymentPlatformTabProps> = ({ user }) => {
  const [platforms, setPlatforms] = useState<PaymentPlatformLedger[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [platform, setPlatform] = useState('bKash Merchant');
  const [accountNo, setAccountNo] = useState('');
  const [currentBalance, setCurrentBalance] = useState('');
  const [pendingSettlement, setPendingSettlement] = useState('');
  const [feePercentage, setFeePercentage] = useState('1.5');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToPaymentPlatformLedger((list) => {
      setPlatforms(list || []);
    });
    return () => unsub();
  }, []);

  const totalBalance = (platforms || []).reduce((s, p) => s + (Number(p?.currentBalance) || 0), 0);
  const totalPending = (platforms || []).reduce((s, p) => s + (Number(p?.pendingSettlement) || 0), 0);

  const handleOpenEdit = (item: PaymentPlatformLedger) => {
    setEditingId(item.id);
    setPlatform(item.platform || 'bKash Merchant');
    setAccountNo(item.accountNo || '');
    setCurrentBalance(String(item.currentBalance ?? ''));
    setPendingSettlement(String(item.pendingSettlement ?? ''));
    setFeePercentage(String(item.feePercentage ?? '1.5'));
    setNotes(item.notes || '');
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingId(null);
    setAccountNo('');
    setCurrentBalance('');
    setPendingSettlement('');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bal = parseFloat(currentBalance) || 0;
    const pend = parseFloat(pendingSettlement) || 0;
    const fee = parseFloat(feePercentage) || 0;

    setIsSubmitting(true);
    try {
      if (editingId) {
        await updatePaymentPlatformEntry(editingId, {
          platform,
          accountNo: accountNo.trim(),
          currentBalance: bal,
          pendingSettlement: pend,
          feePercentage: fee,
          lastUpdated: Date.now(),
          notes: notes.trim(),
        });
        setNotification({ type: 'success', message: 'গেটওয়ে অ্যাকাউন্ট আপডেট করা হয়েছে।' });
      } else {
        await addPaymentPlatformEntry({
          platform,
          accountNo: accountNo.trim(),
          currentBalance: bal,
          pendingSettlement: pend,
          feePercentage: fee,
          lastUpdated: Date.now(),
          notes: notes.trim(),
          createdAt: Date.now()
        });
        setNotification({ type: 'success', message: 'নতুন গেটওয়ে অ্যাকাউন্ট যুক্ত হয়েছে।' });
      }
      handleCloseForm();
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'সংরক্ষণ ব্যর্থ: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deletePaymentPlatformEntry(deleteTargetId);
      setDeleteTargetId(null);
      setNotification({ type: 'success', message: 'গেটওয়ে অ্যাকাউন্ট মুছে ফেলা হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'মুছে ফেলা যায়নি: ' + (err?.message || 'Error') });
    }
  };

  return (
    <div className="space-y-5">
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

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">গেটওয়ে অ্যাকাউন্ট মুছবেন?</h3>
              <p className="text-xs text-slate-500">এই অ্যাকাউন্টের ডাটা স্থায়ীভাবে মুছে ফেলা হবে।</p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                বাতিল
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                মুছে ফেলুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CreditCard size={18} className="text-blue-600" />
            পেমেন্ট গেটওয়ে ও ব্যাংক লেজার (Payment Gateways & Accounts)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">বিকাশ মার্চেন্ট, নগদ, রকেট, ব্যাংক ও পিওএস ব্যালেন্স ট্র্যাকিং</p>
        </div>

        <button
          onClick={() => {
            if (showForm) handleCloseForm();
            else setShowForm(true);
          }}
          className="self-start sm:self-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Plus size={15} /> + গেটওয়ে অ্যাকাউন্ট যোগ করুন
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-blue-50/50 border border-blue-200/80 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-blue-800">মোট বর্তমান ব্যালেন্স (Current Balance)</div>
            <div className="text-2xl font-black font-mono text-blue-700 mt-0.5">৳{totalBalance.toLocaleString()}</div>
          </div>
          <div className="text-xs font-bold text-blue-900 bg-blue-200/60 px-2.5 py-1 rounded-lg">
            {(platforms || []).length} টি অ্যাকাউন্ট
          </div>
        </div>

        <div className="bg-amber-50/50 border border-amber-200/80 p-4 rounded-xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-amber-800">অপেক্ষমাণ সেটেলমেন্ট (Pending Settlement)</div>
            <div className="text-2xl font-black font-mono text-amber-700 mt-0.5">৳{totalPending.toLocaleString()}</div>
          </div>
          <div className="text-xs font-bold text-amber-900 bg-amber-200/60 px-2.5 py-1 rounded-lg">
            প্রক্রিয়াধীন
          </div>
        </div>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {editingId ? 'গেটওয়ে অ্যাকাউন্ট তথ্য আপডেট' : 'নতুন পেমেন্ট গেটওয়ে অ্যাকাউন্ট যোগ'}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">গেটওয়ে / ব্যাংক প্ল্যাটফর্ম</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="bKash Merchant">bKash Merchant (বিকাশ মার্চেন্ট)</option>
                <option value="bKash Personal/Agent">bKash Personal / Agent</option>
                <option value="Nagad Merchant">Nagad Merchant (নগদ মার্চেন্ট)</option>
                <option value="Nagad Personal">Nagad Personal</option>
                <option value="Rocket">Rocket (DBBL)</option>
                <option value="City Bank Account">City Bank Account</option>
                <option value="BRAC Bank Account">BRAC Bank Account</option>
                <option value="Islami Bank Account">Islami Bank Account</option>
                <option value="SSLCommerz / Shurjopay">SSLCommerz / Gateway</option>
                <option value="Other Bank / Channel">Other Bank / Channel</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">অ্যাকাউন্ট নং / ফোন নম্বর *</label>
              <input 
                type="text"
                required
                placeholder="যেমন: 017xxxxxxxx বা A/C: 1502..."
                value={accountNo}
                onChange={e => setAccountNo(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">বর্তমান ব্যালেন্স (৳) *</label>
              <input 
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={currentBalance}
                onChange={e => setCurrentBalance(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">অপেক্ষমাণ সেটেলমেন্ট (৳)</label>
              <input 
                type="number"
                step="any"
                placeholder="0.00"
                value={pendingSettlement}
                onChange={e => setPendingSettlement(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">গেটওয়ে চার্জ হার (%)</label>
              <input 
                type="number"
                step="0.01"
                placeholder="1.50"
                value={feePercentage}
                onChange={e => setFeePercentage(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">নোট / বিবরণ</label>
              <input 
                type="text"
                placeholder="যেমন: মেইন শপ পেমেন্ট গেটওয়ে..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button" 
              onClick={handleCloseForm} 
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
            >
              বাতিল
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : (editingId ? 'আপডেট করুন' : 'সংরক্ষণ করুন')}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {(!platforms || platforms.length === 0) ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো গেটওয়ে অ্যাকাউন্ট যুক্ত করা নেই (০ টি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">প্ল্যাটফর্ম নাম</th>
                  <th className="px-4 py-3">অ্যাকাউন্ট নং</th>
                  <th className="px-4 py-3 text-right">বর্তমান ব্যালেন্স (৳)</th>
                  <th className="px-4 py-3 text-right">পেন্ডিং সেটেলমেন্ট (৳)</th>
                  <th className="px-4 py-3 text-right">চার্জ (%)</th>
                  <th className="px-4 py-3">নোট</th>
                  <th className="px-4 py-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {platforms.map((p) => (
                  <tr key={p?.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-bold text-slate-900">{p?.platform || '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{p?.accountNo || '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                      ৳{(Number(p?.currentBalance) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-amber-700">
                      ৳{(Number(p?.pendingSettlement) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-500">{p?.feePercentage || 0}%</td>
                    <td className="px-4 py-3 text-slate-500">{p?.notes || '-'}</td>
                    <td className="px-4 py-3 text-center flex items-center justify-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                        title="সম্পাদনা"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(p?.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
