import React, { useState, useRef, useEffect } from 'react';

// Tooltip Component
export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<any>(null);

  const show = () => {
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {isVisible && (
        <div
          role="tooltip"
          className={`
            absolute z-[1080] px-2.5 py-1 text-xs font-semibold font-sans
            bg-slate-900 text-white rounded-md shadow-md whitespace-nowrap pointer-events-none
            animate-fadeIn ${positionClasses[position]}
          `}
        >
          {content}
        </div>
      )}
    </div>
  );
};

// Popover Component
export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  className?: string;
  width?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  children,
  title,
  className = '',
  width = 'w-72',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={popoverRef} className="relative inline-block">
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer inline-flex">
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`
            absolute right-0 mt-2 z-[1060] ${width}
            glass-surface rounded-2xl shadow-xl p-4
            bg-white/95 dark:bg-slate-900/95 backdrop-blur-md
            border border-slate-200/90 dark:border-slate-800
            animate-fadeIn ${className}
          `}
        >
          {title && (
            <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 font-display">
              {title}
            </div>
          )}
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};
