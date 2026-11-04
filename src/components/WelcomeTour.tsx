import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  PanelLeftClose, 
  Search, 
  Clock, 
  Bell, 
  SunMoon, 
  CheckCircle2, 
  X, 
  ArrowRight, 
  ArrowLeft 
} from 'lucide-react';

interface WelcomeTourProps {
  userName?: string;
  onClose: () => void;
}

interface TourStep {
  title: string;
  badge: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  tips: string[];
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Grouped Navigation & Modules',
    badge: 'Step 1 of 4 • Workspace',
    description: 'The redesigned left sidebar organizes all system functions into clear operational domains: Operations, Sales Desk, Financials, People & CRM, and System Administration.',
    icon: PanelLeftClose,
    tips: [
      'Click the collapse icon at the top of the sidebar to shrink to icon-only mode.',
      'Active tab is highlighted with an elegant SAT gold accent.',
      'Access sub-brands (SAT, GadgetZu, RTX) directly from the sidebar overview.',
    ],
  },
  {
    title: 'Global Search & Command Bar (⌘K)',
    badge: 'Step 2 of 4 • Speed & Search',
    description: 'Instantly jump to any module, product, invoice, or supplier from anywhere in the platform without clicking through menus.',
    icon: Search,
    tips: [
      'Press ⌘K (Mac) or Ctrl+K (Windows) anytime to open the Command Palette.',
      'Search products by SKU, name, or category in real time.',
      'Use arrow keys and Enter to immediately switch pages.',
    ],
  },
  {
    title: 'Attendance & Action Locking HUD',
    badge: 'Step 3 of 4 • Daily Check-In',
    description: 'To protect inventory accuracy, updating stock and issuing orders requires an active Check-In session for your work shift.',
    icon: Clock,
    tips: [
      'Check In at the beginning of your workday on the Dashboard.',
      'The tactile status chip in the top bar shows whether your shift is active.',
      'Remember to Check Out at the end of the shift to log work hours.',
    ],
  },
  {
    title: 'Real-time Alerts & Dark Mode',
    badge: 'Step 4 of 4 • Comfort & Notifications',
    description: 'Stay on top of low stock thresholds, order approvals, and system events with instant alerts, and choose your preferred viewing theme.',
    icon: SunMoon,
    tips: [
      'Click the notification bell in the top bar to inspect unread stock alerts.',
      'Switch between Dark and Light mode anytime with the top bar theme toggle.',
      'Your theme preference is saved to your account and synced across sessions.',
    ],
  },
];

const STORAGE_KEY = 'sat_welcome_tour_dismissed';

export const WelcomeTour: React.FC<WelcomeTourProps> = ({ userName, onClose }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const step = TOUR_STEPS[currentStepIndex];
  const StepIcon = step.icon;
  const isLast = currentStepIndex === TOUR_STEPS.length - 1;

  const handleFinish = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (e) {}
    }
    onClose();
  };

  const handleSkip = () => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (e) {}
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-2xl overflow-hidden p-6 sm:p-8 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
      >
        {/* Top Header Badge & Close Button */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-brand-gold/15 text-brand-gold">
              <Sparkles size={16} />
            </span>
            <span className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
              {step.badge}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSkip}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Skip Tour"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tour Step Content */}
        <div className="py-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-brand-gold shrink-0">
              <StepIcon size={24} />
            </div>
            <div>
              <h2 id="tour-title" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {step.title}
              </h2>
              {currentStepIndex === 0 && userName && (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                  Welcome to the platform, {userName}!
                </p>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {step.description}
          </p>

          {/* Quick tips list */}
          <div className="space-y-2 pt-2 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
            <p className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
              Key Features:
            </p>
            {step.tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <CheckCircle2 size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Progress Indicators */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentStepIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === currentStepIndex
                    ? 'w-6 bg-brand-gold'
                    : 'w-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300'
                }`}
                aria-label={`Jump to step ${idx + 1}`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={() => setCurrentStepIndex(prev => prev - 1)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={isLast ? handleFinish : () => setCurrentStepIndex(prev => prev + 1)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <span>{isLast ? 'Get Started' : 'Next'}</span>
              {!isLast && <ArrowRight size={14} />}
            </button>
          </div>
        </div>

        {/* Don't show again toggle */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
              className="rounded text-amber-500 focus:ring-brand-gold w-3.5 h-3.5"
            />
            <span>Don't show this welcome tour again</span>
          </label>

          <button
            type="button"
            onClick={handleSkip}
            className="hover:underline text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
};
