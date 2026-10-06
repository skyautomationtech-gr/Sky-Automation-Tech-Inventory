import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Coins, CheckCircle, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { UserProfile, OtherReceivable } from '../../types';
import { 
  subscribeToOtherReceivables, 
  addOtherReceivable, 
  updateOtherReceivable, 
  deleteOtherReceivable 
} from '../../firebase/db';

interface OtherReceivablesTabProps {
  user: UserProfile;
}

export const OtherReceivablesTab: React.FC<OtherReceivablesTabProps> = ({ user }) => {
  const [receivables, setReceivables] = useState<OtherReceivable[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [borrowerName, setBorrowerName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<'Advance Salary' | 'Loan Given' | 'Security Deposit' | 'Supplier Advance' | 'Other'>('Advance Salary');
  const [amount, setAmount] = useState('');
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Recovery Modal
  const [recoveringItem, setRecoveringItem] = useState<OtherReceivable | null>(null);
  const [recoveryAmountInput, setRecoveryAmountInput] = useState('');
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToOtherReceivables((list) => {
      setReceivables(list || []);
    });
    return () => unsub();
  }, []);

  const totalGiven = (receivables || []).reduce((s, r) => s + (Number(r?.amount) || 0), 0);
  const totalRecovered = (receivables || []).reduce((s, r) => s + (Number(r?.recoveredAmount) || 0), 0);
  const totalDue = totalGiven - totalRecovered;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setNotification({ type: 'error', message: 'সঠিক টাকার পরিমাণ দিন' });
      return;
    }
    if (!borrowerName.trim()) {
      setNotification({ type: 'error', message: 'গ্রহীতার নাম লিখুন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addOtherReceivable({
        borrowerName: borrowerName.trim(),
        phone: phone.trim(),
        type,
        amount: num,
        paidDate,
        status: 'Pending',
        recoveredAmount: 0,
        notes: notes.trim(),
        createdAt: Date.now()
      });
      setBorrowerName('');
      setPhone('');
      setAmount('');
      setNotes('');
      setShowForm(false);
      setNotification({ type: 'success', message: 'পাওনা / অগ্রিম রেকর্ড যুক্ত করা হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'সংরক্ষণ ব্যর্থ: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecordRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveringItem) return;
    const addRec = parseFloat(recoveryAmountInput);
    if (isNaN(addRec) || addRec <= 0) {
      setNotification({ type: 'error', message: 'সঠিক আদায়ের পরিমাণ লিখুন' });
      return;
    }

    const currentRec = Number(recoveringItem.recoveredAmount) || 0;
    const newTotalRec = currentRec + addRec;
    const totalPrincipal = Number(recoveringItem.amount) || 0;
    const isFullyPaid = newTotalRec >= totalPrincipal;

    try {
      await updateOtherReceivable(recoveringItem.id, {
        recoveredAmount: Math.min(newTotalRec, totalPrincipal),
        status: isFullyPaid ? 'Recovered' : (newTotalRec > 0 ? 'Partially Recovered' : 'Pending'),
        notes: `${recoveringItem.notes || ''} [আদায়: ৳${addRec} on ${new Date().toLocaleDateString()}]`.trim()
      });
      setRecoveringItem(null);
      setRecoveryAmountInput('');
      setNotification({ type: 'success', message: 'আদায় রেকর্ড আপডেট হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'আদায় সংরক্ষণ ব্যর্থ: ' + (err?.message || 'Error') });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteOtherReceivable(deleteTargetId);
      setDeleteTargetId(null);
      setNotification({ type: 'success', message: 'রেকর্ড মুছে ফেলা হয়েছে।' });
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
              <h3 className="text-base font-bold text-slate-900">পাওনা রেকর্ড মুছবেন?</h3>
              <p className="text-xs text-slate-500">এই রেকর্ডটি স্থায়ীভাবে মুছে ফেলা হবে।</p>
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

      {/* Recovery Record Modal */}
      {recoveringItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <form onSubmit={handleRecordRecovery} className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">টাকা আদায় / সমন্বয় রেকর্ড</h3>
              <button type="button" onClick={() => setRecoveringItem(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            <div className="text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-slate-500">গ্রহীতা: <strong className="text-slate-800">{recoveringItem.borrowerName}</strong></div>
              <div className="text-slate-500">মোট পাওনা: <strong className="text-slate-800">৳{(recoveringItem.amount || 0).toLocaleString()}</strong></div>
              <div className="text-slate-500">পূর্বের আদায়: <strong className="text-emerald-700">৳{(recoveringItem.recoveredAmount || 0).toLocaleString()}</strong></div>
              <div className="text-slate-500">অবশিষ্ট বকেয়া: <strong className="text-rose-700">৳{((recoveringItem.amount || 0) - (recoveringItem.recoveredAmount || 0)).toLocaleString()}</strong></div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">বর্তমানে আদায়কৃত টাকার পরিমাণ (৳) *</label>
              <input 
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={recoveryAmountInput}
                onChange={e => setRecoveryAmountInput(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRecoveringItem(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
              >
                আদায় নিশ্চিত করুন
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Coins size={18} className="text-teal-600" />
            অন্যান্য পাওনা ও অগ্রিম লেজার (Other Receivables & Advances)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">স্টাফদের অগ্রিম বেতন, দেওয়া ঋণ, জামানত ও অন্যান্য পাওনা</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start sm:self-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Plus size={15} /> + পাওনা / অগ্রিম এন্ট্রি
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
          <div className="text-xs font-semibold text-slate-500">মোট প্রদত্ত পাওনা (Total Given)</div>
          <div className="text-xl font-bold font-mono text-slate-800 mt-0.5">৳{totalGiven.toLocaleString()}</div>
        </div>

        <div className="bg-emerald-50/60 border border-emerald-200/80 p-4 rounded-xl">
          <div className="text-xs font-semibold text-emerald-800">মোট আদায় হয়েছে (Recovered)</div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">৳{totalRecovered.toLocaleString()}</div>
        </div>

        <div className="bg-teal-50/60 border border-teal-200/80 p-4 rounded-xl">
          <div className="text-xs font-semibold text-teal-800">অবশিষ্ট বকেয়া পাওনা (Net Due)</div>
          <div className="text-xl font-black font-mono text-teal-700 mt-0.5">৳{totalDue.toLocaleString()}</div>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">নতুন পাওনা / অগ্রিম এন্ট্রি</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">গ্রহীতার নাম *</label>
              <input 
                type="text"
                required
                placeholder="যেমন: কর্মীর নাম বা ব্যক্তির নাম..."
                value={borrowerName}
                onChange={e => setBorrowerName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">মোবাইল নম্বর</label>
              <input 
                type="text"
                placeholder="017xxxxxxxx"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">পাওনার ধরন</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="Advance Salary">Advance Salary (কর্মীর অগ্রিম বেতন)</option>
                <option value="Loan Given">Loan Given (ঋণ প্রদান)</option>
                <option value="Security Deposit">Security Deposit (দোকান/অফিস জামানত)</option>
                <option value="Supplier Advance">Supplier Advance (সাপ্লায়ারকে অগ্রিম)</option>
                <option value="Other">Other Receivable (অন্যান্য পাওনা)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">টাকার পরিমাণ (৳) *</label>
              <input 
                type="number"
                step="any"
                required
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">প্রদানের তারিখ *</label>
              <input 
                type="date"
                required
                value={paidDate}
                onChange={e => setPaidDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">নোট / বিবরণ</label>
              <input 
                type="text"
                placeholder="যেমন: চলতি মাসের বেতন থেকে কাটা হবে..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button" 
              onClick={() => setShowForm(false)} 
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl cursor-pointer"
            >
              বাতিল
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting} 
              className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {(!receivables || receivables.length === 0) ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো পাওনা বা অগ্রিম রেকর্ড নেই (০ টি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">গ্রহীতার নাম ও ফোন</th>
                  <th className="px-4 py-3">পাওনার ধরন</th>
                  <th className="px-4 py-3 text-right">মূল পাওনা (৳)</th>
                  <th className="px-4 py-3 text-right">আদায় হয়েছে (৳)</th>
                  <th className="px-4 py-3 text-right">অবশিষ্ট বকেয়া (৳)</th>
                  <th className="px-4 py-3">স্ট্যাটাস</th>
                  <th className="px-4 py-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {receivables.map((r) => {
                  const due = Math.max(0, (Number(r?.amount) || 0) - (Number(r?.recoveredAmount) || 0));
                  return (
                    <tr key={r?.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 font-medium text-slate-700">{r?.paidDate || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{r?.borrowerName || '-'}</div>
                        {r?.phone && <div className="text-[11px] text-slate-500">{r.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200/60">
                          {r?.type || 'Advance'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">
                        ৳{(Number(r?.amount) || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        ৳{(Number(r?.recoveredAmount) || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                        ৳{due.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          r?.status === 'Recovered'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : (r?.status === 'Partially Recovered' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-rose-50 text-rose-700 border border-rose-200')
                        }`}>
                          {r?.status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center flex items-center justify-center gap-1.5">
                        {due > 0 && (
                          <button
                            onClick={() => {
                              setRecoveringItem(r);
                              setRecoveryAmountInput(String(due));
                            }}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition cursor-pointer"
                          >
                            + আদায়
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTargetId(r?.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="মুছে ফেলুন"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
