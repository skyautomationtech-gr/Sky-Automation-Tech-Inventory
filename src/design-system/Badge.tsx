import React from 'react';

export type BadgeVariant = 'gold' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'subBrand';
export type BadgeSize = 'xs' | 'sm' | 'md';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  pulse = false,
  className = '',
}) => {
  const sizeClasses: Record<BadgeSize, string> = {
    xs: 'text-[10px] px-1.5 py-0.5 rounded gap-1',
    sm: 'text-xs px-2 py-0.5 rounded-md gap-1.5',
    md: 'text-xs px-2.5 py-1 rounded-lg gap-1.5 font-semibold',
  };

  const variantClasses: Record<BadgeVariant, string> = {
    gold: 'bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] border border-[#D4AF37]/30 font-bold',
    success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 font-semibold',
    warning: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 font-semibold',
    danger: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 font-semibold',
    info: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 font-semibold',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
    subBrand: 'bg-slate-950 text-[#D4AF37] border border-[#D4AF37]/40 font-mono font-bold shadow-3xs',
  };

  const dotColorClasses: Record<BadgeVariant, string> = {
    gold: 'bg-[#D4AF37]',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    info: 'bg-blue-500',
    neutral: 'bg-slate-400',
    subBrand: 'bg-[#D4AF37]',
  };

  return (
    <span
      className={`
        inline-flex items-center font-sans tracking-tight shrink-0 select-none
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {dot && (
        <span
          className={`
            w-1.5 h-1.5 rounded-full shrink-0
            ${dotColorClasses[variant]}
            ${pulse ? 'animate-pulse' : ''}
          `}
        />
      )}
      {children}
    </span>
  );
};
