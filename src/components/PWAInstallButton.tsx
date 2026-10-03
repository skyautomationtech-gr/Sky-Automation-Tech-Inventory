import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone, Share2, PlusSquare, CheckCircle2, X } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'sidebar' | 'banner';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  variant = 'compact',
  className = '' 
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // If already installed and running as standalone app, suppress the button
  if (isInstalled) {
    return null;
  }

  // If neither Chromium prompt is ready nor iOS device, we can still show a friendly helper or keep it available
  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
      return;
    }

    if (isInstallable) {
      setIsInstalling(true);
      try {
        await install();
      } finally {
        setIsInstalling(false);
      }
    } else {
      // Fallback instructions if browser hasn't fired beforeinstallprompt yet
      setShowIOSGuide(true);
    }
  };

  const renderButtonContent = () => {
    if (variant === 'sidebar') {
      return (
        <button
          onClick={handleInstallClick}
          disabled={isInstalling}
          className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600/20 to-sky-500/10 hover:from-blue-600/30 hover:to-sky-500/20 text-sky-300 border border-sky-500/30 transition-all text-xs font-medium group shadow-sm ${className}`}
          title="Install Sky Automation Tech PWA App"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30 transition">
              <Download className="w-4 h-4" />
            </div>
            <div className="text-left">
              <div className="font-semibold text-white group-hover:text-sky-200">অ্যাপ ইনস্টল করুন</div>
              <div className="text-[10px] text-sky-400/80">PWA App Install</div>
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/20">
            PWA
          </span>
        </button>
      );
    }

    if (variant === 'banner') {
      return (
        <div className={`p-4 rounded-2xl bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${className}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 p-2.5 flex items-center justify-center text-white shadow-lg shrink-0">
              <Smartphone className="w-full h-full" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                Sky Automation Tech Mobile / Desktop App
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md">
                  PWA Ready
                </span>
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                আপনার ফোন বা কম্পিউটারে এক ক্লিকে ইনস্টল করে সরাসরি অ্যাপের মতো ব্যবহার করুন (অফলাইন সাপোর্ট সহ)।
              </p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            disabled={isInstalling}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold shadow-md transition whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            {isInstalling ? 'ইনস্টল হচ্ছে...' : 'ইনস্টল করুন (Install)'}
          </button>
        </div>
      );
    }

    // Default 'compact' button (for Header / Navbar)
    return (
      <button
        onClick={handleInstallClick}
        disabled={isInstalling}
        className={`flex items-center gap-2 rounded-xl bg-blue-600/90 hover:bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:shadow-md transition active:scale-95 border border-blue-400/30 ${className}`}
        title="Install Sky Automation Tech Application"
      >
        <Download className="w-3.5 h-3.5 text-sky-200" />
        <span>Install App</span>
      </button>
    );
  };

  return (
    <>
      {renderButtonContent()}

      {/* iOS or Manual Installation Guide Modal */}
      {showIOSGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowIOSGuide(false)}
        >
          <div 
            className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-white relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowIOSGuide(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">অ্যাপ ইনস্টলেশন গাইড (PWA)</h3>
                <p className="text-xs text-slate-400">Sky Automation Tech</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-4 text-sm text-slate-300">
                <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/40 p-2.5 rounded-lg">
                  iOS Safari ব্রাউজারে নিচের ৩টি সহজ ধাপে অ্যাপটি হোম স্ক্রিনে ইনস্টল করুন:
                </p>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
                    <Share2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-white text-xs block">ধাপ ১: Share বাটনে চাপুন</span>
                    <span className="text-xs text-slate-400">Safari ব্রাউজারের নিচে থাকা Share (শেয়ার) আইকনে ট্যাপ করুন।</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 shrink-0">
                    <PlusSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-white text-xs block">ধাপ ২: Add to Home Screen</span>
                    <span className="text-xs text-slate-400">মেনুটি স্ক্রোল করে <strong>"Add to Home Screen"</strong> নির্বাচন করুন।</span>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="font-semibold text-white text-xs block">ধাপ ৩: Add সম্পন্ন করুন</span>
                    <span className="text-xs text-slate-400">উপরের ডান কোণে থাকা <strong>"Add"</strong> চাপলে হোম স্ক্রিনে অ্যাপ আইকন চলে আসবে।</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-slate-300">
                <p className="text-xs text-slate-300">
                  ব্রাউজারের অ্যাড্রেস বারের ডানপাশে থাকা <strong className="text-blue-400">Install App</strong> আইকন অথবা ব্রাউজার মেনু (তিনটি ডট <strong className="text-white">⋮</strong>) থেকে <strong>"Install Sky Automation Tech"</strong> বা <strong>"Add to Home Screen"</strong> এ ক্লিক করুন।
                </p>
                <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-800/40 text-xs text-blue-200">
                  ✓ সরাসরি ফুলস্ক্রিন অ্যাপ উইন্ডোতে চলবে<br />
                  ✓ অফলাইনেও ক্যাশ ডাটা দেখা যাবে<br />
                  ✓ দ্রুত লোডিং ও লাইটওয়েট
                </div>
              </div>
            )}

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-5 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2.5 text-xs font-bold text-white transition shadow-lg active:scale-98"
            >
              বুঝেছি (Got It)
            </button>
          </div>
        </div>
      )}
    </>
  );
};
