import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { auth } from './firebase/config';
import { 
  getUserProfile, 
  initializeUser,
  getCompanySettings, 
  getProducts, 
  getCategories, 
  getBrands,
  getProductColors,
  getProductModels,
  saveCompanySettings,
  promoteUserToSuperAdmin,
  clearSampleData,
  seedInitialDataIfEmpty,
  syncProductStockStatuses,
  migrateProductBarcodes,
  migrateExistingCustomerIds,
  exportAllData
} from './firebase/db';
import { UserProfile, Product, Category, Brand, CompanySettings, ProductColor, ProductModel } from './types';
import { Menu, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';

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
import SupplierManagement from './components/SupplierManagement';
import ReportsAnalytics from './components/ReportsAnalytics';
import NotificationCenter from './components/NotificationCenter';

// Mock/Fallback Data in case of Firestore permission/network errors
const MOCK_PRODUCTS: Product[] = [
  {
    id: 'mock-1',
    name: 'Anker PowerPort III 20W GaN Charger',
    sku: 'SAT-ANK-4921',
    category: 'Adapters & Cables',
    brand: 'Anker',
    subBrand: 'SAT',
    costPrice: 950,
    sellingPrice: 1450,
    reorderThreshold: 10,
    images: ['https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&q=80&w=300'],
    variants: [
      { id: 'v1', color: 'Black', model: 'UK Plug', stock: 15 },
      { id: 'v2', color: 'White', model: 'US Plug', stock: 4 } // Low Stock!
    ],
    archived: false,
    createdAt: Date.now() - 1000000
  },
  {
    id: 'mock-2',
    name: 'Baseus Bowie WM01 Wireless Earbuds',
    sku: 'GZ-BAS-1029',
    category: 'Audio Gear',
    brand: 'Baseus',
    subBrand: 'GZ',
    costPrice: 1200,
    sellingPrice: 1850,
    reorderThreshold: 5,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&q=80&w=300'],
    variants: [
      { id: 'v3', color: 'White', model: 'Standard', stock: 12 },
      { id: 'v4', color: 'Purple', model: 'Standard', stock: 2 } // Low Stock!
    ],
    archived: false,
    createdAt: Date.now() - 500000
  },
  {
    id: 'mock-3',
    name: 'Xiaomi Mi Band 8 Active NFC',
    sku: 'RTX-XIA-9021',
    category: 'Smart Wearables',
    brand: 'Xiaomi',
    subBrand: 'RTX',
    costPrice: 2100,
    sellingPrice: 3200,
    reorderThreshold: 8,
    images: ['https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?auto=format&fit=crop&q=80&w=300'],
    variants: [
      { id: 'v5', color: 'Space Black', model: 'NFC Edition', stock: 0 } // Out of Stock!
    ],
    archived: false,
    createdAt: Date.now() - 200000
  }
];

const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Smart Phones', level: 'main', parentId: null },
  { id: 'cat-2', name: 'Adapters & Cables', level: 'main', parentId: null },
  { id: 'cat-3', name: 'Audio Gear', level: 'main', parentId: null },
  { id: 'cat-4', name: 'Power Banks', level: 'main', parentId: null },
  { id: 'cat-5', name: 'Smart Wearables', level: 'main', parentId: null }
];

