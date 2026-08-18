import React, { useState, useEffect } from 'react';
import CatalogItemSelection from "./CatalogItemSelection";
import { 
  Search, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Check, 
  Clock, 
  Package, 
  Truck, 
  CheckCircle, 
  RotateCcw, 
  Eye, 
  ChevronRight, 
  User, 
  Phone, 
  MapPin, 
  Layers, 
  DollarSign, 
  ChevronLeft,
  X,
  CreditCard,
  Edit,
  Activity,
  UserCheck,
} from 'lucide-react';
import { 
  Order, 
  Customer, 
  Product, 
  Variant, 
  UserProfile, 
  OrderItem, 
  OrderStatusHistory, 
  OrderStatus,
  SalesChannel,
  CourierName,
  PaymentMethod,
  PaymentStatus
} from '../types';
import { 
  getOrders, 
  getCustomers, 
  getProducts, 
  subscribeToOrders,
  subscribeToCustomers,
  subscribeToProducts,
  addOrder, 
  addCustomer, 
  updateOrderAndHandleStock, 
  recalculateCustomerStats,
  deleteOrder,
  generateInvoiceForOrder,
  recordOrderPayment,
  deleteOrderPayment,
  updateOrderFullDetails
} from '../firebase/db';

interface OrderManagementProps {
  user: UserProfile | null;
  requireCheckIn?: () => boolean;
  initialOrderId?: string | null;
  clearInitialOrderId?: () => void;
}

