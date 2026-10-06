import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ArrowUpDown, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
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
  Activity
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
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  isOpen,
  setIsOpen,
  companyName,
  logoUrl
}: SidebarProps) {
  const isPrivileged = user?.role === 'superadmin' || user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';

  const menuItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', name: 'Products & Brands', icon: Package },
    { id: 'stock', name: 'Stock Operations', icon: ArrowUpDown },
    { id: 'orders', name: 'Order Desk', icon: ShoppingBag },
    { id: 'invoices', name: 'Invoice Desk', icon: Receipt },
    { id: 'receivables', name: 'Due Payments', icon: Coins },
    { id: 'suppliers', name: 'Supplier Directory', icon: Truck },
    { id: 'reports', name: 'Reports & Analytics', icon: BarChart3 },
    ...(isPrivileged ? [{ id: 'audit_logs', name: 'Audit Logs', icon: Activity }] : []),
    ...(isSuperAdmin ? [{ id: 'financials', name: 'Income & Expense', icon: DollarSign }] : []),
    { id: 'customers', name: 'Customer Directory', icon: Contact },
    ...(isSuperAdmin ? [{ id: 'attendance', name: 'Attendance Log', icon: Users }] : []),
    ...(isPrivileged ? [{ id: 'users', name: 'Staff Permissions', icon: ShieldCheck }] : []),
    { id: 'settings', name: 'Company Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Menu Button - Moved to App.tsx header but keeping logic for safety if used elsewhere */}
      <div className="lg:hidden fixed top-4 left-4 z-50 pointer-events-none">
        {/* Button is now in App.tsx header, but we keep this here if needed or remove if strictly following App.tsx */}
      </div>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 bg-slate-950 text-slate-100 flex flex-col justify-between
        border-r border-slate-800 transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        lg:static lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:flex-none
      `}>
        {/* Brand Header */}
        <div className="p-4 lg:p-6 border-b border-slate-800 flex items-center justify-center lg:justify-start shrink-0">
          <div className="flex items-center gap-3">
            <img 
              src={logoUrl || "/sat_logo.jpg"} 
              alt="Sky Automation Tech Logo" 
              className="w-10 h-10 lg:w-8 lg:h-8 rounded object-contain bg-white p-0.5" 
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/sat_logo.jpg";
              }}
            />
            <div className="hidden lg:block">
              <h1 className="text-white font-black tracking-tight text-sm leading-tight uppercase">
                {companyName || 'Sky Automation Tech'}
              </h1>
              <p className="text-[9px] text-[#D4AF37] font-mono tracking-widest uppercase">
                Inventory Platform
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-3 lg:px-4 py-4 space-y-4 overflow-y-auto overflow-x-hidden min-h-0">
          <div>
            <div className="hidden lg:block text-sm uppercase text-slate-500 font-bold tracking-widest px-2 mb-2">Main Menu</div>
            <nav className="space-y-1.5 lg:space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentTab(item.id);
                      setIsOpen(false);
                    }}
                    title={item.name}
                    className={`w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg transition-colors font-sans text-sm cursor-pointer ${
                      isActive 
                        ? 'bg-slate-900 text-[#D4AF37] font-bold border-l-2 border-[#D4AF37]' 
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100 border-l-2 border-transparent'
                    }`}
                  >
                    <Icon size={isActive ? 20 : 18} className={`${isActive ? "text-[#D4AF37]" : "text-slate-400"} lg:size-4`} />
                    <span className="hidden lg:block truncate">{item.name}</span>
                  </button>
                );
              })}
            </nav>
            <a
              href="https://forms.gle/TH5uGex3LobzAyAu7"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 font-sans text-sm text-slate-400 hover:bg-slate-900 hover:text-[#D4AF37]"
            >
              <MessageSquare size={18} className="lg:size-4" />
              <span className="hidden lg:block truncate">সমস্যা জানান</span>
            </a>
          </div>

          <div className="hidden lg:block">
            <div className="text-sm uppercase text-slate-500 font-bold tracking-widest px-2 mb-2">Sub-Brands</div>
            <div className="space-y-1 bg-slate-900/30 p-2 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#008080]"></span> GadgetZu
                </span>
                <span className="text-[9px] font-mono text-slate-500">GZ</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-500"></span> RTX Gadget
                </span>
                <span className="text-[9px] font-mono text-slate-500">RTX</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-sm text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37]"></span> Sky Auto
                </span>
                <span className="text-[9px] font-mono text-slate-500">SAT</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="p-3 lg:p-4 border-t border-slate-800 bg-slate-900/20 shrink-0">
          <button
            onClick={onLogout}
            title="Logout"
            className="w-full flex items-center justify-center gap-2 px-3 py-3 lg:py-2.5 rounded-xl lg:rounded-lg border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 font-sans text-sm cursor-pointer"
          >
            <LogOut size={16} className="lg:size-4" />
            <span className="hidden lg:block font-medium">Logout System</span>
          </button>
        </div>
      </aside>
    </>
  );
}
