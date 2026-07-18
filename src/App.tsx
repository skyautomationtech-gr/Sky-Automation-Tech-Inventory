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
  migrateProductBarcodes
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

  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [clearDataPassword, setClearDataPassword] = useState('');
  const [clearingDataError, setClearingDataError] = useState('');
  const [isClearingData, setIsClearingData] = useState(false);

  // Listen to Auth State
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
      
      // Auto-heal / migrate legacy long barcodes to short unique IDs
      await migrateProductBarcodes();
      
      // Retrieve collections
      const prodsList = await getProducts();
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

  // Settings prefix updates form
  const handleSaveSettingsPrefixes = async (e: React.FormEvent, prefixes: any) => {
    e.preventDefault();
    if (!companySettings) return;

    const updated = {
      ...companySettings,
      prefixes
    };

    try {
      await saveCompanySettings(updated);
      setCompanySettings(updated);
      alert('Invoice prefixes updated successfully in Firestore!');
    } catch (err) {
      console.error(err);
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
        <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
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
          
          <p className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-6">
            Database Limit Reached
          </p>

          <div className="text-slate-300 text-sm space-y-4 mb-8 text-left leading-relaxed">
            <p>
              The Firestore database free-tier daily read/write limit has been exceeded for this project.
            </p>
            <p className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-400 break-words">
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
              <img src="/logo.png" alt="Company Logo" className="w-6 h-6 rounded object-contain" />
              <h1 className="text-white font-bold tracking-tight text-xs uppercase">
                {companySettings?.companyName || 'Sky Automation'}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {dataLoading && (
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-ping" />
            )}
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-500 font-bold text-xs">
              {user?.name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pt-20 lg:pt-8 bg-slate-50">
          
          {/* Offline Mode Banner */}
          {isOfflineDemoMode && (
            <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-500 shrink-0">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-800">Offline Demo Mode Active</h4>
                  <p className="text-xs text-amber-700/80 mt-0.5">
                    Viewing local workspace because Firestore quota is temporarily fully utilized. All features are fully functional.
                  </p>
                </div>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="self-start sm:self-center px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <RefreshCw size={12} />
                Check Sync Status
              </button>
            </div>
          )}

          {/* Loading Indicator - Desktop Only */}
          {dataLoading && (
            <div className="hidden lg:flex fixed top-4 right-4 bg-slate-900 border border-amber-400/20 text-white font-mono text-[10px] px-3 py-1.5 rounded-lg items-center gap-2 shadow-lg z-50">
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
          />
        )}

        {/* Tab 3: Stock Operations View */}
        {currentTab === 'stock' && (
          <StockOperations 
            products={products} 
            user={user} 
            onRefreshData={refreshApplicationData}
            initialAction={initialStockAction}
            requireCheckIn={requireCheckIn}
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

        {/* Tab Attendance: Attendance Log View */}
        {currentTab === 'attendance' && (
          <AttendanceLog user={user} />
        )}

        {/* Tab 5: Settings View */}
        {currentTab === 'settings' && (
          <div className="max-w-2xl bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 space-y-6">
            <div>
              <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">Global Platform Configuration</span>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Company Settings & Prefixes</h2>
              <p className="text-xs text-slate-400 leading-relaxed mt-1">
                Customize default invoice prefixes and view information about the connected sub-brands.
              </p>
            </div>

            <form 
              onSubmit={(e) => {
                const sat = (e.currentTarget.elements.namedItem('sat-prefix') as HTMLInputElement).value;
                const gz = (e.currentTarget.elements.namedItem('gz-prefix') as HTMLInputElement).value;
                const rtx = (e.currentTarget.elements.namedItem('rtx-prefix') as HTMLInputElement).value;
                handleSaveSettingsPrefixes(e, { SAT: sat, GZ: gz, RTX: rtx });
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    SAT Invoice Prefix
                  </label>
                  <input
                    type="text"
                    name="sat-prefix"
                    defaultValue={companySettings?.prefixes?.SAT || 'SAT-INV'}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    GadgetZu Invoice Prefix
                  </label>
                  <input
                    type="text"
                    name="gz-prefix"
                    defaultValue={companySettings?.prefixes?.GZ || 'GZ-INV'}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    RTX Gadget Invoice Prefix
                  </label>
                  <input
                    type="text"
                    name="rtx-prefix"
                    defaultValue={companySettings?.prefixes?.RTX || 'RTX-INV'}
                    className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 font-mono font-bold text-amber-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setIsOnboarding(true)}
                  className="py-2 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Re-run Onboarding Setup
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  Save Invoice Prefixes
                </button>
              </div>
            </form>

            <div className="bg-amber-50/40 p-4 border border-amber-200/40 rounded-2xl space-y-2">
              <h3 className="text-xs font-bold text-amber-800">Sandbox Database Info</h3>
              <p className="text-[11px] text-amber-700 leading-relaxed">
                Database connected: <span className="font-mono bg-amber-400/10 px-1 rounded">Firestore ({companySettings?.companyName})</span>. 
                In case of offline use or missing rules, the app gracefully activates localized fallback sandbox state so your operators never experience any operational friction.
              </p>
            </div>

            {user?.role === 'superadmin' && (
              <div className="pt-6 border-t border-red-100 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-red-600">Danger Zone</h3>
                  <p className="text-xs text-slate-500">Permanently delete all products, categories, brands, and stock logs.</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearSampleData}
                  className="py-2 px-4 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  Clear Sample Data
                </button>
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
              <label className="block text-xs font-semibold text-slate-500 mb-1">Enter your password to confirm:</label>
              <input 
                type="password" 
                value={clearDataPassword}
                onChange={(e) => setClearDataPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                placeholder="Your account password"
              />
              {clearingDataError && (
                <p className="text-red-500 text-xs font-bold mt-2">{clearingDataError}</p>
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
