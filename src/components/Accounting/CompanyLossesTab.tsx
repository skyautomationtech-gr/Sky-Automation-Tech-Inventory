import React, { useState, useEffect } from 'react';
import { Plus, Trash2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { UserProfile, CompanyLoss } from '../../types';
import { subscribeToCompanyLosses, addCompanyLoss, deleteCompanyLoss } from '../../firebase/db';

interface CompanyLossesTabProps {
  user: UserProfile;
}

export const CompanyLossesTab: React.FC<CompanyLossesTabProps> = ({ user }) => {
  const [losses, setLosses] = useState<CompanyLoss[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('Product Damage');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [subBrand, setSubBrand] = useState('SAT');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = subscribeToCompanyLosses((list) => {
      setLosses(list || []);
    });
    return () => unsub();
  }, []);

  const totalLoss = (losses || []).reduce((s, l) => s + (Number(l?.amount) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      setNotification({ type: 'error', message: 'সঠিক টাকার পরিমাণ দিন' });
      return;
    }
    if (!title.trim()) {
      setNotification({ type: 'error', message: 'ক্ষতির বিবরণ বা আইটেমের নাম দিন' });
      return;
    }

    setIsSubmitting(true);
    try {
      await addCompanyLoss({
        title: title.trim(),
        reason,
        amount: num,
        date,
        subBrand,
        note: note.trim(),
        recordedBy: user?.name || 'Admin',
        createdAt: Date.now()
      });
      setTitle('');
      setAmount('');
      setNote('');
      setShowForm(false);
      setNotification({ type: 'success', message: 'ক্ষতি ও অপচয়ের রেকর্ড সফলভাবে সংরক্ষিত হয়েছে।' });
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
      await deleteCompanyLoss(deleteTargetId);
      setDeleteTargetId(null);
      setNotification({ type: 'success', message: 'ক্ষতির রেকর্ড মুছে ফেলা হয়েছে।' });
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
              <h3 className="text-base font-bold text-slate-900">ক্ষতির রেকর্ড মুছে ফেলবেন?</h3>
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
            <AlertTriangle size={18} className="text-rose-600" />
            কোম্পানির ক্ষতি ও অপচয় লেজার (Company Losses & Damages)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">পণ্য নষ্ট, কুরিয়ার রিটার্ন ড্যামেজ, চুরি বা অনাদায়ী ক্ষতির হিসাব</p>
        </div>

        <button
          onClick={() => setShowForm(!showForm)}
          className="self-start sm:self-auto px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-2 shadow-xs"
        >
          <Plus size={15} /> + ক্ষতি এন্ট্রি
        </button>
      </div>

      {/* Summary Card */}
      <div className="bg-rose-50/50 border border-rose-200/80 p-4 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-rose-800">মোট ক্ষতি ও অপচয় (Total Loss)</div>
          <div className="text-2xl font-black font-mono text-rose-700 mt-0.5">৳{totalLoss.toLocaleString()}</div>
        </div>
        <div className="text-xs font-bold text-rose-900 bg-rose-200/60 px-2.5 py-1 rounded-lg">
          {(losses || []).length} টি এন্ট্রি
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">নতুন ক্ষতি / অপচয় এন্ট্রি</div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">ক্ষতির বিষয় / পণ্যের নাম *</label>
              <input 
                type="text"
                required
                placeholder="যেমন: ড্যামেজ চার্জার ১০ পিস, ট্রানজিট লস..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">ক্ষতির কারণ</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="Product Damage">Product Damage (পণ্য ড্যামেজ / নষ্ট)</option>
                <option value="Courier Transit Loss">Courier Transit Loss (কুরিয়ারে হারিয়ে যাওয়া/নষ্ট)</option>
                <option value="Dead Stock Write-off">Dead Stock Write-off (অকেজো স্টক অবলোপন)</option>
                <option value="Theft / Inventory Shortage">Theft / Inventory Shortage (চুরি বা স্টক ঘাটতি)</option>
                <option value="Bad Debt / Unrecoverable">Bad Debt (অনাদায়ী দেনা)</option>
                <option value="Other Loss">Other Business Loss (অন্যান্য ক্ষতি)</option>
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
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">তারিখ *</label>
              <input 
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">সাব-ব্র্যান্ড</label>
              <select
                value={subBrand}
                onChange={e => setSubBrand(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
              >
                <option value="SAT">Sky Automation Tech (SAT)</option>
                <option value="GZ">GadgetZu (GZ)</option>
                <option value="RTX">RTX Gadget (RTX)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">নোট / বিস্তারিত</label>
              <input 
                type="text"
                placeholder="যেমন: রিফান্ড না পেয়ে ফেলে দিতে হয়েছে..."
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500"
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
              className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              {isSubmitting ? 'সংরক্ষণ হচ্ছে...' : 'সংরক্ষণ করুন'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {(!losses || losses.length === 0) ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো ক্ষতির রেকর্ড নেই (০ টি এন্ট্রি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">তারিখ</th>
                  <th className="px-4 py-3">ক্ষতির বিষয়</th>
                  <th className="px-4 py-3">কারণ</th>
                  <th className="px-4 py-3">ব্র্যান্ড</th>
                  <th className="px-4 py-3 text-right">টাকার পরিমাণ (৳)</th>
                  <th className="px-4 py-3">নোট</th>
                  <th className="px-4 py-3 text-center">অ্যাকশন</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {losses.map((l) => (
                  <tr key={l?.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-medium text-slate-700">{l?.date || '-'}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">{l?.title || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/60">
                        {l?.reason || 'Loss'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-medium">{l?.subBrand || 'SAT'}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-rose-700">
                      ৳{(Number(l?.amount) || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{l?.note || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setDeleteTargetId(l?.id)}
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
