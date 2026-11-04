import React from 'react';
import { Check, ChevronRight, ChevronLeft } from 'lucide-react';

// Stepper / Wizard Indicator
export interface StepItem {
  id: string | number;
  label: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  activeStep: number; // 0-indexed
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  activeStep,
  onStepClick,
  className = '',
}) => {
  return (
    <div className={`flex items-center w-full justify-between ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = index < activeStep;
        const isActive = index === activeStep;
        const isClickable = Boolean(onStepClick && index <= activeStep);

        return (
          <React.Fragment key={String(step.id)}>
            <div
              className={`flex items-center gap-2.5 ${isClickable ? 'cursor-pointer group' : ''}`}
              onClick={() => isClickable && onStepClick?.(index)}
            >
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-xs transition-all duration-200 shrink-0
                  ${isCompleted 
                    ? 'bg-[#D4AF37] text-slate-950 shadow-xs' 
                    : isActive 
                    ? 'bg-slate-900 text-[#D4AF37] dark:bg-slate-100 dark:text-slate-950 ring-2 ring-[#D4AF37] ring-offset-2 dark:ring-offset-slate-900' 
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                  }
                `}
              >
                {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : index + 1}
              </div>
              <div className="flex flex-col">
                <span
                  className={`text-xs font-semibold leading-tight ${
                    isActive
                      ? 'text-slate-900 dark:text-slate-100 font-bold'
                      : isCompleted
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {step.description}
                  </span>
                )}
              </div>
            </div>

            {index < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 transition-colors duration-200 ${
                  index < activeStep ? 'bg-[#D4AF37]' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Tabs Component (Underline + Segmented Soft-UI)
export interface TabItem<T = string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  badge?: number | string;
}

export interface TabsProps<T = string> {
  tabs: TabItem<T>[];
  activeTab: T;
  onChange: (tabId: T) => void;
  variant?: 'underline' | 'segmented';
  size?: 'sm' | 'md';
  className?: string;
}

export function Tabs<T extends string | number = string>({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  size = 'md',
  className = '',
}: TabsProps<T>) {
  if (variant === 'segmented') {
    return (
      <div className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 soft-ui-inner ${className}`}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={String(tab.id)}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`
                flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer select-none
                ${isActive
                  ? 'bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100 shadow-2xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }
              `}
            >
              {tab.icon && <span className="shrink-0">{tab.icon}</span>}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-[#D4AF37] text-slate-950 font-bold' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Underline Tabs (Standard Desktop Structure)
  return (
    <div className={`border-b border-slate-200 dark:border-slate-800 flex items-center gap-6 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={String(tab.id)}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-2 pb-3 pt-1 text-sm font-semibold transition-all duration-150 border-b-2 cursor-pointer select-none -mb-px
              ${isActive
                ? 'border-[#D4AF37] text-[#93741E] dark:text-[#E2C255] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }
            `}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                isActive ? 'bg-[#D4AF37]/20 text-[#93741E] dark:text-[#E2C255]' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Breadcrumb Component
export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
  active?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = '' }) => {
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 ${className}`}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={index}>
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span className={isLast ? 'text-slate-900 dark:text-slate-100 font-semibold' : ''}>
                {item.label}
              </span>
            )}
            {!isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

// Pagination Component (Desktop Ergonomics)
export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className = '',
}) => {
  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 select-none ${className}`}>
      {totalItems !== undefined && pageSize !== undefined && (
        <div>
          Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{(currentPage - 1) * pageSize + 1}</span> to{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">{Math.min(currentPage * pageSize, totalItems)}</span> of{' '}
          <span className="font-semibold text-slate-800 dark:text-slate-200">{totalItems}</span> results
        </div>
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageNumbers().map((p, idx) => {
          if (p === '...') {
            return (
              <span key={`dots-${idx}`} className="px-2 py-1 text-slate-400">
                ...
              </span>
            );
          }
          const isCurrent = p === currentPage;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(Number(p))}
              className={`
                h-8 min-w-[32px] px-2 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer
                ${isCurrent
                  ? 'bg-[#D4AF37] text-slate-950 font-bold shadow-2xs'
                  : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                }
              `}
            >
              {p}
            </button>
          );
        })}

        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
