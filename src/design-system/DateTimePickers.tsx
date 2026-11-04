import React from 'react';
import { Calendar, Clock, ArrowRight } from 'lucide-react';

export interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  disabled = false,
  min,
  max,
  className = '',
}) => {
  return (
    <div className={`relative flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <div className="relative flex items-center">
        <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          min={min}
          max={max}
          className="w-full h-9 pl-9 pr-3 text-sm font-sans rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/25 shadow-2xs transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        />
      </div>
    </div>
  );
};

// Date Range Picker (From & To dates with quick presets)
export interface DateRangePickerProps {
  startDate?: string;
  endDate?: string;
  onChange: (start: string, end: string) => void;
  className?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  className = '',
}) => {
  const setPreset = (preset: 'today' | 'yesterday' | '7days' | 'month' | 'lastMonth') => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (preset === 'today') {
      const dStr = fmt(today);
      onChange(dStr, dStr);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const dStr = fmt(y);
      onChange(dStr, dStr);
    } else if (preset === '7days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      onChange(fmt(past), fmt(today));
    } else if (preset === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      onChange(fmt(start), fmt(today));
    } else if (preset === 'lastMonth') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      onChange(fmt(start), fmt(end));
    }
  };

  return (
    <div className={`flex flex-col gap-2 p-2.5 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 ${className}`}>
      {/* Quick Presets */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold">
        <span className="text-[11px] text-slate-400 uppercase mr-1">Quick:</span>
        <button
          type="button"
          onClick={() => setPreset('today')}
          className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 cursor-pointer shadow-3xs"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setPreset('yesterday')}
          className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 cursor-pointer shadow-3xs"
        >
          Yesterday
        </button>
        <button
          type="button"
          onClick={() => setPreset('7days')}
          className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 cursor-pointer shadow-3xs"
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => setPreset('month')}
          className="px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-700 cursor-pointer shadow-3xs"
        >
          This Month
        </button>
      </div>

      {/* Date Pickers Inline */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="date"
            value={startDate || ''}
            onChange={(e) => onChange(e.target.value, endDate || e.target.value)}
            className="w-full h-8 px-2 text-xs font-sans rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 outline-none focus:border-[#D4AF37] cursor-pointer"
          />
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <div className="relative flex-1">
          <input
            type="date"
            value={endDate || ''}
            onChange={(e) => onChange(startDate || e.target.value, e.target.value)}
            className="w-full h-8 px-2 text-xs font-sans rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 outline-none focus:border-[#D4AF37] cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

// Time Picker Component
export interface TimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  label,
  className = '',
}) => {
  return (
    <div className={`relative flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {label}
        </span>
      )}
      <div className="relative flex items-center">
        <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 pointer-events-none" />
        <input
          type="time"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 pl-9 pr-3 text-sm font-sans rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 outline-none focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/25 shadow-2xs cursor-pointer"
        />
      </div>
    </div>
  );
};
