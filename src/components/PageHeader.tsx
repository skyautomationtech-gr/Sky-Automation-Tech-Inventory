import React from 'react';
import { Breadcrumbs } from './Breadcrumbs';

interface PageHeaderProps {
  currentTab: string;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  onNavigate?: (tab: string) => void;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  currentTab,
  title,
  description,
  badge,
  actions,
  onNavigate,
  className = '',
}) => {
  return (
    <div className={`mb-6 space-y-2.5 ${className}`}>
      {/* Breadcrumbs Row */}
      <div className="flex items-center justify-between">
        <Breadcrumbs currentTab={currentTab} onNavigate={onNavigate} />
      </div>

      {/* Title & Primary Actions Row (Desktop 12-column layout aligned) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-sans">
              {title}
            </h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>
          {description && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 font-sans max-w-3xl leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
};