export default function OrderManagement({ 
  user, 
  requireCheckIn,
  initialOrderId,
  clearInitialOrderId
}: OrderManagementProps) {
  // Lists
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  // Loading & states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState('');
  const [salesChannelFilter, setSalesChannelFilter] = useState('');
  const [courierFilter, setCourierFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingTracking, setEditingTracking] = useState(false);
  const [trackingNumberForm, setTrackingNumberForm] = useState('');

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Create Order Wizard States
  const [wizardStep, setWizardStep] = useState(1);
  
  // Wizard Form Fields
  // Step 1: Customer
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custSubBrand, setCustSubBrand] = useState('');
  const [custNotes, setCustNotes] = useState('');
  
  // Step 2: Settings
  const [orderSubBrand, setOrderSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [orderSalesChannel, setOrderSalesChannel] = useState<'Facebook' | 'TikTok' | 'Instagram' | 'Daraz' | 'CartUp' | 'Packly' | 'Direct/WhatsApp'>('Direct/WhatsApp');
  const [orderCourier, setOrderCourier] = useState<'Steadfast (Outside Dhaka)' | 'CarryBee (Inside Dhaka)'>('CarryBee (Inside Dhaka)');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  // Step 3: Items selection
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [itemProductId, setItemProductId] = useState('');
  const [itemVariantId, setItemVariantId] = useState('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);

  // Step 4: Payments & Adjustments
  const [orderPaymentMethod, setOrderPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank Transfer'>('Cash');
  const [orderPaymentStatus, setOrderPaymentStatus] = useState<'Paid' | 'Due' | 'Partial'>('Due');
  const [orderAmountPaid, setOrderAmountPaid] = useState<number>(0);
  const [orderDiscount, setOrderDiscount] = useState<string>('');
  const [orderShippingCharge, setOrderShippingCharge] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);

  // Partial Payment and Manual Invoice States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);

  // Edit Order Modal States
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editDeliveryAddress, setEditDeliveryAddress] = useState('');
  const [editSubBrand, setEditSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');
  const [editSalesChannel, setEditSalesChannel] = useState<SalesChannel>('Direct/WhatsApp');
  const [editCourier, setEditCourier] = useState<CourierName>('CarryBee (Inside Dhaka)');
  const [editCourierTrackingNumber, setEditCourierTrackingNumber] = useState('');
  const [editOrderNotes, setEditOrderNotes] = useState('');
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editShippingCharge, setEditShippingCharge] = useState<string>('0');
  const [editDiscountAmount, setEditDiscountAmount] = useState<string>('0');
  const [editAmountPaid, setEditAmountPaid] = useState<string>('0');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('Cash');
  const [editPaymentStatus, setEditPaymentStatus] = useState<PaymentStatus>('Due');

  // Quick Add item states inside edit modal
  const [editAddItemProductId, setEditAddItemProductId] = useState('');
  const [editAddItemVariantId, setEditAddItemVariantId] = useState('');
  const [editAddItemPrice, setEditAddItemPrice] = useState<number>(0);
  const [editAddItemQty, setEditAddItemQty] = useState<number>(1);

  const isSuperAdmin = user?.role === 'superadmin';
  const hasManageOrders = isSuperAdmin || 
    (user?.permissionOverrides?.manageOrders === true) || 
    (user?.permissionOverrides?.manageOrders !== false && user?.role === 'admin');

  useEffect(() => {
    fetchData();
    const unsubOrders = subscribeToOrders((ordersData) => {
      setOrders(ordersData || []);
      setLoading(false);
    });
    const unsubCustomers = subscribeToCustomers((customersData) => {
      setCustomers(customersData || []);
    });
    const unsubProducts = subscribeToProducts((productsData) => {
      const approvedProducts = (productsData || []).filter(p => p.status === 'approved' && !p.archived);
      setProducts(approvedProducts);
    });
    return () => {
      unsubOrders();
      unsubCustomers();
      unsubProducts();
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const ordersData = await getOrders();
      const customersData = await getCustomers();
      const productsData = await getProducts();
      
      setOrders(ordersData || []);
      setCustomers(customersData || []);
      
      // Exclude archived and non-approved products
      const approvedProducts = (productsData || []).filter(p => p.status === 'approved' && !p.archived);
      setProducts(approvedProducts);
    } catch (err: any) {
      console.error('OrderManagement: Error fetching logs:', err);
      setError('Could not retrieve active records. Verify Firestore rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrderId && orders.length > 0) {
      const o = orders.find(x => x.id === initialOrderId);
      if (o) {
        setSelectedOrder(o);
      }
      if (clearInitialOrderId) {
        clearInitialOrderId();
      }
    }
  }, [initialOrderId, orders, clearInitialOrderId]);

  // Helper validation
  const validateBdPhone = (phone: string) => {
    const regex = /^(?:\+88)?01[3-9]\d{8}$/;
    return regex.test(phone.trim());
  };

  // Autocomplete search for customer
  const filteredCustomersSearch = customerSearch.trim() === '' ? [] :
    customers.filter(c => 
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) || 
      c.phone.includes(customerSearch) ||
      (c.customerId && c.customerId.toLowerCase().includes(customerSearch.toLowerCase()))
    ).slice(0, 5);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomerId(c.id);
    setIsNewCustomer(false);
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustAddress(c.address || '');
    setDeliveryAddress(c.address || '');
    setCustSubBrand(c.subBrand || '');
    setCustomerSearch(`${c.name} (${c.phone})`);
  };

  const handleStartNewCustomerForm = () => {
    setIsNewCustomer(true);
    setSelectedCustomerId('');
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    setDeliveryAddress('');
    setCustSubBrand(orderSubBrand);
    setCustNotes('');
    setCustomerSearch('New Customer Form');
  };

  // Items select options
  const selectedProductObj = products.find(p => p.id === itemProductId);
  const activeVariants = selectedProductObj?.variants || [];

  // Update item defaults
  useEffect(() => {
    if (selectedProductObj) {
      // Find standard selling price or cost
      setItemPrice(selectedProductObj.sellingPrice || 0);
      if (activeVariants.length > 0) {
        setItemVariantId(activeVariants[0].id);
      } else {
        setItemVariantId('');
      }
    }
  }, [itemProductId]);

  const handleAddItem = () => {
    if (!itemProductId || !itemVariantId) return;
    
    const prod = products.find(p => p.id === itemProductId);
    const variant = prod?.variants.find(v => v.id === itemVariantId);
    
    if (!prod || !variant) return;

    // Check duplicate item
    const duplicateIdx = orderItems.findIndex(i => i.productId === itemProductId && i.variantId === itemVariantId);
    if (duplicateIdx >= 0) {
      const updated = [...orderItems];
      updated[duplicateIdx].qty += itemQty;
      setOrderItems(updated);
    } else {
      const newItem: OrderItem = {
        productId: itemProductId,
        variantId: itemVariantId,
        productName: prod.name,
        variantLabel: `${variant.color || ''} ${variant.model || ''}`.trim() || 'Standard',
        qty: itemQty,
        unitPrice: itemPrice
      };
      setOrderItems([...orderItems, newItem]);
    }

    // Reset picker
    setItemProductId('');
    setItemVariantId('');
    setItemQty(1);
    setItemPrice(0);
  };

  const handleRemoveItem = (idx: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== idx));
  };

  const calculateSubtotal = () => {
    return orderItems.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
  };

  // Sync Payment Method and Status
  const orderSubtotal = calculateSubtotal();
  const orderTotal = Math.max(0, orderSubtotal - (Number(orderDiscount) || 0) + (Number(orderShippingCharge) || 0));
  useEffect(() => {
    if (orderPaymentStatus === 'Paid') {
      setOrderAmountPaid(orderTotal);
    } else if (orderPaymentStatus === 'Due') {
      setOrderAmountPaid(0);
    }
  }, [orderPaymentStatus, orderTotal]);

  const handlePlaceOrderSubmit = async () => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (!hasManageOrders) {
      setError('You do not have permission to place orders.');
      return;
    }

    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      let finalCustomerId = selectedCustomerId;

      // 1. Save customer if new
      if (isNewCustomer) {
        if (!custName.trim()) {
          setError('Full Name is required for new customer.');
          setWizardStep(1);
          setSubmitting(false);
          return;
        }
        if (!validateBdPhone(custPhone)) {
          setError('Invalid Bangladesh Phone Number.');
          setWizardStep(1);
          setSubmitting(false);
          return;
        }

        // Duplicate check
        const existing = customers.find(c => c.phone.trim() === custPhone.trim());
        if (existing) {
          finalCustomerId = existing.id;
        } else {
          const newCustPayload = {
            name: custName.trim(),
            phone: custPhone.trim(),
            address: custAddress.trim() || undefined,
            subBrand: custSubBrand || undefined,
            notes: custNotes.trim() || undefined,
            totalOrders: 0,
            lifetimeValue: 0,
            createdAt: Date.now()
          };
          finalCustomerId = await addCustomer(newCustPayload);
        }
      }

      if (!finalCustomerId) {
        setError('No valid customer associated with order.');
        setWizardStep(1);
        setSubmitting(false);
        return;
      }

      if (orderItems.length === 0) {
        setError('Order must contain at least one catalog item.');
        setWizardStep(3);
        setSubmitting(false);
        return;
      }

      // Calculate final due
      const finalPaid = Number(orderAmountPaid) || 0;
      const finalDue = Math.max(0, orderTotal - finalPaid);

      // Create Order document
      const orderPayload: Omit<Order, 'id'> = {
        customerId: finalCustomerId,
        customerName: custName.trim() || 'Unknown',
        customerPhone: custPhone.trim() || 'No Phone',
        subBrand: orderSubBrand,
        salesChannel: orderSalesChannel,
        items: orderItems,
        discountAmount: Number(orderDiscount) || 0,
        shippingCharge: Number(orderShippingCharge) || 0,
        totalAmount: orderTotal,
        courier: orderCourier,
        courierTrackingNumber: '',
        paymentMethod: orderPaymentMethod,
        paymentStatus: orderPaymentStatus,
        amountPaid: finalPaid,
        amountDue: finalDue,
        status: 'Pending',
        statusHistory: [
          {
            status: 'Pending',
            timestamp: Date.now(),
            changedBy: user?.name || user?.email || 'Operator'
          }
        ],
        deliveryAddress: deliveryAddress.trim() || custAddress.trim() || 'No Address',
        notes: orderNotes.trim() || undefined,
        createdBy: user?.name || user?.email || 'Operator',
        createdAt: Date.now()
      };

      const newOrderId = await addOrder(orderPayload);
      
      // Trigger instant recalculation of customer statistics (total orders, ltv)
      await recalculateCustomerStats(finalCustomerId);

      setSuccess(`Order #${newOrderId.substring(0, 8).toUpperCase()} placed successfully!`);
      setShowCreateModal(false);
      resetWizard();
      await fetchData();
    } catch (err: any) {
      console.error('OrderManagement: Create order failed:', err);
      setError('Failed to record order inside Firestore database.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdvanceStatus = async (targetStatus: OrderStatus) => {
    if (targetStatus === 'Delivered') {
      console.log("CONFIRM DELIVERY CLICKED", selectedOrder?.id);
    }

    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedOrder) return;
    if (!hasManageOrders) {
      setError('You do not have permission to modify order status.');
      return;
    }

    const confirmMsg = `Are you sure you want to transition order status from "${selectedOrder.status}" to "${targetStatus}"?`;

    setConfirmDialog({
      isOpen: true,
      title: "Transition Order Status",
      message: confirmMsg,
      onConfirm: async () => {
        setConfirmDialog(null);
        setError('');
        setSuccess('');
        setSubmitting(true);

        try {
          const oldStatus = selectedOrder.status;
          
          const updatedStatusHistory: OrderStatusHistory[] = [
            ...selectedOrder.statusHistory,
            {
              status: targetStatus,
              timestamp: Date.now(),
              changedBy: user?.name || user?.email || 'System'
            }
          ];

          const trackingUpdate: Partial<Order> = {};
          if (targetStatus === 'Shipped' && trackingNumberForm.trim()) {
            trackingUpdate.courierTrackingNumber = trackingNumberForm.trim();
          }

          const updatedOrder: Order = {
            ...selectedOrder,
            status: targetStatus,
            statusHistory: updatedStatusHistory,
            ...trackingUpdate
          };

          // Calls the transactional status machine & stock deduct helper!
          await updateOrderAndHandleStock(
            selectedOrder.id, 
            updatedOrder, 
            oldStatus, 
            user?.id || 'sys', 
            user?.name || 'Operator'
          );

          // Recalculate customer LTV in case status changed to/from Returned/Cancelled
          await recalculateCustomerStats(selectedOrder.customerId);

          setSuccess(`Order successfully moved to "${targetStatus}"!`);
          setSelectedOrder(updatedOrder);
          setEditingTracking(false);
          await fetchData();
        } catch (err: any) {
          console.error('OrderManagement: Status advance failed:', err);
          setError(`Could not perform transactional state change: ${err.message || err}`);
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  const handleSaveTrackingNumber = async () => {
    if (!selectedOrder) return;
    try {
      setSubmitting(true);
      const updatedOrder: Order = {
        ...selectedOrder,
        courierTrackingNumber: trackingNumberForm.trim()
      };
      
      await updateOrderAndHandleStock(
        selectedOrder.id, 
        updatedOrder, 
        selectedOrder.status, 
        user?.id || 'sys', 
        user?.name || 'Operator'
      );
      
      setSelectedOrder(updatedOrder);
      setEditingTracking(false);
      setSuccess('Tracking number updated successfully!');
      await fetchData();
    } catch (err) {
      console.error(err);
      setError('Failed to update tracking details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteOrderClick = async (orderId: string) => {
    if (!isSuperAdmin) {
      setError('Only Superadmins can delete order records.');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "Delete Order Permanently",
      message: "CRITICAL: Are you sure you want to delete this order document permanently? This cannot be undone.",
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          setSubmitting(true);
          const targetOrder = orders.find(o => o.id === orderId);
          await deleteOrder(orderId);
          if (targetOrder) {
            await recalculateCustomerStats(targetOrder.customerId);
          }
          setSelectedOrder(null);
          setSuccess('Order document permanently deleted.');
          await fetchData();
        } catch (err: any) {
          console.error(err);
          setError(`Failed to delete order: ${err.message || err}`);
        } finally {
          setSubmitting(false);
        }
      }
    });
  };

  const handleManualGenerateInvoice = async () => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedOrder) return;
    setInvoiceGenerating(true);
    setError('');
    setSuccess('');
    try {
      const invId = await generateInvoiceForOrder(selectedOrder.id, user?.id || 'sys');
      setSuccess(`Invoice successfully generated!`);
      // Update local state
      const updatedOrder = { ...selectedOrder, invoiceId: invId };
      setSelectedOrder(updatedOrder);
      // Update list
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
    } catch (err: any) {
      console.error('Error manually generating invoice:', err);
      setError('Failed to generate invoice.');
    } finally {
      setInvoiceGenerating(false);
    }
  };

  const handleRecordPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedOrder) return;
    
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid positive payment amount.');
      return;
    }
    
    if (amt > selectedOrder.amountDue) {
      setError(`Amount exceeds the order's remaining due of ৳${selectedOrder.amountDue.toLocaleString()}.`);
      return;
    }
    
    setPaymentSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await recordOrderPayment(
        selectedOrder.id,
        amt,
        paymentMethod,
        user?.id || 'sys',
        user?.name || 'Operator'
      );
      
      setSuccess(`Successfully recorded payment of ৳${amt.toLocaleString()} via ${paymentMethod}!`);
      
      // Update local state
      const newPaid = (selectedOrder.amountPaid || 0) + amt;
      const newDue = Math.max(0, selectedOrder.totalAmount - newPaid);
      const newStatus = newDue <= 0 ? 'Paid' : 'Partial';
      
      const newHistoryEntry = {
        amount: amt,
        method: paymentMethod,
        date: Date.now(),
        recordedBy: user?.name || 'Operator'
      };
      
      const updatedOrder: Order = {
        ...selectedOrder,
        amountPaid: newPaid,
        amountDue: newDue,
        paymentStatus: newStatus as any,
        paymentHistory: [...(selectedOrder.paymentHistory || []), newHistoryEntry]
      };
      
      setSelectedOrder(updatedOrder);
      setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
      setShowPaymentModal(false);
      setPaymentAmount('');
    } catch (err: any) {
      console.error('Error recording payment on order:', err);
      setError('Failed to record payment.');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const [paymentToDelete, setPaymentToDelete] = useState<{
    orderId: string;
    index: number;
    amount: number;
    method: string;
  } | null>(null);

  const handleDeletePaymentEntry = async (index: number, ph: { amount: number; method: string }) => {
    if (!selectedOrder) return;
    setPaymentToDelete({
      orderId: selectedOrder.id,
      index,
      amount: ph.amount,
      method: ph.method
    });
  };

  const handleConfirmDeletePaymentEntry = async () => {
    if (!paymentToDelete || !selectedOrder) return;
    try {
      const updated = await deleteOrderPayment(paymentToDelete.orderId, paymentToDelete.index);
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      setPaymentToDelete(null);
    } catch (err: any) {
      console.error('Error deleting payment entry:', err);
      setError(`Failed to delete payment entry: ${err.message || err}`);
    }
  };

  // Open Full Order Edit Modal
  const handleOpenEditModal = (order: Order) => {
    if (requireCheckIn && !requireCheckIn()) return;
    setEditingOrder(order);
    setEditCustomerName(order.customerName || '');
    setEditCustomerPhone(order.customerPhone || '');
    setEditDeliveryAddress(order.deliveryAddress || '');
    setEditSubBrand(order.subBrand || 'SAT');
    setEditSalesChannel(order.salesChannel || 'Direct/WhatsApp');
    setEditCourier(order.courier || 'CarryBee (Inside Dhaka)');
    setEditCourierTrackingNumber(order.courierTrackingNumber || '');
    setEditOrderNotes(order.notes || '');
    setEditItems((order.items || []).map(i => ({ ...i })));
    setEditShippingCharge(String(order.shippingCharge ?? 0));
    setEditDiscountAmount(String(order.discountAmount ?? 0));
    setEditAmountPaid(String(order.amountPaid ?? 0));
    setEditPaymentMethod(order.paymentMethod || 'Cash');
    setEditPaymentStatus(order.paymentStatus || 'Due');

    // Reset item selector
    setEditAddItemProductId('');
    setEditAddItemVariantId('');
    setEditAddItemPrice(0);
    setEditAddItemQty(1);

    setError('');
    setSuccess('');
    setShowEditModal(true);
  };

  const handleUpdateEditItemQty = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setEditItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], qty: newQty };
      return updated;
    });
  };

  const handleUpdateEditItemPrice = (index: number, newPrice: number) => {
    if (isNaN(newPrice) || newPrice < 0) return;
    setEditItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], unitPrice: newPrice };
      return updated;
    });
  };

  const handleRemoveEditItem = (index: number) => {
    if (editItems.length <= 1) {
      setError('An order must have at least 1 line item.');
      return;
    }
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddEditItemToOrder = () => {
    if (!editAddItemProductId || !editAddItemVariantId) {
      setError('Please select a product and variant to add.');
      return;
    }
    const prod = products.find(p => p.id === editAddItemProductId);
    const variant = prod?.variants.find(v => v.id === editAddItemVariantId);
    if (!prod || !variant) return;

    const existingIdx = editItems.findIndex(i => i.productId === editAddItemProductId && i.variantId === editAddItemVariantId);
    if (existingIdx >= 0) {
      setEditItems(prev => {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          qty: updated[existingIdx].qty + (editAddItemQty || 1),
          unitPrice: editAddItemPrice > 0 ? editAddItemPrice : updated[existingIdx].unitPrice
        };
        return updated;
      });
    } else {
      const newItem: OrderItem = {
        productId: editAddItemProductId,
        variantId: editAddItemVariantId,
        productName: prod.name,
        variantLabel: `${variant.color || ''} ${variant.model || ''}`.trim() || 'Standard',
        qty: editAddItemQty || 1,
        unitPrice: editAddItemPrice
      };
      setEditItems(prev => [...prev, newItem]);
    }

    // Reset item selector
    setEditAddItemProductId('');
    setEditAddItemVariantId('');
    setEditAddItemPrice(0);
    setEditAddItemQty(1);
    setError('');
  };

  const handleSaveEditedOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    if (requireCheckIn && !requireCheckIn()) return;

    if (editItems.length === 0) {
      setError('The order must contain at least 1 item.');
      return;
    }
    if (!editCustomerName.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!editCustomerPhone.trim()) {
      setError('Customer phone number is required.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const subtotal = editItems.reduce((acc, it) => acc + (Number(it.unitPrice || 0) * Number(it.qty || 1)), 0);
      const ship = parseFloat(editShippingCharge) || 0;
      const disc = parseFloat(editDiscountAmount) || 0;
      const paid = parseFloat(editAmountPaid) || 0;
      const totalAmount = Math.max(0, subtotal + ship - disc);
      const amountDue = Math.max(0, totalAmount - paid);

      let finalPaymentStatus: PaymentStatus = editPaymentStatus;
      if (amountDue === 0 && totalAmount > 0) {
        finalPaymentStatus = 'Paid';
      } else if (paid > 0 && amountDue > 0) {
        finalPaymentStatus = 'Partial';
      } else if (paid === 0) {
        finalPaymentStatus = 'Due';
      }

      const updated = await updateOrderFullDetails(
        editingOrder.id,
        {
          customerName: editCustomerName.trim(),
          customerPhone: editCustomerPhone.trim(),
          deliveryAddress: editDeliveryAddress.trim(),
          subBrand: editSubBrand,
          salesChannel: editSalesChannel,
          courier: editCourier,
          courierTrackingNumber: editCourierTrackingNumber.trim(),
          notes: editOrderNotes.trim(),
          items: editItems,
          discountAmount: disc,
          shippingCharge: ship,
          totalAmount,
          amountPaid: paid,
          amountDue,
          paymentStatus: finalPaymentStatus,
          paymentMethod: editPaymentMethod
        },
        user?.id || 'sys',
        user?.name || 'Operator'
      );

      if (editingOrder.customerId) {
        await recalculateCustomerStats(editingOrder.customerId);
      }

      setSuccess(`Order #${editingOrder.id.substring(0, 8).toUpperCase()} updated successfully!`);
      setSelectedOrder(updated);
      setOrders(prev => prev.map(o => o.id === updated.id ? updated : o));
      setShowEditModal(false);
      setEditingOrder(null);
      await fetchData();
    } catch (err: any) {
      console.error('Error updating order:', err);
      setError(`Failed to update order: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setIsNewCustomer(false);
    setSelectedCustomerId('');
    setCustomerSearch('');
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    setCustSubBrand('');
    setCustNotes('');
    
    setOrderSubBrand('SAT');
    setOrderSalesChannel('Direct/WhatsApp');
    setOrderCourier('CarryBee (Inside Dhaka)');
    setDeliveryAddress('');
    setOrderNotes('');

    setOrderItems([]);
    setItemProductId('');
    setItemVariantId('');
    setItemQty(1);
    setItemPrice(0);

    setOrderPaymentMethod('Cash');
    setOrderPaymentStatus('Due');
    setOrderAmountPaid(0);
    setOrderDiscount('');
    setOrderShippingCharge('');
  };

  // Filters
  const filteredOrders = orders.filter(order => {
    // 1. Sub brand access
    if (!isSuperAdmin && user?.subBrandAccess) {
      if (!user.subBrandAccess.includes(order.subBrand)) {
        return false;
      }
    }

    // 2. State filters
    if (statusFilter && order.status !== statusFilter) return false;
    if (subBrandFilter && order.subBrand !== subBrandFilter) return false;
    if (salesChannelFilter && order.salesChannel !== salesChannelFilter) return false;
    if (courierFilter && order.courier !== courierFilter) return false;
    if (paymentStatusFilter && order.paymentStatus !== paymentStatusFilter) return false;

    // 3. Search query
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchCust = order.customerName.toLowerCase().includes(q) || order.customerPhone.includes(q);
      const matchId = order.id.toLowerCase().includes(q);
      if (!matchCust && !matchId) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="text-sm font-mono font-bold text-amber-500 uppercase tracking-widest">Courier & Fulfillment Pipeline</span>
          <h1 className="text-2xl font-black text-slate-950 font-sans uppercase tracking-tight">Order Desk</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track customer sales channels, payments status, courier tracking dispatches, and trigger real-time stock counts.
          </p>
        </div>

        {hasManageOrders && (
          <button
            onClick={() => {
              resetWizard();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-sm uppercase tracking-wider py-2.5 px-4 rounded-xl shadow-md transition-all cursor-pointer"
          >
            <Plus size={14} />
            Create Sales Order
          </button>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-sm flex items-center gap-2.5 animate-pulse">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <span className="font-semibold">{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-sm flex items-center gap-2.5 animate-pulse">
          <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
          <span className="font-semibold">{success}</span>
        </div>
      )}

      {/* Grid Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* Filters and List - spans 3 cols */}
        <div className="lg:col-span-3 space-y-4">
          
          {/* Filtering Drawer / Form Row */}
          <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="relative w-full sm:flex-1">
                <Search className="absolute left-3.5 top-2.5 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Search orders by customer name, phone, or Firestore UID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-sm text-slate-800 focus:outline-hidden"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-40 bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-700 focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Packed">Packed</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
                <option value="Returned/Cancelled">Returned/Cancelled</option>
              </select>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <select
                value={subBrandFilter}
                onChange={(e) => setSubBrandFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-700"
              >
                <option value="">Sub-Brand</option>
                {(isSuperAdmin ? ['SAT', 'GZ', 'RTX'] : user?.subBrandAccess || []).map(brand => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>

              <select
                value={salesChannelFilter}
                onChange={(e) => setSalesChannelFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-700"
              >
                <option value="">Sales Channel</option>
                <option value="Facebook">Facebook</option>
                <option value="TikTok">TikTok</option>
                <option value="Instagram">Instagram</option>
                <option value="Daraz">Daraz</option>
                <option value="CartUp">CartUp</option>
                <option value="Packly">Packly</option>
                <option value="Direct/WhatsApp">Direct/WhatsApp</option>
              </select>

              <select
                value={courierFilter}
                onChange={(e) => setCourierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-700"
              >
                <option value="">Courier Desk</option>
                <option value="Steadfast (Outside Dhaka)">Steadfast (Outside)</option>
                <option value="CarryBee (Inside Dhaka)">CarryBee (Inside)</option>
              </select>

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-sm text-slate-700"
              >
                <option value="">Payment Status</option>
                <option value="Paid">Paid</option>
                <option value="Due">Due</option>
                <option value="Partial">Partial</option>
              </select>
            </div>
          </div>

          {/* Orders List Desk */}
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-mono text-slate-400 uppercase tracking-widest">SYNCING SALES LEDGERS...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                <Package size={36} className="text-slate-300 mb-2" />
                <span className="text-sm font-mono uppercase tracking-wider font-bold">No Invoices Found</span>
                <p className="text-sm text-slate-400 mt-1">
                  Adjust your search inputs or click "Create Sales Order" to start.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-sm font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Order UID & Date</th>
                      <th className="py-3 px-4">Client</th>
                      <th className="py-3 px-4 text-center">Brand</th>
                      <th className="py-3 px-4 text-center">Items</th>
                      <th className="py-3 px-4 text-right">Total (৳)</th>
                      <th className="py-3 px-4 text-center">Fulfillment</th>
                      <th className="py-3 px-4 text-center">Payment</th>
                      <th className="py-3 px-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-sm">
                    {filteredOrders.map((order) => {
                      const itemCount = order.items.reduce((acc, i) => acc + i.qty, 0);
                      return (
                        <tr
                          key={order.id}
                          onClick={() => {
                            setSelectedOrder(order);
                            setTrackingNumberForm(order.courierTrackingNumber || '');
                            setEditingTracking(false);
                          }}
                          className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedOrder?.id === order.id ? 'bg-amber-50/25 font-semibold' : ''}`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono font-black text-slate-900 uppercase">#{order.id.substring(0, 8)}</span>
                              <span className="text-sm text-slate-400 font-mono">{new Date(order.createdAt).toLocaleDateString()}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-800">{order.customerName}</span>
                              <span className="text-sm text-slate-400 font-mono">{order.customerPhone}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block text-[9px] font-mono font-black px-1.5 py-0.5 rounded-sm ${
                              order.subBrand === 'SAT' ? 'bg-amber-100 text-amber-800' :
                              order.subBrand === 'GZ' ? 'bg-teal-100 text-teal-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {order.subBrand}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-600">
                            {itemCount}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-950">
                            ৳{order.totalAmount.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              order.status === 'Delivered' ? 'bg-emerald-100 text-emerald-800' :
                              order.status === 'Returned/Cancelled' ? 'bg-red-50 text-red-700 border border-red-100' :
                              order.status === 'Pending' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-700'
                            }`}>
                              {order.status === 'Pending' && <Clock size={10} />}
                              {order.status === 'Confirmed' && <Check size={10} />}
                              {order.status === 'Packed' && <Package size={10} />}
                              {order.status === 'Shipped' && <Truck size={10} />}
                              {order.status === 'Delivered' && <CheckCircle size={10} />}
                              {order.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-sm ${
                              order.paymentStatus === 'Paid' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                              order.paymentStatus === 'Due' ? 'bg-red-50 text-red-700 border border-red-100' :
                              'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {order.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(order);
                                }}
                                title="Edit Order Details & Prices"
                                className="p-1.5 hover:bg-amber-100 text-slate-400 hover:text-amber-800 rounded-lg transition-colors cursor-pointer"
                              >
                                <Edit size={14} />
                              </button>
                              <ChevronRight size={16} className="text-slate-300" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column - Order Detail View & Status Machine */}
        <div className="lg:col-span-1">
          {selectedOrder ? (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden space-y-5">
              
              {/* Header Details Card */}
              <div className="bg-slate-950 p-6 text-white space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-mono tracking-widest text-slate-400 block uppercase">SALES RECORD</span>
                    <h3 className="font-black font-sans text-base text-amber-400 mt-1">#{selectedOrder.id.substring(0, 12).toUpperCase()}</h3>
                  </div>
                  <span className={`text-sm font-mono font-bold px-2 py-0.5 rounded-sm ${
                    selectedOrder.status === 'Delivered' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    selectedOrder.status === 'Returned/Cancelled' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {selectedOrder.status.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 font-mono text-sm">
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Grand Total</span>
                    <span className="text-sm font-black text-white">৳{selectedOrder.totalAmount.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase text-slate-500 font-bold block">Status Paid</span>
                    <span className={`text-sm font-black ${selectedOrder.amountDue === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      ৳{selectedOrder.amountPaid.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenEditModal(selectedOrder)}
                  className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all mt-2"
                >
                  <Edit size={14} /> Edit Order (অর্ডার ও প্রাইস এডিট)
                </button>
              </div>

              {/* Status transition Controls */}
              <div className="px-6 space-y-3">
                <h4 className="text-sm font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                  <Activity size={12} className="text-amber-500" />
                  State Control Matrix
                </h4>

                {/* Pipeline Progression Buttons */}
                <div className="space-y-2">
                  {selectedOrder.status === 'Pending' && (
                    <button
                      onClick={() => handleAdvanceStatus('Confirmed')}
                      disabled={submitting}
                      className="w-full py-2.5 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-sm uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Deduct Stock & Confirm Order
                    </button>
                  )}

                  {selectedOrder.status === 'Confirmed' && (
                    <button
                      onClick={() => handleAdvanceStatus('Packed')}
                      disabled={submitting}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm uppercase tracking-wider rounded-xl cursor-pointer"
                    >
                      Mark as Packed
                    </button>
                  )}

                  {selectedOrder.status === 'Packed' && (
                    <button
                      onClick={() => handleAdvanceStatus('Shipped')}
                      disabled={submitting}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl cursor-pointer"
                    >
                      Ready for Dispatch (Ship)
                    </button>
                  )}

                  {selectedOrder.status === 'Shipped' && (
                    <div className="space-y-2">
                      <button
                        onClick={() => handleAdvanceStatus('Delivered')}
                        disabled={submitting}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Confirm Successful Delivery
                      </button>
                    </div>
                  )}

                  {/* Cancellation / Reversion option */}
                  {selectedOrder.status !== 'Returned/Cancelled' && selectedOrder.status !== 'Delivered' && (
                    <button
                      onClick={() => handleAdvanceStatus('Returned/Cancelled')}
                      disabled={submitting}
                      className="w-full py-2 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm uppercase tracking-wide rounded-xl border border-red-200 cursor-pointer"
                    >
                      Cancel Sales Order (Restore Stock)
                    </button>
                  )}
                  
                  {selectedOrder.status === 'Delivered' && (
                    <button
                      onClick={() => handleAdvanceStatus('Returned/Cancelled')}
                      disabled={submitting}
                      className="w-full py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-sm uppercase tracking-wide rounded-xl border border-orange-200 cursor-pointer"
                    >
                      Return Delivered Goods (Restock)
                    </button>
                  )}
                </div>

                {/* Tracking Code Editor */}
                {['Shipped', 'Delivered'].includes(selectedOrder.status) && (
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-2 text-sm">
                    <span className="font-bold text-slate-500 uppercase tracking-wide text-[9px] block">Courier tracking reference</span>
                    {editingTracking ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={trackingNumberForm}
                          onChange={(e) => setTrackingNumberForm(e.target.value)}
                          placeholder="Tracking #..."
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm"
                        />
                        <button
                          onClick={handleSaveTrackingNumber}
                          disabled={submitting}
                          className="bg-slate-900 text-amber-400 px-3 py-1 rounded-lg font-bold text-sm"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTracking(false)}
                          className="bg-slate-200 text-slate-700 px-2 py-1 rounded-lg text-sm"
                        >
                          X
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-slate-800">
                          {selectedOrder.courierTrackingNumber || <span className="text-slate-300 italic">No Tracking Assigned</span>}
                        </span>
                        <button
                          onClick={() => setEditingTracking(true)}
                          className="text-amber-600 hover:text-amber-700 font-bold text-sm flex items-center gap-0.5"
                        >
                          <Edit size={10} /> Edit Code
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Billing, Invoice & Cash Collection */}
              <div className="px-6 space-y-4 text-sm">
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h5 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider flex items-center gap-1.5">
                    <DollarSign size={11} className="text-[#D4AF37]" />
                    Billing & Invoicing
                  </h5>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700">Payment Status:</span>
                      <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        selectedOrder.paymentStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedOrder.paymentStatus === 'Partial'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedOrder.paymentStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm font-mono border-t border-slate-200/50 pt-2.5">
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 font-bold block">Paid</span>
                        <span className="font-black text-emerald-600">৳{selectedOrder.amountPaid.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 font-bold block">Outstanding</span>
                        <span className="font-black text-red-600">৳{selectedOrder.amountDue.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-slate-200/50">
                      {selectedOrder.invoiceId ? (
                        <div className="bg-amber-50/40 p-2 rounded-xl border border-amber-100/30 flex items-center justify-between">
                          <span className="font-mono text-sm text-amber-700 font-bold">✓ Invoice Linked</span>
                          <span className="text-[9px] font-mono text-slate-400">({selectedOrder.invoiceId.substring(0, 8).toUpperCase()})</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleManualGenerateInvoice}
                          disabled={invoiceGenerating}
                          className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] font-bold rounded-xl transition-all text-center cursor-pointer flex items-center justify-center gap-1"
                        >
                          {invoiceGenerating ? 'Generating...' : 'Generate Invoice'}
                        </button>
                      )}

                      {selectedOrder.amountDue > 0 && (
                        <button
                          onClick={() => {
                            setPaymentAmount('');
                            setPaymentMethod('Cash');
                            setShowPaymentModal(true);
                          }}
                          className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl transition-all text-center cursor-pointer flex items-center justify-center gap-1"
                        >
                          Record Partial Payment
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Cash Collections Log */}
                {selectedOrder.paymentHistory && selectedOrder.paymentHistory.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Payment History log</h5>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-2 max-h-36 overflow-y-auto">
                      {selectedOrder.paymentHistory.map((ph, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                          <div>
                            <p className="font-semibold text-slate-700">৳{ph.amount.toLocaleString()} ({ph.method})</p>
                            <p className="text-[8px] text-slate-400">By {ph.recordedBy}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-slate-400">{new Date(ph.date).toLocaleDateString('en-GB')}</span>
                            <button
                              type="button"
                              onClick={() => handleDeletePaymentEntry(idx, ph)}
                              title="Delete payment entry"
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2 mt-2 border-t border-slate-200 text-right">
                        {selectedOrder.amountDue === 0 ? (
                          <div className="flex items-center justify-end gap-1 text-emerald-600">
                            <Check size={14} />
                            <span className="font-bold text-sm">Fully Settled</span>
                          </div>
                        ) : (
                          <span className="font-bold text-sm text-red-600 font-mono">
                            Remaining Due: ৳{selectedOrder.amountDue.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Courier & Client info */}
              <div className="px-6 space-y-4 text-sm">
                {/* Client Profile */}
                <div className="space-y-2">
                  <h5 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Client Recipient</h5>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2">
                      <User size={12} className="text-slate-400" />
                      <span className="font-bold text-slate-800">{selectedOrder.customerName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      <span className="font-mono text-slate-600">{selectedOrder.customerPhone}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin size={12} className="text-slate-400 mt-0.5" />
                      <span className="text-slate-600 leading-normal">{selectedOrder.deliveryAddress}</span>
                    </div>
                  </div>
                </div>

                {/* Items Ordered */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <h5 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Sales Catalog lines</h5>
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(selectedOrder)}
                      className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit size={11} /> Edit Items & Prices
                    </button>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl divide-y divide-slate-200/55 max-h-[160px] overflow-y-auto space-y-2">
                    {selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm pt-2 first:pt-0">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 truncate">{item.productName}</p>
                          <span className="text-sm text-slate-400 font-mono">Var: {item.variantLabel}</span>
                        </div>
                        <div className="text-right flex-shrink-0 font-mono">
                          <span className="text-slate-500 font-semibold">{item.qty} x </span>
                          <span className="font-black text-slate-900">৳{item.unitPrice.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Status Timeline History */}
                <div className="space-y-2">
                  <h5 className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Status Transition History</h5>
                  <div className="space-y-2 max-h-[130px] overflow-y-auto pr-1">
                    {selectedOrder.statusHistory.map((h, idx) => (
                      <div key={idx} className="flex gap-2 text-sm items-start border-l-2 border-amber-200 pl-3 py-1 ml-1.5">
                        <div className="flex-1">
                          <span className="font-bold text-slate-800 uppercase">{h.status}</span>
                          <p className="text-slate-400 mt-0.5">By {h.changedBy}</p>
                        </div>
                        <span className="font-mono text-slate-400 whitespace-nowrap">{new Date(h.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes and creator */}
                <div className="space-y-1 bg-slate-50/50 p-3 rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                  <p>Channel: <span className="font-bold text-slate-600">{selectedOrder.salesChannel}</span> | Courier: <span className="font-bold text-slate-600">{selectedOrder.courier}</span></p>
                  <p>Creator: <span className="font-mono text-slate-600">{selectedOrder.createdBy}</span> | Created: <span className="font-mono text-slate-600">{new Date(selectedOrder.createdAt).toLocaleDateString()}</span></p>
                  {selectedOrder.notes && <p className="mt-1 border-t border-slate-100 pt-1 text-slate-500 italic">" {selectedOrder.notes} "</p>}
                </div>

                {/* Superadmin Delete Document Option */}
                {isSuperAdmin && (
                  <button
                    onClick={() => handleDeleteOrderClick(selectedOrder.id)}
                    className="w-full py-2 bg-red-100/30 hover:bg-red-100/70 border border-red-200/55 text-red-700 font-mono text-sm rounded-xl flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={12} /> Permanently Delete Order Document
                  </button>
                )}
              </div>

            </div>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center text-slate-400 flex flex-col items-center justify-center py-20">
              <Eye size={28} className="text-slate-300 mb-2" />
              <span className="text-sm font-mono uppercase font-bold">No Order Selected</span>
              <p className="text-sm text-slate-400 mt-1 max-w-xs leading-normal">
                Click on any client invoice row from the order desk list to inspect full item details, status logs, tracking codes, and payment statuses.
              </p>
            </div>
          )}
        </div>

      </div>

      {/* CREATE ORDER WIZARD MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/85 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs">
          <div className={`bg-white rounded-3xl border border-slate-100 w-full shadow-2xl animate-scale-up overflow-hidden flex flex-col max-h-[92vh] transition-all duration-300 ${wizardStep === 3 ? 'max-w-6xl' : 'max-w-2xl'}`}>
            
            {/* Modal Header */}
            <div className="bg-slate-950 p-5 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-black font-sans uppercase tracking-tight text-sm">Create Sales Order</h3>
                <p className="text-sm text-amber-400 font-mono tracking-widest uppercase mt-0.5">Step {wizardStep} of 5: {
                  wizardStep === 1 ? 'Customer Recipient' :
                  wizardStep === 2 ? 'Fulfillment & Channels' :
                  wizardStep === 3 ? 'Catalog Items selection' :
                  wizardStep === 4 ? 'Payment Ledger settings' :
                  'Final Review & Place Order'
                }</p>
              </div>
              <button 
                onClick={() => {
                  setConfirmDialog({
                    isOpen: true,
                    title: "Discard Wizard",
                    message: "Are you sure you want to discard all wizard edits?",
                    onConfirm: () => {
                      setConfirmDialog(null);
                      setShowCreateModal(false);
                      resetWizard();
                    }
                  });
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Wizard Navigation Progress dots */}
            <div className="bg-slate-50 border-b border-slate-100 px-6 py-3 flex justify-between items-center flex-shrink-0 text-sm font-mono">
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(step => (
                  <div 
                    key={step} 
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold font-sans ${
                      wizardStep === step ? 'bg-amber-400 text-slate-950 shadow-xs' :
                      wizardStep > step ? 'bg-slate-950 text-white' :
                      'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {step}
                  </div>
                ))}
              </div>
              <span className="text-slate-400">Order Sub-brand: <strong className="text-slate-700">{orderSubBrand}</strong></span>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              
              {/* STEP 1: CUSTOMER ASSOCIATION */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div className="flex gap-4 border-b border-slate-100 pb-3">
                    <button
                      type="button"
                      onClick={() => setIsNewCustomer(false)}
                      className={`flex-1 py-2 text-sm font-bold rounded-xl border ${!isNewCustomer ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-600 border-slate-200'}`}
                    >
                      Search Existing Client Database
                    </button>
                    <button
                      type="button"
                      onClick={handleStartNewCustomerForm}
                      className={`flex-1 py-2 text-sm font-bold rounded-xl border ${isNewCustomer ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-600 border-slate-200'}`}
                    >
                      Quick-Add New Customer
                    </button>
                  </div>

                  {!isNewCustomer ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-bold uppercase tracking-wider text-slate-500">Search Existing Client *</label>
                      <div className="relative">
                        <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                        <input
                          type="text"
                          placeholder="Type Name or Phone Number..."
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setSelectedCustomerId('');
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 focus:outline-hidden"
                        />
                      </div>

                      {/* Dropdown Results */}
                      {filteredCustomersSearch.length > 0 && (
                        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg divide-y divide-slate-100">
                          {filteredCustomersSearch.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => handleSelectCustomer(c)}
                              className="w-full text-left px-4 py-2.5 hover:bg-amber-50/40 text-sm flex justify-between items-center"
                            >
                              <div>
                                {c.customerId && (
                                  <span className="font-bold text-amber-700 font-mono text-xs mr-2 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                    {c.customerId}
                                  </span>
                                )}
                                <span className="font-bold text-slate-900">{c.name}</span>
                                <span className="text-slate-500 font-mono ml-2">({c.phone})</span>
                              </div>
                              <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 rounded">Select</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Selected Client Badge */}
                      {selectedCustomerId && (
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl text-sm flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <UserCheck className="text-emerald-600" size={18} />
                            <div>
                              <p className="font-bold text-slate-900">{custName}</p>
                              <p className="text-slate-500 font-mono text-sm mt-0.5">{custPhone} | {custAddress || 'No Address'}</p>
                            </div>
                          </div>
                          <span className="text-sm font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">Linked</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-1">
                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Full Name *</label>
                        <input
                          type="text"
                          value={custName}
                          onChange={(e) => setCustName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                          placeholder="e.g. Shakib Al Hasan"
                          required
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Phone Number * (Bangladesh)</label>
                        <input
                          type="text"
                          value={custPhone}
                          onChange={(e) => setCustPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-mono"
                          placeholder="e.g. 01712345678"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Billing / Delivery Address</label>
                        <textarea
                          value={custAddress}
                          onChange={(e) => {
                            setCustAddress(e.target.value);
                            setDeliveryAddress(e.target.value);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm"
                          rows={2}
                          placeholder="Full delivery location details..."
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Sub-brand affiliation</label>
                        <select
                          value={custSubBrand}
                          onChange={(e) => setCustSubBrand(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                        >
                          <option value="">No specific brand</option>
                          <option value="SAT">Sky Auto (SAT)</option>
                          <option value="GZ">GadgetZu (GZ)</option>
                          <option value="RTX">RTX Gadget (RTX)</option>
                        </select>
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Client Notes</label>
                        <input
                          type="text"
                          value={custNotes}
                          onChange={(e) => setCustNotes(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                          placeholder="e.g. Prefers red accessories"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: FULFILLMENT & SETTINGS */}
              {wizardStep === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Operating Sub-Brand *</label>
                    <select
                      value={orderSubBrand}
                      onChange={(e) => setOrderSubBrand(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                    >
                      <option value="SAT">Sky Auto (SAT)</option>
                      <option value="GZ">GadgetZu (GZ)</option>
                      <option value="RTX">RTX Gadget (RTX)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Sales Channel *</label>
                    <select
                      value={orderSalesChannel}
                      onChange={(e) => setOrderSalesChannel(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden"
                    >
                      <option value="Direct/WhatsApp">Direct / WhatsApp</option>
                      <option value="Facebook">Facebook Inbox</option>
                      <option value="TikTok">TikTok Video Shop</option>
                      <option value="Instagram">Instagram DM</option>
                      <option value="Daraz">Daraz Mall</option>
                      <option value="CartUp">CartUp Website</option>
                      <option value="Packly">Packly Integration</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Courier Service Partner *</label>
                    <select
                      value={orderCourier}
                      onChange={(e) => setOrderCourier(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                    >
                      <option value="CarryBee (Inside Dhaka)">CarryBee (Inside Dhaka)</option>
                      <option value="Steadfast (Outside Dhaka)">Steadfast (Outside Dhaka)</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery Address *</label>
                    <textarea
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      rows={2.5}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm"
                      placeholder="Address where courier will dispatch items..."
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Order Memo / Notes</label>
                    <input
                      type="text"
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                      placeholder="Add specific delivery deadlines or gift sample logs..."
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: ITEMS SELECTION */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <CatalogItemSelection 
                    products={products}
                    orderItems={orderItems}
                    setOrderItems={setOrderItems}
                    onNext={() => setWizardStep(4)}
                  />
                </div>
              )}
              {/* STEP 4: PAYMENT OPTIONS */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Discount Amount (৳)</label>
                      <input
                        type="number"
                        min={0}
                        value={orderDiscount}
                        onChange={(e) => setOrderDiscount(e.target.value)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-800 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Delivery / Shipping Charge (৳)</label>
                      <input
                        type="number"
                        min={0}
                        value={orderShippingCharge}
                        onChange={(e) => setOrderShippingCharge(e.target.value)}
                        placeholder="0"
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm font-mono font-bold text-slate-800 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Payment Method *</label>
                      <select
                        value={orderPaymentMethod}
                        onChange={(e) => setOrderPaymentMethod(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                      >
                        <option value="Cash">Cash on Delivery</option>
                        <option value="bKash">bKash Personal / Merchant</option>
                        <option value="Nagad">Nagad Mobile Wallet</option>
                        <option value="Bank Transfer">City Bank / Eastern Bank</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Payment Status *</label>
                      <select
                        value={orderPaymentStatus}
                        onChange={(e) => setOrderPaymentStatus(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm"
                      >
                        <option value="Due">Unpaid (Full Due)</option>
                        <option value="Paid">Fully Paid</option>
                        <option value="Partial">Partial Downpayment</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">Amount Received (৳)</label>
                      <input
                        type="number"
                        value={orderAmountPaid}
                        disabled={orderPaymentStatus !== 'Partial'}
                        onChange={(e) => setOrderAmountPaid(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-mono font-bold text-slate-800 focus:outline-hidden disabled:opacity-50"
                        min={0}
                        max={orderTotal}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-900 text-white p-4 rounded-2xl font-mono text-xs space-y-2">
                    <div className="flex justify-between text-slate-300">
                      <span>Items Subtotal:</span>
                      <span>৳{orderSubtotal.toLocaleString()}</span>
                    </div>
                    { (Number(orderDiscount) || 0) > 0 && (
                      <div className="flex justify-between text-emerald-400">
                        <span>Discount:</span>
                        <span>-৳{(Number(orderDiscount) || 0).toLocaleString()}</span>
                      </div>
                    )}
                    { (Number(orderShippingCharge) || 0) > 0 && (
                      <div className="flex justify-between text-amber-300">
                        <span>Shipping Charge:</span>
                        <span>+৳{(Number(orderShippingCharge) || 0).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-white font-black text-sm border-t border-slate-800 pt-2">
                      <span>Grand Total:</span>
                      <span className="text-[#D4AF37]">৳{orderTotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300 border-t border-slate-800/60 pt-1">
                      <span>Amount Paid:</span>
                      <span className="font-bold text-emerald-400">৳{orderAmountPaid.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Remaining Balance (Due):</span>
                      <span className="font-bold text-red-400">৳{Math.max(0, orderTotal - orderAmountPaid).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: REVIEW & CONFIRM */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div className="bg-amber-50/35 border border-amber-200/40 p-4 rounded-2xl flex items-start gap-2.5 text-sm text-amber-900 leading-normal">
                    <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={16} />
                    <div>
                      <p className="font-bold">Important Confirmation Warning</p>
                      <p className="text-sm mt-0.5 text-slate-600">
                        A newly submitted order starts in the <strong>Pending</strong> state. Stock quantities will <strong>NOT</strong> be deducted from the inventory catalog until this order is explicitly confirmed in the dashboard.
                      </p>
                    </div>
                  </div>

                  {/* Summary Card */}
                  <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="font-bold text-slate-400 uppercase text-[9px] block">Client Name</span>
                        <span className="font-bold text-slate-800">{custName} ({custPhone})</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase text-[9px] block">Shipment Brand</span>
                        <span className="font-bold text-slate-800">Sky Auto ({orderSubBrand})</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase text-[9px] block">Sales Channel & Courier</span>
                        <span className="font-semibold text-slate-700">{orderSalesChannel} via {orderCourier}</span>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase text-[9px] block">Payment Ledger</span>
                        <span className="font-semibold text-slate-700">{orderPaymentMethod} ({orderPaymentStatus})</span>
                      </div>
                    </div>

                    <div className="border-t border-slate-200/60 pt-3">
                      <span className="font-bold text-slate-400 uppercase text-[9px] block mb-2">Item invoice list</span>
                      <div className="space-y-1.5 font-mono max-h-[120px] overflow-y-auto">
                        {orderItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-slate-700 truncate max-w-[200px]">{item.productName} ({item.variantLabel})</span>
                            <span className="font-bold text-slate-900">{item.qty} x ৳{item.unitPrice.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-slate-200/60 pt-3 space-y-1 font-mono text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>৳{orderSubtotal.toLocaleString()}</span>
                      </div>
                      { (Number(orderDiscount) || 0) > 0 && (
                        <div className="flex justify-between text-emerald-600 font-semibold">
                          <span>Discount:</span>
                          <span>-৳{(Number(orderDiscount) || 0).toLocaleString()}</span>
                        </div>
                      )}
                      { (Number(orderShippingCharge) || 0) > 0 && (
                        <div className="flex justify-between text-amber-700 font-semibold">
                          <span>Delivery / Shipping Charge:</span>
                          <span>+৳{(Number(orderShippingCharge) || 0).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-mono font-black text-sm pt-2 border-t border-slate-200">
                        <span className="text-slate-900">GRAND TOTAL</span>
                        <span className="text-[#D4AF37] bg-slate-950 px-3 py-1 rounded-md text-sm">৳{orderTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Modal Footer (Wizard Buttons) */}
            <div className="bg-slate-50 border-t border-slate-100 p-5 flex justify-between items-center flex-shrink-0">
              <button
                type="button"
                disabled={wizardStep === 1 || submitting}
                onClick={() => setWizardStep(prev => prev - 1)}
                className="inline-flex items-center gap-1 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-sm uppercase rounded-xl cursor-pointer disabled:opacity-50"
              >
                <ChevronLeft size={14} /> Back
              </button>

              {wizardStep === 3 ? (
                 <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Use 'Proceed to Checkout' in Cart</div>
              ) : wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => {
                    // Quick validation per step
                    if (wizardStep === 1) {
                      if (!isNewCustomer && !selectedCustomerId) {
                        alert('Please search and select an existing customer, or quick-add a new client.');
                        return;
                      }
                      if (isNewCustomer) {
                        if (!custName.trim()) {
                          alert('Customer Full Name is required.');
                          return;
                        }
                        if (!validateBdPhone(custPhone)) {
                          alert('Valid Bangladeshi Phone Number (starting with 01) is required.');
                          return;
                        }
                      }
                    }
                    if (wizardStep === 2) {
                      if (!deliveryAddress.trim()) {
                        alert('Fulfillment delivery address is required.');
                        return;
                      }
                    }
                    if (wizardStep === 3) {
                      if (orderItems.length === 0) {
                        alert('Please add at least one line item to the order list.');
                        return;
                      }
                    }
                    setWizardStep(prev => prev + 1);
                  }}
                  className="inline-flex items-center gap-1 px-5 py-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-sm uppercase rounded-xl shadow-md cursor-pointer"
                >
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handlePlaceOrderSubmit}
                  className="inline-flex items-center gap-1.5 px-6 py-2.5 bg-[#D4AF37] hover:bg-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg cursor-pointer"
                >
                  {submitting ? 'Placing Order...' : 'Submit & Place Order'}
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* EDIT ORDER FULL MODAL */}
      {showEditModal && editingOrder && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-100 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-scale-up">
            
            {/* Modal Header */}
            <div className="bg-slate-950 text-white p-5 sm:p-6 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-400 text-slate-950 rounded-xl font-bold">
                  <Edit size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black font-sans uppercase tracking-tight text-white">
                      Edit Sales Order
                    </h3>
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-md">
                      #{editingOrder.id.substring(0, 8).toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      editingOrder.status === 'Delivered' ? 'bg-emerald-500/20 text-emerald-300' :
                      editingOrder.status === 'Returned/Cancelled' ? 'bg-red-500/20 text-red-300' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {editingOrder.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Modify line items, selling prices, quantities, delivery charges, discounts, and customer details.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingOrder(null);
                }}
                className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveEditedOrder} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {error && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs flex items-center gap-2 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* SECTION 1: Customer & Fulfillment Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Details Card */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 pb-1 border-b border-slate-200/60">
                    <User size={13} className="text-amber-500" />
                    Customer Recipient Info
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-semibold text-slate-800"
                      placeholder="e.g. Shakib Al Hasan"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      value={editCustomerPhone}
                      onChange={(e) => setEditCustomerPhone(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-mono font-bold text-slate-800"
                      placeholder="01XXXXXXXXX"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Delivery Address *</label>
                    <textarea
                      required
                      rows={2}
                      value={editDeliveryAddress}
                      onChange={(e) => setEditDeliveryAddress(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 text-slate-800 leading-normal"
                      placeholder="House, Road, Area, District"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Order Notes / Instructions</label>
                    <input
                      type="text"
                      value={editOrderNotes}
                      onChange={(e) => setEditOrderNotes(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-hidden focus:border-amber-400 text-slate-600"
                      placeholder="e.g. Call before delivery"
                    />
                  </div>
                </div>

                {/* Logistics & Fulfillment Card */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-600 pb-1 border-b border-slate-200/60">
                    <Truck size={13} className="text-amber-500" />
                    Logistics & Channel Info
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Sub-Brand *</label>
                      <select
                        value={editSubBrand}
                        onChange={(e) => setEditSubBrand(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-bold text-slate-800"
                      >
                        <option value="SAT">SAT (Smart & Tech)</option>
                        <option value="GZ">GZ (Gadget Zone)</option>
                        <option value="RTX">RTX (Retail X)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Sales Channel *</label>
                      <select
                        value={editSalesChannel}
                        onChange={(e) => setEditSalesChannel(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-semibold text-slate-800"
                      >
                        <option value="Facebook">Facebook</option>
                        <option value="TikTok">TikTok</option>
                        <option value="Instagram">Instagram</option>
                        <option value="Daraz">Daraz</option>
                        <option value="CartUp">CartUp</option>
                        <option value="Packly">Packly</option>
                        <option value="Direct/WhatsApp">Direct / WhatsApp</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Courier Partner *</label>
                    <select
                      value={editCourier}
                      onChange={(e) => setEditCourier(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-semibold text-slate-800"
                    >
                      <option value="CarryBee (Inside Dhaka)">CarryBee (Inside Dhaka)</option>
                      <option value="Steadfast (Outside Dhaka)">Steadfast (Outside Dhaka)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Courier Tracking Code</label>
                    <input
                      type="text"
                      value={editCourierTrackingNumber}
                      onChange={(e) => setEditCourierTrackingNumber(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-amber-400 font-mono font-bold text-slate-800"
                      placeholder="e.g. CB-893420 / STF-1934"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: Order Items & Pricing Table (Core Feature) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-amber-500" />
                    <h4 className="font-black text-sm text-slate-900 uppercase tracking-tight">
                      Order Items & Price Customization
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500">
                    {editItems.length} {editItems.length === 1 ? 'item' : 'items'} in order
                  </span>
                </div>

                {/* Items List Table */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-[11px] font-mono font-black uppercase text-slate-600 tracking-wider border-b border-slate-200">
                        <th className="py-2.5 px-3">Product & Variant</th>
                        <th className="py-2.5 px-3 text-center w-36">Unit Price (৳)</th>
                        <th className="py-2.5 px-3 text-center w-32">Qty</th>
                        <th className="py-2.5 px-3 text-right w-28">Subtotal</th>
                        <th className="py-2.5 px-2 text-center w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {editItems.map((item, idx) => {
                        const lineTotal = Number(item.unitPrice || 0) * Number(item.qty || 1);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900 leading-tight">{item.productName}</p>
                              <span className="text-xs text-slate-500 font-mono">
                                Variant: <span className="text-amber-700 font-semibold">{item.variantLabel}</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">৳</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={item.unitPrice}
                                  onChange={(e) => handleUpdateEditItemPrice(idx, parseFloat(e.target.value) || 0)}
                                  className="w-full bg-white border border-slate-200 rounded-lg py-1 pl-6 pr-2 text-right text-xs font-mono font-black text-slate-900 focus:outline-hidden focus:border-amber-400"
                                  title="Edit unit selling price"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="inline-flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateEditItemQty(idx, item.qty - 1)}
                                  disabled={item.qty <= 1}
                                  className="px-2 py-1 hover:bg-slate-100 text-slate-600 disabled:opacity-30 cursor-pointer font-bold text-xs"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.qty}
                                  onChange={(e) => handleUpdateEditItemQty(idx, parseInt(e.target.value) || 1)}
                                  className="w-10 text-center py-1 text-xs font-mono font-bold text-slate-900 border-x border-slate-200 focus:outline-hidden"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateEditItemQty(idx, item.qty + 1)}
                                  className="px-2 py-1 hover:bg-slate-100 text-slate-600 cursor-pointer font-bold text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                              ৳{lineTotal.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveEditItem(idx)}
                                title="Remove line item"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Quick Add Extra Products to Order */}
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1">
                      <Plus size={13} className="text-amber-600" />
                      Add Product to Order (অর্ডারে নতুন পণ্য যোগ করুন)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Select Product</label>
                      <select
                        value={editAddItemProductId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setEditAddItemProductId(pid);
                          const prod = products.find(p => p.id === pid);
                          if (prod) {
                            setEditAddItemPrice(prod.sellingPrice || 0);
                            if (prod.variants && prod.variants.length > 0) {
                              setEditAddItemVariantId(prod.variants[0].id);
                            } else {
                              setEditAddItemVariantId('');
                            }
                          } else {
                            setEditAddItemVariantId('');
                            setEditAddItemPrice(0);
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs focus:outline-hidden focus:border-amber-400 text-slate-800"
                      >
                        <option value="">-- Choose Product --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku || 'No SKU'})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Variant</label>
                      <select
                        value={editAddItemVariantId}
                        onChange={(e) => setEditAddItemVariantId(e.target.value)}
                        disabled={!editAddItemProductId}
                        className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs focus:outline-hidden focus:border-amber-400 text-slate-800 disabled:opacity-50"
                      >
                        <option value="">-- Choose Variant --</option>
                        {products.find(p => p.id === editAddItemProductId)?.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.color || ''} {v.model || ''} (Stock: {v.stock})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Unit Price (৳)</label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editAddItemPrice}
                        onChange={(e) => setEditAddItemPrice(parseFloat(e.target.value) || 0)}
                        placeholder="৳ Price"
                        className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-amber-400"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-0.5">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={editAddItemQty}
                        onChange={(e) => setEditAddItemQty(parseInt(e.target.value) || 1)}
                        className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-2 text-xs font-mono font-bold text-slate-900 text-center focus:outline-hidden focus:border-amber-400"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddEditItemToOrder}
                        disabled={!editAddItemProductId || !editAddItemVariantId}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] disabled:opacity-40 font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus size={13} /> Add Line
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Financial & Payment Recalculations */}
              <div className="bg-slate-950 text-white p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-mono font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} /> Financial Summary & Billing
                  </span>
                  <span className="text-xs font-mono text-slate-400">All amounts in BDT (৳)</span>
                </div>

                {(() => {
                  const subtotal = editItems.reduce((acc, it) => acc + (Number(it.unitPrice || 0) * Number(it.qty || 1)), 0);
                  const ship = parseFloat(editShippingCharge) || 0;
                  const disc = parseFloat(editDiscountAmount) || 0;
                  const paid = parseFloat(editAmountPaid) || 0;
                  const grandTotal = Math.max(0, subtotal + ship - disc);
                  const due = Math.max(0, grandTotal - paid);

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Left: Calculation inputs */}
                      <div className="space-y-2.5 font-mono text-xs">
                        <div className="flex justify-between items-center text-slate-300">
                          <span>Items Subtotal:</span>
                          <strong className="text-white text-sm">৳{subtotal.toLocaleString()}</strong>
                        </div>

                        <div className="flex justify-between items-center gap-2">
                          <label className="text-slate-300">Delivery / Shipping Charge (৳):</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editShippingCharge}
                            onChange={(e) => setEditShippingCharge(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-right text-white font-mono font-bold focus:outline-hidden focus:border-amber-400 text-xs"
                          />
                        </div>

                        <div className="flex justify-between items-center gap-2">
                          <label className="text-slate-300">Special Discount (৳):</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editDiscountAmount}
                            onChange={(e) => setEditDiscountAmount(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-right text-emerald-400 font-mono font-bold focus:outline-hidden focus:border-emerald-400 text-xs"
                          />
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-slate-800 font-sans">
                          <span className="text-xs uppercase font-bold text-slate-300">Grand Total Amount:</span>
                          <span className="text-base font-black text-amber-400 font-mono">
                            ৳{grandTotal.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Right: Payment status and collection */}
                      <div className="space-y-2.5 font-mono text-xs border-t md:border-t-0 md:border-l border-slate-800 md:pl-5 pt-3 md:pt-0">
                        <div className="flex justify-between items-center gap-2">
                          <label className="text-slate-300">Amount Paid (৳):</label>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editAmountPaid}
                            onChange={(e) => setEditAmountPaid(e.target.value)}
                            className="w-28 bg-slate-900 border border-slate-800 rounded-lg py-1 px-2 text-right text-emerald-400 font-mono font-bold focus:outline-hidden focus:border-emerald-400 text-xs"
                          />
                        </div>

                        <div className="flex justify-between items-center text-slate-300">
                          <span>Outstanding Due (৳):</span>
                          <strong className={`text-sm font-mono font-black ${due === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ৳{due.toLocaleString()}
                          </strong>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-sans font-bold mb-1">Payment Method</label>
                            <select
                              value={editPaymentMethod}
                              onChange={(e) => setEditPaymentMethod(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs text-slate-200 font-sans focus:outline-hidden focus:border-amber-400"
                            >
                              <option value="Cash">Cash</option>
                              <option value="bKash">bKash (MFS)</option>
                              <option value="Nagad">Nagad (MFS)</option>
                              <option value="Bank Transfer">Bank Transfer</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] uppercase text-slate-400 font-sans font-bold mb-1">Payment Status</label>
                            <select
                              value={editPaymentStatus}
                              onChange={(e) => setEditPaymentStatus(e.target.value as any)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-xs font-sans font-bold text-amber-400 focus:outline-hidden focus:border-amber-400"
                            >
                              <option value="Paid">Paid (পরিশোধিত)</option>
                              <option value="Partial">Partial (আংশিক)</option>
                              <option value="Due">Due (বকেয়া)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingOrder(null);
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>Saving Changes...</>
                  ) : (
                    <>
                      <Check size={15} /> Save Changes (পরিবর্তন সংরক্ষণ করুন)
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    {/* Payment Record Modal */}
    {showPaymentModal && selectedOrder && (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
              <DollarSign size={16} className="text-[#D4AF37]" />
              Record Cash Collection
            </h3>
            <button 
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentAmount('');
              }} 
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-2xl space-y-1.5 text-sm text-slate-600 border border-slate-100">
              <div className="flex justify-between">
                <span>Customer:</span>
                <strong className="text-slate-800">{selectedOrder.customerName}</strong>
              </div>
              <div className="flex justify-between">
                <span>Outstanding Due:</span>
                <strong className="text-red-600 font-mono">৳{selectedOrder.amountDue.toLocaleString()}</strong>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-600">Collection Amount (৳) *</label>
              <input
                type="number"
                step="any"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                max={selectedOrder.amountDue}
                min="1"
                placeholder={`Max ৳${selectedOrder.amountDue}`}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-sm focus:outline-hidden focus:border-amber-400 text-slate-800 font-mono font-bold"
              />
            </div>

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
                  setShowPaymentModal(false);
                  setPaymentAmount('');
                }}
                className="py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={paymentSubmitting}
                className="py-2.5 px-5 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] hover:text-white text-sm font-bold rounded-xl shadow-md cursor-pointer flex items-center gap-1.5"
              >
                {paymentSubmitting ? 'Recording...' : 'Submit Payment'}
                <ChevronRight size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {confirmDialog?.isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
        <div className="bg-white rounded-2xl border border-slate-150 p-6 max-w-sm w-full space-y-4 shadow-xl">
          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-slate-950 font-sans uppercase tracking-wide">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed font-sans">{confirmDialog.message}</p>
          </div>
          <div className="flex gap-2.5 justify-end">
            <button
              type="button"
              onClick={() => setConfirmDialog(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                confirmDialog.onConfirm();
              }}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl text-sm font-bold transition-all shadow-md cursor-pointer"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Delete Payment Entry Confirmation Modal */}
    {paymentToDelete && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
        <div className="bg-white rounded-2xl border border-slate-150 p-6 max-w-sm w-full space-y-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl shrink-0">
              <AlertCircle size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                Delete Payment Entry
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete this payment record of <strong className="text-slate-900">৳{paymentToDelete.amount.toLocaleString()}</strong> ({paymentToDelete.method})? The customer's due balance will be restored automatically.
              </p>
            </div>
          </div>
          <div className="flex gap-2.5 justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPaymentToDelete(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeletePaymentEntry}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 size={12} />
              Delete Entry
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}
