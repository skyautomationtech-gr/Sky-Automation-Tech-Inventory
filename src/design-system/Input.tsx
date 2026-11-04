import React, { useState } from 'react';
import { Eye, EyeOff, Search, X } from 'lucide-react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface FormFieldWrapperProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  id?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldWrapperProps> = ({
  label,
  required,
  error,
  hint,
  id,
  children,
  className = '',
}) => {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-between"
        >
          <span>
            {label}
            {required && <span className="text-red-500 ml-1 font-bold">*</span>}
          </span>
        </label>
      )}
      {children}
      {error ? (
        <span className="text-xs font-medium text-red-600 dark:text-red-400 mt-0.5 animate-fadeIn">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {hint}
        </span>
      ) : null}
    </div>
  );
};

export interface BaseInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  sizeVariant?: InputSize;
  error?: boolean | string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
  isSoftUI?: boolean;
}

const inputSizeClasses: Record<InputSize, string> = {
  sm: 'h-8 px-2.5 text-xs rounded-md',
  md: 'h-9 px-3 text-sm rounded-lg',
  lg: 'h-11 px-3.5 text-sm rounded-xl',
};

export const Input = React.forwardRef<HTMLInputElement, BaseInputProps>(({
  sizeVariant = 'md',
  error,
  leftAddon,
  rightAddon,
  isSoftUI = false,
  className = '',
  disabled,
  ...props
}, ref) => {
  const hasError = Boolean(error);

  const baseInputStyle = `
    w-full font-sans transition-all duration-150 outline-none
    bg-white text-slate-900 placeholder:text-slate-400
    border border-slate-200 hover:border-slate-300
    focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/25
    dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500
    dark:border-slate-700 dark:hover:border-slate-600
    dark:focus:border-[#D4AF37] dark:focus:ring-[#D4AF37]/20
    disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
    dark:disabled:bg-slate-800 dark:disabled:text-slate-500
  `;

  const errorStyle = hasError 
    ? '!border-red-500 focus:!ring-red-500/25 dark:!border-red-500' 
    : '';

  const softStyle = isSoftUI
    ? 'soft-ui-inner !border-transparent bg-slate-50 dark:bg-slate-950'
    : 'shadow-2xs';

  return (
    <div className="relative flex items-center w-full">
      {leftAddon && (
        <div className="absolute left-3 z-10 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
          {leftAddon}
        </div>
      )}
      <input
        ref={ref}
        disabled={disabled}
        className={`
          ${baseInputStyle}
          ${inputSizeClasses[sizeVariant]}
          ${errorStyle}
          ${softStyle}
          ${leftAddon ? 'pl-9' : ''}
          ${rightAddon ? 'pr-9' : ''}
          ${className}
        `}
        {...props}
      />
      {rightAddon && (
        <div className="absolute right-3 z-10 flex items-center text-slate-400 dark:text-slate-500">
          {rightAddon}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

// Specialized Search Input with clear button
export interface SearchInputProps extends Omit<BaseInputProps, 'leftAddon' | 'rightAddon'> {
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(({
  value,
  onChange,
  onClear,
  placeholder = 'Search...',
  sizeVariant = 'md',
  isSoftUI = true,
  className = '',
  ...props
}, ref) => {
  const hasValue = Boolean(value);

  return (
    <Input
      ref={ref}
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      sizeVariant={sizeVariant}
      isSoftUI={isSoftUI}
      leftAddon={<Search className="w-4 h-4 text-slate-400 dark:text-slate-500" />}
      rightAddon={hasValue && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="p-1 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer rounded"
          title="Clear search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      ) : undefined}
      className={className}
      {...props}
    />
  );
});

SearchInput.displayName = 'SearchInput';

// Password Input with eye toggle
export const PasswordInput = React.forwardRef<HTMLInputElement, BaseInputProps>(({
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <Input
      ref={ref}
      type={showPassword ? 'text' : 'password'}
      rightAddon={
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="p-1 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer rounded"
          title={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      }
      {...props}
    />
  );
});

PasswordInput.displayName = 'PasswordInput';

// Currency / Price Input with BDT (৳) prefix
export const CurrencyInput = React.forwardRef<HTMLInputElement, BaseInputProps>(({
  className = '',
  ...props
}, ref) => {
  return (
    <Input
      ref={ref}
      type="number"
      step="any"
      leftAddon={<span className="font-mono font-bold text-slate-500 dark:text-slate-400">৳</span>}
      className={`font-mono font-semibold ${className}`}
      {...props}
    />
  );
});

CurrencyInput.displayName = 'CurrencyInput';

// Textarea Component
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
  isSoftUI?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  error,
  isSoftUI = false,
  className = '',
  rows = 3,
  disabled,
  ...props
}, ref) => {
  const hasError = Boolean(error);

  const baseTextareaStyle = `
    w-full p-3 text-sm font-sans rounded-xl outline-none transition-all duration-150
    bg-white text-slate-900 placeholder:text-slate-400
    border border-slate-200 hover:border-slate-300
    focus:border-[#D4AF37] focus:ring-2 focus:ring-[#D4AF37]/25
    dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500
    dark:border-slate-700 dark:hover:border-slate-600
    dark:focus:border-[#D4AF37] dark:focus:ring-[#D4AF37]/20
    disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed
    dark:disabled:bg-slate-800 dark:disabled:text-slate-500
  `;

  const errorStyle = hasError ? '!border-red-500 focus:!ring-red-500/25 dark:!border-red-500' : '';
  const softStyle = isSoftUI ? 'soft-ui-inner !border-transparent bg-slate-50 dark:bg-slate-950' : 'shadow-2xs';

  return (
    <textarea
      ref={ref}
      rows={rows}
      disabled={disabled}
      className={`${baseTextareaStyle} ${errorStyle} ${softStyle} ${className}`}
      {...props}
    />
  );
});

Textarea.displayName = 'Textarea';
