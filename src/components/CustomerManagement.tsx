import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  UserPlus, 
  ArrowUpDown, 
  User, 
  Phone, 
  MapPin, 
  FileText, 
  TrendingUp, 
  ShoppingBag, 
  Calendar,
  X,
  Edit,
  Eye,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Copy
} from 'lucide-react';
import { Customer, Order, UserProfile } from '../types';
import { 
  getCustomers, 
  addCustomer, 
  updateCustomer, 
  deleteCustomer, 
  getOrders, 
  subscribeToCustomers, 
  subscribeToOrders,
  localStore
} from '../firebase/db';

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
  // Initialize immediately from cache to prevent layout jumps
  const [customers, setCustomers] = useState<Customer[]>(() => localStore.get<Customer[]>('customers') || []);
  const [orders, setOrders] = useState<Order[]>(() => localStore.get<Order[]>('orders') || []);
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = localStore.get<Customer[]>('customers');
    return !(cached && cached.length > 0);
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Filters, Search & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubBrandFilter, setSelectedSubBrandFilter] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'name' | 'totalOrders' | 'lifetimeValue'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal / Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

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
      setSuccess(`Customer "${formName}" added successfully!`);
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

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    if (requireCheckIn && !requireCheckIn()) return;
    if (!hasManageOrders) {
      setError('You do not have permission to delete customers.');
      return;
    }

    try {
      await deleteCustomer(customerToDelete.id);
      setSuccess(`Customer "${customerToDelete.name}" deleted successfully.`);
      if (selectedCustomer?.id === customerToDelete.id) {
        setSelectedCustomer(null);
      }
      setCustomerToDelete(null);
      await fetchData();
    } catch (err: any) {
      setError('Failed to delete customer.');
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

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  // Filtering
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
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
      const query = searchQuery.toLowerCase().trim();
      if (!query) return true;
      const matchSearch = 
        (customer.name || '').toLowerCase().includes(query) ||
        (customer.phone || '').includes(query) ||
        (customer.customerId ? customer.customerId.toLowerCase().includes(query) : false) ||
        (customer.address || '').toLowerCase().includes(query);
      
      return matchSearch;
    });
  }, [customers, searchQuery, selectedSubBrandFilter, isSuperAdmin, user]);

  // Sorting
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
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
  }, [filteredCustomers, sortBy, sortOrder]);

  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Metrics
  const totalLTV = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.lifetimeValue || 0), 0);
  }, [customers]);

  const totalOrdersCount = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.totalOrders || 0), 0);
  }, [customers]);

  // Filter orders for the selected customer
  const customerOrders = selectedCustomer 
    ? orders.filter(o => o.customerId === selectedCustomer.id)
    : [];

  return (
    <div className="w-full max-w-full space-y-3.5 pb-12 overflow-x-hidden select-text touch-pan-y">
      {/* Top Header Section */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
              Customer Ledger
            </span>
            <span className="text-[10px] font-mono font-bold bg-slate-900 text-amber-400 px-2 py-0.5 rounded">
              Permanent Records
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">Customer Directory</h1>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
              {filteredCustomers.length} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            Maintain client profiles, contact history, sub-brand associations, and lifetime value records.
          </p>
        </div>
        
        {/* Quick Action Button */}
        <div className="flex items-center gap-2 shrink-0">
          {hasManageOrders && (
            <button
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs py-1.5 px-3 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <UserPlus size={13} />
              <span>Add Customer</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row (Standard Compact 3-Card Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Customers</span>
            <span className="text-base font-black text-slate-900 font-mono">{customers.length}</span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-mono text-xs">
            <User size={14} />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Orders</span>
            <span className="text-base font-black text-slate-900 font-mono">{totalOrdersCount}</span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-mono text-xs">
            <ShoppingBag size={14} />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Lifetime Value (LTV)</span>
            <span className="text-base font-black text-amber-600 font-mono">৳{totalLTV.toLocaleString()}</span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-mono text-xs">
            <TrendingUp size={14} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <span className="font-semibold flex-1">{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer"><X size={12} /></button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          <span className="font-semibold flex-1">{success}</span>
          <button onClick={() => setSuccess('')} className="ml-auto text-emerald-500 hover:text-emerald-700 cursor-pointer"><X size={12} /></button>
        </div>
      )}

      {/* Standardized Compact Search and Filter Bar */}
      <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-2 items-center justify-between bg-slate-50/50 w-full">
        {/* Search */}
        <div className="relative w-full sm:flex-1 min-w-0">
          <Search className="absolute left-2.5 top-2 text-slate-400" size={13} />
          <input
            type="text"
            placeholder="Search by customer name, phone, address, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg py-1 pl-7 pr-7 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Sub-brand selector */}
        <select
          value={selectedSubBrandFilter}
          onChange={(e) => setSelectedSubBrandFilter(e.target.value)}
          className="bg-white border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-700 focus:outline-hidden focus:border-amber-400 w-full sm:w-auto shrink-0 cursor-pointer"
        >
          <option value="">All Sub-brands</option>
          {(isSuperAdmin ? ['SAT', 'GZ', 'RTX'] : user?.subBrandAccess || []).map(brand => (
            <option key={brand} value={brand}>{brand === 'SAT' ? 'Sky Auto (SAT)' : brand === 'GZ' ? 'GadgetZu (GZ)' : 'RTX (RTX)'}</option>
          ))}
        </select>
      </div>

      {/* Main Customers Container */}
      <div className="w-full max-w-full">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center flex flex-col items-center justify-center space-y-2">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">LOADING DIRECTORY...</span>
          </div>
        ) : sortedCustomers.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/80 p-8 text-center text-slate-400 flex flex-col items-center justify-center">
            <User size={28} className="text-slate-300 mb-1" />
            <span className="text-xs font-mono uppercase tracking-wider font-bold text-slate-600">No Customers Found</span>
            <p className="text-[11px] text-slate-400 mt-0.5 max-w-sm">
              {searchQuery ? 'No customers match your search query.' : 'No customer records exist yet. Click "Add Customer" to create one.'}
            </p>
          </div>
        ) : (
          <>
            {/* 1. Mobile & Small Tablet Card Layout (100% full-width, zero horizontal wobble) */}
            <div className="block md:hidden space-y-2 w-full max-w-full">
              {sortedCustomers.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => {
                    setSelectedCustomer(customer);
                    setShowEditForm(false);
                  }}
                  className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors cursor-pointer space-y-2.5 w-full"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 text-amber-400 font-bold flex items-center justify-center font-mono text-xs shrink-0">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <div className="font-bold text-slate-900 text-xs truncate">{customer.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-amber-700 font-bold font-mono">
                            {customer.customerId || `CUS-${customer.id.substring(0, 6).toUpperCase()}`}
                          </span>
                          {customer.subBrand && (
                            <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded border ${
                              customer.subBrand === 'SAT' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                              customer.subBrand === 'GZ' ? 'bg-teal-50 text-teal-800 border-teal-200' :
                              'bg-orange-50 text-orange-800 border-orange-200'
                            }`}>
                              {customer.subBrand}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setShowEditForm(false);
                        }}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="View Profile"
                      >
                        <Eye size={14} />
                      </button>
                      {hasManageOrders && (
                        <button
                          onClick={() => {
                            setSelectedCustomer(customer);
                            startEdit(customer);
                          }}
                          className="p-1 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                      {hasManageOrders && (
                        <button
                          onClick={() => setCustomerToDelete(customer)}
                          className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Phone & Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    <div className="flex items-center justify-between bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                      <span className="font-mono font-semibold text-slate-800 text-[11px]">{customer.phone}</span>
                      <button
                        onClick={(e) => handleCopyPhone(customer.phone, e)}
                        className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
                        title="Copy phone"
                      >
                        {copiedPhone === customer.phone ? (
                          <CheckCircle2 size={12} className="text-emerald-500" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>

                    {customer.address && (
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-slate-600 truncate">
                        <MapPin size={11} className="text-slate-400 shrink-0" />
                        <span className="truncate text-[11px]">{customer.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats Strip */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
                    <div className="text-slate-500">
                      Orders: <strong className="text-slate-800 font-mono">{customer.totalOrders || 0}</strong>
                    </div>
                    <div className="text-slate-500">
                      LTV: <strong className="text-amber-600 font-mono">৳{(customer.lifetimeValue || 0).toLocaleString()}</strong>
                    </div>
                    <div className="text-slate-400 font-mono text-[10px]">
                      {new Date(customer.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 2. Desktop Table Layout (100% full-width fixed columns, strictly no horizontal scrolling) */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden w-full">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[26%]" />
                  <col className="w-[18%]" />
                  <col className="w-[20%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[85px]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-3.5">
                      <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-slate-900 cursor-pointer">
                        <span>Customer & ID</span>
                        <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2.5 px-3">Phone Number</th>
                    <th className="py-2.5 px-3">Location</th>
                    <th className="py-2.5 px-2 text-center">Brand</th>
                    <th className="py-2.5 px-2 text-center">
                      <button onClick={() => toggleSort('totalOrders')} className="flex items-center gap-1 mx-auto hover:text-slate-900 cursor-pointer">
                        <span>Orders</span>
                        <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">
                      <button onClick={() => toggleSort('lifetimeValue')} className="flex items-center gap-1 ml-auto hover:text-slate-900 cursor-pointer">
                        <span>LTV (৳)</span>
                        <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2.5 px-2 text-center">
                      <button onClick={() => toggleSort('createdAt')} className="flex items-center gap-1 mx-auto hover:text-slate-900 cursor-pointer">
                        <span>Registered</span>
                        <ArrowUpDown size={11} />
                      </button>
                    </th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {sortedCustomers.map((customer) => (
                    <tr 
                      key={customer.id}
                      className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setShowEditForm(false);
                      }}
                    >
                      {/* Customer Name & ID */}
                      <td className="py-2 px-3.5 overflow-hidden">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 text-amber-400 font-bold flex items-center justify-center font-mono text-xs shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1 truncate">
                            <div className="font-bold text-slate-900 truncate text-xs" title={customer.name}>{customer.name}</div>
                            <div className="text-[10px] text-amber-700 font-bold font-mono truncate">
                              {customer.customerId || `CUS-${customer.id.substring(0, 6).toUpperCase()}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-2 px-3 overflow-hidden">
                        <div className="flex items-center gap-1 font-mono text-slate-800 font-semibold text-xs truncate">
                          <span className="truncate">{customer.phone}</span>
                          <button
                            onClick={(e) => handleCopyPhone(customer.phone, e)}
                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                            title="Copy phone"
                          >
                            {copiedPhone === customer.phone ? (
                              <CheckCircle2 size={12} className="text-emerald-500" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="py-2 px-3 overflow-hidden">
                        <div className="flex items-center gap-1 text-slate-600 truncate">
                          <MapPin size={11} className="text-slate-400 shrink-0" />
                          <span className="truncate text-[11px]" title={customer.address || 'No Address'}>
                            {customer.address || <span className="text-slate-300 italic">No Address</span>}
                          </span>
                        </div>
                      </td>

                      {/* Sub-brand */}
                      <td className="py-2 px-2 text-center overflow-hidden">
                        {customer.subBrand ? (
                          <span className={`inline-block text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
                            customer.subBrand === 'SAT' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            customer.subBrand === 'GZ' ? 'bg-teal-50 text-teal-800 border-teal-200' :
                            'bg-orange-50 text-orange-800 border-orange-200'
                          }`}>
                            {customer.subBrand}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[10px]">All</span>
                        )}
                      </td>

                      {/* Total Orders */}
                      <td className="py-2 px-2 text-center overflow-hidden">
                        <span className="inline-flex items-center justify-center font-mono font-bold text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                          {customer.totalOrders || 0}
                        </span>
                      </td>

                      {/* LTV */}
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 text-xs truncate overflow-hidden">
                        ৳{(customer.lifetimeValue || 0).toLocaleString()}
                      </td>

                      {/* Registered Date */}
                      <td className="py-2 px-2 text-center font-mono text-slate-500 text-[11px] truncate overflow-hidden">
                        {new Date(customer.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-3 text-right shrink-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setSelectedCustomer(customer);
                              setShowEditForm(false);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="View Profile"
                          >
                            <Eye size={13} />
                          </button>
                          {hasManageOrders && (
                            <button
                              onClick={() => {
                                setSelectedCustomer(customer);
                                startEdit(customer);
                              }}
                              className="p-1 rounded text-amber-600 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                              title="Edit"
                            >
                              <Edit size={13} />
                            </button>
                          )}
                          {hasManageOrders && (
                            <button
                              onClick={() => setCustomerToDelete(customer)}
                              className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Customer Detail & Order History Modal */}
      {selectedCustomer && (
        <div 
          className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-3 backdrop-blur-xs"
          onClick={() => setSelectedCustomer(null)}
        >
          <div 
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 p-3.5 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-amber-400 text-slate-950 font-bold flex items-center justify-center text-sm shrink-0">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 truncate">
                  <h3 className="text-sm font-bold text-white leading-tight truncate">{selectedCustomer.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-amber-400 font-mono font-bold">
                      {selectedCustomer.customerId || `ID: ${selectedCustomer.id.substring(0, 8).toUpperCase()}`}
                    </span>
                    {selectedCustomer.subBrand && (
                      <span className="text-[9px] font-mono font-bold bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700">
                        {selectedCustomer.subBrand}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {hasManageOrders && !showEditForm && (
                  <button
                    onClick={() => startEdit(selectedCustomer)}
                    className="p-1 text-slate-300 hover:text-amber-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    title="Edit Customer"
                  >
                    <Edit size={13} />
                  </button>
                )}
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="grid grid-cols-2 bg-slate-950 px-4 py-2 border-t border-slate-800 text-white font-mono text-center text-xs shrink-0">
              <div>
                <span className="text-[9px] uppercase text-slate-400 block font-bold">Lifetime Value</span>
                <span className="font-bold text-amber-400">৳{(selectedCustomer.lifetimeValue || 0).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-[9px] uppercase text-slate-400 block font-bold">Orders Placed</span>
                <span className="font-bold text-slate-200">{selectedCustomer.totalOrders || 0} Orders</span>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
              {showEditForm ? (
                <form onSubmit={handleEditCustomerSubmit} className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[10px]">Edit Customer Information</h4>
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5 text-[10px]">Full Name *</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5 text-[10px]">Phone Number *</label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5 text-[10px]">Delivery Address</label>
                    <textarea
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5 text-[10px]">Sub-brand</label>
                    <select
                      value={formSubBrand}
                      onChange={(e) => setFormSubBrand(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-700 focus:outline-hidden"
                    >
                      <option value="">No specific brand (All)</option>
                      <option value="SAT">Sky Auto (SAT)</option>
                      <option value="GZ">GadgetZu (GZ)</option>
                      <option value="RTX">RTX Gadget (RTX)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold uppercase tracking-wider text-slate-500 mb-0.5 text-[10px]">Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1 px-2.5 text-xs text-slate-800 focus:outline-hidden"
                      placeholder="Special customer notes..."
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEditForm(false)}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-lg cursor-pointer"
                    >
                      {submitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {/* Details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                      <Phone size={13} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Phone</span>
                        <span className="font-mono font-bold text-slate-800 truncate block">{selectedCustomer.phone}</span>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center gap-2">
                      <Calendar size={13} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Registered</span>
                        <span className="font-mono text-slate-700 truncate block">{new Date(selectedCustomer.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 sm:col-span-2 flex items-start gap-2">
                      <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Address</span>
                        <span className="text-slate-700 break-words">{selectedCustomer.address || <span className="text-slate-400 italic">No address recorded</span>}</span>
                      </div>
                    </div>

                    {selectedCustomer.notes && (
                      <div className="p-2 bg-amber-50/50 rounded-lg border border-amber-200/40 sm:col-span-2 flex items-start gap-2">
                        <FileText size={13} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] uppercase font-bold text-amber-800 block">Notes</span>
                          <span className="text-slate-700 break-words">{selectedCustomer.notes}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Order History */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-1">
                      <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <ShoppingBag size={12} className="text-amber-500" />
                        <span>Order History ({customerOrders.length})</span>
                      </h4>
                    </div>

                    {customerOrders.length === 0 ? (
                      <div className="p-3 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <p className="text-[11px] italic">No orders recorded yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {customerOrders.map(order => (
                          <div key={order.id} className="p-2 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                            <div>
                              <div className="font-mono font-bold text-slate-900 text-xs">
                                {order.orderNumber || order.id.substring(0, 8).toUpperCase()}
                              </div>
                              <div className="text-[10px] text-slate-500 font-mono">
                                {new Date(order.createdAt).toLocaleDateString()} &bull; {order.items?.length || 0} items
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-amber-600 text-xs">৳{(order.total || 0).toLocaleString()}</div>
                              <span className={`text-[9px] font-bold uppercase px-1 py-0.5 rounded ${
                                order.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                order.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                'bg-slate-100 text-slate-600'
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
          </div>
        </div>
      )}

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-3 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 p-3.5 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 font-bold flex items-center justify-center">
                  <UserPlus size={14} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Add New Customer</h3>
                  <p className="text-[10px] text-slate-400">Create client profile in permanent ledger</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddCustomerSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1 text-[10px]">
                  Customer Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahim Ahmed"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1 text-[10px]">
                  Phone Number (BD format) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="017XXXXXXXX"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1 text-[10px]">
                  Sub-brand Scope
                </label>
                <select
                  value={formSubBrand}
                  onChange={(e) => setFormSubBrand(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-700 focus:outline-hidden cursor-pointer"
                >
                  <option value="">General Client (All Brands)</option>
                  <option value="SAT">Sky Auto (SAT)</option>
                  <option value="GZ">GadgetZu (GZ)</option>
                  <option value="RTX">RTX Gadget (RTX)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1 text-[10px]">
                  Delivery Address
                </label>
                <textarea
                  rows={2}
                  placeholder="House, Road, Area, City..."
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-slate-500 mb-1 text-[10px]">
                  Notes / Directives
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes or delivery preferences..."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {submitting ? 'Adding...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 z-50 flex items-center justify-center p-3 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-sm w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} />
              <h3 className="font-bold text-sm text-slate-900">Delete Customer Record</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete <strong>{customerToDelete.name}</strong> ({customerToDelete.phone})?
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCustomer}
                className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
