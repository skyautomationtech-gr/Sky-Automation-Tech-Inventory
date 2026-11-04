/**
 * Sky Automation Tech (SAT) Design System Tokens
 * Single source of truth for UI styling.
 * 
 * IMPORTANT: All colors are defined as explicit hex strings (#RRGGBB)
 * with zero oklch() expressions to ensure complete compatibility
 * with html2canvas and print capture engines.
 */

export const colors = {
  // Brand Gold Accent Scale (Core identity: #D4AF37)
  gold: {
    50: '#FDFBF2',
    100: '#FAF4DD',
    200: '#F3E6B2',
    300: '#EBD584',
    400: '#E2C255',
    500: '#D4AF37', // Primary Brand Gold
    600: '#B89628', // Darker Gold for hover & high-contrast text
    700: '#93741E',
    800: '#6E5517',
    900: '#4A380F',
    950: '#261C05',
  },

  // Light Mode Surfaces & Text
  light: {
    bg: '#F8FAFC',          // App canvas
    card: '#FFFFFF',        // Card background
    cardRaised: '#F1F5F9',  // Raised sub-element
    border: '#E2E8F0',      // Standard border
    borderSubtle: '#F1F5F9',
    borderFocus: '#D4AF37',
    textPrimary: '#0F172A', // Slate-900
    textSecondary: '#475569',// Slate-600
    textMuted: '#94A3B8',   // Slate-400
  },

  // Dark Mode Surfaces & Text (First-class Dark Theme)
  dark: {
    bg: '#090D16',          // Deep luxury canvas
    card: '#0F172A',        // Card background (Slate-900)
    cardRaised: '#1E293B',  // Raised sub-element (Slate-800)
    border: '#1E293B',      // Standard border
    borderSubtle: '#334155',
    borderFocus: '#D4AF37',
    textPrimary: '#F8FAFC', // Slate-50
    textSecondary: '#94A3B8',// Slate-400
    textMuted: '#64748B',   // Slate-500
  },

  // Semantic Feedback Colors
  semantic: {
    success: {
      light: '#10B981',
      bgLight: '#ECFDF5',
      textLight: '#065F46',
      dark: '#34D399',
      bgDark: '#064E3B',
      textDark: '#A7F3D0',
    },
    warning: {
      light: '#F59E0B',
      bgLight: '#FFFBEB',
      textLight: '#92400E',
      dark: '#FBBF24',
      bgDark: '#78350F',
      textDark: '#FDE68A',
    },
    danger: {
      light: '#EF4444',
      bgLight: '#FEF2F2',
      textLight: '#991B1B',
      dark: '#F87171',
      bgDark: '#7F1D1D',
      textDark: '#FECACA',
    },
    info: {
      light: '#3B82F6',
      bgLight: '#EFF6FF',
      textLight: '#1E40AF',
      dark: '#60A5FA',
      bgDark: '#1E3A8A',
      textDark: '#BFDBFE',
    },
  },
} as const;

// 8px Grid Spacing Scale
export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',   // 1 Grid Unit
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',  // 2 Grid Units
  5: '20px',
  6: '24px',  // 3 Grid Units
  8: '32px',  // 4 Grid Units
  10: '40px', // 5 Grid Units
  12: '48px', // 6 Grid Units
  16: '64px', // 8 Grid Units
  20: '80px', // 10 Grid Units
} as const;

// Corner Radii (8px grid aligned)
export const radii = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  full: '9999px',
} as const;

// Shadows (Flat, Raised, Neumorphic Soft-UI, Glass)
export const shadows = {
  flat: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  raised: '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.04)',
  elevated: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
  
  // Neumorphic Soft-UI Shadows (Small tactile controls)
  softLight: '6px 6px 14px #e2e8f0, -6px -6px 14px #ffffff',
  softLightSm: '3px 3px 8px #e2e8f0, -3px -3px 8px #ffffff',
  softLightInner: 'inset 3px 3px 6px #cbd5e1, inset -3px -3px 6px #ffffff',
  softLightPressed: 'inset 2px 2px 4px #cbd5e1, inset -2px -2px 4px #ffffff',

  softDark: '6px 6px 14px #04060b, -6px -6px 14px #1a2336',
  softDarkSm: '3px 3px 8px #04060b, -3px -3px 8px #1a2336',
  softDarkInner: 'inset 3px 3px 6px #04060b, inset -3px -3px 6px #1a2336',
  softDarkPressed: 'inset 2px 2px 4px #04060b, inset -2px -2px 4px #1a2336',
} as const;

// Typography Scale
export const typography = {
  fontFamily: {
    sans: 'var(--font-sans)',
    display: 'var(--font-display)',
    mono: 'var(--font-mono)',
  },
  fontSize: {
    xs: ['12px', '16px'],
    sm: ['13px', '18px'],
    base: ['14px', '20px'],
    md: ['15px', '22px'],
    lg: ['16px', '24px'],
    xl: ['18px', '26px'],
    '2xl': ['20px', '28px'],
    '3xl': ['24px', '32px'],
    '4xl': ['30px', '38px'],
  },
} as const;

// Z-Index Layers
export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  drawer: 1040,
  modal: 1050,
  popover: 1060,
  toast: 1070,
  tooltip: 1080,
} as const;

// Micro-interactions (Fast & subtle: 150-250ms)
export const motion = {
  fast: '150ms cubic-bezier(0.16, 1, 0.3, 1)',
  normal: '200ms cubic-bezier(0.16, 1, 0.3, 1)',
  slow: '250ms cubic-bezier(0.16, 1, 0.3, 1)',
} as const;
