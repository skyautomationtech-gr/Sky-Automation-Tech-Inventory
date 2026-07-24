import React, { useState, useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { 
  Search, 
  Receipt, 
  Trash2, 
  FileText, 
  AlertCircle, 
  X, 
  CheckCircle, 
  ArrowUpDown, 
  ChevronRight, 
  Download, 
  Printer,
  ShieldAlert, 
  Eraser, 
  Check 
} from 'lucide-react';
import { Invoice, UserProfile, Order, CompanySettings } from '../types';
import { getInvoices, voidInvoiceRecord, getOrders, getCompanySettings } from '../firebase/db';
import { getBrandLogo, BRAND_NAMES, getSubBrandCompanyInfo } from '../utils/brandLogos';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface InvoiceManagementProps {
  user: UserProfile | null;
  requireCheckIn?: () => boolean;
}

export default function InvoiceManagement({ user, requireCheckIn }: InvoiceManagementProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [subBrandFilter, setSubBrandFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [voidFilter, setVoidFilter] = useState('all'); // all, active, voided
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [rolePermissions, setRolePermissions] = useState<any>(null);

  // Signature States
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetchData();
    fetchRolePermissions();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const invoicesData = await getInvoices();
      const ordersData = await getOrders();
      const settingsData = await getCompanySettings();
      setCompanySettings(settingsData);
      setInvoices(invoicesData || []);
      setOrders(ordersData || []);
    } catch (err: any) {
      console.error('InvoiceManagement: Error fetching data:', err);
      setError('Could not retrieve invoices. Verify your connection.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRolePermissions = async () => {
    try {
      const docRef = doc(db, 'settings', 'rolePermissions');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setRolePermissions(docSnap.data());
      }
    } catch (err) {
      console.error('Error fetching role permissions:', err);
    }
  };

  const hasVoidPermission = () => {
    if (user?.role === 'superadmin') return true;
    const override = user?.permissionOverrides?.voidInvoice;
    if (override === true) return true;
    if (override === false) return false;
    
    if (user?.role === 'admin') {
      return rolePermissions?.admin?.voidInvoice === true;
    }
    if (user?.role === 'staff') {
      return rolePermissions?.staff?.voidInvoice === true;
    }
    return false;
  };

  // Filter & Search Invoices
  const filteredInvoices = invoices.filter(inv => {
    const queryLower = searchQuery.toLowerCase();
    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(queryLower) ||
      inv.customerName.toLowerCase().includes(queryLower) ||
      inv.customerPhone.includes(queryLower) ||
      inv.orderId.toLowerCase().includes(queryLower) ||
      (inv.customerId && inv.customerId.toLowerCase().includes(queryLower));

    const matchesSubBrand = subBrandFilter === '' || inv.subBrand === subBrandFilter;
    const matchesPayment = paymentStatusFilter === '' || inv.paymentStatus === paymentStatusFilter;
    
    let matchesVoid = true;
    if (voidFilter === 'active') matchesVoid = !inv.voided;
    if (voidFilter === 'voided') matchesVoid = inv.voided;

    return matchesSearch && matchesSubBrand && matchesPayment && matchesVoid;
  }).sort((a, b) => {
    if (sortOrder === 'desc') {
      return b.generatedAt - a.generatedAt;
    } else {
      return a.generatedAt - b.generatedAt;
    }
  });

  const handleVoidInvoice = async () => {
    if (requireCheckIn && !requireCheckIn()) return;
    if (!selectedInvoice) return;
    if (!hasVoidPermission()) {
      setError('You do not have administrative clearance to void invoices.');
      return;
    }

    if (!voidReason.trim()) {
      setError('Please provide a void reason for the audit logs.');
      return;
    }

    setError('');
    setSuccess('');
    try {
      await voidInvoiceRecord(
        selectedInvoice.id,
        voidReason.trim(),
        user?.id || 'sys',
        user?.name || 'Operator'
      );
      setSuccess(`Invoice ${selectedInvoice.invoiceNumber} has been successfully voided.`);
      setShowVoidModal(false);
      setVoidReason('');
      
      // Update local state
      setSelectedInvoice(prev => prev ? { 
        ...prev, 
        voided: true, 
        voidedReason: voidReason.trim(), 
        voidedBy: user?.name || 'Operator', 
        voidedAt: Date.now() 
      } : null);
      
      await fetchData();
    } catch (err: any) {
      console.error('Void invoice failed:', err);
      setError('Failed to void invoice. Please try again.');
    }
  };

  // Signature Pad Drawing functions
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Scale factor to map client coords to actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    ctx.moveTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    ctx.lineTo((clientX - rect.left) * scaleX, (clientY - rect.top) * scaleY);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const preparePrintSignature = () => {
    if (canvasRef.current) {
      const signatureImgData = canvasRef.current.toDataURL('image/png');
      const printSignatureImg = document.getElementById('print-signature-img') as HTMLImageElement;
      const fallbackSig = document.getElementById('fallback-signature');
      if (printSignatureImg && signatureImgData && signatureImgData.length > 100) {
        printSignatureImg.src = signatureImgData;
        printSignatureImg.style.display = 'block';
        if (fallbackSig) fallbackSig.style.display = 'none';
      }
    }
  };

  const handlePrint = () => {
    preparePrintSignature();
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // PDF Download using html2canvas + jsPDF
  const downloadPDF = async (invoice: Invoice) => {
    const element = document.getElementById('invoice-print-area');
    if (!element) return;
    
    try {
      setLoading(true);
      preparePrintSignature();

      // Briefly wait to ensure canvas signature renders onto print image
      await new Promise(resolve => setTimeout(resolve, 250));

      const canvas = await html2canvas(element, {
        scale: 2, // 2x scale for crisp print quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 794, // Standard A4 pixel width at 96 DPI
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      if (imgHeight <= pdfHeight) {
        // Fits single page perfectly
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
      } else {
        // Multi-page slicing for large order lists
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;

        while (heightLeft > 5) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
        }
      }
      
      pdf.save(`${invoice.invoiceNumber}.pdf`);
      setSuccess('PDF generated and downloaded successfully!');
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setError(`PDF Generation Error: ${err instanceof Error ? err.message : 'Unknown error occurred'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 animate-fade-in text-sm font-semibold">
          <AlertCircle size={16} className="flex-shrink-0" />
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

      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-sm font-mono font-bold text-amber-500 uppercase tracking-widest">Billing Operations</span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <Receipt className="text-slate-900" size={24} />
            Invoice Desk
          </h1>
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">
            Manage auto-generated sub-brand invoices, download official black-and-white print copies, or void transaction receipts.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="w-full md:flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text"
              placeholder="Search by Invoice #, Phone, Name, or Order ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Sub brand Filter */}
          <div className="w-full md:w-44">
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden focus:border-amber-400"
            >
              <option value="">All Brands</option>
              <option value="SAT">Sky Auto (SAT)</option>
              <option value="GZ">GadgetZu (GZ)</option>
              <option value="RTX">RTX Gadget (RTX)</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div className="w-full md:w-44">
            <select
              value={paymentStatusFilter}
              onChange={(e) => setPaymentStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden focus:border-amber-400"
            >
              <option value="">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Due">Due</option>
            </select>
          </div>

          {/* Void Status Filter */}
          <div className="w-full md:w-44">
            <select
              value={voidFilter}
              onChange={(e) => setVoidFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-sm text-slate-700 focus:outline-hidden focus:border-amber-400"
            >
              <option value="active">Active Invoices</option>
              <option value="voided">Voided Invoices</option>
              <option value="all">All Invoices</option>
            </select>
          </div>

          {/* Sort button */}
          <button
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-2xl cursor-pointer"
            title="Sort direction"
          >
            <ArrowUpDown size={16} />
          </button>
        </div>
      </div>

      {/* Invoices List */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {loading && invoices.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400 font-mono">
            Fetching active invoice registers...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={32} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm font-semibold">No invoices found matching the current criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Invoice #</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Sub-Brand</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Amount Due</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="py-4 px-6 text-sm font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-right text-sm font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {filteredInvoices.map((inv) => (
                  <tr 
                    key={inv.id} 
                    className={`hover:bg-slate-50/50 transition-colors ${inv.voided ? 'bg-slate-50/30' : ''}`}
                  >
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-800">
                      {inv.invoiceNumber}
                      {inv.voided && (
                        <span className="ml-2 inline-block bg-red-100 text-red-700 text-[8px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wide">
                          Void
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-semibold text-slate-700">
                      <div>{inv.customerName}</div>
                      <div className="text-sm text-slate-400 font-mono">{inv.customerPhone}</div>
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`inline-block text-[9px] font-mono uppercase px-2 py-0.5 rounded-full font-bold ${
                        inv.subBrand === 'SAT' 
                          ? 'bg-amber-100 text-amber-800' 
                          : inv.subBrand === 'GZ' 
                            ? 'bg-teal-100 text-teal-800' 
                            : 'bg-orange-100 text-orange-800'
                      }`}>
                        {inv.subBrand}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-slate-400 font-mono">
                      {new Date(inv.generatedAt).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-700">
                      ৳{inv.amountDue.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-6 font-mono font-black text-slate-900">
                      ৳{inv.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-6">
                      <span className={`inline-block text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        inv.voided
                          ? 'bg-slate-200 text-slate-600'
                          : inv.paymentStatus === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : inv.paymentStatus === 'Partial'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                      }`}>
                        {inv.voided ? 'VOIDED' : inv.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <button
                          onClick={() => setSelectedInvoice(inv)}
                          className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors cursor-pointer"
                          title="View on screen / print A4"
                        >
                          <FileText size={15} />
                        </button>
                        <button
                          onClick={() => downloadPDF(inv)}
                          disabled={loading}
                          className="p-1.5 hover:bg-slate-100 text-[#D4AF37] hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
                          title="Download PDF"
                        >
                          <Download size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail modal - On screen printable view */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header Controls */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 font-mono">Invoice Desk: {selectedInvoice.invoiceNumber}</h3>
                <p className="text-sm text-slate-400 mt-0.5">Official A4 Document Copy and Signature Console</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Void action */}
                {!selectedInvoice.voided && (
                  <button
                    onClick={() => {
                      if (!hasVoidPermission()) {
                        alert('You do not have administrative privilege to void invoices.');
                        return;
                      }
                      setShowVoidModal(true);
                    }}
                    className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-bold px-3 py-2 rounded-xl border border-red-200/50 transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Void Invoice
                  </button>
                )}

                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Printer size={13} />
                  Print Invoice
                </button>

                <button
                  onClick={() => downloadPDF(selectedInvoice)}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] text-sm font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Download size={13} />
                  Download PDF
                </button>
                <button
                  onClick={() => {
                    setSelectedInvoice(null);
                    setShowVoidModal(false);
                  }}
                  className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Content - scrollable */}
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              
              {/* Void Badge Indicator */}
              {selectedInvoice.voided && (
                <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-2xl flex items-start gap-3">
                  <ShieldAlert className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-wider">This Invoice Has Been VOIDED</h4>
                    <p className="text-sm leading-relaxed mt-1 text-red-600">
                      <strong>Void Reason:</strong> {selectedInvoice.voidedReason || 'N/A'} <br />
                      <strong>Voided By:</strong> {selectedInvoice.voidedBy || 'System'} | <strong>Voided At:</strong> {new Date(selectedInvoice.voidedAt || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}

              {/* On-screen signature pad component (for interactive signing before PDF generate) */}
              {!selectedInvoice.voided && (
                <div className="bg-white p-4 rounded-3xl border border-slate-200/60 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                        <Eraser size={14} className="text-amber-500" />
                        Interactive Digital Signature Pad
                      </h4>
                      <p className="text-[9px] text-slate-400 mt-0.5">Optionally draw the operator/approver signature here. It will render onto the bottom of the PDF before download.</p>
                    </div>
                    <button 
                      onClick={clearSignature}
                      className="text-sm font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1 px-2.5 transition-all cursor-pointer"
                    >
                      Clear Pad
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <canvas 
                      ref={canvasRef}
                      width={600}
                      height={140}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                      className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-crosshair max-w-full"
                      style={{ height: '100px', width: '400px' }}
                    />
                  </div>
                </div>
              )}

              {/* A4 PRINT CONTAINER (STRICT BLACK AND WHITE FOR PRINTING) */}
              {(() => {
                const subBrandInfo = getSubBrandCompanyInfo(selectedInvoice.subBrand, companySettings);
                const relatedOrder = orders.find(o => o.id === selectedInvoice.orderId);
                const itemSubtotal = selectedInvoice.items.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
                const discountAmt = selectedInvoice.discountAmount ?? relatedOrder?.discountAmount ?? 0;
                const shippingAmt = selectedInvoice.shippingCharge ?? relatedOrder?.shippingCharge ?? 0;
                const grandTotal = Math.max(0, itemSubtotal - discountAmt + shippingAmt);
                const paidAmt = selectedInvoice.amountPaid ?? relatedOrder?.amountPaid ?? 0;
                const dueAmt = Math.max(0, grandTotal - paidAmt);

                return (
                  <div className="bg-[#ffffff] max-w-[210mm] mx-auto min-h-[297mm] text-[#111111] font-sans relative overflow-hidden box-border" id="invoice-print-area" style={{ width: '210mm', boxSizing: 'border-box' }}>
                    {/* Embedded font for printing and safe fallback colors */}
                    <style dangerouslySetInnerHTML={{__html: `
                      @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Inter:wght@400;600;700&display=swap');
                      #invoice-print-area { 
                        font-family: 'Inter', sans-serif; 
                        color: #111111;
                        background-color: #ffffff;
                      }
                      .cursive-font { font-family: 'Dancing Script', cursive; }
                    `}} />

                    <div className="p-8 space-y-5">
                      {/* HEADER */}
                      <div className="flex justify-between items-start">
                        {/* Left: Logo & Address */}
                        <div className="flex gap-4 items-start">
                          <div className="w-14 h-14 bg-[#ffffff] border border-[#eeeeee] rounded-xl flex items-center justify-center p-1 overflow-hidden shrink-0">
                            <img 
                              src={subBrandInfo.logoUrl} 
                              alt={subBrandInfo.companyName} 
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <h1 className="text-xl font-extrabold text-[#111111] m-0 leading-none uppercase">
                              {subBrandInfo.companyName}
                            </h1>
                            <p className="text-[#888888] text-xs mt-1">{subBrandInfo.tagline}</p>
                            
                            <div className="mt-3 space-y-1 text-xs text-[#555555]">
                              <div className="flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                {subBrandInfo.address}
                              </div>
                              <div className="flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                {subBrandInfo.phone}
                              </div>
                              <div className="flex items-center gap-2">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                {subBrandInfo.email}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Title & Pill */}
                        <div className="text-right flex flex-col items-end gap-2">
                          <div className="text-3xl font-bold text-[#111111]">INVOICE</div>
                          <div className="bg-[#111111] text-[#ffffff] text-[10px] uppercase font-bold px-3 py-1.5 rounded-full">
                            Thank you for your business
                          </div>
                        </div>
                      </div>

                      {/* INVOICE META BOX */}
                      <div className="border border-[#cccccc] rounded-lg overflow-hidden">
                        <div className="bg-[#111111] text-[#ffffff] px-4 py-2 font-bold text-sm">
                          INVOICE #{selectedInvoice.invoiceNumber}
                        </div>
                        <div className="bg-[#ffffff] px-4 py-3 grid grid-cols-4 gap-4 text-sm divide-x divide-[#eeeeee]">
                          <div>
                            <div className="text-[10px] text-[#888888] font-semibold uppercase mb-1">Invoice Date</div>
                            <div className="font-bold text-[#111111]">{new Date(selectedInvoice.generatedAt).toLocaleDateString('en-GB')}</div>
                          </div>
                          <div className="pl-4">
                            <div className="text-[10px] text-[#888888] font-semibold uppercase mb-1">Due Date</div>
                            <div className="font-bold text-[#111111]">{new Date(selectedInvoice.generatedAt).toLocaleDateString('en-GB')}</div>
                          </div>
                          <div className="pl-4">
                            <div className="text-[10px] text-[#888888] font-semibold uppercase mb-1">Customer ID</div>
                            <div className="font-bold text-[#111111]">{selectedInvoice.customerId || 'CUS-WALKIN'}</div>
                          </div>
                          <div className="pl-4">
                            <div className="text-[10px] text-[#888888] font-semibold uppercase mb-1">Payment Terms</div>
                            <div className="font-bold text-[#111111]">Cash on Delivery</div>
                          </div>
                        </div>
                      </div>

                      {/* BILL TO / SHIP TO CARDS */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* Bill To */}
                        <div className="border border-[#cccccc] rounded-lg p-4 relative mt-2">
                          <div className="absolute -top-3 left-4 bg-[#111111] text-[#ffffff] text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            BILL TO
                          </div>
                          <div className="mt-2">
                            <div className="font-bold text-[#111111] text-sm mb-1">{selectedInvoice.customerName}</div>
                            <div className="text-xs text-[#555555] mb-1">{selectedInvoice.customerPhone}</div>
                            <div className="text-xs text-[#555555] max-w-[200px] leading-relaxed">
                              {relatedOrder?.deliveryAddress || 'No Address Listed'}
                            </div>
                          </div>
                        </div>
                        {/* Ship To */}
                        <div className="border border-[#cccccc] rounded-lg p-4 relative mt-2">
                          <div className="absolute -top-3 left-4 bg-[#111111] text-[#ffffff] text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg>
                            SHIP TO
                          </div>
                          <div className="mt-2">
                            <div className="font-bold text-[#111111] text-sm mb-1">{selectedInvoice.customerName}</div>
                            <div className="text-xs text-[#555555] mb-1">{selectedInvoice.customerPhone}</div>
                            <div className="text-xs text-[#555555] max-w-[200px] leading-relaxed">
                              {relatedOrder?.deliveryAddress || 'No Address Listed'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ITEMS TABLE */}
                      <div className="w-full text-sm rounded-lg overflow-hidden border border-[#cccccc]">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#111111] text-[#ffffff]">
                              <th className="py-2 px-3 font-bold w-10 text-center text-xs uppercase">SL</th>
                              <th className="py-2 px-3 font-bold text-xs uppercase">Item description</th>
                              <th className="py-2 px-3 font-bold text-xs uppercase">SKU</th>
                              <th className="py-2 px-3 font-bold text-center w-16 text-xs uppercase">Qty</th>
                              <th className="py-2 px-3 font-bold text-right w-24 text-xs uppercase">Price</th>
                              <th className="py-2 px-3 font-bold text-right w-24 text-xs uppercase">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInvoice.items.map((item, idx) => (
                              <tr key={idx} className="border-t border-[#eeeeee]" style={{ backgroundColor: idx % 2 === 0 ? '#f9f9f9' : '#ffffff' }}>
                                <td className="py-3 px-3 text-center text-xs text-[#555555]">{idx + 1}</td>
                                <td className="py-3 px-3">
                                  <div className="flex gap-3 items-center">
                                    <div>
                                      <div className="font-bold text-[#111111] text-xs leading-tight">{item.productName}</div>
                                      {item.variantLabel && <div className="text-[10px] text-[#888888] mt-0.5">{item.variantLabel}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-xs text-[#555555]">{item.productId?.substring(0, 6).toUpperCase() || 'N/A'}</td>
                                <td className="py-3 px-3 text-center font-bold text-[#111111] text-xs">{item.qty}</td>
                                <td className="py-3 px-3 text-right text-xs text-[#555555]">৳{item.unitPrice.toLocaleString()}</td>
                                <td className="py-3 px-3 text-right font-bold text-[#111111] text-xs">৳{(item.qty * item.unitPrice).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* NOTE/SIGNATURE + TOTALS */}
                      <div className="flex justify-between items-start pt-2 gap-6">
                        {/* Left: Notes, History and Signature */}
                        <div className="flex-1 space-y-4">
                          {relatedOrder?.paymentHistory && relatedOrder.paymentHistory.length > 0 && (
                            <div className="border border-[#cccccc] rounded-lg p-3">
                              <div className="text-[10px] text-[#111111] font-bold uppercase mb-2">Payment History Ledger</div>
                              <table className="w-full text-left text-[10px]">
                                <thead>
                                  <tr className="border-b border-[#eeeeee] text-[#888888]">
                                    <th className="pb-1 font-normal">Date</th>
                                    <th className="pb-1 font-normal">Method</th>
                                    <th className="pb-1 font-normal text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {relatedOrder.paymentHistory.map((ph, idx) => (
                                    <tr key={idx} className="border-b border-[#f5f5f5] last:border-0">
                                      <td className="py-1 text-[#555555]">{new Date(ph.date).toLocaleDateString('en-GB')}</td>
                                      <td className="py-1 text-[#555555] font-semibold">{ph.method}</td>
                                      <td className="py-1 text-[#111111] font-bold text-right">৳{ph.amount.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td colSpan={3} className="pt-2 text-right">
                                      {dueAmt === 0 ? (
                                        <span className="text-[#047857] font-bold text-[10px]">FULLY SETTLED</span>
                                      ) : (
                                        <span className="text-[#dc2626] font-bold text-[10px]">DUE: ৳{dueAmt.toLocaleString()}</span>
                                      )}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}
                          <div className="border border-[#cccccc] rounded-lg p-3">
                            <div className="text-[10px] text-[#888888] font-bold uppercase mb-1">Terms & Conditions</div>
                            <div className="text-[10px] text-[#555555] leading-relaxed">
                              {subBrandInfo.invoiceTerms}
                            </div>
                          </div>
                          <div className="w-48 text-center pt-4 relative">
                            {/* Interactive Signature overlay if in print view */}
                            <div className="mb-1 h-12 flex items-end justify-center relative">
                              <img 
                                id="print-signature-img" 
                                alt="Signature preview" 
                                className="h-10 object-contain hidden relative z-10" 
                                style={{ mixBlendMode: 'multiply' }}
                              />
                              <div className="cursive-font text-2xl text-[#111111]" id="fallback-signature">{subBrandInfo.companyName}</div>
                            </div>
                            <div className="border-t border-[#111111] pt-1 text-[10px] font-bold text-[#111111] uppercase tracking-wider">
                              Authorised Signature
                            </div>
                          </div>
                        </div>
                        
                        {/* Right: Totals */}
                        <div className="w-64">
                          <div className="space-y-2 p-3 bg-[#fafafa] rounded-lg border border-[#eeeeee]">
                            <div className="flex justify-between text-xs">
                              <span className="text-[#666666] font-bold">Subtotal</span>
                              <span className="text-[#111111] font-bold">৳{itemSubtotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs text-[#047857]">
                              <span className="font-bold">Discount</span>
                              <span className="font-bold">{discountAmt > 0 ? `-৳${discountAmt.toLocaleString()}` : '৳0'}</span>
                            </div>
                            <div className="flex justify-between text-xs text-[#334155]">
                              <span className="font-bold">Shipping Charge</span>
                              <span className="font-bold">{shippingAmt > 0 ? `+৳${shippingAmt.toLocaleString()}` : '৳0'}</span>
                            </div>
                            <div className="flex justify-between text-xs border-t border-[#e0e0e0] pt-2">
                              <span className="text-[#666666] font-bold">Total Paid</span>
                              <span className="text-[#047857] font-bold">৳{paidAmt.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs text-[#dc2626] font-bold">
                              <span>Balance Due</span>
                              <span>৳{dueAmt.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="bg-[#111111] text-[#ffffff] flex justify-between items-center p-3 rounded-lg font-bold mt-2">
                            <span className="text-xs uppercase tracking-wider">Grand Total</span>
                            <span className="text-base font-extrabold">৳{grandTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* BOTTOM: PAYMENT METHODS & FOOTER */}
                      <div className="pt-4 flex justify-between items-end gap-6">
                        <div className="bg-[#111111] rounded-lg p-4 flex-1 flex justify-between items-center text-[#ffffff]">
                          <div className="space-y-2">
                            <div className="text-[11px] uppercase font-bold text-[#aaaaaa]">Payment Methods</div>
                            <div className="space-y-1 text-xs text-[#dddddd]">
                              <div className="flex items-center gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                                bKash / Nagad: <span className="font-bold ml-1 text-[#ffffff]">{subBrandInfo.bkashNagadPhone}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                Bank: <span className="font-bold ml-1 text-[#ffffff]">{subBrandInfo.bankDetails}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-[#aaaaaa] italic pt-1.5 border-t border-[#333333] mt-2">
                              Please send payment slip to WhatsApp: {subBrandInfo.whatsappContact}
                            </div>
                          </div>
                          
                          {/* QR Box within payment area */}
                          <div className="bg-[#ffffff] p-2 rounded flex flex-col items-center gap-1 shrink-0">
                            <QRCodeSVG 
                              value={JSON.stringify({ 
                                inv: selectedInvoice.invoiceNumber, 
                                amt: grandTotal 
                              })} 
                              size={60} 
                              level="M" 
                              includeMargin={false}
                              fgColor="#111111"
                              bgColor="#ffffff"
                            />
                            <div className="cursive-font text-[10px] text-[#111111] leading-none">Scan to pay</div>
                          </div>
                        </div>

                        <div className="text-right w-48 mb-1 shrink-0">
                          <div className="cursive-font text-3xl text-[#111111] mb-1">Thank you!</div>
                          <div className="text-[9px] font-bold text-[#111111] uppercase">For your trust and support</div>
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Void Reason Dialog Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#ffffff] rounded-3xl w-full max-w-md p-6 shadow-2xl border border-[#eeeeee] space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <ShieldAlert className="text-red-500" size={16} />
                Void Invoice Audit Entry
              </h3>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            
            <p className="text-sm text-slate-500 leading-relaxed">
              This action is immutable. Voiding this invoice will log your operator profile, flag this invoice number as "VOIDED" in the public ledger, and allow the Order Desk to generate a fresh replacement invoice.
            </p>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-slate-600">Reason for Voiding *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g., Major correction needed, Customer modified ordered item sizes/quantities..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-hidden focus:border-red-400 text-slate-800"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowVoidModal(false)}
                className="py-2 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-sm font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidInvoice}
                className="py-2 px-5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl shadow-md cursor-pointer"
              >
                Confirm Void Status
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
