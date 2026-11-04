import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Menu, 
  PanelLeftClose, 
  PanelLeftOpen, 
  CheckCircle2, 
  Clock, 
  LogOut, 
  Settings, 
  Sparkles, 
  User as UserIcon, 
  ShieldCheck, 
  ArrowRight,
  Package,
  Receipt,
  ShoppingBag,
  Contact,
  X,
  Building2,
  Calendar
} from 'lucide-react';
import { UserProfile, Product, CompanySettings } from '../types';
import { LiveClockWidget } from './LiveClockWidget';
import NotificationCenter from './NotificationCenter';
import { ThemeToggle } from '../design-system/ThemeToggle';
import { TAB_DIRECTORY } from './Breadcrumbs';

interface TopBarProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  user: UserProfile | null;
  products?: Product[];
  companySettings: CompanySettings | null;
  onLogout: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapse: () => void;
  onOpenMobileSidebar: () => void;
  dataLoading?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onNavigate,
  user,
  products = [],
  companySettings,
  onLogout,
  isSidebarCollapsed,
  onToggleSidebarCollapse,
  onOpenMobileSidebar,
  dataLoading = false,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  // Global keyboard shortcut for search (⌘K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  // Focus search input when modal opens
  useEffect(() => {
    if (isSearchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isSearchOpen]);

  const isCheckedIn = user?.currentSessionStatus === 'checked_in';

  // Filtered search results for quick-jump command palette
  const filteredTabs = Object.entries(TAB_DIRECTORY).filter(([id, meta]) => {
    // Role filter
    if (id === 'financials' && user?.role !== 'superadmin' && user?.role !== 'admin' && user?.role !== 'manager') return false;
    if (id === 'attendance' && user?.role !== 'superadmin') return false;
    if (id === 'users' && user?.role !== 'superadmin' && user?.role !== 'admin') return false;
    if (id === 'audit_logs' && user?.role !== 'superadmin' && user?.role !== 'admin') return false;
    if (id === 'design_system' && user?.role !== 'superadmin') return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return meta.label.toLowerCase().includes(q) || meta.group.toLowerCase().includes(q) || id.includes(q);
  });

  const filteredProducts = products.filter(p => {
    if (!searchQuery.trim() || searchQuery.length < 2) return false;
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q);
  }).slice(0, 5);

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

  return (
    <>
      <header className="sticky top-0 z-30 h-16 w-full bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 lg:px-8 flex items-center justify-between transition-colors shadow-2xs">
        {/* Left Section: Collapse Sidebar & Breadcrumb Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Menu Button */}
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 -ml-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu size={20} />
          </button>

          {/* Desktop Collapse / Expand Sidebar Button */}
          <button
            type="button"
            onClick={onToggleSidebarCollapse}
            className="hidden lg:flex items-center justify-center p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 transition-colors cursor-pointer"
            title={isSidebarCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>

          {/* Current Page / Brand Label */}
          <div className="hidden sm:block min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono font-bold text-brand-gold uppercase tracking-widest">
                {companySettings?.companyName || 'Sky Automation Tech'}
              </span>
              {dataLoading && (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-500 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  Syncing
                </span>
              )}
            </div>
            <h2 className="text-sm lg:text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate capitalize">
              {currentTab.replace(/_/g, ' ')}
            </h2>
          </div>
        </div>

        {/* Center / Global Search Button (Soft UI styling) */}
        <div className="flex-1 max-w-md mx-4 hidden md:block">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="w-full h-10 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 text-xs flex items-center justify-between transition-all cursor-pointer shadow-inner focus:outline-none focus:ring-2 focus:ring-brand-gold/40 group"
          >
            <div className="flex items-center gap-2.5">
              <Search size={15} className="text-slate-400 group-hover:text-brand-gold transition-colors" />
              <span className="truncate">Quick jump to modules, products, SKU...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border border-slate-200 dark:border-slate-600 shadow-2xs">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>
        </div>

        {/* Right Section: HUD items, Check-in status, Theme, Notifications, User Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile search icon button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title="Search"
          >
            <Search size={18} />
          </button>

          {/* Check In / Out Status Tactile Chip */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs ${
              isCheckedIn
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/70'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/70'
            }`}
            title={isCheckedIn ? 'Operator active: Click to view Check Out desk' : 'Operator inactive: Click to Check In'}
          >
            <span className="relative flex h-2 w-2">
              {isCheckedIn && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isCheckedIn ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </span>
            <span className="hidden sm:inline">
              {isCheckedIn ? 'Checked In' : 'Checked Out'}
            </span>
          </button>

          {/* Live Clock Widget */}
          <LiveClockWidget variant="header" className="hidden xl:inline-flex" />

          {/* Notification Center */}
          <NotificationCenter user={user} products={products} onNavigate={onNavigate} />

          {/* Theme Toggle (Light / Dark) */}
          <ThemeToggle />

          {/* User Menu Dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen(prev => !prev)}
              className="flex items-center gap-2 p-1 pl-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-gold/40"
              aria-expanded={isUserMenuOpen}
              title={`${user?.name || 'User'} (${user?.role || 'Staff'})`}
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center uppercase shadow-2xs">
                {user?.name ? user.name.charAt(0) : 'U'}
              </div>
              <span className="hidden lg:block text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[100px]">
                {user?.name || 'Operator'}
              </span>
            </button>

            {/* Dropdown Menu (Glassmorphism surface) */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-800 shadow-2xl p-2 z-50 animate-scale-in">
                {/* Profile Card Summary */}
                <div className="p-3 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-sm flex items-center justify-center uppercase shadow-xs shrink-0">
                      {user?.name ? user.name.charAt(0) : 'U'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white truncate font-sans">
                        {user?.name || 'Authorized Operator'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate font-mono">
                        {user?.email || 'user@sat.com'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-md border ${getRoleBadgeColor(
                        user?.role
                      )}`}
                    >
                      {user?.role || 'Staff'}
                    </span>
                    {user?.subBrandAccess && user.subBrandAccess.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        Brands: {user.subBrandAccess.join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Navigation Links */}
                <div className="py-1 space-y-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('settings');
                      setIsUserMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-left"
                  >
                    <Settings size={15} className="text-slate-400" />
                    <span>Company & System Settings</span>
                  </button>

                  {(user?.role === 'superadmin') && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigate('design_system');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer text-left font-semibold"
                    >
                      <Sparkles size={15} />
                      <span>Design System Showcase</span>
                    </button>
                  )}
                </div>

                {/* Logout Button */}
                <div className="pt-1 mt-1 border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer text-left font-bold"
                  >
                    <LogOut size={15} />
                    <span>Sign Out of Platform</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Quick-Jump Command Palette Modal */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-950/60 backdrop-blur-md animate-fade-in"
          onClick={() => setIsSearchOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <Search size={20} className="text-brand-gold shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search modules, pages, products, SKU..."
                className="w-full bg-transparent text-sm lg:text-base font-medium text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
              <kbd className="px-2 py-1 text-[10px] font-mono font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <div className="max-h-96 overflow-y-auto p-3 space-y-4">
              {/* Modules / Pages */}
              <div>
                <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                  Workspace Modules
                </p>
                <div className="space-y-1 mt-1">
                  {filteredTabs.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">No matching modules</p>
                  ) : (
                    filteredTabs.slice(0, 8).map(([id, meta]) => {
                      const Icon = meta.icon;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            onNavigate(id);
                            setIsSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group-hover:bg-brand-gold/15 group-hover:text-brand-gold transition-colors">
                              <Icon size={16} />
                            </div>
                            <span>{meta.label}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ({meta.group})
                            </span>
                          </div>
                          <ArrowRight size={14} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Matching Products */}
              {filteredProducts.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="px-3 py-1 text-[11px] font-mono font-bold text-slate-400 uppercase tracking-widest">
                    Products ({filteredProducts.length})
                  </p>
                  <div className="space-y-1 mt-1">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onNavigate('products');
                          setIsSearchOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-left cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <Package size={15} className="text-brand-gold shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {p.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              SKU: {p.sku} • ৳{p.sellingPrice.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">View Catalog →</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer shortcuts */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>ProTip: Press <kbd className="font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">⌘K</kbd> anywhere</span>
              <span>Use Enter to select</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
