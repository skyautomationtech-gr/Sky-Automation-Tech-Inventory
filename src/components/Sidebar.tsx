import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
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
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { UserProfile } from '../types';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  user: UserProfile | null;
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
  user,
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
        ...(isSuperAdmin ? [{ id: 'design_system', name: 'Design System', icon: Sparkles, badge: 'Phase 1' }] : []),
      ],
    },
  ];

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
          ${isCollapsed ? 'lg:w-20' : 'lg:w-64'}
          lg:static lg:top-0 lg:h-screen lg:shrink-0 lg:flex-none
        `}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center gap-3 min-w-0">
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
            
            {!isCollapsed && (
              <div className="min-w-0">
                <h1 className="text-white font-extrabold tracking-tight text-xs uppercase truncate leading-tight font-sans">
                  {companyName || 'Sky Automation Tech'}
                </h1>
                <p className="text-[9px] text-[#D4AF37] font-mono tracking-widest uppercase">
                  Enterprise Platform
                </p>
              </div>
            )}
          </div>

          {/* Desktop collapse button in header */}
          {setIsCollapsed && (
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
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
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setCurrentTab(item.id);
                          setIsOpen(false);
                        }}
                        title={isCollapsed ? `${item.name} (${group.title})` : item.name}
                        className={`
                          w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-xs font-semibold cursor-pointer relative group
                          ${isCollapsed ? 'justify-center px-0' : 'justify-between'}
                          ${
                            isActive 
                              ? 'bg-slate-900/95 text-[#D4AF37] font-bold shadow-2xs border-l-2 border-[#D4AF37]' 
                              : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-100 border-l-2 border-transparent'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon 
                            size={18} 
                            className={`shrink-0 transition-colors ${
                              isActive ? 'text-[#D4AF37]' : 'text-slate-400 group-hover:text-slate-200'
                            }`} 
                          />
                          {!isCollapsed && (
                            <span className="truncate">{item.name}</span>
                          )}
                        </div>

                        {!isCollapsed && item.badge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#D4AF37]/20 text-[#D4AF37] rounded-md border border-[#D4AF37]/30">
                            {item.badge}
                          </span>
                        )}

                        {/* Hover Tooltip when collapsed */}
                        {isCollapsed && (
                          <div className="absolute left-full ml-2 px-2.5 py-1 bg-slate-900 text-white text-xs rounded-lg shadow-xl border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                            {item.name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>
            );
          })}

          {/* Issue Reporter Link */}
          <div className="pt-2 border-t border-slate-800/80">
            <a
              href="https://forms.gle/TH5uGex3LobzAyAu7"
              target="_blank"
              rel="noopener noreferrer"
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-xs text-slate-400 hover:bg-slate-900 hover:text-[#D4AF37]
                ${isCollapsed ? 'justify-center px-0' : 'justify-start'}
              `}
              title="সমস্যা জানান (Report Issue)"
            >
              <MessageSquare size={16} className="shrink-0 text-slate-400" />
              {!isCollapsed && <span className="truncate font-sans">সমস্যা জানান</span>}
            </a>
          </div>

          {/* Sub-brands indicator */}
          {!isCollapsed && (
            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 px-3 mb-1.5">
                Sub-Brands
              </div>
              <div className="grid grid-cols-3 gap-1.5 px-2">
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-center">
                  <span className="w-2 h-2 rounded-full bg-[#008080] mb-0.5"></span>
                  <span className="text-[9px] font-mono text-slate-400">GZ</span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-center">
                  <span className="w-2 h-2 rounded-full bg-orange-500 mb-0.5"></span>
                  <span className="text-[9px] font-mono text-slate-400">RTX</span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-slate-900/60 border border-slate-800/80 text-center">
                  <span className="w-2 h-2 rounded-full bg-[#D4AF37] mb-0.5"></span>
                  <span className="text-[9px] font-mono text-slate-400">SAT</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom User Action */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/90 shrink-0">
          <button
            type="button"
            onClick={onLogout}
            title="Sign Out of Console"
            className={`
              w-full flex items-center gap-2.5 p-2 rounded-xl border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs cursor-pointer font-bold
              ${isCollapsed ? 'justify-center' : 'justify-start'}
            `}
          >
            <LogOut size={16} className="shrink-0" />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
