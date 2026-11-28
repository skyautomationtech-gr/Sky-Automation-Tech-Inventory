import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  X,
  Check,
  Edit3,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Maximize2,
  User,
  Calendar,
  Clock,
  Tag,
  Layers,
  Package,
  FileText,
  History,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import Barcode from './Barcode';
import {
  CompanySettings,
  Product,
  RolePermissionsMap,
  SubBrand,
  UserProfile as UserType,
} from '../types';
import {
  normalizeProductImages,
  buildCategoryPathLabel,
} from '../utils/productImageUpload';
import { formatBrandBadgeMeta } from '../utils/subBrands';
import {
  canViewProductCost,
  computeVariantProfitMargin,
  formatPriceRange,
  formatVariantLabel,
  getActiveVariants,
  getProductCostPriceRange,
  getProductSellingPriceRange,
  isVariantActive,
  resolveVariantCostPrice,
  resolveVariantReorderThreshold,
  resolveVariantSellingPrice,
} from '../utils/productVariants';

interface PendingProductReviewModalProps {
  product: Product | null;
  isOpen: boolean;
  isStaff: boolean;
  user?: UserType | null;
  rolePermissions?: RolePermissionsMap | null;
  canApprove: boolean;
  canEdit: boolean;
  actionLoading?: boolean;
  subBrands?: SubBrand[];
  companySettings?: CompanySettings | null;
  onClose: () => void;
  onEdit: (product: Product) => void;
  onRequestApprove: (product: Product) => void;
  onConfirmReject: (product: Product, reason: string) => Promise<void> | void;
}

function formatDateTime(ts?: number): string {
  if (!ts || Number.isNaN(ts)) return 'Unknown date';
  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  const parts = (name || 'U').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0] || 'U').slice(0, 2).toUpperCase();
}

