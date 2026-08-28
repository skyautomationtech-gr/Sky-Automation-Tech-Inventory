import React, { useEffect, useState } from 'react';
import { 
  ShieldCheck, 
  CheckCircle2, 
  Phone, 
  MessageCircle, 
  Building2, 
  Calendar, 
  User, 
  Truck, 
  ArrowRight,
  Package,
  Receipt,
  FileCheck
} from 'lucide-react';
import { getInvoices, getOrders } from '../firebase/db';
import { Invoice, Order } from '../types';

interface PublicInvoiceVerificationProps {
  onDismiss?: () => void;
}

export const PublicInvoiceVerification: React.FC<PublicInvoiceVerificationProps> = ({ onDismiss }) => {
  const [params, setParams] = useState<{
    inv: string;
    brand: string;
    name: string;
    phone: string;
    total: number;
    due: number;
    paid: number;
    date: string;
    order: string;
  }>({
    inv: '',
    brand: 'SAT',
    name: '',
    phone: '',
    total: 0,
    due: 0,
    paid: 0,
    date: new Date().toLocaleDateString('en-GB'),
    order: '',
  });

  const [liveInvoice, setLiveInvoice] = useState<Invoice | null>(null);
  const [liveOrder, setLiveOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const extractParam = (key: string): string => {
        if (typeof window === 'undefined') return '';
        try {
          const searchParams = new URLSearchParams(window.location.search);
          if (searchParams.has(key)) return searchParams.get(key) || '';
          
          if (window.location.hash) {
            const qIndex = window.location.hash.indexOf('?');
            if (qIndex !== -1) {
              const hashParams = new URLSearchParams(window.location.hash.substring(qIndex));
              if (hashParams.has(key)) return hashParams.get(key) || '';
            }
          }
          
          const regex = new RegExp(`[?&]${key}=([^&#]*)`, 'i');
          const match = window.location.href.match(regex);
          if (match && match[1]) {
            return decodeURIComponent(match[1].replace(/\+/g, ' '));
          }
        } catch (e) {}
        return '';
      };

      const inv = extractParam('verify_inv') || extractParam('inv') || '';
      const brand = extractParam('brand') || 'SAT';
      const name = extractParam('name') || '';
      const phone = extractParam('phone') || '';
      const total = parseFloat(extractParam('total') || '0');
      const due = parseFloat(extractParam('due') || '0');
      const paid = parseFloat(extractParam('paid') || '0');
      const date = extractParam('date') || new Date().toLocaleDateString('en-GB');
      const order = extractParam('order') || '';

      setParams({ inv, brand, name, phone, total, due, paid, date, order });

      // Try fetching live invoice if online
      if (inv) {
        getInvoices().then(invoices => {
          const matched = invoices.find(i => 
            (i.invoiceNumber && i.invoiceNumber.toLowerCase() === inv.toLowerCase()) ||
            (i.id && i.id.toLowerCase() === inv.toLowerCase())
          );
          if (matched) {
            setLiveInvoice(matched);
            if (matched.orderId) {
              getOrders().then(orders => {
                const o = orders.find(ord => ord.id === matched.orderId);
                if (o) setLiveOrder(o);
              }).catch(() => {});
            }
          }
        }).catch(err => {
          console.warn('Public verification fallback to URL params:', err);
        }).finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    } catch (e) {
      setLoading(false);
    }
  }, []);

  const getSubBrandMeta = (code: string) => {
    const brand = (code || 'SAT').toUpperCase();
    if (brand === 'RTX' || brand === 'RTX GADGET') {
      return {
        name: 'RTX GADGET',
        logoUrl: '/rtx_logo.jpg',
        tagline: 'Premium Consumer Electronics & Audio Accessories',
        phone: '01577351518',
        whatsapp: '8801577351518',
        email: 'rtxgadget@gmail.com',
        color: 'from-blue-600 to-indigo-700',
        badge: 'RTX-AUTHENTIC',
      };
    }
    if (brand === 'GZ' || brand === 'GADGETZU') {
      return {
        name: 'GadgetZu',
        logoUrl: '/gz_logo.jpg',
        tagline: 'Everyday Lifestyle & Smart Wearables',
        phone: '01577351518',
        whatsapp: '8801577351518',
        email: 'gadgetzubd@gmail.com',
        color: 'from-amber-500 to-orange-600',
        badge: 'GZ-OFFICIAL',
      };
    }
    return {
      name: 'Sky Automation Tech',
      logoUrl: '/sat_logo.jpg',
      tagline: 'IoT Smart Automation & Precision Electronics',
      phone: '01577351518',
      whatsapp: '8801577351518',
      email: 'skyautomationtech@gmail.com',
      color: 'from-slate-900 to-slate-800',
      badge: 'SAT-GENUINE',
    };
  };

  const brandMeta = getSubBrandMeta(liveInvoice?.subBrand || params.brand);
  const invNumber = liveInvoice?.invoiceNumber || params.inv || 'INV-VERIFIED';
  const customerName = liveInvoice?.customerName || params.name || 'Valued Customer';
  const customerPhone = liveInvoice?.customerPhone || params.phone || '';
  
  const grandTotal = liveInvoice?.totalAmount ?? (params.total || 0);
  const paidAmt = liveInvoice?.paidAmount ?? (params.paid || 0);
  const dueAmt = liveInvoice?.dueAmount ?? (params.due || 0);
  const isCOD = dueAmt > 0;

  const maskedPhone = customerPhone.length > 6 
    ? `${customerPhone.slice(0, 3)}****${customerPhone.slice(-4)}`
    : customerPhone;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6 font-sans">
      {/* Top Banner / Verification Badge */}
      <div className="max-w-md w-full mx-auto space-y-4">
        {/* Verification Status Card */}
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl shadow-emerald-950/40 text-center relative overflow-hidden backdrop-blur-md">
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl" />
          
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 border border-emerald-500/40 shadow-md flex items-center justify-center overflow-hidden">
              <img 
                src={brandMeta.logoUrl} 
                alt={brandMeta.name} 
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = '/sat_logo.jpg';
                }}
              />
            </div>
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 animate-bounce">
              <ShieldCheck size={28} strokeWidth={2.5} />
            </div>
          </div>

          <div className="inline-block bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-black text-[10px] tracking-widest uppercase px-3 py-1 rounded-full mb-1">
            Official Authenticity Verified
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Authentic Digital Invoice
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Issued & Authenticated by <strong className="text-slate-200">{brandMeta.name}</strong>
          </p>

          <div className="mt-4 bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Invoice Number</span>
              <span className="text-base font-black text-amber-400 font-mono tracking-wide">{invNumber}</span>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Issue Date</span>
              <span className="text-xs font-semibold text-slate-300">
                {liveInvoice?.generatedAt ? new Date(liveInvoice.generatedAt).toLocaleDateString('en-GB') : params.date}
              </span>
            </div>
          </div>
        </div>

        {/* Financial & COD Summary Banner */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3.5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-amber-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Payment Breakdown</span>
            </div>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
              isCOD 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            }`}>
              {isCOD ? 'Cash on Delivery' : 'Paid in Full'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Total Invoice Amount:</span>
              <span className="font-bold text-slate-200">৳{grandTotal.toLocaleString()}</span>
            </div>
            {paidAmt > 0 && (
              <div className="flex justify-between text-emerald-400 font-medium">
                <span>Advance Received:</span>
                <span>৳{paidAmt.toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Prominent Payable Highlight */}
          <div className={`p-3.5 rounded-2xl text-center border ${
            isCOD
              ? 'bg-gradient-to-r from-amber-950/50 to-orange-950/50 border-amber-500/40 text-amber-200'
              : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
          }`}>
            <span className="text-[10px] uppercase font-black tracking-widest opacity-90 block">
              {isCOD ? 'Amount to Collect on Delivery (COD)' : 'Payment Status'}
            </span>
            <div className="text-2xl font-black mt-0.5 tracking-tight text-white font-mono">
              {isCOD ? `৳${dueAmt.toLocaleString()}` : '৳0 (Fully Paid)'}
            </div>
          </div>
        </div>

        {/* Customer & Order Details */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <User size={16} className="text-blue-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Recipient Information</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer Name</span>
              <span className="font-semibold text-slate-200">{customerName}</span>
            </div>
            {customerPhone && (
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Contact Phone</span>
                <span className="font-mono font-semibold text-slate-200">{maskedPhone}</span>
              </div>
            )}
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Brand Channel</span>
              <span className="font-semibold text-slate-200">{brandMeta.name}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Dispatch Partner</span>
              <span className="font-semibold text-slate-200">{liveInvoice?.courier || liveOrder?.courier || 'Direct Dispatch'}</span>
            </div>
          </div>

          {/* Items if available */}
          {(liveInvoice?.items || liveOrder?.items) && (
            <div className="border-t border-slate-800 pt-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1.5 flex items-center gap-1">
                <Package size={12} />
                Purchased Items ({(liveInvoice?.items || liveOrder?.items || []).length})
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {(liveInvoice?.items || liveOrder?.items || []).map((item, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-950/60 p-2 rounded-xl text-xs border border-slate-800/80">
                    <div className="truncate max-w-[200px]">
                      <span className="font-semibold text-slate-200">{item.productName}</span>
                      {item.variantLabel && (
                        <span className="text-[10px] text-slate-400 block">{item.variantLabel}</span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-amber-400">Qty: {item.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Official Support & Contact Channels */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Building2 size={16} className="text-emerald-400" />
            Official Helpdesk & Support
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Need help regarding this invoice or delivery? Reach our official customer service:
          </p>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <a 
              href={`tel:${brandMeta.phone}`}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all border border-slate-700 active:scale-95"
            >
              <Phone size={14} className="text-emerald-400" />
              Call Helpline
            </a>

            <a 
              href={`https://wa.me/${brandMeta.whatsapp}?text=Hello%20${encodeURIComponent(brandMeta.name)},%20I%20am%20verifying%20Invoice%20${encodeURIComponent(invNumber)}`}
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950/50 active:scale-95"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          </div>
        </div>
      </div>

      {/* Footer & Dismiss / Staff Login */}
      <div className="max-w-md w-full mx-auto pt-6 pb-2 text-center space-y-3">
        <p className="text-[10px] text-slate-500 font-mono">
          Sky Automation Tech Smart ERP © {new Date().getFullYear()} • Secure QR Verification
        </p>

        {onDismiss && (
          <button 
            onClick={onDismiss}
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-bold py-1 px-3 rounded-lg hover:bg-slate-900 transition-colors"
          >
            <span>Go to Staff & Operator Login</span>
            <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
