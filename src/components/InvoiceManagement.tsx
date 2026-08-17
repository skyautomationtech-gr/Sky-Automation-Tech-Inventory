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
  Check,
  QrCode,
  ExternalLink
} from 'lucide-react';
import { Invoice, UserProfile, Order, CompanySettings, Product } from '../types';
import { getInvoices, voidInvoiceRecord, getOrders, getCompanySettings, getProducts } from '../firebase/db';
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
  const [products, setProducts] = useState<Product[]>([]);
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
      const [invoicesData, ordersData, settingsData, productsData] = await Promise.all([
        getInvoices(),
        getOrders(),
        getCompanySettings(),
        getProducts()
      ]);
      setCompanySettings(settingsData);
      setInvoices(invoicesData || []);
      setOrders(ordersData || []);
      setProducts(productsData || []);
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

                <a
                  href={(() => {
                    let origin = 'https://ais-pre-jlvy4yjbm64spydbxln25t-698042614411.asia-southeast1.run.app';
                    if (typeof window !== 'undefined' && window.location.origin) {
                      const locOrigin = window.location.origin;
                      if (!locOrigin.includes('localhost') && !locOrigin.includes('127.0.0.1') && !locOrigin.includes('0.0.0.0')) {
                        origin = locOrigin;
                      }
                    }
                    const params = new URLSearchParams({
                      verify_inv: selectedInvoice.invoiceNumber || selectedInvoice.id,
                      brand: selectedInvoice.subBrand || 'SAT',
                      total: (selectedInvoice.totalAmount || 0).toString(),
                      due: (selectedInvoice.dueAmount || 0).toString(),
                      paid: (selectedInvoice.paidAmount || 0).toString(),
                      phone: selectedInvoice.customerPhone || '',
                      name: selectedInvoice.customerName || '',
                      date: new Date(selectedInvoice.generatedAt || Date.now()).toISOString().split('T')[0],
                    });
                    return `${origin}/?${params.toString()}`;
                  })()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold px-3.5 py-2 rounded-xl border border-emerald-200 shadow-xs transition-all cursor-pointer"
                  title="Open and test the public QR invoice verification link in a new tab"
                >
                  <QrCode size={14} />
                  <span>Test QR Link</span>
                </a>

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

              {/* A4 PRINT CONTAINER (STRICT HIGH-CONTRAST MONOCHROME / DARK ACCENT FOR PERFECT A4 PRINTING) */}
              {(() => {
                const subBrandInfo = getSubBrandCompanyInfo(selectedInvoice.subBrand, companySettings);
                const relatedOrder = orders.find(o => o.id === selectedInvoice.orderId);
                const itemSubtotal = selectedInvoice.items.reduce((acc, item) => acc + (item.qty * item.unitPrice), 0);
                const discountAmt = selectedInvoice.discountAmount ?? relatedOrder?.discountAmount ?? 0;
                const shippingAmt = selectedInvoice.shippingCharge ?? relatedOrder?.shippingCharge ?? 0;
                const grandTotal = Math.max(0, itemSubtotal - discountAmt + shippingAmt);

                // Financial settlement calculation:
                // If paymentStatus is Paid, paidAmt is grandTotal. Otherwise take recorded amountPaid.
                const rawPaidAmt = selectedInvoice.amountPaid ?? relatedOrder?.amountPaid ?? 0;
                const isPaidStatus = selectedInvoice.paymentStatus === 'Paid';
                const paidAmt = isPaidStatus ? grandTotal : rawPaidAmt;
                const dueAmt = isPaidStatus ? 0 : Math.max(0, grandTotal - paidAmt);
                const isCOD = relatedOrder?.paymentMethod === 'Cash' || selectedInvoice.paymentStatus === 'Due' || dueAmt > 0;

                // Helper for clean SKU lookup
                const getCleanSku = (item: any) => {
                  const matchedProd = products.find(p => p.id === item.productId);
                  if (matchedProd?.sku) return matchedProd.sku;
                  if (matchedProd?.barcodeValue) return matchedProd.barcodeValue;
                  // Construct a clean, meaningful SKU format: BRAND-NAME-VAR
                  const namePart = (item.productName || 'ITM').replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
                  const varPart = (item.variantLabel || 'STD').replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'STD';
                  return `${selectedInvoice.subBrand}-${namePart}-${varPart}`;
                };

                return (
                  <div 
                    className="bg-[#ffffff] max-w-[210mm] mx-auto min-h-[297mm] text-[#111111] font-sans relative overflow-hidden box-border shadow-md" 
                    id="invoice-print-area" 
                    style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}
                  >
                    {/* Embedded fonts and standard A4 print style */}
                    <style dangerouslySetInnerHTML={{__html: `
                      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@1,600&family=Dancing+Script:wght@600;700&display=swap');
                      @page {
                        size: A4 portrait;
                        margin: 0;
                      }
                      #invoice-print-area { 
                        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        color: #0f172a;
                        background-color: #ffffff;
                        width: 210mm;
                        min-height: 297mm;
                      }
                      .cursive-font { font-family: 'Dancing Script', cursive; }
                      .serif-font { font-family: 'Playfair Display', serif; }
                      @media print {
                        html, body {
                          width: 210mm !important;
                          height: 297mm !important;
                          margin: 0 !important;
                          padding: 0 !important;
                          background: #ffffff !important;
                        }
                        #invoice-print-area { 
                          box-shadow: none !important; 
                          margin: 0 auto !important; 
                          width: 210mm !important; 
                          min-height: 297mm !important;
                          max-width: 210mm !important;
                          padding: 10mm 12mm !important;
                        }
                      }
                    `}} />

                    <div className="p-8 space-y-4">
                      {/* 1. HEADER & BRAND IDENTITY */}
                      <div className="flex justify-between items-start pb-4 border-b-2 border-[#0f172a]">
                        {/* Left: Brand Logo & Details */}
                        <div className="flex gap-4 items-center">
                          <div className="w-16 h-16 bg-[#ffffff] border border-[#e2e8f0] rounded-xl flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-xs">
                            <img 
                              src={subBrandInfo.logoUrl} 
                              alt={subBrandInfo.companyName} 
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h1 className="text-2xl font-black text-[#0f172a] m-0 tracking-tight uppercase">
                                {subBrandInfo.companyName}
                              </h1>
                              <span className="text-[10px] bg-[#0f172a] text-[#ffffff] font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider">
                                {selectedInvoice.subBrand}
                              </span>
                            </div>
                            <p className="text-[#64748b] text-xs mt-0.5 font-medium">{subBrandInfo.tagline}</p>
                            
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#334155]">
                              <div className="flex items-center gap-1.5 font-medium">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                <span>{subBrandInfo.address}</span>
                              </div>
                              <div className="flex items-center gap-1.5 font-medium">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                                <span className="font-bold text-[#0f172a]">{subBrandInfo.phone}</span>
                              </div>
                              <div className="flex items-center gap-1.5 font-medium">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                <span>{subBrandInfo.email}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Invoice Label & Official Email */}
                        <div className="text-right flex flex-col items-end shrink-0">
                          <div className="text-3xl font-black text-[#0f172a] tracking-tight">INVOICE</div>
                          <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-widest mt-0.5">
                            Customer Copy
                          </div>
                          <div className="mt-2 bg-[#0f172a] text-[#ffffff] text-[11px] font-semibold px-3 py-1 rounded-lg flex items-center gap-1.5 shadow-xs">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            <span>skyautomationtech@gmail.com</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. INVOICE META STRIP */}
                      <div className="bg-[#f8fafc] border border-[#cbd5e1] rounded-xl overflow-hidden shadow-xs">
                        <div className="bg-[#0f172a] text-[#ffffff] px-4 py-2 flex justify-between items-center text-xs font-bold">
                          <span className="tracking-wide">INVOICE #{selectedInvoice.invoiceNumber}</span>
                          <span className="text-[#94a3b8] font-normal">Order Ref: {selectedInvoice.orderId.substring(0, 10)}</span>
                        </div>
                        <div className="p-3 grid grid-cols-4 gap-3 text-xs divide-x divide-[#e2e8f0]">
                          <div className="pr-2">
                            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-wider mb-0.5">Invoice Date</div>
                            <div className="font-bold text-[#0f172a]">{new Date(selectedInvoice.generatedAt).toLocaleDateString('en-GB')}</div>
                          </div>
                          <div className="px-3">
                            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-wider mb-0.5">Customer ID</div>
                            <div className="font-bold text-[#0f172a] truncate">{selectedInvoice.customerId || 'CUS-0001'}</div>
                          </div>
                          <div className="px-3">
                            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-wider mb-0.5">Courier Partner</div>
                            <div className="font-bold text-[#0f172a] truncate">{selectedInvoice.courier || relatedOrder?.courier || 'Direct Dispatch'}</div>
                          </div>
                          <div className="pl-3">
                            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-wider mb-0.5">Payment Terms</div>
                            <div className="font-extrabold text-[#0f172a]">
                              {isCOD ? (paidAmt > 0 ? `Partial COD (৳${paidAmt} Paid)` : 'Cash on Delivery (COD)') : 'Paid in Advance'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 3. OPTIMIZED CUSTOMER & DELIVERY INFORMATION */}
                      <div className="border border-[#cbd5e1] rounded-xl overflow-hidden shadow-xs">
                        <div className="bg-[#f1f5f9] px-4 py-1.5 border-b border-[#cbd5e1] flex items-center justify-between">
                          <div className="text-[10px] font-extrabold text-[#334155] uppercase tracking-wider flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Customer & Delivery Information
                          </div>
                          <div className="text-[9px] font-bold text-[#64748b] uppercase">
                            Sales Channel: {relatedOrder?.salesChannel || 'Direct'}
                          </div>
                        </div>
                        <div className="p-3 grid grid-cols-2 gap-4 text-xs">
                          {/* Left: Customer Info */}
                          <div className="border-r border-[#e2e8f0] pr-3 space-y-1">
                            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Bill To Customer:</div>
                            <div className="font-bold text-sm text-[#0f172a]">{selectedInvoice.customerName}</div>
                            <div className="text-xs font-semibold text-[#0f172a] flex items-center gap-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              {selectedInvoice.customerPhone}
                            </div>
                            <div className="text-[10px] text-[#64748b]">
                              Sub-Brand Preference: <strong className="text-[#0f172a]">{selectedInvoice.subBrand}</strong>
                            </div>
                          </div>

                          {/* Right: Shipping Address & Landmark */}
                          <div className="space-y-1">
                            <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">Ship To Destination:</div>
                            <div className="text-xs text-[#0f172a] font-medium leading-relaxed">
                              {relatedOrder?.deliveryAddress || 'Direct Store Delivery / In-person Pickup'}
                            </div>
                            {selectedInvoice.courierTrackingNumber && (
                              <div className="text-[10px] text-[#0f172a] font-bold mt-1 bg-[#f8fafc] px-2 py-0.5 rounded border border-[#e2e8f0] inline-block">
                                Tracking No: {selectedInvoice.courierTrackingNumber}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 4. ITEMS TABLE (CLEAN MEANINGFUL SKU & VARIANTS) */}
                      <div className="w-full text-xs rounded-xl overflow-hidden border border-[#cbd5e1] shadow-xs">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[#0f172a] text-[#ffffff]">
                              <th className="py-2.5 px-3 font-bold w-10 text-center uppercase text-[10px] tracking-wider">SL</th>
                              <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider">Item Description</th>
                              <th className="py-2.5 px-3 font-bold uppercase text-[10px] tracking-wider w-36">SKU / Code</th>
                              <th className="py-2.5 px-3 font-bold text-center w-14 uppercase text-[10px] tracking-wider">Qty</th>
                              <th className="py-2.5 px-3 font-bold text-right w-24 uppercase text-[10px] tracking-wider">Unit Price</th>
                              <th className="py-2.5 px-3 font-bold text-right w-24 uppercase text-[10px] tracking-wider">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e2e8f0]">
                            {selectedInvoice.items.map((item, idx) => (
                              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                <td className="py-2.5 px-3 text-center text-xs font-semibold text-[#64748b]">{idx + 1}</td>
                                <td className="py-2.5 px-3">
                                  <div>
                                    <div className="font-extrabold text-[#0f172a] text-xs leading-tight">{item.productName}</div>
                                    {item.variantLabel && (
                                      <div className="text-[10px] text-[#64748b] font-medium mt-0.5">
                                        Variant: {item.variantLabel}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="font-mono font-bold text-[11px] text-[#334155] bg-[#e2e8f0]/60 px-1.5 py-0.5 rounded">
                                    {getCleanSku(item)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-[#0f172a] text-xs">{item.qty}</td>
                                <td className="py-2.5 px-3 text-right text-xs font-semibold text-[#334155]">৳{item.unitPrice.toLocaleString()}</td>
                                <td className="py-2.5 px-3 text-right font-extrabold text-[#0f172a] text-xs">৳{(item.qty * item.unitPrice).toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* 5. FINANCIAL LEDGER & TOTALS */}
                      <div className="flex justify-between items-start pt-1 gap-4">
                        {/* Left: Terms & Ledger if any */}
                        <div className="flex-1 space-y-3">
                          {relatedOrder?.paymentHistory && relatedOrder.paymentHistory.length > 0 && (
                            <div className="border border-[#cbd5e1] rounded-xl p-2.5 bg-[#f8fafc]">
                              <div className="text-[10px] text-[#0f172a] font-extrabold uppercase mb-1 flex items-center justify-between">
                                <span>Advance Payment Record</span>
                                <span className="text-[#059669]">Received: ৳{paidAmt.toLocaleString()}</span>
                              </div>
                              <table className="w-full text-left text-[10px]">
                                <thead>
                                  <tr className="border-b border-[#e2e8f0] text-[#64748b]">
                                    <th className="pb-1 font-semibold">Date</th>
                                    <th className="pb-1 font-semibold">Method</th>
                                    <th className="pb-1 font-semibold text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {relatedOrder.paymentHistory.map((ph, idx) => (
                                    <tr key={idx} className="border-b border-[#f1f5f9] last:border-0">
                                      <td className="py-0.5 text-[#475569]">{new Date(ph.date).toLocaleDateString('en-GB')}</td>
                                      <td className="py-0.5 text-[#0f172a] font-medium">{ph.method}</td>
                                      <td className="py-0.5 text-[#059669] font-bold text-right">৳{ph.amount.toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="border border-[#cbd5e1] rounded-xl p-2.5 bg-[#ffffff]">
                            <div className="text-[10px] text-[#475569] font-bold uppercase mb-0.5">Terms & Return Policy</div>
                            <div className="text-[10px] text-[#64748b] leading-relaxed">
                              {subBrandInfo.invoiceTerms}
                            </div>
                          </div>

                          {/* 6. AUTHENTIC OFFICIAL STAMP & SIGNATURE */}
                          <div className="pt-2 flex items-center justify-between">
                            {/* Official Digital Seal */}
                            <div className="border-2 border-dashed border-[#0f172a] rounded-full w-24 h-24 flex flex-col items-center justify-center p-1 text-center select-none rotate-[-6deg] opacity-95 shrink-0 bg-[#ffffff]">
                              <div className="text-[7px] font-black tracking-tighter uppercase text-[#0f172a]">
                                {subBrandInfo.companyName}
                              </div>
                              <div className="my-0.5 text-[#0f172a]">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>
                              </div>
                              <div className="text-[7px] font-black tracking-wider uppercase bg-[#0f172a] text-[#ffffff] px-1.5 py-0.2 rounded-xs">
                                OFFICIAL SEAL
                              </div>
                              <div className="text-[6px] text-[#475569] mt-0.5 font-bold">VERIFIED & AUTH</div>
                            </div>

                            {/* Authorised Signature Line */}
                            <div className="w-48 text-center relative">
                              <div className="mb-1 h-12 flex items-end justify-center relative">
                                <img 
                                  id="print-signature-img" 
                                  alt="Signature preview" 
                                  className="h-11 object-contain hidden relative z-10" 
                                  style={{ mixBlendMode: 'multiply' }}
                                />
                                <div className="cursive-font text-2xl text-[#0f172a]" id="fallback-signature">
                                  {subBrandInfo.companyName}
                                </div>
                              </div>
                              <div className="border-t-2 border-[#0f172a] pt-1 text-[10px] font-extrabold text-[#0f172a] uppercase tracking-wider">
                                Authorised Signatory
                              </div>
                              <div className="text-[8px] text-[#64748b] font-medium">Sky Automation Tech Accounts</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Right: Totals Box & COD Highlight */}
                        <div className="w-72 space-y-2">
                          <div className="p-3 bg-[#f8fafc] rounded-xl border border-[#cbd5e1] space-y-1.5 text-xs shadow-xs">
                            <div className="flex justify-between">
                              <span className="text-[#64748b] font-semibold">Subtotal</span>
                              <span className="text-[#0f172a] font-bold">৳{itemSubtotal.toLocaleString()}</span>
                            </div>
                            {discountAmt > 0 && (
                              <div className="flex justify-between text-[#059669]">
                                <span className="font-semibold">Discount</span>
                                <span className="font-bold">-৳{discountAmt.toLocaleString()}</span>
                              </div>
                            )}
                            {shippingAmt > 0 && (
                              <div className="flex justify-between text-[#334155]">
                                <span className="font-semibold">Shipping Charge</span>
                                <span className="font-bold">+৳{shippingAmt.toLocaleString()}</span>
                              </div>
                            )}
                            <div className="flex justify-between border-t border-[#e2e8f0] pt-1.5 font-bold text-[#0f172a]">
                              <span>Net Grand Total</span>
                              <span className="text-sm">৳{grandTotal.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-[#059669] font-semibold border-t border-[#e2e8f0] pt-1.5">
                              <span>Total Paid / Advance</span>
                              <span>৳{paidAmt.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-[#dc2626] font-extrabold text-sm border-t-2 border-[#e2e8f0] pt-1.5">
                              <span>Balance Due</span>
                              <span>৳{dueAmt.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* COD Highlight Banner (Crucial for Rider / Delivery) */}
                          <div className={`p-3 rounded-xl font-black text-center border ${
                            dueAmt > 0 
                              ? 'bg-[#0f172a] text-[#ffffff] border-[#0f172a]' 
                              : 'bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]'
                          }`}>
                            <div className="text-[10px] uppercase tracking-wider opacity-90">
                              {dueAmt > 0 ? 'Amount to Collect on Delivery (COD)' : 'Payment Status'}
                            </div>
                            <div className="text-xl mt-0.5 tracking-tight">
                              {dueAmt > 0 ? `৳${dueAmt.toLocaleString()}` : 'FULL PAYMENT RECEIVED'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 7. BOTTOM: PAYMENT METHODS, SCAN-TO-VERIFY QR, & APPRECIATION */}
                      <div className="pt-2 flex justify-between items-end gap-4 border-t border-[#e2e8f0]">
                        <div className="bg-[#0f172a] rounded-xl p-3.5 flex-1 flex justify-between items-center text-[#ffffff] shadow-xs">
                          <div className="space-y-1.5">
                            <div className="text-[10px] uppercase font-bold text-[#94a3b8] tracking-wider">
                              Official Payment Channels
                            </div>
                            <div className="space-y-1 text-xs text-[#e2e8f0]">
                              <div className="flex items-center gap-2">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg>
                                <span>bKash / Nagad (Personal/Merchant): <strong className="text-[#ffffff] ml-1">{subBrandInfo.bkashNagadPhone}</strong></span>
                              </div>
                              <div className="flex items-center gap-2">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                <span>Bank Transfer: <strong className="text-[#ffffff] ml-1">{subBrandInfo.bankDetails}</strong></span>
                              </div>
                            </div>
                            <div className="text-[9px] text-[#94a3b8] italic pt-1 border-t border-[#334155]">
                              Please WhatsApp payment receipt to: <strong className="text-[#e2e8f0]">{subBrandInfo.whatsappContact}</strong>
                            </div>
                          </div>
                          
                          {/* DYNAMIC QR CODE WITH CLEAR SCAN CAPTION */}
                          {(() => {
                            let origin = 'https://ais-pre-jlvy4yjbm64spydbxln25t-698042614411.asia-southeast1.run.app';
                            if (typeof window !== 'undefined' && window.location.origin) {
                              const locOrigin = window.location.origin;
                              if (!locOrigin.includes('localhost') && !locOrigin.includes('127.0.0.1') && !locOrigin.includes('0.0.0.0')) {
                                origin = locOrigin;
                              }
                            }
                            const qrParams = new URLSearchParams({
                              verify_inv: selectedInvoice.invoiceNumber || selectedInvoice.id,
                              brand: selectedInvoice.subBrand || 'SAT',
                              total: grandTotal.toString(),
                              due: dueAmt.toString(),
                              paid: paidAmt.toString(),
                              phone: selectedInvoice.customerPhone || '',
                              name: selectedInvoice.customerName || '',
                              date: new Date(selectedInvoice.generatedAt || Date.now()).toISOString().split('T')[0],
                            });
                            const qrUrl = `${origin}/?${qrParams.toString()}`;

                            return (
                              <div 
                                className="bg-[#ffffff] p-2 rounded-lg flex flex-col items-center gap-1 shrink-0 ml-3 shadow-xs cursor-pointer hover:ring-2 hover:ring-[#0f172a] transition-all"
                                onClick={() => window.open(qrUrl, '_blank')}
                                title="Click to test live verification page in a new tab"
                              >
                                <QRCodeSVG 
                                  value={qrUrl} 
                                  size={62} 
                                  level="M" 
                                  includeMargin={false}
                                  fgColor="#0f172a"
                                  bgColor="#ffffff"
                                />
                                <div className="text-[8px] font-bold text-[#0f172a] uppercase tracking-wider text-center leading-none">
                                  Scan to Verify
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Thank You Note */}
                        <div className="text-right w-44 shrink-0 pb-1">
                          <div className="cursive-font text-3xl text-[#0f172a] leading-none mb-1">Thank you!</div>
                          <div className="text-[9px] font-bold text-[#64748b] uppercase tracking-wider">
                            For your trust & support
                          </div>
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
