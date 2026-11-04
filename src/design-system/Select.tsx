import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';

export interface SelectOption<T = string | number> {
  value: T;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
}

export interface SelectProps<T = string | number> {
  options: SelectOption<T>[];
  value?: T;
  onChange: (value: T) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  error?: boolean | string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  isClearable?: boolean;
}

export function Select<T extends string | number = string>({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  searchable = true,
  disabled = false,
  error = false,
  className = '',
  size = 'md',
  isClearable = false,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
    if (!isOpen) {
      setSearchQuery('');
    }
  }, [isOpen, searchable]);

  // Selected Option
  const selectedOption = useMemo(() => {
    return options.find(o => o.value === value);
  }, [options, value]);

  // Filtered Options
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase();
    return options.filter(o => 
      o.label.toLowerCase().includes(q) || 
      (o.sublabel && o.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchQuery]);

  const sizeClasses = {
    sm: 'h-8 text-xs px-2.5 rounded-md',
    md: 'h-9 text-sm px-3 rounded-lg',
    lg: 'h-11 text-sm px-3.5 rounded-xl',
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          w-full flex items-center justify-between font-sans text-left transition-all duration-150 outline-none cursor-pointer
          bg-white text-slate-900 border border-slate-200 hover:border-slate-300 shadow-2xs
          focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/25
          dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700 dark:hover:border-slate-600
          disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
          dark:disabled:bg-slate-800 dark:disabled:text-slate-500
          ${error ? '!border-red-500' : ''}
          ${sizeClasses[size]}
        `}
      >
        <div className="flex items-center gap-2 truncate pr-2">
          {selectedOption?.icon && (
            <span className="shrink-0">{selectedOption.icon}</span>
          )}
          {selectedOption ? (
            <span className="truncate font-medium">{selectedOption.label}</span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {isClearable && value !== undefined && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('' as unknown as T);
              }}
              className="p-0.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer rounded"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#D4AF37]' : ''}`} />
        </div>
      </button>

      {/* Dropdown Menu (Glassmorphism layered surface) */}
      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 rounded-xl shadow-xl glass-surface border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md overflow-hidden animate-fadeIn">
          {searchable && options.length > 5 && (
            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter options..."
                  className="w-full h-7 pl-8 pr-3 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg outline-none border border-transparent focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30"
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto p-1 space-y-0.5 scrollbar-thin">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                No matching options
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    disabled={option.disabled}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer select-none
                      ${isSelected 
                        ? 'bg-[#D4AF37]/15 text-[#B89628] dark:text-[#E2C255] font-semibold' 
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                      }
                      ${option.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {option.icon && <span className="shrink-0">{option.icon}</span>}
                      <div className="flex flex-col truncate">
                        <span className="truncate">{option.label}</span>
                        {option.sublabel && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal truncate">
                            {option.sublabel}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {option.badge && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {option.badge}
                        </span>
                      )}
                      {isSelected && <Check className="w-4 h-4 text-[#D4AF37]" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
