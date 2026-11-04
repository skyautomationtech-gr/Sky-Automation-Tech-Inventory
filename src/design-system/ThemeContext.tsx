import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { updateUserProfile } from '../firebase/db';

export type Theme = 'light' | 'dark';
export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  userId?: string | null;
  initialUserPreference?: ThemePreference;
}

const STORAGE_KEY = 'sat_theme_preference';

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  userId,
  initialUserPreference,
}) => {
  // Determine initial preference: user profile > localStorage > 'system'
  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (initialUserPreference) return initialUserPreference;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        return stored;
      }
    }
    return 'system';
  });

  // Track system dark mode query
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Keep system query in sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Sync preference if user profile changes
  useEffect(() => {
    if (initialUserPreference && initialUserPreference !== preference) {
      setPreference(initialUserPreference);
    }
  }, [initialUserPreference]);

  // Compute active theme
  const resolvedTheme: Theme = useMemo(() => {
    if (preference === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return preference;
  }, [preference, systemIsDark]);

  // Apply to DOM classList
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [resolvedTheme]);

  // Set and persist preference
  const handleSetPreference = async (newPref: ThemePreference) => {
    setPreference(newPref);
    try {
      localStorage.setItem(STORAGE_KEY, newPref);
    } catch (e) {
      // Ignore local storage error
    }

    if (userId) {
      try {
        await updateUserProfile(userId, { themePreference: newPref });
      } catch (err) {
        console.warn('Failed to persist theme preference to user profile:', err);
      }
    }
  };

  const handleToggle = async () => {
    const nextTheme: Theme = resolvedTheme === 'dark' ? 'light' : 'dark';
    await handleSetPreference(nextTheme);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: resolvedTheme,
        themePreference: preference,
        setThemePreference: handleSetPreference,
        toggleTheme: handleToggle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
