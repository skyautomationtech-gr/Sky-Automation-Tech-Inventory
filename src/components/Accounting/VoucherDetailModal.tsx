import React from 'react';
import { X, Printer, Calendar, Tag, User, Hash, FileText } from 'lucide-react';
import { AccountingVoucher } from '../../types';

interface VoucherDetailModalProps {
  voucher: AccountingVoucher | null;
  onClose: () => void;
}

export const VoucherDetailModal: React.FC<VoucherDetailModalProps> = ({ voucher, onClose }) => {
  if (!voucher) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalDebit = voucher.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
  const totalCredit = voucher.entries.reduce((sum, e) => sum + (e.credit || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl text-slate-100 overflow-hidden print:bg-white print:text-black print:border-none print:shadow-none">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 print:border-b-2 print:border-black">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-400 font-bold print:text-slate-700">
              হিসাব ভাউচার (Accounting Voucher)
            </div>
            <h2 className="text-lg font-bold text-white font-mono print:text-black">
              {voucher.voucherNo}
            </h2>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              title="প্রিন্ট করুন"
            >
              <Printer size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Info Grid */}
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-950/50 p-3.5 rounded-xl border border-slate-800/80 print:bg-gray-50 print:border-gray-200">
            <div>
              <span className="text-slate-400 block print:text-gray-500">ভাউচার ধরণ:</span>
              <span className="font-semibold text-amber-400 print:text-black">{voucher.voucherType} Voucher</span>
            </div>
            <div>
              <span className="text-slate-400 block print:text-gray-500">তারিখ:</span>
              <span className="font-semibold text-slate-200 print:text-black">{voucher.date}</span>
            </div>
            <div>
              <span className="text-slate-400 block print:text-gray-500">ব্র্যান্ড:</span>
              <span className="font-semibold text-slate-200 print:text-black">{voucher.subBrand || 'General / All'}</span>
            </div>
            <div>
              <span className="text-slate-400 block print:text-gray-500">এন্ট্রি করেছেন:</span>
              <span className="font-semibold text-slate-200 print:text-black">{voucher.createdBy}</span>
            </div>
          </div>

          {voucher.reference && (
            <div className="text-xs text-slate-300 bg-slate-800/30 px-3 py-1.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-medium">রেফারেন্স / বিল নং: </span>
              <span className="font-mono">{voucher.reference}</span>
            </div>
          )}

          {/* Entries Table */}
          <div className="border border-slate-800 rounded-xl overflow-hidden print:border-black">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 print:bg-gray-100 print:text-black">
                <tr>
                  <th className="px-3 py-2.5">অ্যাকাউন্টের বিবরণ</th>
                  <th className="px-3 py-2.5 text-right">ডেবিট (৳)</th>
                  <th className="px-3 py-2.5 text-right">ক্রেডিট (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-gray-200">
                {voucher.entries.map((entry, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/20">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-200 print:text-black">
                        {entry.accountName}
                      </div>
                      {entry.narration && (
                        <div className="text-[11px] text-slate-400 italic mt-0.5 print:text-gray-500">
                          {entry.narration}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-emerald-400 print:text-black">
                      {entry.debit > 0 ? `৳${entry.debit.toLocaleString()}` : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose-400 print:text-black">
                      {entry.credit > 0 ? `৳${entry.credit.toLocaleString()}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-950 font-bold border-t border-slate-700 print:bg-gray-100 print:border-black">
                <tr>
                  <td className="px-3 py-2.5 text-slate-300 print:text-black">মোট (Total):</td>
                  <td className="px-3 py-2.5 text-right font-mono text-emerald-400 print:text-black">
                    ৳{totalDebit.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-rose-400 print:text-black">
                    ৳{totalCredit.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {voucher.notes && (
            <div className="text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
              <span className="text-slate-400 block font-medium mb-1">নোট / মন্তব্য:</span>
              <p className="text-slate-300 whitespace-pre-wrap">{voucher.notes}</p>
            </div>
          )}

          {/* Signatures for Print */}
          <div className="hidden print:grid grid-cols-2 gap-8 pt-12 mt-8 border-t border-gray-300 text-center text-xs">
            <div>
              <div className="border-t border-black pt-1">প্রস্তুতকারী (Prepared By)</div>
            </div>
            <div>
              <div className="border-t border-black pt-1">অনুমোদনকারী (Authorized Signature)</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            বন্ধ করুন
          </button>
        </div>
      </div>
    </div>
  );
};
