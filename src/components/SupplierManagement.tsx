import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Search, 
  Plus, 
  Phone, 
  MapPin, 
  DollarSign, 
  Calendar, 
  FileText, 
  CreditCard, 
  ChevronRight, 
  X, 
  Edit3, 
  Trash2, 
  AlertCircle,
  CheckCircle2,
  Building2,
  Filter
} from 'lucide-react';
import { Supplier, SupplierPayment, StockLog, UserProfile } from '../types';
import { 
  getSuppliers, 
  subscribeToSuppliers,
  addSupplier, 
  updateSupplier, 
  deleteSupplier, 
  getSupplierPayments, 
  addSupplierPayment, 
  getStockLogs 
} from '../firebase/db';

interface SupplierManagementProps {
  user: UserProfile | null;
  rolePermissions: any;
}

export default function SupplierManagement({ user, rolePermissions }: SupplierManagementProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState('');

  // Selected supplier detail view
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [supplierStockLogs, setSupplierStockLogs] = useState<StockLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailTab, setDetailTab] = useState<'purchases' | 'payments'>('purchases');

  // Modals / Drawers
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Supplier Form State
  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    supplierType: 'Distributor' as string,
    productCategory: 'Mobile Accessories' as string,
    paymentMethod: 'Cash' as string,
    openingBalance: '0',
    creditLimit: '',
    creditDays: '30',
    status: 'active' as 'active' | 'inactive',
    notes: '',
    logoUrl: '',
    subBrand: '' as 'SAT' | 'GZ' | 'RTX' | 'ALL' | '',
    showBankInfo: false,
    bankName: '',
    accountNumber: '',
    accountName: '',
    branch: ''
  });

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash' as string,
    referenceNo: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'superadmin';
  const hasManagePermission = isSuperAdmin || (rolePermissions && (rolePermissions.canManageSuppliers || rolePermissions.all));

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToSuppliers((list) => {
      setSuppliers(list || []);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const list = await getSuppliers();
      setSuppliers(list || []);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setLoadingDetail(true);
    try {
      const [payments, logs] = await Promise.all([
        getSupplierPayments(supplier.id),
        getStockLogs()
      ]);
      setSupplierPayments(payments || []);
      const filteredLogs = (logs || []).filter(l => 
        l.supplierName?.toLowerCase() === supplier.name.toLowerCase() ||
        l.reason?.toLowerCase().includes('supplier') ||
        l.reason?.toLowerCase().includes(supplier.name.toLowerCase())
      );
      setSupplierStockLogs(filteredLogs);
    } catch (err) {
      console.error('Failed to load supplier details:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setFormData({
      name: '',
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      supplierType: 'Distributor',
      productCategory: 'Mobile Accessories',
      paymentMethod: 'Cash',
      openingBalance: '0',
      creditLimit: '',
      creditDays: '30',
      status: 'active',
      notes: '',
      logoUrl: '',
      subBrand: '',
      showBankInfo: false,
      bankName: '',
      accountNumber: '',
      accountName: '',
      branch: ''
    });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      companyName: supplier.companyName || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone,
      email: supplier.email || '',
      address: supplier.address || '',
      supplierType: supplier.supplierType || 'Distributor',
      productCategory: typeof supplier.productCategory === 'string' ? supplier.productCategory : 'Mobile Accessories',
      paymentMethod: supplier.paymentMethod || 'Cash',
      openingBalance: supplier.openingBalance !== undefined ? String(supplier.openingBalance) : '0',
      creditLimit: supplier.creditLimit !== undefined && supplier.creditLimit !== 0 ? String(supplier.creditLimit) : '',
      creditDays: supplier.creditDays !== undefined ? String(supplier.creditDays) : '30',
      status: supplier.status || 'active',
      notes: supplier.notes || '',
      logoUrl: supplier.logoUrl || '',
      subBrand: supplier.subBrand || '',
      showBankInfo: !!supplier.bankInfo?.bankName || !!supplier.bankInfo?.accountNumber,
      bankName: supplier.bankInfo?.bankName || '',
      accountNumber: supplier.bankInfo?.accountNumber || '',
      accountName: supplier.bankInfo?.accountName || '',
      branch: supplier.bankInfo?.branch || ''
    });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleDeleteSupplier = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete supplier "${name}"?`)) return;
    try {
      await deleteSupplier(id);
      if (selectedSupplier?.id === id) setSelectedSupplier(null);
      fetchSuppliers();
    } catch (err: any) {
      alert(`Failed to delete supplier: ${err.message || 'Error occurred'}`);
    }
  };

  const handleSubmitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      setFormError('Supplier Name and Mobile Number are required.');
      return;
    }

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length < 11 || !cleanPhone.startsWith('01')) {
      setFormError('Please enter a valid 11-digit Bangladesh mobile number (e.g. 01XXXXXXXXX).');
      return;
    }

    const openingBal = parseFloat(formData.openingBalance) || 0;
    const creditLim = formData.creditLimit ? parseFloat(formData.creditLimit) : 0;
    const credDays = formData.creditDays ? parseInt(formData.creditDays, 10) : 30;

    const bankInfoObj = (formData.bankName || formData.accountNumber || formData.accountName || formData.branch) ? {
      bankName: formData.bankName.trim(),
      accountNumber: formData.accountNumber.trim(),
      accountName: formData.accountName.trim(),
      branch: formData.branch.trim()
    } : undefined;

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: formData.name.trim(),
          companyName: formData.companyName.trim(),
          contactPerson: formData.contactPerson.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          supplierType: formData.supplierType,
          productCategory: formData.productCategory,
          paymentMethod: formData.paymentMethod,
          openingBalance: openingBal,
          creditLimit: creditLim,
          creditDays: credDays,
          bankInfo: bankInfoObj,
          status: formData.status,
          notes: formData.notes.trim(),
          logoUrl: formData.logoUrl.trim(),
          subBrand: formData.subBrand
        });
      } else {
        await addSupplier({
          name: formData.name.trim(),
          companyName: formData.companyName.trim(),
          contactPerson: formData.contactPerson.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          supplierType: formData.supplierType,
          productCategory: formData.productCategory,
          paymentMethod: formData.paymentMethod,
          openingBalance: openingBal,
          creditLimit: creditLim,
          creditDays: credDays,
          bankInfo: bankInfoObj,
          status: formData.status,
          notes: formData.notes.trim(),
          logoUrl: formData.logoUrl.trim(),
          subBrand: formData.subBrand
        });
      }
      setIsAddModalOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save supplier.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPaymentModal = () => {
    setPaymentData({
      amount: '',
      paymentMethod: 'Cash',
      referenceNo: '',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    });
    setFormError(null);
    setIsPaymentModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const pAmt = parseFloat(paymentData.amount);
    if (isNaN(pAmt) || pAmt <= 0) {
      setFormError('Please specify a valid payment amount.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await addSupplierPayment({
        supplierId: selectedSupplier.id,
        amount: pAmt,
        paymentMethod: paymentData.paymentMethod,
        referenceNo: paymentData.referenceNo.trim(),
        notes: paymentData.notes.trim(),
        date: paymentData.date,
        recordedBy: user?.name || user?.email || 'Operator'
      });

      setIsPaymentModalOpen(false);
      handleOpenDetail(selectedSupplier);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record supplier payment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered suppliers
  const filteredSuppliers = suppliers.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    const matchQ = !q || 
      s.name.toLowerCase().includes(q) || 
      (s.companyName || '').toLowerCase().includes(q) ||
      s.phone.includes(q) ||
      (s.address || '').toLowerCase().includes(q);

    const matchSubBrand = !subBrandFilter || s.subBrand === subBrandFilter || s.subBrand === 'ALL';
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;

    return matchQ && matchSubBrand && matchStatus;
  });

  const totalPurchasesSum = suppliers.reduce((s, sup) => s + (sup.totalPurchases || 0), 0);
  const totalOutstandingDueSum = suppliers.reduce((s, sup) => s + (sup.outstandingDue || 0), 0);

  return (
    <div className="space-y-6 w-full max-w-[1920px] mx-auto pb-10">
      
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Truck size={22} className="text-gold-500" />
            Supplier Directory & Vendor Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage wholesale product suppliers, track purchase stock-ins, and settle vendor balances.
          </p>
        </div>

        {hasManagePermission && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-gold-400 hover:bg-gold-500 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            Add New Supplier
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Registered Vendors</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
            {suppliers.length}
          </div>
        </div>

        {isSuperAdmin ? (
          <>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Volume Purchased</span>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
                ৳ {totalPurchasesSum.toLocaleString('en-BD')}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Total Vendor Dues Owed</span>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono tabular-nums">
                ৳ {totalOutstandingDueSum.toLocaleString('en-BD')}
              </div>
            </div>
          </>
        ) : (
          <div className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm text-xs text-slate-500 dark:text-slate-400 italic flex items-center">
            Financial ledger summaries are restricted to Super Admin role only.
          </div>
        )}
      </div>

      {/* Table & Filter Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm min-h-[500px]">
        
        {/* Search & Filter Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Search by vendor name, company, phone..."
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
              <option value="SAT">SAT (Sky Auto)</option>
              <option value="GZ">GZ (GadgetZu)</option>
              <option value="RTX">RTX (RTX Gadget)</option>
            </select>
          </div>
        </div>

        {/* Wide Desktop Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Vendor Name</th>
                <th className="pb-3">Company / Contact</th>
                <th className="pb-3">Mobile Number</th>
                <th className="pb-3">Sub-Brand</th>
                {isSuperAdmin && <th className="pb-3 text-right">Total Purchases</th>}
                {isSuperAdmin && <th className="pb-3 text-right">Balance Due</th>}
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">Loading supplier records...</td>
                </tr>
              ) : filteredSuppliers.length > 0 ? (
                filteredSuppliers.map(supplier => (
                  <tr 
                    key={supplier.id}
                    onClick={() => handleOpenDetail(supplier)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 pl-2 font-bold text-slate-900 dark:text-white">
                      {supplier.name}
                    </td>
                    <td className="py-3 text-slate-700 dark:text-slate-300">
                      {supplier.companyName || supplier.contactPerson || 'N/A'}
                    </td>
                    <td className="py-3 font-mono text-slate-600 dark:text-slate-400">
                      {supplier.phone}
                    </td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 font-bold rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {supplier.subBrand || 'ALL'}
                      </span>
                    </td>
                    {isSuperAdmin && (
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                        ৳ {(supplier.totalPurchases || 0).toLocaleString('en-BD')}
                      </td>
                    )}
                    {isSuperAdmin && (
                      <td className={`py-3 text-right font-black font-mono tabular-nums ${(supplier.outstandingDue || 0) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        ৳ {(supplier.outstandingDue || 0).toLocaleString('en-BD')}
                      </td>
                    )}
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleOpenEditModal(supplier, e)}
                          className="p-1 text-slate-400 hover:text-gold-500 cursor-pointer"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={(e) => handleDeleteSupplier(supplier.id, supplier.name, e)}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 italic">No suppliers found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Supplier Detail Slide-Over Drawer */}
      {selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-full max-w-xl h-full p-6 overflow-y-auto shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{selectedSupplier.name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedSupplier.phone} | {selectedSupplier.subBrand || 'ALL'}</p>
                </div>
                <button onClick={() => setSelectedSupplier(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={18} />
                </button>
              </div>

              {/* Financial Balance Summary */}
              {isSuperAdmin && (
                <div className="mt-4 grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700 text-center text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Purchased</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">৳{(selectedSupplier.totalPurchases || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Paid</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">৳{(selectedSupplier.totalPaid || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Balance Due</span>
                    <span className="font-black text-rose-600 dark:text-rose-400 font-mono">৳{(selectedSupplier.outstandingDue || 0).toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {isSuperAdmin && hasManagePermission && (
                <button
                  onClick={handleOpenPaymentModal}
                  className="w-full mt-4 py-2 bg-gold-400 hover:bg-gold-500 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  + Record Supplier Payment
                </button>
              )}

              {/* Detail Tabs */}
              <div className="mt-6 flex border-b border-slate-200 dark:border-slate-800 gap-4 text-xs">
                <button
                  onClick={() => setDetailTab('purchases')}
                  className={`pb-2 font-bold border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'purchases' ? 'border-gold-500 text-gold-600 dark:text-gold-400' : 'border-transparent text-slate-500'
                  }`}
                >
                  Stock In History ({supplierStockLogs.length})
                </button>
                <button
                  onClick={() => setDetailTab('payments')}
                  className={`pb-2 font-bold border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'payments' ? 'border-gold-500 text-gold-600 dark:text-gold-400' : 'border-transparent text-slate-500'
                  }`}
                >
                  Payments ({supplierPayments.length})
                </button>
              </div>

              {/* Tab Data */}
              <div className="mt-4 space-y-2 text-xs">
                {detailTab === 'purchases' ? (
                  supplierStockLogs.map(log => (
                    <div key={log.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800 flex justify-between">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{log.productName}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{new Date(log.timestamp).toLocaleDateString()} | Qty: +{log.qty}</div>
                      </div>
                      {log.purchasePrice && (
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          ৳{(log.purchasePrice * log.qty).toLocaleString()}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  supplierPayments.map(pmt => (
                    <div key={pmt.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800 flex justify-between">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">৳{pmt.amount.toLocaleString()} ({pmt.paymentMethod})</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{pmt.date} | By: {pmt.recordedBy}</div>
                      </div>
                      <span className="text-emerald-600 font-bold text-[10px]">Paid</span>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingSupplier ? 'Edit Supplier Record' : 'Register New Vendor / Supplier'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Supplier / Vendor Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mobile Phone Number *</label>
                <input
                  type="text"
                  placeholder="01XXXXXXXXX"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Company / Store</label>
                  <input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Sub-Brand Access</label>
                  <select
                    value={formData.subBrand}
                    onChange={(e: any) => setFormData({ ...formData, subBrand: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                  >
                    <option value="">ALL Sub-Brands</option>
                    <option value="SAT">Sky Auto (SAT)</option>
                    <option value="GZ">GadgetZu (GZ)</option>
                    <option value="RTX">RTX Gadget (RTX)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                >
                  {submitting ? 'Saving...' : 'Save Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Record Vendor Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Amount (BDT) *</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Payment Method</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e: any) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank">Bank Transfer</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl font-bold bg-gold-400 hover:bg-gold-500 text-slate-950"
                >
                  {submitting ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
