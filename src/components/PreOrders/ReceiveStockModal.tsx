import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  Link2,
  PackageCheck,
  PackagePlus,
  ShieldAlert,
} from 'lucide-react';
import {
  Brand,
  Category,
  PreOrder,
  PreOrderPrivateCost,
  Product,
  UserProfile,
} from '../../types';
import { formatBDT, isPreOrderAdminRole } from '../../preOrders/constants';
import { calculatePreOrderReceiptCost } from '../../preOrders/calculations';
import {
  actorFromUser,
  receivePreOrderStock,
  ReceivePreOrderStockResult,
} from '../../firebase/preOrderDb';
import {
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '../../design-system';

export interface ReceiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreOrder | null;
  privateCost?: PreOrderPrivateCost | null;
  user: UserProfile;
  categories: Category[];
  brands: Brand[];
  products: Product[];
  onSuccess: (res: ReceivePreOrderStockResult) => void;
}

export const ReceiveStockModal: React.FC<ReceiveStockModalProps> = ({
  isOpen,
  onClose,
  order,
  privateCost,
  user,
  categories,
  brands,
  products,
  onSuccess,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const isSuperAdmin =
    user.role === 'superadmin' || (user.role as string) === 'super_admin';

  const [receivedQty, setReceivedQty] = useState<string>('0');
  const [damagedQty, setDamagedQty] = useState<string>('0');
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newSku, setNewSku] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newBrand, setNewBrand] = useState<string>('');
  const [newColor, setNewColor] = useState<string>('');
  const [newModel, setNewModel] = useState<string>('');
  const [newReorderThreshold, setNewReorderThreshold] = useState<string>('2');
  const [note, setNote] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => !p.archived),
    [products]
  );

  const prevGood = Math.max(0, Number(order?.stockReceivedQty) || 0);
  const prevDamaged = Math.max(0, Number(order?.damagedQty) || 0);
  const remaining = Math.max(0, (order?.qty || 0) - (prevGood + prevDamaged));

  useEffect(() => {
    if (isOpen && order) {
      setIdempotencyKey(
        `RCV_${order.id}_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`
      );
      setReceivedQty(String(remaining > 0 ? remaining : 0));
      setDamagedQty('0');
      setNote('');
      setErrorMsg('');

      if (order.linkedProductId) {
        setMode('existing');
        setSelectedProductId(order.linkedProductId);
        setSelectedVariantId(order.linkedVariantId || '');
      } else {
        // Attempt SKU or exact name match
        const matched = activeProducts.find(
          (p) =>
            (order.sku && p.sku?.toLowerCase() === order.sku.toLowerCase()) ||
            p.name.toLowerCase() === order.productName.toLowerCase()
        );
        if (matched) {
          setMode('existing');
          setSelectedProductId(matched.id);
          setSelectedVariantId(matched.variants?.[0]?.id || '');
        } else {
          setMode('new');
          setSelectedProductId('');
          setSelectedVariantId('');
        }
      }

      setNewName(order.productName || '');
      setNewSku(order.sku || '');
      setNewCategory(order.category || categories[0]?.name || 'General');
      setNewBrand(brands[0]?.name || order.subBrand);
      setNewColor(order.color || order.variant || 'Standard');
      setNewModel(order.model || 'Default');
      setNewReorderThreshold('2');
    }
  }, [isOpen, order, remaining, activeProducts, categories, brands]);

  const chosenProduct = useMemo(
    () => activeProducts.find((p) => p.id === selectedProductId) || null,
    [activeProducts, selectedProductId]
  );

  useEffect(() => {
    if (chosenProduct && mode === 'existing') {
      const hasVar = (chosenProduct.variants || []).some(
        (v) => v.id === selectedVariantId
      );
      if (!hasVar) {
        setSelectedVariantId(chosenProduct.variants?.[0]?.id || '');
      }
    }
  }, [chosenProduct, mode, selectedVariantId]);

  const goodNum = Math.max(0, Math.round(Number(receivedQty) || 0));
  const dmgNum = Math.max(0, Math.round(Number(damagedQty) || 0));

  const costPreview = useMemo(() => {
    if (!order) return null;
    return calculatePreOrderReceiptCost({
      orderedQty: order.qty,
      receivedGoodQty: goodNum,
      damagedQty: dmgNum,
      chinaUnitCost: Number(privateCost?.chinaUnitCost || 0),
      actualShippingCost: Number(privateCost?.actualShippingCost || 0),
      estimatedShippingCost: Number(privateCost?.shippingCost || 0),
    });
  }, [order, privateCost, goodNum, dmgNum]);

  if (!order) return null;

  const productOptions = activeProducts.map((p) => ({
    value: p.id,
    label: `${p.name} (${p.sku || p.subBrand})`,
    sublabel: `${p.subBrand} • Stock: ${p.totalStock || 0} (Avail: ${Math.max(
      0,
      (p.totalStock || 0) - (p.reservedQty || 0)
    )})`,
  }));

  const variantOptions = (chosenProduct?.variants || []).map((v) => ({
    value: v.id,
    label: `${v.color || 'Std'} / ${v.model || 'Def'} (${v.stock || 0} pcs)`,
    sublabel: `Reserved: ${v.reservedQty || 0}`,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (goodNum + dmgNum <= 0) {
      setErrorMsg('Enter at least 1 good or damaged unit to receive.');
      return;
    }
    if (goodNum + dmgNum > remaining) {
      setErrorMsg(
        `Cannot receive ${goodNum + dmgNum} units; only ${remaining} remaining of ${order.qty} ordered.`
      );
      return;
    }
    if (dmgNum > 0 && !isAdmin) {
      setErrorMsg('Only Admin or Super Admin can log damaged pre-order stock.');
      return;
    }
    if (mode === 'existing' && !selectedProductId) {
      setErrorMsg('Select an existing product or switch to Auto-Create New Product.');
      return;
    }
    if (mode === 'new' && !newName.trim()) {
      setErrorMsg('Product name is required to create a new catalog item.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await receivePreOrderStock(
        order.id,
        {
          receivedQty: goodNum,
          damagedQty: dmgNum,
          productId: mode === 'existing' ? selectedProductId : undefined,
          variantId:
            mode === 'existing' && selectedVariantId
              ? selectedVariantId
              : undefined,
          newProductDetails:
            mode === 'new'
              ? {
                  name: newName.trim(),
                  sku: newSku.trim() || undefined,
                  category: newCategory.trim() || 'General',
                  brand: newBrand.trim() || order.subBrand,
                  color: newColor.trim() || 'Standard',
                  model: newModel.trim() || 'Default',
                  reorderThreshold: Math.max(0, Number(newReorderThreshold) || 2),
                }
              : undefined,
          note: note.trim() || undefined,
          idempotencyKey,
        },
        actorFromUser(user)
      );

      toast.success(
        `Received ${goodNum} good${dmgNum > 0 ? ` + ${dmgNum} damaged` : ''} unit(s) for ${order.preOrderNumber}.`
      );
      if (res.createdNewProduct && res.productStatus === 'pending_review') {
        toast.info(
          'New catalog product created with Pending Review status until Super Admin approves.'
        );
      }
      if (res.trackingSyncWarning) {
        toast.warning(res.trackingSyncWarning);
      }
      onSuccess(res);
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to receive stock.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !submitting && onClose()}
      title="Receive Pre-Order Stock into Inventory"
      subtitle={`${order.preOrderNumber} • ${order.productName}`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Progress Banner */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2 text-xs text-center">
          <div>
            <div className="text-slate-400">Ordered</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
              {order.qty} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Prev Good</div>
            <div className="font-mono font-bold text-emerald-600">
              {prevGood} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Prev Damaged</div>
            <div className="font-mono font-bold text-rose-600">
              {prevDamaged} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Remaining</div>
            <div className="font-mono font-bold text-[#93741E] dark:text-[#E2C255]">
              {remaining} pcs
            </div>
          </div>
        </div>

        {/* Good & Damaged Quantity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Good Stock Received (Reserved for Customer)"
            required
            hint={`Max ${remaining} units remaining`}
          >
            <Input
              type="number"
              min={0}
              max={remaining}
              value={receivedQty}
              onChange={(e) => setReceivedQty(e.target.value)}
            />
          </FormField>

          <FormField
            label="Damaged / Missing Units"
            hint={
              isAdmin
                ? 'Recorded to Company Losses if > 0'
                : 'Admin/Super Admin required for damaged qty'
            }
          >
            <Input
              type="number"
              min={0}
              max={remaining}
              disabled={!isAdmin}
              value={damagedQty}
              onChange={(e) => setDamagedQty(e.target.value)}
            />
          </FormField>
        </div>

        {/* Reservation + Landed Cost Preview */}
        {costPreview && (
          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-[#D4AF37]" />
                Stock &amp; Landed Cost Summary
              </span>
              <Badge variant="gold" size="xs">
                Auto-Reserved for {order.preOrderNumber}
              </Badge>
            </div>
            {privateCost ? (
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-amber-900 dark:text-amber-200">
                <div>
                  Unit Landed: <strong>{formatBDT(costPreview.unitLandedCost)}</strong>
                </div>
                <div>
                  Good Inventory: <strong>{formatBDT(costPreview.totalGoodLandedCost)}</strong>
                </div>
                {dmgNum > 0 && (
                  <div className="text-rose-700 dark:text-rose-300">
                    Loss Posting: <strong>{formatBDT(costPreview.damagedCostLoss)}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-amber-800 dark:text-amber-300">
                Good units will be added to warehouse stock and locked under reserved inventory for this customer.
              </div>
            )}
          </div>
        )}

        {/* Product Target Mode Toggle */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={Boolean(order.linkedProductId)}
              onClick={() => setMode('existing')}
              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                mode === 'existing'
                  ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#93741E] dark:text-[#E2C255]'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Link Existing Catalog Product
            </button>
            <button
              type="button"
              disabled={Boolean(order.linkedProductId)}
              onClick={() => setMode('new')}
              className={`flex-1 py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                mode === 'new'
                  ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#93741E] dark:text-[#E2C255]'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <PackagePlus className="w-3.5 h-3.5" />
              Auto-Create Catalog Product
            </button>
          </div>

          {mode === 'existing' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <FormField label="Target Product" required>
                <Select
                  options={productOptions}
                  value={selectedProductId}
                  onChange={(val) => setSelectedProductId(val)}
                  placeholder="Search product..."
                  disabled={Boolean(order.linkedProductId)}
                />
              </FormField>
              <FormField label="Target Variant" required>
                <Select
                  options={variantOptions}
                  value={selectedVariantId}
                  onChange={(val) => setSelectedVariantId(val)}
                  placeholder="Select variant..."
                  searchable={false}
                  disabled={!chosenProduct || Boolean(order.linkedVariantId)}
                />
              </FormField>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  New Product Details (CODE128 Barcode auto-generated)
                </span>
                <Badge variant={isSuperAdmin ? 'success' : 'warning'} size="xs">
                  {isSuperAdmin ? 'Auto-Approved' : 'Pending Super Admin Review'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Product Name" required>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Product Name"
                  />
                </FormField>
                <FormField label="SKU (Optional — auto-generated if empty)">
                  <Input
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="SKU"
                  />
                </FormField>
                <FormField label="Category">
                  <Input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Category"
                  />
                </FormField>
                <FormField label="Brand">
                  <Input
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                    placeholder="Brand"
                  />
                </FormField>
                <FormField label="Color / Variant">
                  <Input
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    placeholder="Standard"
                  />
                </FormField>
                <FormField label="Model">
                  <Input
                    value={newModel}
                    onChange={(e) => setNewModel(e.target.value)}
                    placeholder="Default"
                  />
                </FormField>
              </div>
            </div>
          )}
        </div>

        <FormField label="Receipt / Warehouse Inspection Note (Optional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Box intact, serials checked at Dhaka warehouse"
          />
        </FormField>

        {!isSuperAdmin && mode === 'new' && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              Auto-created products enter Product Management as <strong>Pending Review</strong> until Super Admin approval, while remaining reserved for this Pre-Order.
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="secondary"
            disabled={submitting}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={submitting}
            leftIcon={<PackageCheck className="w-4 h-4" />}
          >
            Confirm &amp; Receive Stock
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ReceiveStockModal;
