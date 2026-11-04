import React from 'react';
import { X, Check } from 'lucide-react';

export interface ChipOption<T = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export interface MultiSelectChipsProps<T = string> {
  options: ChipOption<T>[];
  selected: T[];
  onChange: (selected: T[]) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function MultiSelectChips<T extends string | number = string>({
  options,
  selected,
  onChange,
  size = 'md',
  className = '',
}: MultiSelectChipsProps<T>) {
  const toggleOption = (val: T) => {
    if (selected.includes(val)) {
      onChange(selected.filter(item => item !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const sizeClasses = {
    sm: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
    md: 'h-8 px-3 text-xs rounded-lg gap-2',
  };

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {options.map((option) => {
        const isSelected = selected.includes(option.value);
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => toggleOption(option.value)}
            className={`
              inline-flex items-center font-sans font-semibold transition-all duration-150 cursor-pointer select-none active:scale-[0.98] border
              ${sizeClasses[size]}
              ${isSelected
                ? 'bg-[#D4AF37] border-[#D4AF37] text-slate-950 shadow-2xs font-bold'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 dark:bg-slate-850 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }
            `}
          >
            {isSelected && <Check className="w-3 h-3 text-slate-950 stroke-[3]" />}
            {option.icon && !isSelected && <span className="shrink-0">{option.icon}</span>}
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className={`text-[10px] font-mono px-1 py-0.2 rounded-full ${
                isSelected ? 'bg-black/15 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Removable Tag Chip (for selected filters, badges)
export interface RemovableChipProps {
  label: string;
  onRemove: () => void;
  icon?: React.ReactNode;
  variant?: 'default' | 'gold' | 'danger';
}

export const RemovableChip: React.FC<RemovableChipProps> = ({
  label,
  onRemove,
  icon,
  variant = 'default',
}) => {
  const variantStyles = {
    default: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    gold: 'bg-[#D4AF37]/15 text-[#93741E] border-[#D4AF37]/40 dark:text-[#E2C255]',
    danger: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border shadow-3xs ${variantStyles[variant]}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 hover:opacity-75 cursor-pointer rounded-full"
        title="Remove"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
};
