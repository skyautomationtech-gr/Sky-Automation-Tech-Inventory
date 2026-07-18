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
  UserCircle,
  Users,
  ShoppingBag,
  Contact,
  Receipt,
  Coins,
  MessageSquare
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
}

export default function Sidebar({
  currentTab,
  setCurrentTab,
  user,
  onLogout,
  isOpen,
  setIsOpen,
  companyName
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
        border-r border-slate-800 transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 w-64 shadow-2xl' : '-translate-x-full lg:translate-x-0'}
        lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:flex-shrink-0
      `}>
        {/* Brand Header */}
        <div className="p-4 lg:p-6 border-b border-slate-800 flex items-center justify-center lg:justify-start">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Company Logo" className="w-10 h-10 lg:w-8 lg:h-8 rounded object-contain" />
            <div className="hidden lg:block">
              <h1 className="text-white font-black tracking-tight text-sm leading-tight uppercase">
                Sky Automation
              </h1>
              <p className="text-[9px] text-[#D4AF37] font-mono tracking-widest uppercase">
                Inventory Platform
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="flex-1 px-3 lg:px-4 py-6 space-y-6 overflow-y-auto overflow-x-hidden">
          <div>
            <div className="hidden lg:block text-[10px] uppercase text-slate-500 font-bold tracking-widest px-2 mb-2">Main Menu</div>
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
                    className={`w-full flex items-center justify-center lg:justify-start gap-3 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg transition-all duration-200 font-sans text-sm ${
                      isActive 
                        ? 'bg-slate-900 text-[#D4AF37] font-bold border-l-2 border-[#D4AF37] lg:pl-2' 
                        : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
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
            <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest px-2 mb-2">Sub-Brands</div>
            <div className="space-y-1 bg-slate-900/30 p-2 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#008080]"></span> GadgetZu
                </span>
                <span className="text-[9px] font-mono text-slate-500">GZ</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-500"></span> RTX Gadget
                </span>
                <span className="text-[9px] font-mono text-slate-500">RTX</span>
              </div>
              <div className="flex items-center justify-between px-2 py-1.5 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37]"></span> Sky Auto
                </span>
                <span className="text-[9px] font-mono text-slate-500">SAT</span>
              </div>
            </div>
          </div>
        </div>

        {/* User Info & Actions */}
        <div className="p-3 lg:p-4 border-t border-slate-800 bg-slate-900/20">
          <div className="flex items-center justify-center lg:justify-start gap-3 mb-4 p-2 rounded-xl lg:rounded-lg bg-slate-900/40 border border-slate-800">
            <div className="text-[#D4AF37] flex-shrink-0">
              {user?.role === 'admin' ? <ShieldCheck size={28} className="lg:size-8" /> : <UserCircle size={28} className="lg:size-8" />}
            </div>
            <div className="hidden lg:block min-w-0 flex-1">
              <h2 className="text-xs font-bold text-slate-100 truncate">{user?.name || 'Staff User'}</h2>
              <p className="text-[10px] text-slate-400 truncate font-mono">{user?.email}</p>
              <span className={`inline-block text-[9px] font-mono uppercase px-1.5 py-0.5 rounded-sm mt-1 font-bold ${
                user?.role === 'superadmin' 
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : user?.role === 'admin' 
                    ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20' 
                    : 'bg-[#008080]/10 text-teal-300 border border-[#008080]/20'
              }`}>
                {user?.role === 'superadmin' ? 'Super Admin' : user?.role === 'admin' ? 'Administrator' : 'Staff Access'}
              </span>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Logout"
            className="w-full flex items-center justify-center gap-2 px-3 py-3 lg:py-2 rounded-xl lg:rounded-lg border border-slate-800 hover:border-red-500/30 text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 font-sans text-xs"
          >
            <LogOut size={16} className="lg:size-3.5" />
            <span className="hidden lg:block">Logout System</span>
          </button>
        </div>
      </aside>
    </>
  );
}
