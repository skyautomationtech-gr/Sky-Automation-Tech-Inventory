import React, { Suspense, useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Menu, 
  CheckCircle2, 
  Clock, 
  LogOut, 
  Settings, 
  User as UserIcon, 
  ShieldCheck, 
  ArrowRight,
  Package,
  Receipt,
  ShoppingBag,
  Contact,
  X,
  Building2,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { UserProfile, Product, CompanySettings, RolePermissionsMap } from '../types';
import NotificationCenter from './NotificationCenter';
import { ThemeToggle } from '../design-system/ThemeToggle';
import { TAB_DIRECTORY } from './Breadcrumbs';
import { auth } from '../firebase/config';
import { buildSidebarGroups, findActiveNavigationMatch } from '../navigation/sidebarConfig';

const GlobalSearchPalette = React.lazy(() =>
  import('./GlobalSearchPalette').then((m) => ({ default: m.GlobalSearchPalette }))
);

interface TopBarProps {
  currentTab: string;
  currentSubAction?: string;
  onNavigate: (tab: string, subAction?: string, initialId?: string | null) => void;
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  rolePermissionsReady?: boolean;
  products?: Product[];
  companySettings: CompanySettings | null;
  onLogout: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onOpenMobileSidebar: () => void;
  dataLoading?: boolean;
  onToggleTheme?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  currentSubAction,
  onNavigate,
  user,
  rolePermissions = null,
  rolePermissionsReady = false,
  products = [],
  companySettings,
  onLogout,
  isSidebarCollapsed,
  onToggleSidebarCollapse,
  onOpenMobileSidebar,
  dataLoading = false,
  onToggleTheme,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Real-time clock tick for date/time widget (tabular-nums)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close user menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Global keyboard shortcut events and search/escape handler
  useEffect(() => {
    const handleOpenSearch = () => setIsSearchOpen(true);
    const handleCloseModals = () => {
      setIsSearchOpen(false);
      setIsUserMenuOpen(false);
    };

    window.addEventListener('open-global-search', handleOpenSearch);
    window.addEventListener('close-all-modals', handleCloseModals);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('open-global-search', handleOpenSearch);
      window.removeEventListener('close-all-modals', handleCloseModals);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isCheckedIn = user?.currentSessionStatus === 'checked_in';
  const navGroups = React.useMemo(
    () => buildSidebarGroups({ user, rolePermissions }),
    [user, rolePermissions]
  );
  const activeNavMatch = React.useMemo(
    () => findActiveNavigationMatch(navGroups, currentTab, currentSubAction),
    [navGroups, currentTab, currentSubAction]
  );
  const tabMeta = TAB_DIRECTORY[currentTab] || {
    group: 'Workspace',
    label: currentTab.replace(/_/g, ' '),
    icon: Package
  };
  const activePageTitle = activeNavMatch?.subItem?.label || activeNavMatch?.group.title || tabMeta.label;

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'superadmin':
        return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
      case 'admin':
        return 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
      case 'manager':
        return 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
      default:
        return 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30';
    }
  };

  // Clock formatters
  const hours = currentTime.getHours();
  const minutes = currentTime.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const formattedTime = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
  
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const formattedDate = `${shortDays[currentTime.getDay()]}, ${String(currentTime.getDate()).padStart(2, '0')} ${shortMonths[currentTime.getMonth()]} ${currentTime.getFullYear()}`;

  return (
    <>
      <header className="sticky top-0 z-30 h-16 w-full max-w-full box-border bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800/90 px-4 lg:px-6 flex items-center justify-between gap-2.5 lg:gap-3 transition-colors shadow-2xs shrink-0">
        
        {/* Left Zone: Mobile Menu + Page Title Only */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* Page Title */}
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="text-lg lg:text-xl font-semibold text-slate-900 dark:text-white tracking-tight truncate leading-tight whitespace-nowrap">
              {activePageTitle}
            </h2>
            {dataLoading && (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-mono shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                Syncing
              </span>
            )}
          </div>
        </div>

        {/* Center Zone: Search Bar */}
        <div className="flex-[0_1_320px] min-w-0 max-w-[360px] flex items-center justify-center shrink">
          {/* Desktop Search Bar */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="hidden xl:flex w-full min-w-[200px] h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 text-xs items-center justify-between transition-all cursor-pointer shadow-inner focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40 group"
          >
            <div className="flex items-center gap-2.5 min-w-0 truncate">
              <Search size={15} className="text-slate-400 group-hover:text-[#D4AF37] transition-colors shrink-0" />
              <span className="truncate">Search anything… (Ctrl+K)</span>
            </div>
            <kbd className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-2xs shrink-0 ml-2">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          {/* Compact Search Icon Button (Below 1280px / xl) */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="xl:hidden flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0 shadow-2xs"
            title="Search anything… (Ctrl+K)"
            aria-label="Open global search"
          >
            <Search size={18} />
          </button>
        </div>

        {/* Right Zone: Check-in chip, Date/Time widget, Notifications, Theme toggle */}
        <div className="flex items-center gap-2 lg:gap-3 whitespace-nowrap shrink-0">
          
          {/* Check-In / Check-Out Chip */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`h-10 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs flex items-center gap-2 shrink-0 whitespace-nowrap ${
              isCheckedIn
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/70'
            }`}
            title={isCheckedIn ? 'Operator active: Click to view Check Out desk' : 'Operator inactive: Click to Check In'}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {isCheckedIn && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isCheckedIn ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </span>
            <span>{isCheckedIn ? 'Checked In' : 'Checked Out'}</span>
          </button>

          {/* Date/Time Widget */}
          <div className="hidden sm:flex h-10 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs items-center gap-2 shrink-0 whitespace-nowrap text-slate-800 dark:text-slate-200 shadow-2xs">
            <Clock size={15} className="text-[#D4AF37] shrink-0" />
            <span className="font-mono font-bold tracking-tight tabular-nums">
              {formattedTime}
            </span>
            <span className="hidden 2xl:inline text-slate-400 dark:text-slate-500 text-[11px] font-medium border-l border-slate-200 dark:border-slate-700 pl-2">
              {formattedDate}
            </span>
          </div>

          {/* Notification Center (40x40 wrapper) */}
          {user && auth?.currentUser && (
            <div className="shrink-0">
              <NotificationCenter
                user={user}
                rolePermissions={rolePermissions}
                rolePermissionsReady={rolePermissionsReady}
                products={products}
                currentTab={currentTab}
                currentSubAction={currentSubAction}
                onNavigate={onNavigate}
              />
            </div>
          )}

          <div className="shrink-0">
            <ThemeToggle />
          </div>

        </div>
      </header>

      {/* Global Command Palette Search Modal */}
      {isSearchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchPalette
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
            onNavigate={onNavigate}
            user={user}
            rolePermissions={rolePermissions}
            products={products}
            onToggleTheme={onToggleTheme}
            onLogout={onLogout}
          />
        </Suspense>
      )}
    </>
  );
};
