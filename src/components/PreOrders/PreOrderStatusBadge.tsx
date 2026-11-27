import React from 'react';
import { PreOrderPaymentState, PreOrderStatus, SubBrand } from '../../types';
import { PRE_ORDER_STATUS_META } from '../../preOrders/constants';
import { formatBrandBadgeMeta } from '../../utils/subBrands';

export const PreOrderStatusBadge: React.FC<{
  status: PreOrderStatus;
  size?: 'xs' | 'sm';
  className?: string;
}> = ({ status, size = 'sm', className = '' }) => {
  const meta = PRE_ORDER_STATUS_META[status] || {
    label: status,
    badgeClass:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotClass: 'bg-slate-400',
  };

  const sizeClass =
    size === 'xs'
      ? 'text-[11px] px-2 py-0.5 rounded gap-1.5'
      : 'text-xs px-2.5 py-0.5 rounded-md gap-1.5';

  return (
    <span
      className={`inline-flex items-center font-sans font-semibold border whitespace-nowrap shrink-0 ${sizeClass} ${meta.badgeClass} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
};

export const OverdueTag: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-rose-600 text-white dark:bg-rose-500/90 shrink-0 ${className}`}
  >
    Overdue
  </span>
);

export const PartiallyReceivedTag: React.FC<{
  receivedQty?: number;
  totalQty?: number;
  className?: string;
}> = ({ receivedQty, totalQty, className = '' }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800 whitespace-nowrap shrink-0 ${className}`}
  >
    Partially Received
    {typeof receivedQty === 'number' && typeof totalQty === 'number'
      ? ` (${receivedQty}/${totalQty})`
      : ''}
  </span>
);

export const SubBrandBadge: React.FC<{
  subBrand?: string | null;
  subBrands?: SubBrand[] | null;
  showFullName?: boolean;
  className?: string;
}> = ({ subBrand, subBrands, showFullName = false, className = '' }) => {
  const meta = formatBrandBadgeMeta(subBrand, subBrands);

  return (
    <span
      style={meta.badgeStyle}
      title={meta.label}
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border tracking-wider shrink-0 whitespace-nowrap ${className}`}
    >
      {showFullName ? meta.label : meta.shortLabel}
    </span>
  );
};

export const PaymentStateBadge: React.FC<{
  state: PreOrderPaymentState;
  className?: string;
}> = ({ state, className = '' }) => {
  const map: Record<PreOrderPaymentState, { label: string; cls: string }> = {
    unpaid: {
      label: 'Unpaid',
      cls: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    },
    partially_paid: {
      label: 'Partially Paid',
      cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    },
    fully_paid: {
      label: 'Fully Paid',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    },
    refunded: {
      label: 'Refunded',
      cls: 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    },
  };
  const cfg = map[state] || map.unpaid;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${cfg.cls} ${className}`}
    >
      {cfg.label}
    </span>
  );
};
