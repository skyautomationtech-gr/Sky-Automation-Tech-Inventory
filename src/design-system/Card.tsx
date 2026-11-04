import React from 'react';

// Flat Card Component
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'flat' | 'raised' | 'outlined' | 'soft';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'flat',
  padding = 'md',
  header,
  footer,
  className = '',
  ...props
}) => {
  const paddingMap = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7',
  };

  const variantMap = {
    flat: 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs',
    raised: 'bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-md',
    outlined: 'bg-transparent border border-slate-200 dark:border-slate-800',
    soft: 'bg-slate-50 dark:bg-slate-900 border border-transparent soft-ui-flat',
  };

  return (
    <div
      className={`rounded-2xl transition-all duration-150 overflow-hidden ${variantMap[variant]} ${className}`}
      {...props}
    >
      {header && (
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
          {header}
        </div>
      )}
      <div className={paddingMap[padding]}>
        {children}
      </div>
      {footer && (
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30 flex items-center justify-between">
          {footer}
        </div>
      )}
    </div>
  );
};

// Glass Panel (Used ONLY for layered surfaces: top bar, sidebar, modals, dropdowns, toasts)
export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  intensity = 'medium',
  className = '',
  ...props
}) => {
  const blurMap = {
    low: 'backdrop-blur-sm',
    medium: 'backdrop-blur-md',
    high: 'backdrop-blur-xl',
  };

  return (
    <div
      className={`
        glass-surface rounded-2xl ${blurMap[intensity]}
        bg-white/80 dark:bg-slate-900/80
        border border-white/60 dark:border-white/10
        shadow-lg ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

// Empty State Card
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`p-8 text-center flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 ${className}`}>
      {icon && (
        <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/10 dark:bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] flex items-center justify-center mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
        {title}
      </h4>
      {description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1 mb-4 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};

// Skeleton Loader Variants
export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'table-row';
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
}) => {
  const baseClasses = 'animate-pulse bg-slate-200 dark:bg-slate-800 rounded';

  if (variant === 'circular') {
    return (
      <div
        className={`${baseClasses} rounded-full shrink-0 ${className}`}
        style={{ width: width || 40, height: height || 40 }}
      />
    );
  }

  if (variant === 'card') {
    return (
      <div className={`p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-1/3 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
            <div className="h-2.5 w-1/4 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          </div>
        </div>
        <div className="h-7 w-1/2 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg mt-4" />
      </div>
    );
  }

  if (variant === 'table-row') {
    return (
      <div className={`flex items-center gap-4 py-3.5 px-4 border-b border-slate-100 dark:border-slate-800 ${className}`}>
        <div className="w-4 h-4 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
        <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 animate-pulse rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-2/5 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
          <div className="h-2.5 w-1/5 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
        </div>
        <div className="h-3.5 w-20 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
        <div className="h-3.5 w-16 bg-slate-200 dark:bg-slate-800 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${variant === 'rectangular' ? 'rounded-xl' : 'rounded'} ${className}`}
      style={{
        width: width || (variant === 'text' ? '100%' : '100%'),
        height: height || (variant === 'text' ? '14px' : '40px'),
      }}
    />
  );
};
