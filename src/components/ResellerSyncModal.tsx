import React, { useState, useEffect } from 'react';
import { 
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Database, 
  Globe, 
  Sparkles, 
  ArrowRight,
  Package,
  Layers,
  Settings,
  Sliders,
  Check
} from 'lucide-react';
import { Product } from '../types';
import { 
  getResellerSyncConfig, 
  saveResellerSyncConfig, 
  ResellerSyncConfig, 
  pushProductToReseller, 
  bulkSyncAllProductsToReseller 
} from '../services/resellerSync';

interface ResellerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
}

export const ResellerSyncModal: React.FC<ResellerSyncModalProps> = ({
  isOpen,
  onClose,
  products
}) => {
  const [config, setConfig] = useState<ResellerSyncConfig>(getResellerSyncConfig());
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [testStatus, setTestStatus] = useState<{ type: 'idle' | 'success' | 'error'; message: string }>({
    type: 'idle',
    message: ''
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(getResellerSyncConfig());
      setTestStatus({ type: 'idle', message: '' });
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setIsSaving(true);
    saveResellerSyncConfig(config);
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleTestConnection = async () => {
    if (!config.secondaryProjectId && !config.webhookUrl) {
      setTestStatus({
        type: 'error',
        message: 'অনুগ্রহ করে Sky App-এর Firebase Project ID অথবা Webhook URL ইনপুট দিন।'
      });
      return;
    }

    setTestStatus({ type: 'idle', message: 'কানেকশন টেস্ট করা হচ্ছে...' });

    // Pick a test product or dummy payload
    const testProd: Product = products[0] || {
      id: 'test-sync-probe',
      name: 'Sky App Test Sync Product',
      sku: 'TEST-SKU-001',
      category: 'Test Category',
      brand: 'SAT',
      subBrand: 'SAT',
      costPrice: 500,
      sellingPrice: 850,
      variants: [{ id: 'tv1', color: 'Black', model: 'Standard', stock: 10 }],
      archived: false,
      createdAt: Date.now()
    };

    // Temporarily save to test
    saveResellerSyncConfig(config);
    const result = await pushProductToReseller(testProd, 'update');

    if (result.success) {
      setTestStatus({
        type: 'success',
        message: `সংযোগ সফল! ${result.message}`
      });
    } else {
      setTestStatus({
        type: 'error',
        message: `সংযোগ ব্যর্থ: ${result.message}`
      });
    }
  };

  const handleBulkSyncNow = async () => {
    if (!config.enabled) {
      alert('অনুগ্রহ করে প্রথমে "Sky App-এ প্রোডাক্ট অটো-সিঙ্ক চালু করুন" অপশনটি অন (Enable) করুন এবং সেভ করুন।');
      return;
    }

    setIsSyncing(true);
    setSyncProgress({ current: 0, total: products.length });

    saveResellerSyncConfig(config);

    const res = await bulkSyncAllProductsToReseller(products, (current, total) => {
      setSyncProgress({ current, total });
    });

    setIsSyncing(false);
    setTestStatus({
      type: 'success',
      message: `সম্পূর্ণ সিঙ্ক সম্পন্ন! মোট ${res.syncedCount} টি প্রোডাক্ট Sky App Firebase প্রজেক্টে সফলভাবে সিঙ্ক হয়েছে। (ব্যর্থ: ${res.errorsCount})`
    });
  };

  const approvedProductsCount = products.filter(p => !p.archived && p.status !== 'pending').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 sm:p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
          
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl text-indigo-400">
              <RefreshCw size={24} className={isSyncing ? "animate-spin text-indigo-300" : ""} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black tracking-tight">Sky Inventory App Sync Integration</h2>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Product-Only Channel
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                আলাদা Firebase প্রজেক্টের সাথে ইনভেন্টরির প্রোডাক্ট অটো-সিঙ্ক সেটিং
              </p>
            </div>
          </div>
        </div>

        {/* Strict Scope Guarantee Notice */}
        <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-start gap-3">
          <ShieldCheck size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <p className="font-bold">🔒 শুধুমাত্র প্রোডাক্ট ডাটা সিঙ্ক গ্যারান্টি (Strict Product-Only Privacy):</p>
            <p className="text-amber-800 leading-relaxed">
              এই ফিচারটি সক্রিয় করা হলে <strong>শুধুমাত্র প্রোডাক্টের তথ্য</strong> (নাম, ছবি, বিক্রয় মূল্য, পাইকারি মূল্য, কালার/সাইজ ভ্যারিয়েন্ট ও স্টক সংখ্যা) আপনার এক্সটার্নাল অ্যাপের ডাটাবেজে যাবে। 
              <span className="font-bold text-amber-950 underline ml-1">আপনার কোনো ক্যাশ বিক্রয়, কাস্টমার লিস্ট, অর্ডার ভলিউম, ইনভয়েস বা ইনকাম-এক্সপেন্সের ডাটা পাঠানো হবে না।</span>
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[70vh] overflow-y-auto">

          {/* Master Enable Toggle */}
          <div className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Sky App-এ প্রোডাক্ট অটো-সিঙ্ক চালুকরণ</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ইনভেন্টরিতে নতুন প্রোডাক্ট এড বা আপডেট করলে সাথে সাথে এক্সটার্নাল অ্যাপে আপডেট হয়ে যাবে
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={config.enabled} 
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} 
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Configuration Settings Form */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Database size={16} className="text-indigo-600" />
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Sky App Firebase Project Config</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Secondary Firebase Project ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. sky-inventory-app-123"
                  value={config.secondaryProjectId}
                  onChange={(e) => setConfig({ ...config, secondaryProjectId: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  আপনার Sky App-এর Firebase Project ID
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  External App Firestore Collection Name
                </label>
                <input
                  type="text"
                  placeholder="default: products"
                  value={config.secondaryCollectionName || 'products'}
                  onChange={(e) => setConfig({ ...config, secondaryCollectionName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  ডিফল্ট কালেকশন: <code className="bg-slate-100 px-1 py-0.5 rounded">products</code>
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                (Optional) Custom Webhook / REST Endpoint URL
              </label>
              <input
                type="url"
                placeholder="https://sky-reseller.com/api/webhooks/product-sync"
                value={config.webhookUrl || ''}
                onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-mono focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                আপনার Reseller অ্যাপে যদি আলাদা REST API বা Webhook লিঙ্ক থাকে
              </p>
            </div>

            {/* Sync Options Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.syncPrices}
                  onChange={(e) => setConfig({ ...config, syncPrices: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-700">বিক্রয় ও পাইকারি মূল্য সিঙ্ক করুন</span>
              </label>

              <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/60 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.syncStock}
                  onChange={(e) => setConfig({ ...config, syncStock: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-700">লাইভ স্টক সংখ্যা ও ভ্যারিয়েন্ট সিঙ্ক করুন</span>
              </label>
            </div>
          </div>

          {/* Test connection & Feedback status */}
          {testStatus.message && (
            <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
              testStatus.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : testStatus.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-indigo-50 border-indigo-200 text-indigo-800'
            }`}>
              {testStatus.type === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : testStatus.type === 'error' ? (
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
              ) : (
                <RefreshCw size={16} className="animate-spin text-indigo-600 shrink-0" />
              )}
              <span className="font-medium">{testStatus.message}</span>
            </div>
          )}

          {/* Sync Actions Bar */}
          <div className="bg-slate-900 text-white p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Package size={16} className="text-indigo-400" />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Bulk Product Synchronization
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                আপনার সিস্টেমে বর্তমানে মোট <strong>{approvedProductsCount}</strong> টি একটিভ প্রোডাক্ট রয়েছে
              </p>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleTestConnection}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>test কানেকশন</span>
              </button>

              <button
                type="button"
                onClick={handleBulkSyncNow}
                disabled={isSyncing || !config.enabled}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  isSyncing
                    ? 'bg-indigo-700 text-indigo-200 cursor-not-allowed'
                    : !config.enabled
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/20 active:scale-95'
                }`}
              >
                <Sparkles size={14} />
                <span>{isSyncing ? `সিঙ্ক হচ্ছে (${syncProgress.current}/${syncProgress.total})...` : 'সকল প্রোডাক্ট সিঙ্ক করুন 🚀'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            {savedSuccess && (
              <span className="text-emerald-600 font-bold flex items-center gap-1 animate-in fade-in">
                <Check size={14} /> সেটিংস সংরক্ষিত হয়েছে!
              </span>
            )}
            {config.lastSyncedAt && !savedSuccess && (
              <span>সর্বশেষ অল প্রোডাক্ট সিঙ্ক: {new Date(config.lastSyncedAt).toLocaleString()}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              বন্ধ করুন
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check size={14} />
              <span>সেটিংস সেভ করুন</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
