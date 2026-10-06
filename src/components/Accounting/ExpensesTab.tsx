import React, { useState, useEffect } from 'react';
import { Plus, Trash2, TrendingDown, Calendar, Search, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { UserProfile, Expense, ExpenseCategory, ExpensePaymentMethod } from '../../types';
import { subscribeToExpenses, addExpense, deleteExpense } from '../../firebase/db';

interface ExpensesTabProps {
  user: UserProfile;
}

export const ExpensesTab: React.FC<ExpensesTabProps> = ({ user }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('Warehouse/Rent');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>('Cash');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToExpenses((list) => {
      setExpenses(list || []);
    });
    return () => unsub();
  }, []);

  const totalExpense = (expenses || []).reduce((s, e) => s + (Number(e?.amount) || 0), 0);

  const filtered = (expenses || []).filter(e => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (e?.category || '').toLowerCase().includes(q) ||
      (e?.notes || '').toLowerCase().includes(q) ||
      (e?.supplierName || '').toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setNotification({ type: 'error', message: 'সঠিক খরচের পরিমাণ দিন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addExpense({
        category,
        amount: num,
        date,
        paymentMethod,
        supplierName: supplierName.trim(),
        notes: notes.trim(),
        createdBy: user?.name || 'Admin',
        createdAt: Date.now()
      });
      setAmount('');
      setSupplierName('');
      setNotes('');
      setShowForm(false);
      setNotification({ type: 'success', message: 'খরচের হিসাব সফলভাবে সংরক্ষিত হয়েছে।' });
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setNotification({ type: 'error', message: 'খরচ সংরক্ষণ ব্যর্থ: ' + (err?.message || 'Error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteExpense(deleteTargetId);
      setDeleteTargetId(null);
      setNotification({ type: 'success', message: 'খরচের রেকর্ড মুছে ফেলা হয়েছে।' });
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
              <h3 className="text-base font-bold text-slate-900">খরচের রেকর্ড মুছবেন?</h3>
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

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingDown size={18} className="text-emerald-600" />
            দৈনন্দিন পরিচালন খরচ লেজার (Operational Expenses)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">দোকান/অফিস ভাড়া, স্টাফ বেতন, ইউটিলিটি বিল, মার্কেটিং ও কুরিয়ার খরচ</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start sm:self-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Plus size={15} /> + নতুন খরচ যোগ করুন
        </button>
      </div>

      {/* Summary Card & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50/50 border border-emerald-200/80 p-4 rounded-xl">
        <div>
          <div className="text-xs font-semibold text-emerald-800">মোট পরিচালন খরচ (Total Expense)</div>
          <div className="text-2xl font-black font-mono text-emerald-700 mt-0.5">৳{totalExpense.toLocaleString()}</div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="খরচ বা ক্যাটাগরি খুঁজুন..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">নতুন খরচ এন্ট্রি ফরম</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">খরচের ক্যাটাগরি *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Warehouse/Rent">Warehouse / Office Rent (দোকান/অফিস ভাড়া)</option>
                <option value="Staff Salary">Staff Salary (স্টাফের বেতন)</option>
                <option value="Utility Bills">Utility Bills (বিদ্যুৎ, গ্যাস, পানি, ইন্টারনেট)</option>
                <option value="Marketing/Ads">Marketing / Ads (ফেসবুক বুস্টিং ও বিজ্ঞাপন)</option>
                <option value="Packaging & Bags">Packaging & Bags (প্যাকেজিং ও বক্স/ব্যাগ)</option>
                <option value="Courier/Logistics">Courier / Logistics (কুরিয়ার ও ডেলিভারি বিল)</option>
                <option value="Office Refreshment">Office Refreshment (নাস্তা ও আপ্যায়ন)</option>
                <option value="Equipment/Maintenance">Maintenance (মেরামত ও রক্ষণাবেক্ষণ)</option>
                <option value="Other">Other Expense (অন্যান্য খরচ)</option>
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
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">খরচের তারিখ *</label>
              <input 
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">পেমেন্ট মাধ্যম</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value as any)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Cash">Cash (নগদ ক্যাশ)</option>
                <option value="bKash">bKash (বিকাশ)</option>
                <option value="Nagad">Nagad (নগদ)</option>
                <option value="Bank">Bank Account (ব্যাংক)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">প্রাপক / ব্যক্তি / ভেন্ডর</label>
              <input 
                type="text"
                placeholder="যেমন: দারোয়ান, বাড়িওয়ালা, ফেসবুক..."
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">নোট / বিবরণ</label>
              <input 
                type="text"
                placeholder="খরচের অতিরিক্ত বিবরণ..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {(!filtered || filtered.length === 0) ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো খরচের রেকর্ড পাওয়া যায়নি (০ টি এন্ট্রি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">ক্যাটাগরি</th>
                  <th className="px-4 py-3">পেমেন্ট মাধ্যম</th>
                  <th className="px-4 py-3 text-right">টাকার পরিমাণ (৳)</th>
                  <th className="px-4 py-3">প্রাপক / ভেন্ডর</th>
                  <th className="px-4 py-3">নোট</th>
                  <th className="px-4 py-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((e) => (
                  <tr key={e?.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-medium text-slate-700">{e?.date || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                        {e?.category || 'Expense'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{e?.paymentMethod || 'Cash'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      ৳{(Number(e?.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">{e?.supplierName || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{e?.notes || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDeleteTargetId(e?.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 size={15} />
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
