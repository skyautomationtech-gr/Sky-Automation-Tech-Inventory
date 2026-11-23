import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase/config';
import { 
  getUserProfile, 
  findUserProfileByEmail,
  createUserProfile,
  initializeUser,
  getCompanySettings, 
  getProducts, 
  getCategories, 
  getBrands,
  getProductColors,
  getProductModels,
  subscribeToProducts,
  subscribeToCategories,
  subscribeToBrands,
  subscribeToProductColors,
  subscribeToProductModels,
  saveCompanySettings,
  promoteUserToSuperAdmin,
  clearSampleData,
  seedInitialDataIfEmpty,
  syncProductStockStatuses,
  migrateProductBarcodes,
  migrateExistingCustomerIds,
  migrateExistingInvoices,
  exportAllData,
  localStore,
  dbCache
} from './firebase/db';
import {
  exportProductsToCSV,
  exportBrandsToCSV,
  exportProductsToExcel,
  exportOrdersToExcel,
  exportInvoicesToExcel,
  exportCustomersToExcel,
  exportSuppliersToExcel,
  exportStockLogsToExcel,
  exportExpensesToExcel,
  exportCategoriesBrandsToExcel,
  exportUsersToExcel,
  exportAttendanceToExcel,
  exportEverythingWorkbook
} from './utils/excelExport';
import { UserProfile, Product, Category, Brand, CompanySettings, ProductColor, ProductModel, RolePermissionsMap } from './types';
import { getRolePermissions } from './firebase/preOrderDb';
import { isPreOrderTab } from './preOrders/constants';
import { EMAILJS_CONFIG } from './config/emailjs';
import { sendOTPEmail } from './lib/emailjs';
import { 
  Menu, 
  AlertTriangle, 
  Sparkles, 
  RefreshCw, 
  ShieldAlert, 
  Key, 
  Mail, 
  Eye, 
  EyeOff, 
  Lock, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle,
  Trash2,
  Send,
  X
} from 'lucide-react';

