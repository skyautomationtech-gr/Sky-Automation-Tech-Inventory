import React from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import { useTheme } from './ThemeContext';

export interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'button' | 'segmented';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showLabel = false,
  variant = 'button',
}) => {
  const { theme, themePreference, setThemePreference, toggleTheme } = useTheme();

  if (variant === 'segmented') {
    return (
      <div
        className={`inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs ${className}`}
        role="group"
        aria-label="Theme selector"
      >
        <button
          type="button"
          onClick={() => setThemePreference('light')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            themePreference === 'light'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Light theme"
        >
          <Sun size={14} className="text-amber-500" />
          {showLabel && <span>Light</span>}
        </button>

        <button
          type="button"
          onClick={() => setThemePreference('dark')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            themePreference === 'dark'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="Dark theme"
        >
          <Moon size={14} className="text-brand-gold" />
          {showLabel && <span>Dark</span>}
        </button>

        <button
          type="button"
          onClick={() => setThemePreference('system')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
            themePreference === 'system'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
          }`}
          title="System preference"
        >
          <Laptop size={14} />
          {showLabel && <span>System</span>}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className={`relative inline-flex items-center justify-center p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200/80 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 shadow-2xs transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 ${className}`}
      title={
        theme === 'dark'
          ? 'Switch to light mode (currently dark)'
          : 'Switch to dark mode (currently light)'
      }
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun size={18} className="text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <Moon size={18} className="text-slate-700 transition-transform hover:-rotate-12" />
      )}
      {showLabel && (
        <span className="ml-2 text-xs font-bold capitalize">
          {theme === 'dark' ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
};
