import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CreditCard,
  Globe,
  HelpCircle,
  Lock,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { Card } from '../../design-system';

export const PreOrderHelpView: React.FC = () => {
  const [lang, setLang] = useState<'en' | 'bn'>('en');

  const workflowSteps =
    lang === 'en'
      ? [
          {
            step: '1–2',
            title: 'Advance Received / Order Confirmed',
            desc: 'Order opens as Advance Received when an initial advance > ৳0 is recorded, or Order Confirmed if ৳0 advance. Bangladesh phone numbers normalize to 01XXXXXXXXX.',
          },
          {
            step: '3–6',
            title: 'China Procurement & Logistics',
            desc: 'Ordered from China → China Warehouse → International Shipment → Customs Clearance. Forwarder batch updates, China/BD tracking numbers, and arrival ETA live under Shipment Tracking.',
          },
          {
            step: '7–8',
            title: 'Arrived in Bangladesh → Received in Stock',
            desc: 'Mandatory Receive Stock step adds good units to warehouse inventory as reserved stock for this pre-order and logs landed unit cost. Damaged units log to Company Losses (Admin).',
          },
          {
            step: '9–11',
            title: 'Convert to Sale/Invoice → Ready → Out for Delivery → Delivered',
            desc: 'Converting creates an official Invoice (SAT/GZ/RTX-INV), transfers verified advance so customers are never double-charged, and recognizes sales revenue & COGS.',
          },
        ]
      : [
          {
            step: '১–২',
            title: 'Advance Received / Order Confirmed',
            desc: 'প্রাথমিক অগ্রিম পেমেন্ট (৳০-এর বেশি) থাকলে Advance Received এবং ৳০ অগ্রিম হলে Order Confirmed হিসেবে শুরু হয়। ফোন নম্বর স্বয়ংক্রিয়ভাবে 01XXXXXXXXX ফরম্যাটে যাচাই হয়।',
          },
          {
            step: '৩–৬',
            title: 'চায়না সংগ্রহ ও ইন্টারন্যাশনাল শিপমেন্ট',
            desc: 'Ordered from China → China Warehouse → International Shipment → Customs Clearance। ফরওয়ার্ডার ব্যাচ, ট্র্যাকিং নম্বর ও পৌঁছানোর সম্ভাব্য তারিখ শিপমেন্ট ট্র্যাকিংয়ে আপডেট হয়।',
          },
          {
            step: '৭–৮',
            title: 'বাংলাদেশে আগমন → স্টক রিসিভ',
            desc: 'Receive Stock ব্যবহার করে ভালো পণ্য ওয়্যারহাউস ইনভেন্টরিতে নির্দিষ্ট প্রি-অর্ডারের জন্য রিজার্ভ হিসেবে যুক্ত হয় এবং ল্যান্ডেড কস্ট হিসাব হয়। ক্ষতিগ্রস্ত পণ্য অ্যাডমিনের মাধ্যমে Company Losses-এ রেকর্ড হয়।',
          },
          {
            step: '৯–১১',
            title: 'ইনভয়েস কনভার্ট → ডেলিভারির জন্য প্রস্তুত → ডেলিভার্ড',
            desc: 'কনভার্ট করলে অফিসিয়াল ইনভয়েস (SAT/GZ/RTX-INV) তৈরি হয়, ভেরিফায়েড অগ্রিম সমন্বয় হয় যাতে ডাবল চার্জ না পড়ে, এবং বিক্রয় আয় ও COGS হিসাব হয়।',
          },
        ];

  const rules =
    lang === 'en'
      ? [
          {
            icon: CreditCard,
            title: 'Append-Only Payment Ledger & Dual Verification',
            body: 'Recorded payments are never overwritten or deleted. Non-cash deposits remain "pending" until an authorized Manager/Admin (different from the recorder) verifies them. Only verified deposits reduce Customer Due.',
          },
          {
            icon: RefreshCw,
            title: 'Cancellation & Refund Reconciliation',
            body: 'Cancelled orders with verified advance use Cancel & Reconcile to process Customer Refund (full/partial/retained charge), Supplier settlement (receivable/loss/keep), and Stock release or supplier return atomically.',
          },
          {
            icon: Lock,
            title: 'Customer Public Tracking Portal Security',
            body: 'Customers never read the internal preOrders collection. Each link writes strictly whitelisted, non-sensitive status/payment progress into publicTracking/{256-bit token}. Guessable PO numbers never grant access.',
          },
          {
            icon: PackageCheck,
            title: 'Cost, Profit & Supplier Access Isolation',
            body: 'China purchase prices, freight/customs breakdowns, supplier disbursements, and profit columns are stored under private sub-documents and hidden from UI and exports unless preOrderViewProfit / preOrderSupplier are granted.',
          },
        ]
      : [
          {
            icon: CreditCard,
            title: 'অপরিবর্তনীয় পেমেন্ট লেজার ও ভেরিফিকেশন',
            body: 'পেমেন্ট রেকর্ড কখনো মুছে ফেলা বা সম্পাদনা করা যায় না। নন-ক্যাশ পেমেন্ট "pending" থাকে যতক্ষণ না ভিন্ন কোনো অনুমোদিত ম্যানেজার/অ্যাডমিন তা যাচাই করেন। শুধু ভেরিফায়েড পেমেন্টই বকেয়া কমায়।',
          },
          {
            icon: RefreshCw,
            title: 'বাতিল ও রিফান্ড সমন্বয় (Cancel & Reconcile)',
            body: 'ভেরিফায়েড অগ্রিমসহ অর্ডার বাতিল করলে কাস্টমার রিফান্ড (সম্পূর্ণ/আংশিক/চার্জ রেখে), সাপ্লায়ার সেটেলমেন্ট (প্রাপ্য/ক্ষতি) এবং স্টক সাধারণ ইনভেন্টরিতে মুক্ত বা ফেরত দেওয়া এক লেনদেনেই সম্পন্ন হয়।',
          },
          {
            icon: Lock,
            title: 'পাবলিক ট্র্যাকিং লিংক নিরাপত্তা',
            body: 'পাবলিক পেজ কখনো মূল preOrders ডাটা পড়ে না। প্রতিটি লিংক শুধুমাত্র নিরাপদ ও অনুমোদিত স্ট্যাটাস/পেমেন্ট তথ্য publicTracking/{256-bit token}-এ রাখে। অর্ডার নম্বর (PO-0001) দিয়ে কখনোই ট্র্যাকিং দেখা যায় না।',
          },
          {
            icon: PackageCheck,
            title: 'খরচ, লাভ ও সাপ্লায়ার তথ্যের গোপনীয়তা',
            body: 'চায়না ক্রয়মূল্য, শিপিং/কাস্টমস খরচ, সাপ্লায়ার পেমেন্ট ও লাভের হিসাব আলাদা সুরক্ষিত নথিতে থাকে এবং অনুমতি (preOrderViewProfit / preOrderSupplier) ছাড়া ড্যাশবোর্ড বা রিপোর্টে দেখা যায় না।',
          },
        ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen size={20} className="text-amber-500" />
            <span>{lang === 'en' ? 'Pre-Order Operations Guide' : 'প্রি-অর্ডার অপারেশন গাইড'}</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {lang === 'en'
              ? 'Standard operating workflow, accounting safeguards, and public tracking rules.'
              : 'স্ট্যান্ডার্ড কাজের ধাপ, একাউন্টিং নিয়ম ও কাস্টমার ট্র্যাকিং নিরাপত্তা নির্দেশিকা।'}
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              lang === 'en'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('bn')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              lang === 'bn'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            বাংলা
          </button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Truck size={18} className="text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            {lang === 'en' ? '11-Stage Pre-Order Lifecycle' : 'প্রি-অর্ডারের ১১ ধাপের ওয়ার্কফ্লো'}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflowSteps.map((item) => (
            <div
              key={item.step}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  {lang === 'en' ? `Stages ${item.step}` : `ধাপ ${item.step}`}
                </span>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">{item.title}</h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.title} className="p-5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <Icon size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{r.title}</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{r.body}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-400">
          <HelpCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <p>
            {lang === 'en'
              ? 'Tip: Time-based reminders (Arrival Soon, Arrival Today, Delayed Shipments, Due Balance) automatically refresh when staff open the app or Notifications & Reminders Center, and WhatsApp/SMS links prepare pre-filled messages in one click.'
              : 'টিপস: সময়-ভিত্তিক রিমাইন্ডার (শীঘ্রই আগমন, আজ আগমন, বিলম্বিত শিপমেন্ট, বকেয়া) স্টাফ অ্যাপ বা নোটিফিকেশন সেন্টার খুললেই আপডেট হয় এবং এক ক্লিকে WhatsApp/SMS মেসেজ তৈরি করা যায়।'}
          </p>
        </div>
      </Card>
    </div>
  );
};

export default PreOrderHelpView;
