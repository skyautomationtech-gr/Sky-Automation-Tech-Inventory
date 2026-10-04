import React, { useState, useEffect } from 'react';
import { 
  Search, 
  UserPlus, 
  ArrowUpDown, 
  User, 
  Phone, 
  MapPin, 
  Tag, 
  FileText, 
  TrendingUp, 
  ShoppingBag, 
  Calendar,
  X,
  Edit,
  Eye,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Package,
  Clock,
  Layers,
  Sparkles
} from 'lucide-react';
import { Customer, Order, UserProfile } from '../types';
import { getCustomers, addCustomer, updateCustomer, getOrders, subscribeToCustomers, subscribeToOrders } from '../firebase/db';

interface CustomerManagementProps {
  user: UserProfile | null;
  requireCheckIn?: () => boolean;
  initialCustomerId?: string | null;
  clearInitialCustomerId?: () => void;
}

export default function CustomerManagement({ 
  user, 
  requireCheckIn,
  initialCustomerId,
  clearInitialCustomerId
}: CustomerManagementProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search, filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubBrandFilter, setSelectedSubBrandFilter] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'totalOrders' | 'lifetimeValue'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal / Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formSubBrand, setFormSubBrand] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSuperAdmin = user?.role === 'superadmin';
  const hasManageOrders = isSuperAdmin || 
    (user?.permissionOverrides?.manageOrders === true) || 
    (user?.permissionOverrides?.manageOrders !== false && user?.role === 'admin');

  useEffect(() => {
    setLoading(true);
    const unsubCust = subscribeToCustomers((customersData) => {
      setCustomers(customersData || []);
      setLoading(false);
    });
    const unsubOrd = subscribeToOrders((ordersData) => {
      setOrders(ordersData || []);
    });
    return () => {
      unsubCust();
      unsubOrd();
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const customersData = await getCustomers();
      const ordersData = await getOrders();
      setCustomers(customersData || []);
      setOrders(ordersData || []);
    } catch (err: any) {
      console.error('CustomerManagement: Error fetching data:', err);
      setError('Could not retrieve customer logs. Please verify connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialCustomerId && customers.length > 0) {
      const c = customers.find(x => x.id === initialCustomerId);
      if (c) {
        setSelectedCustomer(c);
      }
      if (clearInitialCustomerId) {
        clearInitialCustomerId();
      }
    }
  }, [initialCustomerId, customers, clearInitialCustomerId]);

  // Bangladesh format validation
  const validateBdPhone = (phone: string) => {
    const regex = /^(?:\+88)?01[3-9]\d{8}$/;
    return regex.test(phone.trim());
  };

  const handleAddCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!hasManageOrders) {
      setError('You do not have permission to manage customers.');
      return;
    }

    setError('');
    setSuccess('');

    if (!formName.trim()) {
      setError('Full Name is required.');
      return;
    }

    if (!validateBdPhone(formPhone)) {
      setError('Invalid Bangladesh Phone Number. Format should be 01XXXXXXXXX or +8801XXXXXXXXX');
      return;
    }

    // Check duplicate phone number in local state
    const duplicate = customers.find(c => c.phone.trim() === formPhone.trim());
    if (duplicate) {
      setError(`A customer with phone number ${formPhone} already exists: ${duplicate.name}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: formName.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim() || undefined,
        subBrand: formSubBrand || undefined,
        notes: formNotes.trim() || undefined,
        totalOrders: 0,
        lifetimeValue: 0,
        createdAt: Date.now()
      };

      await addCustomer(payload);
      setSuccess(`Customer "${formName}" created successfully!`);
      setShowAddModal(false);
      resetForm();
      await fetchData();
    } catch (err: any) {
      console.error('CustomerManagement: Error saving customer:', err);
      setError('Failed to save customer. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedCustomer) return;
    if (!hasManageOrders) {
      setError('You do not have permission to edit customers.');
      return;
    }

    setError('');
    setSuccess('');

    if (!formName.trim()) {
      setError('Full Name is required.');
      return;
    }

    if (!validateBdPhone(formPhone)) {
      setError('Invalid Bangladesh Phone Number. Format should be 01XXXXXXXXX or +8801XXXXXXXXX');
      return;
    }

    // Check duplicate phone number (excluding self)
    const duplicate = customers.find(c => c.phone.trim() === formPhone.trim() && c.id !== selectedCustomer.id);
    if (duplicate) {
      setError(`Another customer with phone number ${formPhone} already exists: ${duplicate.name}`);
      return;
    }

    setSubmitting(true);
    try {
      const payload: Partial<Customer> = {
        name: formName.trim(),
        phone: formPhone.trim(),
        address: formAddress.trim() || '',
        subBrand: formSubBrand || '',
        notes: formNotes.trim() || ''
      };

      await updateCustomer(selectedCustomer.id, payload);
      setSuccess(`Customer profile for "${formName}" updated successfully!`);
      setShowEditForm(false);
      
      // Update local state for detail view
      setSelectedCustomer({
        ...selectedCustomer,
        ...payload
      });
      
      await fetchData();
    } catch (err: any) {
      console.error('CustomerManagement: Error updating customer:', err);
      setError('Failed to update customer profile.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (customer: Customer) => {
    setFormName(customer.name);
    setFormPhone(customer.phone);
    setFormAddress(customer.address || '');
    setFormSubBrand(customer.subBrand || '');
    setFormNotes(customer.notes || '');
    setShowEditForm(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormAddress('');
    setFormSubBrand('');
    setFormNotes('');
  };

  // Filter customers by search query and sub-brand access
  const filteredCustomers = customers.filter(customer => {
    // 1. Sub-brand access restriction filter
    if (!isSuperAdmin && user?.subBrandAccess) {
      if (customer.subBrand && !user.subBrandAccess.includes(customer.subBrand)) {
        return false;
      }
    }

    // 2. Specific Brand filter in UI
    if (selectedSubBrandFilter && customer.subBrand !== selectedSubBrandFilter) {
      return false;
    }

    // 3. Search query
    const matchSearch = 
      (customer.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (customer.phone || '').includes(searchQuery) ||
      (customer.customerId ? customer.customerId.toLowerCase().includes(searchQuery.toLowerCase()) : false) ||
      (customer.address || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchSearch;
  });

  // Sorting
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    let valA: any = a[sortBy];
    let valB: any = b[sortBy];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Filter orders for the selected customer
  const customerOrders = selectedCustomer 
    ? orders.filter(o => o.customerId === selectedCustomer.id)
    : [];

  return (
    <div className="space-y-6 w-full">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">Active Client Ledger</span>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-950 font-sans uppercase tracking-tight">Customer Directory</h1>
            <span className="text-xs font-mono font-bold bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full border border-amber-200">
              {filteredCustomers.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Maintain full records of retail buyers, active sub-brand associations, purchase frequencies, and lifetime value.
          </p>
        </div>
        
        {hasManageOrders && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-sm uppercase tracking-wider py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer shrink-0"
          >
            <UserPlus size={16} />
            Add Customer
          </button>
        )}
      </div>

      {/* User Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center gap-2.5 animate-pulse">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm flex items-center gap-2.5 animate-pulse">
          <TrendingUp size={16} className="text-emerald-500 flex-shrink-0" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {/* Search and Filters Bar (Full Width) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between w-full">
        {/* Search Input */}
        <div className="relative w-full sm:flex-1">
          <Search className="absolute left-3.5 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Search customers by name, phone number, address, or customer ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
          />
        </div>
        {/* Sub-brand selector */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <select
            value={selectedSubBrandFilter}
            onChange={(e) => setSelectedSubBrandFilter(e.target.value)}
            className="w-full sm:w-52 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
          >
            <option value="">All Sub-brands</option>
            {(isSuperAdmin ? ['SAT', 'GZ', 'RTX'] : user?.subBrandAccess || []).map(brand => (
              <option key={brand} value={brand}>{brand === 'SAT' ? 'Sky Auto (SAT)' : brand === 'GZ' ? 'GadgetZu (GZ)' : 'RTX Gadget (RTX)'}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Customer Full Width Table Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden w-full">
        {loading ? (
          <div className="p-16 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-9 h-9 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-mono text-slate-400 uppercase tracking-widest">LOADING DIRECTORY...</span>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center">
            <User size={40} className="text-slate-300 mb-2" />
            <span className="text-sm font-mono uppercase tracking-wider font-bold">No Customers Found</span>
            <p className="text-sm text-slate-400 mt-1 max-w-md">
              No matching customer records exist. Click "Add Customer" to register a buyer manually or place an order to auto-create.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-xs font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-700 cursor-pointer">
                      Customer
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Phone Number</th>
                  <th className="py-3.5 px-4">Delivery Location</th>
                  <th className="py-3.5 px-4 text-center">Brand</th>
                  <th className="py-3.5 px-4 text-center">
                    <button onClick={() => toggleSort('totalOrders')} className="flex items-center gap-1 mx-auto hover:text-slate-700 cursor-pointer">
                      Orders
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-right">
                    <button onClick={() => toggleSort('lifetimeValue')} className="flex items-center gap-1 ml-auto hover:text-slate-700 cursor-pointer">
                      LTV (৳)
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-center">
                    <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 mx-auto hover:text-slate-700 cursor-pointer">
                      Joined
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sortedCustomers.map((customer) => (
                  <tr 
                    key={customer.id}
                    className="hover:bg-amber-50/20 transition-colors group cursor-pointer"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setShowEditForm(false);
                    }}
                  >
                    {/* Customer Name & ID */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 font-bold flex items-center justify-center font-mono shrink-0 shadow-xs">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 group-hover:text-amber-700 transition truncate">{customer.name}</div>
                          <div className="text-xs text-amber-700 font-bold font-mono">ID: {customer.customerId || customer.id.substring(0, 8).toUpperCase()}</div>
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 font-mono text-slate-800 font-semibold">
                        <Phone size={13} className="text-slate-400" />
                        <span>{customer.phone}</span>
                      </div>
                    </td>

                    {/* Delivery Location */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex items-start gap-1.5 text-slate-600">
                        <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <span className="truncate" title={customer.address || 'No Address Listed'}>
                          {customer.address || <span className="text-slate-300 italic">No Address Listed</span>}
                        </span>
                      </div>
                    </td>

                    {/* Sub-brand */}
                    <td className="py-3.5 px-4 text-center">
                      {customer.subBrand ? (
                        <span className={`inline-block text-[10px] font-mono font-black uppercase px-2.5 py-0.5 rounded-md ${
                          customer.subBrand === 'SAT' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          customer.subBrand === 'GZ' ? 'bg-teal-100 text-teal-800 border border-teal-200' :
                          'bg-orange-100 text-orange-800 border border-orange-200'
                        }`}>
                          {customer.subBrand}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-mono text-xs">All Brands</span>
                      )}
                    </td>

                    {/* Total Orders */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex items-center justify-center font-mono font-bold text-xs bg-slate-100 px-2.5 py-0.5 rounded-md text-slate-800">
                        {customer.totalOrders || 0}
                      </span>
                    </td>

                    {/* LTV */}
                    <td className="py-3.5 px-4 text-right font-mono font-black text-slate-950">
                      ৳{(customer.lifetimeValue || 0).toLocaleString()}
                    </td>

                    {/* Joined Date */}
                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-500">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setShowEditForm(false);
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                          title="View Profile & Orders"
                        >
                          <Eye size={14} />
                        </button>
                        {hasManageOrders && (
                          <button
                            onClick={() => {
                              setSelectedCustomer(customer);
                              startEdit(customer);
                            }}
                            className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 transition"
                            title="Edit Customer"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Detail & Order History Full Modal */}
      {selectedCustomer && (
        <div 
          className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setSelectedCustomer(null)}
        >
          <div 
            className="bg-white rounded-3xl border border-slate-100 max-w-2xl w-full shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-950 p-6 text-white flex justify-between items-start shrink-0 relative">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-xl shadow-lg shadow-amber-400/20">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-black font-sans tracking-tight text-white">{selectedCustomer.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-amber-400 font-mono tracking-wider font-bold uppercase">
                      {selectedCustomer.customerId || `ID: ${selectedCustomer.id.substring(0, 8).toUpperCase()}`}
                    </span>
                    {selectedCustomer.subBrand && (
                      <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                        {selectedCustomer.subBrand}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {hasManageOrders && !showEditForm && (
                  <button
                    onClick={() => startEdit(selectedCustomer)}
                    className="p-2 bg-slate-900 border border-slate-800 text-amber-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
                    title="Edit Customer Profile"
                  >
                    <Edit size={16} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-900 transition cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Key Metrics Strip */}
            <div className="grid grid-cols-2 bg-slate-900 px-6 py-3.5 border-t border-slate-800 text-white font-mono shrink-0">
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Lifetime Value (LTV)</span>
                <span className="text-base font-black text-amber-400">৳{(selectedCustomer.lifetimeValue || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold block">Orders Placed</span>
                <span className="text-base font-black text-slate-100">{selectedCustomer.totalOrders || 0} Units</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {showEditForm ? (
                <form onSubmit={handleEditCustomerSubmit} className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h4 className="text-sm font-black uppercase tracking-wider text-slate-800">Edit Customer Information</h4>
                    <span className="text-xs text-slate-400 font-mono">ID: {selectedCustomer.customerId || selectedCustomer.id}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number (Bangladesh Format) *</label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                    <textarea
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                      placeholder="Street address, city..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Sub-brand Association</label>
                    <select
                      value={formSubBrand}
                      onChange={(e) => setFormSubBrand(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-hidden"
                    >
                      <option value="">No specific brand (All Brands)</option>
                      <option value="SAT">Sky Auto (SAT)</option>
                      <option value="GZ">GadgetZu (GZ)</option>
                      <option value="RTX">RTX Gadget (RTX)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Private Client Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                      placeholder="Special delivery directives..."
                    />
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowEditForm(false)}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-900 text-amber-400 text-sm font-bold rounded-xl shadow-md cursor-pointer"
                    >
                      {submitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Detailed Information Card */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-2 flex items-center gap-2">
                      <User size={14} className="text-amber-500" />
                      Client Profile Details
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0">
                          <Phone size={16} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Phone Number</span>
                          <span className="font-mono font-bold text-slate-800">{selectedCustomer.phone}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0">
                          <Calendar size={16} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Joined Date</span>
                          <span className="font-mono font-medium text-slate-700">{new Date(selectedCustomer.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3 md:col-span-2">
                        <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl shrink-0 mt-0.5">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivery Address</span>
                          <span className="text-slate-700 font-medium">{selectedCustomer.address || <span className="text-slate-400 italic">No delivery address provided</span>}</span>
                        </div>
                      </div>

                      {selectedCustomer.notes && (
                        <div className="p-3 bg-amber-50/50 rounded-2xl border border-amber-200/40 flex items-start gap-3 md:col-span-2">
                          <div className="p-2 bg-amber-200/60 text-amber-800 rounded-xl shrink-0 mt-0.5">
                            <FileText size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-amber-800 block">Private Notes</span>
                            <p className="text-slate-700 text-sm mt-0.5">{selectedCustomer.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Order History Card */}
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                        <ShoppingBag size={14} className="text-amber-500" />
                        Order History
                      </h4>
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-mono text-xs font-bold">
                        {customerOrders.length} Orders
                      </span>
                    </div>

                    {customerOrders.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <ShoppingBag size={24} className="mx-auto text-slate-300 mb-1" />
                        <p className="text-xs text-slate-400 italic">No orders registered for this client yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {customerOrders.map(order => (
                          <div 
                            key={order.id} 
                            className="p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-100 flex items-center justify-between text-sm transition"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-slate-900 flex items-center gap-2">
                                <span>#{order.id.substring(0, 8).toUpperCase()}</span>
                                {order.subBrand && (
                                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                                    {order.subBrand}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">
                                {new Date(order.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-black text-slate-950 text-base">৳{order.totalAmount.toLocaleString()}</div>
                              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${
                                order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                order.status === 'Returned/Cancelled' ? 'bg-red-100 text-red-800 border border-red-200' :
                                order.status === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                'bg-indigo-100 text-indigo-800 border border-indigo-200'
                              }`}>
                                {order.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2 bg-slate-950 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full shadow-2xl overflow-hidden">
            <div className="bg-slate-950 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black font-sans uppercase tracking-tight text-sm">Add New Client Document</h3>
                <p className="text-xs text-amber-400 font-mono tracking-widest uppercase mt-0.5">CUSTOMER RECONCILIATION</p>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCustomerSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Shakib Al Hasan"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-hidden focus:ring-4 focus:ring-amber-400/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number * (Bangladesh Format)</label>
                <input
                  type="text"
                  placeholder="e.g. 01712345678"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-hidden focus:ring-4 focus:ring-amber-400/20 font-mono"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">Must be a valid Bangladeshi number starting with 01 or +8801.</p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                <textarea
                  placeholder="House #, Road #, Sector, Area, City"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  rows={2.5}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Sub-brand Association (Optional)</label>
                <select
                  value={formSubBrand}
                  onChange={(e) => setFormSubBrand(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden"
                >
                  <option value="">No specific brand (Visible to all)</option>
                  <option value="SAT">Sky Auto (SAT)</option>
                  <option value="GZ">GadgetZu (GZ)</option>
                  <option value="RTX">RTX Gadget (RTX)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Private Client Notes (Optional)</label>
                <textarea
                  placeholder="Any preferences, warnings or special delivery directives..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-slate-950 hover:bg-slate-900 text-amber-400 text-sm font-bold rounded-xl shadow-md cursor-pointer"
                >
                  {submitting ? 'Registering...' : 'Register Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
