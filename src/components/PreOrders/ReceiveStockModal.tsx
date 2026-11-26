import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Boxes,
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
import {
  computeItemCostMap,
  formatBDT,
  formatPreOrderProductLabel,
  isPreOrderAdminRole,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import { calculateMultiItemReceiptCosts } from '../../preOrders/calculations';
import {
  ReceivePreOrderItemInput,
  ReceivePreOrderStockResult,
  actorFromUser,
  receivePreOrderStock,
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

interface DraftReceiveLine {
  itemId: string;
  productName: string;
  sku: string;
  model: string;
  variant: string;
  color: string;
  category: string;
  imageUrl: string;
  orderedQty: number;
  prevGood: number;
  prevDamaged: number;
  remaining: number;
  lockedProductId: string;
  lockedVariantId: string;
  receivedQty: string;
  damagedQty: string;
  mode: 'existing' | 'new';
  selectedProductId: string;
  selectedVariantId: string;
  newName: string;
  newSku: string;
  newCategory: string;
  newBrand: string;
  newColor: string;
  newModel: string;
  newReorderThreshold: string;
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

  const [lines, setLines] = useState<DraftReceiveLine[]>([]);
  const [note, setNote] = useState<string>('');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const activeProducts = useMemo(
    () => products.filter((p) => !p.archived),
    [products]
  );

  const orderItems = useMemo(() => normalizePreOrderItems(order), [order]);
  const itemCostMap = useMemo(
    () => computeItemCostMap(order, privateCost),
    [order, privateCost]
  );

  const totalOrdered = useMemo(
    () => orderItems.reduce((s, it) => s + (Number(it.qty) || 0), 0),
    [orderItems]
  );
  const totalPrevGood = useMemo(() => {
    if (orderItems.length === 1 && orderItems[0].receivedQty === undefined) {
      return Math.max(0, Number(order?.stockReceivedQty) || 0);
    }
    return orderItems.reduce((s, it) => s + Math.max(0, Number(it.receivedQty) || 0), 0);
  }, [order, orderItems]);
  const totalPrevDamaged = useMemo(() => {
    if (orderItems.length === 1 && orderItems[0].damagedQty === undefined) {
      return Math.max(0, Number(order?.damagedQty) || 0);
    }
    return orderItems.reduce((s, it) => s + Math.max(0, Number(it.damagedQty) || 0), 0);
  }, [order, orderItems]);
  const totalRemaining = Math.max(0, totalOrdered - (totalPrevGood + totalPrevDamaged));

  useEffect(() => {
    if (isOpen && order) {
      setIdempotencyKey(
        `RCV_${order.id}_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 6)}`
      );
      setNote('');
      setErrorMsg('');

      const initialLines: DraftReceiveLine[] = orderItems.map((it) => {
        const isLegacySingle =
          orderItems.length === 1 &&
          it.receivedQty === undefined &&
          it.damagedQty === undefined;
        const pGood = isLegacySingle
          ? Math.max(0, Number(order.stockReceivedQty) || 0)
          : Math.max(0, Number(it.receivedQty) || 0);
        const pDmg = isLegacySingle
          ? Math.max(0, Number(order.damagedQty) || 0)
          : Math.max(0, Number(it.damagedQty) || 0);
        const rem = Math.max(0, it.qty - (pGood + pDmg));

        const linkedProdId =
          it.linkedProductId ||
          (orderItems.length === 1 ? order.linkedProductId || '' : '');
        const linkedVarId =
          it.linkedVariantId ||
          (orderItems.length === 1 ? order.linkedVariantId || '' : '');

        let mode: 'existing' | 'new' = 'new';
        let selectedProductId = '';
        let selectedVariantId = '';

        if (linkedProdId) {
          mode = 'existing';
          selectedProductId = linkedProdId;
          selectedVariantId = linkedVarId;
        } else {
          const matched = activeProducts.find(
            (p) =>
              (it.sku && p.sku?.toLowerCase() === it.sku.toLowerCase()) ||
              p.name.toLowerCase() === it.productName.toLowerCase()
          );
          if (matched) {
            mode = 'existing';
            selectedProductId = matched.id;
            const varMatch = (matched.variants || []).find(
              (v) =>
                (it.color && v.color?.toLowerCase() === it.color.toLowerCase()) &&
                (it.model ? v.model?.toLowerCase() === it.model.toLowerCase() : true)
            );
            selectedVariantId = varMatch?.id || matched.variants?.[0]?.id || '';
          }
        }

        return {
          itemId: it.itemId,
          productName: it.productName,
          sku: it.sku || '',
          model: it.model || '',
          variant: it.variant || '',
          color: it.color || '',
          category: it.category || '',
          imageUrl: it.imageUrl || '',
          orderedQty: it.qty,
          prevGood: pGood,
          prevDamaged: pDmg,
          remaining: rem,
          lockedProductId: linkedProdId,
          lockedVariantId: linkedVarId,
          receivedQty: String(rem > 0 ? rem : 0),
          damagedQty: '0',
          mode,
          selectedProductId,
          selectedVariantId,
          newName: it.productName || '',
          newSku: it.sku || '',
          newCategory: it.category || categories[0]?.name || 'General',
          newBrand: brands[0]?.name || order.subBrand,
          newColor: it.color || it.variant || 'Standard',
          newModel: it.model || 'Default',
          newReorderThreshold: '2',
        };
      });

      setLines(initialLines);
    }
  }, [isOpen, order, orderItems, activeProducts, categories, brands]);

  const updateLine = (itemId: string, patch: Partial<DraftReceiveLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l))
    );
  };

  const productOptions = useMemo(
    () =>
      activeProducts.map((p) => ({
        value: p.id,
        label: `${p.name} (${p.sku || p.subBrand})`,
        sublabel: `${p.subBrand} • Stock: ${p.totalStock || 0} (Avail: ${Math.max(
          0,
          (p.totalStock || 0) - (p.reservedQty || 0)
        )})`,
      })),
    [activeProducts]
  );

  const costSummary = useMemo(() => {
    if (!order || lines.length === 0) return null;
    const activeLines = lines
      .map((l) => ({
        line: l,
        good: Math.max(0, Math.round(Number(l.receivedQty) || 0)),
        dmg: Math.max(0, Math.round(Number(l.damagedQty) || 0)),
      }))
      .filter((x) => x.good + x.dmg > 0);

    if (activeLines.length === 0) return null;

    return calculateMultiItemReceiptCosts({
      allItems: orderItems.map((it) => ({
        itemId: it.itemId,
        qty: it.qty,
        chinaUnitCost:
          itemCostMap[it.itemId]?.chinaUnitCost ?? privateCost?.chinaUnitCost ?? 0,
      })),
      receiptLines: activeLines.map(({ line, good, dmg }) => ({
        itemId: line.itemId,
        orderedQty: line.orderedQty,
        receivedGoodQty: good,
        damagedQty: dmg,
        chinaUnitCost:
          itemCostMap[line.itemId]?.chinaUnitCost ?? privateCost?.chinaUnitCost ?? 0,
      })),
      actualShippingCost: Number(privateCost?.actualShippingCost || 0),
      estimatedShippingCost: Number(privateCost?.shippingCost || 0),
    });
  }, [order, lines, orderItems, itemCostMap, privateCost]);

  if (!order) return null;

  const totalInputGood = lines.reduce(
    (s, l) => s + Math.max(0, Math.round(Number(l.receivedQty) || 0)),
    0
  );
  const totalInputDamaged = lines.reduce(
    (s, l) => s + Math.max(0, Math.round(Number(l.damagedQty) || 0)),
    0
  );
  const anyNewProduct = lines.some(
    (l) =>
      (Math.max(0, Math.round(Number(l.receivedQty) || 0)) +
        Math.max(0, Math.round(Number(l.damagedQty) || 0)) >
        0) &&
      l.mode === 'new'
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');

    if (totalInputGood + totalInputDamaged <= 0) {
      setErrorMsg('Enter at least 1 good or damaged unit to receive.');
      return;
    }

    if (totalInputDamaged > 0 && !isAdmin) {
      setErrorMsg('Only Admin or Super Admin can log damaged pre-order stock.');
      return;
    }

    const payloadItems: ReceivePreOrderItemInput[] = [];
    for (const line of lines) {
      const g = Math.max(0, Math.round(Number(line.receivedQty) || 0));
      const d = Math.max(0, Math.round(Number(line.damagedQty) || 0));
      if (g + d <= 0) continue;

      if (g + d > line.remaining) {
        setErrorMsg(
          `Cannot receive ${g + d} unit(s) for "${line.productName}"; only ${line.remaining} remaining of ${line.orderedQty} ordered.`
        );
        return;
      }
      if (line.mode === 'existing' && !line.selectedProductId) {
        setErrorMsg(
          `Select an existing catalog product for "${line.productName}" or switch it to Auto-Create.`
        );
        return;
      }
      if (line.mode === 'new' && !line.newName.trim()) {
        setErrorMsg(`Product name is required to auto-create "${line.productName}".`);
        return;
      }

      payloadItems.push({
        itemId: line.itemId,
        receivedQty: g,
        damagedQty: d,
        productId: line.mode === 'existing' ? line.selectedProductId : undefined,
        variantId:
          line.mode === 'existing' && line.selectedVariantId
            ? line.selectedVariantId
            : undefined,
        newProductDetails:
          line.mode === 'new'
            ? {
                name: line.newName.trim(),
                sku: line.newSku.trim() || undefined,
                category: line.newCategory.trim() || 'General',
                brand: line.newBrand.trim() || order.subBrand,
                color: line.newColor.trim() || 'Standard',
                model: line.newModel.trim() || 'Default',
                reorderThreshold: Math.max(0, Number(line.newReorderThreshold) || 2),
              }
            : undefined,
      });
    }

    if (payloadItems.length === 0) {
      setErrorMsg('Enter at least 1 unit across the line items.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await receivePreOrderStock(
        order.id,
        {
          items: payloadItems,
          note: note.trim() || undefined,
          idempotencyKey,
        },
        actorFromUser(user)
      );

      toast.success(
        `Received ${totalInputGood} good${
          totalInputDamaged > 0 ? ` + ${totalInputDamaged} damaged` : ''
        } unit(s) for ${order.preOrderNumber}.`
      );
      if (res.createdNewProduct && res.productStatus === 'pending_review') {
        toast.info(
          'New catalog product(s) created with Pending Review status until Super Admin approves.'
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
      subtitle={`${order.preOrderNumber} • ${formatPreOrderProductLabel(order)}`}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Order Progress Banner */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 grid grid-cols-4 gap-2 text-xs text-center">
          <div>
            <div className="text-slate-400">Total Ordered</div>
            <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
              {totalOrdered} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Prev Good</div>
            <div className="font-mono font-bold text-emerald-600">
              {totalPrevGood} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Prev Damaged</div>
            <div className="font-mono font-bold text-rose-600">
              {totalPrevDamaged} pcs
            </div>
          </div>
          <div>
            <div className="text-slate-400">Remaining</div>
            <div className="font-mono font-bold text-[#93741E] dark:text-[#E2C255]">
              {totalRemaining} pcs
            </div>
          </div>
        </div>

        {/* Quick Fill Toolbar for Multi-Item Orders */}
        {lines.length > 1 && (
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Line Items ({lines.length}) — enter received quantity per item (partial shipments supported)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setLines((prev) =>
                    prev.map((l) => ({
                      ...l,
                      receivedQty: String(l.remaining),
                      damagedQty: '0',
                    }))
                  )
                }
                className="text-xs font-semibold text-[#B89628] hover:underline cursor-pointer"
              >
                Fill All Remaining
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) =>
                    prev.map((l) => ({
                      ...l,
                      receivedQty: '0',
                      damagedQty: '0',
                    }))
                  )
                }
                className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        )}

        {/* Per-Item Receipt Cards */}
        <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1 scrollbar-thin">
          {lines.map((line, idx) => {
            const chosenProd =
              activeProducts.find((p) => p.id === line.selectedProductId) || null;
            const variantOptions = (chosenProd?.variants || []).map((v) => ({
              value: v.id,
              label: `${v.color || 'Std'} / ${v.model || 'Def'} (${v.stock || 0} pcs)`,
              sublabel: `Reserved: ${v.reservedQty || 0}`,
            }));
            const lineCost = costSummary?.byItemId[line.itemId];
            const fullyAccounted = line.remaining <= 0;

            return (
              <div
                key={line.itemId}
                className={`p-3.5 rounded-xl border space-y-3 ${
                  fullyAccounted
                    ? 'border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/10 opacity-75'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {line.imageUrl && (
                      <img
                        src={line.imageUrl}
                        alt={line.productName}
                        className="w-9 h-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        #{idx + 1} · {line.productName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        {[line.model, line.variant, line.color].filter(Boolean).join(' / ') || 'Standard'}
                        {line.sku ? <span className="font-mono">• {line.sku}</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] font-mono shrink-0">
                    <Badge variant={fullyAccounted ? 'success' : 'gold'} size="xs">
                      Rem: {line.remaining}/{line.orderedQty}
                    </Badge>
                    {line.prevGood > 0 && (
                      <Badge variant="neutral" size="xs">
                        Prev: {line.prevGood}
                      </Badge>
                    )}
                  </div>
                </div>

                {!fullyAccounted && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        label="Good Stock Received"
                        hint={`Max ${line.remaining} remaining`}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={line.remaining}
                          value={line.receivedQty}
                          onChange={(e) =>
                            updateLine(line.itemId, { receivedQty: e.target.value })
                          }
                        />
                      </FormField>

                      <FormField
                        label="Damaged / Missing Units"
                        hint={isAdmin ? 'Posts to Company Losses' : 'Admin/Super Admin only'}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={line.remaining}
                          disabled={!isAdmin}
                          value={line.damagedQty}
                          onChange={(e) =>
                            updateLine(line.itemId, { damagedQty: e.target.value })
                          }
                        />
                      </FormField>
                    </div>

                    {privateCost && lineCost && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 text-[11px] font-mono text-amber-900 dark:text-amber-200 flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Unit Landed: <strong>{formatBDT(lineCost.unitLandedCost)}</strong>
                        </span>
                        <span>
                          Good Inv: <strong>{formatBDT(lineCost.totalGoodLandedCost)}</strong>
                        </span>
                        {lineCost.damagedCostLoss > 0 && (
                          <span className="text-rose-700 dark:text-rose-300">
                            Loss: <strong>{formatBDT(lineCost.damagedCostLoss)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    {/* Target Catalog Product Toggle per line */}
                    <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={Boolean(line.lockedProductId)}
                          onClick={() => updateLine(line.itemId, { mode: 'existing' })}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                            line.mode === 'existing'
                              ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#93741E] dark:text-[#E2C255]'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <Link2 className="w-3 h-3" />
                          Link Existing Product
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(line.lockedProductId)}
                          onClick={() => updateLine(line.itemId, { mode: 'new' })}
                          className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 ${
                            line.mode === 'new'
                              ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#93741E] dark:text-[#E2C255]'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <PackagePlus className="w-3 h-3" />
                          Auto-Create New Product
                        </button>
                      </div>

                      {line.mode === 'existing' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <FormField label="Target Product" required>
                            <Select
                              options={productOptions}
                              value={line.selectedProductId}
                              onChange={(val) => {
                                const nextProd = activeProducts.find((p) => p.id === val);
                                updateLine(line.itemId, {
                                  selectedProductId: String(val),
                                  selectedVariantId: nextProd?.variants?.[0]?.id || '',
                                });
                              }}
                              placeholder="Search product..."
                              disabled={Boolean(line.lockedProductId)}
                            />
                          </FormField>
                          <FormField label="Target Variant" required>
                            <Select
                              options={variantOptions}
                              value={line.selectedVariantId}
                              onChange={(val) =>
                                updateLine(line.itemId, { selectedVariantId: String(val) })
                              }
                              placeholder="Select variant..."
                              searchable={false}
                              disabled={!chosenProd || Boolean(line.lockedVariantId)}
                            />
                          </FormField>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <FormField label="Product Name" required className="sm:col-span-2">
                            <Input
                              value={line.newName}
                              onChange={(e) =>
                                updateLine(line.itemId, { newName: e.target.value })
                              }
                            />
                          </FormField>
                          <FormField label="SKU (Optional)">
                            <Input
                              value={line.newSku}
                              onChange={(e) =>
                                updateLine(line.itemId, { newSku: e.target.value })
                              }
                            />
                          </FormField>
                          <FormField label="Category">
                            <Input
                              value={line.newCategory}
                              onChange={(e) =>
                                updateLine(line.itemId, { newCategory: e.target.value })
                              }
                            />
                          </FormField>
                          <FormField label="Color / Variant">
                            <Input
                              value={line.newColor}
                              onChange={(e) =>
                                updateLine(line.itemId, { newColor: e.target.value })
                              }
                            />
                          </FormField>
                          <FormField label="Model">
                            <Input
                              value={line.newModel}
                              onChange={(e) =>
                                updateLine(line.itemId, { newModel: e.target.value })
                              }
                            />
                          </FormField>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Combined Reservation + Landed Cost Preview */}
        {costSummary && (
          <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-[#D4AF37]" />
                Combined Receipt &amp; Landed Cost Summary
              </span>
              <Badge variant="gold" size="xs">
                Auto-Reserved for {order.preOrderNumber}
              </Badge>
            </div>
            {privateCost ? (
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-amber-900 dark:text-amber-200">
                <div>
                  Receiving Good: <strong>{costSummary.totalGoodQty} pcs</strong>
                </div>
                <div>
                  Good Inventory Cost: <strong>{formatBDT(costSummary.totalGoodLandedCost)}</strong>
                </div>
                {costSummary.totalDamagedCostLoss > 0 && (
                  <div className="text-rose-700 dark:text-rose-300">
                    Loss Posting: <strong>{formatBDT(costSummary.totalDamagedCostLoss)}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-amber-800 dark:text-amber-300">
                Good units ({totalInputGood} pcs) will be added to warehouse stock and reserved for this customer.
              </div>
            )}
          </div>
        )}

        <FormField label="Receipt / Warehouse Inspection Note (Optional)">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Box intact, serials checked at Dhaka warehouse"
          />
        </FormField>

        {!isSuperAdmin && anyNewProduct && (
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
            Confirm &amp; Receive Stock ({totalInputGood + totalInputDamaged} pcs)
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default ReceiveStockModal;
