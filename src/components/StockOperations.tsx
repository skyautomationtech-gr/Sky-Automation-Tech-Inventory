import React, { useState, useEffect } from 'react';
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  SlidersHorizontal, 
  Search, 
  Calendar, 
  User, 
  FileText, 
  Truck, 
  Plus, 
  AlertCircle,
  Clock,
  Coins,
  QrCode
} from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { Product, Variant, StockLog, StockLogType, UserProfile } from '../types';
import { addStockLog, updateProduct, getStockLogs } from '../firebase/db';

interface StockOperationsProps {
  products: Product[];
  user: UserProfile | null;
  onRefreshData: () => Promise<void>;
  initialAction?: string; // e.g. "in" automatically pre-selected
  requireCheckIn?: () => boolean;
}

export default function StockOperations({
  products,
  user,
  onRefreshData,
  initialAction = 'in',
  requireCheckIn
}: StockOperationsProps) {
  const isStaff = user?.role === 'staff';

  // Tabs for action selection
  const [activeAction, setActiveAction] = useState<'in' | 'out' | 'adjust' | 'ledger'>(
    initialAction === 'in' ? 'in' : 'ledger'
  );

  // Global Ledger Master List
  const [ledgerLogs, setLedgerLogs] = useState<StockLog[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Selector choices
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedVariantId, setSelectedVariantId] = useState('');
  
  // Fields for Operations
  const [qty, setQty] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [supplierName, setSupplierName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0]);
  
  // Reasons for out/adjust
  const [outReason, setOutReason] = useState<'Sale' | 'Damage' | 'Return' | 'Gift/Sample'>('Sale');
  const [adjustNote, setAdjustNote] = useState('');
  const [physicalCount, setPhysicalCount] = useState<number | ''>('');

  // Feedback states
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Refresh active logs list
  const refreshLedger = async () => {
    setLedgerLoading(true);
    const logs = await getStockLogs();
    setLedgerLogs(logs);
    setLedgerLoading(false);
  };

  useEffect(() => {
    refreshLedger();
  }, []);

  // Pre-fill variant prices on selection
  const selectedProduct = products.find(p => p.id === selectedProductId);
  const selectedVariant = selectedProduct?.variants.find(v => v.id === selectedVariantId);

  useEffect(() => {
    if (selectedProduct) {
      setCostPrice(selectedProduct.costPrice);
      // default first variant
      if (selectedProduct.variants.length > 0 && !selectedVariantId) {
        setSelectedVariantId(selectedProduct.variants[0].id);
      }
    } else {
      setSelectedVariantId('');
    }
  }, [selectedProductId]);

  const resetForm = () => {
    setSelectedProductId('');
    setSelectedVariantId('');
    setQty('');
    setCostPrice('');
    setSupplierName('');
    setRefNo('');
    setOutReason('Sale');
    setAdjustNote('');
    setPhysicalCount('');
    setError('');
  };

  const handleScan = (text: string) => {
    let found = false;
    for (const p of products) {
      if (p.barcodeValue === text) {
        setSelectedProductId(p.id);
        if (p.variants.length > 0) {
          setSelectedVariantId(p.variants[0].id);
        }
        found = true;
        break;
      }
      const v = p.variants.find(v => v.barcodeValue === text);
      if (v) {
        setSelectedProductId(p.id);
        setSelectedVariantId(v.id);
        found = true;
        break;
      }
    }
    if (!found) {
      setError('No product found for scanned barcode.');
    }
    setShowScanner(false);
  };

  // Run Transaction
  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    setError('');
    setSuccess('');

    if (!selectedProductId || !selectedVariantId) {
      setError('Please select a product and specific variant.');
      return;
    }

    if (!selectedProduct || !selectedVariant) {
      setError('Product configuration invalid.');
      return;
    }

    setSubmitting(true);

    try {
      const currentStock = selectedVariant.stock || 0;
      let newStock = currentStock;
      let qtyChange = 0;
      let reasonLabel = '';

      if (activeAction === 'in') {
        if (qty <= 0) {
          setError('Quantity must be greater than zero.');
          setSubmitting(false);
          return;
        }
        qtyChange = qty;
        newStock = currentStock + qty;
        reasonLabel = 'Supplier Purchase';
      } else if (activeAction === 'out') {
        if (qty <= 0) {
          setError('Quantity must be greater than zero.');
          setSubmitting(false);
          return;
        }
        if (qty > currentStock) {
          setError(`Insufficient stock. Current variant inventory is only ${currentStock} units.`);
          setSubmitting(false);
          return;
        }
        qtyChange = -qty;
        newStock = currentStock - qty;
        reasonLabel = outReason;
      } else if (activeAction === 'adjust') {
        if (physicalCount < 0) {
          setError('Physical count cannot be negative.');
          setSubmitting(false);
          return;
        }
        qtyChange = physicalCount - currentStock;
        newStock = physicalCount;
        reasonLabel = `Adjustment: ${adjustNote || 'Physical Stock Audit Count'}`;
      }

      // Update variant stock in Product array
      const updatedVariants = selectedProduct.variants.map(v => 
        v.id === selectedVariantId ? { ...v, stock: newStock } : v
      );

      // Perform update to Product Firestore document
      await updateProduct(selectedProduct.id, {
        variants: updatedVariants
      });

      // Log Stock Entry
      await addStockLog({
        productId: selectedProduct.id,
        productName: `${selectedProduct.name} (${selectedVariant.color} - ${selectedVariant.model})`,
        type: activeAction === 'adjust' ? 'adjustment' : activeAction === 'in' ? 'in' : 'out',
        qty: qtyChange,
        reason: reasonLabel,
        userId: user?.id || 'demo-ops',
        userName: user?.name || 'Operator',
        beforeQty: currentStock,
        afterQty: newStock,
        refNo: refNo || '',
        supplierName: activeAction === 'in' ? supplierName || '' : '',
        purchasePrice: activeAction === 'in' ? (costPrice !== '' ? Number(costPrice) : selectedProduct.costPrice) : undefined
      });

      setSuccess(`Successfully executed inventory transaction! Stock updated.`);
      resetForm();
      await onRefreshData();
      await refreshLedger();
    } catch (err: any) {
      setError(err.message || 'Failed to complete transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter master log
  const filteredLedger = ledgerLogs.filter((log) => {
    const term = ledgerSearch.toLowerCase();
    return log.productName.toLowerCase().includes(term) ||
           log.userName.toLowerCase().includes(term) ||
           (log.refNo && log.refNo.toLowerCase().includes(term)) ||
           log.reason.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      
      {/* Tab Selectors */}
      <div className="border-b border-slate-200 overflow-x-auto no-scrollbar">
        <div className="flex gap-4 min-w-max pb-2 px-1">
          <button
            onClick={() => { setActiveAction('in'); resetForm(); }}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeAction === 'in'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Stock IN
          </button>
          <button
            onClick={() => { setActiveAction('out'); resetForm(); }}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeAction === 'out'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Stock OUT
          </button>
          <button
            onClick={() => { setActiveAction('adjust'); resetForm(); }}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeAction === 'adjust'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Adjustment
          </button>
          <button
            onClick={() => { setActiveAction('ledger'); resetForm(); }}
            className={`pb-2.5 px-1 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeAction === 'ledger'
                ? 'border-amber-400 text-slate-900 font-extrabold'
                : 'border-transparent text-slate-500 hover:text-slate-950'
            }`}
          >
            Master Ledger
          </button>
        </div>
      </div>

      {/* SUCCESS / ERROR NOTIFICATIONS */}
      {success && (
        <div className="bg-teal-50 border border-teal-200 text-teal-700 p-4 rounded-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <CheckCircle2Icon className="text-teal-500" />
          <p className="font-semibold">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-xs flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Master Ledger List View */}
      {activeAction === 'ledger' ? (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-100 flex flex-col sm:flex-row justify-between gap-4">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search ledger by Product, Operator, Ref..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="pl-9 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 text-xs focus:outline-hidden"
              />
            </div>
            <button
              onClick={refreshLedger}
              className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs text-slate-700 cursor-pointer font-bold transition-all"
            >
              Sync Records
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="overflow-x-auto">
              {ledgerLoading ? (
                <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
                  Synchronizing records with secure cloud vault...
                </div>
              ) : filteredLedger.length === 0 ? (
                <div className="py-12 text-center text-slate-400 italic text-xs">
                  No catalog stock logs found matching the search parameters.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <table className="w-full text-left border-collapse hidden md:table">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-mono tracking-wider text-slate-400 uppercase">
                        <th className="py-3 px-4 font-bold">Timestamp</th>
                        <th className="py-3 px-3 font-bold">Product Variant</th>
                        <th className="py-3 px-3 font-bold">Action Type</th>
                        <th className="py-3 px-3 font-bold text-center">Change Qty</th>
                        <th className="py-3 px-3 font-bold text-right">Running Stock</th>
                        <th className="py-3 px-3 font-bold text-center">Reason</th>
                        <th className="py-3 px-4 font-bold text-right">Operator / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                      {filteredLedger.map((log) => {
                        const isAddition = log.type === 'in' || (log.type === 'adjustment' && log.qty > 0);
                        const isReduction = log.type === 'out' || (log.type === 'adjustment' && log.qty < 0);

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                              {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-bold text-slate-900 leading-tight">{log.productName}</span>
                            </td>
                            <td className="py-3 px-3 uppercase text-[10px] font-mono font-bold">
                              <span className={`inline-block px-2 py-0.5 rounded-full ${
                                log.type === 'in' 
                                  ? 'bg-teal-50 text-teal-700' 
                                  : log.type === 'out' 
                                  ? 'bg-red-50 text-red-700' 
                                  : 'bg-slate-100 text-slate-700'
                              }`}>
                                {log.type === 'in' ? 'Stock IN' : log.type === 'out' ? 'Stock OUT' : 'Adjustment'}
                              </span>
                            </td>
                            <td className={`py-3 px-3 text-center font-mono font-black ${
                              isAddition ? 'text-teal-600' : isReduction ? 'text-red-600' : 'text-slate-700'
                            }`}>
                              {isAddition ? `+${log.qty}` : log.qty} units
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                              <span className="text-slate-400">{log.beforeQty}</span> → <span className="font-bold text-slate-800">{log.afterQty}</span>
                            </td>
                            <td className="py-3 px-3 text-center font-medium">
                              {log.reason}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <p className="font-bold text-slate-800">{log.userName}</p>
                              {log.refNo && <p className="text-[10px] text-slate-400 font-mono">Ref: {log.refNo}</p>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Card View */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {filteredLedger.map((log) => {
                      const isAddition = log.type === 'in' || (log.type === 'adjustment' && log.qty > 0);
                      const isReduction = log.type === 'out' || (log.type === 'adjustment' && log.qty < 0);

                      return (
                        <div key={log.id} className="p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-mono text-slate-400">
                                {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </p>
                              <p className="font-bold text-slate-900 text-xs leading-tight">{log.productName}</p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              log.type === 'in' 
                                ? 'bg-teal-50 text-teal-700' 
                                : log.type === 'out' 
                                ? 'bg-red-50 text-red-700' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {log.type}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                            <div className="text-center border-r border-slate-200">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Change</p>
                              <p className={`text-sm font-black font-mono ${isAddition ? 'text-teal-600' : isReduction ? 'text-red-600' : 'text-slate-700'}`}>
                                {isAddition ? `+${log.qty}` : log.qty}
                              </p>
                            </div>
                            <div className="text-center">
                              <p className="text-[9px] font-bold text-slate-400 uppercase">Stock</p>
                              <p className="text-xs font-mono font-bold text-slate-800">
                                {log.beforeQty} → {log.afterQty}
                              </p>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-[10px]">
                            <div>
                              <p className="font-bold text-slate-800">{log.userName}</p>
                              {log.refNo && <p className="text-slate-400">Ref: {log.refNo}</p>}
                            </div>
                            <div className="text-right italic text-slate-500 font-medium">
                              {log.reason}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTION FORMS */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          
          {/* Main Entry form card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            <h3 className="text-sm font-bold text-slate-950 font-sans uppercase tracking-wider flex items-center gap-2">
              {activeAction === 'in' && <ArrowUpRight className="text-teal-500" />}
              {activeAction === 'out' && <ArrowDownRight className="text-red-500" />}
              {activeAction === 'adjust' && <SlidersHorizontal className="text-amber-500" />}
              Create {activeAction === 'in' ? 'Stock IN (Purchase)' : activeAction === 'out' ? 'Stock OUT (Loss/Sale)' : 'Stock Adjustment'} Transaction
            </h3>

            <form onSubmit={handleTransaction} className="space-y-4">
              
              {/* Product selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Select Product
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden"
                    required
                  >
                    <option value="">-- Choose Gadget --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} [{p.sku}]</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="mt-1 p-2 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    <QrCode size={16} />
                  </button>
                </div>
              </div>
              {showScanner && (
                <BarcodeScanner
                  onScan={handleScan}
                  onCancel={() => setShowScanner(false)}
                />
              )}

              {/* Variant selector */}
              {selectedProduct && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Product Variant Color & Model
                  </label>
                  <select
                    value={selectedVariantId}
                    onChange={(e) => setSelectedVariantId(e.target.value)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-700 focus:outline-hidden"
                    required
                  >
                    <option value="">-- Choose Variant --</option>
                    {selectedProduct.variants.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.color} - {v.model} (Currently {v.stock} in stock)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Input for STOCK IN & OUT */}
              {activeAction !== 'adjust' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Quantity (Units)
                    </label>
                    <input
                      type="number"
                      value={qty}
                      onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Purchase Cost Price (৳)
                    </label>
                    <input
                      type="number"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                      required
                      disabled={isStaff}
                    />
                  </div>
                </div>
              ) : (
                /* Input for ADJUSTMENT */
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center font-mono">
                    <p className="text-[10px] text-slate-400">Current Stock</p>
                    <p className="text-sm font-bold text-slate-800 mt-1">
                      {selectedVariant ? `${selectedVariant.stock} units` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Actual Physical Count
                    </label>
                    <input
                      type="number"
                      value={physicalCount}
                      onChange={(e) => setPhysicalCount(e.target.value === '' ? '' : Number(e.target.value))}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Specific fields depending on Action type */}
              {activeAction === 'in' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Anker BD Importers"
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Reference Number (Invoice)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PUR-789"
                      value={refNo}
                      onChange={(e) => setRefNo(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {activeAction === 'out' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Reason for Stock OUT
                    </label>
                    <select
                      value={outReason}
                      onChange={(e) => setOutReason(e.target.value as any)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-2.5 text-xs text-slate-600 focus:outline-hidden"
                      required
                    >
                      <option value="Sale">Sale (Standard retail)</option>
                      <option value="Damage">Damage (Faulty unit)</option>
                      <option value="Return">Return to Manufacturer</option>
                      <option value="Gift/Sample">Gift / Sample Distribution</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Sales / Reference #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. SAT-INV-204"
                      value={refNo}
                      onChange={(e) => setRefNo(e.target.value)}
                      className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {activeAction === 'adjust' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Audit Note / Reason
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Discrepancy from June physical audit"
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-3 rounded-xl text-xs transition-all shadow-md flex justify-center items-center gap-2"
              >
                {submitting ? 'Updating Inventory Records...' : 'Execute Transaction Log'}
              </button>
            </form>
          </div>

          {/* Interactive Info card column */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Clock size={14} className="text-amber-500" />
              Dynamic Context Check
            </h4>
            {selectedProduct && selectedVariant ? (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <span className="text-[10px] font-mono bg-amber-400/20 text-amber-700 px-2 py-0.5 rounded font-bold uppercase">
                    Active Target Selected
                  </span>
                  <h5 className="text-sm font-extrabold text-slate-900 font-sans mt-1">{selectedProduct.name}</h5>
                  <p className="text-xs font-mono text-slate-500">Variant: {selectedVariant.color} / {selectedVariant.model}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400">Live Stock</p>
                    <p className="text-base font-black text-slate-900 mt-1 font-mono">{selectedVariant.stock} pcs</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400">Reorder Alert</p>
                    <p className="text-base font-black text-slate-900 mt-1 font-mono">{selectedProduct.reorderThreshold} pcs</p>
                  </div>
                </div>

                {activeAction === 'in' && qty > 0 && (
                  <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl space-y-1 text-teal-800 text-xs">
                    <p className="font-bold">Summary of proposed transaction:</p>
                    <p>• Stock will increase from <span className="font-bold">{selectedVariant.stock}</span> to <span className="font-bold">{selectedVariant.stock + qty}</span> units.</p>
                    {!isStaff && (
                      <p>• Total investment cost of ৳<span className="font-bold">{(costPrice * qty).toLocaleString()}</span> will be recorded.</p>
                    )}
                  </div>
                )}

                {activeAction === 'out' && qty > 0 && (
                  <div className="p-4 bg-red-50 border border-red-100 rounded-2xl space-y-1 text-red-800 text-xs">
                    <p className="font-bold">Summary of proposed transaction:</p>
                    <p>• Stock will decrease from <span className="font-bold">{selectedVariant.stock}</span> to <span className="font-bold">{selectedVariant.stock - qty}</span> units.</p>
                    <p>• Reason logged as: <span className="font-bold uppercase font-mono">{outReason}</span></p>
                  </div>
                )}

              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 italic">
                <p className="text-xs max-w-xs mx-auto">
                  Select a target gadget product and variant to display dynamic pre-transaction calculations and safety constraints.
                </p>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}

// Simple icons inside
function CheckCircle2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-teal-600 flex-shrink-0"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
