import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}, ref) => {
  const isDisabled = disabled || isLoading;

  // Base layout, font, transition & micro-interaction styles
  const baseClasses = 'inline-flex items-center justify-center font-sans font-semibold transition-all duration-150 cursor-pointer select-none active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:active:scale-100 disabled:opacity-50';

  // Size specifications (Desktop-focused laptop ergonomics)
  const sizeClasses: Record<ButtonSize, string> = {
    xs: 'h-7 px-2.5 text-xs rounded-md gap-1.5',
    sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
    md: 'h-9 px-4 text-sm rounded-lg gap-2',
    lg: 'h-11 px-5 text-sm rounded-xl gap-2.5',
    xl: 'h-13 px-6 text-base rounded-xl gap-3 font-bold',
  };

  // Variant styling with pure hex colors and dark-mode adaptation
  const variantClasses: Record<ButtonVariant, string> = {
    primary: 'bg-[#D4AF37] hover:bg-[#B89628] active:bg-[#93741E] text-slate-950 shadow-xs hover:shadow-sm font-bold',
    secondary: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs dark:bg-slate-800 dark:hover:bg-slate-700 dark:active:bg-slate-750 dark:text-slate-100 dark:border-slate-700',
    ghost: 'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:active:bg-slate-800',
    danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-xs',
    soft: 'bg-slate-100 hover:bg-slate-200/80 active:bg-slate-200 text-slate-800 soft-ui-flat dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-750',
  };

  const widthClass = fullWidth ? 'w-full' : '';

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${widthClass} ${className}`}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0 text-current" />
          <span>{children}</span>
        </>
      ) : (
        <>
          {leftIcon && <span className="shrink-0 flex items-center">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="shrink-0 flex items-center">{rightIcon}</span>}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';

// Icon-Only Button
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}, ref) => {
  const iconSizeClasses: Record<ButtonSize, string> = {
    xs: 'w-7 h-7 rounded-md p-1',
    sm: 'w-8 h-8 rounded-lg p-1.5',
    md: 'w-9 h-9 rounded-lg p-2',
    lg: 'w-11 h-11 rounded-xl p-2.5',
    xl: 'w-13 h-13 rounded-xl p-3',
  };

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      isLoading={isLoading}
      disabled={disabled}
      className={`${iconSizeClasses[size]} !px-0 ${className}`}
      {...props}
    >
      {!isLoading && icon}
    </Button>
  );
});

IconButton.displayName = 'IconButton';

// Segmented Button Group
export interface ButtonGroupProps {
  children: React.ReactNode;
  className?: string;
  isAttached?: boolean;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  className = '',
  isAttached = true,
}) => {
  if (!isAttached) {
    return <div className={`inline-flex items-center gap-2 ${className}`}>{children}</div>;
  }

  return (
    <div className={`inline-flex items-center rounded-lg shadow-2xs [&>button]:rounded-none [&>button:first-child]:rounded-l-lg [&>button:last-child]:rounded-r-lg [&>button:not(:first-child)]:-ml-[1px] ${className}`}>
      {children}
    </div>
  );
};
