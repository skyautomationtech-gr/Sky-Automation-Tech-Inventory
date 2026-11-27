import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LogOut,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { RolePermissionsMap, SubBrand, UserProfile } from '../types';
import {
  SidebarBadgeCounts,
  SidebarGroup,
  SidebarSubItem,
  buildSidebarGroups,
  findActiveNavigationMatch,
  isSidebarSubItemActive,
} from '../navigation/sidebarConfig';
import {
  formatBrandBadgeMeta,
  getSellingSubBrands,
  getUserAllowedSubBrandIds,
} from '../utils/subBrands';

interface SidebarProps {
  currentTab: string;
  currentSubAction?: string;
  setCurrentTab: (tab: string, subAction?: string, initialId?: string | null) => void;
  onNavigate: (tab: string, subAction?: string, initialId?: string | null) => void;
  user: UserProfile | null;
  rolePermissions?: RolePermissionsMap | null;
  badges?: SidebarBadgeCounts;
  onLogout: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  companyName: string;
  logoUrl?: string;
  isCollapsed?: boolean;
  setIsCollapsed?: (collapsed: boolean) => void;
  subBrands?: SubBrand[];
  globalBrandFilter?: string;
  onGlobalBrandFilterChange?: (brandFilter: string) => void;
}

export default function Sidebar({
  currentTab,
  currentSubAction,
  setCurrentTab,
  onNavigate,
  user,
  rolePermissions = null,
  badges = {},
  onLogout,
  isOpen,
  setIsOpen,
  companyName,
  logoUrl,
  isCollapsed = false,
  setIsCollapsed,
  subBrands = [],
  globalBrandFilter = 'ALL',
  onGlobalBrandFilterChange,
}: SidebarProps) {
  const storageKey = `sat_sidebar_open_group_${user?.id || 'guest'}`;

  const activeSellingSubBrands = useMemo(
    () => getSellingSubBrands(subBrands, { includeInactive: false }),
    [subBrands]
  );

  const userAllowedBrandIds = useMemo(
    () => getUserAllowedSubBrandIds(user, subBrands),
    [user, subBrands]
  );

  const isAdminOrSuperAdmin =
    user?.role === 'superadmin' || user?.role === 'admin' || (user?.role as string) === 'super_admin';

  const visibleBrandOptions = useMemo(() => {
    if (isAdminOrSuperAdmin) return activeSellingSubBrands;
    if (userAllowedBrandIds.length === 0) return activeSellingSubBrands;
    return activeSellingSubBrands.filter((sb) => userAllowedBrandIds.includes(sb.shortCode));
  }, [isAdminOrSuperAdmin, activeSellingSubBrands, userAllowedBrandIds]);

  const activeBrandMeta = useMemo(() => {
    if (!globalBrandFilter || globalBrandFilter === 'ALL') return null;
    if (globalBrandFilter === 'LEGACY_SAT') return formatBrandBadgeMeta('SAT', subBrands);
    return formatBrandBadgeMeta(globalBrandFilter, subBrands);
  }, [globalBrandFilter, subBrands]);

  const menuGroups = useMemo(
    () => buildSidebarGroups({ user, rolePermissions, badges }),
    [user, rolePermissions, badges]
  );

  const activeMatch = useMemo(
    () => findActiveNavigationMatch(menuGroups, currentTab, currentSubAction),
    [menuGroups, currentTab, currentSubAction]
  );

  const [openGroupId, setOpenGroupId] = useState<string | null>(() => {
    const activeGroup = activeMatch?.group;
    if (activeGroup && !activeGroup.singleTab) {
      return activeGroup.id;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && menuGroups.some((g) => g.id === saved && !g.singleTab)) {
        return saved;
      }
    } catch {}
    return 'inventory';
  });

  // Collapsed flyout state
  const [hoveredFlyout, setHoveredFlyout] = useState<{
    groupId: string;
    top: number;
  } | null>(null);
  const flyoutContainerRef = useRef<HTMLDivElement>(null);
  const closeFlyoutTimerRef = useRef<number | null>(null);

  // Restore remembered group on user change if on Dashboard
  useEffect(() => {
    if (activeMatch?.group && !activeMatch.group.singleTab) {
      setOpenGroupId(activeMatch.group.id);
      try {
        localStorage.setItem(storageKey, activeMatch.group.id);
      } catch {}
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved && menuGroups.some((g) => g.id === saved && !g.singleTab)) {
        setOpenGroupId(saved);
      }
    } catch {}
  }, [storageKey]);

  // Auto-open the group containing the active page on navigation
  useEffect(() => {
    if (activeMatch?.group && !activeMatch.group.singleTab) {
      setOpenGroupId(activeMatch.group.id);
      try {
        localStorage.setItem(storageKey, activeMatch.group.id);
      } catch {}
    }
  }, [activeMatch?.group?.id, activeMatch?.group?.singleTab, storageKey]);

  // Close flyout on outside click or collapse toggle
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        flyoutContainerRef.current &&
        !flyoutContainerRef.current.contains(e.target as Node)
      ) {
        setHoveredFlyout(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isCollapsed) {
      setHoveredFlyout(null);
    }
  }, [isCollapsed]);

  const handleToggleGroup = (groupId: string) => {
    setOpenGroupId((prev) => {
      const next = prev === groupId ? null : groupId;
      if (next) {
        try {
          localStorage.setItem(storageKey, next);
        } catch {}
      }
      return next;
    });
  };

  const handleSelectSubItem = (sub: SidebarSubItem, groupId: string) => {
    setOpenGroupId(groupId);
    try {
      localStorage.setItem(storageKey, groupId);
    } catch {}
    setCurrentTab(sub.tab, sub.subAction);
    setHoveredFlyout(null);
    setIsOpen(false);
  };

  const handleSelectSingleGroup = (group: SidebarGroup) => {
    if (!group.singleTab) return;
    setCurrentTab(group.singleTab);
    setHoveredFlyout(null);
    setIsOpen(false);
  };

  const openFlyoutForElement = (groupId: string, el: HTMLElement) => {
    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current);
      closeFlyoutTimerRef.current = null;
    }
    const rect = el.getBoundingClientRect();
    const maxTop = Math.max(12, window.innerHeight - 360);
    const clampedTop = Math.min(Math.max(12, rect.top), maxTop);
    setHoveredFlyout({ groupId, top: clampedTop });
  };

  const scheduleCloseFlyout = () => {
    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current);
    }
    closeFlyoutTimerRef.current = window.setTimeout(() => {
      setHoveredFlyout(null);
    }, 140);
  };

  const cancelCloseFlyout = () => {
    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current);
      closeFlyoutTimerRef.current = null;
    }
  };

  const renderBadgeCount = (sub: SidebarSubItem, isActive: boolean) => {
    if (!sub.badgeCount || sub.badgeCount <= 0) return null;
    const toneClasses = isActive
      ? 'bg-slate-950/15 text-slate-950 border-slate-950/20'
      : sub.badgeTone === 'danger'
        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
        : sub.badgeTone === 'amber'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300/60 dark:border-slate-700';

    return (
      <span
        className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full border leading-none shrink-0 ${toneClasses}`}
      >
        {sub.badgeCount}
      </span>
    );
  };

  const activeFlyoutGroup = hoveredFlyout
    ? menuGroups.find((g) => g.id === hoveredFlyout.groupId)
    : null;

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-slate-950/60 z-40 backdrop-blur-xs transition-opacity animate-fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container (Glass Style, Light & Dark Mode) */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col justify-between
          bg-white/85 dark:bg-slate-950/90 backdrop-blur-xl
          text-slate-800 dark:text-slate-100
          border-r border-slate-200/90 dark:border-slate-800/80
          shadow-xl dark:shadow-2xl transition-all duration-300 ease-in-out
          ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'}
          ${isCollapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'}
          lg:static lg:top-0 lg:h-screen lg:shrink-0 lg:flex-none
        `}
      >
        {/* Brand Header (Height 64px to align with top bar) */}
        <div className="h-16 px-3 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between shrink-0 bg-white/70 dark:bg-slate-950/80 backdrop-blur-md">
          {!isCollapsed ? (
            <>
              <div
                onClick={() => setIsCollapsed && setIsCollapsed(!isCollapsed)}
                className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                title="Collapse sidebar"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1 shrink-0 shadow-xs">
                  <img
                    src={logoUrl || '/sat_logo.jpg'}
                    alt="Sky Automation Tech"
                    className="w-full h-full rounded-lg object-contain bg-white p-0.5"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/sat_logo.jpg';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-slate-900 dark:text-white font-extrabold tracking-tight text-xs uppercase truncate leading-tight font-sans">
                    {companyName || 'Sky Automation Tech'}
                  </h1>
                  <p className="text-[9px] text-amber-600 dark:text-[#D4AF37] font-mono tracking-widest uppercase truncate">
                    Parent Importer HQ
                  </p>
                </div>
              </div>

              {setIsCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors cursor-pointer shrink-0 ml-1"
                  title="Collapse sidebar"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose size={18} />
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-center relative group">
              <div
                onClick={() => setIsCollapsed && setIsCollapsed(!isCollapsed)}
                className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center p-1 cursor-pointer shadow-xs hover:border-[#D4AF37] transition-all"
                title="Expand sidebar"
              >
                <img
                  src={logoUrl || '/sat_logo.jpg'}
                  alt="Sky Automation Tech"
                  className="w-full h-full rounded-lg object-contain bg-white p-0.5"
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/sat_logo.jpg';
                  }}
                />
              </div>
              {setIsCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="absolute -right-1 -bottom-1 w-5 h-5 rounded-full bg-[#D4AF37] text-slate-950 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <PanelLeftOpen size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Selling Brand Scope Switcher (Sidebar-only; never placed in TopBar) */}
        {onGlobalBrandFilterChange && (
          <div className="px-3 py-2 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
            {isCollapsed ? (
              <button
                type="button"
                onClick={() => {
                  if (!isAdminOrSuperAdmin && visibleBrandOptions.length <= 1) return;
                  const cycleOrder = [
                    'ALL',
                    ...visibleBrandOptions.map((b) => b.shortCode),
                    ...(isAdminOrSuperAdmin ? ['LEGACY_SAT'] : []),
                  ];
                  const idx = cycleOrder.indexOf(globalBrandFilter || 'ALL');
                  const next = cycleOrder[(idx + 1) % cycleOrder.length] || 'ALL';
                  onGlobalBrandFilterChange(next);
                }}
                title={
                  activeBrandMeta
                    ? `Active Scope: ${activeBrandMeta.label} (Click to switch)`
                    : 'Active Scope: All Selling Brands (Click to switch)'
                }
                className="w-full flex items-center justify-center py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-[10px] font-mono font-bold cursor-pointer hover:border-amber-400 transition-colors"
                style={
                  activeBrandMeta
                    ? {
                        color: activeBrandMeta.accentColor,
                        borderColor: activeBrandMeta.badgeStyle.borderColor,
                        backgroundColor: activeBrandMeta.badgeStyle.backgroundColor,
                      }
                    : undefined
                }
              >
                {activeBrandMeta ? activeBrandMeta.shortLabel.slice(0, 4) : 'ALL'}
              </button>
            ) : !isAdminOrSuperAdmin && visibleBrandOptions.length === 1 ? (
              <div className="space-y-1">
                <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400 block">
                  Assigned Brand
                </span>
                <div
                  className="px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-2"
                  style={
                    formatBrandBadgeMeta(visibleBrandOptions[0].shortCode, subBrands).badgeStyle
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: visibleBrandOptions[0].accentColor }}
                  />
                  <span className="truncate">
                    {visibleBrandOptions[0].name} ({visibleBrandOptions[0].shortCode})
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
                    Selling Brand Scope
                  </span>
                  {activeBrandMeta && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: activeBrandMeta.accentColor }}
                    />
                  )}
                </div>
                <select
                  value={globalBrandFilter || 'ALL'}
                  onChange={(e) => onGlobalBrandFilterChange(e.target.value)}
                  aria-label="Selling Brand Scope"
                  className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-[#D4AF37] cursor-pointer"
                >
                  <option value="ALL">All Selling Brands</option>
                  {visibleBrandOptions.map((sb) => (
                    <option key={sb.shortCode} value={sb.shortCode}>
                      {sb.name} ({sb.shortCode})
                    </option>
                  ))}
                  {isAdminOrSuperAdmin && (
                    <option value="LEGACY_SAT">Legacy Records (SAT)</option>
                  )}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Navigation Menu (Accordion Groups) */}
        <div
          ref={flyoutContainerRef}
          className="flex-1 px-2.5 py-3 space-y-1.5 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar"
        >
          {menuGroups.map((group) => {
            const GroupIcon = group.icon;
            const isSingle = Boolean(group.singleTab);
            const isGroupActive = activeMatch?.group.id === group.id;
            const isExpanded = !isSingle && openGroupId === group.id;

            // Collapsed Sidebar: Icon-only rail + hover/click flyout
            if (isCollapsed) {
              return (
                <div
                  key={group.id}
                  className="relative flex justify-center"
                  onMouseEnter={(e) => {
                    if (!isSingle) {
                      openFlyoutForElement(group.id, e.currentTarget);
                    }
                  }}
                  onMouseLeave={() => {
                    if (!isSingle) {
                      scheduleCloseFlyout();
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      if (isSingle) {
                        handleSelectSingleGroup(group);
                      } else if (hoveredFlyout?.groupId === group.id) {
                        setHoveredFlyout(null);
                      } else {
                        openFlyoutForElement(group.id, e.currentTarget);
                      }
                    }}
                    className={`
                      w-11 h-10 flex items-center justify-center rounded-xl transition-all cursor-pointer group relative
                      ${isGroupActive
                        ? isSingle
                          ? 'bg-[#D4AF37] text-slate-950 shadow-md'
                          : 'bg-amber-50 dark:bg-slate-900 text-amber-700 dark:text-[#D4AF37] border border-[#D4AF37]/40'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900/80'
                      }
                    `}
                    title={group.title}
                    aria-label={group.title}
                    aria-expanded={!isSingle ? hoveredFlyout?.groupId === group.id : undefined}
                  >
                    <GroupIcon
                      size={18}
                      className={`shrink-0 ${
                        isGroupActive
                          ? isSingle
                            ? 'text-slate-950'
                            : 'text-amber-600 dark:text-[#D4AF37]'
                          : 'text-slate-500 dark:text-slate-400 group-hover:text-[#D4AF37]'
                      }`}
                    />
                    {group.badgeText && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
                    )}
                  </button>
                </div>
              );
            }

            // Single top-level item (Dashboard)
            if (isSingle) {
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => handleSelectSingleGroup(group)}
                  title={group.title}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer group
                    ${isGroupActive
                      ? 'bg-[#D4AF37] text-slate-950 shadow-md font-bold'
                      : 'font-medium text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/80'
                    }
                  `}
                >
                  <GroupIcon
                    size={18}
                    className={`shrink-0 ${
                      isGroupActive
                        ? 'text-slate-950'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-[#D4AF37]'
                    }`}
                  />
                  <span className="truncate flex-1 text-left">{group.title}</span>
                </button>
              );
            }

            // Expandable Accordion Group (Pre-Order Management visual style)
            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => handleToggleGroup(group.id)}
                  title={group.title}
                  aria-expanded={isExpanded}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer group
                    ${isGroupActive
                      ? 'bg-amber-50/90 dark:bg-slate-900 text-amber-800 dark:text-[#D4AF37] border border-[#D4AF37]/40 dark:border-[#D4AF37]/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/80 border border-transparent'
                    }
                  `}
                >
                  <GroupIcon
                    size={18}
                    className={`shrink-0 ${
                      isGroupActive
                        ? 'text-amber-600 dark:text-[#D4AF37]'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-[#D4AF37]'
                    }`}
                  />
                  <span className="truncate flex-1 text-left">{group.title}</span>

                  {group.badgeText && (
                    <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase shrink-0">
                      {group.badgeText}
                    </span>
                  )}

                  <ChevronRight
                    size={14}
                    className={`shrink-0 text-slate-400 transition-transform duration-200 ease-out ${
                      isExpanded ? 'rotate-90 text-amber-600 dark:text-[#D4AF37]' : ''
                    }`}
                  />
                </button>

                {/* Animated Accordion Panel (200ms smooth grid-rows transition) */}
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                    isExpanded
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0 pointer-events-none'
                  }`}
                >
                  <div className="overflow-hidden">
                    <nav className="pl-3.5 ml-4 border-l border-slate-200 dark:border-slate-800 space-y-0.5 py-0.5">
                      {group.items.map((sub) => {
                        const subActive = isSidebarSubItemActive(
                          sub,
                          currentTab,
                          currentSubAction
                        );
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleSelectSubItem(sub, group.id)}
                            title={sub.label}
                            className={`
                              w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer group
                              ${subActive
                                ? 'bg-[#D4AF37] text-slate-950 shadow-sm font-bold'
                                : 'font-normal text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-900/70'
                              }
                            `}
                          >
                            <ChevronRight
                              size={13}
                              className={`shrink-0 ${
                                subActive
                                  ? 'text-slate-950'
                                  : 'text-slate-400 dark:text-slate-500 group-hover:text-[#D4AF37]'
                              }`}
                            />
                            <span className="truncate flex-1 text-left">
                              {sub.label}
                            </span>
                            {renderBadgeCount(sub, subActive)}
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Collapsed Flyout Menu */}
          {isCollapsed && activeFlyoutGroup && hoveredFlyout && (
            <div
              style={{ top: `${hoveredFlyout.top}px` }}
              onMouseEnter={cancelCloseFlyout}
              onMouseLeave={scheduleCloseFlyout}
              className="fixed left-[76px] ml-2 z-50 w-64 max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/90 dark:border-slate-700/80 shadow-2xl p-2 space-y-1 animate-fade-in"
            >
              <div className="px-2.5 py-1.5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {activeFlyoutGroup.title}
                </span>
                {activeFlyoutGroup.badgeText && (
                  <span className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 uppercase shrink-0">
                    {activeFlyoutGroup.badgeText}
                  </span>
                )}
              </div>
              <div className="space-y-0.5 pt-0.5">
                {activeFlyoutGroup.items.map((sub) => {
                  const subActive = isSidebarSubItemActive(
                    sub,
                    currentTab,
                    currentSubAction
                  );
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSelectSubItem(sub, activeFlyoutGroup.id)}
                      title={sub.label}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                        subActive
                          ? 'bg-[#D4AF37] text-slate-950 font-bold'
                          : 'font-normal text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <ChevronRight
                        size={13}
                        className={`shrink-0 ${
                          subActive
                            ? 'text-slate-950'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                      <span className="truncate flex-1">{sub.label}</span>
                      {renderBadgeCount(sub, subActive)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Footer / User Mini Profile (Fixed at Bottom) */}
        <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/70 shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  onNavigate('profile');
                  setIsOpen(false);
                }}
                title="Profile Settings"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center uppercase shrink-0 shadow-xs">
                  {user?.name ? user.name.charAt(0) : 'U'}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {user?.name || 'Operator'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono capitalize truncate">
                    {user?.role || 'Staff'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onLogout()}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <button
                type="button"
                onClick={() => {
                  onNavigate('profile');
                  setIsOpen(false);
                }}
                className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 font-black text-xs flex items-center justify-center uppercase shadow-xs cursor-pointer"
                title="Profile Settings"
                aria-label="Profile Settings"
              >
                {user?.name ? user.name.charAt(0) : 'U'}
              </button>
              <button
                type="button"
                onClick={() => onLogout()}
                className="p-2.5 rounded-xl text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
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
