import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  trend?: {
    value: number | string;
    isPositive?: boolean;
    label?: string;
  };
  icon?: React.ReactNode;
  variant?: 'gold' | 'default' | 'success' | 'danger' | 'info';
  helperText?: string;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  trend,
  icon,
  variant = 'default',
  helperText,
  onClick,
  className = '',
}) => {
  // Animated number count-up (subtle 200-300ms transition)
  const [displayValue, setDisplayValue] = useState<number>(0);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion = typeof window !== 'undefined' && 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    let start = 0;
    const duration = 300; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuad
      const easedProgress = progress * (2 - progress);
      const current = start + (value - start) * easedProgress;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  const formattedNumber = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const variantStyles = {
    gold: 'border-l-4 border-l-[#D4AF37]',
    default: 'border-l-4 border-l-slate-400 dark:border-l-slate-600',
    success: 'border-l-4 border-l-emerald-500',
    danger: 'border-l-4 border-l-rose-500',
    info: 'border-l-4 border-l-blue-500',
  };

  const iconBgStyles = {
    gold: 'bg-[#D4AF37]/10 text-[#93741E] dark:text-[#E2C255]',
    default: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
    success: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    danger: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400',
    info: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
  };

  return (
    <div
      onClick={onClick}
      className={`
        bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800
        p-4 sm:p-5 rounded-2xl shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md
        flex flex-col justify-between
        ${variantStyles[variant]}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {label}
          </span>
          {icon && (
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBgStyles[variant]}`}>
              {icon}
            </div>
          )}
        </div>

        <div className="flex items-baseline gap-1 mt-1 font-mono font-black text-2xl sm:text-3xl text-slate-900 dark:text-slate-50 tracking-tight">
          {prefix && <span className="text-lg sm:text-xl font-bold opacity-80">{prefix}</span>}
          <span>{formattedNumber}</span>
          {suffix && <span className="text-xs font-sans font-medium text-slate-400 ml-1">{suffix}</span>}
        </div>
      </div>

      {(trend || helperText) && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs">
          {trend && (
            <div className="flex items-center gap-1.5 font-semibold">
              <span
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                  trend.isPositive === true
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : trend.isPositive === false
                    ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {trend.isPositive === true ? (
                  <TrendingUp className="w-3 h-3" />
                ) : trend.isPositive === false ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {trend.value}
              </span>
              {trend.label && (
                <span className="text-[11px] text-slate-400 truncate">{trend.label}</span>
              )}
            </div>
          )}

          {helperText && !trend && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {helperText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
