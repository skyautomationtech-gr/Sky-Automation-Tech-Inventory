import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Building, Calendar, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { UserProfile, CompanyPurchase } from '../../types';
import { subscribeToCompanyPurchases, addCompanyPurchase, deleteCompanyPurchase } from '../../firebase/db';

interface CompanyPurchasesTabProps {
  user: UserProfile;
}

export const CompanyPurchasesTab: React.FC<CompanyPurchasesTabProps> = ({ user }) => {
  const [purchases, setPurchases] = useState<CompanyPurchase[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Office Equipment');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidVia, setPaidVia] = useState('Cash');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToCompanyPurchases((list) => {
      setPurchases(list || []);
    });
    return () => unsub();
  }, []);

  const totalAmount = (purchases || []).reduce((s, p) => s + (Number(p?.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setNotification({ type: 'error', message: 'সঠিক টাকার পরিমাণ দিন' });
      return;
    }
    if (!title.trim()) {
      setNotification({ type: 'error', message: 'পণ্যের নাম বা বিবরণ লিখুন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addCompanyPurchase({
        title: title.trim(),
        category,
        amount: num,
        date,
        paidVia,
        supplier: supplier.trim(),
        invoiceNo: invoiceNo.trim(),
        note: note.trim(),
        createdAt: Date.now()
      });
      setTitle('');
      setAmount('');
      setSupplier('');
      setInvoiceNo('');
      setNote('');
      setShowForm(false);
      setNotification({ type: 'success', message: 'কোম্পানি কেনাকাটা সফলভাবে সংরক্ষণ হয়েছে।' });
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
      await deleteCompanyPurchase(deleteTargetId);
      setDeleteTargetId(null);
      setNotification({ type: 'success', message: 'কেনাকাটা রেকর্ড মুছে ফেলা হয়েছে।' });
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
              <h3 className="text-base font-bold text-slate-900">কেনাকাটা রেকর্ড মুছে ফেলবেন?</h3>
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
            <Building size={18} className="text-purple-600" />
            কোম্পানি কেনাকাটা ও সম্পদ লেজার (Purchases & Fixed Assets)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">অফিস সরঞ্জাম, ফার্নিচার, কম্পিউটার ও স্থায়ী সম্পদ ক্রয়ের হিসাব</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start sm:self-auto px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Plus size={15} /> + কেনাকাটা এন্ট্রি
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-purple-50/50 border border-purple-200/80 p-4 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-purple-800">মোট স্থায়ী সম্পদ ও কেনাকাটা (Total Assets)</div>
          <div className="text-2xl font-black font-mono text-purple-700 mt-0.5">৳{totalAmount.toLocaleString()}</div>
        </div>
        <div className="text-xs font-bold text-purple-900 bg-purple-200/60 px-2.5 py-1 rounded-lg">
          {(purchases || []).length} টি এন্ট্রি
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">নতুন সম্পদ / কেনাকাটা এন্ট্রি</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">আইটেম / সরঞ্জামের নাম *</label>
              <input 
                type="text"
                required
                placeholder="যেমন: Dell Monitor, Office Chair, Printer..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">ক্যাটাগরি</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="Office Equipment">Office Equipment (অফিস সরঞ্জাম)</option>
                <option value="Furniture & Fixture">Furniture & Fixture (ফার্নিচার)</option>
                <option value="IT Hardware & Devices">IT Hardware & Devices (কম্পিউটার/মোবাইল)</option>
                <option value="Packaging Machinery">Packaging Machinery (প্যাকিং মেশিন)</option>
                <option value="Vehicle / Delivery Bike">Vehicle / Delivery (যানবাহন)</option>
                <option value="Other Asset">Other Fixed Asset (অন্যান্য সম্পদ)</option>
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
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">ক্রয়ের তারিখ *</label>
              <input 
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">পেমেন্ট মাধ্যম</label>
              <select
                value={paidVia}
                onChange={e => setPaidVia(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="Cash">Cash (নগদ ক্যাশ)</option>
                <option value="bKash">bKash (বিকাশ)</option>
                <option value="Nagad">Nagad (নগদ)</option>
                <option value="Bank Transfer">Bank Transfer (ব্যাংক একাউন্ট)</option>
                <option value="Credit Card">Credit Card (ক্রেডিট কার্ড)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">সাপ্লায়ার / শপ নাম</label>
              <input 
                type="text"
                placeholder="যেমন: Ryans, Star Tech, Local Market..."
                value={supplier}
                onChange={e => setSupplier(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
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
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {(!purchases || purchases.length === 0) ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো কেনাকাটার রেকর্ড নেই (০ টি এন্ট্রি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">আইটেম / সরঞ্জামের নাম</th>
                  <th className="px-4 py-3">ক্যাটাগরি</th>
                  <th className="px-4 py-3">পেমেন্ট মাধ্যম</th>
                  <th className="px-4 py-3 text-right">মূল্য (৳)</th>
                  <th className="px-4 py-3">সাপ্লায়ার</th>
                  <th className="px-4 py-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {purchases.map((p) => (
                  <tr key={p?.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-medium text-slate-700">{p?.date || '-'}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{p?.title || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60">
                        {p?.category || 'Office Asset'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{p?.paidVia || 'Cash'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-purple-700">
                      ৳{(Number(p?.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p?.supplier || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDeleteTargetId(p?.id)}
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
