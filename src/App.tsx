import React, { Suspense, lazy, useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase/config';
import {
  getUserProfile,
  findUserProfileByEmail,
  createUserProfile,
  getCompanySettings,
  getProducts,
  getCategories,
  getBrands,
  getProductColors,
  getProductModels,
  getProductAvailableStock,
  getPendingApprovalUsers,
  subscribeToProducts,
  saveCompanySettings,
  isPermanentSuperAdminEmail,
  ensurePermanentSuperAdminProfile,
  clearSampleData,
  migrateProductBarcodes,
  migrateExistingCustomerIds,
  migrateExistingInvoices,
  addLoginHistory,
  localStore,
  dbCache,
} from './firebase/db';
import type {
  UserProfile,
  Product,
  Category,
  Brand,
  CompanySettings,
  ProductColor,
  ProductModel,
  RolePermissionsMap,
} from './types';
import {
  getCachedRolePermissionsSync,
  getPreOrderStatsSummary,
  getRolePermissions,
} from './firebase/preOrderBootstrap';
import { hasPermission } from './preOrders/constants';
import { SidebarBadgeCounts, normalizeDefaultSubAction } from './navigation/sidebarConfig';
import {
  perfMarkDashboardVisible,
  perfSetScreen,
  perfTimeAsync,
} from './utils/perfLogger';
import {
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Key,
  Mail,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  AlertCircle,
  Send,
  X,
} from 'lucide-react';

import type { ProductSubTab } from './components/ProductManagement';
import ErrorBoundary from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ThemeProvider, ToastProvider, ConfirmDialog, useToast } from './design-system';

// Lazy-loaded chrome & standalone portals (keeps initial login shell ultra-small)
const SplashAndAuth = lazy(() => import('./components/SplashAndAuth'));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'));
const Sidebar = lazy(() => import('./components/Sidebar'));
const TopBar = lazy(() =>
  import('./components/TopBar').then((m) => ({ default: m.TopBar }))
);
const WelcomeTour = lazy(() =>
  import('./components/WelcomeTour').then((m) => ({ default: m.WelcomeTour }))
);
const PublicTrackingPortal = lazy(
  () => import('./components/PreOrders/PublicTrackingPortal')
);
const PublicInvoiceVerification = lazy(() =>
  import('./components/PublicInvoiceVerification').then((m) => ({
    default: m.PublicInvoiceVerification,
  }))
);

// Route-level lazy views (loaded only when user opens that module)
const DashboardView = lazy(() => import('./components/DashboardView'));
const ProductManagement = lazy(() => import('./components/ProductManagement'));
const StockOperations = lazy(() => import('./components/StockOperations'));
const UserManagement = lazy(() => import('./components/UserManagement'));
const AttendanceLog = lazy(() => import('./components/AttendanceLog'));
const CustomerManagement = lazy(() => import('./components/CustomerManagement'));
const OrderManagement = lazy(() => import('./components/OrderManagement'));
const InvoiceManagement = lazy(() => import('./components/InvoiceManagement'));
const DuePayments = lazy(() => import('./components/DuePayments'));
const FinancialOverview = lazy(() => import('./components/FinancialOverview'));
const AccountingDesk = lazy(() =>
  import('./components/Accounting').then((m) => ({ default: m.AccountingDesk }))
);
const SupplierManagement = lazy(() => import('./components/SupplierManagement'));
const ReportsAnalytics = lazy(() => import('./components/ReportsAnalytics'));
const AuditLogView = lazy(() =>
  import('./components/AuditLogView').then((m) => ({ default: m.AuditLogView }))
);
const CompanySettingsView = lazy(() => import('./components/CompanySettingsView'));
const ProfileSettingsView = lazy(() => import('./components/ProfileSettingsView'));
const PreOrderOverviewView = lazy(
  () => import('./components/PreOrders/PreOrderOverviewView')
);
const CreatePreOrderView = lazy(
  () => import('./components/PreOrders/CreatePreOrderView')
);
const AllPreOrdersView = lazy(
  () => import('./components/PreOrders/AllPreOrdersView')
);
const PaymentManagementView = lazy(
  () => import('./components/PreOrders/PaymentManagementView')
);
const PreOrderSupplierManagementView = lazy(
  () => import('./components/PreOrders/PreOrderSupplierManagementView')
);
const ShipmentTrackingView = lazy(
  () => import('./components/PreOrders/ShipmentTrackingView')
);
const CustomerTrackingLinksView = lazy(
  () => import('./components/PreOrders/CustomerTrackingLinksView')
);
const RemindersCenterView = lazy(
  () => import('./components/PreOrders/RemindersCenterView')
);
const PreOrderReportsView = lazy(
  () => import('./components/PreOrders/PreOrderReportsView')
);
const PreOrderHelpView = lazy(
  () => import('./components/PreOrders/PreOrderHelpView')
);

const RouteSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse p-2">
    <div className="h-8 w-56 bg-slate-200 dark:bg-slate-800 rounded-xl" />
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
      <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
    </div>
    <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
  </div>
);

const FullScreenLoader: React.FC<{ label?: string }> = ({ label = 'Loading...' }) => (
  <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
    <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-3" />
    <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">{label}</p>
  </div>
);

const TrackingSyncWarningBridge: React.FC = () => {
  const { showToast } = useToast();
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>)?.detail;
      if (detail) {
        showToast(detail, 'warning');
      }
    };
    window.addEventListener('preorder-tracking-sync-warning', handler);
    return () => window.removeEventListener('preorder-tracking-sync-warning', handler);
  }, [showToast]);
  return null;
};

