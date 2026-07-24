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
  UserCircle 
} from 'lucide-react';
import { Order, UserProfile } from '../types';
import { getOrders, recordOrderPayment } from '../firebase/db';

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
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(''); // Due, Partial

  // Modal / Interaction states
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] = useState<Order | null>(null);
  
  // Form fields
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getOrders();
      // Filter orders that are relevant to this screen:
      // 1. Still Due (amountDue > 0)
      // 2. Recently Settled (amountDue === 0, but has payment history indicating it was paid off)
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

  const getOverdueBadgeClass = (days: number) => {
    if (days >= 14) {
      return 'bg-red-50 text-red-700 border border-red-200';
    } else if (days >= 7) {
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    } else {
      return 'bg-slate-50 text-slate-600 border border-slate-200';
    }
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
      
      // Refresh list
      await fetchData();
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      setError('Could not save payment to transaction logs. Please try again.');
    }
  };

  // Search and filter logic
  const filteredOrders = orders.filter(o => {
    const queryLower = searchQuery.toLowerCase();
    const matchesSearch = 
      o.customerName.toLowerCase().includes(queryLower) ||
      o.customerPhone.includes(queryLower) ||
      o.id.toLowerCase().includes(queryLower) ||
      (o.invoiceId && o.invoiceId.toLowerCase().includes(queryLower));

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
  const agingOver14DaysCount = stillDueOrders.filter(o => getDaysSinceOrder(o.createdAt) >= 14).length;

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 animate-fade-in text-sm font-semibold">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 animate-fade-in text-sm font-semibold">
          <CheckCircle size={16} className="flex-shrink-0" />
          <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-sm font-mono font-bold text-amber-500 uppercase tracking-widest">Accounts Receivable</span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <Coins className="text-slate-900" size={24} />
            Due Payments
          </h1>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            Monitor outstanding sales dues and partial customer balances. Record manual partial payments and track collection age.
          </p>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-amber-50 rounded-2xl text-[#D4AF37]">
            <Coins size={22} />
          </div>
          <div>
            <span className="text-sm uppercase font-bold text-slate-400 tracking-wider">Total Outstanding Due</span>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">৳{totalReceivable.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
            <TrendingUp size={22} />
          </div>
          <div>
            <span className="text-sm uppercase font-bold text-slate-400 tracking-wider">Partially Collected</span>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">৳{totalCollected.toLocaleString()}</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4">
          <div className="p-3 bg-red-50 rounded-2xl text-red-600">
            <Clock size={22} />
          </div>
          <div>
            <span className="text-sm uppercase font-bold text-slate-400 tracking-wider">Aged Receivables (14d+)</span>
            <h3 className="text-xl font-black text-slate-900 mt-0.5 font-mono">{agingOver14DaysCount} Orders</h3>
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="w-full md:flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Search by customer name, phone, or order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Sub brand filter */}
          <div className="w-full md:w-56">
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden focus:border-amber-400"
            >
              <option value="">All Sub-Brands</option>
              <option value="SAT">Sky Auto (SAT)</option>
              <option value="GZ">GadgetZu (GZ)</option>
              <option value="RTX">RTX Gadget (RTX)</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="w-full md:w-56">
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden focus:border-amber-400"
            >
              <option value="">All Outstanding States</option>
              <option value="Due">Unpaid (Due)</option>
              <option value="Partial">Partially Paid</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('still_due')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'still_due'
              ? 'border-amber-400 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Still Due
          {orders.filter(o => o.amountDue > 0).length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded-full">
              {orders.filter(o => o.amountDue > 0).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('recently_settled')}
          className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
            activeTab === 'recently_settled'
              ? 'border-emerald-500 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Recently Settled
        </button>
      </div>

      {/* Receivables Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {loading && orders.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400 font-mono">
            Scanning ledger books for unpaid receivables...
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <CheckCircle size={32} className="mx-auto text-emerald-200 mb-2" />
            <p className="text-sm font-semibold text-slate-500">Perfect sheet! No outstanding dues found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Customer Contact</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Sub-Brand</th>
                  {activeTab === 'still_due' ? (
                    <>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Order Date</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Aging</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Invoice / Ref #</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Total Amt</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Paid So Far</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Amount Due</th>
                      <th className="py-4 px-6 text-right text-sm font-bold text-slate-400 uppercase tracking-wider">Record</th>
                    </>
                  ) : (
                    <>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Invoice / Ref #</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Total Amt</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Status</th>
                      <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider text-right">Details</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {filteredOrders.map((ord) => {
                  const daysOld = getDaysSinceOrder(ord.createdAt);
                  const lastPaymentDate = ord.paymentHistory && ord.paymentHistory.length > 0 
                    ? ord.paymentHistory[ord.paymentHistory.length - 1].date 
                    : ord.createdAt;

                  return (
                    <tr key={ord.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6 font-semibold text-slate-700">
                        <div>{ord.customerName}</div>
                        <div className="text-sm text-slate-400 font-mono">{ord.customerPhone}</div>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`inline-block text-[9px] font-mono uppercase px-2 py-0.5 rounded-full font-bold ${
                          ord.subBrand === 'SAT' 
                            ? 'bg-amber-100 text-amber-800' 
                            : ord.subBrand === 'GZ' 
                              ? 'bg-teal-100 text-teal-800' 
                              : 'bg-orange-100 text-orange-800'
                        }`}>
                          {ord.subBrand}
                        </span>
                      </td>
                      
                      {activeTab === 'still_due' ? (
                        <>
                          <td className="py-3.5 px-6 font-mono text-slate-400">
                            {new Date(ord.createdAt).toLocaleDateString('en-GB')}
                          </td>
                          <td className="py-3.5 px-6">
                            <span className={`inline-block text-sm font-mono font-bold px-2 py-1 rounded-lg ${getOverdueBadgeClass(daysOld)}`}>
                              {daysOld === 0 ? 'Today' : `${daysOld} days`}
                            </span>
                          </td>
                          <td className="py-3.5 px-6">
                            <button
                              onClick={() => setSelectedOrderForDetails(ord)}
                              className="font-mono text-sm text-[#D4AF37] hover:underline font-bold tracking-tight text-left cursor-pointer"
                            >
                              {ord.invoiceId ? 'Linked Invoice' : `Order #${ord.id.substring(0, 8).toUpperCase()}`}
                            </button>
                          </td>
                          <td className="py-3.5 px-6 font-mono font-bold text-slate-600">
                            ৳{ord.totalAmount.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-6 font-mono text-emerald-600 font-semibold">
                            ৳{ord.amountPaid.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-6 font-mono font-black text-red-600">
                            ৳{ord.amountDue.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-6 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedOrderForPayment(ord)}
                                className="bg-slate-900 hover:bg-slate-800 text-[#D4AF37] hover:text-white text-sm font-bold py-1.5 px-3.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Plus size={11} />
                                Record
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3.5 px-6">
                            <button
                              onClick={() => setSelectedOrderForDetails(ord)}
                              className="font-mono text-sm text-[#D4AF37] hover:underline font-bold tracking-tight text-left cursor-pointer"
                            >
                              {ord.invoiceId ? 'Linked Invoice' : `Order #${ord.id.substring(0, 8).toUpperCase()}`}
                            </button>
                          </td>
                          <td className="py-3.5 px-6 font-mono font-bold text-slate-600">
                            ৳{ord.totalAmount.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-6">
                            <div className="flex items-center gap-1.5">
                              <CheckCircle size={14} className="text-emerald-500" />
                              <span className="text-sm font-bold text-emerald-600">
                                Settled on {new Date(lastPaymentDate).toLocaleDateString('en-GB')}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-6 text-right">
                             <button
                                onClick={() => setSelectedOrderForDetails(ord)}
                                className="text-sm font-bold text-slate-500 hover:text-slate-800 cursor-pointer underline"
                              >
                                View Log
                              </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Dialog Modal */}
      {selectedOrderForPayment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <Coins size={16} className="text-[#D4AF37]" />
                Record Cash Collection
              </h3>
              <button 
                onClick={() => {
                  setSelectedOrderForPayment(null);
                  setPaymentAmount('');
                }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
              {/* Payment Summary */}
              <div className="bg-slate-50 p-4 rounded-2xl space-y-1.5 text-sm text-slate-600 border border-slate-100">
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <strong className="text-slate-800">{selectedOrderForPayment.customerName}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Outstanding Due:</span>
                  <strong className="text-red-600 font-mono">৳{selectedOrderForPayment.amountDue.toLocaleString()}</strong>
                </div>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-600">Collection Amount (৳) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  max={selectedOrderForPayment.amountDue}
                  min="1"
                  placeholder={`Max ৳${selectedOrderForPayment.amountDue}`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-hidden focus:border-amber-400 text-slate-800 font-mono font-bold"
                />
              </div>

              {/* Payment Method Select */}
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-slate-600">Payment Gateway / Method *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-hidden focus:border-amber-400 text-slate-700 font-semibold"
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash (MFS)</option>
                  <option value="Nagad">Nagad (MFS)</option>
                  <option value="Bank">Direct Bank Transfer</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrderForPayment(null);
                    setPaymentAmount('');
                  }}
                  className="py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] hover:text-white text-sm font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  Submit Payment
                  <ArrowRight size={13} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Collection History slide-out / Detail Modal */}
      {selectedOrderForDetails && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Payment Ledger Card</h3>
                <p className="text-sm text-slate-400 mt-0.5">Reference ID: #{selectedOrderForDetails.id.substring(0, 8).toUpperCase()}</p>
              </div>
              <button onClick={() => setSelectedOrderForDetails(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>

            {/* Customer Details */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm border border-slate-100 p-3 rounded-2xl bg-slate-50/50">
                <div>
                  <span className="text-sm uppercase font-bold text-slate-400">Customer Name</span>
                  <p className="font-bold text-slate-700 mt-0.5">{selectedOrderForDetails.customerName}</p>
                </div>
                <div>
                  <span className="text-sm uppercase font-bold text-slate-400">Phone Contact</span>
                  <p className="font-mono font-semibold text-slate-700 mt-0.5">{selectedOrderForDetails.customerPhone}</p>
                </div>
              </div>

              {/* Items breakdown list */}
              <div>
                <h4 className="text-sm uppercase font-bold text-slate-400 tracking-wider mb-2">Ordered Items Breakdown</h4>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {selectedOrderForDetails.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1.5 px-3 bg-slate-50 border border-slate-100 rounded-xl">
                      <span>{it.productName} <span className="text-slate-400 text-sm">({it.variantLabel})</span></span>
                      <strong className="font-mono">Qty: {it.qty}</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment History Log Table */}
              <div>
                <h4 className="text-sm uppercase font-bold text-slate-400 tracking-wider mb-2">Payment Collections History Log</h4>
                {!selectedOrderForDetails.paymentHistory || selectedOrderForDetails.paymentHistory.length === 0 ? (
                  <p className="text-sm text-slate-400 italic bg-amber-50/30 border border-amber-100/50 p-3 rounded-xl text-center">
                    No payment collection entries recorded yet. Outstanding due is fully unpaid.
                  </p>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden text-sm max-h-44 overflow-y-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-[9px] uppercase font-bold text-slate-400">
                          <th className="py-2 px-4">Date</th>
                          <th className="py-2 px-4">Method</th>
                          <th className="py-2 px-4">Collected By</th>
                          <th className="py-2 px-4 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {selectedOrderForDetails.paymentHistory.map((ph, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/40">
                            <td className="py-2.5 px-4 font-mono text-slate-400">
                              {new Date(ph.date).toLocaleDateString('en-GB')}
                            </td>
                            <td className="py-2.5 px-4 font-semibold text-slate-600">{ph.method}</td>
                            <td className="py-2.5 px-4 text-slate-500">{ph.recordedBy}</td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">৳{ph.amount.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50/50">
                          <td colSpan={4} className="py-3 px-4 text-right">
                            {selectedOrderForDetails.amountDue === 0 ? (
                              <div className="flex items-center justify-end gap-1.5 text-emerald-600">
                                <CheckCircle size={14} />
                                <span className="font-bold text-sm">Fully Settled</span>
                              </div>
                            ) : (
                              <span className="font-bold text-sm text-red-600 font-mono">
                                Remaining Due: ৳{selectedOrderForDetails.amountDue.toLocaleString()}
                              </span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedOrderForDetails(null)}
                className="py-2 px-5 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] text-sm font-bold rounded-xl cursor-pointer shadow-xs"
              >
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