// Import Modular Components
import SplashAndAuth from './components/SplashAndAuth';
import OnboardingWizard from './components/OnboardingWizard';
import Sidebar from './components/Sidebar';
import DashboardView from './components/DashboardView';
import ProductManagement from './components/ProductManagement';
import StockOperations from './components/StockOperations';
import UserManagement from './components/UserManagement';
import AttendanceLog from './components/AttendanceLog';
import CustomerManagement from './components/CustomerManagement';
import OrderManagement from './components/OrderManagement';
import InvoiceManagement from './components/InvoiceManagement';
import DuePayments from './components/DuePayments';
import FinancialOverview from './components/FinancialOverview';
import { AccountingDesk } from './components/Accounting';
import SupplierManagement from './components/SupplierManagement';
import ReportsAnalytics from './components/ReportsAnalytics';
import { AuditLogView } from './components/AuditLogView';
import CompanySettingsView from './components/CompanySettingsView';
import ProfileSettingsView from './components/ProfileSettingsView';
import PreOrderOverviewView from './components/PreOrders/PreOrderOverviewView';
import CreatePreOrderView from './components/PreOrders/CreatePreOrderView';
import AllPreOrdersView from './components/PreOrders/AllPreOrdersView';
import PaymentManagementView from './components/PreOrders/PaymentManagementView';
import PreOrderSupplierManagementView from './components/PreOrders/PreOrderSupplierManagementView';
import ShipmentTrackingView from './components/PreOrders/ShipmentTrackingView';
import CustomerTrackingLinksView from './components/PreOrders/CustomerTrackingLinksView';
import RemindersCenterView from './components/PreOrders/RemindersCenterView';
import PreOrderReportsView from './components/PreOrders/PreOrderReportsView';
import PreOrderHelpView from './components/PreOrders/PreOrderHelpView';
import PublicTrackingPortal from './components/PreOrders/PublicTrackingPortal';
import NotificationCenter from './components/NotificationCenter';
import { PublicInvoiceVerification } from './components/PublicInvoiceVerification';
import ErrorBoundary from './components/ErrorBoundary';
import { OfflineIndicator } from './components/OfflineIndicator';
import { LiveClockWidget } from './components/LiveClockWidget';
import { TopBar } from './components/TopBar';
import { Breadcrumbs } from './components/Breadcrumbs';
import { WelcomeTour } from './components/WelcomeTour';
import { ThemeProvider, ToastProvider, ThemeToggle, ConfirmDialog } from './design-system';

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
  
  // App structure states
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
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

  // Applet Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap | null>(null);
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

  // Sub-action passing (e.g., automatically opening add product drawer)
  const [initialProductAddMode, setInitialProductAddMode] = useState(false);
  const [initialStockAction, setInitialStockAction] = useState('in');
  const [initialStockProductId, setInitialStockProductId] = useState('');

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

    console.log('App: Setting up onAuthStateChanged listener...');

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('App: onAuthStateChanged triggered. User:', firebaseUser ? firebaseUser.uid : 'null');
      if (!isMounted) return;

      try {
        if (firebaseUser) {
          setFirebaseAuthed(true);
          setAuthReady(true);

          // Fetch real Firestore user profile first (never restore session from cache alone)
          console.log('App: Fetching user profile for UID:', firebaseUser.uid);
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
            console.log('App: Profile not found by UID, searching by email:', firebaseUser.email);
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
            console.log('App: User signed in to Firebase Auth, awaiting OTP verification in SplashAndAuth...');
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

          console.log('App: User session established:', profile.email, `[${profile.role}]`);
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

          // Check onboarding only after real Firebase Auth + loaded profile
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
      getRolePermissions()
        .then((perms) => setRolePermissions(perms))
        .catch(() => {});

      // Note: Subscriptions immediately return the cached or latest snapshot,
      // so we avoid an extra redundant batch of getDocs calls on mount.
      const unsubProducts = subscribeToProducts((prods) => {
        if (prods) setProducts(prods);
      }, true);

      const unsubCategories = subscribeToCategories((cats) => {
        if (cats) setCategories(cats);
      });

      const unsubBrands = subscribeToBrands((brs) => {
        if (brs) setBrands(brs);
      });

      const unsubColors = subscribeToProductColors((cls) => {
        if (cls) setProductColors(cls);
      });

      const unsubModels = subscribeToProductModels((mds) => {
        if (mds) setProductModels(mds);
      });

      return () => {
        unsubProducts();
        unsubCategories();
        unsubBrands();
        unsubColors();
        unsubModels();
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
      
      // Track login only when Firebase Auth session is active
      if (auth?.currentUser) {
        import('./firebase/db').then(({ addLoginHistory }) => {
          addLoginHistory(effectiveProfile.id, {
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            status: 'success'
          }).catch(() => {});
        });
      }
    } catch (e) {}
    setSessionExpiredMessage('');
    setFirebaseAuthed(Boolean(auth?.currentUser));
    setProfileLoaded(true);
    setAuthReady(true);
    setUser(effectiveProfile);

    try {
      const settings = await getCompanySettings();
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
    setCompanySettings(null);
    setIsOnboarding(false);
    setCurrentTab('dashboard');
  };

  // Execute navigation immediately (after any dirty confirmation)
  const performNavigate = (tab: string, subAction?: string, initialId?: string | null) => {
    setCurrentTab(tab);
    if (tab === 'products') {
      if (subAction === 'add') {
        setInitialProductAddMode(true);
      } else {
        setInitialProductAddMode(false);
      }
      setInitialProductId(initialId || null);
    } else {
      setInitialProductAddMode(false);
      setInitialProductId(null);
    }

    if (tab === 'stock') {
      if (subAction === 'in') {
        setInitialStockAction('in');
      } else {
        setInitialStockAction('ledger');
      }
    } else {
      setInitialStockAction('ledger');
    }

    if (tab === 'orders') {
      setInitialOrderId(initialId || null);
    } else {
      setInitialOrderId(null);
    }

    if (tab === 'customers') {
      setInitialCustomerId(initialId || null);
    } else {
      setInitialCustomerId(null);
    }

    if (tab === 'preorder_list') {
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

  const handleRunExcelExport = async (typeName: string, exportFn: () => Promise<void>) => {
    setExportingType(typeName);
    setExportMessage(null);
    try {
      await exportFn();
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
        <PublicTrackingPortal token={publicTrackingRoute.token} />
      </ErrorBoundary>
    );
  }

  // If public verification requested via QR code scan
  if (isPublicVerification) {
    return (
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
    );
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-mono text-slate-400 uppercase tracking-widest">
          Authenticating Operator Session...
        </p>
      </div>
    );
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
      <SplashAndAuth
        onAuthSuccess={handleAuthSuccess}
        sessionExpiredMessage={sessionExpiredMessage}
        onDismissSessionExpired={() => setSessionExpiredMessage('')}
      />
    );
  }

  // Onboarding Wizard Guard
  if (isOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} userId={user.id} />;
  }

  return (
    <ThemeProvider userId={user.id} initialUserPreference={user.themePreference}>
      <ToastProvider>
        <div className="h-screen w-full max-w-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col lg:flex-row overflow-hidden transition-colors">
          
          {/* Sidebar Navigation */}
          <Sidebar 
            currentTab={currentTab} 
            setCurrentTab={navigateToTab} 
            onNavigate={navigateToTab}
            user={user} 
            rolePermissions={rolePermissions}
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

          {/* Main Content Workspace */}
          <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 max-w-full overflow-hidden bg-slate-50 dark:bg-slate-950">
            
            {/* Sticky Top Header Bar (Laptop & Mobile Glass Header) */}
            <TopBar 
              currentTab={currentTab}
              onNavigate={navigateToTab}
              user={user}
              rolePermissions={rolePermissions}
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



            {/* Scrollable Main Workspace */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 w-full max-w-full min-w-0">
          
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
              requireCheckIn={requireCheckIn}
              initialProductId={initialProductId}
              clearInitialProductId={() => setInitialProductId(null)}
              onNavigateToStock={(productId) => {
                setInitialStockAction('in');
                setInitialStockProductId(productId);
                setCurrentTab('stock');
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
              onNavigateSettings={() => navigateToTab('settings')}
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

        {/* Tab Financials: Income & Expense Financial Overview View */}
        {currentTab === 'financials' && (
          (user.role === 'superadmin' || user.role === 'admin' || user.role === 'manager') ? (
            <FinancialOverview 
              user={user} 
              products={products} 
              onRefreshData={refreshApplicationData} 
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
                The Income & Expense financial control panel is reserved for authorized administrative roles. Your current role is not authorized to access this ledger.
              </p>
            </div>
          )
        )}

        {/* Tab Accounting: Zero-Setup Plain Minimal Accounting Desk */}
        {currentTab === 'accounting' && (
          <ErrorBoundary fallbackTitle="Accounting Desk encountered an issue">
            <AccountingDesk user={user} />
          </ErrorBoundary>
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

        {/* Tab Reports: Reports & Analytics View */}
        {currentTab === 'reports' && (
          <ReportsAnalytics user={user} />
        )}

        {/* Tab Audit Logs: Audit Log View */}
        {currentTab === 'audit_logs' && (
          <AuditLogView user={user} />
        )}

        {/* Tab 5: Settings View */}
        {currentTab === 'settings' && (
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
                      onClick={() => handleRunExcelExport('All Collections (Multi-Sheet)', exportEverythingWorkbook)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-5 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 shrink-0 shadow-xs flex items-center gap-2"
                    >
                      {exportingType === 'All Collections (Multi-Sheet)' ? 'Exporting Everything...' : 'Export Everything (.xlsx)'}
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Products (CSV)', () => exportProductsToCSV())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between shadow-2xs"
                    >
                      <span>Export Products (.csv)</span>
                      {exportingType === 'Products (CSV)' ? <span className="animate-spin text-emerald-600">⏳</span> : <span className="text-[10px] font-mono bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-800">CSV</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Brands (CSV)', () => exportBrandsToCSV())}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-900 font-bold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between shadow-2xs"
                    >
                      <span>Export Brands (.csv)</span>
                      {exportingType === 'Brands (CSV)' ? <span className="animate-spin text-emerald-600">⏳</span> : <span className="text-[10px] font-mono bg-emerald-200/60 px-1.5 py-0.5 rounded text-emerald-800">CSV</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Products', exportProductsToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Products (.xlsx)</span>
                      {exportingType === 'Products' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Orders', exportOrdersToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Orders (.xlsx)</span>
                      {exportingType === 'Orders' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Invoices', exportInvoicesToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Invoices (.xlsx)</span>
                      {exportingType === 'Invoices' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Customers', exportCustomersToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Customers (.xlsx)</span>
                      {exportingType === 'Customers' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Suppliers', exportSuppliersToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Suppliers (.xlsx)</span>
                      {exportingType === 'Suppliers' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Stock Logs', exportStockLogsToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Stock Logs (.xlsx)</span>
                      {exportingType === 'Stock Logs' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Expenses', exportExpensesToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Expenses (.xlsx)</span>
                      {exportingType === 'Expenses' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Categories & Brands', exportCategoriesBrandsToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Categories & Brands</span>
                      {exportingType === 'Categories & Brands' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Users & Staff', exportUsersToExcel)}
                      disabled={exportingType !== null}
                      className="py-2.5 px-4 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50 text-left transition-colors flex items-center justify-between"
                    >
                      <span>Export Users/Staff (.xlsx)</span>
                      {exportingType === 'Users & Staff' && <span className="animate-spin text-amber-500">⏳</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRunExcelExport('Attendance', exportAttendanceToExcel)}
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
        )}



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
        <WelcomeTour
          userName={user.name}
          onClose={() => setShowWelcomeTour(false)}
        />
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
