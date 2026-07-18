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
import { Invoice, UserProfile, Order } from '../types';
import { getInvoices, voidInvoiceRecord, getOrders } from '../firebase/db';
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
        onclone: (clonedDoc) => {
          const printArea = clonedDoc.getElementById('invoice-print-area');
          if (printArea) {
            // Force standard colors to avoid modern color parsing errors
            const style = clonedDoc.createElement('style');
            style.innerHTML = `
              #invoice-print-area, #invoice-print-area * {
                color: #000000 !important;
                background-color: #ffffff !important;
                border-color: #000000 !important;
              }
            `;
            clonedDoc.head.appendChild(style);
          }
        }
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
        <div className="flex items-center gap-3 bg-red-50 text-red-700 p-4 rounded-2xl border border-red-100 animate-fade-in text-xs font-semibold">
          <AlertCircle size={16} className="flex-shrink-0" />
          <p className="flex-1">{error}</p>
          <button onClick={() => setError('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100 animate-fade-in text-xs font-semibold">
          <CheckCircle size={16} className="flex-shrink-0" />
          <p className="flex-1">{success}</p>
          <button onClick={() => setSuccess('')} className="hover:opacity-70"><X size={14} /></button>
        </div>
      )}

      {/* Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">Billing Operations</span>
          <h1 className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
            <Receipt className="text-slate-900" size={24} />
            Invoice Desk
          </h1>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
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
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-amber-400"
            />
          </div>

          {/* Sub brand Filter */}
          <div className="w-full md:w-44">
            <select
              value={subBrandFilter}
              onChange={(e) => setSubBrandFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-xs text-slate-700 focus:outline-hidden focus:border-amber-400"
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
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-xs text-slate-700 focus:outline-hidden focus:border-amber-400"
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
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-3 text-xs text-slate-700 focus:outline-hidden focus:border-amber-400"
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
          <div className="p-12 text-center text-xs text-slate-400 font-mono">
            Fetching active invoice registers...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Receipt size={32} className="mx-auto text-slate-200 mb-2" />
            <p className="text-xs font-semibold">No invoices found matching the current criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoice #</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sub-Brand</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Due</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="py-4 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-6 text-right text-[10px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-xs">
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
                      <div className="text-[10px] text-slate-400 font-mono">{inv.customerPhone}</div>
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
                <p className="text-[10px] text-slate-400 mt-0.5">Official A4 Document Copy and Signature Console</p>
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
                    className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold px-3 py-2 rounded-xl border border-red-200/50 transition-all cursor-pointer"
                  >
                    <Trash2 size={13} />
                    Void Invoice
                  </button>
                )}

                <button
                  onClick={() => downloadPDF(selectedInvoice)}
                  disabled={loading}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-[#D4AF37] text-xs font-bold px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
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
                    <h4 className="text-xs font-bold uppercase tracking-wider">This Invoice Has Been VOIDED</h4>
                    <p className="text-[11px] leading-relaxed mt-1 text-red-600">
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
                      <h4 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <Eraser size={14} className="text-amber-500" />
                        Interactive Digital Signature Pad
                      </h4>
                      <p className="text-[9px] text-slate-400 mt-0.5">Optionally draw the operator/approver signature here. It will render onto the bottom of the PDF before download.</p>
                    </div>
                    <button 
                      onClick={clearSignature}
                      className="text-[10px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg py-1 px-2.5 transition-all cursor-pointer"
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
              <div className="bg-white border border-slate-300 shadow-md p-10 max-w-[210mm] mx-auto min-h-[297mm] text-slate-900 font-sans" id="invoice-print-area" style={{ width: '210mm' }}>
                <div className="space-y-8">
                  {/* Print Invoice Top Header */}
                  <div className="border-b border-black pb-6 flex justify-between items-start">
                    <div className="flex items-center gap-4">
                      <img src="/logo.png" alt="Company Logo" className="w-16 h-16 object-contain" />
                      <div>
                        <span className="text-[10px] font-mono tracking-widest font-black uppercase">
                          {selectedInvoice.subBrand === 'SAT' ? 'SKY AUTOMATION TECH' : selectedInvoice.subBrand === 'GZ' ? 'GADGETZU' : 'RTX GADGET'}
                        </span>
                        <h1 className="text-3xl font-black tracking-tighter uppercase mt-1">OFFICIAL INVOICE</h1>
                        <div className="text-xs mt-2 space-y-0.5 font-mono">
                          <p className="font-bold">Issued By: {selectedInvoice.subBrand === 'SAT' ? 'Sky Automation Tech' : selectedInvoice.subBrand === 'GZ' ? 'GadgetZu' : 'RTX Gadget'}</p>
                          <p className="text-slate-600">Email: skyautomationtech@gmail.com</p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right font-mono text-xs space-y-1">
                      <div className="flex items-center justify-end gap-2 mb-2">
                        <QRCodeSVG value={`INV:${selectedInvoice.invoiceNumber}`} size={60} />
                      </div>
                      <div className="border border-black p-2 text-center bg-black text-white rounded-sm">
                        <p className="text-[9px] font-bold uppercase tracking-wider">INVOICE NUMBER</p>
                        <p className="text-sm font-black tracking-tight">{selectedInvoice.invoiceNumber}</p>
                      </div>
                      <p className="pt-2"><strong>Invoice Date:</strong> {new Date(selectedInvoice.generatedAt).toLocaleDateString('en-GB')}</p>
                      <p><strong>Order Reference:</strong> #{selectedInvoice.orderId.substring(0, 8).toUpperCase()}</p>
                    </div>
                  </div>

                  {/* Customer Information Section */}
                  <div className="grid grid-cols-2 gap-8 border border-black p-4 font-mono text-xs rounded-sm">
                    <div>
                      <h3 className="font-black border-b border-black pb-1 mb-2 text-[10px] uppercase tracking-wide">BILLED TO (CUSTOMER):</h3>
                      <p className="font-black text-slate-950 text-sm">{selectedInvoice.customerName}</p>
                      <p className="mt-1 font-bold text-slate-700">Phone: {selectedInvoice.customerPhone}</p>
                    </div>

                    <div>
                      <h3 className="font-black border-b border-black pb-1 mb-2 text-[10px] uppercase tracking-wide">DELIVERY ADDRESS:</h3>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {selectedInvoice.courier ? `${selectedInvoice.courier}` : 'Courier Delivery'} <br />
                        {orders.find(o => o.id === selectedInvoice.orderId)?.deliveryAddress || 'No Address Listed'}
                      </p>
                    </div>
                  </div>

                  {/* Itemized Invoice Table */}
                  <div className="border border-black rounded-sm overflow-hidden font-mono text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-black text-white font-black">
                          <th className="py-2.5 px-4">PRODUCT DESCRIPTION</th>
                          <th className="py-2.5 px-4 text-center">QUANTITY</th>
                          <th className="py-2.5 px-4 text-right">UNIT PRICE</th>
                          <th className="py-2.5 px-4 text-right">LINE TOTAL</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/40">
                        {selectedInvoice.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-black">
                              {item.productName}
                              <div className="text-[9px] text-slate-500 font-normal mt-0.5">Variant: {item.variantLabel}</div>
                            </td>
                            <td className="py-3 px-4 text-center font-bold">{item.qty}</td>
                            <td className="py-3 px-4 text-right font-bold">৳{item.unitPrice.toLocaleString()}</td>
                            <td className="py-3 px-4 text-right font-black">৳{(item.qty * item.unitPrice).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Summary Block */}
                  <div className="grid grid-cols-2 gap-8 items-start font-mono text-xs">
                    {/* Notes & Courier Info */}
                    <div className="border border-black p-4 space-y-2 rounded-sm bg-slate-50/50">
                      <h4 className="font-black border-b border-black pb-1 uppercase tracking-wider text-[9px]">COURIER & DESPATCH DETS:</h4>
                      <div className="space-y-1">
                        <p><strong>Courier:</strong> {selectedInvoice.courier || 'N/A'}</p>
                        <p><strong>Tracking No:</strong> {selectedInvoice.courierTrackingNumber || 'Pending Courier Assign'}</p>
                        <p><strong>Biller:</strong> {user?.name || 'Operator'}</p>
                      </div>
                    </div>

                    {/* Financial Summary Calculations */}
                    <div className="border border-black rounded-sm overflow-hidden">
                      <div className="p-3 space-y-1.5">
                        <div className="flex justify-between">
                          <span>Subtotal Amount:</span>
                          <span>৳{selectedInvoice.totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-bold border-b border-black/20 pb-1.5">
                          <span>Total Paid:</span>
                          <span>৳{selectedInvoice.amountPaid.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between font-black text-slate-900 pt-1 text-sm">
                          <span>TOTAL DUE:</span>
                          <span>৳{selectedInvoice.amountDue.toLocaleString()}</span>
                        </div>
                      </div>
                      
                      <div className="bg-black text-white p-2.5 text-center font-black uppercase text-[10px] tracking-widest">
                        PAYMENT STATUS: {selectedInvoice.paymentStatus}
                      </div>
                    </div>
                  </div>

                  {/* Print Page Signature & Footer Section */}
                  <div className="pt-16 grid grid-cols-2 gap-8 items-end font-mono text-xs text-center">
                    <div>
                      <p className="border-t border-black pt-2 mx-auto w-48 font-bold">Customer Signature</p>
                    </div>

                    <div className="flex flex-col items-center">
                      {/* Image tag displaying the drawn signature from canvas */}
                      <img 
                        id="print-signature-img" 
                        alt="Signature preview" 
                        className="h-10 object-contain hidden border border-slate-100 bg-slate-50/20 mb-1" 
                      />
                      <p className="border-t border-black pt-2 w-48 font-bold mx-auto">Authorized Signature</p>
                    </div>
                  </div>
                  
                  {/* Footnote */}
                  <div className="text-center text-[9px] text-slate-500 font-mono border-t border-black/10 pt-4">
                    This is an official system-generated invoice from Sky Automation Tech Platform. All rights reserved. Thank you.
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
          <div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-1.5">
                <ShieldAlert className="text-red-500" size={16} />
                Void Invoice Audit Entry
              </h3>
              <button onClick={() => setShowVoidModal(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              This action is immutable. Voiding this invoice will log your operator profile, flag this invoice number as "VOIDED" in the public ledger, and allow the Order Desk to generate a fresh replacement invoice.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Reason for Voiding *</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g., Major correction needed, Customer modified ordered item sizes/quantities..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs focus:outline-hidden focus:border-red-400 text-slate-800"
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowVoidModal(false)}
                className="py-2 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidInvoice}
                className="py-2 px-5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
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