const MOCK_BRANDS: Brand[] = [
  { id: 'b-1', name: 'Apple' },
  { id: 'b-2', name: 'Samsung' },
  { id: 'b-3', name: 'Xiaomi' },
  { id: 'b-4', name: 'Anker' },
  { id: 'b-5', name: 'Baseus' }
];

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isOfflineDemoMode, setIsOfflineDemoMode] = useState(false);

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

  const enterOfflineDemoMode = () => {
    setIsOfflineDemoMode(true);
    setIsQuotaExceeded(false);
    
    setUser({
      id: 'offline-operator',
      email: 'offline@demo.com',
      name: 'Offline Demo Operator',
      role: 'superadmin',
      pin: '0000',
      active: true,
      currentSessionStatus: 'checked_in',
      currentSessionDate: new Date().toISOString().split('T')[0],
      currentSessionId: 'offline-sess',
    });
    
    setCompanySettings({
      companyName: 'Sky Automation Demo Workspace',
      address: '123 Demo Street, Suite 101',
      phone: '555-0199',
      onboarded: true,
    });
    
    setIsOnboarding(false);
    
    setProducts(MOCK_PRODUCTS);
    setCategories(MOCK_CATEGORIES);
    setBrands(MOCK_BRANDS);
    setProductColors([
      { id: 'c-1', name: 'Black' },
      { id: 'c-2', name: 'White' },
      { id: 'c-3', name: 'Purple' },
      { id: 'c-4', name: 'Space Black' }
    ]);
    setProductModels([
      { id: 'm-1', name: 'Standard' },
      { id: 'm-2', name: 'UK Plug' },
      { id: 'm-3', name: 'US Plug' },
      { id: 'm-4', name: 'NFC Edition' }
    ]);
  };
  
  // App structure states
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Applet Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [productColors, setProductColors] = useState<ProductColor[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  // Deep-linking search target states
  const [initialProductId, setInitialProductId] = useState<string | null>(null);
  const [initialOrderId, setInitialOrderId] = useState<string | null>(null);
  const [initialCustomerId, setInitialCustomerId] = useState<string | null>(null);

  // Sub-action passing (e.g., automatically opening add product drawer)
  const [initialProductAddMode, setInitialProductAddMode] = useState(false);
  const [initialStockAction, setInitialStockAction] = useState('in');
  const [initialStockProductId, setInitialStockProductId] = useState('');

  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataPassword, setClearDataPassword] = useState('');
  const [clearingDataError, setClearingDataError] = useState('');
  const [isClearingData, setIsClearingData] = useState(false);

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

  useEffect(() => {
    console.log('App: Setting up onAuthStateChanged listener...');
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('App: onAuthStateChanged triggered. User:', firebaseUser ? firebaseUser.uid : 'null');
      try {
        if (firebaseUser) {
          // Logged In
          console.log('App: Fetching user profile for UID:', firebaseUser.uid);
          let profile = await getUserProfile(firebaseUser.uid);
          
          if (profile) {
            // Safety Check: Suspended Account
            if (profile.active === false && profile.role !== 'superadmin') {
              console.warn('App: Attempted access by suspended account:', profile.email);
              await auth.signOut();
              setUser(null);
              return;
            }

            console.log('App: User session established:', profile.email, `[${profile.role}]`);
            setUser(profile);
            
            // Check onboarding
            try {
              const settings = await getCompanySettings();
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
            // If no profile found, do NOT sign out automatically.
            // Let SplashAndAuth or onboarding wizards handle their own state,
            // otherwise self-healing and first-time setups would fail.
            setUser(null);
          }
        } else {
          // Signed out
          setUser(null);
          setCompanySettings(null);
          setIsOnboarding(false);
        }
      } catch (err: any) {
        if (checkIfQuotaError(err)) {
          console.warn('Info: Quota Exceeded in onAuthStateChanged:', err);
          setIsQuotaExceeded(true);
        } else {
          console.error('Error in onAuthStateChanged:', err);
        }
        setUser(null);
      } finally {
        setAuthChecking(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch application data
  const refreshApplicationData = async () => {
    setDataLoading(true);
    try {
      await seedInitialDataIfEmpty();
      await syncProductStockStatuses();
      
      // Retrieve collections
      const prodsList = await getProducts(true);
      const catsList = await getCategories();
      const brandsList = await getBrands();
      const colorsList = await getProductColors();
      const modelsList = await getProductModels();

      setProducts(prodsList);
      setCategories(catsList);
      setBrands(brandsList);
      setProductColors(colorsList);
      setProductModels(modelsList);
    } catch (error: any) {
      console.warn("Firestore access error:", error);
      if (checkIfQuotaError(error)) {
        setIsQuotaExceeded(true);
      }
      // Fallback
      setProducts([]);
      setCategories([]);
      setBrands([]);
      setProductColors([]);
      setProductModels([]);
    } finally {
      setDataLoading(false);
    }
  };

  // Fetch user profile again
  const refreshUserProfile = async () => {
    if (user?.id) {
      try {
        const profile = await getUserProfile(user.id);
        if (profile) setUser(profile);
      } catch (error: any) {
        if (checkIfQuotaError(error)) {
          setIsQuotaExceeded(true);
        }
      }
    }
  };

  useEffect(() => {
    if (user && !isOnboarding && !isOfflineDemoMode) {
      refreshApplicationData();
    }
  }, [user, isOnboarding]);

  // Handle Auth success from Login Screen
  const handleAuthSuccess = async (profile: UserProfile) => {
    setUser(profile);
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
    await signOut(auth);
    setUser(null);
    setCompanySettings(null);
    setIsOnboarding(false);
    setCurrentTab('dashboard');
  };

  // Safe navigation from quick actions
  const navigateToTab = (tab: string, subAction?: string, initialId?: string | null) => {
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

  const [isExportingData, setIsExportingData] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const handleExportData = async () => {
    setIsExportingData(true);
    setExportMessage(null);
    try {
      const data = await exportAllData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `inventory-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportMessage(`Data exported successfully. Backup saved as JSON.`);
    } catch (err: any) {
      setExportMessage(`Export failed: ${err.message}`);
    } finally {
      setIsExportingData(false);
    }
  };

  const handleClearSampleData = () => {
    if (user?.role !== 'superadmin') return;
    setShowClearDataModal(true);
    setClearDataPassword('');
    setClearingDataError('');
  };

  const executeClearSampleData = async () => {
    if (user?.role !== 'superadmin' || !auth.currentUser) return;
    if (!clearDataPassword) {
      setClearingDataError('Password is required.');
      return;
    }

    setIsClearingData(true);
    setClearingDataError('');

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email || '', clearDataPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      
      setDataLoading(true);
      await clearSampleData();
      await refreshApplicationData();
      
      setShowClearDataModal(false);
      alert('Sample data cleared successfully!');
    } catch (error: any) {
      console.warn('Clear data failed:', error.message || error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setClearingDataError('Incorrect password.');
      } else {
        setClearingDataError('Failed to clear data: ' + (error.message || 'Unknown error'));
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

  // Quota Exceeded Gate
  if (isQuotaExceeded && !isOfflineDemoMode) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-6 text-center select-none relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-amber-500/10 blur-3xl" />
        
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-8 shadow-2xl relative z-10">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-amber-400 animate-pulse">
            <AlertTriangle size={32} />
          </div>
          
          <h2 className="text-2xl font-bold text-white tracking-tight mb-3">
            Firestore Quota Exceeded
          </h2>
          
          <p className="text-sm font-mono text-slate-400 uppercase tracking-wider mb-6">
            Database Limit Reached
          </p>

          <div className="text-slate-300 text-sm space-y-4 mb-8 text-left leading-relaxed">
            <p>
              The Firestore database free-tier daily read/write limit has been exceeded for this project.
            </p>
            <p className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-sm font-mono text-slate-400 break-words">
              Error: Free daily read units per project (free tier database) limit exceeded.
            </p>
            <p>
              This is a standard cloud resource guard. Quotas automatically reset daily at midnight Pacific Time.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={enterOfflineDemoMode}
              className="w-full py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/10"
            >
              <Sparkles size={16} />
              Enter Offline Demo Mode
            </button>
            
            <button
              onClick={() => {
                setIsQuotaExceeded(false);
                setAuthChecking(true);
                window.location.reload();
              }}
              className="w-full py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw size={14} />
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auth Guard
  if (!user) {
    return <SplashAndAuth onAuthSuccess={handleAuthSuccess} />;
  }

  // Onboarding Wizard Guard
  if (isOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} userId={user.id} />;
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col lg:flex-row">
      
      {/* Sidebar Navigation */}
      <Sidebar 
        currentTab={currentTab} 
        setCurrentTab={setCurrentTab} 
        user={user} 
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
        companyName={companySettings?.companyName || 'Sky Automation Tech'}
        logoUrl={companySettings?.logoUrl}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-h-screen relative">
        
        {/* Top Header Bar - Mobile/Tablet Only */}
        <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-950 border-b border-slate-800 z-30 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 text-slate-400 hover:text-white"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <img src={companySettings?.logoUrl || "/logo.png"} alt="Company Logo" className="w-6 h-6 rounded object-contain" />
              <h1 className="text-white font-bold tracking-tight text-sm uppercase">
                {companySettings?.companyName || 'Sky Automation'}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {dataLoading && (
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
            )}
            <NotificationCenter user={user} onNavigate={navigateToTab} />
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-500 font-bold text-sm">
              {user?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pt-20 lg:pt-8 bg-slate-50">
          
          {/* Desktop Header Bar */}
          <div className="hidden lg:flex items-center justify-between pb-6 mb-6 border-b border-slate-200/80">
            <div>
              <div className="text-xs font-mono font-bold text-amber-600 uppercase tracking-widest">
                {companySettings?.companyName || 'Sky Automation'} Platform
              </div>
              <h2 className="text-xl font-black text-slate-900 capitalize">
                {currentTab.replace('_', ' ')}
              </h2>
            </div>

            <div className="flex items-center gap-4">
              <NotificationCenter user={user} onNavigate={navigateToTab} />
              <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
                <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400 font-bold text-sm shadow-xs">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-900">{user?.name || 'Staff User'}</div>
                  <div className="text-[10px] text-slate-500 capitalize">{user?.role || 'staff'}</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Offline Mode Banner */}
          {isOfflineDemoMode && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-500 shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Offline Demo Mode Active</h4>
                  <p className="text-sm text-amber-700/80 mt-0.5">
                    Viewing local workspace because Firestore quota is temporarily fully utilized. All features are fully functional.
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="self-start sm:self-center px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw size={12} />
                Check Sync Status
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
        )}

        {/* Tab 3: Stock Operations View */}
        {currentTab === 'stock' && (
          <StockOperations 
            products={products.filter(p => !p.archived)} 
            user={user} 
            onRefreshData={refreshApplicationData}
            initialAction={initialStockAction}
            requireCheckIn={requireCheckIn}
            initialProductId={initialStockProductId}
          />
        )}

        {/* Tab 4: User Management View */}
        {currentTab === 'users' && (
          <UserManagement user={user} />
        )}

        {/* Tab Customers: Customer Directory View */}
        {currentTab === 'customers' && (
          <CustomerManagement 
            user={user} 
            requireCheckIn={requireCheckIn} 
            initialCustomerId={initialCustomerId}
            clearInitialCustomerId={() => setInitialCustomerId(null)}
          />
        )}

        {/* Tab Orders: Order Desk View */}
        {currentTab === 'orders' && (
          <OrderManagement 
            user={user} 
            requireCheckIn={requireCheckIn} 
            initialOrderId={initialOrderId}
            clearInitialOrderId={() => setInitialOrderId(null)}
          />
        )}

        {/* Tab Invoices: Invoice Desk View */}
        {currentTab === 'invoices' && (
          <InvoiceManagement user={user} requireCheckIn={requireCheckIn} />
        )}

        {/* Tab Receivables: Due Payments View */}
        {currentTab === 'receivables' && (
          <DuePayments user={user} requireCheckIn={requireCheckIn} />
        )}

        {/* Tab Financials: Income & Expense Financial Overview View */}
        {currentTab === 'financials' && (
          user.role === 'superadmin' ? (
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
                The Income & Expense financial control panel is strictly reserved for Super Administrator roles only. Your current role is not authorized to access this ledger or run aggregate operational summaries.
              </p>
            </div>
          )
        )}

        {/* Tab Attendance: Attendance Log View */}
        {currentTab === 'attendance' && (
          <AttendanceLog user={user} />
        )}

        {/* Tab Suppliers: Supplier Management View */}
        {currentTab === 'suppliers' && (
          <SupplierManagement user={user} rolePermissions={{}} />
        )}

        {/* Tab Reports: Reports & Analytics View */}
        {currentTab === 'reports' && (
          <ReportsAnalytics user={user} />
        )}

        {/* Tab 5: Settings View */}
        {currentTab === 'settings' && (
          <div className="max-w-3xl bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
            <div>
              <span className="text-sm font-mono font-bold text-amber-500 uppercase tracking-widest">Global Platform Configuration</span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Company Branding & Invoice Settings</h2>
              <p className="text-sm text-slate-400 leading-relaxed mt-1">
                Customize company details, invoice layout, payment method instructions, terms, and sub-brand information.
              </p>
            </div>

            {/* SUPER ADMIN ROLE GUARD BADGE */}
            {!(user?.role === 'superadmin' || user?.role === 'super_admin') ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-amber-800">
                <div className="p-2 bg-amber-100 rounded-xl shrink-0 text-amber-700 font-bold">🔒</div>
                <div>
                  <h4 className="font-bold text-sm text-amber-900">Super Admin Access Restricted</h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Editing company settings, sub-brand details, and invoice templates is restricted to <strong>Super Admin</strong> roles. You can view the current settings below in read-only mode.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs font-bold text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Super Admin Authorized: You have full permissions to modify company branding and invoice properties.
              </div>
            )}

            <form 
              onSubmit={(e) => {
                const companyNameVal = (e.currentTarget.elements.namedItem('company-name') as HTMLInputElement)?.value;
                const taglineVal = (e.currentTarget.elements.namedItem('footer-tagline') as HTMLInputElement)?.value;
                const logoUrlVal = settingsLogoUrl || (e.currentTarget.elements.namedItem('logo-url') as HTMLInputElement)?.value;
                const addressVal = (e.currentTarget.elements.namedItem('company-address') as HTMLInputElement)?.value;
                const phoneVal = (e.currentTarget.elements.namedItem('company-phone') as HTMLInputElement)?.value;
                const emailVal = (e.currentTarget.elements.namedItem('company-email') as HTMLInputElement)?.value;

                const bkashNagadVal = (e.currentTarget.elements.namedItem('bkash-nagad') as HTMLInputElement)?.value;
                const bankInfoVal = (e.currentTarget.elements.namedItem('bank-info') as HTMLInputElement)?.value;
                const whatsappVal = (e.currentTarget.elements.namedItem('whatsapp-contact') as HTMLInputElement)?.value;

                const sat = (e.currentTarget.elements.namedItem('sat-prefix') as HTMLInputElement)?.value;
                const gz = (e.currentTarget.elements.namedItem('gz-prefix') as HTMLInputElement)?.value;
                const rtx = (e.currentTarget.elements.namedItem('rtx-prefix') as HTMLInputElement)?.value;
                const terms = (e.currentTarget.elements.namedItem('invoice-terms') as HTMLTextAreaElement)?.value; 

                const satName = (e.currentTarget.elements.namedItem('sat-name') as HTMLInputElement)?.value;
                const satAddress = (e.currentTarget.elements.namedItem('sat-address') as HTMLInputElement)?.value;
                const satPhone = (e.currentTarget.elements.namedItem('sat-phone') as HTMLInputElement)?.value;
                const satEmail = (e.currentTarget.elements.namedItem('sat-email') as HTMLInputElement)?.value;
                const satTerms = (e.currentTarget.elements.namedItem('sat-terms') as HTMLTextAreaElement)?.value;
                const satTagline = (e.currentTarget.elements.namedItem('sat-tagline') as HTMLInputElement)?.value;

                const gzName = (e.currentTarget.elements.namedItem('gz-name') as HTMLInputElement)?.value;
                const gzAddress = (e.currentTarget.elements.namedItem('gz-address') as HTMLInputElement)?.value;
                const gzPhone = (e.currentTarget.elements.namedItem('gz-phone') as HTMLInputElement)?.value;
                const gzEmail = (e.currentTarget.elements.namedItem('gz-email') as HTMLInputElement)?.value;
                const gzTerms = (e.currentTarget.elements.namedItem('gz-terms') as HTMLTextAreaElement)?.value;
                const gzTagline = (e.currentTarget.elements.namedItem('gz-tagline') as HTMLInputElement)?.value;

                const rtxName = (e.currentTarget.elements.namedItem('rtx-name') as HTMLInputElement)?.value;
                const rtxAddress = (e.currentTarget.elements.namedItem('rtx-address') as HTMLInputElement)?.value;
                const rtxPhone = (e.currentTarget.elements.namedItem('rtx-phone') as HTMLInputElement)?.value;
                const rtxEmail = (e.currentTarget.elements.namedItem('rtx-email') as HTMLInputElement)?.value;
                const rtxTerms = (e.currentTarget.elements.namedItem('rtx-terms') as HTMLTextAreaElement)?.value;
                const rtxTagline = (e.currentTarget.elements.namedItem('rtx-tagline') as HTMLInputElement)?.value;

                const lowStockThresh = parseInt((e.currentTarget.elements.namedItem('low-stock-thresh') as HTMLInputElement)?.value || '5', 10);
                const agingBucket1 = parseInt((e.currentTarget.elements.namedItem('aging-bucket1') as HTMLInputElement)?.value || '15', 10);
                const agingBucket2 = parseInt((e.currentTarget.elements.namedItem('aging-bucket2') as HTMLInputElement)?.value || '30', 10);
                const suppTerms = (e.currentTarget.elements.namedItem('supplier-terms') as HTMLTextAreaElement)?.value;

                const emailJsServiceId = (e.currentTarget.elements.namedItem('emailjs-service-id') as HTMLInputElement)?.value;
                const emailJsTemplateId = (e.currentTarget.elements.namedItem('emailjs-template-id') as HTMLInputElement)?.value;
                const emailJsPublicKey = (e.currentTarget.elements.namedItem('emailjs-public-key') as HTMLInputElement)?.value;
                const emailJsRecipient = (e.currentTarget.elements.namedItem('emailjs-recipient') as HTMLInputElement)?.value;

                handleSaveCompanySettings(e, {
                  companyName: companyNameVal,
                  logoUrl: logoUrlVal,
                  address: addressVal,
                  phone: phoneVal,
                  email: emailVal,
                  footerTagline: taglineVal,
                  invoiceTerms: terms,
                  lowStockDefaultThreshold: lowStockThresh,
                  agingThresholdBucket1Days: agingBucket1,
                  agingThresholdBucket2Days: agingBucket2,
                  supplierTermsNote: suppTerms,
                  emailJsConfig: {
                    serviceId: emailJsServiceId,
                    templateId: emailJsTemplateId,
                    publicKey: emailJsPublicKey,
                    recipientEmail: emailJsRecipient
                  },
                  paymentMethodsInfo: {
                    bkashNagad: bkashNagadVal,
                    bankInfo: bankInfoVal,
                    whatsappContact: whatsappVal
                  },
                  prefixes: { SAT: sat, GZ: gz, RTX: rtx },
                  subBrandDetails: {
                    SAT: {
                      companyName: satName || 'Sky Automation Tech',
                      address: satAddress,
                      phone: satPhone,
                      email: satEmail,
                      logoUrl: companySettings?.subBrandDetails?.SAT?.logoUrl || '/sat_logo.jpg',
                      invoiceTerms: satTerms || terms,
                      tagline: satTagline || taglineVal
                    },
                    GZ: {
                      companyName: gzName || 'GadgetZu',
                      address: gzAddress,
                      phone: gzPhone,
                      email: gzEmail,
                      logoUrl: companySettings?.subBrandDetails?.GZ?.logoUrl || '/gz_logo.jpg',
                      invoiceTerms: gzTerms || terms,
                      tagline: gzTagline || taglineVal
                    },
                    RTX: {
                      companyName: rtxName || 'RTX Gadget',
                      address: rtxAddress,
                      phone: rtxPhone,
                      email: rtxEmail,
                      logoUrl: companySettings?.subBrandDetails?.RTX?.logoUrl || '/rtx_logo.jpg',
                      invoiceTerms: rtxTerms || terms,
                      tagline: rtxTagline || taglineVal
                    }
                  }
                });
              }}
              className="space-y-6"
            >
              {/* SECTION 1: MAIN BRAND & INVOICE HEADER */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span>🏢</span> Main Brand & Invoice Header Info
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Main Company Name
                    </label>
                    <input
                      type="text"
                      name="company-name"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.companyName || 'Sky Automation Tech'}
                      placeholder="e.g. Sky Automation Tech"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 font-bold focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                      Invoice Tagline / Subtitle
                    </label>
                    <input
                      type="text"
                      name="footer-tagline"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.footerTagline || 'Smart solutions, better future'}
                      placeholder="e.g. Smart solutions, better future"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Main Address</label>
                    <input
                      type="text"
                      name="company-address"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka'}
                      placeholder="Company Address"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Phone / Hotline</label>
                    <input
                      type="text"
                      name="company-phone"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.phone || '01577351518'}
                      placeholder="01577351518"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Official Email</label>
                    <input
                      type="text"
                      name="company-email"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.email || 'skyautomationtech@gmail.com'}
                      placeholder="email@domain.com"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Main Logo Upload */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Main Logo Image
                  </label>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-xl border border-slate-200">
                    <div className="w-16 h-16 bg-slate-950 rounded-xl p-2 flex items-center justify-center shrink-0 border border-slate-800">
                      <img 
                        src={settingsLogoUrl || companySettings?.logoUrl || "/logo.png"} 
                        alt="Logo Preview" 
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 w-full space-y-2">
                      {(user?.role === 'superadmin' || user?.role === 'super_admin') && (
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors inline-block">
                            Upload Logo File
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleLogoFileUpload} 
                              className="hidden" 
                            />
                          </label>
                          {settingsLogoUrl && (
                            <button
                              type="button"
                              onClick={() => setSettingsLogoUrl('')}
                              className="text-xs text-red-500 hover:underline font-semibold"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                      <input
                        type="text"
                        name="logo-url"
                        disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                        value={settingsLogoUrl}
                        onChange={(e) => setSettingsLogoUrl(e.target.value)}
                        placeholder="Or paste image URL (e.g. https://...)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2.5 text-xs text-slate-700 font-mono focus:outline-hidden disabled:opacity-60"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: INVOICE PAYMENT METHODS & FOOTER */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span>💳</span> Invoice Payment Instructions & Footer Notes
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      bKash / Nagad Number
                    </label>
                    <input
                      type="text"
                      name="bkash-nagad"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.paymentMethodsInfo?.bkashNagad || companySettings?.phone || '01577351518'}
                      placeholder="e.g. 01577351518"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Bank Account Info
                    </label>
                    <input
                      type="text"
                      name="bank-info"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.paymentMethodsInfo?.bankInfo || 'DBBL - 105.***.***.18'}
                      placeholder="e.g. DBBL - 105.***.***.18"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      WhatsApp Slip Contact
                    </label>
                    <input
                      type="text"
                      name="whatsapp-contact"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.paymentMethodsInfo?.whatsappContact || companySettings?.phone || '01577351518'}
                      placeholder="e.g. 01577351518"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-bold focus:outline-hidden disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Default Invoice Terms & Conditions / Policy
                  </label>
                  <textarea
                    name="invoice-terms"
                    rows={3}
                    disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                    defaultValue={companySettings?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-hidden focus:border-amber-400 disabled:opacity-60"
                  />
                </div>
              </div>

              {/* SECTION 3: INVOICE PREFIXES BY SUB-BRAND */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span>🔢</span> Invoice Serial Prefixes
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      SAT Prefix
                    </label>
                    <input
                      type="text"
                      name="sat-prefix"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.prefixes?.SAT || 'SAT-INV'}
                      className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      GadgetZu Prefix
                    </label>
                    <input
                      type="text"
                      name="gz-prefix"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.prefixes?.GZ || 'GZ-INV'}
                      className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      RTX Gadget Prefix
                    </label>
                    <input
                      type="text"
                      name="rtx-prefix"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.prefixes?.RTX || 'RTX-INV'}
                      className="mt-1 w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: SUB-BRAND SPECIFIC DETAILS */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span>🏷️</span> Sub-Brand Profiles (Printed on Brand Invoices)
                </h3>

                {/* Sky Automation Tech */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <img src="/sat_logo.jpg" alt="SAT" className="w-5 h-5 object-contain" />
                    <span className="font-bold text-xs text-slate-800 uppercase">Sky Automation Tech (SAT) Profile</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="sat-name"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Company Name"
                      defaultValue={companySettings?.subBrandDetails?.SAT?.companyName || 'Sky Automation Tech'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="sat-tagline"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Tagline / Slogan"
                      defaultValue={companySettings?.subBrandDetails?.SAT?.tagline || 'Smart solutions, better future'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="sat-address"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Address"
                      defaultValue={companySettings?.subBrandDetails?.SAT?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="sat-phone"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Phone"
                      defaultValue={companySettings?.subBrandDetails?.SAT?.phone || '01577351518'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="sat-email"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Email"
                      defaultValue={companySettings?.subBrandDetails?.SAT?.email || 'skyautomationtech@gmail.com'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <textarea
                    name="sat-terms"
                    rows={2}
                    disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                    placeholder="Specific Terms & Conditions for SAT invoices"
                    defaultValue={companySettings?.subBrandDetails?.SAT?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>

                {/* GadgetZu */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <img src="/gz_logo.jpg" alt="GZ" className="w-5 h-5 object-contain" />
                    <span className="font-bold text-xs text-slate-800 uppercase">GadgetZu (GZ) Profile</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="gz-name"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Company Name"
                      defaultValue={companySettings?.subBrandDetails?.GZ?.companyName || 'GadgetZu'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="gz-tagline"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Tagline / Slogan"
                      defaultValue={companySettings?.subBrandDetails?.GZ?.tagline || 'Your trusted gadget shop'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="gz-address"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Address"
                      defaultValue={companySettings?.subBrandDetails?.GZ?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="gz-phone"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Phone"
                      defaultValue={companySettings?.subBrandDetails?.GZ?.phone || '01577351518'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="gz-email"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Email"
                      defaultValue={companySettings?.subBrandDetails?.GZ?.email || 'gadgetzu.bd@gmail.com'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <textarea
                    name="gz-terms"
                    rows={2}
                    disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                    placeholder="Specific Terms & Conditions for GZ invoices"
                    defaultValue={companySettings?.subBrandDetails?.GZ?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>

                {/* RTX Gadget */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <img src="/rtx_logo.jpg" alt="RTX" className="w-5 h-5 object-contain" />
                    <span className="font-bold text-xs text-slate-800 uppercase">RTX Gadget (RTX) Profile</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      name="rtx-name"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Company Name"
                      defaultValue={companySettings?.subBrandDetails?.RTX?.companyName || 'RTX Gadget'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-bold disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="rtx-tagline"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Tagline / Slogan"
                      defaultValue={companySettings?.subBrandDetails?.RTX?.tagline || 'Next-gen gaming & tech accessories'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="rtx-address"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Address"
                      defaultValue={companySettings?.subBrandDetails?.RTX?.address || 'House #12, Road #3, Block-A, Banasree, Dhaka'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="rtx-phone"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Phone"
                      defaultValue={companySettings?.subBrandDetails?.RTX?.phone || '01577351518'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="rtx-email"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Email"
                      defaultValue={companySettings?.subBrandDetails?.RTX?.email || 'rtxgadget.bd@gmail.com'}
                      className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                  <textarea
                    name="rtx-terms"
                    rows={2}
                    disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                    placeholder="Specific Terms & Conditions for RTX invoices"
                    defaultValue={companySettings?.subBrandDetails?.RTX?.invoiceTerms || 'Goods once sold are non-refundable. Please verify items at delivery.'}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono disabled:opacity-60"
                  />
                </div>
              </div>

              {/* SECTION 5: INVENTORY ALERTS & EMAILJS CONFIGURATION */}
              <div className="p-5 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold font-mono text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <span>⚙️</span> System Thresholds, Aging & EmailJS Preferences
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Low Stock Reorder Threshold
                    </label>
                    <input
                      type="number"
                      name="low-stock-thresh"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.lowStockDefaultThreshold || 5}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-none disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Due Aging Bucket 1 (Days)
                    </label>
                    <input
                      type="number"
                      name="aging-bucket1"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.agingThresholdBucket1Days || 15}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-none disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                      Due Aging Bucket 2 (Days)
                    </label>
                    <input
                      type="number"
                      name="aging-bucket2"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      defaultValue={companySettings?.agingThresholdBucket2Days || 30}
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono focus:outline-none disabled:opacity-60"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Default Supplier Payment Terms Note
                  </label>
                  <textarea
                    name="supplier-terms"
                    rows={2}
                    disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                    placeholder="Standard payment terms for supplier purchases"
                    defaultValue={companySettings?.supplierTermsNote || 'Standard payment terms: Net 15 days.'}
                    className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none disabled:opacity-60"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200/60 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">EmailJS Low-Stock Alert Integration (Optional)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      name="emailjs-service-id"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="EmailJS Service ID"
                      defaultValue={companySettings?.emailJsConfig?.serviceId || ''}
                      className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="emailjs-template-id"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="EmailJS Template ID"
                      defaultValue={companySettings?.emailJsConfig?.templateId || ''}
                      className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                    />
                    <input
                      type="text"
                      name="emailjs-public-key"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="EmailJS Public Key"
                      defaultValue={companySettings?.emailJsConfig?.publicKey || ''}
                      className="bg-white border border-slate-200 rounded-xl p-2 text-xs font-mono disabled:opacity-60"
                    />
                    <input
                      type="email"
                      name="emailjs-recipient"
                      disabled={!(user?.role === 'superadmin' || user?.role === 'super_admin')}
                      placeholder="Notification Recipient Email"
                      defaultValue={companySettings?.emailJsConfig?.recipientEmail || ''}
                      className="bg-white border border-slate-200 rounded-xl p-2 text-xs disabled:opacity-60"
                    />
                  </div>
                </div>
              </div>

              {/* SAVE BUTTONS */}
              {(user?.role === 'superadmin' || user?.role === 'super_admin') && (
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setIsOnboarding(true)}
                    className="py-2 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl cursor-pointer"
                  >
                    Re-run Onboarding Setup
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-sm rounded-xl shadow-md cursor-pointer"
                  >
                    Save Company & Invoice Settings
                  </button>
                </div>
              )}
            </form>

            <div className="bg-amber-50/40 p-4 border border-amber-200/40 rounded-2xl space-y-2">
              <h3 className="text-sm font-bold text-amber-800">Sandbox Database Info</h3>
              <p className="text-sm text-amber-700 leading-relaxed">
                Database connected: <span className="font-mono bg-amber-400/10 px-1 rounded">Firestore ({companySettings?.companyName})</span>. 
                In case of offline use or missing rules, the app gracefully activates localized fallback sandbox state so your operators never experience any operational friction.
              </p>
            </div>

            {(user?.role === 'superadmin' || user?.role === 'super_admin') && (
              <div className="pt-6 border-t border-slate-100 flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Data Backup & Export</h3>
                    <p className="text-sm text-slate-500 mt-1">Download a full JSON backup of all databases (products, orders, customers, etc).</p>
                    {exportMessage && <p className={`text-sm font-bold mt-2 ${exportMessage.includes('failed') ? 'text-red-600' : 'text-emerald-600'}`}>{exportMessage}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={isExportingData}
                    className="py-2 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    {isExportingData ? 'Exporting...' : 'Export All Data'}
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

      {/* Danger Zone Confirmation Modal */}
      {showClearDataModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6 md:p-8 border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Are you absolutely sure?</h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              This action will <strong>permanently delete</strong> all products, categories, brands, and stock logs. This cannot be undone.
            </p>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-500 mb-1">Enter your password to confirm:</label>
              <input 
                type="password" 
                value={clearDataPassword}
                onChange={(e) => setClearDataPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="Your account password"
              />
              {clearingDataError && (
                <p className="text-red-500 text-sm font-bold mt-2">{clearingDataError}</p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={executeClearSampleData}
                disabled={isClearingData}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold py-3.5 px-4 rounded-xl transition-colors cursor-pointer flex justify-center items-center gap-2"
              >
                {isClearingData ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Deleting Data...
                  </>
                ) : (
                  'Permanently Delete Data'
                )}
              </button>
              <button
                onClick={() => {
                  setShowClearDataModal(false);
                  setClearDataPassword('');
                  setClearingDataError('');
                }}
                disabled={isClearingData}
                className="w-full bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-600 font-bold py-3.5 px-4 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
