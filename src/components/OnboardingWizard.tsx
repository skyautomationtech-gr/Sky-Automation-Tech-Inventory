import React, { useState } from 'react';
import { CompanySettings } from '../types';
import { saveCompanySettings, updateUserProfile } from '../firebase/db';
import { Building2, Plus, Sparkles, Check, CheckCircle2, Ticket } from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: (settings: CompanySettings) => void;
  userId: string;
}

export default function OnboardingWizard({ onComplete, userId }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [companyName, setCompanyName] = useState('Sky Automation Tech');
  const [logoUrl, setLogoUrl] = useState('');
  
  // Custom Prefixes state
  const [satPrefix, setSatPrefix] = useState('SAT-INV');
  const [gzPrefix, setGzPrefix] = useState('GZ-INV');
  const [rtxPrefix, setRtxPrefix] = useState('RTX-INV');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleNextStep = () => {
    if (step === 1 && !companyName.trim()) {
      setError('Please provide a company name.');
      return;
    }
    setError('');
    setStep(step + 1);
  };

  const handlePrevStep = () => {
    setError('');
    setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleSubmit called, userId:', userId);
    if (!companyName.trim()) {
      setError('Company Name is required.');
      return;
    }

    setLoading(true);
    setError('');

    const newSettings: CompanySettings = {
      companyName,
      logoUrl: logoUrl || undefined,
      prefixes: {
        SAT: satPrefix || 'SAT-INV',
        GZ: gzPrefix || 'GZ-INV',
        RTX: rtxPrefix || 'RTX-INV'
      },
      onboarded: true
    };

    try {
      console.log('Finalizing setup: saving company settings...');
      await saveCompanySettings(newSettings);
      console.log('Finalizing setup: company settings saved. Updating user role...');
      await updateUserProfile(userId, { 
        role: 'superadmin',
        subBrandAccess: ['SAT', 'GZ', 'RTX']
      });
      console.log('Finalizing setup: user role updated.');
      
      onComplete(newSettings);
    } catch (err: any) {
      console.error('Finalize setup error:', err);
      try {
        const errorInfo = JSON.parse(err.message);
        setError(errorInfo.error || 'Error saving company configuration.');
      } catch (parseError) {
        setError(err.message || 'Error saving company configuration.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-xl bg-slate-900/80 backdrop-blur-md rounded-3xl border border-slate-800 shadow-2xl p-8 md:p-10 z-10">
        
        {/* Step Indicator Header */}
        <div className="flex justify-between items-center mb-8 border-b border-slate-800 pb-5">
          <div>
            <span className="text-sm font-mono text-amber-400 tracking-widest uppercase">System Initialization</span>
            <h1 className="text-xl font-bold text-white font-sans mt-0.5">Setup Wizard</h1>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-semibold border transition-all duration-200 ${
                  s === step
                    ? 'bg-amber-400 border-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.3)]'
                    : s < step
                    ? 'bg-teal-500/20 border-teal-500/40 text-teal-300'
                    : 'bg-slate-950 border-slate-800 text-slate-500'
                }`}
              >
                {s < step ? <Check size={12} /> : s}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-950/40 border border-red-500/30 text-red-300 p-4 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* STEP 1: Company Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100">Company Identity</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Provide your main registered business details. This will brand the dashboard console.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Business Name
                </label>
                <div className="mt-1 relative">
                  <Building2 className="absolute top-3.5 left-3 text-slate-500" size={18} />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="pl-10 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm font-semibold"
                    placeholder="e.g. Sky Automation Tech"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold uppercase tracking-wider text-slate-400">
                  Business Logo URL (Optional)
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl py-3 px-4 text-white placeholder-slate-600 focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-transparent text-sm"
                  placeholder="e.g. https://yourdomain.com/logo.png"
                />
                <p className="mt-1.5 text-sm text-slate-500">
                  Leave empty to use the default high-tech visual logo.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={handleNextStep}
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-3 px-6 rounded-xl text-sm transition-all shadow-md flex items-center gap-2"
              >
                Configure Brands & Prefixes →
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Configure Brands & Invoice Prefix */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-slate-100">Sub-brands & Invoice Prefixing</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                We've configured three central sub-brand segments. Set the unique serial numbering formats below.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white font-sans">Sky Automation Tech (SAT)</h3>
                  <p className="text-sm text-slate-400">Central Enterprise Platform</p>
                </div>
                <div className="w-28">
                  <input
                    type="text"
                    value={satPrefix}
                    onChange={(e) => setSatPrefix(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-center text-sm font-mono font-bold text-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white font-sans">GadgetZu (GZ)</h3>
                  <p className="text-sm text-slate-400">Retail Accessories Segment</p>
                </div>
                <div className="w-28">
                  <input
                    type="text"
                    value={gzPrefix}
                    onChange={(e) => setGzPrefix(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-center text-sm font-mono font-bold text-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white font-sans">RTX Gadget (RTX)</h3>
                  <p className="text-sm text-slate-400">Premium High-End Gadgets</p>
                </div>
                <div className="w-28">
                  <input
                    type="text"
                    value={rtxPrefix}
                    onChange={(e) => setRtxPrefix(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2 text-center text-sm font-mono font-bold text-amber-400 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={handlePrevStep}
                className="bg-transparent border border-slate-800 text-slate-300 font-bold py-3 px-6 rounded-xl text-sm transition-all hover:bg-slate-800"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-3 px-6 rounded-xl text-sm transition-all shadow-md flex items-center gap-2"
              >
                Review Configuration →
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Final Confirmation */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center py-4 space-y-3">
              <div className="w-20 h-20 bg-teal-500/10 border-2 border-teal-400 text-teal-400 rounded-full flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(45,212,191,0.2)]">
                <CheckCircle2 size={40} className="animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Enterprise Initialized!</h2>
              <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
                Your database schemas and sub-brand credentials for {companyName} are ready for live operations.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-sm space-y-2">
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500 font-semibold font-sans">Business Name</span>
                <span className="text-slate-200 font-bold">{companyName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500 font-semibold font-sans">SAT Prefix</span>
                <span className="text-amber-400 font-mono font-bold">{satPrefix}</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-2">
                <span className="text-slate-500 font-semibold font-sans">GadgetZu Prefix</span>
                <span className="text-amber-400 font-mono font-bold">{gzPrefix}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-semibold font-sans">RTX Gadget Prefix</span>
                <span className="text-amber-400 font-mono font-bold">{rtxPrefix}</span>
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={handlePrevStep}
                className="bg-transparent border border-slate-800 text-slate-300 font-bold py-3 px-6 rounded-xl text-sm transition-all hover:bg-slate-800"
                disabled={loading}
              >
                ← Edit
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-3 px-8 rounded-xl text-sm transition-all shadow-[0_4px_20px_rgba(251,191,36,0.3)] flex items-center gap-2"
              >
                {loading ? 'Finalizing Setup...' : 'Launch Console Now ⚡'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
