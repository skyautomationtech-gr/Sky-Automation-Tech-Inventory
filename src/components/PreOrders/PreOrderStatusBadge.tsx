import React from 'react';
import { PreOrderPaymentState, PreOrderStatus } from '../../types';
import { PRE_ORDER_STATUS_META } from '../../preOrders/constants';

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

export const SubBrandBadge: React.FC<{
  subBrand: 'SAT' | 'GZ' | 'RTX' | string;
  className?: string;
}> = ({ subBrand, className = '' }) => {
  const colorMap: Record<string, string> = {
    SAT: 'bg-slate-900 text-[#D4AF37] border-[#D4AF37]/40 dark:bg-slate-950 dark:text-[#E2C255]',
    GZ: 'bg-sky-950 text-sky-300 border-sky-700/60',
    RTX: 'bg-violet-950 text-violet-300 border-violet-700/60',
  };
  const cls =
    colorMap[subBrand] ||
    'bg-slate-800 text-slate-200 border-slate-700';

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border tracking-wider shrink-0 ${cls} ${className}`}
    >
      {subBrand}
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
