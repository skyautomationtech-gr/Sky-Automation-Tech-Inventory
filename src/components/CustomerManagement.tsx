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
  ChevronRight,
  Eye,
  AlertCircle
} from 'lucide-react';
import { Customer, Order, UserProfile } from '../types';
import { getCustomers, addCustomer, updateCustomer, getOrders } from '../firebase/db';

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
    fetchData();
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
      customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.phone.includes(searchQuery) ||
      (customer.customerId && customer.customerId.toLowerCase().includes(searchQuery.toLowerCase()));
    
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
    <div className="space-y-6">
      {/* Title section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-sm font-mono font-bold text-amber-500 uppercase tracking-widest">Active Client Ledger</span>
          <h1 className="text-2xl font-black text-slate-950 font-sans uppercase tracking-tight">Customer Directory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Maintain full records of retail buyers, active sub-brand associations, and purchase frequencies.
          </p>
        </div>
        
        {hasManageOrders && (
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-sm uppercase tracking-wider py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer"
          >
            <UserPlus size={14} />
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

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 columns: List & Search */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row gap-3 items-center">
            {/* Search Input */}
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3.5 top-2.5 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search customers by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
              />
            </div>
            {/* Sub-brand selector */}
            <select
              value={selectedSubBrandFilter}
              onChange={(e) => setSelectedSubBrandFilter(e.target.value)}
              className="w-full sm:w-48 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
            >
              <option value="">All Sub-brands</option>
              {(isSuperAdmin ? ['SAT', 'GZ', 'RTX'] : user?.subBrandAccess || []).map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Customer Table List */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-mono text-slate-400 uppercase tracking-widest">LOADING DIRECTORY...</span>
              </div>
            ) : sortedCustomers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <User size={36} className="text-slate-300 mb-2" />
                <span className="text-sm font-mono uppercase tracking-wider font-bold">No Customers Found</span>
                <p className="text-sm text-slate-400 mt-1 max-w-md">
                  No matching customer documents exist. Click "Add Customer" to register a buyer manually or place an order to auto-create.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-sm font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">
                        <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-700">
                          Customer
                          <ArrowUpDown size={10} />
                        </button>
                      </th>
                      <th className="py-3 px-4">Phone & Location</th>
                      <th className="py-3 px-4 text-center">Brand</th>
                      <th className="py-3 px-4 text-center">
                        <button onClick={() => toggleSort('totalOrders')} className="flex items-center gap-1 mx-auto hover:text-slate-700">
                          Orders
                          <ArrowUpDown size={10} />
                        </button>
                      </th>
                      <th className="py-3 px-4 text-right">
                        <button onClick={() => toggleSort('lifetimeValue')} className="flex items-center gap-1 ml-auto hover:text-slate-700">
                          LTV (৳)
                          <ArrowUpDown size={10} />
                        </button>
                      </th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {sortedCustomers.map((customer) => (
                      <tr 
                        key={customer.id}
                        className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedCustomer?.id === customer.id ? 'bg-amber-50/20 font-semibold' : ''}`}
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowEditForm(false);
                        }}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 text-amber-400 font-bold flex items-center justify-center font-mono">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{customer.name}</div>
                              <div className="text-sm text-amber-700 font-bold font-mono">ID: {customer.customerId || customer.id.substring(0, 8).toUpperCase()}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5 text-sm">
                            <span className="font-mono text-slate-700 font-medium">{customer.phone}</span>
                            <span className="text-slate-400 truncate max-w-[150px]">{customer.address || 'No Address Listed'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {customer.subBrand ? (
                            <span className={`inline-block text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-md ${
                              customer.subBrand === 'SAT' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              customer.subBrand === 'GZ' ? 'bg-teal-100 text-teal-800 border border-teal-200' :
                              'bg-orange-100 text-orange-800 border border-orange-200'
                            }`}>
                              {customer.subBrand}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-mono text-sm">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                          {customer.totalOrders || 0}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-950">
                          ৳{(customer.lifetimeValue || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <ChevronRight size={16} className="text-slate-300 ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 column: Detail View */}
        <div className="lg:col-span-1">
          {selectedCustomer ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden space-y-6">
              {/* Header card */}
              <div className="bg-slate-950 p-6 text-white space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#D4AF37] text-slate-950 font-black flex items-center justify-center text-lg shadow-lg shadow-amber-400/10">
                      {selectedCustomer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-black font-sans text-sm tracking-tight">{selectedCustomer.name}</h3>
                      <p className="text-sm text-amber-400 font-mono tracking-wider font-bold uppercase">{selectedCustomer.customerId || `ID: ${selectedCustomer.id.substring(0, 8).toUpperCase()}`}</p>
                    </div>
                  </div>
                  {hasManageOrders && (
                    <button
                      onClick={() => startEdit(selectedCustomer)}
                      className="p-1.5 bg-slate-900 border border-slate-800 text-amber-400 hover:text-white rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
                      title="Edit Customer Profile"
                    >
                      <Edit size={14} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 font-mono">
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Lifetime Value</span>
                    <span className="text-sm font-black text-amber-400">৳{(selectedCustomer.lifetimeValue || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Orders Placed</span>
                    <span className="text-sm font-black text-slate-100">{selectedCustomer.totalOrders || 0} Units</span>
                  </div>
                </div>
              </div>

              {/* Edit form inline or details list */}
              {showEditForm ? (
                <form onSubmit={handleEditCustomerSubmit} className="p-6 space-y-4 pt-0">
                  <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">Edit Customer Info</h4>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number (Bangladesh)</label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                    <textarea
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Sub-brand Association</label>
                    <select
                      value={formSubBrand}
                      onChange={(e) => setFormSubBrand(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-hidden"
                    >
                      <option value="">No specific brand</option>
                      <option value="SAT">Sky Auto (SAT)</option>
                      <option value="GZ">GadgetZu (GZ)</option>
                      <option value="RTX">RTX Gadget (RTX)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Private Client Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                      placeholder="Special delivery directives..."
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEditForm(false)}
                      className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2 bg-slate-950 hover:bg-slate-900 text-amber-400 text-sm font-bold rounded-xl shadow-md cursor-pointer"
                    >
                      {submitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-6 space-y-6 pt-0">
                  {/* Detailed Information */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                      <User size={12} className="text-amber-500" />
                      Client Profile details
                    </h4>
                    
                    <div className="space-y-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="font-mono text-slate-700">{selectedCustomer.phone}</span>
                      </div>
                      
                      <div className="flex items-start gap-2">
                        <MapPin size={12} className="text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-600 leading-normal">{selectedCustomer.address || <span className="text-slate-300 italic">No address provided</span>}</span>
                      </div>

                      {selectedCustomer.notes && (
                        <div className="flex items-start gap-2 bg-amber-50/40 p-2.5 border border-amber-200/20 rounded-xl">
                          <FileText size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-slate-600 leading-normal">{selectedCustomer.notes}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 font-mono text-sm text-slate-400">
                        <Calendar size={12} className="text-slate-300" />
                        <span>Joined: {new Date(selectedCustomer.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Order History */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 pb-1.5 flex justify-between items-center">
                      <span className="flex items-center gap-1.5">
                        <ShoppingBag size={12} className="text-amber-500" />
                        Order History
                      </span>
                      <span className="bg-slate-100 px-1.5 py-0.5 rounded-sm font-mono text-[9px] text-slate-500">
                        {customerOrders.length}
                      </span>
                    </h4>

                    {customerOrders.length === 0 ? (
                      <p className="text-sm text-slate-400 italic py-2 text-center">No orders registered for this client yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                        {customerOrders.map(order => (
                          <div 
                            key={order.id} 
                            className="p-2.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 flex items-center justify-between text-sm"
                          >
                            <div className="min-w-0">
                              <div className="font-mono font-bold text-slate-800 truncate">#{order.id.substring(0, 8).toUpperCase()}</div>
                              <div className="text-sm text-slate-400 font-mono mt-0.5">{new Date(order.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-black text-slate-900">৳{order.totalAmount.toLocaleString()}</div>
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded-sm mt-0.5 ${
                                order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                                order.status === 'Returned/Cancelled' ? 'bg-red-100 text-red-800' :
                                order.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                                'bg-indigo-100 text-indigo-800'
                              }`}>
                                {order.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center text-slate-400 flex flex-col items-center justify-center py-16">
              <Eye size={28} className="text-slate-300 mb-2" />
              <span className="text-sm font-mono uppercase font-bold">No Customer Selected</span>
              <p className="text-sm text-slate-400 mt-1 max-w-xs leading-normal">
                Select an entry from the customer directory to display detailed purchase charts, delivery directions, and historic item invoices.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-100 max-w-md w-full shadow-2xl animate-scale-up overflow-hidden">
            <div className="bg-slate-950 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black font-sans uppercase tracking-tight text-sm">Add New Client Document</h3>
                <p className="text-sm text-amber-400 font-mono tracking-widest uppercase mt-0.5">CUSTOMER RECONCILIATION</p>
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
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name *</label>
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
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number * (Bangladesh Format)</label>
                <input
                  type="text"
                  placeholder="e.g. 01712345678"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-hidden focus:ring-4 focus:ring-amber-400/20 font-mono"
                  required
                />
                <p className="text-[9px] text-slate-400 mt-1">Must be a valid Bangladeshi number starting with 01 or +8801.</p>
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery Address</label>
                <textarea
                  placeholder="House #, Road #, Sector, Area, City"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  rows={2.5}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Sub-brand Association (Optional)</label>
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
                <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Private Client Notes (Optional)</label>
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
