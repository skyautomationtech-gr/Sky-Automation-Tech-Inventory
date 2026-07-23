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
  ShieldAlert, 
  Eraser, 
  Check 
} from 'lucide-react';
import { Invoice, UserProfile, Order, CompanySettings } from '../types';
import { getInvoices, voidInvoiceRecord, getOrders, getCompanySettings } from '../firebase/db';
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
      inv.orderId.toLowerCase().includes(queryLower);

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

  // PDF Download using html2canvas + jsPDF
  const downloadPDF = async (invoice: Invoice) => {
    const element = document.getElementById('invoice-print-area');
    if (!element) return;
    
    try {
      setLoading(true);
      
      // Save canvas signature image if drawn
      let signatureImgData = '';
      if (canvasRef.current) {
        // Find the signature preview image on the invoice and set its src to canvas dataURL
        signatureImgData = canvasRef.current.toDataURL('image/png');
        const printSignatureImg = document.getElementById('print-signature-img') as HTMLImageElement;
        if (printSignatureImg) {
          printSignatureImg.src = signatureImgData;
          printSignatureImg.style.display = 'block';
        }
      }

      // Briefly wait to ensure canvas is rendered onto print preview image
      await new Promise(resolve => setTimeout(resolve, 300));

      const canvas = await html2canvas(element, {
        scale: 2, // higher scale for printable quality
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: true,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;
      
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
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
              <div className="bg-[#ffffff] max-w-[210mm] mx-auto min-h-[297mm] text-[#000000] font-sans relative overflow-hidden" id="invoice-print-area" style={{ width: '210mm' }}>
                {/* Header Section */}
                <div className="relative bg-[#111111] h-[140px] w-full flex justify-between items-start p-8">
                  {/* Subtle Wave SVG */}
                  <svg className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-80" preserveAspectRatio="none" viewBox="0 0 800 140" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 0H800V140C800 140 650 90 400 90C150 90 0 140 0 140V0Z" fill="#3a3a3a"/>
                  </svg>
                  <div className="relative z-10 text-[#ffffff]">
                    <h1 className="text-[30px] font-bold tracking-wider">INVOICE</h1>
                  </div>
                  <div className="relative z-10 text-right text-[#ffffff] flex flex-col items-end">
                    {/* Hexagon Mark */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-2">
                      <path d="M12 0L22.3923 6V18L12 24L1.6077 18V6L12 0Z" fill="#ffffff"/>
                    </svg>
                    <div className="font-bold text-[16px] tracking-widest">SKY AUTOMATION TECH</div>
                    <div className="text-[10px] text-[#888888] tracking-[0.2em] mt-1 uppercase">
                      {selectedInvoice.subBrand === 'SAT' ? 'SKY AUTO DIVISION' : selectedInvoice.subBrand === 'GZ' ? 'GADGETZU DIVISION' : 'RTX GADGET DIVISION'}
                    </div>
                  </div>
                </div>

                <div className="px-10 py-8 space-y-8">
                  {/* INVOICE TO / META INFO ROW */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-[#888888] tracking-widest mb-2 font-semibold">INVOICE TO</div>
                      <div className="font-bold text-[16px]">{selectedInvoice.customerName}</div>
                      <div className="text-[13px]">P : {selectedInvoice.customerPhone}</div>
                      <div className="text-[13px] max-w-[250px] whitespace-pre-wrap leading-relaxed">
                        A : {orders.find(o => o.id === selectedInvoice.orderId)?.deliveryAddress || 'No Address Listed'}
                      </div>
                    </div>
                    <div className="text-right space-y-1.5 text-[13px]">
                      <div><span className="font-semibold">Invoice No :</span> {selectedInvoice.invoiceNumber}</div>
                      <div><span className="font-semibold">Date :</span> {new Date(selectedInvoice.generatedAt).toLocaleDateString('en-GB')}</div>
                      <div><span className="font-semibold">Courier :</span> {selectedInvoice.courier || 'N/A'}</div>
                    </div>
                  </div>

                  {/* ITEMS TABLE */}
                  <div className="w-full text-sm">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-[#111111] text-[#ffffff]">
                          <th className="py-2 px-4 font-semibold w-12 text-center">SL</th>
                          <th className="py-2 px-4 font-semibold">Item description</th>
                          <th className="py-2 px-4 font-semibold text-center w-24">Qty</th>
                          <th className="py-2 px-4 font-semibold text-right w-32">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedInvoice.items.map((item, idx) => (
                          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#f2f2f2' : '#ffffff' }}>
                            <td className="py-3 px-4 text-center text-[13px]">{idx + 1}</td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-[14px]">{item.productName}</div>
                              {item.variantLabel && <div className="text-[11px] text-[#888888] mt-0.5">{item.variantLabel}</div>}
                            </td>
                            <td className="py-3 px-4 text-center text-[13px]">{item.qty}</td>
                            <td className="py-3 px-4 text-right text-[13px]">৳{(item.qty * item.unitPrice).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* PAYMENT INFO + TOTALS ROW */}
                  <div className="flex justify-between items-start pt-4">
                    <div className="space-y-1.5">
                      <div className="text-[11px] text-[#888888] tracking-widest mb-2 font-semibold">PAYMENT INFO</div>
                      <div className="text-[13px]"><span className="font-semibold">Method :</span> Cash on Delivery</div>
                      <div className="text-[13px]"><span className="font-semibold">Status :</span> {selectedInvoice.paymentStatus}</div>
                    </div>
                    <div className="w-64 space-y-3">
                      <div className="flex justify-between text-[13px] px-4">
                        <span>Subtotal</span>
                        <span>৳{selectedInvoice.totalAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-[13px] px-4">
                        <span>Total Paid</span>
                        <span>৳{selectedInvoice.amountPaid.toLocaleString()}</span>
                      </div>
                      <div className="bg-[#111111] text-[#ffffff] flex justify-between p-4 font-bold text-[16px]">
                        <span>Total :</span>
                        <span>৳{selectedInvoice.amountDue.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* TERMS AND SIGNATURE */}
                  <div className="pt-16 flex justify-between items-end">
                    <div className="max-w-[300px]">
                      <div className="text-[11px] text-[#888888] tracking-widest mb-2 font-semibold">TERMS AND CONDITIONS</div>
                      <div className="text-[11px] text-[#333333] leading-relaxed">
                        {companySettings?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'}
                      </div>
                    </div>
                    <div className="text-center w-48">
                      <div className="mb-2 h-16 flex items-end justify-center relative">
                        <img 
                          id="print-signature-img" 
                          alt="Signature preview" 
                          className="h-14 object-contain hidden relative z-10" 
                          style={{ mixBlendMode: 'multiply' }}
                        />
                        {/* Fallback signature text if no image */}
                        <div className="font-[cursive] text-2xl text-[#000000] absolute bottom-2 w-full" id="fallback-signature">Sky Automation</div>
                      </div>
                      <div className="border-t border-[#000000] pt-2 text-[12px] font-semibold">
                        Authorized signature
                      </div>
                    </div>
                  </div>
                </div>

                {/* FOOTER */}
                <div className="absolute bottom-0 w-full h-[100px] bg-[#111111] flex items-center px-10">
                  <svg className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-80" preserveAspectRatio="none" viewBox="0 0 800 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 100H800V0C800 0 650 50 400 50C150 50 0 0 0 0V100Z" fill="#3a3a3a"/>
                  </svg>
                  <div className="relative z-10 text-[#ffffff] text-[12px] flex gap-8 w-full">
                    <div className="underline decoration-[#888888] underline-offset-4">Get in touch</div>
                    <div className="flex gap-4">
                      <span>01577351518</span>
                      <span className="text-[#888888]">|</span>
                      <span>skyautomationtech@gmail.com</span>
                    </div>
                  </div>
                </div>
              </div>

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
