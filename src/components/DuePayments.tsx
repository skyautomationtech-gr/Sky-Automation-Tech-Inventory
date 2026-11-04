import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  Search, 
  AlertTriangle, 
  Plus, 
  X, 
  CheckCircle, 
  Calendar, 
  ArrowRight, 
  FileSpreadsheet, 
  TrendingUp, 
  User, 
  Clock, 
  UserCircle,
  Trash2,
  AlertCircle,
  Filter,
  CheckCircle2,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Order, UserProfile } from '../types';
import { getOrders, recordOrderPayment, deleteOrderPayment, subscribeToOrders } from '../firebase/db';

interface DuePaymentsProps {
  user: UserProfile | null;
  requireCheckIn?: () => boolean;
}

export default function DuePayments({ user, requireCheckIn }: DuePaymentsProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filtering states
  const [activeTab, setActiveTab] = useState<'still_due' | 'recently_settled'>('still_due');
  const [searchQuery, setSearchQuery] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');

  // Modal / Drawer Interaction states
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  
  // Payment deletion state
  const [deletePaymentConfirm, setDeletePaymentConfirm] = useState<{
    isOpen: boolean;
    orderId: string;
    paymentIndex: number;
    amount: number;
    method: string;
    date: number;
  } | null>(null);
  const [deletingPayment, setDeletingPayment] = useState(false);
  
  // Form fields
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToOrders((data) => {
      const relevantOrders = (data || []).filter(o => 
        o.amountDue > 0 || (o.amountDue === 0 && o.paymentHistory && o.paymentHistory.length > 0)
      );
      setOrders(relevantOrders);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOrders();
      const relevantOrders = (data || []).filter(o => 
        o.amountDue > 0 || (o.amountDue === 0 && o.paymentHistory && o.paymentHistory.length > 0)
      );
      setOrders(relevantOrders);
    } catch (err: any) {
      console.error('DuePayments: Error fetching orders:', err);
      setError('Could not retrieve outstanding receivable registers.');
    } finally {
      setLoading(false);
    }
  };

  const getDaysSinceOrder = (timestamp: number) => {
    const diffTime = Date.now() - timestamp;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 ? diffDays : 0;
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedOrderForPayment) return;

    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please provide a valid, positive payment amount.');
      return;
    }

    if (amt > selectedOrderForPayment.amountDue) {
      setError(`Cannot record a payment exceeding the outstanding due of ৳${selectedOrderForPayment.amountDue.toLocaleString()}.`);
      return;
    }

    setError('');
    setSuccess('');
    try {
      await recordOrderPayment(
        selectedOrderForPayment.id,
        amt,
        paymentMethod,
        user?.id || 'sys',
        user?.name || 'Operator'
      );

      setSuccess(`Successfully recorded a payment of ৳${amt.toLocaleString()} via ${paymentMethod} for ${selectedOrderForPayment.customerName}.`);
      setSelectedOrderForPayment(null);
      setPaymentAmount('');
      
      await fetchData();
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      setError('Could not save payment to transaction logs. Please try again.');
    }
  };

  const handleConfirmDeletePayment = async () => {
    if (!deletePaymentConfirm) return;
    setDeletingPayment(true);
    setError('');
    setSuccess('');
    try {
      const updatedOrder = await deleteOrderPayment(
        deletePaymentConfirm.orderId,
        deletePaymentConfirm.paymentIndex
      );
      setSuccess(`Payment record of ৳${deletePaymentConfirm.amount.toLocaleString()} (${deletePaymentConfirm.method}) deleted successfully. Due balance restored.`);
      setSelectedOrderForDetails(updatedOrder);
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
      setDeletePaymentConfirm(null);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      console.error('Failed to delete payment:', err);
      setError(`Failed to delete payment entry: ${err.message || err}`);
      setTimeout(() => setError(''), 4000);
    } finally {
      setDeletingPayment(false);
    }
  };

  // Search and filter logic
  const filteredOrders = orders.filter(o => {
    if (!o) return false;
    const queryLower = (searchQuery || '').toLowerCase().trim();
    const custName = (o.customerName || '').toLowerCase();
    const custPhone = o.customerPhone || '';
    const ordId = (o.id || '').toLowerCase();
    const invId = (o.invoiceId || '').toLowerCase();

    const matchesSearch = !queryLower || 
      custName.includes(queryLower) ||
      custPhone.includes(queryLower) ||
      ordId.includes(queryLower) ||
      invId.includes(queryLower);

    const matchesBrand = subBrandFilter === '' || o.subBrand === subBrandFilter;
    const matchesStatus = paymentStatusFilter === '' || o.paymentStatus === paymentStatusFilter;
    
    const matchesTab = activeTab === 'still_due' ? o.amountDue > 0 : o.amountDue === 0;

    return matchesSearch && matchesBrand && matchesStatus && matchesTab;
  }).sort((a, b) => {
    if (activeTab === 'recently_settled') {
      const aLastPayment = a.paymentHistory && a.paymentHistory.length > 0 ? a.paymentHistory[a.paymentHistory.length - 1].date : a.createdAt;
      const bLastPayment = b.paymentHistory && b.paymentHistory.length > 0 ? b.paymentHistory[b.paymentHistory.length - 1].date : b.createdAt;
      return bLastPayment - aLastPayment;
    }
    return b.createdAt - a.createdAt;
  });

  // Calculate metrics (only based on still due orders)
  const stillDueOrders = orders.filter(o => o.amountDue > 0);
  const totalReceivable = stillDueOrders.reduce((sum, o) => sum + o.amountDue, 0);
  const totalCollected = stillDueOrders.reduce((sum, o) => sum + o.amountPaid, 0);

  // Aging Buckets
  const aging0to30 = stillDueOrders.filter(o => getDaysSinceOrder(o.createdAt) <= 30);
  const aging30to60 = stillDueOrders.filter(o => getDaysSinceOrder(o.createdAt) > 30 && getDaysSinceOrder(o.createdAt) <= 60);
  const aging60Plus = stillDueOrders.filter(o => getDaysSinceOrder(o.createdAt) > 60);

  const due0to30Amt = aging0to30.reduce((s, o) => s + o.amountDue, 0);
  const due30to60Amt = aging30to60.reduce((s, o) => s + o.amountDue, 0);
  const due60PlusAmt = aging60Plus.reduce((s, o) => s + o.amountDue, 0);

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-10">
      
      {/* Toast Notifications */}
      {error && (
        <div className="flex items-center gap-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 p-4 rounded-2xl border border-rose-500/20 text-xs font-semibold">
          <AlertTriangle size={16} className="shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl border border-emerald-500/20 text-xs font-semibold">
          <CheckCircle size={16} className="shrink-0" />
          <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Coins size={22} className="text-gold-500" />
            Due Payments & Accounts Receivable
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Track customer outstanding balances, record payment settlements, and analyze aging receivables.
          </p>
        </div>

        {/* Segmented Tab Bar */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('still_due')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'still_due'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Still Due ({stillDueOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('recently_settled')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'recently_settled'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Recently Settled
          </button>
        </div>
      </div>

      {/* Aging Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Outstanding Due</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            ৳ {totalReceivable.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Across {stillDueOrders.length} active orders</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">0 - 30 Days Current</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            ৳ {due0to30Amt.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{aging0to30.length} orders</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">30 - 60 Days Aging</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            ৳ {due30to60Amt.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{aging30to60.length} orders</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-medium text-rose-600 dark:text-rose-400">60+ Days Critical</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums font-mono">
            ৳ {due60PlusAmt.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">{aging60Plus.length} orders overdue</div>
        </div>
      </div>

      {/* Filter & Table Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[500px]">
        
        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search by customer, phone, order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="">All Sub-Brands</option>
              <option value="SAT">Sky Auto</option>
              <option value="GZ">GadgetZu</option>
              <option value="RTX">RTX Gadget</option>
            </select>
          </div>
        </div>

        {/* Wide Desktop Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Order ID</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Age (Days)</th>
                <th className="pb-3 text-right">Total Order</th>
                <th className="pb-3 text-right">Amount Paid</th>
                <th className="pb-3 text-right">Amount Due</th>
                <th className="pb-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">Loading receivable registers...</td>
                </tr>
              ) : filteredOrders.length > 0 ? (
                filteredOrders.map(order => {
                  const days = getDaysSinceOrder(order.createdAt);
                  return (
                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 pl-2 font-mono font-bold text-slate-900 dark:text-white">
                        #{order.id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-3">
                        <div className="font-bold text-slate-900 dark:text-white">{order.customerName}</div>
                        <div className="text-[10px] text-slate-400">{order.customerPhone}</div>
                      </td>
                      <td className="py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          days >= 60 ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' :
                          days >= 30 ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' :
                          'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {days} days
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300 tabular-nums font-mono">
                        ৳ {order.totalAmount.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
                        ৳ {order.amountPaid.toLocaleString()}
                      </td>
                      <td className="py-3 text-right font-black text-rose-600 dark:text-rose-400 tabular-nums font-mono">
                        ৳ {order.amountDue.toLocaleString()}
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {order.amountDue > 0 && (
                            <button
                              onClick={() => setSelectedOrderForPayment(order)}
                              className="px-3 py-1 bg-gold-400 hover:bg-gold-500 text-slate-950 text-xs font-bold rounded-lg cursor-pointer transition-colors"
                            >
                              Settle Payment
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedOrderForDetails(order)}
                            className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 italic">No matching due payment records found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Record Payment Slide-Over Right Drawer */}
      {selectedOrderForPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-md h-full p-6 overflow-y-auto shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Record Settlement Payment</h3>
                <button onClick={() => setSelectedOrderForPayment(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedOrderForPayment.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Order ID:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">#{selectedOrderForPayment.id.slice(-6).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Outstanding Due:</span>
                  <span className="font-black text-rose-600 dark:text-rose-400 font-mono">৳ {selectedOrderForPayment.amountDue.toLocaleString()}</span>
                </div>
              </div>

              <form onSubmit={handleRecordPaymentSubmit} className="mt-6 space-y-4 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Amount (BDT)</label>
                  <input
                    type="number"
                    placeholder={`Max ৳${selectedOrderForPayment.amountDue}`}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    <option value="Cash">Cash</option>
                    <option value="bKash">bKash</option>
                    <option value="Nagad">Nagad</option>
                    <option value="Bank">Bank Transfer</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderForPayment(null)}
                    className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                  >
                    Save Settlement
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {selectedOrderForDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Payment History Details</h3>
              <button onClick={() => setSelectedOrderForDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="font-bold text-slate-900 dark:text-white">{selectedOrderForDetails.customerName}</div>
              <div className="space-y-1">
                {selectedOrderForDetails.paymentHistory && selectedOrderForDetails.paymentHistory.length > 0 ? (
                  selectedOrderForDetails.paymentHistory.map((ph, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-700">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">৳ {ph.amount.toLocaleString()} ({ph.method})</div>
                        <div className="text-[10px] text-slate-400">{new Date(ph.date).toLocaleString()} by {ph.recordedBy || 'Operator'}</div>
                      </div>
                      <button
                        onClick={() => setDeletePaymentConfirm({
                          isOpen: true,
                          orderId: selectedOrderForDetails.id,
                          paymentIndex: idx,
                          amount: ph.amount,
                          method: ph.method,
                          date: ph.date
                        })}
                        className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-400 italic">No partial payments recorded yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Payment Confirm */}
      {deletePaymentConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Delete Payment</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Delete payment of ৳{deletePaymentConfirm.amount.toLocaleString()} ({deletePaymentConfirm.method})? The due balance will be restored.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletePaymentConfirm(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDeletePayment}
                disabled={deletingPayment}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 text-white"
              >
                {deletingPayment ? 'Deleting...' : 'Delete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