const parsePublicTrackingRoute = (): { isTrackingRoute: boolean; token: string } => {
  if (typeof window === 'undefined') return { isTrackingRoute: false, token: '' };
  const pathname = window.location.pathname;
  if (!/^\/track(\/|$)/i.test(pathname)) {
    return { isTrackingRoute: false, token: '' };
  }
  const match = pathname.match(/^\/track\/([^/?#]+)/i);
  if (!match || !match[1]) return { isTrackingRoute: true, token: '' };
  try {
    return { isTrackingRoute: true, token: decodeURIComponent(match[1]).trim() };
  } catch {
    return { isTrackingRoute: true, token: match[1].trim() };
  }
};

// Helpers to inspect and clear cached auth/session markers
const hasCachedUserSession = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(
      localStorage.getItem('sat_user_session') ||
      localStorage.getItem('sat_otp_verified') === 'true' ||
      sessionStorage.getItem('sat_otp_verified') === 'true' ||
      localStorage.getItem('sat_active_uid')
    );
  } catch {
    return false;
  }
};

const clearCachedAuthSession = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('sat_otp_verified');
    localStorage.removeItem('sat_otp_verified');
    localStorage.removeItem('sat_user_session');
    localStorage.removeItem('sat_active_uid');
    localStorage.removeItem('sat_session_started_at');
  } catch {}
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string>('');
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);

  const checkIfQuotaError = (err: any): boolean => {
    const msg = err?.message || String(err);
    const lowerMsg = msg.toLowerCase();
    return (
      lowerMsg.includes('quota limit exceeded') ||
      lowerMsg.includes('quota exceeded') ||
      lowerMsg.includes('free daily read units') ||
      lowerMsg.includes('resource-exhausted') ||
      lowerMsg.includes('resource_exhausted') ||
      lowerMsg.includes('over_quota') ||
      lowerMsg.includes('quota_exceeded')
    );
  };
  
  // App structure states (hydrate from local cache immediately for instant first paint)
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() =>
    localStore.get<CompanySettings>('company_settings')
  );
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sat_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [showWelcomeTour, setShowWelcomeTour] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sat_welcome_tour_dismissed') !== 'true';
    } catch {
      return false;
    }
  });

  // Applet Data States (instant hydration from localStore)
  const [products, setProducts] = useState<Product[]>(
    () => localStore.get<Product[]>('products_archived') || localStore.get<Product[]>('products_active') || []
  );
  const [categories, setCategories] = useState<Category[]>(
    () => localStore.get<Category[]>('categories') || []
  );
  const [brands, setBrands] = useState<Brand[]>(
    () => localStore.get<Brand[]>('brands') || []
  );
  const [productColors, setProductColors] = useState<ProductColor[]>(
    () => localStore.get<ProductColor[]>('product_colors') || []
  );
  const [productModels, setProductModels] = useState<ProductModel[]>(
    () => localStore.get<ProductModel[]>('product_models') || []
  );
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap | null>(() =>
    getCachedRolePermissionsSync()
  );
  const [rolePermissionsLoaded, setRolePermissionsLoaded] = useState<boolean>(() =>
    Boolean(getCachedRolePermissionsSync())
  );
  const [firebaseAuthed, setFirebaseAuthed] = useState<boolean>(() => Boolean(auth?.currentUser));
  const [dataLoading, setDataLoading] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Public QR Invoice Verification state
  const [isPublicVerification, setIsPublicVerification] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const hash = window.location.hash || '';
      const href = window.location.href || '';
      return (
        search.includes('verify_inv') ||
        search.includes('inv=') ||
        hash.includes('verify_inv') ||
        hash.includes('inv=') ||
        href.includes('verify_inv=') ||
        href.includes('?inv=')
      );
    }
    return false;
  });

  // Deep-linking search target states
  const [initialProductId, setInitialProductId] = useState<string | null>(null);
  const [initialOrderId, setInitialOrderId] = useState<string | null>(null);
  const [initialCustomerId, setInitialCustomerId] = useState<string | null>(null);
  const [selectedPreOrderId, setSelectedPreOrderId] = useState<string | null>(null);
  const [preOrderListPreset, setPreOrderListPreset] = useState<
    import('./types').PreOrderListFilterPreset | null
  >(null);
  const [preOrderCreateDirty, setPreOrderCreateDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{
    tab: string;
    subAction?: string;
    initialId?: string | null;
  } | null>(null);

  // Sub-action passing & sidebar deep-link tracking
  const [currentSubAction, setCurrentSubAction] = useState<string | undefined>(undefined);
  const [initialProductAddMode, setInitialProductAddMode] = useState(false);
  const [productSubTab, setProductSubTab] = useState<ProductSubTab>('catalog');
  const [initialStockAction, setInitialStockAction] = useState('in');
  const [initialStockProductId, setInitialStockProductId] = useState('');
  const [initialOrderCreateMode, setInitialOrderCreateMode] = useState(false);
  const [usersSubTab, setUsersSubTab] = useState<'registry' | 'pending' | 'permissions'>('registry');
  const [accountingSubTab, setAccountingSubTab] = useState<string>('overview');
  const [financialsSubTab, setFinancialsSubTab] = useState<'overview' | 'income' | 'expenses'>('overview');
  const [pendingUsersCount, setPendingUsersCount] = useState<number>(0);
  const [pendingPreOrderVerificationsCount, setPendingPreOrderVerificationsCount] = useState<number>(0);

  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataPassword, setClearDataPassword] = useState('');
  const [clearDataOtp, setClearDataOtp] = useState('');
  const [generatedClearDataOtp, setGeneratedClearDataOtp] = useState<string | null>(null);
  const [otpExpiryTime, setOtpExpiryTime] = useState<number | null>(null);
  const [clearDataOtpAttempts, setClearDataOtpAttempts] = useState<number>(0);
  const [isSendingClearDataOtp, setIsSendingClearDataOtp] = useState(false);
  const [clearDataOtpCountdown, setClearDataOtpCountdown] = useState(0);
  const [clearDataOtpSuccessMsg, setClearDataOtpSuccessMsg] = useState('');
  const [showClearPassword, setShowClearPassword] = useState(false);
  const [clearingDataError, setClearingDataError] = useState('');
  const [isClearingData, setIsClearingData] = useState(false);

  // OTP Resend Countdown Timer
  useEffect(() => {
    let timer: any;
    if (clearDataOtpCountdown > 0) {
      timer = setInterval(() => {
        setClearDataOtpCountdown(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [clearDataOtpCountdown]);

  const [isMigratingBarcodes, setIsMigratingBarcodes] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  const [isMigratingCustomerIds, setIsMigratingCustomerIds] = useState(false);
  const [customerIdMigrationResult, setCustomerIdMigrationResult] = useState<string | null>(null);

  const handleMigrateCustomerIds = async () => {
    setIsMigratingCustomerIds(true);
    setCustomerIdMigrationResult(null);
    try {
      const res = await migrateExistingCustomerIds();
      if (res) {
        setCustomerIdMigrationResult(`Successfully assigned Customer IDs to ${res.totalMigrated} existing customer(s). Next counter is at CUS-${String(res.nextCounter + 1).padStart(4, '0')}.`);
      } else {
        setCustomerIdMigrationResult('Migration complete. All existing customers already have Customer IDs.');
      }
    } catch (err: any) {
      console.error('Customer ID Migration error:', err);
      setCustomerIdMigrationResult(`Migration failed: ${err.message || 'Error occurred'}`);
    } finally {
      setIsMigratingCustomerIds(false);
    }
  };

  const [isMigratingInvoices, setIsMigratingInvoices] = useState(false);
  const [invoiceMigrationResult, setInvoiceMigrationResult] = useState<string | null>(null);

  const handleMigrateInvoices = async () => {
    setIsMigratingInvoices(true);
    setInvoiceMigrationResult(null);
    try {
      const res = await migrateExistingInvoices();
      if (res && res.totalMigrated > 0) {
        setInvoiceMigrationResult(`Successfully updated ${res.totalMigrated} legacy invoice(s) with required fields.`);
      } else {
        setInvoiceMigrationResult('All existing invoices are already up to date.');
      }
    } catch (err: any) {
      console.error('Invoice migration error:', err);
      setInvoiceMigrationResult(`Migration failed: ${err.message || 'Error occurred'}`);
    } finally {
      setIsMigratingInvoices(false);
    }
  };

  // Listen to Auth State and Global Quota Exceeded event
  useEffect(() => {
    const handleQuotaEvent = (e: Event) => {
      console.warn("Global Quota Event Received:", e);
      setIsQuotaExceeded(true);
    };
    window.addEventListener('firestore-quota-exceeded', handleQuotaEvent);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuotaEvent);
    };
  }, []);

  // Global Keyboard Shortcut Manager: Ctrl+K for search, Esc to close modals/drawers, Enter for primary form submissions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('open-global-search'));
      }
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('close-all-modals'));
      }
      if (e.key === 'Enter' && e.target instanceof HTMLElement) {
        if (e.target.tagName === 'INPUT' && e.target.getAttribute('type') !== 'submit') {
          const form = e.target.closest('form');
          if (form) {
            const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
            if (submitBtn && !submitBtn.disabled) {
              // Form submission handled or triggered
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setPublicTrackingRoute(parsePublicTrackingRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [publicTrackingRoute, setPublicTrackingRoute] = useState<{
    isTrackingRoute: boolean;
    token: string;
  }>(() => parsePublicTrackingRoute());

  useEffect(() => {
    // Public customer tracking route /track/:token executes ZERO auth listeners or ERP fetches
    if (publicTrackingRoute.isTrackingRoute) {
      setAuthChecking(false);
      return;
    }

    let isMounted = true;
    
    if (!isFirebaseConfigured) {
      clearCachedAuthSession();
      setAuthChecking(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!isMounted) return;

      try {
        if (firebaseUser) {
          setFirebaseAuthed(true);
          setAuthReady(true);

          // Fetch real Firestore user profile first (never restore session from cache alone)
          let profile: UserProfile | null = null;
          try {
            profile = await getUserProfile(firebaseUser.uid, { strictFirestore: true });
          } catch (profileErr: any) {
            if (checkIfQuotaError(profileErr)) {
              setIsQuotaExceeded(true);
              return;
            }
            console.warn('App: Strict UID profile lookup failed:', profileErr);
          }

          // Fallback: Resolve legacy/migrated profile by email when authenticated
          if (!profile && firebaseUser.email) {
            profile = await findUserProfileByEmail(firebaseUser.email);
            if (profile && profile.id !== firebaseUser.uid) {
              const healedProfile = { ...profile, id: firebaseUser.uid };
              try {
                await createUserProfile(firebaseUser.uid, healedProfile);
                profile = (await getUserProfile(firebaseUser.uid, { strictFirestore: true })) || healedProfile;
              } catch (e) {
                console.warn('Could not self-heal profile UID:', e);
              }
            }
          }

          if (isPermanentSuperAdminEmail(firebaseUser.email)) {
            if (!profile || profile.role !== 'superadmin' || profile.active !== true || profile.status !== 'approved') {
              const ensured = await ensurePermanentSuperAdminProfile(
                firebaseUser.uid,
                firebaseUser.email,
                firebaseUser.displayName || profile?.name
              );
              if (ensured) {
                profile = ensured;
              }
            }
          }

          if (!profile) {
            console.warn('App: Firebase Auth user has no Firestore profile document. Signing out cleanly.');
            const hadCache = hasCachedUserSession();
            clearCachedAuthSession();
            dbCache.clearAll();
            try { await signOut(auth); } catch {}
            if (!isMounted) return;
            setUser(null);
            setFirebaseAuthed(false);
            setProfileLoaded(false);
            setCompanySettings(null);
            setIsOnboarding(false);
            if (hadCache) {
              setSessionExpiredMessage('Session expired, please log in again');
            }
            return;
          }

          // Safety Check: Suspended Account
          if (profile.active === false && profile.role !== 'superadmin') {
            console.warn('App: Attempted access by suspended account:', profile.email);
            await handleLogout();
            return;
          }

          // Additional Check: OTP verified marker bound to this device/UID (never replaces Firebase Auth)
          let isOtpVerified = false;
          try {
            const otpFlag =
              sessionStorage.getItem('sat_otp_verified') === 'true' ||
              localStorage.getItem('sat_otp_verified') === 'true';
            const verifiedUid = localStorage.getItem('sat_active_uid');
            isOtpVerified = otpFlag && (!verifiedUid || verifiedUid === firebaseUser.uid);
          } catch {}

          if (!isOtpVerified) {
            setUser(null);
            setProfileLoaded(false);
            setAuthChecking(false);
            return;
          }

          // Validate session revocation ONLY when this browser recorded a prior session start timestamp
          try {
            const startedAtRaw = localStorage.getItem('sat_session_started_at');
            const startedAt = startedAtRaw ? Number(startedAtRaw) : 0;
            if (
              typeof profile.sessionsRevokedAt === 'number' &&
              Number.isFinite(profile.sessionsRevokedAt) &&
              startedAt > 0 &&
              startedAt < profile.sessionsRevokedAt
            ) {
              console.warn('App: Session was revoked from another device. Signing out.');
              clearCachedAuthSession();
              dbCache.clearAll();
              try { await signOut(auth); } catch {}
              if (!isMounted) return;
              setUser(null);
              setFirebaseAuthed(false);
              setProfileLoaded(false);
              setCompanySettings(null);
              setIsOnboarding(false);
              setSessionExpiredMessage('Session expired, please log in again');
              return;
            }
            if (!startedAtRaw) {
              localStorage.setItem('sat_session_started_at', String(Date.now()));
            }
          } catch {}

          try {
            sessionStorage.setItem('sat_otp_verified', 'true');
            localStorage.setItem('sat_otp_verified', 'true');
            localStorage.setItem('sat_active_uid', firebaseUser.uid);
            localStorage.setItem('sat_user_session', JSON.stringify(profile));
          } catch {}

          if (!isMounted) return;
          setSessionExpiredMessage('');
          setUser(profile);
          setProfileLoaded(true);

          const cachedSettings = localStore.get<CompanySettings>('company_settings');
          if (cachedSettings?.onboarded) {
            setCompanySettings(cachedSettings);
            setIsOnboarding(false);
            setAuthChecking(false);
            // SWR refresh settings in background without blocking dashboard render
            getCompanySettings()
              .then((settings) => {
                if (!isMounted || !settings) return;
                setCompanySettings(settings);
                setIsOnboarding(!settings.onboarded);
              })
              .catch((settingsErr: any) => {
                if (checkIfQuotaError(settingsErr)) {
                  setIsQuotaExceeded(true);
                }
              });
          } else {
            try {
              const settings = await getCompanySettings();
              if (!isMounted) return;
              if (settings && settings.onboarded) {
                setCompanySettings(settings);
                setIsOnboarding(false);
              } else {
                setIsOnboarding(true);
              }
            } catch (settingsErr: any) {
              if (checkIfQuotaError(settingsErr)) {
                setIsQuotaExceeded(true);
              }
              throw settingsErr;
            }
          }
        } else {
          // Firebase Auth user is null: NEVER restore a cached local session without auth.currentUser.
          if (!isMounted) return;
          const hadCachedSession = hasCachedUserSession();
          if (hadCachedSession) {
            console.warn('App: Cached session found while Firebase Auth user is null. Clearing stale cache.');
          }
          clearCachedAuthSession();
          dbCache.clearAll();
          setFirebaseAuthed(false);
          setProfileLoaded(false);
          setAuthReady(true);
          setUser(null);
          setCompanySettings(null);
          setIsOnboarding(false);
          if (hadCachedSession) {
            setSessionExpiredMessage('Session expired, please log in again');
          }
          if (auth?.currentUser) {
            try {
              await signOut(auth);
            } catch {}
          }
        }
      } catch (err: any) {
        if (checkIfQuotaError(err)) {
          console.warn('Info: Quota Exceeded in onAuthStateChanged:', err);
          setIsQuotaExceeded(true);
        } else {
          console.error('Error in onAuthStateChanged:', err);
          const hadCache = hasCachedUserSession();
          clearCachedAuthSession();
          dbCache.clearAll();
          if (!isMounted) return;
          setFirebaseAuthed(false);
          setProfileLoaded(false);
          setAuthReady(true);
          setUser(null);
          setCompanySettings(null);
          setIsOnboarding(false);
          if (hadCache) {
            setSessionExpiredMessage('Session expired, please log in again');
          }
        }
      } finally {
        if (isMounted) {
          setAuthReady(true);
          setAuthChecking(false);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [publicTrackingRoute.isTrackingRoute]);

  // Fetch application data
  const refreshApplicationData = async () => {
    setDataLoading(true);
    try {
      // Parallelize non-blocking reads to minimize latency & network round-trips
      const [prodsList, catsList, brandsList, colorsList, modelsList] = await Promise.all([
        getProducts(true),
        getCategories(),
        getBrands(),
        getProductColors(),
        getProductModels()
      ]);

      if (prodsList && prodsList.length > 0) setProducts(prodsList);
      if (catsList && catsList.length > 0) setCategories(catsList);
      if (brandsList && brandsList.length > 0) setBrands(brandsList);
      if (colorsList && colorsList.length > 0) setProductColors(colorsList);
      if (modelsList && modelsList.length > 0) setProductModels(modelsList);

      if (user?.role === 'superadmin') {
        getPendingApprovalUsers(25, true)
          .then((pendingUsers) => {
            setPendingUsersCount(pendingUsers.length);
          })
          .catch(() => {});
      }

      if (hasPermission(user, rolePermissions, 'preOrderView')) {
        getPreOrderStatsSummary({ forceRefresh: true })
          .then((stats) => {
            setPendingPreOrderVerificationsCount(stats?.pendingPaymentCount || 0);
          })
          .catch(() => {});
      }
    } catch (error: any) {
      console.warn("Firestore access error in refreshApplicationData:", error);
      if (checkIfQuotaError(error)) {
        setIsQuotaExceeded(true);
      }
    } finally {
      setDataLoading(false);
    }
  };

  // Fetch user profile again
  const refreshUserProfile = async () => {
    if (user?.id) {
      try {
        let profile = await getUserProfile(user.id);
        if (!profile && user.email) {
          profile = await findUserProfileByEmail(user.email);
        }
        if (profile) {
          setUser(profile);
          try {
            localStorage.setItem('sat_user_session', JSON.stringify(profile));
          } catch (e) {}
        }
      } catch (error: any) {
        if (checkIfQuotaError(error)) {
          setIsQuotaExceeded(true);
        }
      }
    }
  };

  useEffect(() => {
    if (!publicTrackingRoute.isTrackingRoute && authReady && user && firebaseAuthed && profileLoaded && !isOnboarding) {
      perfMarkDashboardVisible();

      // Load static lookup tables in one parallel batch (uses in-memory/local cache, 0 extra real-time listeners)
      Promise.all([
        getRolePermissions(),
        getCategories(),
        getBrands(),
        getProductColors(),
        getProductModels(),
      ])
        .then(([perms, cats, brs, cols, mods]) => {
          setRolePermissions(perms);
          setRolePermissionsLoaded(true);
          if (cats?.length) setCategories(cats);
          if (brs?.length) setBrands(brs);
          if (cols?.length) setProductColors(cols);
          if (mods?.length) setProductModels(mods);
        })
        .catch(() => {
          setRolePermissionsLoaded(true);
        });

      // Keep ONE shared real-time listener for catalog products
      const unsubProducts = subscribeToProducts((prods) => {
        if (prods) setProducts(prods);
      }, true);

      // Defer secondary startup checks until after dashboard settles
      const deferredTimer = window.setTimeout(() => {
        if (user.role === 'superadmin') {
          getPendingApprovalUsers(25)
            .then((pendingUsers) => setPendingUsersCount(pendingUsers.length))
            .catch(() => {});
        } else {
          setPendingUsersCount(0);
        }

        const effectivePerms = rolePermissions || getCachedRolePermissionsSync();
        if (hasPermission(user, effectivePerms, 'preOrderView')) {
          getPreOrderStatsSummary()
            .then((stats) => setPendingPreOrderVerificationsCount(stats?.pendingPaymentCount || 0))
            .catch(() => {});

          // Once-per-day background pre-order reminder sync (only loads preOrderDb on idle)
          const todayIso = new Date().toISOString().split('T')[0];
          const syncKey = `sat_reminder_sync_${user.id}_${todayIso}`;
          try {
            if (localStorage.getItem(syncKey) !== 'done') {
              void import('./firebase/preOrderDb')
                .then((m) =>
                  m.syncDailyTimeBasedReminders({
                    actor: {
                      id: user.id,
                      name: user.name,
                      role: user.role,
                    },
                    allowedSubBrands: user.subBrandAccess,
                  })
                )
                .then(() => {
                  try {
                    localStorage.setItem(syncKey, 'done');
                  } catch {}
                })
                .catch(() => {});
            }
          } catch {}
        }
      }, 1200);

      return () => {
        window.clearTimeout(deferredTimer);
        unsubProducts();
      };
    }
  }, [publicTrackingRoute.isTrackingRoute, authReady, user, firebaseAuthed, profileLoaded, isOnboarding]);

  // Handle Auth success from Login Screen
  const handleAuthSuccess = async (profile: UserProfile) => {
    if (isFirebaseConfigured && !auth?.currentUser) {
      console.warn('App: Blocked handleAuthSuccess because Firebase Auth currentUser is null.');
      clearCachedAuthSession();
      setUser(null);
      setFirebaseAuthed(false);
      setProfileLoaded(false);
      setSessionExpiredMessage('Session expired, please log in again');
      return;
    }

    const effectiveProfile =
      auth?.currentUser?.uid && profile.id !== auth.currentUser.uid
        ? { ...profile, id: auth.currentUser.uid }
        : profile;
    try {
      sessionStorage.setItem('sat_otp_verified', 'true');
      localStorage.setItem('sat_otp_verified', 'true');
      if (auth?.currentUser?.uid) {
        localStorage.setItem('sat_active_uid', auth.currentUser.uid);
      }
      localStorage.setItem('sat_session_started_at', String(Date.now()));
      localStorage.setItem('sat_user_session', JSON.stringify(effectiveProfile));
      
      // Track login in background when Firebase Auth session is active
      if (auth?.currentUser) {
        void addLoginHistory(effectiveProfile.id, {
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          status: 'success',
        }).catch(() => {});
      }
    } catch (e) {}
    setSessionExpiredMessage('');
    setFirebaseAuthed(Boolean(auth?.currentUser));
    setProfileLoaded(true);
    setAuthReady(true);
    setUser(effectiveProfile);

    const cachedSettings = localStore.get<CompanySettings>('company_settings');
    if (cachedSettings?.onboarded) {
      setCompanySettings(cachedSettings);
      setIsOnboarding(false);
      // Parallel background refresh without blocking login transition
      void Promise.all([
        getCompanySettings()
          .then((settings) => {
            if (settings) {
              setCompanySettings(settings);
              setIsOnboarding(!settings.onboarded);
            }
          })
          .catch(() => {}),
        getRolePermissions()
          .then((perms) => {
            setRolePermissions(perms);
            setRolePermissionsLoaded(true);
          })
          .catch(() => {}),
      ]);
      return;
    }

    try {
      const [settings, perms] = await Promise.all([
        getCompanySettings(),
        getRolePermissions().catch(() => null),
      ]);
      if (perms) {
        setRolePermissions(perms);
        setRolePermissionsLoaded(true);
      }
      if (settings && settings.onboarded) {
        setCompanySettings(settings);
        setIsOnboarding(false);
      } else {
        setIsOnboarding(true);
      }
    } catch (error: any) {
      if (checkIfQuotaError(error)) {
        setIsQuotaExceeded(true);
      } else {
        setIsOnboarding(true);
      }
    }
  };

  // Handle Onboarding Completion
  const handleOnboardingComplete = (settings: CompanySettings) => {
    setCompanySettings(settings);
    setIsOnboarding(false);
  };

  // Handle Logout
  const handleLogout = async () => {
    clearCachedAuthSession();
    dbCache.clearAll();
    try {
      await signOut(auth);
    } catch (e) {}
    setFirebaseAuthed(false);
    setProfileLoaded(false);
    setSessionExpiredMessage('');
    setUser(null);
    setRolePermissions(null);
    setRolePermissionsLoaded(false);
    setCompanySettings(null);
    setIsOnboarding(false);
    setCurrentTab('dashboard');
    setCurrentSubAction(undefined);
    setPendingUsersCount(0);
    setPendingPreOrderVerificationsCount(0);
  };

  const SUPERADMIN_ONLY_TABS = new Set(['accounting', 'financials', 'reports', 'audit_logs', 'settings']);
  const isUserSuperAdmin = user?.role === 'superadmin';
  const isUserStaff = user?.role === 'staff';

  const sidebarBadges: SidebarBadgeCounts = useMemo(() => {
    const outOfStockCount = products.filter(
      (p) => !p.archived && (p.stockStatus === 'out_of_stock' || getProductAvailableStock(p) <= 0)
    ).length;
    const archiveCount = products.filter((p) => p.archived).length;
    const pendingProductsCount = products.filter(
      (p) => !p.archived && p.status === 'pending_review'
    ).length;
    const deletionRequestsCount = products.filter(
      (p) => p.deletionStatus === 'pending_approval'
    ).length;
    return {
      outOfStockCount,
      archiveCount,
      pendingProductsCount,
      deletionRequestsCount,
      pendingPreOrderVerificationsCount,
      pendingUsersCount,
    };
  }, [products, pendingPreOrderVerificationsCount, pendingUsersCount]);

  useEffect(() => {
    if (user && !isUserSuperAdmin && SUPERADMIN_ONLY_TABS.has(currentTab)) {
      setCurrentTab('dashboard');
      setCurrentSubAction(undefined);
    }
  }, [user, isUserSuperAdmin, currentTab]);

  // Execute navigation immediately (after any dirty confirmation)
  const performNavigate = (tab: string, subAction?: string, initialId?: string | null) => {
    const resolvedTab = tab === 'due_payments' ? 'receivables' : tab;
    if (SUPERADMIN_ONLY_TABS.has(resolvedTab) && !isUserSuperAdmin) {
      setCurrentTab('dashboard');
      setCurrentSubAction(undefined);
      return;
    }

    const normalizedSub = normalizeDefaultSubAction(resolvedTab, subAction);
    perfSetScreen(resolvedTab);
    setCurrentTab(resolvedTab);
    setCurrentSubAction(normalizedSub);

    if (resolvedTab === 'products') {
      if (subAction === 'add' || subAction === 'create') {
        setInitialProductAddMode(true);
        setProductSubTab('catalog');
      } else {
        setInitialProductAddMode(false);
        const targetSub = (normalizedSub || 'catalog') as ProductSubTab;
        if (targetSub === 'attributes' && isUserStaff) {
          setProductSubTab('catalog');
          setCurrentSubAction('catalog');
        } else if (
          (targetSub === 'pending' || targetSub === 'archive' || targetSub === 'deletion_requests') &&
          !isUserSuperAdmin
        ) {
          setProductSubTab('catalog');
          setCurrentSubAction('catalog');
        } else {
          setProductSubTab(targetSub);
        }
      }
      setInitialProductId(initialId || null);
    } else {
      setInitialProductAddMode(false);
      setInitialProductId(null);
    }

    if (resolvedTab === 'stock') {
      const targetAction =
        normalizedSub === 'in' || normalizedSub === 'out' || normalizedSub === 'adjust' || normalizedSub === 'ledger'
          ? normalizedSub
          : 'ledger';
      setInitialStockAction(targetAction);
      setCurrentSubAction(targetAction);
    } else {
      setInitialStockAction('ledger');
    }

    if (resolvedTab === 'orders') {
      const openCreate = subAction === 'create' || subAction === 'new';
      setInitialOrderCreateMode(openCreate);
      setInitialOrderId(initialId || null);
      setCurrentSubAction(openCreate ? 'create' : 'list');
    } else {
      setInitialOrderCreateMode(false);
      setInitialOrderId(null);
    }

    if (resolvedTab === 'users') {
      const targetUserTab: 'registry' | 'pending' | 'permissions' =
        isUserSuperAdmin && (normalizedSub === 'pending' || normalizedSub === 'permissions')
          ? normalizedSub
          : 'registry';
      setUsersSubTab(targetUserTab);
      setCurrentSubAction(targetUserTab);
    }

    if (resolvedTab === 'accounting') {
      const targetAccTab = normalizedSub || 'overview';
      setAccountingSubTab(targetAccTab);
      setCurrentSubAction(targetAccTab);
    }

    if (resolvedTab === 'financials') {
      const targetFinTab: 'overview' | 'income' | 'expenses' =
        normalizedSub === 'income' || normalizedSub === 'expenses' ? normalizedSub : 'overview';
      setFinancialsSubTab(targetFinTab);
    }

    if (resolvedTab === 'customers') {
      setInitialCustomerId(initialId || null);
    } else {
      setInitialCustomerId(null);
    }

    if (resolvedTab === 'preorder_list') {
      if (initialId) setSelectedPreOrderId(initialId);
    } else {
      setSelectedPreOrderId(null);
      setPreOrderListPreset(null);
    }
  };

  // Safe navigation from quick actions (with unsaved Pre-Order guard)
  const navigateToTab = (tab: string, subAction?: string, initialId?: string | null) => {
    if (currentTab === 'preorder_create' && preOrderCreateDirty && tab !== 'preorder_create') {
      setPendingNavigation({ tab, subAction, initialId });
      return;
    }
    performNavigate(tab, subAction, initialId);
  };

  // Settings prefix & logo updates form
  const [settingsLogoUrl, setSettingsLogoUrl] = useState<string>('');

  useEffect(() => {
    if (companySettings?.logoUrl) {
      setSettingsLogoUrl(companySettings.logoUrl);
    }
  }, [companySettings]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Image file size should be less than 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSettingsLogoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCompanySettings = async (
    e: React.FormEvent, 
    extraData: any
  ) => {
    e.preventDefault();

    if (user?.role !== 'superadmin' && user?.role !== 'super_admin') {
      alert('Access Restricted: Only Super Admin can modify Company and Invoice Settings.');
      return;
    }

    const updated = {
      ...(companySettings || {
        companyName: 'Sky Automation Tech',
        subBrands: ['SAT', 'GZ', 'RTX'],
        onboarded: true
      }),
      ...extraData
    };

    try {
      await saveCompanySettings(updated);
      setCompanySettings(updated);
      alert('Invoice & Company Settings updated successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to save company settings.');
    }
  };

  const handleMigrateBarcodes = async () => {
    if (user?.role !== 'superadmin' && user?.role !== 'super_admin') return;
    setIsMigratingBarcodes(true);
    setMigrationResult(null);
    try {
      const result = await migrateProductBarcodes();
      setMigrationResult(`${result.updated} products updated, ${result.total - result.updated} products already had valid barcodes.`);
      await refreshApplicationData();
    } catch (err) {
      setMigrationResult("Migration failed. Please check logs.");
    } finally {
      setIsMigratingBarcodes(false);
    }
  };

  const [lastExportTime, setLastExportTime] = useState<string>(() => localStorage.getItem('last_backup_time') || 'Never');
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleRunExcelExport = async (typeName: string, loaderFn: () => Promise<any>) => {
    setExportingType(typeName);
    setExportMessage(null);
    try {
      await perfTimeAsync(`Excel Export (${typeName})`, loaderFn);
      const nowStr = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      setLastExportTime(nowStr);
      localStorage.setItem('last_backup_time', nowStr);
      setExportMessage(`Successfully exported ${typeName} to Excel (.xlsx).`);
    } catch (err: any) {
      console.error(`Export failed for ${typeName}:`, err);
      setExportMessage(`Export failed for ${typeName}: ${err.message}`);
    } finally {
      setExportingType(null);
    }
  };

  const generateAndSendClearDataOtp = async () => {
    const targetEmail = user?.email || auth.currentUser?.email || '';
    if (!targetEmail) {
      setClearingDataError('Could not send the code, try again');
      return;
    }
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const code = String(100000 + (arr[0] % 900000));
    setIsSendingClearDataOtp(true);
    setClearingDataError('');
    setClearDataOtpSuccessMsg('');

    try {
      const { sendOTPEmail } = await import('./lib/emailjs');
      const res = await sendOTPEmail(targetEmail, code, user?.name || 'Super Admin');
      if (res.success) {
        setGeneratedClearDataOtp(code);
        setOtpExpiryTime(Date.now() + 5 * 60 * 1000); // 5 mins
        setClearDataOtpAttempts(0);
        setClearDataOtpSuccessMsg(`Security OTP sent to ${targetEmail}`);
        setClearDataOtpCountdown(60);
      } else {
        setGeneratedClearDataOtp(null);
        setOtpExpiryTime(null);
        setClearingDataError('Could not send the code, try again');
      }
    } catch {
      setGeneratedClearDataOtp(null);
      setOtpExpiryTime(null);
      setClearingDataError('Could not send the code, try again');
    } finally {
      setIsSendingClearDataOtp(false);
    }
  };

  const handleClearSampleData = async () => {
    if (user?.role !== 'superadmin' && user?.role !== 'super_admin') return;
    setShowClearDataModal(true);
    setClearDataPassword('');
    setClearDataOtp('');
    setClearDataOtpAttempts(0);
    setClearingDataError('');
    setClearDataOtpSuccessMsg('');
    setShowClearPassword(false);
    await generateAndSendClearDataOtp();
  };

  const executeClearSampleData = async () => {
    if ((user?.role !== 'superadmin' && user?.role !== 'super_admin') || !auth.currentUser) return;
    
    // Step 1: Validate Password
    if (!clearDataPassword.trim()) {
      setClearingDataError('Please enter your Super Admin account password.');
      return;
    }
    
    // Step 2: Validate OTP (5-min expiry, max 5 attempts, single-use)
    const cleanOtp = clearDataOtp.trim().replace(/\s+/g, '');
    if (!cleanOtp) {
      setClearingDataError('Please enter the 6-digit email OTP verification code.');
      return;
    }

    if (cleanOtp.length !== 6) {
      setClearingDataError('OTP must be exactly 6 digits.');
      return;
    }

    if (!generatedClearDataOtp) {
      setClearingDataError('No OTP active. Please click Resend OTP.');
      return;
    }

    if (otpExpiryTime && Date.now() > otpExpiryTime) {
      setGeneratedClearDataOtp(null);
      setOtpExpiryTime(null);
      setClearingDataError('OTP has expired. Please click Resend OTP.');
      return;
    }

    if (clearDataOtpAttempts >= 5) {
      setGeneratedClearDataOtp(null);
      setOtpExpiryTime(null);
      setClearingDataError('Too many invalid OTP attempts. Please click Resend OTP.');
      return;
    }

    if (cleanOtp !== generatedClearDataOtp) {
      const nextAttempts = clearDataOtpAttempts + 1;
      setClearDataOtpAttempts(nextAttempts);
      if (nextAttempts >= 5) {
        setGeneratedClearDataOtp(null);
        setOtpExpiryTime(null);
        setClearingDataError('Too many invalid OTP attempts. Please click Resend OTP.');
      } else {
        setClearingDataError('Invalid OTP code. Please check the code sent to your email.');
      }
      return;
    }

    // Consume OTP immediately (single-use)
    setGeneratedClearDataOtp(null);
    setOtpExpiryTime(null);
    setClearDataOtpAttempts(0);

    // Step 3: Verify Password via Firebase Auth Re-authentication
    setIsClearingData(true);
    setClearingDataError('');

    try {
      const userEmail = auth.currentUser.email || user?.email || '';
      const credential = EmailAuthProvider.credential(userEmail, clearDataPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      // Step 4: Execute Permanent Data Deletion
      setDataLoading(true);
      await clearSampleData();
      await refreshApplicationData();
      
      setShowClearDataModal(false);
      setClearDataPassword('');
      setClearDataOtp('');
      setGeneratedClearDataOtp(null);
      alert('Sample data has been permanently cleared after Dual-Factor (Password + OTP) verification.');
    } catch (error: any) {
      console.warn('Clear data failed:', error.message || error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setClearingDataError('Incorrect password. Please verify your Super Admin password.');
      } else {
        setClearingDataError('Authentication failed: ' + (error.message || 'Unknown error'));
      }
    } finally {
      setIsClearingData(false);
      setDataLoading(false);
    }
  };

  // Action Locking Guard
  const requireCheckIn = () => {
    const today = new Date().toISOString().split('T')[0];
    
    if (user?.currentSessionStatus !== 'checked_in') {
      setShowCheckInModal(true);
      return false;
    }
    
    // Cross-day check: If they are checked in but from a previous day
    if (user?.currentSessionDate && user.currentSessionDate !== today) {
      alert("You have an active session from a previous day. Please Check Out first.");
      setCurrentTab('dashboard'); // Force them to dashboard
      return false;
    }

    return true;
  };

  // Standalone zero-auth Customer Public Tracking Portal (/track/:token)
  if (publicTrackingRoute.isTrackingRoute) {
    return (
      <ErrorBoundary fallbackTitle="Order Tracking Unavailable">
        <Suspense fallback={<FullScreenLoader label="Loading Order Tracking..." />}>
          <PublicTrackingPortal token={publicTrackingRoute.token} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // If public verification requested via QR code scan
  if (isPublicVerification) {
    return (
      <Suspense fallback={<FullScreenLoader label="Verifying Invoice..." />}>
        <PublicInvoiceVerification 
          onDismiss={() => {
            setIsPublicVerification(false);
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('verify_inv');
              url.searchParams.delete('inv');
              url.searchParams.delete('brand');
              url.searchParams.delete('total');
              url.searchParams.delete('due');
              url.searchParams.delete('paid');
              url.searchParams.delete('phone');
              url.searchParams.delete('name');
              url.searchParams.delete('date');
              url.searchParams.delete('order');
              window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
            } catch (e) {}
          }}
        />
      </Suspense>
    );
  }

  if (authChecking) {
    return <FullScreenLoader label="Authenticating Operator Session..." />;
  }

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-center">
        <div className="max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-white">Firebase Configuration Required</h2>
          <p className="text-xs text-slate-400">
            Authentication and database services are not configured for this environment.
          </p>
        </div>
      </div>
    );
  }

  // Auth Guard: Wait until both Firebase Auth user and Firestore profile doc are loaded
  if (!user || !profileLoaded || !firebaseAuthed) {
    return (
      <Suspense fallback={<FullScreenLoader label="Loading Sign-In..." />}>
        <SplashAndAuth
          onAuthSuccess={handleAuthSuccess}
          sessionExpiredMessage={sessionExpiredMessage}
          onDismissSessionExpired={() => setSessionExpiredMessage('')}
        />
      </Suspense>
    );
  }

  // Onboarding Wizard Guard
  if (isOnboarding) {
    return (
      <Suspense fallback={<FullScreenLoader label="Preparing Workspace Setup..." />}>
        <OnboardingWizard onComplete={handleOnboardingComplete} userId={user.id} />
      </Suspense>
    );
  }

  return (
    <ThemeProvider userId={user.id} initialUserPreference={user.themePreference}>
      <ToastProvider>
        <TrackingSyncWarningBridge />
        <div className="h-screen w-full max-w-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col lg:flex-row transition-colors">
          
          {/* Sidebar Navigation */}
          <Suspense fallback={<aside className="hidden lg:block w-64 shrink-0 bg-slate-900" />}>
            <Sidebar 
              currentTab={currentTab} 
              currentSubAction={currentSubAction}
              setCurrentTab={navigateToTab} 
              onNavigate={navigateToTab}
              user={user} 
              rolePermissions={rolePermissions}
              badges={sidebarBadges}
              onLogout={handleLogout}
              isOpen={isSidebarOpen}
              setIsOpen={setIsSidebarOpen}
              companyName={companySettings?.companyName || 'Sky Automation Tech'}
              logoUrl={companySettings?.logoUrl || '/sat_logo.jpg'}
              isCollapsed={isSidebarCollapsed}
              setIsCollapsed={(collapsed) => {
                setIsSidebarCollapsed(collapsed);
                try { localStorage.setItem('sat_sidebar_collapsed', String(collapsed)); } catch {}
              }}
            />
          </Suspense>

          {/* Main Content Workspace */}
          <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 max-w-full bg-slate-50 dark:bg-slate-950">
            
            {/* Sticky Top Header Bar (Laptop & Mobile Glass Header) */}
            <Suspense fallback={<div className="h-16 border-b border-slate-200 dark:border-slate-800" />}>
              <TopBar 
                currentTab={currentTab}
              currentSubAction={currentSubAction}
              onNavigate={navigateToTab}
              user={user}
              rolePermissions={rolePermissions}
              rolePermissionsReady={rolePermissionsLoaded || isUserSuperAdmin}
              products={products}
              companySettings={companySettings}
              onLogout={handleLogout}
              isSidebarCollapsed={isSidebarCollapsed}
              onToggleSidebarCollapse={() => {
                setIsSidebarCollapsed(prev => {
                  const next = !prev;
                  try { localStorage.setItem('sat_sidebar_collapsed', String(next)); } catch {}
                  return next;
                });
              }}
              onOpenMobileSidebar={() => setIsSidebarOpen(true)}
              dataLoading={dataLoading}
            />
            </Suspense>



            {/* Scrollable Main Workspace */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 w-full max-w-full min-w-0">
              <Suspense fallback={<RouteSkeleton />}>
          
          {isQuotaExceeded && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
              <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                Firestore read quota notice detected. Cached session data is active where available.
              </p>
              <button
                type="button"
                onClick={() => setIsQuotaExceeded(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading Indicator - Desktop Only */}
          {dataLoading && (
            <div className="hidden lg:flex fixed top-4 right-4 bg-slate-900 border border-amber-400/20 text-white font-mono text-sm px-3 py-1.5 rounded-lg items-center gap-2 shadow-lg z-50">
              <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping" />
              SYNCHRONIZING RECONCILIATIONS...
            </div>
          )}

        {/* Tab 1: Dashboard View */}
        {currentTab === 'dashboard' && (
          <DashboardView 
            products={products} 
            user={user} 
            onNavigateToTab={navigateToTab} 
            onUserUpdate={refreshUserProfile}
          />
        )}

        {/* Tab 2: Product Management View */}
        {currentTab === 'products' && (
          <ErrorBoundary fallbackTitle="Product Management encountered an issue">
            <ProductManagement 
              products={products} 
              categories={categories} 
              brands={brands} 
              productColors={productColors}
              productModels={productModels}
              user={user} 
              onRefreshData={refreshApplicationData}
              initialAddMode={initialProductAddMode}
              initialSubTab={productSubTab}
              onSubTabChange={(subTab) => {
                setProductSubTab(subTab);
                setCurrentSubAction(subTab);
              }}
              requireCheckIn={requireCheckIn}
              initialProductId={initialProductId}
              clearInitialProductId={() => setInitialProductId(null)}
              onNavigateToStock={(productId) => {
                setInitialStockAction('in');
                setInitialStockProductId(productId);
                setCurrentTab('stock');
                setCurrentSubAction('in');
              }}
            />
          </ErrorBoundary>
        )}

        {/* Tab 3: Stock Operations View */}
        {currentTab === 'stock' && (
          <ErrorBoundary fallbackTitle="Stock Operations encountered an issue">
            <StockOperations 
              products={products.filter(p => !p.archived)} 
              user={user} 
              onRefreshData={refreshApplicationData}
              initialAction={initialStockAction}
              onActionChange={(act) => {
                setInitialStockAction(act);
                setCurrentSubAction(act);
              }}
              requireCheckIn={requireCheckIn}
              initialProductId={initialStockProductId}
            />
          </ErrorBoundary>
        )}

        {/* Tab 2b: Pre-Order Management Routes */}
        {currentTab === 'preorder_overview' && (
          <ErrorBoundary fallbackTitle="Pre-Order Overview encountered an issue">
            <PreOrderOverviewView
              user={user}
              rolePermissions={rolePermissions}
              onNavigate={navigateToTab}
              onOpenPreOrderList={(preset) => {
                setPreOrderListPreset(preset);
                performNavigate('preorder_list');
              }}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_create' && (
          <ErrorBoundary fallbackTitle="Create Pre-Order encountered an issue">
            <CreatePreOrderView
              user={user}
              rolePermissions={rolePermissions}
              products={products}
              categories={categories}
              companySettings={companySettings}
              onDirtyChange={setPreOrderCreateDirty}
              onCancel={() => {
                setPreOrderCreateDirty(false);
                performNavigate('preorder_list');
              }}
              onCreated={(result) => {
                setPreOrderCreateDirty(false);
                performNavigate('preorder_list', undefined, result.id);
              }}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_list' && (
          <ErrorBoundary fallbackTitle="All Pre-Orders encountered an issue">
            <AllPreOrdersView
              user={user}
              rolePermissions={rolePermissions}
              categories={categories}
              brands={brands}
              products={products}
              companySettings={companySettings}
              onCreateNew={() => navigateToTab('preorder_create')}
              onNavigate={navigateToTab}
              initialSelectedPreOrderId={selectedPreOrderId}
              onClearInitialSelected={() => setSelectedPreOrderId(null)}
              initialFilter={preOrderListPreset}
              onClearInitialFilter={() => setPreOrderListPreset(null)}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_payments' && (
          <ErrorBoundary fallbackTitle="Pre-Order Payment Management encountered an issue">
            <PaymentManagementView
              user={user}
              rolePermissions={rolePermissions}
              categories={categories}
              brands={brands}
              products={products}
              companySettings={companySettings}
              onNavigate={navigateToTab}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_suppliers' && (
          <ErrorBoundary fallbackTitle="Pre-Order Supplier Management encountered an issue">
            <PreOrderSupplierManagementView
              user={user}
              rolePermissions={rolePermissions}
              categories={categories}
              companySettings={companySettings}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_tracking' && (
          <ErrorBoundary fallbackTitle="Pre-Order Shipment Tracking encountered an issue">
            <ShipmentTrackingView
              user={user}
              rolePermissions={rolePermissions}
              categories={categories}
              companySettings={companySettings}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_links' && (
          <ErrorBoundary fallbackTitle="Customer Tracking Links encountered an issue">
            <CustomerTrackingLinksView
              user={user}
              rolePermissions={rolePermissions}
              categories={categories}
              companySettings={companySettings}
              onNavigateSettings={isUserSuperAdmin ? () => navigateToTab('settings') : undefined}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_reminders' && (
          <ErrorBoundary fallbackTitle="Notifications & Reminders Center encountered an issue">
            <RemindersCenterView
              user={user}
              rolePermissions={rolePermissions}
              companySettings={companySettings}
              onNavigate={navigateToTab}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_reports' && (
          <ErrorBoundary fallbackTitle="Pre-Order Reports encountered an issue">
            <PreOrderReportsView
              user={user}
              rolePermissions={rolePermissions}
              onNavigate={navigateToTab}
            />
          </ErrorBoundary>
        )}

        {currentTab === 'preorder_help' && (
          <ErrorBoundary fallbackTitle="Pre-Order Quick Guide encountered an issue">
            <PreOrderHelpView
              user={user}
              rolePermissions={rolePermissions}
              onNavigate={navigateToTab}
            />
          </ErrorBoundary>
        )}

        {/* Tab 4: User Management View */}
        {currentTab === 'users' && (
          <ErrorBoundary fallbackTitle="User Management encountered an issue">
            <UserManagement
              user={user}
              rolePermissions={rolePermissions}
              onRolePermissionsUpdated={(updated) => setRolePermissions(updated)}
              initialTab={usersSubTab}
              onTabChange={(tab) => {
                setUsersSubTab(tab);
                setCurrentSubAction(tab);
              }}
            />
          </ErrorBoundary>
        )}

        {/* Tab Customers: Customer Directory View */}
        {currentTab === 'customers' && (
          <ErrorBoundary fallbackTitle="Customer Directory encountered an issue">
            <CustomerManagement 
              user={user} 
              requireCheckIn={requireCheckIn} 
              initialCustomerId={initialCustomerId}
              clearInitialCustomerId={() => setInitialCustomerId(null)}
              onOpenPreOrder={(preOrderId) => navigateToTab('preorder_list', 'detail', preOrderId)}
            />
          </ErrorBoundary>
        )}

        {/* Tab Orders: Order Desk View */}
        {currentTab === 'orders' && (
          <ErrorBoundary fallbackTitle="Order Desk encountered an issue">
            <OrderManagement 
              user={user} 
              requireCheckIn={requireCheckIn} 
              initialOrderId={initialOrderId}
              clearInitialOrderId={() => setInitialOrderId(null)}
              initialCreateMode={initialOrderCreateMode}
              clearInitialCreateMode={() => setInitialOrderCreateMode(false)}
              onCreateModeChange={(isOpen) => {
                if (currentTab === 'orders') {
                  setCurrentSubAction(isOpen ? 'create' : 'list');
                }
              }}
            />
          </ErrorBoundary>
        )}

        {/* Tab Invoices: Invoice Desk View */}
        {currentTab === 'invoices' && (
          <ErrorBoundary fallbackTitle="Invoice Desk encountered an issue">
            <InvoiceManagement user={user} requireCheckIn={requireCheckIn} />
          </ErrorBoundary>
        )}

        {/* Tab Receivables: Due Payments View */}
        {currentTab === 'receivables' && (
          <ErrorBoundary fallbackTitle="Due Payments encountered an issue">
            <DuePayments user={user} requireCheckIn={requireCheckIn} />
          </ErrorBoundary>
        )}

        {/* Tab Financials: Income & Expense Financial Overview View (Super Admin Only) */}
        {currentTab === 'financials' && (
          isUserSuperAdmin ? (
            <FinancialOverview 
              user={user} 
              products={products} 
              onRefreshData={refreshApplicationData} 
              initialTab={financialsSubTab}
              onTabChange={(tab) => {
                setFinancialsSubTab(tab);
                setCurrentSubAction(tab);
              }}
            />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-sm">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-base font-extrabold text-red-800 uppercase tracking-tight">Access Restricted</h2>
              <p className="text-sm text-red-600 leading-relaxed">
                This module is restricted to Super Admin only. Your current role is not authorized to access this area.
              </p>
            </div>
          )
        )}

        {/* Tab Accounting: Zero-Setup Plain Minimal Accounting Desk (Super Admin Only) */}
        {currentTab === 'accounting' && (
          isUserSuperAdmin ? (
            <ErrorBoundary fallbackTitle="Accounting Desk encountered an issue">
              <AccountingDesk 
                user={user} 
                initialTab={accountingSubTab}
                onTabChange={(tab) => {
                  setAccountingSubTab(tab);
                  setCurrentSubAction(tab);
                }}
              />
            </ErrorBoundary>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-sm">
              <h2 className="text-base font-extrabold text-red-800 uppercase tracking-tight">Access Restricted</h2>
              <p className="text-sm text-red-600 leading-relaxed">
                Accounting Desk is restricted to Super Admin only.
              </p>
            </div>
          )
        )}

        {/* Tab Profile: Profile Settings */}
        {currentTab === 'profile' && (
          <ErrorBoundary fallbackTitle="Profile Settings encountered an issue">
            <ProfileSettingsView user={user} onRefreshUser={refreshUserProfile} />
          </ErrorBoundary>
        )}

        {/* Tab Attendance: Attendance Log View */}
        {currentTab === 'attendance' && (
          <AttendanceLog user={user} />
        )}

        {/* Tab Suppliers: Supplier Management View */}
        {currentTab === 'suppliers' && (
          <SupplierManagement user={user} rolePermissions={rolePermissions || {}} />
        )}

        {/* Tab Reports: Reports & Analytics View (Super Admin Only) */}
        {currentTab === 'reports' && (
          isUserSuperAdmin ? (
            <ReportsAnalytics user={user} />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-sm">
              <h2 className="text-base font-extrabold text-red-800 uppercase tracking-tight">Access Restricted</h2>
              <p className="text-sm text-red-600 leading-relaxed">
                Reports &amp; Analytics is restricted to Super Admin only.
              </p>
            </div>
          )
        )}

        {/* Tab Audit Logs: Audit Log View (Super Admin Only) */}
        {currentTab === 'audit_logs' && (
          isUserSuperAdmin ? (
            <AuditLogView user={user} />
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-sm">
              <h2 className="text-base font-extrabold text-red-800 uppercase tracking-tight">Access Restricted</h2>
              <p className="text-sm text-red-600 leading-relaxed">
                Audit Logs is restricted to Super Admin only.
              </p>
            </div>
          )
        )}

        {/* Tab 5: Settings View (Super Admin Only) */}
        {currentTab === 'settings' && (
          isUserSuperAdmin ? (
          <div className="space-y-6">
            <ErrorBoundary fallbackTitle="Company Settings encountered an issue">
              <CompanySettingsView
                user={user}
                companySettings={companySettings}
                onSave={async (updatedFields) => {
                  const updated = {
                    ...(companySettings || {
                      companyName: 'Sky Automation Tech',
                      subBrands: ['SAT', 'GZ', 'RTX'],
                      onboarded: true
                    }),
                    ...updatedFields
                  };
                  await saveCompanySettings(updated as CompanySettings);
                  setCompanySettings(updated as CompanySettings);
                }}
                requireCheckIn={requireCheckIn}
              />
            </ErrorBoundary>

            <div className="bg-amber-50/40 p-4 border border-amber-200/40 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-amber-800">Sandbox Database Info</h3>
              <p className="text-sm text-amber-700 leading-relaxed">
                Database connected: <span className="font-mono bg-amber-400/10 px-1 rounded">Firestore ({companySettings?.companyName})</span>. 
                In case of offline use or missing rules, the app gracefully activates localized fallback sandbox state so your operators never experience any operational friction.
              </p>
            </div>

            {(user?.role === 'superadmin' || user?.role === 'super_admin') && (
              <div className="pt-6 border-t border-slate-100 flex flex-col gap-6">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Data Backup & Excel Export</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Download individual or combined Excel (.xlsx) spreadsheets with clean column headers and formatted dates. Last exported: <span className="font-semibold text-slate-700">{lastExportTime}</span>
                      </p>
                      {exportMessage && <p className={`text-xs font-bold mt-2 ${exportMessage.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>{exportMessage}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('All Collections (Multi-Sheet)', async () => (await import('./utils/excelExport')).exportEverythingWorkbook())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 shrink-0 shadow-xs flex items-center gap-2"
                    >
                      {exportingType === 'All Collections (Multi-Sheet)' ? 'Exporting Everything...' : 'Export Everything (.xlsx)'}
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Products (CSV)', async () => (await import('./utils/excelExport')).exportProductsToCSV())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between shadow-2xs"
                    >
                      <span>Export Products (.csv)</span>
                      {exportingType === 'Products (CSV)' ? <span className="animate-spin text-emerald-600">⏳</span> : <span className="text-[10px] font-mono bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-800">CSV</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Brands (CSV)', async () => (await import('./utils/excelExport')).exportBrandsToCSV())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between shadow-2xs"
                    >
                      <span>Export Brands (.csv)</span>
                      {exportingType === 'Brands (CSV)' ? <span className="animate-spin text-emerald-600">⏳</span> : <span className="text-[10px] font-mono bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-800">CSV</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Products', async () => (await import('./utils/excelExport')).exportProductsToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Products (.xlsx)</span>
                      {exportingType === 'Products' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Orders', async () => (await import('./utils/excelExport')).exportOrdersToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Orders (.xlsx)</span>
                      {exportingType === 'Orders' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Invoices', async () => (await import('./utils/excelExport')).exportInvoicesToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Invoices (.xlsx)</span>
                      {exportingType === 'Invoices' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Customers', async () => (await import('./utils/excelExport')).exportCustomersToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Customers (.xlsx)</span>
                      {exportingType === 'Customers' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Suppliers', async () => (await import('./utils/excelExport')).exportSuppliersToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Suppliers (.xlsx)</span>
                      {exportingType === 'Suppliers' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Stock Logs', async () => (await import('./utils/excelExport')).exportStockLogsToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Stock Logs (.xlsx)</span>
                      {exportingType === 'Stock Logs' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Expenses', async () => (await import('./utils/excelExport')).exportExpensesToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Expenses (.xlsx)</span>
                      {exportingType === 'Expenses' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Categories & Brands', async () => (await import('./utils/excelExport')).exportCategoriesBrandsToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Categories & Brands</span>
                      {exportingType === 'Categories & Brands' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Users & Staff', async () => (await import('./utils/excelExport')).exportUsersToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Users/Staff (.xlsx)</span>
                      {exportingType === 'Users & Staff' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Attendance', async () => (await import('./utils/excelExport')).exportAttendanceToExcel())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Attendance (.xlsx)</span>
                      {exportingType === 'Attendance' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Migrate Legacy Invoices</h3>
                    <p className="text-sm text-slate-500 mt-1">Ensure all older invoices have required fields (generatedAt, voided, etc.) so they appear in the Invoice List.</p>
                    {invoiceMigrationResult && <p className="text-sm font-bold text-emerald-600 mt-2">{invoiceMigrationResult}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={handleMigrateInvoices}
                    disabled={isMigratingInvoices}
                    className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isMigratingInvoices ? 'Migrating Invoices...' : 'Migrate Invoices'}
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Assign Sequential Customer IDs (CUS-0001)</h3>
                    <p className="text-sm text-slate-500 mt-1">Generate and assign unique 4-digit sequential Customer IDs to any existing customers missing an ID.</p>
                    {customerIdMigrationResult && <p className="text-sm font-bold text-emerald-600 mt-2">{customerIdMigrationResult}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={handleMigrateCustomerIds}
                    disabled={isMigratingCustomerIds}
                    className="py-2 px-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isMigratingCustomerIds ? 'Assigning IDs...' : 'Migrate Customer IDs'}
                  </button>
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Migrate Legacy Barcodes</h3>
                    <p className="text-sm text-slate-500 mt-1">Convert old random barcodes to the new structured format (e.g., SAT-A1B2).</p>
                    {migrationResult && <p className="text-sm font-bold text-emerald-600 mt-2">{migrationResult}</p>}
                    {migrationResult && <p className="text-sm font-bold text-amber-600 mt-1">IMPORTANT: Please reprint all old labels to match the new format!</p>}
                  </div>
                  <button
                    type="button"
                    onClick={handleMigrateBarcodes}
                    disabled={isMigratingBarcodes}
                    className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    {isMigratingBarcodes ? 'Migrating...' : 'Run Migration'}
                  </button>
                </div>

                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-sm font-bold text-red-600">Danger Zone</h3>
                    <p className="text-sm text-slate-500">Permanently delete all products, categories, brands, and stock logs.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearSampleData}
                    className="py-2 px-4 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold text-sm rounded-xl cursor-pointer"
                  >
                    Clear Sample Data
                  </button>
                </div>
              </div>
            )}
          </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-3xl p-8 max-w-lg mx-auto text-center space-y-4 my-12 shadow-sm">
              <h2 className="text-base font-extrabold text-red-800 uppercase tracking-tight">Access Restricted</h2>
              <p className="text-sm text-red-600 leading-relaxed">
                Company Settings is restricted to Super Admin only.
              </p>
            </div>
          )
        )}



              </Suspense>
      </main>

      {/* Check In Guard Modal */}
      {showCheckInModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-8 text-center border border-slate-100">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Check In Required</h3>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              You must Check In before performing this action. This helps us accurately log stock updates and work sessions.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowCheckInModal(false);
                  setCurrentTab('dashboard'); // take them to dashboard to check in
                }}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Go to Dashboard to Check In
              </button>
              <button
                onClick={() => setShowCheckInModal(false)}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold py-3.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Dual-Factor Confirmation Modal (Password + OTP Protected) */}
      {showClearDataModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0 border border-red-200">
                  <ShieldAlert size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-bold bg-red-50 text-red-600 border border-red-200 px-1.5 py-0.2 rounded uppercase">
                      Dual-Factor Security
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">Danger Zone: Wipe Sample Data</h3>
                </div>
              </div>
              <button 
                onClick={() => {
                  setShowClearDataModal(false);
                  setClearDataPassword('');
                  setClearDataOtp('');
                  setClearingDataError('');
                }}
                disabled={isClearingData}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3.5 space-y-4">
              <div className="bg-red-50/70 border border-red-200/80 rounded-xl p-3 text-xs text-red-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-red-600 shrink-0" />
                  Irreversible System Action
                </p>
                <p className="text-[11px] leading-relaxed text-red-700">
                  This will permanently wipe all products, categories, brands, orders, invoices, and stock logs. Requires both <strong>Super Admin Password</strong> and <strong>Email OTP Verification</strong>.
                </p>
              </div>

              {/* Step 1: Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Key size={13} className="text-amber-500" />
                    <span>1. Super Admin Password</span>
                  </label>
                </div>
                <div className="relative">
                  <input 
                    type={showClearPassword ? "text" : "password"}
                    value={clearDataPassword}
                    onChange={(e) => setClearDataPassword(e.target.value)}
                    disabled={isClearingData}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-3 pr-9 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-red-500 font-mono"
                    placeholder="Enter account password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClearPassword(!showClearPassword)}
                    className="absolute top-2 right-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showClearPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Step 2: 6-Digit Email OTP Verification */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Mail size={13} className="text-amber-500" />
                    <span>2. Email OTP Code</span>
                  </label>
                  <button
                    type="button"
                    onClick={generateAndSendClearDataOtp}
                    disabled={clearDataOtpCountdown > 0 || isSendingClearDataOtp || isClearingData}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    {isSendingClearDataOtp ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      <Send size={11} />
                    )}
                    <span>
                      {clearDataOtpCountdown > 0 
                        ? `Resend in ${clearDataOtpCountdown}s` 
                        : isSendingClearDataOtp ? 'Sending...' : 'Resend OTP'}
                    </span>
                  </button>
                </div>

                <div className="relative">
                  <input 
                    type="text" 
                    maxLength={6}
                    value={clearDataOtp}
                    onChange={(e) => setClearDataOtp(e.target.value.replace(/\D/g, ''))}
                    disabled={isClearingData}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-center text-sm font-mono font-bold tracking-widest text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-red-500"
                    placeholder="6-Digit OTP"
                  />
                </div>

                {clearDataOtpSuccessMsg && (
                  <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-1">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    <span>{clearDataOtpSuccessMsg}</span>
                  </p>
                )}
                <p className="text-[10px] text-slate-400">
                  Verification OTP has been dispatched to: <span className="font-mono font-bold text-slate-600">{user?.email || auth.currentUser?.email}</span>
                </p>
              </div>

              {/* Error Message */}
              {clearingDataError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <span>{clearingDataError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowClearDataModal(false);
                    setClearDataPassword('');
                    setClearDataOtp('');
                    setClearingDataError('');
                  }}
                  disabled={isClearingData}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeClearSampleData}
                  disabled={isClearingData || !clearDataPassword || clearDataOtp.length !== 6}
                  className="flex-1 py-2 px-3 bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {isClearingData ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Verifying & Wiping...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={13} />
                      <span>Verify & Wipe Data</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Offline Connectivity Indicator */}
      <OfflineIndicator />

      {/* First-Run Welcome Tour Overlay for Approved Employees */}
      {showWelcomeTour && user && (
        <Suspense fallback={null}>
          <WelcomeTour
            userName={user.name}
            onClose={() => setShowWelcomeTour(false)}
          />
        </Suspense>
      )}

      {/* Unsaved Pre-Order Navigation Guard */}
      <ConfirmDialog
        isOpen={Boolean(pendingNavigation)}
        onClose={() => setPendingNavigation(null)}
        onConfirm={() => {
          const target = pendingNavigation;
          setPendingNavigation(null);
          setPreOrderCreateDirty(false);
          if (target) {
            performNavigate(target.tab, target.subAction, target.initialId);
          }
        }}
        title="Leave without saving Pre-Order?"
        message="You have unsaved customer or product details in your Pre-Order draft. Navigating away will discard them."
        confirmLabel="Discard & Leave"
        cancelLabel="Stay Here"
        variant="warning"
      />
      </div>
    </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
