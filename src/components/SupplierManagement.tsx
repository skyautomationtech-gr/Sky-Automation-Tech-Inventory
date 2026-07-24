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
  Building2
} from 'lucide-react';
import { Supplier, SupplierPayment, StockLog, UserProfile } from '../types';
import { 
  getSuppliers, 
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

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Supplier Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    notes: '',
    subBrand: '' as 'SAT' | 'GZ' | 'RTX' | 'ALL' | ''
  });

  // Payment Form State
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer',
    referenceNo: '',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSuperAdmin = user?.role === 'superadmin';
  const hasManagePermission = isSuperAdmin || 
    (user?.permissionOverrides?.manageCategories !== undefined 
      ? user.permissionOverrides.manageCategories 
      : rolePermissions?.[user?.role || 'staff']?.manageCategories);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const list = await getSuppliers();
      setSuppliers(list);
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
      setSupplierPayments(payments);
      // Filter stock logs for this supplier
      const filteredLogs = logs.filter(l => 
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
      phone: '',
      address: '',
      notes: '',
      subBrand: ''
    });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (supplier: Supplier, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address || '',
      notes: supplier.notes || '',
      subBrand: supplier.subBrand || ''
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
      setFormError('Supplier Name and Phone number are required.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          notes: formData.notes.trim(),
          subBrand: formData.subBrand
        });
      } else {
        await addSupplier({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          address: formData.address.trim(),
          notes: formData.notes.trim(),
          subBrand: formData.subBrand
        });
      }
      setIsAddModalOpen(false);
      fetchSuppliers();
      if (selectedSupplier && editingSupplier?.id === selectedSupplier.id) {
        setSelectedSupplier(prev => prev ? { ...prev, ...formData } : null);
      }
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
    const amountNum = parseFloat(paymentData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setFormError('Please enter a valid payment amount.');
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      await addSupplierPayment({
        supplierId: selectedSupplier.id,
        amount: amountNum,
        paymentMethod: paymentData.paymentMethod,
        referenceNo: paymentData.referenceNo.trim(),
        notes: paymentData.notes.trim(),
        date: paymentData.date,
        recordedBy: user?.name || 'Staff'
      });

      setIsPaymentModalOpen(false);
      // Refresh suppliers & selected supplier
      const updatedList = await getSuppliers();
      setSuppliers(updatedList);
      const updatedSelected = updatedList.find(s => s.id === selectedSupplier.id);
      if (updatedSelected) {
        setSelectedSupplier(updatedSelected);
        handleOpenDetail(updatedSelected);
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to record supplier payment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Suppliers
  const filteredSuppliers = suppliers.filter(s => {
    const queryLower = searchQuery.toLowerCase();
    const matchesSearch = s.name.toLowerCase().includes(queryLower) || 
                          s.phone.includes(queryLower) ||
                          (s.address && s.address.toLowerCase().includes(queryLower));
    const matchesSubBrand = !subBrandFilter || s.subBrand === subBrandFilter || s.subBrand === 'ALL';
    return matchesSearch && matchesSubBrand;
  });

  // Calculate Aggregates
  const totalPurchasesSum = suppliers.reduce((sum, s) => sum + (s.totalPurchases || 0), 0);
  const totalPaidSum = suppliers.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  const totalOutstandingDueSum = suppliers.reduce((sum, s) => sum + (s.outstandingDue || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600">
              <Truck size={24} />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Supplier Directory</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">Manage vendor contacts, track stock purchases, and record supplier payments.</p>
        </div>

        {hasManagePermission && (
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl transition-all cursor-pointer shadow-xs self-start md:self-auto"
          >
            <Plus size={18} />
            <span>Add New Supplier</span>
          </button>
        )}
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold shrink-0">
            <Building2 size={24} />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Suppliers</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{suppliers.length}</div>
          </div>
        </div>

        {isSuperAdmin ? (
          <>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold shrink-0">
                <DollarSign size={24} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Purchases</div>
                <div className="text-2xl font-black text-blue-900 mt-0.5">৳{totalPurchasesSum.toLocaleString('en-BD')}</div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 font-bold shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Outstanding Owed</div>
                <div className="text-2xl font-black text-rose-600 mt-0.5">৳{totalOutstandingDueSum.toLocaleString('en-BD')}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="col-span-2 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4 text-xs text-slate-500 font-medium">
            <AlertCircle size={20} className="text-amber-500 shrink-0" />
            <span>Supplier financial summaries and aggregates are restricted to Super Admin only.</span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search suppliers by name, phone, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <select
          value={subBrandFilter}
          onChange={(e) => setSubBrandFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
        >
          <option value="">All Sub-Brands</option>
          <option value="SAT">SAT (Sky Auto)</option>
          <option value="GZ">GZ (GadgetZu)</option>
          <option value="RTX">RTX (RTX Gadget)</option>
        </select>
      </div>

      {/* Supplier List */}
      {loading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center">
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm font-medium text-slate-500">Loading supplier directory...</p>
        </div>
      ) : filteredSuppliers.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200/80 text-center">
          <Truck size={40} className="mx-auto text-slate-300 mb-3" />
          <h3 className="text-base font-bold text-slate-800">No suppliers found</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || subBrandFilter ? 'Try adjusting your search criteria or filter.' : 'Click "Add New Supplier" above to create your first vendor record.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              onClick={() => handleOpenDetail(supplier)}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 hover:border-amber-400/80 transition-all cursor-pointer shadow-xs hover:shadow-md group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                      {supplier.name}
                    </h3>
                    {supplier.subBrand && (
                      <span className="inline-block mt-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {supplier.subBrand === 'ALL' ? 'All Sub-Brands' : supplier.subBrand}
                      </span>
                    )}
                  </div>
                  {hasManagePermission && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleOpenEditModal(supplier, e)}
                        title="Edit Supplier"
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteSupplier(supplier.id, supplier.name, e)}
                        title="Delete Supplier"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-slate-400" />
                    <span className="font-mono">{supplier.phone}</span>
                  </div>
                  {supplier.address && (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <span className="truncate">{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {isSuperAdmin ? (
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Purchases</div>
                    <div className="font-bold text-slate-800">৳{(supplier.totalPurchases || 0).toLocaleString('en-BD')}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Balance Due</div>
                    <div className={`font-bold ${(supplier.outstandingDue || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      ৳{(supplier.outstandingDue || 0).toLocaleString('en-BD')}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 italic">
                  Financial figures (Super Admin only)
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Supplier Detail Drawer / Modal */}
      {selectedSupplier && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-end backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <Truck size={20} className="text-amber-400" />
                  <h2 className="text-xl font-black">{selectedSupplier.name}</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  Phone: {selectedSupplier.phone} {selectedSupplier.subBrand ? `| ${selectedSupplier.subBrand}` : ''}
                </p>
              </div>

              <button
                onClick={() => setSelectedSupplier(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Financial Balance Overview */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Running Balance & Due Status</h3>
                  {isSuperAdmin && hasManagePermission && (
                    <button
                      onClick={handleOpenPaymentModal}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl cursor-pointer shadow-xs transition-colors"
                    >
                      <CreditCard size={14} />
                      <span>Record Payment</span>
                    </button>
                  )}
                </div>

                {isSuperAdmin ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Purchased</div>
                      <div className="text-base font-black text-slate-900 mt-0.5">৳{(selectedSupplier.totalPurchases || 0).toLocaleString('en-BD')}</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Total Paid</div>
                      <div className="text-base font-black text-emerald-600 mt-0.5">৳{(selectedSupplier.totalPaid || 0).toLocaleString('en-BD')}</div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 text-center">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Outstanding Due</div>
                      <div className={`text-base font-black mt-0.5 ${(selectedSupplier.outstandingDue || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ৳{(selectedSupplier.outstandingDue || 0).toLocaleString('en-BD')}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                    Running balances, payment records, and financial amounts are restricted to Super Admin only.
                  </div>
                )}

                {selectedSupplier.notes && (
                  <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-700">Vendor Notes:</span> {selectedSupplier.notes}
                  </div>
                )}
              </div>

              {/* Detail Tabs */}
              <div className="border-b border-slate-200 flex gap-4">
                <button
                  onClick={() => setDetailTab('purchases')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'purchases' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Purchase & Stock In History ({supplierStockLogs.length})
                </button>
                <button
                  onClick={() => setDetailTab('payments')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                    detailTab === 'payments' ? 'border-amber-500 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Payment Records ({supplierPayments.length})
                </button>
              </div>

              {/* Tab Contents */}
              {loadingDetail ? (
                <div className="text-center py-8">
                  <div className="w-6 h-6 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-xs text-slate-500">Loading records...</p>
                </div>
              ) : detailTab === 'purchases' ? (
                supplierStockLogs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No stock-in or purchase logs found for this supplier yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {supplierStockLogs.map((log) => (
                      <div key={log.id} className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-bold text-slate-900">{log.productName}</div>
                          <div className="text-slate-500 mt-0.5 font-mono">
                            {new Date(log.timestamp).toLocaleDateString()} | Qty: +{log.qty} | Reason: {log.reason}
                          </div>
                        </div>
                        {log.purchasePrice && (
                          <div className="text-right font-bold text-slate-900">
                            ৳{(log.purchasePrice * log.qty).toLocaleString('en-BD')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                supplierPayments.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No payment logs recorded for this supplier yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {supplierPayments.map((pmt) => (
                      <div key={pmt.id} className="bg-white p-3.5 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-bold text-slate-900">
                            ৳{pmt.amount.toLocaleString('en-BD')} via <span className="text-amber-600">{pmt.paymentMethod}</span>
                          </div>
                          <div className="text-slate-500 mt-0.5 font-mono">
                            Date: {pmt.date} {pmt.referenceNo ? `| Ref: ${pmt.referenceNo}` : ''} | By: {pmt.recordedBy}
                          </div>
                          {pmt.notes && <div className="text-slate-600 italic mt-1">{pmt.notes}</div>}
                        </div>
                        <div className="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded border border-emerald-200 text-[11px]">
                          Paid
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-black text-slate-900">
                {editingSupplier ? 'Edit Supplier Details' : 'Add New Vendor / Supplier'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitSupplier} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Supplier / Company Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Baseus Official BD / Anker Global Distribution"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 01700000000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Address / Warehouse Location</label>
                <input
                  type="text"
                  placeholder="e.g. Shop 12, Level 4, Multiplan Center, Dhaka"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Sub-Brand Association (Optional)</label>
                <select
                  value={formData.subBrand}
                  onChange={(e) => setFormData({ ...formData, subBrand: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="">All Sub-Brands / General</option>
                  <option value="SAT">SAT (Sky Auto)</option>
                  <option value="GZ">GZ (GadgetZu)</option>
                  <option value="RTX">RTX (RTX Gadget)</option>
                  <option value="ALL">ALL (Shared Supplier)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vendor Notes / Payment Terms</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Credit period 15 days, 10% advance required..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingSupplier ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment to Supplier Modal */}
      {isPaymentModalOpen && selectedSupplier && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">Record Payment to Supplier</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedSupplier.name}</p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Amount (৳) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="e.g. 5000"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono font-bold text-base"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value="Cash">Cash</option>
                  <option value="bKash">bKash</option>
                  <option value="Nagad">Nagad</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Date</label>
                <input
                  type="date"
                  value={paymentData.date}
                  onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reference / Cheque / Txn No.</label>
                <input
                  type="text"
                  placeholder="e.g. TRX-98124 / Cheque #00123"
                  value={paymentData.referenceNo}
                  onChange={(e) => setPaymentData({ ...paymentData, referenceNo: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Partial payment for Invoice #882"
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer disabled:opacity-50"
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
