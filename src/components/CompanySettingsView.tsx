import React, { useState, useEffect } from 'react';
import { CompanySettings, UserProfile } from '../types';
import { 
  Building2, 
  Tag, 
  Receipt, 
  Sliders, 
  Bell, 
  Eye, 
  Save, 
  Upload, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Phone, 
  Mail, 
  MapPin, 
  DollarSign, 
  Smartphone, 
  CreditCard, 
  MessageSquare, 
  Hash, 
  FileText, 
  Layers, 
  Sparkles,
  Download,
  Info,
  ShieldCheck,
  Check
} from 'lucide-react';

interface CompanySettingsViewProps {
  user: UserProfile | null;
  companySettings: CompanySettings | null;
  onSave: (updatedSettings: Partial<CompanySettings>) => Promise<void>;
  requireCheckIn?: () => boolean;
}

export default function CompanySettingsView({
  user,
  companySettings,
  onSave,
  requireCheckIn
}: CompanySettingsViewProps) {
  const isSuperAdmin = user?.role === 'superadmin';
  const isPrivileged = isSuperAdmin || user?.role === 'admin';

  // Active Tab
  const [activeTab, setActiveTab] = useState<'main' | 'subbrands' | 'invoice' | 'inventory' | 'integrations' | 'preview'>('main');
  const [selectedSubBrand, setSelectedSubBrand] = useState<'SAT' | 'GZ' | 'RTX'>('SAT');

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('৳');

  // Payment Methods
  const [bkashNagad, setBkashNagad] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [whatsappContact, setWhatsappContact] = useState('');
  const [invoiceTerms, setInvoiceTerms] = useState('');

  // Prefixes
  const [satPrefix, setSatPrefix] = useState('SAT-INV');
  const [gzPrefix, setGzPrefix] = useState('GZ-INV');
  const [rtxPrefix, setRtxPrefix] = useState('RTX-INV');

  // Sub-brand Profiles
  const [subBrands, setSubBrands] = useState({
    SAT: {
      companyName: 'Sky Automation Tech',
      tagline: 'Smart solutions, better future',
      address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
      phone: '01577351518',
      email: 'skyautomationtech@gmail.com',
      logoUrl: '/sat_logo.jpg',
      invoiceTerms: 'Goods once sold are non-refundable. Please verify items at delivery.'
    },
    GZ: {
      companyName: 'GadgetZu',
      tagline: 'Your trusted gadget shop',
      address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
      phone: '01577351518',
      email: 'gadgetzu.bd@gmail.com',
      logoUrl: '/gz_logo.jpg',
      invoiceTerms: 'Goods once sold are non-refundable. Please verify items at delivery.'
    },
    RTX: {
      companyName: 'RTX Gadget',
      tagline: 'Next-gen gaming & tech accessories',
      address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
      phone: '01577351518',
      email: 'rtxgadget.bd@gmail.com',
      logoUrl: '/rtx_logo.jpg',
      invoiceTerms: 'Goods once sold are non-refundable. Please verify items at delivery.'
    }
  });

  // Thresholds & Extras
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [agingBucket1, setAgingBucket1] = useState(15);
  const [agingBucket2, setAgingBucket2] = useState(30);
  const [supplierTerms, setSupplierTerms] = useState('Standard payment terms: Net 15 days.');
  const [deliveryDhaka, setDeliveryDhaka] = useState(60);
  const [deliveryOutside, setDeliveryOutside] = useState(120);

  // EmailJS
  const [emailJsServiceId, setEmailJsServiceId] = useState('');
  const [emailJsTemplateId, setEmailJsTemplateId] = useState('');
  const [emailJsPublicKey, setEmailJsPublicKey] = useState('');
  const [emailJsRecipient, setEmailJsRecipient] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync initial settings from prop
  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.companyName || 'Sky Automation Tech');
      setTagline(companySettings.footerTagline || 'Smart solutions, better future');
      setAddress(companySettings.address || 'House #12, Road #3, Block-A, Banasree, Dhaka');
      setPhone(companySettings.phone || '01577351518');
      setEmail(companySettings.email || 'skyautomationtech@gmail.com');
      setLogoUrl(companySettings.logoUrl || '/sat_logo.jpg');

      setBkashNagad(companySettings.paymentMethodsInfo?.bkashNagad || companySettings.phone || '01577351518');
      setBankInfo(companySettings.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18');
      setWhatsappContact(companySettings.paymentMethodsInfo?.whatsappContact || companySettings.phone || '01577351518');
      setInvoiceTerms(companySettings.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.');

      setSatPrefix(companySettings.prefixes?.SAT || 'SAT-INV');
      setGzPrefix(companySettings.prefixes?.GZ || 'GZ-INV');
      setRtxPrefix(companySettings.prefixes?.RTX || 'RTX-INV');

      if (companySettings.subBrandDetails) {
        setSubBrands({
          SAT: {
            companyName: companySettings.subBrandDetails.SAT?.companyName || 'Sky Automation Tech',
            tagline: companySettings.subBrandDetails.SAT?.tagline || 'Smart solutions, better future',
            address: companySettings.subBrandDetails.SAT?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka',
            phone: companySettings.subBrandDetails.SAT?.phone || '01577351518',
            email: companySettings.subBrandDetails.SAT?.email || 'skyautomationtech@gmail.com',
            logoUrl: companySettings.subBrandDetails.SAT?.logoUrl || '/sat_logo.jpg',
            invoiceTerms: companySettings.subBrandDetails.SAT?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'
          },
          GZ: {
            companyName: companySettings.subBrandDetails.GZ?.companyName || 'GadgetZu',
            tagline: companySettings.subBrandDetails.GZ?.tagline || 'Your trusted gadget shop',
            address: companySettings.subBrandDetails.GZ?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka',
            phone: companySettings.subBrandDetails.GZ?.phone || '01577351518',
            email: companySettings.subBrandDetails.GZ?.email || 'gadgetzu.bd@gmail.com',
            logoUrl: companySettings.subBrandDetails.GZ?.logoUrl || '/gz_logo.jpg',
            invoiceTerms: companySettings.subBrandDetails.GZ?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'
          },
          RTX: {
            companyName: companySettings.subBrandDetails.RTX?.companyName || 'RTX Gadget',
            tagline: companySettings.subBrandDetails.RTX?.tagline || 'Next-gen gaming & tech accessories',
            address: companySettings.subBrandDetails.RTX?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka',
            phone: companySettings.subBrandDetails.RTX?.phone || '01577351518',
            email: companySettings.subBrandDetails.RTX?.email || 'rtxgadget.bd@gmail.com',
            logoUrl: companySettings.subBrandDetails.RTX?.logoUrl || '/rtx_logo.jpg',
            invoiceTerms: companySettings.subBrandDetails.RTX?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'
          }
        });
      }

      setLowStockThreshold(companySettings.defaultReorderThreshold || 5);
      setAgingBucket1(companySettings.agingThresholds?.bucket1MaxDays || 15);
      setAgingBucket2(companySettings.agingThresholds?.bucket2MaxDays || 30);
      setSupplierTerms(companySettings.supplierTermsNote || 'Standard payment terms: Net 15 days.');

      if (companySettings.emailJsConfig) {
        setEmailJsServiceId(companySettings.emailJsConfig.serviceId || '');
        setEmailJsTemplateId(companySettings.emailJsConfig.templateId || '');
        setEmailJsPublicKey(companySettings.emailJsConfig.publicKey || '');
        setEmailJsRecipient(companySettings.emailJsConfig.recipientEmail || '');
      }
    }
  }, [companySettings]);

  // Handle Logo Upload for Main Brand
  const handleMainLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Image file size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
        setSuccessMsg('Main logo uploaded. Click "Save Settings" to apply.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Logo Upload for Sub-brands
  const handleSubBrandLogoUpload = (brandKey: 'SAT' | 'GZ' | 'RTX', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Image file size must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSubBrands(prev => ({
          ...prev,
          [brandKey]: {
            ...prev[brandKey],
            logoUrl: reader.result as string
          }
        }));
        setSuccessMsg(`${brandKey} sub-brand logo updated. Click "Save Settings" to apply.`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubBrandFieldChange = (brandKey: 'SAT' | 'GZ' | 'RTX', field: string, value: string) => {
    setSubBrands(prev => ({
      ...prev,
      [brandKey]: {
        ...prev[brandKey],
        [field]: value
      }
    }));
  };

  // Submit Save
  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!isSuperAdmin) {
      setErrorMsg('You must have Super Admin permissions to modify global settings.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload: Partial<CompanySettings> = {
        companyName: companyName.trim(),
        footerTagline: tagline.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logoUrl: logoUrl,
        invoiceTerms: invoiceTerms.trim(),
        paymentMethodsInfo: {
          bkashNagad: bkashNagad.trim(),
          bankInfo: bankInfo.trim(),
          whatsappContact: whatsappContact.trim()
        },
        prefixes: {
          SAT: satPrefix.trim() || 'SAT-INV',
          GZ: gzPrefix.trim() || 'GZ-INV',
          RTX: rtxPrefix.trim() || 'RTX-INV'
        },
        subBrandDetails: {
          SAT: subBrands.SAT,
          GZ: subBrands.GZ,
          RTX: subBrands.RTX
        },
        defaultReorderThreshold: Number(lowStockThreshold) || 5,
        agingThresholds: {
          bucket1MaxDays: Number(agingBucket1) || 15,
          bucket2MaxDays: Number(agingBucket2) || 30
        },
        supplierTermsNote: supplierTerms.trim(),
        emailJsConfig: {
          serviceId: emailJsServiceId.trim(),
          templateId: emailJsTemplateId.trim(),
          publicKey: emailJsPublicKey.trim(),
          recipientEmail: emailJsRecipient.trim()
        }
      };

      await onSave(payload);
      setSuccessMsg('Settings updated and published successfully across all terminals!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      console.error('Settings save failed:', err);
      setErrorMsg('Failed to save settings: ' + (err.message || 'Error'));
    } finally {
      setSaving(false);
    }
  };

  // Export JSON Backup
  const handleExportConfig = () => {
    const configData = {
      companyName,
      tagline,
      address,
      phone,
      email,
      paymentMethodsInfo: { bkashNagad, bankInfo, whatsappContact },
      prefixes: { SAT: satPrefix, GZ: gzPrefix, RTX: rtxPrefix },
      subBrandDetails: subBrands,
      thresholds: { lowStockThreshold, agingBucket1, agingBucket2, supplierTerms },
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAT_Company_Settings_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full space-y-4 max-w-full">
      {/* Top Header Section */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-amber-500 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              Global Platform Configuration
            </span>
            <span className="text-[11px] font-mono font-bold bg-slate-900 text-amber-400 px-2 py-0.5 rounded-md">
              Multi-Brand Core
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Company Branding & Invoice Settings
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Customize company details, invoice layout, payment method instructions, terms, and sub-brand profiles.
          </p>
        </div>

        {/* Action Save Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportConfig}
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl border border-slate-200 transition cursor-pointer"
            title="Download settings backup file"
          >
            <Download size={14} className="text-slate-500" />
            <span className="hidden sm:inline">Export Config</span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => handleSaveAll()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-xs uppercase tracking-wider py-2 px-4 rounded-xl shadow-xs transition cursor-pointer"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={14} />
              )}
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Auth Status Notification Banner */}
      <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
          <span className="font-semibold">
            {isSuperAdmin 
              ? 'Super Admin Authorized: You have full permissions to modify company branding, print layouts, and invoice configurations.'
              : 'Read-Only Mode: You are viewing platform settings. Contact Super Admin to request modifications.'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <span className="font-semibold">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          <span className="font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Navigation Part-by-Part Tabs */}
      <div className="flex items-center gap-1 bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('main')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'main'
              ? 'bg-slate-900 text-amber-400 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Building2 size={14} />
          <span>1. Main Company & Logo</span>
        </button>

        <button
          onClick={() => setActiveTab('subbrands')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'subbrands'
              ? 'bg-slate-900 text-amber-400 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Tag size={14} />
          <span>2. Sub-Brand Profiles</span>
        </button>

        <button
          onClick={() => setActiveTab('invoice')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'invoice'
              ? 'bg-slate-900 text-amber-400 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Receipt size={14} />
          <span>3. Invoice & Payment Setup</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'inventory'
              ? 'bg-slate-900 text-amber-400 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Sliders size={14} />
          <span>4. Inventory & Alerts</span>
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'integrations'
              ? 'bg-slate-900 text-amber-400 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Bell size={14} />
          <span>5. EmailJS Integrations</span>
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
            activeTab === 'preview'
              ? 'bg-amber-100 text-amber-900 font-mono shadow-2xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Eye size={14} className="text-amber-600" />
          <span>6. Live Invoice Preview</span>
        </button>
      </div>

      {/* Main Settings Form Container */}
      <form onSubmit={(e) => { e.preventDefault(); handleSaveAll(); }}>
        {/* ========================================================================= */}
        {/* PART 1: MAIN COMPANY & BRANDING */}
        {/* ========================================================================= */}
        {activeTab === 'main' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                SECTION 1
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                <Building2 size={16} className="text-amber-500" />
                Main Company Profile & Visual Identity
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Primary corporate identity used across system headers, login screen, and main company documents.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Main Company Name *
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Sky Automation Tech"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Corporate Tagline / Slogan
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Smart solutions, better future"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  <MapPin size={12} /> Main Headquarter Address
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House #12, Road #3, Block-A, Banasree, Dhaka"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  <Phone size={12} /> Hotline / Official Phone
                </label>
                <input
                  type="text"
                  disabled={!isSuperAdmin}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01577351518"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                  <Mail size={12} /> Official Support Email
                </label>
                <input
                  type="email"
                  disabled={!isSuperAdmin}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="skyautomationtech@gmail.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Clean Logo Image Card - No raw ugly base64 string */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Main Company Logo
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="w-20 h-20 bg-slate-950 rounded-xl p-2 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xs">
                  <img 
                    src={logoUrl || "/sat_logo.jpg"} 
                    alt="Logo Preview" 
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/sat_logo.jpg";
                    }}
                  />
                </div>

                <div className="flex-1 w-full space-y-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isSuperAdmin && (
                      <label className="cursor-pointer bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-xs py-2 px-3.5 rounded-xl transition inline-flex items-center gap-1.5 shadow-2xs">
                        <Upload size={13} />
                        Upload New Logo
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={handleMainLogoUpload} 
                          className="hidden" 
                        />
                      </label>
                    )}
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('/sat_logo.jpg')}
                        className="text-xs text-slate-500 hover:text-red-500 font-semibold px-2 py-1"
                      >
                        Reset Default
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Recommended dimensions: 512x512 PNG/JPEG with transparent or dark background. Max file size: 2MB.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PART 2: SUB-BRAND PROFILES */}
        {/* ========================================================================= */}
        {activeTab === 'subbrands' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                  SECTION 2
                </span>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                  <Tag size={16} className="text-amber-500" />
                  Sub-Brand Profiles & Customized Invoice Headers
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure customized details for each of the 3 active commercial sub-brands.
                </p>
              </div>

              {/* Sub-brand Switcher Pills */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedSubBrand('SAT')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedSubBrand === 'SAT'
                      ? 'bg-amber-400 text-slate-950 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <img src="/sat_logo.jpg" alt="SAT" className="w-3.5 h-3.5 rounded-xs" />
                  <span>Sky Auto (SAT)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedSubBrand('GZ')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedSubBrand === 'GZ'
                      ? 'bg-teal-500 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <img src="/gz_logo.jpg" alt="GZ" className="w-3.5 h-3.5 rounded-xs" />
                  <span>GadgetZu (GZ)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedSubBrand('RTX')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedSubBrand === 'RTX'
                      ? 'bg-orange-500 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <img src="/rtx_logo.jpg" alt="RTX" className="w-3.5 h-3.5 rounded-xs" />
                  <span>RTX Gadget (RTX)</span>
                </button>
              </div>
            </div>

            {/* Sub-brand Details Form */}
            <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-2xl space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-200/80">
                <div className="w-12 h-12 rounded-xl bg-slate-950 p-1.5 border border-slate-800 flex items-center justify-center shrink-0">
                  <img 
                    src={subBrands[selectedSubBrand].logoUrl || `/${selectedSubBrand.toLowerCase()}_logo.jpg`}
                    alt={selectedSubBrand}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = `/${selectedSubBrand.toLowerCase()}_logo.jpg`;
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-sm">
                    {selectedSubBrand === 'SAT' ? 'Sky Automation Tech (SAT)' : selectedSubBrand === 'GZ' ? 'GadgetZu (GZ)' : 'RTX Gadget (RTX)'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    These specific details will appear on brand-filtered customer receipts and invoices.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={subBrands[selectedSubBrand].companyName || ''}
                    onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'companyName', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-900 font-bold focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Tagline
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={subBrands[selectedSubBrand].tagline || ''}
                    onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'tagline', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Physical Address
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={subBrands[selectedSubBrand].address || ''}
                    onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'address', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Hotline Phone
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={subBrands[selectedSubBrand].phone || ''}
                    onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'phone', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    disabled={!isSuperAdmin}
                    value={subBrands[selectedSubBrand].email || ''}
                    onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'email', e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Custom Terms & Conditions for {selectedSubBrand} Invoices
                </label>
                <textarea
                  rows={2.5}
                  disabled={!isSuperAdmin}
                  value={subBrands[selectedSubBrand].invoiceTerms || ''}
                  onChange={(e) => handleSubBrandFieldChange(selectedSubBrand, 'invoiceTerms', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                />
              </div>

              {isSuperAdmin && (
                <div className="pt-2 flex items-center gap-2">
                  <label className="cursor-pointer bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs py-1.5 px-3 rounded-lg transition inline-flex items-center gap-1.5">
                    <Upload size={12} />
                    Upload {selectedSubBrand} Logo
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => handleSubBrandLogoUpload(selectedSubBrand, e)} 
                      className="hidden" 
                    />
                  </label>
                  <span className="text-[11px] text-slate-400">Updates brand logo file.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PART 3: INVOICE & PAYMENT SETUP */}
        {/* ========================================================================= */}
        {activeTab === 'invoice' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                SECTION 3
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                <Receipt size={16} className="text-amber-500" />
                Invoice Prefixes & Payment Instructions
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure serial number prefixes, payment receiving accounts (bKash/Bank), and printed footer directives.
              </p>
            </div>

            {/* Serial Prefixes */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Hash size={13} className="text-amber-500" />
                Serial Number Prefixes
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Sky Auto (SAT) Prefix
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={satPrefix}
                    onChange={(e) => setSatPrefix(e.target.value)}
                    placeholder="SAT-INV"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-amber-600 font-mono font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    GadgetZu (GZ) Prefix
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={gzPrefix}
                    onChange={(e) => setGzPrefix(e.target.value)}
                    placeholder="GZ-INV"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-teal-600 font-mono font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    RTX Gadget (RTX) Prefix
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={rtxPrefix}
                    onChange={(e) => setRtxPrefix(e.target.value)}
                    placeholder="RTX-INV"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-orange-600 font-mono font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard size={13} className="text-amber-500" />
                Customer Payment Receiving Channels (Printed on Invoices)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Smartphone size={12} className="text-pink-600" /> bKash / Nagad Number
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={bkashNagad}
                    onChange={(e) => setBkashNagad(e.target.value)}
                    placeholder="01577351518"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <Building2 size={12} className="text-blue-600" /> Bank Account Info
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={bankInfo}
                    onChange={(e) => setBankInfo(e.target.value)}
                    placeholder="DBBL - 105.***.***.18"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 flex items-center gap-1">
                    <MessageSquare size={12} className="text-emerald-600" /> WhatsApp Slip Submission
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={whatsappContact}
                    onChange={(e) => setWhatsappContact(e.target.value)}
                    placeholder="01577351518"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {/* Default Terms */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
                <FileText size={12} /> Default Master Invoice Policy / Terms & Conditions
              </label>
              <textarea
                rows={3}
                disabled={!isSuperAdmin}
                value={invoiceTerms}
                onChange={(e) => setInvoiceTerms(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                placeholder="Goods once sold are non-refundable. Please verify items at delivery."
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PART 4: INVENTORY & AGING THRESHOLDS */}
        {/* ========================================================================= */}
        {activeTab === 'inventory' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                SECTION 4
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                <Sliders size={16} className="text-amber-500" />
                Inventory Reorder Levels & Due Payment Aging
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set automated low stock triggers, credit aging buckets, and standard vendor terms.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-600">
                  Low Stock Alert Level (Qty)
                </label>
                <input
                  type="number"
                  disabled={!isSuperAdmin}
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                  min={1}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 block">Products at or below this trigger alerts.</span>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-600">
                  Aging Warning Bucket 1
                </label>
                <input
                  type="number"
                  disabled={!isSuperAdmin}
                  value={agingBucket1}
                  onChange={(e) => setAgingBucket1(Number(e.target.value))}
                  min={1}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-amber-600 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 block">Days overdue for moderate warning.</span>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <label className="block text-xs font-bold uppercase text-slate-600">
                  Aging Critical Bucket 2
                </label>
                <input
                  type="number"
                  disabled={!isSuperAdmin}
                  value={agingBucket2}
                  onChange={(e) => setAgingBucket2(Number(e.target.value))}
                  min={1}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-mono font-bold text-red-600 focus:outline-hidden"
                />
                <span className="text-[10px] text-slate-400 block">Days overdue for critical warning.</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                Default Supplier Payment Terms Note
              </label>
              <textarea
                rows={2}
                disabled={!isSuperAdmin}
                value={supplierTerms}
                onChange={(e) => setSupplierTerms(e.target.value)}
                placeholder="Standard payment terms: Net 15 days."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
              />
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PART 5: INTEGRATIONS & EMAILJS */}
        {/* ========================================================================= */}
        {activeTab === 'integrations' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-5 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                SECTION 5
              </span>
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                <Bell size={16} className="text-amber-500" />
                EmailJS Real-Time Notification Gateway
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Send automatic stock depletion alerts directly to your administrator inbox.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    EmailJS Service ID
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={emailJsServiceId}
                    onChange={(e) => setEmailJsServiceId(e.target.value)}
                    placeholder="e.g. service_xxxxxxx"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    EmailJS Template ID
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={emailJsTemplateId}
                    onChange={(e) => setEmailJsTemplateId(e.target.value)}
                    placeholder="e.g. template_xxxxxxx"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    EmailJS Public API Key
                  </label>
                  <input
                    type="text"
                    disabled={!isSuperAdmin}
                    value={emailJsPublicKey}
                    onChange={(e) => setEmailJsPublicKey(e.target.value)}
                    placeholder="e.g. user_xxxxxxx"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Admin Notification Recipient Email
                  </label>
                  <input
                    type="email"
                    disabled={!isSuperAdmin}
                    value={emailJsRecipient}
                    onChange={(e) => setEmailJsRecipient(e.target.value)}
                    placeholder="skyautomationtech@gmail.com"
                    className="w-full bg-white border border-slate-200 rounded-xl p-2 text-xs disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* PART 6: LIVE INVOICE PREVIEW */}
        {/* ========================================================================= */}
        {activeTab === 'preview' && (
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4 animate-in fade-in duration-150">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                  SECTION 6
                </span>
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mt-0.5">
                  <Eye size={16} className="text-amber-500" />
                  Live Invoice & Receipt Visualizer
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time preview of how invoices and receipts appear to your buyers.
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                {(['SAT', 'GZ', 'RTX'] as const).map(b => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSelectedSubBrand(b)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                      selectedSubBrand === b ? 'bg-slate-900 text-amber-400' : 'text-slate-600'
                    }`}
                  >
                    {b} View
                  </button>
                ))}
              </div>
            </div>

            {/* Mock Invoice Sheet */}
            <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 rounded-2xl border border-slate-300 shadow-sm font-sans text-slate-900 space-y-6">
              {/* Invoice Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-950 rounded-xl p-1.5 flex items-center justify-center">
                    <img 
                      src={subBrands[selectedSubBrand].logoUrl || logoUrl || '/sat_logo.jpg'} 
                      alt="Brand"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div>
                    <h2 className="text-base font-black uppercase text-slate-900 leading-tight">
                      {subBrands[selectedSubBrand].companyName || companyName}
                    </h2>
                    <p className="text-[11px] text-amber-600 font-semibold">
                      {subBrands[selectedSubBrand].tagline || tagline}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {subBrands[selectedSubBrand].address || address} &bull; {subBrands[selectedSubBrand].phone || phone}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black uppercase tracking-widest text-slate-400 block">TAX INVOICE</span>
                  <span className="font-mono font-bold text-sm text-slate-900 block mt-0.5">
                    {selectedSubBrand === 'SAT' ? satPrefix : selectedSubBrand === 'GZ' ? gzPrefix : rtxPrefix}-1024
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date().toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* Mock Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                    <tr>
                      <th className="p-2.5">Item Description</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Rate</th>
                      <th className="p-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2.5 font-bold">Baseus 65W GaN5 Pro Fast Charger (Black)</td>
                      <td className="p-2.5 text-center font-mono">2</td>
                      <td className="p-2.5 text-right font-mono">৳2,450</td>
                      <td className="p-2.5 text-right font-mono font-bold">৳4,900</td>
                    </tr>
                    <tr>
                      <td className="p-2.5 font-bold">Baseus Cafule PD Type-C 100W Cable 2M</td>
                      <td className="p-2.5 text-center font-mono">1</td>
                      <td className="p-2.5 text-right font-mono">৳650</td>
                      <td className="p-2.5 text-right font-mono font-bold">৳650</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Total Summary Strip */}
              <div className="flex justify-end text-xs">
                <div className="w-56 space-y-1 text-right">
                  <div className="flex justify-between text-slate-500">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold text-slate-800">৳5,550</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Delivery Charge:</span>
                    <span className="font-mono font-bold text-slate-800">৳60</span>
                  </div>
                  <div className="flex justify-between text-sm font-black border-t border-slate-200 pt-1.5 text-slate-900">
                    <span>Total Amount:</span>
                    <span className="font-mono text-amber-600">৳5,610</span>
                  </div>
                </div>
              </div>

              {/* Mock Payment Footnote */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] space-y-1.5">
                <div className="font-bold text-slate-700 flex items-center gap-1">
                  <span>💳 Payment Directive:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 font-mono text-[10px]">
                  <div>bKash/Nagad: <strong>{bkashNagad}</strong></div>
                  <div>Bank: <strong>{bankInfo}</strong></div>
                </div>
                <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200/60">
                  {subBrands[selectedSubBrand].invoiceTerms || invoiceTerms}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Global Floating Bottom Save Bar (Visible on all tabs for Super Admin) */}
        {isSuperAdmin && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => handleSaveAll()}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-xs uppercase tracking-wider py-2.5 px-6 rounded-xl shadow-md transition cursor-pointer"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check size={15} />
              )}
              <span>{saving ? 'Publishing Settings...' : 'Save & Publish All Settings'}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
