import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  PackagePlus,
  ArrowUpDown, 
  Settings, 
  LogOut, 
  ShieldCheck,
  Users, 
  ShoppingBag, 
  Contact, 
  Receipt, 
  Coins, 
  MessageSquare, 
  DollarSign, 
  Truck, 
  BarChart3, 
  Activity,
  Calculator,
  User,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { RolePermissionsMap, UserProfile } from '../types';
import {
  PRE_ORDER_NAV_ITEMS,
  hasPermission,
  isPreOrderTab,
} from '../preOrders/constants';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  onNavigate: (tab: string, subAction?: string, initialId?: string | null) => void;
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  onLogout: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  companyName: string;
  logoUrl?: string;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
}

interface MenuItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  onNavigate,
  user,
  rolePermissions = null,
  onLogout,
  isOpen,
  setIsOpen,
  companyName,
  logoUrl,
  isCollapsed = false,
  setIsCollapsed,
}: SidebarProps) {
  const isPrivileged = user?.role === 'superadmin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';
  const canViewPreOrders = hasPermission(user, rolePermissions, 'preOrderView');
  const isPreOrderActive = isPreOrderTab(currentTab);

  const [isPreOrderExpanded, setIsPreOrderExpanded] = useState<boolean>(isPreOrderActive);
  const [showCollapsedFlyout, setShowCollapsedFlyout] = useState<boolean>(false);
  const flyoutWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isPreOrderActive) {
      setIsPreOrderExpanded(true);
    }
  }, [isPreOrderActive]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (flyoutWrapperRef.current && !flyoutWrapperRef.current.contains(e.target as Node)) {
        setShowCollapsedFlyout(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const visiblePreOrderSubItems = PRE_ORDER_NAV_ITEMS.filter((item) =>
    hasPermission(user, rolePermissions, item.requiredPermission)
  );

  // Structured Menu Groups for Desktop App Shell
  const menuGroups: MenuGroup[] = [
    {
      title: 'Operations',
      items: [
        { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
        { id: 'products', name: 'Products & Brands', icon: Package },
        { id: 'stock', name: 'Stock Operations', icon: ArrowUpDown },
      ],
    },
    {
      title: 'Sales Desk',
      items: [
        { id: 'orders', name: 'Order Desk', icon: ShoppingBag },
        { id: 'invoices', name: 'Invoice Desk', icon: Receipt },
        { id: 'receivables', name: 'Due Payments', icon: Coins },
      ],
    },
    {
      title: 'Financials',
      items: [
        { id: 'accounting', name: 'Accounting Desk', icon: Calculator },
        ...(isSuperAdmin || user?.role === 'admin' || user?.role === 'manager'
          ? [{ id: 'financials', name: 'Income & Expense', icon: DollarSign }]
          : []),
        { id: 'suppliers', name: 'Supplier Directory', icon: Truck },
      ],
    },
    {
      title: 'People & CRM',
      items: [
        { id: 'customers', name: 'Customer Directory', icon: Contact },
        ...(isSuperAdmin ? [{ id: 'attendance', name: 'Attendance Log', icon: Users }] : []),
        ...(isPrivileged ? [{ id: 'users', name: 'Staff Permissions', icon: ShieldCheck }] : []),
      ],
    },
    {
      title: 'Intelligence & Audit',
      items: [
        { id: 'reports', name: 'Reports & Analytics', icon: BarChart3 },
        ...(isPrivileged ? [{ id: 'audit_logs', name: 'Audit Logs', icon: Activity }] : []),
      ],
    },
    {
      title: 'Administration',
      items: [
        { id: 'settings', name: 'Company Settings', icon: Settings },
        { id: 'profile', name: 'Profile Settings', icon: User },
      ],
    },
  ];

  const renderPreOrderGroup = () => {
    if (!canViewPreOrders) return null;

    if (isCollapsed) {
      return (
        <div
          ref={flyoutWrapperRef}
          className="relative"
          onMouseEnter={() => setShowCollapsedFlyout(true)}
          onMouseLeave={() => setShowCollapsedFlyout(false)}
        >
          <button
            type="button"
            onClick={() => setShowCollapsedFlyout((prev) => !prev)}
            className={`
              w-full flex items-center justify-center px-0 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer group relative
              ${isPreOrderActive
                ? 'bg-[#D4AF37] text-slate-950 shadow-md font-extrabold'
                : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
              }
            `}
            title="Pre-Order Management"
            aria-label="Pre-Order Management"
          >
            <PackagePlus
              size={18}
              className={`shrink-0 ${isPreOrderActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-[#D4AF37]'}`}
            />
          </button>

          {showCollapsedFlyout && (
            <div className="fixed left-[76px] ml-2 z-50 w-60 rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 shadow-2xl p-2 space-y-1 animate-fade-in">
              <div className="px-2.5 py-1.5 border-b border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">Pre-Order Management</span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 uppercase">
                  New
                </span>
              </div>
              <div className="space-y-0.5 pt-0.5">
                {visiblePreOrderSubItems.map((sub) => {
                  const subActive = currentTab === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        setCurrentTab(sub.id);
                        setShowCollapsedFlyout(false);
                        setIsOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left ${
                        subActive
                          ? 'bg-[#D4AF37] text-slate-950 font-bold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <ChevronRight
                        size={13}
                        className={`shrink-0 ${subActive ? 'text-slate-950' : 'text-slate-500'}`}
                      />
                      <span className="truncate">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setIsPreOrderExpanded((prev) => !prev)}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer group
            ${isPreOrderActive
              ? 'bg-slate-900 text-[#D4AF37] border border-[#D4AF37]/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
            }
          `}
          aria-expanded={isPreOrderExpanded}
        >
          <PackagePlus
            size={18}
            className={`shrink-0 ${isPreOrderActive ? 'text-[#D4AF37]' : 'text-slate-400 group-hover:text-[#D4AF37]'}`}
          />
          <span className="truncate flex-1 text-left">Pre-Order Management</span>
          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30 uppercase shrink-0">
            New
          </span>
          {isPreOrderExpanded ? (
            <ChevronDown size={14} className="shrink-0 text-slate-400" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-slate-400" />
          )}
        </button>

        {isPreOrderExpanded && (
          <div className="pl-4 space-y-0.5 border-l border-slate-800 ml-4">
            {visiblePreOrderSubItems.map((sub) => {
              const subActive = currentTab === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    setCurrentTab(sub.id);
                    setIsOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer group
                    ${subActive
                      ? 'bg-[#D4AF37] text-slate-950 shadow-sm font-extrabold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-900/70'
                    }
                  `}
                >
                  <ChevronRight
                    size={13}
                    className={`shrink-0 ${subActive ? 'text-slate-950' : 'text-slate-500 group-hover:text-[#D4AF37]'}`}
                  />
                  <span className="truncate flex-1 text-left">{sub.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-slate-950/70 z-40 backdrop-blur-xs transition-opacity animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 bg-slate-950 text-slate-100 flex flex-col justify-between
          border-r border-slate-800/80 shadow-2xl transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'}
          lg:static lg:top-0 lg:h-screen lg:shrink-0 lg:flex-none
        `}
      >
        {/* Brand Header (Height 64px to align with top bar) */}
        <div className="h-16 px-3 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-950/80 backdrop-blur-md">
          {!isCollapsed ? (
            <>
              <div 
                onClick={() => setIsCollapsed && setIsCollapsed(!isCollapsed)}
                className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                title="Collapse sidebar"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 shrink-0 shadow-xs">
                  <img 
                    src={logoUrl || "/sat_logo.jpg"} 
                    alt="Sky Automation Tech" 
                    className="w-full h-full rounded-lg object-contain bg-white p-0.5" 
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = "/sat_logo.jpg";
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-white font-extrabold tracking-tight text-xs uppercase truncate leading-tight font-sans">
                    {companyName || 'Sky Automation Tech'}
                  </h1>
                  <p className="text-[9px] text-[#D4AF37] font-mono tracking-widest uppercase">
                    Enterprise Platform
                  </p>
                </div>
              </div>

              {setIsCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer shrink-0 ml-1"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-center relative group">
              <div 
                onClick={() => setIsCollapsed && setIsCollapsed(!isCollapsed)}
                className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-1 cursor-pointer shadow-xs hover:border-[#D4AF37] transition-all"
                title="Expand sidebar"
              >
                <img 
                  src={logoUrl || "/sat_logo.jpg"} 
                  alt="Sky Automation Tech" 
                  className="w-full h-full rounded-lg object-contain bg-white p-0.5" 
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/sat_logo.jpg";
                  }}
                />
              </div>
              {setIsCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-[#D4AF37] text-slate-950 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Expand sidebar"
                >
                  <PanelLeftOpen size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation Menu (Grouped) */}
        <div className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar">
          {menuGroups.map((group, groupIdx) => {
            if (group.items.length === 0) return null;
            return (
              <div key={groupIdx} className="space-y-1">
                {/* Group Title (Only visible when expanded) */}
                {!isCollapsed ? (
                  <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 py-1">
                    {group.title}
                  </div>
                ) : (
                  <div className="w-full h-px bg-slate-800/80 my-2" />
                )}

                {/* Group Items */}
                <nav className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentTab(item.id);
                            setIsOpen(false); // Close mobile menu on select
                          }}
                          className={`
                            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer group relative
                            ${isActive 
                              ? 'bg-[#D4AF37] text-slate-950 shadow-md font-extrabold' 
                              : 'text-slate-400 hover:text-white hover:bg-slate-900/80'
                            }
                            ${isCollapsed ? 'justify-center px-0' : ''}
                          `}
                          title={isCollapsed ? item.name : undefined}
                        >
                          <Icon size={18} className={`shrink-0 ${isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-[#D4AF37]'}`} />
                          
                          {!isCollapsed && (
                            <span className="truncate flex-1 text-left">
                              {item.name}
                            </span>
                          )}

                          {!isCollapsed && item.badge && (
                            <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-amber-400 border border-slate-700">
                              {item.badge}
                            </span>
                          )}
                        </button>
                        {item.id === 'products' && renderPreOrderGroup()}
                      </React.Fragment>
                    );
                  })}
                </nav>
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer / User Mini Profile */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-3">
              <div 
                className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onNavigate('profile')}
                title="My Profile"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center uppercase shrink-0 shadow-xs">
                  {user?.name ? user.name.charAt(0) : 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {user?.name || 'Operator'}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono capitalize truncate">
                    {user?.role || 'Staff'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onLogout()}
                className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <button
                type="button"
                onClick={() => onNavigate('profile')}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center uppercase shadow-xs cursor-pointer"
                title="My Profile"
              >
                {user?.name ? user.name.charAt(0) : 'U'}
              </button>
              <button
                type="button"
                onClick={() => onLogout()}
                className="p-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Sign Out"
              >
                <LogOut size={18} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
