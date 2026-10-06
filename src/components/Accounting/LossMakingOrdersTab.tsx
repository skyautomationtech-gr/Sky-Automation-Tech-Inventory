import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, AlertTriangle } from 'lucide-react';
import { UserProfile, Order } from '../../types';
import { subscribeToOrders } from '../../firebase/db';

interface LossMakingOrdersTabProps {
  user: UserProfile;
}

export const LossMakingOrdersTab: React.FC<LossMakingOrdersTabProps> = ({ user }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsub = subscribeToOrders((list) => {
      setOrders(list || []);
    });
    return () => unsub();
  }, []);

  const lossOrders = (orders || []).map(o => {
    if (!o) return null;
    const saleAmount = Number(o?.totalAmount) || 0;
    const items = Array.isArray(o?.items) ? o.items : [];
    const costAmount = items.reduce((sum, item) => sum + ((Number(item?.unitPrice) || 0) * (Number(item?.qty) || 1)), 0);
    const loss = costAmount - saleAmount;
    return {
      order: o,
      saleAmount,
      costAmount,
      loss,
      isLoss: loss > 0 && o?.status !== 'Returned/Cancelled'
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null && item.isLoss);

  const filtered = lossOrders.filter(item => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      (item.order?.id || '').toLowerCase().includes(q) ||
      (item.order?.customerName || '').toLowerCase().includes(q) ||
      (item.order?.customerPhone || '').toLowerCase().includes(q)
    );
  });

  const totalLoss = lossOrders.reduce((sum, item) => sum + Math.max(0, item.loss), 0);

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag size={18} className="text-orange-600" />
            লোকসানি অর্ডার ট্র্যাকার (Loss-Making Orders)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">যেসব অর্ডারে পণ্যের ক্রয়মূল্যের চেয়ে বিক্রয়মূল্য কম হয়েছে</p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            placeholder="অর্ডার আইডি বা গ্রাহক খুঁজুন..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-orange-50/50 border border-orange-200/80 p-4 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-orange-800">মোট অর্ডার লোকসান (Total Order Loss)</div>
          <div className="text-2xl font-black font-mono text-orange-700 mt-0.5">৳{totalLoss.toLocaleString()}</div>
        </div>
        <div className="text-xs font-bold text-orange-900 bg-orange-200/60 px-2.5 py-1 rounded-lg">
          {lossOrders.length} টি লোকসানি অর্ডার
        </div>
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400 bg-slate-50/50">
            কোনো লোকসানি অর্ডার পাওয়া যায়নি (০ টি)
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">অর্ডার নং</th>
                  <th className="px-4 py-3">গ্রাহকের নাম ও ফোন</th>
                  <th className="px-4 py-3">ব্র্যান্ড</th>
                  <th className="px-4 py-3 text-right">বিক্রয়মূল্য (৳)</th>
                  <th className="px-4 py-3 text-right">কেনা খরচ (৳)</th>
                  <th className="px-4 py-3 text-right">লোকসান (৳)</th>
                  <th className="px-4 py-3">স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filtered.map((item, idx) => (
                  <tr key={item.order?.id || idx} className="hover:bg-slate-50/80 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">
                      {item.order?.id ? (item.order.id.length > 10 ? `${item.order.id.slice(0, 10)}...` : item.order.id) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{item.order?.customerName || 'Walk-in Customer'}</div>
                      {item.order?.customerPhone && (
                        <div className="text-[11px] text-slate-500 font-medium">{item.order.customerPhone}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {item.order?.subBrand || 'SAT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">৳{(item.saleAmount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-slate-700">৳{(item.costAmount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-rose-600">
                      -৳{(item.loss || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {item.order?.status || 'Completed'}
                      </span>
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
