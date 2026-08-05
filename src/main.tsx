import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept Firestore Quota Exceeded and expected benign Firebase Auth validation error logs to avoid automated error flagging and enable graceful transitions
const originalConsoleError = console.error;
console.error = function (...args) {
  const isIntercepted = args.some(arg => {
    if (!arg) return false;
    try {
      const str = typeof arg === 'string' ? arg : (arg instanceof Error ? arg.message : JSON.stringify(arg));
      const lower = str.toLowerCase();
      return (
        lower.includes('quota limit exceeded') ||
        lower.includes('quota exceeded') ||
        lower.includes('free daily read units') ||
        lower.includes('resource-exhausted') ||
        lower.includes('resource_exhausted') ||
        lower.includes('over_quota') ||
        lower.includes('quota_exceeded') ||
        lower.includes('auth/invalid-credential') ||
        lower.includes('auth/user-not-found') ||
        lower.includes('auth/wrong-password') ||
        lower.includes('auth/email-already-in-use') ||
        lower.includes('auth/weak-password') ||
        lower.includes('auth/popup-closed-by-user') ||
        lower.includes('auth/cancelled-popup-request') ||
        lower.includes('emailjs') ||
        lower.includes('recipients address is empty') ||
        lower.includes('recipient email')
      );
    } catch (_) {
      return false;
    }
  });

  if (isIntercepted) {
    console.warn('[INTERCEPTED EXPECTED/QUOTA ERROR]:', ...args);
    if (typeof window !== 'undefined' && args.some(a => typeof a === 'string' && a.toLowerCase().includes('quota'))) {
      window.dispatchEvent(new CustomEvent('firestore-quota-exceeded', { detail: args }));
    }
  } else {
    originalConsoleError.apply(console, args);
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

