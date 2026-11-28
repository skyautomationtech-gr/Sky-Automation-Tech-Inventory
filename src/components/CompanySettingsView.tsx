import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { CompanySettings, SubBrand, UserProfile } from '../types';
import { db } from '../firebase/config';
import {
  deleteMediaObject,
  formatBytesCompact,
  MediaUploadResult,
  uploadImageAsset,
  validateImageUploadFile,
} from '../utils/mediaUpload';
import {
  Building2,
  Tag,
  Receipt,
  Sliders,
  Bell,
  Eye,
  Save,
  Upload,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Smartphone,
  CreditCard,
  MessageSquare,
  Hash,
  FileText,
  Sparkles,
  Download,
  ShieldCheck,
  Check,
  Calculator,
  Wallet,
  Briefcase,
  Link2,
  Plus,
  Edit3,
  Trash2,
  Power,
  Users,
  RefreshCw,
  X,
  ArrowRight,
  Info,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { getAccountingBaselineSettings, saveAccountingBaselineSettings } from '../firebase/db';
import {
  DEFAULT_PUBLIC_APP_URL,
  DEFAULT_TRACKING_AUTO_EXPIRY_DAYS,
  DEFAULT_TRACKING_SHARE_TEMPLATE_BN,
  DEFAULT_TRACKING_SHARE_TEMPLATE_EN,
  isValidHttpsUrl,
} from '../preOrders/tracking';
import {
  DEFAULT_PARENT_CREDIT_LINE,
  PARENT_COMPANY_NAME,
  SUB_BRAND_ACCENT_PALETTE,
  getRegistrySubBrandsSync,
  getSellingSubBrands,
  isValidHexColor,
  normalizeSubBrandCode,
  sanitizeHexColor,
} from '../utils/subBrands';
import {
  LegacySatReassignmentPreview,
  applyHistoricalBrandReassignment,
  countSubBrandReferences,
  createSubBrand,
  deleteUnusedSubBrand,
  getLegacySatReassignmentPreview,
  getSubBrands,
  migrateUsersSatAccess,
  subscribeSubBrandsChange,
  toggleSubBrandActive,
  updateSubBrand,
} from '../firebase/subBrandsRegistry';

interface CompanySettingsViewProps {
  user: UserProfile | null;
  companySettings: CompanySettings | null;
  onSave: (updatedSettings: Partial<CompanySettings>) => Promise<void>;
  requireCheckIn?: () => boolean;
  subBrands?: SubBrand[];
  onSubBrandsUpdated?: (list: SubBrand[]) => void;
}

interface SubBrandFormState {
  mode: 'create' | 'edit';
  originalId?: string;
  name: string;
  shortCode: string;
  invoicePrefix: string;
  skuPrefix: string;
  logoUrl: string;
  accentColor: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  website: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  tagline: string;
  invoiceTerms: string;
  invoiceFooterNote: string;
  warrantyPolicyText: string;
  active: boolean;
}

const EMPTY_SUB_BRAND_FORM: SubBrandFormState = {
  mode: 'create',
  name: '',
  shortCode: '',
  invoicePrefix: '',
  skuPrefix: '',
  logoUrl: '',
  accentColor: '#0F766E',
  phone: '01577351518',
  whatsapp: '01577351518',
  email: '',
  address: 'House #12, Road #3, Block-A, Banasree, Dhaka',
  website: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  youtube: '',
  tagline: '',
  invoiceTerms: 'Goods once sold are non-refundable. Please verify items upon delivery.',
  invoiceFooterNote: '',
  warrantyPolicyText: 'Standard seller warranty applies as noted on your invoice.',
  active: true,
};

export default function CompanySettingsView({
  user,
  companySettings,
  onSave,
  requireCheckIn,
  subBrands: propSubBrands,
  onSubBrandsUpdated,
}: CompanySettingsViewProps) {
  const isSuperAdmin = user?.role === 'superadmin';

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'main' | 'subbrands' | 'invoice' | 'inventory' | 'integrations' | 'tracking' | 'preview' | 'accounting'
  >('main');

  // Dynamic Sub-Brands Registry State
  const [subBrandsList, setSubBrandsList] = useState<SubBrand[]>(() =>
    propSubBrands && propSubBrands.length > 0
      ? propSubBrands
      : getRegistrySubBrandsSync(companySettings)
  );
  const [countersByBrand, setCountersByBrand] = useState<Record<string, number>>({});
  const [satCounterReadOnly, setSatCounterReadOnly] = useState<number>(0);
  const [refCountsMap, setRefCountsMap] = useState<Record<string, number>>({});
  const [previewBrandCode, setPreviewBrandCode] = useState<string>('GZ');

  // Sub-Brand Modal State
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [brandForm, setBrandForm] = useState<SubBrandFormState>(EMPTY_SUB_BRAND_FORM);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandModalError, setBrandModalError] = useState('');

  // Legacy SAT Migration Tools State
  const [runningUserMigration, setRunningUserMigration] = useState(false);
  const [userMigrationSummary, setUserMigrationSummary] = useState<string | null>(null);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [loadingReassignPreview, setLoadingReassignPreview] = useState(false);
  const [reassignPreview, setReassignPreview] = useState<LegacySatReassignmentPreview | null>(null);
  const [selectedProdIds, setSelectedProdIds] = useState<string[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [selectedPreOrderIds, setSelectedPreOrderIds] = useState<string[]>([]);
  const [reassignTargetBrand, setReassignTargetBrand] = useState<string>('GZ');
  const [applyingReassign, setApplyingReassign] = useState(false);

  // Accounting Baseline Form State
  const [baselineCash, setBaselineCash] = useState<number>(0);
  const [baselineInvestment, setBaselineInvestment] = useState<number>(0);
  const [baselineCutoffDate, setBaselineCutoffDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [baselineNote, setBaselineNote] = useState<string>('Accounting baseline initialized.');
  const [isSavingBaseline, setIsSavingBaseline] = useState(false);

  // Main Parent Company Form State
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [logoStatus, setLogoStatus] = useState<'idle' | 'preparing' | 'uploading' | 'done' | 'failed'>('idle');
  const [logoProgress, setLogoProgress] = useState(0);
  const [logoError, setLogoError] = useState<string | undefined>(undefined);
  const [logoBytes, setLogoBytes] = useState<number | undefined>(undefined);
  const mainLogoAbortRef = useRef<AbortController | null>(null);
  const mainLogoPromiseRef = useRef<Promise<MediaUploadResult | null> | null>(null);
  const mainLogoPathRef = useRef<string | undefined>(undefined);

  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [brandLogoPreview, setBrandLogoPreview] = useState('');
  const [brandLogoStatus, setBrandLogoStatus] = useState<'idle' | 'preparing' | 'uploading' | 'done' | 'failed'>('idle');
  const [brandLogoProgress, setBrandLogoProgress] = useState(0);
  const [brandLogoError, setBrandLogoError] = useState<string | undefined>(undefined);
  const [brandLogoBytes, setBrandLogoBytes] = useState<number | undefined>(undefined);
  const brandLogoAbortRef = useRef<AbortController | null>(null);
  const brandLogoPromiseRef = useRef<Promise<MediaUploadResult | null> | null>(null);
  const brandLogoPathRef = useRef<string | undefined>(undefined);

  const [parentCreditLine, setParentCreditLine] = useState(DEFAULT_PARENT_CREDIT_LINE);
  const [showParentCreditLine, setShowParentCreditLine] = useState(true);

  // Payment Methods
  const [bkashNagad, setBkashNagad] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [whatsappContact, setWhatsappContact] = useState('');
  const [invoiceTerms, setInvoiceTerms] = useState('');

  // Dynamic Invoice Prefixes keyed by selling brand shortCode
  const [brandPrefixes, setBrandPrefixes] = useState<Record<string, string>>({});

  // Thresholds & Extras
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [agingBucket1, setAgingBucket1] = useState(15);
  const [agingBucket2, setAgingBucket2] = useState(30);
  const [supplierTerms, setSupplierTerms] = useState('Standard payment terms: Net 15 days.');

  // EmailJS
  const [emailJsServiceId, setEmailJsServiceId] = useState('');
  const [emailJsTemplateId, setEmailJsTemplateId] = useState('');
  const [emailJsPublicKey, setEmailJsPublicKey] = useState('');
  const [emailJsRecipient, setEmailJsRecipient] = useState('');

  // Public Tracking Portal Settings
  const [publicAppUrl, setPublicAppUrl] = useState(DEFAULT_PUBLIC_APP_URL);
  const [trackingAutoExpiryEnabled, setTrackingAutoExpiryEnabled] = useState(true);
  const [trackingAutoExpiryDays, setTrackingAutoExpiryDays] = useState(
    DEFAULT_TRACKING_AUTO_EXPIRY_DAYS
  );
  const [defaultShowCourierTracking, setDefaultShowCourierTracking] = useState(false);
  const [trackingTemplateEn, setTrackingTemplateEn] = useState(DEFAULT_TRACKING_SHARE_TEMPLATE_EN);
  const [trackingTemplateBn, setTrackingTemplateBn] = useState(DEFAULT_TRACKING_SHARE_TEMPLATE_BN);

  // UI state
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const sellingBrands = useMemo(
    () => getSellingSubBrands(subBrandsList, { includeInactive: true, companySettings }),
    [subBrandsList, companySettings]
  );

  const activeSellingBrands = useMemo(
    () => getSellingSubBrands(subBrandsList, { includeInactive: false, companySettings }),
    [subBrandsList, companySettings]
  );

  useEffect(() => {
    if (propSubBrands && propSubBrands.length > 0) {
      setSubBrandsList(propSubBrands);
    }
  }, [propSubBrands]);

  useEffect(() => {
    getSubBrands({ forceRefresh: false, companySettings })
      .then((list) => {
        if (list.length > 0) {
          setSubBrandsList(list);
          onSubBrandsUpdated?.(list);
        }
      })
      .catch(() => {});

    const unsub = subscribeSubBrandsChange((list) => {
      setSubBrandsList(list);
      onSubBrandsUpdated?.(list);
    });
    return () => unsub();
  }, [companySettings]);

  const loadCountersAndRefs = async (brands: SubBrand[]) => {
    try {
      const cSnap = await getDoc(doc(db, 'settings', 'invoiceCounters'));
      if (cSnap.exists()) {
        const d = cSnap.data();
        const byBrand: Record<string, number> = { ...(d.countersByBrand || {}) };
        if (byBrand.GZ === undefined && d.gzCounter !== undefined) byBrand.GZ = Number(d.gzCounter);
        if (byBrand.RTX === undefined && d.rtxCounter !== undefined)
          byBrand.RTX = Number(d.rtxCounter);
        setCountersByBrand(byBrand);
        setSatCounterReadOnly(Number(d.satCounter || 0));
      }
    } catch {}

    const counts: Record<string, number> = {};
    await Promise.all(
      brands.map(async (b) => {
        try {
          const r = await countSubBrandReferences(b.shortCode);
          counts[b.shortCode] = r.total;
        } catch {
          counts[b.shortCode] = 1; // keep delete conservative on transient error
        }
      })
    );
    setRefCountsMap(counts);
  };

  useEffect(() => {
    if (sellingBrands.length > 0) {
      void loadCountersAndRefs(sellingBrands);
      if (!sellingBrands.some((b) => b.shortCode === previewBrandCode)) {
        setPreviewBrandCode(activeSellingBrands[0]?.shortCode || sellingBrands[0].shortCode);
      }
      if (!activeSellingBrands.some((b) => b.shortCode === reassignTargetBrand)) {
        setReassignTargetBrand(activeSellingBrands[0]?.shortCode || 'GZ');
      }
    }
  }, [sellingBrands]);

  // Sync initial settings from prop
  useEffect(() => {
    if (companySettings) {
      setCompanyName(companySettings.companyName || PARENT_COMPANY_NAME);
      setTagline(companySettings.footerTagline || 'Smart solutions, better future');
      setAddress(companySettings.address || 'House #12, Road #3, Block-A, Banasree, Dhaka');
      setPhone(companySettings.phone || '01577351518');
      setEmail(companySettings.email || 'skyautomationtech@gmail.com');
      setLogoUrl(companySettings.logoUrl || '/sat_logo.jpg');
      setParentCreditLine(companySettings.parentCreditLine || DEFAULT_PARENT_CREDIT_LINE);
      setShowParentCreditLine(companySettings.showParentCreditLine ?? true);

      setBkashNagad(
        companySettings.paymentMethodsInfo?.bkashNagad || companySettings.phone || '01577351518'
      );
      setBankInfo(companySettings.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18');
      setWhatsappContact(
        companySettings.paymentMethodsInfo?.whatsappContact ||
          companySettings.phone ||
          '01577351518'
      );
      setInvoiceTerms(
        companySettings.invoiceTerms ||
          'Goods once sold are non-refundable. Please verify items at delivery.'
      );

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

      setPublicAppUrl(companySettings.publicAppUrl ?? DEFAULT_PUBLIC_APP_URL);
      setTrackingAutoExpiryEnabled(companySettings.trackingAutoExpiryEnabled ?? true);
      setTrackingAutoExpiryDays(
        Number(companySettings.trackingAutoExpiryDays || DEFAULT_TRACKING_AUTO_EXPIRY_DAYS)
      );
      setDefaultShowCourierTracking(Boolean(companySettings.defaultShowCourierTracking));
      setTrackingTemplateEn(
        companySettings.trackingShareTemplates?.en || DEFAULT_TRACKING_SHARE_TEMPLATE_EN
      );
      setTrackingTemplateBn(
        companySettings.trackingShareTemplates?.bn || DEFAULT_TRACKING_SHARE_TEMPLATE_BN
      );
    }
  }, [companySettings]);

  // Keep dynamic prefix inputs initialized from subBrands & companySettings.prefixes
  useEffect(() => {
    setBrandPrefixes((prev) => {
      const next: Record<string, string> = {};
      sellingBrands.forEach((sb) => {
        next[sb.shortCode] =
          prev[sb.shortCode] ||
          companySettings?.prefixes?.[sb.shortCode] ||
          sb.invoicePrefix ||
          `${sb.shortCode}-INV`;
      });
      return next;
    });
  }, [sellingBrands, companySettings]);

  // Esc closes modals
  useEffect(() => {
    const onCloseAll = () => {
      setBrandModalOpen(false);
      setReassignModalOpen(false);
    };
    window.addEventListener('close-all-modals', onCloseAll);
    return () => window.removeEventListener('close-all-modals', onCloseAll);
  }, []);

  // Load Accounting Baseline Settings
  useEffect(() => {
    getAccountingBaselineSettings()
      .then((b) => {
        if (b) {
          setBaselineCash(Number(b.baselineCash) || 0);
          setBaselineInvestment(Number(b.baselineInvestment) || 39550);
          setBaselineCutoffDate(b.cutoffDate || new Date().toISOString().split('T')[0]);
          setBaselineNote(b.note || '');
        }
      })
      .catch((e) => console.warn(e));
  }, []);

  const handleSaveAccountingBaselineOnly = async () => {
    setIsSavingBaseline(true);
    try {
      await saveAccountingBaselineSettings({
        baselineCash: Number(baselineCash) || 0,
        baselineInvestment: Number(baselineInvestment) || 39550,
        cutoffDate: baselineCutoffDate,
        cutoffTimestamp: new Date(baselineCutoffDate).getTime() || Date.now(),
        note: baselineNote.trim(),
        updatedBy: user?.name || 'Admin',
      });
      setSuccessMsg(
        'অ্যাকাউন্টিং বেসলাইন সফলভাবে সেভ করা হয়েছে (ক্যাশ ৳' +
          Number(baselineCash).toLocaleString() +
          ', বিনিয়োগ ৳' +
          Number(baselineInvestment).toLocaleString() +
          ')'
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg('বেসলাইন সেভ করতে সমস্যা হয়েছে: ' + (err?.message || 'Error'));
    } finally {
      setIsSavingBaseline(false);
    }
  };

  const cleanupMainLogoUpload = (deleteStorageObj: boolean) => {
    mainLogoAbortRef.current?.abort();
    mainLogoAbortRef.current = null;
    mainLogoPromiseRef.current = null;
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview);
    }
    if (deleteStorageObj && mainLogoPathRef.current) {
      void deleteMediaObject(mainLogoPathRef.current);
      mainLogoPathRef.current = undefined;
    }
  };

  const cleanupBrandLogoUpload = (deleteStorageObj: boolean) => {
    brandLogoAbortRef.current?.abort();
    brandLogoAbortRef.current = null;
    brandLogoPromiseRef.current = null;
    if (brandLogoPreview && brandLogoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(brandLogoPreview);
    }
    if (deleteStorageObj && brandLogoPathRef.current) {
      void deleteMediaObject(brandLogoPathRef.current);
      brandLogoPathRef.current = undefined;
    }
  };

  useEffect(() => {
    return () => {
      cleanupMainLogoUpload(true);
      cleanupBrandLogoUpload(true);
    };
  }, []);

  const startMainLogoUpload = (file: File) => {
    mainLogoAbortRef.current?.abort();
    const controller = new AbortController();
    mainLogoAbortRef.current = controller;
    setLogoStatus('preparing');
    setLogoProgress(5);
    setLogoError(undefined);

    const p = uploadImageAsset(file, {
      folderPath: 'logos/company',
      maxDimension: 800,
      quality: 0.85,
      generateThumb: false,
      signal: controller.signal,
      onPhase: (phase) => {
        if (!controller.signal.aborted) {
          setLogoStatus(phase === 'preparing' ? 'preparing' : 'uploading');
        }
      },
      onProgress: (pct) => {
        if (!controller.signal.aborted) {
          setLogoStatus(pct < 18 ? 'preparing' : 'uploading');
          setLogoProgress(pct);
        }
      },
    })
      .then((res) => {
        if (controller.signal.aborted) {
          if (res.storagePath) void deleteMediaObject(res.storagePath);
          return null;
        }
        if (res.storagePath) mainLogoPathRef.current = res.storagePath;
        setLogoUrl(res.url);
        setLogoBytes(res.sizeBytes);
        setLogoStatus('done');
        setLogoProgress(100);
        setSuccessMsg(
          res.fallbackUsed
            ? 'Compact logo preview ready (Storage bucket unavailable). Click "Save Settings" to apply.'
            : `Main logo uploaded (${formatBytesCompact(res.sizeBytes)}). Click "Save Settings" to apply.`
        );
        return res;
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.code === 'storage/canceled') return null;
        const code = err?.code || 'upload-failed';
        const message = err?.message || 'Logo upload failed.';
        console.error('[CompanySettingsView] Main logo upload failed:', code, err);
        setLogoStatus('failed');
        setLogoProgress(0);
        setLogoError(`${code}: ${message}`);
        return null;
      })
      .finally(() => {
        if (mainLogoAbortRef.current === controller) {
          mainLogoAbortRef.current = null;
        }
      });

    mainLogoPromiseRef.current = p;
    return p;
  };

  // Handle Logo Upload for Main Parent Company
  const handleMainLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageUploadFile(file);
    if (err) {
      setErrorMsg(err);
      return;
    }
    cleanupMainLogoUpload(true);
    setErrorMsg('');
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    void startMainLogoUpload(file);
  };

  // Open Create Sub-Brand Modal
  const openCreateBrandModal = () => {
    cleanupBrandLogoUpload(true);
    setBrandLogoFile(null);
    setBrandLogoPreview('');
    setBrandLogoStatus('idle');
    setBrandLogoProgress(0);
    setBrandLogoError(undefined);
    setBrandLogoBytes(undefined);
    setBrandModalError('');
    setBrandForm({
      ...EMPTY_SUB_BRAND_FORM,
      address: address || EMPTY_SUB_BRAND_FORM.address,
      phone: phone || EMPTY_SUB_BRAND_FORM.phone,
      whatsapp: whatsappContact || phone || EMPTY_SUB_BRAND_FORM.whatsapp,
      accentColor: SUB_BRAND_ACCENT_PALETTE[sellingBrands.length % SUB_BRAND_ACCENT_PALETTE.length].hex,
    });
    setBrandModalOpen(true);
  };

  // Open Edit Sub-Brand Modal
  const openEditBrandModal = (brand: SubBrand) => {
    cleanupBrandLogoUpload(true);
    setBrandLogoFile(null);
    setBrandLogoPreview('');
    setBrandLogoStatus('idle');
    setBrandLogoProgress(0);
    setBrandLogoError(undefined);
    setBrandLogoBytes(undefined);
    setBrandModalError('');
    setBrandForm({
      mode: 'edit',
      originalId: brand.shortCode,
      name: brand.name || '',
      shortCode: brand.shortCode,
      invoicePrefix: brand.invoicePrefix || `${brand.shortCode}-INV`,
      skuPrefix: brand.skuPrefix || brand.shortCode,
      logoUrl: brand.logoUrl || '',
      accentColor: sanitizeHexColor(brand.accentColor, '#0F766E'),
      phone: brand.phone || '',
      whatsapp: brand.whatsapp || '',
      email: brand.email || '',
      address: brand.address || '',
      website: brand.website || '',
      facebook: brand.socialLinks?.facebook || '',
      instagram: brand.socialLinks?.instagram || '',
      tiktok: brand.socialLinks?.tiktok || '',
      youtube: brand.socialLinks?.youtube || '',
      tagline: brand.tagline || '',
      invoiceTerms: brand.invoiceTerms || '',
      invoiceFooterNote: brand.invoiceFooterNote || '',
      warrantyPolicyText: brand.warrantyPolicyText || '',
      active: brand.active !== false,
    });
    setBrandModalOpen(true);
  };

  const startBrandLogoUpload = (file: File) => {
    brandLogoAbortRef.current?.abort();
    const controller = new AbortController();
    brandLogoAbortRef.current = controller;
    setBrandLogoStatus('preparing');
    setBrandLogoProgress(5);
    setBrandLogoError(undefined);

    const p = uploadImageAsset(file, {
      folderPath: 'logos/subBrands',
      maxDimension: 800,
      quality: 0.85,
      generateThumb: false,
      signal: controller.signal,
      onPhase: (phase) => {
        if (!controller.signal.aborted) {
          setBrandLogoStatus(phase === 'preparing' ? 'preparing' : 'uploading');
        }
      },
      onProgress: (pct) => {
        if (!controller.signal.aborted) {
          setBrandLogoStatus(pct < 18 ? 'preparing' : 'uploading');
          setBrandLogoProgress(pct);
        }
      },
    })
      .then((res) => {
        if (controller.signal.aborted) {
          if (res.storagePath) void deleteMediaObject(res.storagePath);
          return null;
        }
        if (res.storagePath) brandLogoPathRef.current = res.storagePath;
        setBrandForm((prev) => ({ ...prev, logoUrl: res.url }));
        setBrandLogoBytes(res.sizeBytes);
        setBrandLogoStatus('done');
        setBrandLogoProgress(100);
        return res;
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.code === 'storage/canceled') return null;
        const code = err?.code || 'upload-failed';
        const message = err?.message || 'Brand logo upload failed.';
        console.error('[CompanySettingsView] Brand logo upload failed:', code, err);
        setBrandLogoStatus('failed');
        setBrandLogoProgress(0);
        setBrandLogoError(`${code}: ${message}`);
        return null;
      })
      .finally(() => {
        if (brandLogoAbortRef.current === controller) {
          brandLogoAbortRef.current = null;
        }
      });

    brandLogoPromiseRef.current = p;
    return p;
  };

  const handleModalLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const err = validateImageUploadFile(file);
    if (err) {
      setBrandModalError(err);
      return;
    }
    cleanupBrandLogoUpload(true);
    setBrandModalError('');
    setBrandLogoFile(file);
    setBrandLogoPreview(URL.createObjectURL(file));
    void startBrandLogoUpload(file);
  };

  const handleSaveSubBrandModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBrandModalError('');
    if (!isSuperAdmin) return;

    const cleanAccent = sanitizeHexColor(brandForm.accentColor, '#0F766E');
    if (!isValidHexColor(cleanAccent)) {
      setBrandModalError('Accent color must be a valid 6-digit hex code (#RRGGBB).');
      return;
    }
    if (brandLogoStatus === 'failed') {
      setBrandModalError('Brand logo upload failed. Click Retry or Clear the logo.');
      return;
    }

    setSavingBrand(true);
    try {
      let resolvedBrandLogo = brandForm.logoUrl;
      if (brandLogoFile && brandLogoStatus !== 'done') {
        const waited = await (brandLogoPromiseRef.current || startBrandLogoUpload(brandLogoFile));
        if (!waited) {
          setBrandModalError('Brand logo upload failed. Click Retry or Clear the logo.');
          return;
        }
        resolvedBrandLogo = waited.url;
      }

      const socialLinks = {
        facebook: brandForm.facebook.trim() || undefined,
        instagram: brandForm.instagram.trim() || undefined,
        tiktok: brandForm.tiktok.trim() || undefined,
        youtube: brandForm.youtube.trim() || undefined,
      };

      if (brandForm.mode === 'create') {
        await createSubBrand({
          name: brandForm.name,
          shortCode: brandForm.shortCode,
          invoicePrefix: brandForm.invoicePrefix,
          skuPrefix: brandForm.skuPrefix || brandForm.shortCode,
          logoUrl: resolvedBrandLogo,
          accentColor: cleanAccent,
          phone: brandForm.phone,
          whatsapp: brandForm.whatsapp,
          email: brandForm.email,
          address: brandForm.address,
          website: brandForm.website,
          socialLinks,
          tagline: brandForm.tagline,
          invoiceTerms: brandForm.invoiceTerms,
          invoiceFooterNote: brandForm.invoiceFooterNote,
          warrantyPolicyText: brandForm.warrantyPolicyText,
          active: brandForm.active,
        });
        setSuccessMsg(`Created selling sub-brand "${brandForm.name.trim()}" (${normalizeSubBrandCode(brandForm.shortCode)}).`);
      } else if (brandForm.originalId) {
        await updateSubBrand(brandForm.originalId, {
          name: brandForm.name,
          invoicePrefix: brandForm.invoicePrefix,
          skuPrefix: brandForm.skuPrefix || brandForm.shortCode,
          logoUrl: resolvedBrandLogo,
          accentColor: cleanAccent,
          phone: brandForm.phone,
          whatsapp: brandForm.whatsapp,
          email: brandForm.email,
          address: brandForm.address,
          website: brandForm.website,
          socialLinks,
          tagline: brandForm.tagline,
          invoiceTerms: brandForm.invoiceTerms,
          invoiceFooterNote: brandForm.invoiceFooterNote,
          warrantyPolicyText: brandForm.warrantyPolicyText,
          active: brandForm.active,
        });
        setSuccessMsg(`Updated selling sub-brand "${brandForm.name.trim()}".`);
      }

      brandLogoPathRef.current = undefined;
      setBrandLogoFile(null);
      const fresh = await getSubBrands({ forceRefresh: true, companySettings });
      setSubBrandsList(fresh);
      onSubBrandsUpdated?.(fresh);
      setBrandModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setBrandModalError(err?.message || 'Could not save sub-brand.');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleToggleBrandStatus = async (brand: SubBrand) => {
    if (!isSuperAdmin) return;
    setErrorMsg('');
    try {
      await toggleSubBrandActive(brand.shortCode, brand.active === false);
      const fresh = await getSubBrands({ forceRefresh: true, companySettings });
      setSubBrandsList(fresh);
      onSubBrandsUpdated?.(fresh);
      setSuccessMsg(
        `${brand.name} is now ${brand.active === false ? 'Active' : 'Inactive'}.`
      );
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update sub-brand status.');
    }
  };

  const handleDeleteBrand = async (brand: SubBrand) => {
    if (!isSuperAdmin) return;
    setErrorMsg('');
    try {
      await deleteUnusedSubBrand(brand.shortCode);
      const fresh = await getSubBrands({ forceRefresh: true, companySettings });
      setSubBrandsList(fresh);
      onSubBrandsUpdated?.(fresh);
      setSuccessMsg(`Deleted unused sub-brand ${brand.name} (${brand.shortCode}).`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Cannot delete sub-brand.');
    }
  };

  const handleRunUserSatCleanup = async () => {
    if (!isSuperAdmin) return;
    setRunningUserMigration(true);
    setErrorMsg('');
    setUserMigrationSummary(null);
    try {
      const res = await migrateUsersSatAccess();
      setUserMigrationSummary(
        `Scanned ${res.totalScanned} operator account(s); updated ${res.updatedCount} account(s) to remove SAT access and assign active selling sub-brands.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to clean SAT from user access.');
    } finally {
      setRunningUserMigration(false);
    }
  };

  const handleOpenReassignModal = async () => {
    setReassignModalOpen(true);
    setLoadingReassignPreview(true);
    setErrorMsg('');
    try {
      const preview = await getLegacySatReassignmentPreview();
      setReassignPreview(preview);
      setSelectedProdIds(preview.products.map((p) => p.id));
      setSelectedOrderIds(preview.orders.map((o) => o.id));
      setSelectedInvoiceIds(preview.invoices.map((i) => i.id));
      setSelectedPreOrderIds(preview.preOrders.map((po) => po.id));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to scan legacy SAT records.');
    } finally {
      setLoadingReassignPreview(false);
    }
  };

  const handleConfirmReassignment = async () => {
    if (!user || !reassignTargetBrand) return;
    setApplyingReassign(true);
    setErrorMsg('');
    try {
      const res = await applyHistoricalBrandReassignment({
        productIds: selectedProdIds,
        orderIds: selectedOrderIds,
        invoiceIds: selectedInvoiceIds,
        preOrderIds: selectedPreOrderIds,
        targetSubBrandId: reassignTargetBrand,
        actor: { id: user.id, name: user.name, role: user.role },
      });
      setReassignModalOpen(false);
      setSuccessMsg(
        `Reassigned tags to ${reassignTargetBrand} (Products: ${res.products}, Orders: ${res.orders}, Invoices: ${res.invoices}, Pre-Orders: ${res.preOrders}). Printed IDs, SKUs & barcodes preserved.`
      );
      void loadCountersAndRefs(sellingBrands);
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to reassign records.');
    } finally {
      setApplyingReassign(false);
    }
  };

  // Submit Save All Global Settings
  const handleSaveAll = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (requireCheckIn && !requireCheckIn()) return;
    if (!isSuperAdmin) {
      setErrorMsg('You must have Super Admin permissions to modify global settings.');
      return;
    }

    const cleanPublicAppUrl = publicAppUrl.trim().replace(/\/+$/, '');
    if (cleanPublicAppUrl && !isValidHttpsUrl(cleanPublicAppUrl)) {
      setErrorMsg(
        'Public Tracking Base URL must be a valid https:// URL (e.g. https://sat-erp.vercel.app).'
      );
      setActiveTab('tracking');
      return;
    }

    // Validate no selling brand prefix starts with SAT-
    for (const [code, prefix] of Object.entries(brandPrefixes)) {
      const upper = String(prefix || '').trim().toUpperCase();
      if (upper.startsWith('SAT-')) {
        setErrorMsg(`Prefix for ${code} cannot start with SAT- (reserved for retired Parent Company invoices).`);
        setActiveTab('invoice');
        return;
      }
    }

    if (logoStatus === 'failed') {
      setErrorMsg('Main company logo upload failed. Click Retry or Reset Default before saving.');
      setActiveTab('profile');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      let resolvedMainLogo = logoUrl;
      if (logoFile && logoStatus !== 'done') {
        const waited = await (mainLogoPromiseRef.current || startMainLogoUpload(logoFile));
        if (!waited) {
          setErrorMsg('Main company logo upload failed. Click Retry or Reset Default.');
          return;
        }
        resolvedMainLogo = waited.url;
      }

      const nextPrefixes: Record<string, string> = {};
      const nextSubBrandDetails: CompanySettings['subBrandDetails'] = {};

      for (const sb of sellingBrands) {
        const cleanPrefix = (brandPrefixes[sb.shortCode] || sb.invoicePrefix || `${sb.shortCode}-INV`)
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '-');
        nextPrefixes[sb.shortCode] = cleanPrefix;
        nextSubBrandDetails[sb.shortCode] = {
          companyName: sb.name,
          address: sb.address || address.trim(),
          phone: sb.phone || phone.trim(),
          whatsapp: sb.whatsapp || whatsappContact.trim(),
          email: sb.email || email.trim(),
          website: sb.website || '',
          socialLinks: sb.socialLinks || {},
          logoUrl: sb.logoUrl || '',
          accentColor: sb.accentColor,
          invoiceTerms: sb.invoiceTerms || invoiceTerms.trim(),
          invoiceFooterNote: sb.invoiceFooterNote || '',
          warrantyPolicyText: sb.warrantyPolicyText || '',
          tagline: sb.tagline || '',
        };

        // Sync edited invoicePrefix back to /subBrands/{id} if changed
        if (cleanPrefix && cleanPrefix !== sb.invoicePrefix) {
          try {
            await updateSubBrand(sb.shortCode, { invoicePrefix: cleanPrefix });
          } catch {}
        }
      }

      const payload: Partial<CompanySettings> = {
        companyName: companyName.trim() || PARENT_COMPANY_NAME,
        legalName: companyName.trim() || PARENT_COMPANY_NAME,
        isParent: true,
        isSellingBrand: false,
        parentCreditLine: parentCreditLine.trim() || DEFAULT_PARENT_CREDIT_LINE,
        showParentCreditLine,
        footerTagline: tagline.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logoUrl: resolvedMainLogo,
        invoiceTerms: invoiceTerms.trim(),
        paymentMethodsInfo: {
          bkashNagad: bkashNagad.trim(),
          bankInfo: bankInfo.trim(),
          whatsappContact: whatsappContact.trim(),
        },
        subBrands: activeSellingBrands.map((b) => b.shortCode),
        prefixes: nextPrefixes,
        subBrandDetails: nextSubBrandDetails,
        defaultReorderThreshold: Number(lowStockThreshold) || 5,
        agingThresholds: {
          bucket1MaxDays: Number(agingBucket1) || 15,
          bucket2MaxDays: Number(agingBucket2) || 30,
        },
        supplierTermsNote: supplierTerms.trim(),
        emailJsConfig: {
          serviceId: emailJsServiceId.trim(),
          templateId: emailJsTemplateId.trim(),
          publicKey: emailJsPublicKey.trim(),
          recipientEmail: emailJsRecipient.trim(),
        },
        publicAppUrl: cleanPublicAppUrl,
        trackingAutoExpiryEnabled,
        trackingAutoExpiryDays: Math.max(
          1,
          Number(trackingAutoExpiryDays) || DEFAULT_TRACKING_AUTO_EXPIRY_DAYS
        ),
        defaultShowCourierTracking,
        trackingShareTemplates: {
          en: trackingTemplateEn.trim() || DEFAULT_TRACKING_SHARE_TEMPLATE_EN,
          bn: trackingTemplateBn.trim() || DEFAULT_TRACKING_SHARE_TEMPLATE_BN,
        },
      };

      await onSave(payload);
      mainLogoPathRef.current = undefined;
      setLogoFile(null);
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
      isParent: true,
      isSellingBrand: false,
      parentCreditLine,
      showParentCreditLine,
      tagline,
      address,
      phone,
      email,
      paymentMethodsInfo: { bkashNagad, bankInfo, whatsappContact },
      prefixes: brandPrefixes,
      sellingSubBrands: sellingBrands,
      thresholds: { lowStockThreshold, agingBucket1, agingBucket2, supplierTerms },
      publicTrackingPortal: {
        publicAppUrl,
        trackingAutoExpiryEnabled,
        trackingAutoExpiryDays,
        defaultShowCourierTracking,
        trackingShareTemplates: { en: trackingTemplateEn, bn: trackingTemplateBn },
      },
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SAT_Company_Settings_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const previewBrand = useMemo(
    () =>
      sellingBrands.find((b) => b.shortCode === previewBrandCode) ||
      activeSellingBrands[0] ||
      sellingBrands[0],
    [sellingBrands, activeSellingBrands, previewBrandCode]
  );

  return (
    <div className="w-full space-y-4 max-w-full">
      {/* Top Header Section */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-amber-500 uppercase tracking-widest bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-md border border-amber-200/60 dark:border-amber-800">
              Global Platform Configuration
            </span>
            <span className="text-[11px] font-mono font-bold bg-slate-900 text-amber-400 px-2 py-0.5 rounded-md">
              Parent + {activeSellingBrands.length} Selling Brand{activeSellingBrands.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Parent Company, Selling Sub-Brands &amp; Invoice Settings
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage parent importer identity ({PARENT_COMPANY_NAME}), dynamic selling sub-brands, invoice prefixes, and tracking portals.
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
      <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-semibold">
            {isSuperAdmin
              ? 'Super Admin Authorized: You can configure parent company metadata, create or edit selling sub-brands, and run legacy brand migrations.'
              : 'Read-Only Mode: Contact Super Admin to modify platform or sub-brand settings.'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={15} className="text-red-500 shrink-0" />
          <span className="font-semibold flex-1">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
          <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          <span className="font-semibold flex-1">{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-500 hover:text-emerald-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Desktop Left-Nav Settings Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Navigation Sidebar */}
        <div className="lg:col-span-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-1.5 sticky top-4">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
            <span className="text-[10px] font-mono font-bold text-amber-500 uppercase tracking-widest block">
              SETTINGS NAV
            </span>
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Configuration Modules
            </h3>
          </div>

          {[
            { id: 'main', label: 'Parent Company (HQ)', num: '01', icon: Building2 },
            { id: 'subbrands', label: 'Selling Sub-Brands', num: '02', icon: Tag },
            { id: 'invoice', label: 'Invoice & Payment', num: '03', icon: Receipt },
            { id: 'inventory', label: 'Inventory Thresholds', num: '04', icon: Sliders },
            { id: 'integrations', label: 'EmailJS Notifications', num: '05', icon: Bell },
            { id: 'tracking', label: 'Public Tracking Portal', num: '06', icon: Link2 },
            { id: 'accounting', label: 'Accounting Baseline', num: '07', icon: Calculator },
            { id: 'preview', label: 'Live Invoice Preview', num: '08', icon: Eye },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as any)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  active
                    ? item.id === 'accounting'
                      ? 'bg-amber-500 text-slate-950 shadow-2xs'
                      : 'bg-slate-900 dark:bg-slate-800 text-amber-400 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    size={15}
                    className={
                      active
                        ? item.id === 'accounting'
                          ? 'text-slate-950'
                          : 'text-amber-400'
                        : 'text-slate-400'
                    }
                  />
                  <span>{item.label}</span>
                </div>
                <span className="text-[10px] font-mono opacity-60">{item.num}</span>
              </button>
            );
          })}
        </div>

        {/* Right Active Module Form Container */}
        <div className="lg:col-span-9 space-y-4 min-w-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveAll();
            }}
          >
            {/* ========================================================================= */}
            {/* PART 1: PARENT COMPANY PROFILE */}
            {/* ========================================================================= */}
            {activeTab === 'main' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                      SECTION 1 • PARENT / IMPORTER ENTITY
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                      <Building2 size={16} className="text-amber-500" />
                      Parent / Importer Company Profile ({PARENT_COMPANY_NAME})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Sky Automation Tech operates strictly as the parent importer and shared operations HQ.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    Non-Selling Parent (isParent = true)
                  </span>
                </div>

                {/* Structural Rule Callout */}
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <Info size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Parent Company Separation Rule Active</p>
                    <p className="text-[11px] leading-relaxed opacity-90">
                      <strong>Sky Automation Tech (SAT)</strong> does not sell directly to customers, hold customer accounts, or issue customer invoices. All sales, invoices, pre-orders, warranty claims, and loyalty records belong to an active selling sub-brand ({activeSellingBrands.map((b) => b.name).join(', ') || 'GadgetZu, RTX Gadget'}).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Parent Company Legal Name *
                    </label>
                    <input
                      type="text"
                      disabled={!isSuperAdmin}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Sky Automation Tech"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white font-bold focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                      Corporate Tagline / Slogan
                    </label>
                    <input
                      type="text"
                      disabled={!isSuperAdmin}
                      value={tagline}
                      onChange={(e) => setTagline(e.target.value)}
                      placeholder="e.g. Smart solutions, better future"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Parent Credit Line Configuration */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                        Sub-Brand Invoice &amp; Tracking Credit Line
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Optional footer/subtitle displayed on selling sub-brand invoices, payment receipts, and public tracking portal.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={showParentCreditLine}
                        onChange={(e) => setShowParentCreditLine(e.target.checked)}
                        className="rounded border-slate-300 text-amber-500"
                      />
                      <span>Display on Receipts &amp; Tracking</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    disabled={!isSuperAdmin || !showParentCreditLine}
                    value={parentCreditLine}
                    onChange={(e) => setParentCreditLine(e.target.value)}
                    placeholder={DEFAULT_PARENT_CREDIT_LINE}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-hidden disabled:opacity-50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                      <MapPin size={12} /> Headquarter Address
                    </label>
                    <input
                      type="text"
                      disabled={!isSuperAdmin}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                      <Phone size={12} /> HQ Hotline Phone
                    </label>
                    <input
                      type="text"
                      disabled={!isSuperAdmin}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                      <Mail size={12} /> Official HQ Email
                    </label>
                    <input
                      type="email"
                      disabled={!isSuperAdmin}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Main HQ Logo Card */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Parent Company Logo
                  </label>

                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="w-20 h-20 bg-slate-950 rounded-xl p-2 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xs">
                      <img
                        src={logoPreview || logoUrl || '/sat_logo.jpg'}
                        alt="Logo Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/sat_logo.jpg';
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
                              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                              onChange={handleMainLogoUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                        {logoUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              cleanupMainLogoUpload(true);
                              setLogoFile(null);
                              setLogoPreview('');
                              setLogoStatus('idle');
                              setLogoProgress(0);
                              setLogoError(undefined);
                              setLogoUrl('/sat_logo.jpg');
                            }}
                            className="text-xs text-slate-500 hover:text-red-500 font-semibold px-2 py-1 cursor-pointer"
                          >
                            Reset Default
                          </button>
                        )}
                      </div>
                      {(logoStatus === 'preparing' || logoStatus === 'uploading') && (
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          <Loader2 size={12} className="animate-spin" />
                          <span>{logoStatus === 'preparing' ? 'Compressing...' : `Uploading ${logoProgress}%`}</span>
                          <div className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full bg-[#D4AF37]" style={{ width: `${Math.max(8, logoProgress)}%` }} />
                          </div>
                        </div>
                      )}
                      {logoStatus === 'done' && logoBytes && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> Ready ({formatBytesCompact(logoBytes)})
                        </span>
                      )}
                      {logoStatus === 'failed' && (
                        <div className="flex items-center gap-2 text-[11px] text-rose-600">
                          <span>{logoError}</span>
                          {logoFile && (
                            <button
                              type="button"
                              onClick={() => void startMainLogoUpload(logoFile)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold cursor-pointer"
                            >
                              <RotateCcw size={10} /> Retry
                            </button>
                          )}
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400">
                        Used in the ERP sidebar, login screen, and parent importer header.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 2: DYNAMIC SELLING SUB-BRANDS REGISTRY */}
            {/* ========================================================================= */}
            {activeTab === 'subbrands' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                        SECTION 2 • SELLING BRANDS REGISTRY
                      </span>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                        <Tag size={16} className="text-amber-500" />
                        Selling Sub-Brands Management
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Add unlimited selling sub-brands (e.g. GadgetZu, RTX Gadget, Nova Gear) without code changes. Immediately available in products, orders, invoices, pre-orders, customers &amp; staff permissions.
                      </p>
                    </div>

                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={openCreateBrandModal}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-950 hover:bg-slate-900 text-amber-400 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer shrink-0"
                      >
                        <Plus size={14} />
                        <span>Add Sub-Brand</span>
                      </button>
                    )}
                  </div>

                  {/* Sub-Brand Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sellingBrands.map((brand) => {
                      const currentCount = countersByBrand[brand.shortCode] ?? 0;
                      const nextInvoicePreview = `${brand.invoicePrefix}-${String(currentCount + 1).padStart(4, '0')}`;
                      const refCount = refCountsMap[brand.shortCode];
                      const isOnlyActive =
                        brand.active !== false && activeSellingBrands.length <= 1;
                      const canDelete =
                        refCount === 0 && !isOnlyActive && isSuperAdmin;

                      return (
                        <div
                          key={brand.shortCode}
                          className={`rounded-2xl border p-4 space-y-3 transition ${
                            brand.active !== false
                              ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                              : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 opacity-75'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-12 h-12 rounded-xl bg-slate-950 p-1.5 border flex items-center justify-center shrink-0"
                                style={{ borderColor: brand.accentColor }}
                              >
                                {brand.logoUrl ? (
                                  <img
                                    src={brand.logoUrl}
                                    alt={brand.name}
                                    className="w-full h-full object-contain rounded-lg bg-white p-0.5"
                                  />
                                ) : (
                                  <span
                                    className="font-black text-sm"
                                    style={{ color: brand.accentColor }}
                                  >
                                    {brand.shortCode.slice(0, 3)}
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="font-black text-sm text-slate-900 dark:text-white truncate">
                                    {brand.name}
                                  </h4>
                                  <span
                                    className="px-2 py-0.5 text-[10px] font-mono font-bold rounded border"
                                    style={{
                                      backgroundColor: `${brand.accentColor}1A`,
                                      color: brand.accentColor,
                                      borderColor: `${brand.accentColor}55`,
                                    }}
                                  >
                                    {brand.shortCode}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
                                      brand.active !== false
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {brand.active !== false ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  {brand.tagline || 'Selling Sub-Brand'}
                                </p>
                              </div>
                            </div>

                            <div
                              className="w-6 h-6 rounded-lg border border-slate-300 shrink-0"
                              style={{ backgroundColor: brand.accentColor }}
                              title={`Accent: ${brand.accentColor}`}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700">
                            <div>
                              <span className="text-slate-400 block text-[10px]">Invoice Prefix</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {brand.invoicePrefix}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Next Invoice #</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {nextInvoicePreview}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">SKU Prefix</span>
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                                {brand.skuPrefix || brand.shortCode}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block text-[10px]">Phone / Support</span>
                              <span className="font-mono font-semibold text-slate-700 dark:text-slate-300 truncate block">
                                {brand.phone || '—'}
                              </span>
                            </div>
                          </div>

                          {isSuperAdmin && (
                            <div className="flex items-center justify-between gap-2 pt-1">
                              <span className="text-[10px] font-mono text-slate-400">
                                {refCount === undefined
                                  ? 'Checking links...'
                                  : refCount === 0
                                    ? '0 linked records'
                                    : `${refCount}+ linked records`}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openEditBrandModal(brand)}
                                  className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 size={12} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isOnlyActive}
                                  onClick={() => handleToggleBrandStatus(brand)}
                                  title={
                                    isOnlyActive
                                      ? 'At least one active selling brand is required'
                                      : brand.active !== false
                                        ? 'Deactivate sub-brand'
                                        : 'Activate sub-brand'
                                  }
                                  className="px-2.5 py-1.5 text-xs font-bold bg-white hover:bg-amber-50 text-slate-700 border border-slate-200 rounded-lg inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
                                >
                                  <Power size={12} />
                                  <span>{brand.active !== false ? 'Disable' : 'Enable'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!canDelete}
                                  onClick={() => handleDeleteBrand(brand)}
                                  title={
                                    refCount && refCount > 0
                                      ? `Cannot delete: ${refCount}+ linked records exist. Disable instead.`
                                      : isOnlyActive
                                        ? 'Cannot delete last active selling brand'
                                        : 'Delete unused sub-brand'
                                  }
                                  className="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Legacy SAT Migration & Data Hygiene Panel */}
                {isSuperAdmin && (
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                        LEGACY DATA TOOLS (ONE-TIME &amp; CLEANUP)
                      </span>
                      <h4 className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
                        SAT Access Cleanup &amp; Historical Record Tag Reassignment
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Existing invoice numbers, pre-order numbers, SKUs, barcodes, and historical counters are never overwritten.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Tool 1: Strip SAT from User Access */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <Users size={15} className="text-amber-500" />
                          <span>Clean &ldquo;SAT&rdquo; from User Permissions</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Removes legacy <span className="font-mono font-bold">SAT</span> from <span className="font-mono">users.subBrandAccess</span> and ensures admins &amp; migrated staff have active selling sub-brands.
                        </p>
                        <button
                          type="button"
                          onClick={handleRunUserSatCleanup}
                          disabled={runningUserMigration}
                          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw size={13} className={runningUserMigration ? 'animate-spin' : ''} />
                          <span>{runningUserMigration ? 'Cleaning Users...' : 'Clean SAT from User Access'}</span>
                        </button>
                        {userMigrationSummary && (
                          <p className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                            {userMigrationSummary}
                          </p>
                        )}
                      </div>

                      {/* Tool 2: Historical Record Tag Reassignment */}
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2.5">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                          <ArrowRight size={15} className="text-teal-600" />
                          <span>Reassign Legacy SAT / Unassigned Records</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          Inspect historical products, orders, invoices, or pre-orders still tagged <span className="font-mono font-bold">SAT</span> or unassigned, and optionally re-tag them to GadgetZu, RTX Gadget, or another selling brand.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenReassignModal}
                          className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Tag size={13} />
                          <span>Review &amp; Reassign Legacy Records</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 3: INVOICE & PAYMENT SETUP */}
            {/* ========================================================================= */}
            {activeTab === 'invoice' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                    SECTION 3
                  </span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                    <Receipt size={16} className="text-amber-500" />
                    Invoice Prefixes &amp; Payment Instructions
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure serial number prefixes per selling sub-brand, receiving accounts, and master invoice terms.
                  </p>
                </div>

                {/* Dynamic Selling Brand Serial Prefixes + Retired SAT Notice */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Hash size={13} className="text-amber-500" />
                    Selling Sub-Brand Serial Prefixes
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {sellingBrands.map((sb) => {
                      const currentCount = countersByBrand[sb.shortCode] ?? 0;
                      const currentPrefix =
                        brandPrefixes[sb.shortCode] ?? sb.invoicePrefix ?? `${sb.shortCode}-INV`;
                      return (
                        <div key={sb.shortCode} className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                              {sb.name} ({sb.shortCode})
                            </label>
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sb.accentColor }}
                            />
                          </div>
                          <input
                            type="text"
                            disabled={!isSuperAdmin}
                            value={currentPrefix}
                            onChange={(e) =>
                              setBrandPrefixes((prev) => ({
                                ...prev,
                                [sb.shortCode]: e.target.value,
                              }))
                            }
                            placeholder={`${sb.shortCode}-INV`}
                            style={{ color: sb.accentColor }}
                            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 px-3 text-xs font-mono font-bold focus:outline-hidden disabled:opacity-60"
                          />
                          <div className="text-[10px] font-mono text-slate-400">
                            Next: {currentPrefix}-{String(currentCount + 1).padStart(4, '0')}
                          </div>
                        </div>
                      );
                    })}

                    {/* Retired SAT Historical Counter Reference */}
                    <div className="bg-slate-100/80 dark:bg-slate-900/50 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 space-y-1.5 opacity-85">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-slate-500">
                          {PARENT_COMPANY_NAME} (SAT)
                        </label>
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                          Retired
                        </span>
                      </div>
                      <input
                        type="text"
                        disabled
                        value="SAT-INV (Parent HQ — No Invoices)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-400"
                      />
                      <div className="text-[10px] font-mono text-slate-400">
                        Historical count preserved: {satCounterReadOnly}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Methods */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <CreditCard size={13} className="text-amber-500" />
                    Customer Payment Receiving Channels (Printed on Invoices)
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Smartphone size={12} className="text-pink-600" /> bKash / Nagad Number
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={bkashNagad}
                        onChange={(e) => setBkashNagad(e.target.value)}
                        placeholder="01577351518"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-hidden disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Building2 size={12} className="text-blue-600" /> Bank Account Info
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={bankInfo}
                        onChange={(e) => setBankInfo(e.target.value)}
                        placeholder="DBBL - 105.***.***.18"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-hidden disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <MessageSquare size={12} className="text-emerald-600" /> WhatsApp Slip Submission
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={whatsappContact}
                        onChange={(e) => setWhatsappContact(e.target.value)}
                        placeholder="01577351518"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-bold focus:outline-hidden disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>

                {/* Default Terms */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                    <FileText size={12} /> Default Master Invoice Policy / Terms &amp; Conditions
                  </label>
                  <textarea
                    rows={3}
                    disabled={!isSuperAdmin}
                    value={invoiceTerms}
                    onChange={(e) => setInvoiceTerms(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    placeholder="Goods once sold are non-refundable. Please verify items at delivery."
                  />
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 4: INVENTORY & AGING THRESHOLDS */}
            {/* ========================================================================= */}
            {activeTab === 'inventory' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                    SECTION 4
                  </span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                    <Sliders size={16} className="text-amber-500" />
                    Inventory Reorder Levels &amp; Due Payment Aging
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Set automated low stock triggers, credit aging buckets, and standard vendor terms.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                      Low Stock Alert Level (Qty)
                    </label>
                    <input
                      type="number"
                      disabled={!isSuperAdmin}
                      value={lowStockThreshold}
                      onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                      min={1}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Products at or below this trigger alerts.
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                      Aging Warning Bucket 1
                    </label>
                    <input
                      type="number"
                      disabled={!isSuperAdmin}
                      value={agingBucket1}
                      onChange={(e) => setAgingBucket1(Number(e.target.value))}
                      min={1}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-mono font-bold text-amber-600 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Days overdue for moderate warning.
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1">
                    <label className="block text-xs font-bold uppercase text-slate-600 dark:text-slate-300">
                      Aging Critical Bucket 2
                    </label>
                    <input
                      type="number"
                      disabled={!isSuperAdmin}
                      value={agingBucket2}
                      onChange={(e) => setAgingBucket2(Number(e.target.value))}
                      min={1}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs font-mono font-bold text-red-600 focus:outline-hidden"
                    />
                    <span className="text-[10px] text-slate-400 block">
                      Days overdue for critical warning.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Default Supplier Payment Terms Note
                  </label>
                  <textarea
                    rows={2}
                    disabled={!isSuperAdmin}
                    value={supplierTerms}
                    onChange={(e) => setSupplierTerms(e.target.value)}
                    placeholder="Standard payment terms: Net 15 days."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden disabled:opacity-60"
                  />
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 5: INTEGRATIONS & EMAILJS */}
            {/* ========================================================================= */}
            {activeTab === 'integrations' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                    SECTION 5
                  </span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                    <Bell size={16} className="text-amber-500" />
                    EmailJS Real-Time Notification Gateway
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Send automatic stock depletion alerts directly to your administrator inbox.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        EmailJS Service ID
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={emailJsServiceId}
                        onChange={(e) => setEmailJsServiceId(e.target.value)}
                        placeholder="e.g. service_xxxxxxx"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        EmailJS Template ID
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={emailJsTemplateId}
                        onChange={(e) => setEmailJsTemplateId(e.target.value)}
                        placeholder="e.g. template_xxxxxxx"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        EmailJS Public API Key
                      </label>
                      <input
                        type="text"
                        disabled={!isSuperAdmin}
                        value={emailJsPublicKey}
                        onChange={(e) => setEmailJsPublicKey(e.target.value)}
                        placeholder="e.g. user_xxxxxxx"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Admin Notification Recipient Email
                      </label>
                      <input
                        type="email"
                        disabled={!isSuperAdmin}
                        value={emailJsRecipient}
                        onChange={(e) => setEmailJsRecipient(e.target.value)}
                        placeholder="skyautomationtech@gmail.com"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2 text-xs disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 6: CUSTOMER PUBLIC TRACKING PORTAL SETTINGS */}
            {/* ========================================================================= */}
            {activeTab === 'tracking' && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                  <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                    SECTION 6
                  </span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                    <Link2 size={16} className="text-amber-500" />
                    Customer Public Tracking Portal Settings
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure your hosted domain URL, automatic link expiry rules, courier privacy default, and WhatsApp/SMS share templates.
                  </p>
                </div>

                {/* Public Base URL */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Public App Base URL (Vercel Hosted SPA) *
                    </label>
                    {publicAppUrl.trim() ? (
                      isValidHttpsUrl(publicAppUrl) ? (
                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                          Valid HTTPS Base URL
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                          Must start with https://
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                        Unconfigured — Copy &amp; Share disabled
                      </span>
                    )}
                  </div>
                  <input
                    type="url"
                    disabled={!isSuperAdmin}
                    value={publicAppUrl}
                    onChange={(e) => setPublicAppUrl(e.target.value)}
                    placeholder="https://sat-erp.vercel.app"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                  />
                  <p className="text-[11px] text-slate-500">
                    Sample generated URL:{' '}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {isValidHttpsUrl(publicAppUrl)
                        ? `${publicAppUrl.trim().replace(/\/+$/, '')}/track/<256-bit-token>`
                        : 'Enter a valid https:// URL above'}
                    </span>
                  </p>
                </div>

                {/* Auto-Expiry & Default Courier Visibility */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={trackingAutoExpiryEnabled}
                        onChange={(e) => setTrackingAutoExpiryEnabled(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                          Auto-expire completed tracking links
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          Automatically disable &amp; strip public tracking snapshots N days after Delivered, Cancelled, or Refunded.
                        </span>
                      </div>
                    </label>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Auto-Expiry Days After Completion
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        disabled={!isSuperAdmin || !trackingAutoExpiryEnabled}
                        value={trackingAutoExpiryDays}
                        onChange={(e) =>
                          setTrackingAutoExpiryDays(Math.max(1, Number(e.target.value) || 90))
                        }
                        className="w-32 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 dark:text-white disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        disabled={!isSuperAdmin}
                        checked={defaultShowCourierTracking}
                        onChange={(e) => setDefaultShowCourierTracking(e.target.checked)}
                        className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <div>
                        <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                          Show courier tracking to customers by default
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          When unchecked (recommended default), courier name, tracking number, and carrier URL stay hidden until toggled per order.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* WhatsApp / SMS Share Message Templates */}
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      Share Message Templates (English &amp; বাংলা)
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Supported variables:{' '}
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {'{firstName}'}, {'{orderId}'}, {'{productName}'}, {'{brandName}'}, {'{status}'}, {'{trackingUrl}'}, {'{totalAmount}'}, {'{dueAmount}'}
                      </span>
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        English Template
                      </label>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setTrackingTemplateEn(DEFAULT_TRACKING_SHARE_TEMPLATE_EN)}
                          className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer"
                        >
                          Reset Default
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      disabled={!isSuperAdmin}
                      value={trackingTemplateEn}
                      onChange={(e) => setTrackingTemplateEn(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        বাংলা টেমপ্লেট (Bangla Template)
                      </label>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setTrackingTemplateBn(DEFAULT_TRACKING_SHARE_TEMPLATE_BN)}
                          className="text-[11px] font-semibold text-amber-600 hover:underline cursor-pointer"
                        >
                          Reset Default
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      disabled={!isSuperAdmin}
                      value={trackingTemplateBn}
                      onChange={(e) => setTrackingTemplateBn(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 7: ACCOUNTING BASELINE */}
            {/* ========================================================================= */}
            {activeTab === 'accounting' && (
              <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Calculator size={18} className="text-amber-500" />
                      অ্যাকাউন্টিং বেসলাইন সেটিংস (Accounting Baseline &amp; Cash Settings)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      হাতে নগদ ক্যাশ, প্রারম্ভিক বিনিয়োগ এবং কাট-অফ তারিখ কনফিগারেশন (Consolidated Books)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                      হাতে নগদ: ৳{Number(baselineCash).toLocaleString()}
                    </span>
                    <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                      বিনিয়োগ: ৳{Number(baselineInvestment).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-xs text-amber-900 space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5 text-amber-950">
                    <ShieldCheck size={16} className="text-amber-600 shrink-0" />
                    পূর্ববর্তী হিসাব বাদ দেওয়ার নিয়ম (Baseline Cutoff Rule)
                  </p>
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    কাট-অফ তারিখের পূর্ববর্তী কোনো পুরনো অর্ডার, খরচ বা লেনদেন নতুন ক্যাশ ও বিনিয়োগ হিসেবে অন্তর্ভুক্ত হবে না। নতুন সমস্ত দৈনন্দিন লাভ, খরচ ও ক্যাশ পরিবর্তন এই বেসলাইনের উপর ভিত্তি করে গণনা করা হবে।
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Wallet size={14} className="text-emerald-600" />
                      বর্তমান হাতে নগদ ক্যাশ (Baseline Cash in Hand) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400 font-mono">
                        ৳
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={baselineCash}
                        onChange={(e) => setBaselineCash(parseFloat(e.target.value) || 0)}
                        disabled={!isSuperAdmin}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-7 pr-3 text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Briefcase size={14} className="text-amber-600" />
                      আমাদের মোট বিনিয়োগ (Total Investment Baseline) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400 font-mono">
                        ৳
                      </span>
                      <input
                        type="number"
                        step="any"
                        value={baselineInvestment}
                        onChange={(e) => setBaselineInvestment(parseFloat(e.target.value) || 0)}
                        disabled={!isSuperAdmin}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 pl-7 pr-3 text-sm font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100"
                        placeholder="39550"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      কাট-অফ তারিখ (Cutoff Date) *
                    </label>
                    <input
                      type="date"
                      value={baselineCutoffDate}
                      onChange={(e) => setBaselineCutoffDate(e.target.value)}
                      disabled={!isSuperAdmin}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100"
                    />
                  </div>

                  <div className="space-y-1.5 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      বেসলাইন নোট / বিবরণ
                    </label>
                    <input
                      type="text"
                      value={baselineNote}
                      onChange={(e) => setBaselineNote(e.target.value)}
                      disabled={!isSuperAdmin}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-3 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden disabled:bg-slate-100"
                    />
                  </div>
                </div>

                {isSuperAdmin && (
                  <div className="pt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      এই পরিবর্তনটি সরাসরি লাইভ Accounting Desk এ প্রতিফলিত হবে।
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveAccountingBaselineOnly}
                      disabled={isSavingBaseline}
                      className="py-2.5 px-5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Save size={14} />
                      <span>{isSavingBaseline ? 'সংরক্ষণ হচ্ছে...' : 'বেসলাইন সেটিংস সংরক্ষণ করুন'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* PART 8: LIVE SELLING BRAND INVOICE PREVIEW (HEX-ONLY) */}
            {/* ========================================================================= */}
            {activeTab === 'preview' && previewBrand && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4 animate-in fade-in duration-150">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-widest block">
                      SECTION 8
                    </span>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2 mt-0.5">
                      <Eye size={16} className="text-amber-500" />
                      Live Selling Sub-Brand Invoice Visualizer
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Invoices &amp; receipts are issued strictly under selling sub-brands (never parent SAT).
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {sellingBrands.map((b) => (
                      <button
                        key={b.shortCode}
                        type="button"
                        onClick={() => setPreviewBrandCode(b.shortCode)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition"
                        style={
                          previewBrand.shortCode === b.shortCode
                            ? { backgroundColor: b.accentColor, color: '#FFFFFF' }
                            : { color: '#475569' }
                        }
                      >
                        {b.name} ({b.shortCode})
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hex-only Mock Invoice Sheet */}
                <div
                  className="max-w-2xl mx-auto p-6 sm:p-8 rounded-2xl shadow-sm font-sans space-y-5"
                  style={{
                    backgroundColor: '#FFFFFF',
                    color: '#0F172A',
                    border: '1px solid #CBD5E1',
                    borderTop: `5px solid ${previewBrand.accentColor}`,
                  }}
                >
                  <div
                    className="flex justify-between items-start pb-4"
                    style={{ borderBottom: '1px solid #E2E8F0' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl p-1.5 flex items-center justify-center shrink-0"
                        style={{ backgroundColor: '#0F172A' }}
                      >
                        {previewBrand.logoUrl ? (
                          <img
                            src={previewBrand.logoUrl}
                            alt={previewBrand.name}
                            className="w-full h-full object-contain bg-white rounded"
                          />
                        ) : (
                          <span
                            className="text-sm font-black"
                            style={{ color: previewBrand.accentColor }}
                          >
                            {previewBrand.shortCode}
                          </span>
                        )}
                      </div>
                      <div>
                        <h2
                          className="text-base font-black uppercase leading-tight"
                          style={{ color: '#0F172A' }}
                        >
                          {previewBrand.name}
                        </h2>
                        <p
                          className="text-[11px] font-semibold"
                          style={{ color: previewBrand.accentColor }}
                        >
                          {previewBrand.tagline || tagline}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#64748B' }}>
                          {previewBrand.address || address} • {previewBrand.phone || phone}
                        </p>
                        {showParentCreditLine && parentCreditLine.trim() && (
                          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#94A3B8' }}>
                            {parentCreditLine}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className="text-xs font-black uppercase tracking-widest block"
                        style={{ color: '#64748B' }}
                      >
                        TAX INVOICE
                      </span>
                      <span
                        className="font-mono font-bold text-sm block mt-0.5"
                        style={{ color: previewBrand.accentColor }}
                      >
                        {(brandPrefixes[previewBrand.shortCode] || previewBrand.invoicePrefix)}-
                        {String((countersByBrand[previewBrand.shortCode] ?? 0) + 1).padStart(4, '0')}
                      </span>
                      <span className="text-[10px] font-mono" style={{ color: '#64748B' }}>
                        {new Date().toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Mock Items Table */}
                  <div
                    className="rounded-xl overflow-hidden text-xs"
                    style={{ border: '1px solid #E2E8F0' }}
                  >
                    <table className="w-full text-left">
                      <thead
                        className="text-[10px] uppercase font-bold"
                        style={{
                          backgroundColor: '#F8FAFC',
                          color: '#64748B',
                          borderBottom: '1px solid #E2E8F0',
                        }}
                      >
                        <tr>
                          <th className="p-2.5">Item Description</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Rate</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
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

                  {/* Total Summary */}
                  <div className="flex justify-end text-xs">
                    <div className="w-56 space-y-1 text-right">
                      <div className="flex justify-between" style={{ color: '#64748B' }}>
                        <span>Subtotal:</span>
                        <span className="font-mono font-bold" style={{ color: '#0F172A' }}>
                          ৳5,550
                        </span>
                      </div>
                      <div className="flex justify-between" style={{ color: '#64748B' }}>
                        <span>Delivery Charge:</span>
                        <span className="font-mono font-bold" style={{ color: '#0F172A' }}>
                          ৳60
                        </span>
                      </div>
                      <div
                        className="flex justify-between text-sm font-black pt-1.5"
                        style={{ borderTop: '1px solid #CBD5E1', color: '#0F172A' }}
                      >
                        <span>Total Amount:</span>
                        <span className="font-mono" style={{ color: previewBrand.accentColor }}>
                          ৳5,610
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Footnote */}
                  <div
                    className="p-3 rounded-xl text-[11px] space-y-1.5"
                    style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[10px]" style={{ color: '#475569' }}>
                      <div>
                        bKash/Nagad: <strong>{bkashNagad}</strong>
                      </div>
                      <div>
                        Bank: <strong>{bankInfo}</strong>
                      </div>
                    </div>
                    {previewBrand.warrantyPolicyText && (
                      <p className="text-[10px]" style={{ color: '#475569' }}>
                        <strong>Warranty:</strong> {previewBrand.warrantyPolicyText}
                      </p>
                    )}
                    <p
                      className="text-[10px] italic pt-1"
                      style={{ color: '#64748B', borderTop: '1px solid #E2E8F0' }}
                    >
                      {previewBrand.invoiceTerms || invoiceTerms}
                    </p>
                    {previewBrand.invoiceFooterNote && (
                      <p className="text-[10px] font-bold" style={{ color: previewBrand.accentColor }}>
                        {previewBrand.invoiceFooterNote}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Global Floating Bottom Save Bar */}
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

          {/* Keyboard Shortcuts Help Footer */}
          <div className="mt-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Keyboard Shortcuts &amp; Hotkeys
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Global shortcuts enabled across the platform
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Focus Search / Command Palette
                </span>
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                  Ctrl + K / ⌘K
                </kbd>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Close Modals &amp; Drawers
                </span>
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                  Esc
                </kbd>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300 font-medium">
                  Primary Form Submission
                </span>
                <kbd className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold rounded border border-slate-200 dark:border-slate-700 shadow-2xs">
                  Enter
                </kbd>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ADD / EDIT SELLING SUB-BRAND MODAL */}
      {/* ========================================================================= */}
      {brandModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {brandForm.mode === 'create'
                    ? 'Add New Selling Sub-Brand'
                    : `Edit Selling Sub-Brand (${brandForm.shortCode})`}
                </h3>
                <p className="text-xs text-slate-500">
                  Customer-facing identity, invoice prefix, SKU prefix, and hex accent color.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBrandModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSubBrandModal} className="flex-1 overflow-y-auto p-5 space-y-4">
              {brandModalError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{brandModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Brand Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={brandForm.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBrandForm((prev) => {
                        if (prev.mode === 'create' && !prev.shortCode) {
                          const suggested = val
                            .trim()
                            .toUpperCase()
                            .replace(/[^A-Z0-9]/g, '')
                            .slice(0, 6);
                          return {
                            ...prev,
                            name: val,
                            shortCode: suggested,
                            invoicePrefix: suggested ? `${suggested}-INV` : prev.invoicePrefix,
                            skuPrefix: suggested || prev.skuPrefix,
                          };
                        }
                        return { ...prev, name: val };
                      });
                    }}
                    placeholder="e.g. Nova Gear"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Short Code * {brandForm.mode === 'edit' && '(Locked)'}
                  </label>
                  <input
                    type="text"
                    required
                    disabled={brandForm.mode === 'edit'}
                    value={brandForm.shortCode}
                    onChange={(e) => {
                      const code = normalizeSubBrandCode(e.target.value);
                      setBrandForm((prev) => ({
                        ...prev,
                        shortCode: code,
                        invoicePrefix:
                          !prev.invoicePrefix || prev.invoicePrefix === `${prev.shortCode}-INV`
                            ? code
                              ? `${code}-INV`
                              : ''
                            : prev.invoicePrefix,
                        skuPrefix:
                          !prev.skuPrefix || prev.skuPrefix === prev.shortCode
                            ? code
                            : prev.skuPrefix,
                      }));
                    }}
                    placeholder="e.g. NOVA"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase text-slate-900 dark:text-white disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    Invoice Prefix *
                  </label>
                  <input
                    type="text"
                    required
                    value={brandForm.invoicePrefix}
                    onChange={(e) =>
                      setBrandForm((prev) => ({
                        ...prev,
                        invoicePrefix: e.target.value.toUpperCase().replace(/\s+/g, '-'),
                      }))
                    }
                    placeholder="e.g. NOVA-INV"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                    SKU Prefix (New Products)
                  </label>
                  <input
                    type="text"
                    value={brandForm.skuPrefix}
                    onChange={(e) =>
                      setBrandForm((prev) => ({
                        ...prev,
                        skuPrefix: normalizeSubBrandCode(e.target.value),
                      }))
                    }
                    placeholder="e.g. NOVA"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Hex Accent Color Picker */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2">
                <label className="block text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">
                  Accent Color (#RRGGBB — Print &amp; PDF Safe) *
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {SUB_BRAND_ACCENT_PALETTE.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => setBrandForm((prev) => ({ ...prev, accentColor: swatch.hex }))}
                      title={swatch.label}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer transition-transform ${
                        brandForm.accentColor.toUpperCase() === swatch.hex
                          ? 'scale-110 border-slate-950 ring-2 ring-amber-400'
                          : 'border-white'
                      }`}
                      style={{ backgroundColor: swatch.hex }}
                    />
                  ))}
                  <input
                    type="color"
                    value={sanitizeHexColor(brandForm.accentColor, '#0F766E')}
                    onChange={(e) =>
                      setBrandForm((prev) => ({
                        ...prev,
                        accentColor: e.target.value.toUpperCase(),
                      }))
                    }
                    className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={brandForm.accentColor}
                    onChange={(e) =>
                      setBrandForm((prev) => ({ ...prev, accentColor: e.target.value.toUpperCase() }))
                    }
                    placeholder="#0F766E"
                    className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Logo Upload + URL */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                <div className="w-14 h-14 rounded-xl bg-slate-950 p-1.5 flex items-center justify-center shrink-0">
                  {(brandLogoPreview || brandForm.logoUrl) ? (
                    <img
                      src={brandLogoPreview || brandForm.logoUrl}
                      alt="Brand Logo"
                      className="w-full h-full object-contain bg-white rounded"
                    />
                  ) : (
                    <span className="text-xs font-black" style={{ color: brandForm.accentColor }}>
                      {brandForm.shortCode || 'LOGO'}
                    </span>
                  )}
                </div>
                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="cursor-pointer bg-slate-900 text-amber-400 font-bold text-xs px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5">
                      <Upload size={12} />
                      <span>Upload Logo</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                        onChange={handleModalLogoUpload}
                        className="hidden"
                      />
                    </label>
                    {(brandLogoPreview || brandForm.logoUrl) && (
                      <button
                        type="button"
                        onClick={() => {
                          cleanupBrandLogoUpload(true);
                          setBrandLogoFile(null);
                          setBrandLogoPreview('');
                          setBrandLogoStatus('idle');
                          setBrandLogoProgress(0);
                          setBrandLogoError(undefined);
                          setBrandLogoBytes(undefined);
                          setBrandForm((p) => ({ ...p, logoUrl: '' }));
                        }}
                        className="text-xs text-rose-500 font-semibold cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                    {(brandLogoStatus === 'preparing' || brandLogoStatus === 'uploading') && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                        <Loader2 size={11} className="animate-spin" />
                        {brandLogoStatus === 'preparing' ? 'Compressing...' : `${brandLogoProgress}%`}
                      </span>
                    )}
                    {brandLogoStatus === 'done' && brandLogoBytes && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                        <CheckCircle2 size={11} /> {formatBytesCompact(brandLogoBytes)}
                      </span>
                    )}
                    {brandLogoStatus === 'failed' && brandLogoFile && (
                      <button
                        type="button"
                        onClick={() => void startBrandLogoUpload(brandLogoFile)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-bold cursor-pointer"
                      >
                        <RotateCcw size={10} /> Retry
                      </button>
                    )}
                  </div>
                  {brandLogoError && (
                    <p className="text-[11px] text-rose-600">{brandLogoError}</p>
                  )}
                  <input
                    type="text"
                    value={brandForm.logoUrl}
                    onChange={(e) => setBrandForm((p) => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="Or paste /logo_url.jpg or https://..."
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono"
                  />
                </div>
              </div>

              {/* Contact & Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={brandForm.phone}
                    onChange={(e) => setBrandForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    WhatsApp
                  </label>
                  <input
                    type="text"
                    value={brandForm.whatsapp}
                    onChange={(e) => setBrandForm((p) => ({ ...p, whatsapp: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Support Email
                  </label>
                  <input
                    type="email"
                    value={brandForm.email}
                    onChange={(e) => setBrandForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={brandForm.tagline}
                    onChange={(e) => setBrandForm((p) => ({ ...p, tagline: e.target.value }))}
                    placeholder="Smart Gadgets & Accessories"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Website
                  </label>
                  <input
                    type="text"
                    value={brandForm.website}
                    onChange={(e) => setBrandForm((p) => ({ ...p, website: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={brandForm.address}
                  onChange={(e) => setBrandForm((p) => ({ ...p, address: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Facebook</label>
                  <input
                    type="text"
                    value={brandForm.facebook}
                    onChange={(e) => setBrandForm((p) => ({ ...p, facebook: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Instagram</label>
                  <input
                    type="text"
                    value={brandForm.instagram}
                    onChange={(e) => setBrandForm((p) => ({ ...p, instagram: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">TikTok</label>
                  <input
                    type="text"
                    value={brandForm.tiktok}
                    onChange={(e) => setBrandForm((p) => ({ ...p, tiktok: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">YouTube</label>
                  <input
                    type="text"
                    value={brandForm.youtube}
                    onChange={(e) => setBrandForm((p) => ({ ...p, youtube: e.target.value }))}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Invoice Footer Note
                  </label>
                  <input
                    type="text"
                    value={brandForm.invoiceFooterNote}
                    onChange={(e) => setBrandForm((p) => ({ ...p, invoiceFooterNote: e.target.value }))}
                    placeholder="Thank you for shopping with us!"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Warranty Policy Text
                  </label>
                  <input
                    type="text"
                    value={brandForm.warrantyPolicyText}
                    onChange={(e) => setBrandForm((p) => ({ ...p, warrantyPolicyText: e.target.value }))}
                    placeholder="Standard warranty applies."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Invoice Terms &amp; Conditions
                </label>
                <textarea
                  rows={2}
                  value={brandForm.invoiceTerms}
                  onChange={(e) => setBrandForm((p) => ({ ...p, invoiceTerms: e.target.value }))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-mono"
                />
              </div>

              {/* Live Hex-Only Preview */}
              <div
                className="p-3.5 rounded-xl flex items-center justify-between gap-3"
                style={{
                  backgroundColor: '#FFFFFF',
                  color: '#0F172A',
                  border: `1px solid ${sanitizeHexColor(brandForm.accentColor, '#0F766E')}`,
                  borderLeft: `6px solid ${sanitizeHexColor(brandForm.accentColor, '#0F766E')}`,
                }}
              >
                <div className="min-w-0">
                  <div className="text-xs font-black uppercase truncate">
                    {brandForm.name || 'Sub-Brand Name'} ({brandForm.shortCode || 'CODE'})
                  </div>
                  <div
                    className="text-[11px] font-semibold truncate"
                    style={{ color: sanitizeHexColor(brandForm.accentColor, '#0F766E') }}
                  >
                    {brandForm.tagline || 'Tagline preview'}
                  </div>
                  {showParentCreditLine && parentCreditLine.trim() && (
                    <div className="text-[10px]" style={{ color: '#64748B' }}>
                      {parentCreditLine}
                    </div>
                  )}
                </div>
                <div className="text-right font-mono text-xs shrink-0">
                  <div className="font-bold" style={{ color: sanitizeHexColor(brandForm.accentColor, '#0F766E') }}>
                    {brandForm.invoicePrefix || 'CODE-INV'}-0001
                  </div>
                  <div className="text-[10px]" style={{ color: '#64748B' }}>
                    {brandForm.invoiceFooterNote || 'Footer preview'}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setBrandModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBrand}
                  className="px-5 py-2 text-xs font-bold bg-slate-950 hover:bg-slate-900 text-amber-400 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {savingBrand
                    ? 'Saving...'
                    : brandForm.mode === 'create'
                      ? 'Create Selling Sub-Brand'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REASSIGN LEGACY SAT RECORDS MODAL */}
      {/* ========================================================================= */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/60">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Reassign Legacy SAT &amp; Unassigned Records
                </h3>
                <p className="text-xs text-slate-500">
                  Tags reporting subBrand only — printed invoice/PO numbers, SKUs &amp; barcodes never change.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {loadingReassignPreview ? (
                <div className="py-10 text-center text-slate-500">Scanning Firestore collections...</div>
              ) : reassignPreview ? (
                <>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Target Selling Sub-Brand
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Selected records will be tagged to this selling brand.
                      </span>
                    </div>
                    <select
                      value={reassignTargetBrand}
                      onChange={(e) => setReassignTargetBrand(e.target.value)}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold"
                    >
                      {activeSellingBrands.map((sb) => (
                        <option key={sb.shortCode} value={sb.shortCode}>
                          {sb.name} ({sb.shortCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                      <span className="text-[10px] font-bold text-amber-700 block">Products</span>
                      <span className="text-base font-black text-amber-900 font-mono">
                        {selectedProdIds.length}/{reassignPreview.products.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                      <span className="text-[10px] font-bold text-blue-700 block">Orders</span>
                      <span className="text-base font-black text-blue-900 font-mono">
                        {selectedOrderIds.length}/{reassignPreview.orders.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200">
                      <span className="text-[10px] font-bold text-purple-700 block">Invoices</span>
                      <span className="text-base font-black text-purple-900 font-mono">
                        {selectedInvoiceIds.length}/{reassignPreview.invoices.length}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-teal-50 border border-teal-200">
                      <span className="text-[10px] font-bold text-teal-700 block">Pre-Orders</span>
                      <span className="text-base font-black text-teal-900 font-mono">
                        {selectedPreOrderIds.length}/{reassignPreview.preOrders.length}
                      </span>
                    </div>
                  </div>

                  {reassignPreview.products.length +
                    reassignPreview.orders.length +
                    reassignPreview.invoices.length +
                    reassignPreview.preOrders.length ===
                  0 ? (
                    <div className="p-6 text-center bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 font-semibold">
                      No legacy SAT or unassigned records found! Everything is already assigned to selling sub-brands.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {reassignPreview.products.length > 0 && (
                        <div className="border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <div className="flex justify-between font-bold text-slate-700">
                            <span>Products ({reassignPreview.products.length})</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProdIds(
                                  selectedProdIds.length === reassignPreview.products.length
                                    ? []
                                    : reassignPreview.products.map((p) => p.id)
                                )
                              }
                              className="text-amber-600 cursor-pointer"
                            >
                              {selectedProdIds.length === reassignPreview.products.length
                                ? 'Unselect All'
                                : 'Select All'}
                            </button>
                          </div>
                          {reassignPreview.products.slice(0, 30).map((p) => (
                            <label key={p.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedProdIds.includes(p.id)}
                                onChange={(e) =>
                                  setSelectedProdIds((prev) =>
                                    e.target.checked
                                      ? [...prev, p.id]
                                      : prev.filter((id) => id !== p.id)
                                  )
                                }
                              />
                              <span className="truncate font-semibold">{p.name}</span>
                              <span className="font-mono text-slate-400 ml-auto">{p.sku}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {reassignPreview.orders.length > 0 && (
                        <div className="border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <div className="flex justify-between font-bold text-slate-700">
                            <span>Legacy SAT Orders ({reassignPreview.orders.length})</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedOrderIds(
                                  selectedOrderIds.length === reassignPreview.orders.length
                                    ? []
                                    : reassignPreview.orders.map((o) => o.id)
                                )
                              }
                              className="text-amber-600 cursor-pointer"
                            >
                              {selectedOrderIds.length === reassignPreview.orders.length
                                ? 'Unselect All'
                                : 'Select All'}
                            </button>
                          </div>
                          {reassignPreview.orders.slice(0, 30).map((o) => (
                            <label key={o.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedOrderIds.includes(o.id)}
                                onChange={(e) =>
                                  setSelectedOrderIds((prev) =>
                                    e.target.checked
                                      ? [...prev, o.id]
                                      : prev.filter((id) => id !== o.id)
                                  )
                                }
                              />
                              <span className="font-mono font-bold">#{o.id.slice(-6)}</span>
                              <span className="truncate">{o.customerName}</span>
                              <span className="font-mono text-slate-400 ml-auto">
                                ৳{Number(o.totalAmount || 0).toLocaleString()}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}

                      {reassignPreview.invoices.length > 0 && (
                        <div className="border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <div className="flex justify-between font-bold text-slate-700">
                            <span>Legacy SAT Invoices ({reassignPreview.invoices.length})</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedInvoiceIds(
                                  selectedInvoiceIds.length === reassignPreview.invoices.length
                                    ? []
                                    : reassignPreview.invoices.map((i) => i.id)
                                )
                              }
                              className="text-amber-600 cursor-pointer"
                            >
                              {selectedInvoiceIds.length === reassignPreview.invoices.length
                                ? 'Unselect All'
                                : 'Select All'}
                            </button>
                          </div>
                          {reassignPreview.invoices.slice(0, 30).map((inv) => (
                            <label key={inv.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedInvoiceIds.includes(inv.id)}
                                onChange={(e) =>
                                  setSelectedInvoiceIds((prev) =>
                                    e.target.checked
                                      ? [...prev, inv.id]
                                      : prev.filter((id) => id !== inv.id)
                                  )
                                }
                              />
                              <span className="font-mono font-bold">{inv.invoiceNumber}</span>
                              <span className="truncate">{inv.customerName}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {reassignPreview.preOrders.length > 0 && (
                        <div className="border border-slate-200 rounded-xl p-2.5 space-y-1">
                          <div className="flex justify-between font-bold text-slate-700">
                            <span>Legacy SAT Pre-Orders ({reassignPreview.preOrders.length})</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPreOrderIds(
                                  selectedPreOrderIds.length === reassignPreview.preOrders.length
                                    ? []
                                    : reassignPreview.preOrders.map((po) => po.id)
                                )
                              }
                              className="text-amber-600 cursor-pointer"
                            >
                              {selectedPreOrderIds.length === reassignPreview.preOrders.length
                                ? 'Unselect All'
                                : 'Select All'}
                            </button>
                          </div>
                          {reassignPreview.preOrders.slice(0, 30).map((po) => (
                            <label key={po.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedPreOrderIds.includes(po.id)}
                                onChange={(e) =>
                                  setSelectedPreOrderIds((prev) =>
                                    e.target.checked
                                      ? [...prev, po.id]
                                      : prev.filter((id) => id !== po.id)
                                  )
                                }
                              />
                              <span className="font-mono font-bold">{po.preOrderNumber}</span>
                              <span className="truncate">{po.customerName}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-950/60">
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={
                  applyingReassign ||
                  selectedProdIds.length +
                    selectedOrderIds.length +
                    selectedInvoiceIds.length +
                    selectedPreOrderIds.length ===
                    0
                }
                onClick={handleConfirmReassignment}
                className="px-5 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl cursor-pointer disabled:opacity-40"
              >
                {applyingReassign
                  ? 'Applying...'
                  : `Reassign Selected (${selectedProdIds.length + selectedOrderIds.length + selectedInvoiceIds.length + selectedPreOrderIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
