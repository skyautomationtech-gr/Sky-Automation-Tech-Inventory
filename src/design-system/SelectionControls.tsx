import React from 'react';
import { Check } from 'lucide-react';

// Checkbox Component
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  description,
  className = '',
  disabled,
  checked,
  onChange,
  id,
  ...props
}, ref) => {
  const generatedId = id || (label ? `chk-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <label
      htmlFor={generatedId}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none group ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      } ${className}`}
    >
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          ref={ref}
          id={generatedId}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className="w-4.5 h-4.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 transition-all duration-150 peer-checked:bg-[#D4AF37] peer-checked:border-[#D4AF37] peer-focus-visible:ring-2 peer-focus-visible:ring-[#D4AF37]/40 flex items-center justify-center shadow-2xs group-hover:border-slate-400 dark:group-hover:border-slate-500">
          <Check className="w-3 h-3 text-slate-950 font-black opacity-0 peer-checked:opacity-100 transition-opacity stroke-[3]" />
        </div>
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
});

Checkbox.displayName = 'Checkbox';

// Radio Component
export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({
  label,
  description,
  className = '',
  disabled,
  checked,
  onChange,
  id,
  ...props
}, ref) => {
  const generatedId = id || (label ? `rad-${String(label).replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <label
      htmlFor={generatedId}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none group ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      } ${className}`}
    >
      <div className="relative flex items-center justify-center shrink-0 mt-0.5">
        <input
          ref={ref}
          id={generatedId}
          type="radio"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className="w-4.5 h-4.5 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 transition-all duration-150 peer-checked:border-[#D4AF37] peer-focus-visible:ring-2 peer-focus-visible:ring-[#D4AF37]/40 flex items-center justify-center shadow-2xs group-hover:border-slate-400">
          <div className="w-2 h-2 rounded-full bg-[#D4AF37] opacity-0 peer-checked:opacity-100 transition-opacity" />
        </div>
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
});

Radio.displayName = 'Radio';

// Neumorphic Soft-UI Toggle Switch
export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  disabled = false,
  className = '',
}) => {
  const sizeMap = {
    sm: { track: 'w-8 h-4.5 p-0.5', thumb: 'w-3.5 h-3.5', translate: 'translate-x-3.5' },
    md: { track: 'w-11 h-6 p-0.5', thumb: 'w-5 h-5', translate: 'translate-x-5' },
    lg: { track: 'w-14 h-7.5 p-1', thumb: 'w-5.5 h-5.5', translate: 'translate-x-6.5' },
  };

  const currentSize = sizeMap[size];

  return (
    <label
      className={`inline-flex items-center gap-3 select-none cursor-pointer group ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      } ${className}`}
      onClick={(e) => {
        if (!disabled) {
          e.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <div
        className={`
          relative rounded-full transition-colors duration-200 shrink-0
          ${currentSize.track}
          ${checked ? 'bg-[#D4AF37]' : 'bg-slate-200 dark:bg-slate-800'}
          soft-ui-inner
        `}
      >
        <div
          className={`
            rounded-full bg-white transition-transform duration-200 flex items-center justify-center
            shadow-sm
            ${currentSize.thumb}
            ${checked ? `${currentSize.translate} bg-slate-950 text-[#D4AF37]` : 'translate-x-0'}
          `}
        />
      </div>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {label}
            </span>
          )}
          {description && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {description}
            </span>
          )}
        </div>
      )}
    </label>
  );
};