export default function PendingProductReviewModal({
  product,
  isOpen,
  isStaff,
  user,
  rolePermissions,
  canApprove,
  canEdit,
  actionLoading = false,
  subBrands,
  companySettings,
  onClose,
  onEdit,
  onRequestApprove,
  onConfirmReject,
}: PendingProductReviewModalProps) {
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Full-size Lightbox state
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Reject Reason Modal state
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [submittingReject, setSubmittingReject] = useState(false);

  const images = useMemo(() => (product ? normalizeProductImages(product) : []), [product]);

  useEffect(() => {
    setSelectedImageIdx(0);
    setBrokenImages({});
    setAvatarFailed(false);
    setIsLightboxOpen(false);
    setLightboxZoom(1);
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setRejectError('');
  }, [product?.id, isOpen]);

  // Clamp selected index when images change after edit
  useEffect(() => {
    if (selectedImageIdx >= images.length && images.length > 0) {
      setSelectedImageIdx(0);
    }
  }, [images.length, selectedImageIdx]);

  // Keyboard navigation for Lightbox, Reject dialog, and Review Modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isRejectDialogOpen) {
        if (e.key === 'Escape' && !submittingReject) {
          e.preventDefault();
          e.stopPropagation();
          setIsRejectDialogOpen(false);
        }
        return;
      }

      if (isLightboxOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setIsLightboxOpen(false);
          setLightboxZoom(1);
        } else if (e.key === 'ArrowRight' && images.length > 1) {
          e.preventDefault();
          setSelectedImageIdx((prev) => (prev + 1) % images.length);
          setLightboxZoom(1);
        } else if (e.key === 'ArrowLeft' && images.length > 1) {
          e.preventDefault();
          setSelectedImageIdx((prev) => (prev - 1 + images.length) % images.length);
          setLightboxZoom(1);
        } else if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setLightboxZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))));
        } else if (e.key === '-') {
          e.preventDefault();
          setLightboxZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))));
        }
        return;
      }

      if (e.key === 'Escape' && !actionLoading) {
        // Only close if no higher-z modal (like ProductFormModal z-75 or ConfirmDialog z-100) is open
        const higherModal = document.querySelector('[data-product-form-modal="true"], [data-confirm-dialog="true"]');
        if (!higherModal) {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    isLightboxOpen,
    isRejectDialogOpen,
    submittingReject,
    actionLoading,
    images.length,
    onClose,
  ]);

  if (!isOpen || !product || typeof document === 'undefined') return null;

  const canViewCost = user ? canViewProductCost(user, rolePermissions) : !isStaff;
  const variants = product.variants || [];
  const activeVariants = getActiveVariants(product);
  const archivedVariantCount = Math.max(0, variants.length - activeVariants.length);
  const totalStock = activeVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  const categoryPath = buildCategoryPathLabel(product);
  const submitterName = product.submittedBy?.name || product.createdBy || 'Unknown';
  const submitterRole = product.submittedBy?.role || 'operator';
  const submitterPhoto = product.submittedBy?.photoUrl;
  const submittedTimestamp = product.submittedAt || product.createdAt;
  const sellingRange = getProductSellingPriceRange(product);
  const costRange = getProductCostPriceRange(product);
  const sellingPrice = sellingRange.min;
  const costPrice = costRange.min;
  const profit = sellingPrice - costPrice;
  const marginPct = sellingPrice > 0 ? Math.round((profit / sellingPrice) * 100) : 0;

  const historyList = Array.isArray(product.editHistory)
    ? [...product.editHistory].sort((a, b) => (b.editedAt || 0) - (a.editedAt || 0))
    : [];

  const activeImageSrc = images[selectedImageIdx];
  const activeImageBroken = Boolean(brokenImages[selectedImageIdx]);

  const handleOpenLightbox = (idx: number) => {
    setSelectedImageIdx(idx);
    setLightboxZoom(1);
    setIsLightboxOpen(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rejectReason.trim();
    if (!trimmed) {
      setRejectError('Please provide a clear rejection reason so the submitter knows what to fix.');
      return;
    }
    setRejectError('');
    setSubmittingReject(true);
    try {
      await onConfirmReject(product, trimmed);
      setIsRejectDialogOpen(false);
      setRejectReason('');
    } catch (err: any) {
      setRejectError(err?.message || 'Failed to reject product.');
    } finally {
      setSubmittingReject(false);
    }
  };

  const statusBadge =
    product.status === 'rejected'
      ? {
          label: 'Rejected',
          cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
        }
      : product.status === 'approved'
      ? {
          label: 'Approved',
          cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
        }
      : {
          label: 'Pending Review',
          cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
        };

  return createPortal(
    <div
      data-pending-review-modal="true"
      role="dialog"
      aria-modal="true"
      aria-label={`Review ${product.name}`}
      className="fixed inset-0 z-[70] flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
    >
      {/* Top Sticky Header */}
      <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            disabled={actionLoading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const badge = formatBrandBadgeMeta(product.subBrand, subBrands, companySettings);
                return (
                  <span
                    style={badge.badgeStyle}
                    className="text-[10px] font-mono font-black px-2 py-0.5 rounded-md uppercase border"
                  >
                    {badge.shortLabel}
                  </span>
                );
              })()}
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusBadge.cls}`}>
                {statusBadge.label}
              </span>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                SKU: {product.sku}
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate mt-0.5">
              {product.name}
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={actionLoading}
          title="Close Review (Esc)"
          aria-label="Close Review"
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <X size={20} />
        </button>
      </header>

      {/* Main Full-Width Two-Column Body */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1540px] mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* LEFT COLUMN: Image Gallery */}
          <section className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 lg:sticky lg:top-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                  Product Gallery ({images.length})
                </h2>
                {images.length > 0 && !activeImageBroken && (
                  <button
                    type="button"
                    onClick={() => handleOpenLightbox(selectedImageIdx)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    <Maximize2 size={13} />
                    <span>Open Full-Size</span>
                  </button>
                )}
              </div>

              {/* Main Photo Stage */}
              <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 flex items-center justify-center group">
                {images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
                    <div className="w-14 h-14 rounded-2xl bg-slate-200/70 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <ImageOff size={26} />
                    </div>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      No Product Photos Uploaded
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                      Click Edit Product below to upload photos before or after review.
                    </p>
                  </div>
                ) : activeImageBroken ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3 border border-rose-500/20">
                      <ImageOff size={26} />
                    </div>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Image Failed to Load
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                      The stored image URL could not be rendered. Try re-uploading via Edit Product.
                    </p>
                  </div>
                ) : (
                  <>
                    <img
                      src={activeImageSrc}
                      alt={`${product.name} photo ${selectedImageIdx + 1}`}
                      referrerPolicy="no-referrer"
                      onClick={() => handleOpenLightbox(selectedImageIdx)}
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [selectedImageIdx]: true }))
                      }
                      className="w-full h-full object-contain cursor-zoom-in transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                    <button
                      type="button"
                      onClick={() => handleOpenLightbox(selectedImageIdx)}
                      aria-label="Open image in lightbox"
                      className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-slate-950/80 hover:bg-slate-950 text-white text-xs font-bold flex items-center gap-1.5 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer shadow-lg"
                    >
                      <ZoomIn size={14} />
                      <span>Zoom</span>
                    </button>
                  </>
                )}

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImageIdx((prev) => (prev - 1 + images.length) % images.length)
                      }
                      aria-label="Previous photo"
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-md hover:scale-105 transition cursor-pointer"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedImageIdx((prev) => (prev + 1) % images.length)}
                      aria-label="Next photo"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center shadow-md hover:scale-105 transition cursor-pointer"
                    >
                      <ChevronRight size={18} />
                    </button>
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-[11px] font-mono font-bold tabular-nums">
                      {selectedImageIdx + 1} / {images.length}
                    </span>
                  </>
                )}
              </div>

              {/* All Uploaded Thumbnails */}
              {images.length > 0 && (
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2.5">
                  {images.map((imgUrl, idx) => {
                    const isSelected = idx === selectedImageIdx;
                    const isThumbBroken = Boolean(brokenImages[idx]);
                    return (
                      <button
                        key={`${idx}-${imgUrl.slice(0, 20)}`}
                        type="button"
                        onClick={() => setSelectedImageIdx(idx)}
                        onDoubleClick={() => handleOpenLightbox(idx)}
                        className={`relative aspect-square rounded-xl overflow-hidden border transition-all cursor-pointer bg-slate-100 dark:bg-slate-800 ${
                          isSelected
                            ? 'border-amber-400 ring-2 ring-amber-400/50'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                        }`}
                        title={`Photo ${idx + 1} (click to preview, double-click to zoom)`}
                      >
                        {isThumbBroken ? (
                          <div className="w-full h-full flex items-center justify-center text-rose-400">
                            <ImageOff size={16} />
                          </div>
                        ) : (
                          <img
                            src={imgUrl}
                            alt={`Thumbnail ${idx + 1}`}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setBrokenImages((prev) => ({ ...prev, [idx]: true }))
                            }
                            className="w-full h-full object-cover"
                          />
                        )}
                        {idx === 0 && (
                          <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-slate-950/80 text-amber-300 text-[8px] font-black uppercase">
                            Cover
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN: Complete Specifications, Variants, Submitter & History */}
          <section className="lg:col-span-7 space-y-5">
            {/* Rejection Alert Banner if already rejected */}
            {product.status === 'rejected' && product.rejectionReason && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    Rejection Reason
                  </p>
                  <p className="text-sm font-medium text-rose-800 dark:text-rose-200 mt-1">
                    {product.rejectionReason}
                  </p>
                </div>
              </div>
            )}

            {/* Pricing & Stock Key Metrics */}
            <div
              className={`grid grid-cols-2 ${
                canViewCost ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
              } gap-3`}
            >
              {canViewCost && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Purchase Price
                  </span>
                  <span className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1 block">
                    {formatPriceRange(costRange)}
                  </span>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Selling Price
                </span>
                <span className="text-lg font-black font-mono tabular-nums text-amber-600 dark:text-amber-400 mt-1 block">
                  {formatPriceRange(sellingRange)}
                </span>
              </div>

              {canViewCost && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    {sellingRange.isRange || costRange.isRange ? 'Base Margin' : 'Profit / Margin'}
                  </span>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span
                      className={`text-lg font-black font-mono tabular-nums ${
                        profit >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      ৳{profit.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                      ({marginPct}%)
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Total Stock
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">
                    {totalStock} pcs
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({activeVariants.length} active{archivedVariantCount > 0 ? `, ${archivedVariantCount} archived` : ''})
                  </span>
                </div>
              </div>

              {!canViewCost && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Reorder Threshold
                  </span>
                  <span className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white mt-1 block">
                    {Number(product.reorderThreshold ?? 5)} pcs
                  </span>
                </div>
              )}
            </div>

            {/* Classification, Reorder Threshold & Barcode */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
              <div className="md:col-span-7 space-y-3 text-sm">
                <div className="flex items-start gap-2.5">
                  <Layers size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Category Path (3-Level)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {categoryPath}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-start gap-2">
                    <Tag size={15} className="text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Brand
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {product.brand || 'Generic'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Package size={15} className="text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                        Reorder Threshold
                      </span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {Number(product.reorderThreshold ?? 5)} units
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="md:col-span-5 bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Generated Barcode
                </span>
                <div className="bg-white px-3 py-2 rounded-lg border border-slate-200 max-w-full overflow-hidden">
                  <Barcode
                    value={product.barcodeValue || product.sku}
                    height={46}
                    width={1.5}
                    fontSize={10}
                    margin={4}
                  />
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 mt-1.5">
                  {product.barcodeValue || product.sku}
                </span>
              </div>
            </div>

            {/* Description & Notes */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <FileText size={15} className="text-amber-500" />
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Description & Submission Notes
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Description
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                    {product.description?.trim() ? product.description : 'No product description provided.'}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1">
                    Internal / Submission Notes
                  </span>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                    {product.notes?.trim() ? product.notes : 'No submission notes provided.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Attributes / Variants Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Attributes & Physical Variants ({variants.length})
                </h3>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                  Active Stock: {totalStock} pcs
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3 font-bold">#</th>
                      <th className="py-2.5 px-3 font-bold">Variant</th>
                      <th className="py-2.5 px-3 font-bold">SKU / Barcode</th>
                      {canViewCost && <th className="py-2.5 px-3 font-bold text-right">Cost</th>}
                      <th className="py-2.5 px-3 font-bold text-right">Sell</th>
                      {canViewCost && <th className="py-2.5 px-3 font-bold text-right">Margin</th>}
                      <th className="py-2.5 px-3 font-bold text-right">Thresh</th>
                      <th className="py-2.5 px-3 font-bold text-right">Stock</th>
                      <th className="py-2.5 px-3 font-bold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {variants.length === 0 ? (
                      <tr>
                        <td
                          colSpan={canViewCost ? 9 : 7}
                          className="py-6 text-center text-slate-400 dark:text-slate-500 italic"
                        >
                          No variants configured.
                        </td>
                      </tr>
                    ) : (
                      variants.map((v, idx) => {
                        const vSell = resolveVariantSellingPrice(product, v);
                        const vCost = resolveVariantCostPrice(product, v);
                        const { profit: vProfit, marginPercent: vMargin, isLoss: isBelowCost } =
                          computeVariantProfitMargin(vSell, vCost);
                        const active = isVariantActive(v);
                        const vThreshold = resolveVariantReorderThreshold(product, v);
                        return (
                          <tr
                            key={v.id || idx}
                            className={
                              active
                                ? 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                                : 'opacity-60 bg-slate-50/60 dark:bg-slate-900/60'
                            }
                          >
                            <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {formatVariantLabel(v)}
                              </div>
                              {v.variantNote && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  Note: {v.variantNote}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              <div>{v.variantSku || `${product.sku}-V${idx + 1}`}</div>
                              <div className="text-[10px] text-slate-400">
                                {v.barcodeValue || 'Auto-assigned'}
                              </div>
                            </td>
                            {canViewCost && (
                              <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                                ৳{vCost.toLocaleString()}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                              ৳{vSell.toLocaleString()}
                              {v.sameAsProductPrice !== false && (
                                <span className="block text-[9px] font-normal text-slate-400">
                                  base price
                                </span>
                              )}
                            </td>
                            {canViewCost && (
                              <td
                                className={`py-2.5 px-3 text-right font-mono text-xs font-bold tabular-nums ${
                                  isBelowCost
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                ৳{vProfit.toLocaleString()} ({vMargin}%)
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                              {vThreshold}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black tabular-nums text-slate-900 dark:text-white">
                              {Number(v.stock) || 0} pcs
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  active
                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {active ? 'Active' : 'Archived'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Submitter & Metadata Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {submitterPhoto && !avatarFailed ? (
                  <img
                    src={submitterPhoto}
                    alt={submitterName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-400/30 font-black text-sm flex items-center justify-center shrink-0">
                    {getInitials(submitterName)}
                  </div>
                )}

                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Submitted By
                  </span>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-sm font-black text-slate-900 dark:text-white truncate">
                      {submitterName}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono font-bold uppercase text-slate-600 dark:text-slate-300">
                      {submitterRole}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:items-end gap-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-slate-400" />
                  <span className="font-mono font-semibold">
                    {formatDateTime(submittedTimestamp)}
                  </span>
                </div>
                {product.approvedBy && product.approvedAt && (
                  <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ShieldCheck size={13} />
                    <span>
                      Approved by {product.approvedBy.name} ({formatDateTime(product.approvedAt)})
                    </span>
                  </div>
                )}
                {product.rejectedBy && product.rejectedAt && (
                  <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
                    <Clock size={13} />
                    <span>
                      Rejected by {product.rejectedBy.name} ({formatDateTime(product.rejectedAt)})
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Edit History & Change Diff Timeline */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <History size={15} className="text-amber-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Audit & Edit History ({historyList.length})
                  </h3>
                </div>
              </div>

              {historyList.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  Submitted on {formatDateTime(submittedTimestamp)} by {submitterName}. No reviewer edits recorded yet.
                </p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {historyList.map((entry) => {
                    const visibleChanges = (entry.changes || []).filter(
                      (c) =>
                        canViewCost ||
                        (c.field !== 'costPrice' &&
                          !/cost\s*price/i.test(c.label || '') &&
                          !/\bcost:৳/i.test(`${c.before || ''} ${c.after || ''}`))
                    );
                    const actionBadgeCls =
                      entry.action === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : entry.action === 'rejected'
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30'
                        : entry.action === 'created'
                        ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';

                    return (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${actionBadgeCls}`}
                            >
                              {entry.action}
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                              <User size={12} className="text-slate-400" />
                              {entry.editedByName}
                            </span>
                            {entry.editedByRole && (
                              <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                                ({entry.editedByRole})
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {formatDateTime(entry.editedAt)}
                          </span>
                        </div>

                        {entry.note && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-800">
                            {entry.note}
                          </p>
                        )}

                        {visibleChanges.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {visibleChanges.map((chg, i) => (
                              <div
                                key={`${entry.id}-c-${i}`}
                                className="text-[11px] flex flex-wrap items-baseline gap-1.5 text-slate-600 dark:text-slate-300"
                              >
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {chg.label}:
                                </span>
                                <span className="line-through text-rose-600 dark:text-rose-400 font-mono break-all">
                                  {chg.before}
                                </span>
                                <span className="text-slate-400">→</span>
                                <span className="text-emerald-700 dark:text-emerald-400 font-mono font-semibold break-all">
                                  {chg.after}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-[1540px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            {product.status === 'pending_review'
              ? 'Editing saves changes to this pending submission without auto-approving it.'
              : `Current status: ${statusBadge.label}`}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            {canEdit && (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => onEdit(product)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Edit3 size={14} />
                <span>Edit Product</span>
              </button>
            )}

            {canApprove && product.status === 'pending_review' && (
              <>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => {
                    setRejectReason('');
                    setRejectError('');
                    setIsRejectDialogOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X size={14} />
                  <span>Reject</span>
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => onRequestApprove(product)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Approve Product</span>
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* FULL-SIZE IMAGE LIGHTBOX */}
      {isLightboxOpen && images.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Product Image Lightbox"
          className="fixed inset-0 z-[95] bg-slate-950/95 backdrop-blur-md flex flex-col text-white"
          onClick={() => {
            setIsLightboxOpen(false);
            setLightboxZoom(1);
          }}
        >
          {/* Lightbox Top Controls */}
          <div
            className="px-4 sm:px-6 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{product.name}</p>
              <p className="text-xs font-mono text-slate-400">
                Photo {selectedImageIdx + 1} of {images.length} • Zoom {Math.round(lightboxZoom * 100)}%
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                disabled={lightboxZoom <= 1}
                title="Zoom Out (-)"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 transition cursor-pointer"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom(1)}
                disabled={lightboxZoom === 1}
                title="Reset Zoom"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 transition cursor-pointer"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                onClick={() => setLightboxZoom((z) => Math.min(3, Number((z + 0.5).toFixed(1))))}
                disabled={lightboxZoom >= 3}
                title="Zoom In (+)"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-35 transition cursor-pointer"
              >
                <ZoomIn size={16} />
              </button>
              <div className="w-px h-5 bg-white/15 mx-1" />
              <button
                type="button"
                onClick={() => {
                  setIsLightboxOpen(false);
                  setLightboxZoom(1);
                }}
                title="Close Lightbox (Esc)"
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/80 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Lightbox Image Viewport */}
          <div
            className="flex-1 min-h-0 relative flex items-center justify-center overflow-auto p-4 sm:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {activeImageBroken ? (
              <div className="flex flex-col items-center justify-center text-slate-400 gap-2">
                <ImageOff size={40} />
                <p className="text-sm font-semibold">Unable to display this image</p>
              </div>
            ) : (
              <img
                src={activeImageSrc}
                alt={`${product.name} full view ${selectedImageIdx + 1}`}
                referrerPolicy="no-referrer"
                onClick={() => setLightboxZoom((z) => (z > 1 ? 1 : 2))}
                onError={() =>
                  setBrokenImages((prev) => ({ ...prev, [selectedImageIdx]: true }))
                }
                style={{
                  transform: `scale(${lightboxZoom})`,
                  transformOrigin: 'center center',
                }}
                className={`max-h-full max-w-full object-contain rounded-xl transition-transform duration-150 select-none ${
                  lightboxZoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'
                }`}
              />
            )}

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImageIdx((prev) => (prev - 1 + images.length) % images.length);
                    setLightboxZoom(1);
                  }}
                  aria-label="Previous image"
                  className="fixed left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 flex items-center justify-center shadow-xl cursor-pointer"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImageIdx((prev) => (prev + 1) % images.length);
                    setLightboxZoom(1);
                  }}
                  aria-label="Next image"
                  className="fixed right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/70 hover:bg-black text-white border border-white/20 flex items-center justify-center shadow-xl cursor-pointer"
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
          </div>

          {/* Lightbox Bottom Thumbnails */}
          {images.length > 1 && (
            <div
              className="px-4 py-3 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {images.map((imgUrl, idx) => (
                <button
                  key={`lb-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedImageIdx(idx);
                    setLightboxZoom(1);
                  }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 cursor-pointer transition ${
                    idx === selectedImageIdx
                      ? 'border-amber-400 scale-105'
                      : 'border-white/20 opacity-60 hover:opacity-100'
                  }`}
                >
                  {brokenImages[idx] ? (
                    <div className="w-full h-full bg-slate-800 flex items-center justify-center text-slate-500">
                      <ImageOff size={14} />
                    </div>
                  ) : (
                    <img
                      src={imgUrl}
                      alt={`Thumb ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REJECTION REASON DIALOG */}
      {isRejectDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reject Pending Product"
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
          onClick={() => !submittingReject && setIsRejectDialogOpen(false)}
        >
          <form
            onSubmit={handleRejectSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Reject Pending Product
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  A rejection reason is required and will be sent to {submitterName}.
                </p>
              </div>
              <button
                type="button"
                disabled={submittingReject}
                onClick={() => setIsRejectDialogOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1.5">
                Reason for Rejection <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                autoFocus
                required
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError('');
                }}
                placeholder="e.g. Incorrect selling price, blurry photos, or missing model variant..."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
              />
              {rejectError && (
                <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-1">
                  {rejectError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submittingReject}
                onClick={() => setIsRejectDialogOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReject || !rejectReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {submittingReject && <Loader2 size={13} className="animate-spin" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>,
    document.body
  );
}
