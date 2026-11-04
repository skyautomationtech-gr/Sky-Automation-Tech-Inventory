import React, { useState } from 'react';
import { 
  Sun, 
  Moon, 
  Plus, 
  Trash2, 
  Download, 
  Settings, 
  Check, 
  AlertCircle, 
  DollarSign, 
  Package, 
  ShoppingBag, 
  TrendingUp, 
  User, 
  Search,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Eye
} from 'lucide-react';
import { useTheme } from '../design-system/ThemeContext';
import { 
  Button, 
  IconButton, 
  ButtonGroup 
} from '../design-system/Button';
import { 
  FormField, 
  Input, 
  SearchInput, 
  PasswordInput, 
  CurrencyInput, 
  Textarea 
} from '../design-system/Input';
import { 
  Checkbox, 
  Radio, 
  ToggleSwitch 
} from '../design-system/SelectionControls';
import { 
  Select, 
  SelectOption 
} from '../design-system/Select';
import { 
  MultiSelectChips, 
  RemovableChip 
} from '../design-system/Chips';
import { 
  DatePicker, 
  DateRangePicker, 
  TimePicker 
} from '../design-system/DateTimePickers';
import { 
  Card, 
  GlassPanel, 
  EmptyState, 
  Skeleton 
} from '../design-system/Card';
import { StatCard } from '../design-system/StatCard';
import { 
  Modal, 
  ConfirmDialog, 
  Drawer 
} from '../design-system/Modal';
import { useToast } from '../design-system/Toast';
import { 
  Tooltip, 
  Popover 
} from '../design-system/TooltipPopover';
import { Badge } from '../design-system/Badge';
import { 
  ProgressBar, 
  ProgressRing 
} from '../design-system/Progress';
import { 
  Stepper, 
  Tabs, 
  Breadcrumb, 
  Pagination 
} from '../design-system/Navigation';
import { 
  DataTable, 
  Column 
} from '../design-system/DataTable';
import { UserProfile } from '../types';

interface DesignSystemShowcaseProps {
  user: UserProfile | null;
}

interface DemoProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  price: number;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { id: '1', sku: 'SAT-ANK-4921', name: 'Anker PowerPort III 20W GaN Charger', category: 'Adapters & Cables', stock: 45, price: 1450, status: 'In Stock' },
  { id: '2', sku: 'GZ-APP-2004', name: 'Apple 20W USB-C Power Adapter (UK)', category: 'Adapters & Cables', stock: 4, price: 2350, status: 'Low Stock' },
  { id: '3', sku: 'RTX-LOG-9100', name: 'Logitech MX Master 3S Wireless Mouse', category: 'Keyboards & Mice', stock: 18, price: 11900, status: 'In Stock' },
  { id: '4', sku: 'SAT-UGN-8812', name: 'UGREEN 100W GaN Fast Charger 4-Port', category: 'Adapters & Cables', stock: 0, price: 5400, status: 'Out of Stock' },
  { id: '5', sku: 'SAT-BAS-3310', name: 'Baseus Bowie H1 ANC Wireless Headphones', category: 'Audio & Sound', stock: 12, price: 4600, status: 'In Stock' },
  { id: '6', sku: 'GZ-SAM-1200', name: 'Samsung 45W Super Fast Charger 2.0', category: 'Adapters & Cables', stock: 29, price: 2850, status: 'In Stock' },
];

export const DesignSystemShowcase: React.FC<DesignSystemShowcaseProps> = ({ user }) => {
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();

  // State for interactive components
  const [activeSegmentTab, setActiveSegmentTab] = useState<'components' | 'tokens' | 'tables'>('components');
  const [activeUnderlineTab, setActiveUnderlineTab] = useState<string>('all');
  const [activeStep, setActiveStep] = useState<number>(1);
  const [toggleState, setToggleState] = useState<boolean>(true);
  const [checkboxState, setCheckboxState] = useState<boolean>(true);
  const [radioState, setRadioState] = useState<string>('opt1');
  const [selectedBrand, setSelectedBrand] = useState<string>('Anker');
  const [searchVal, setSearchVal] = useState<string>('');
  const [selectedChips, setSelectedChips] = useState<string[]>(['SAT', 'GZ']);
  const [dateVal, setDateVal] = useState<string>(new Date().toISOString().split('T')[0]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [timeVal, setTimeVal] = useState<string>('14:30');

  // Modal / Drawer states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Table selection state
  const [selectedProductIds, setSelectedProductIds] = useState<(string | number)[]>(['1']);

  // Guard: Super Admin only
  const isSuperAdmin = user?.role === 'superadmin' || (user?.role as string) === 'super_admin';
  if (!isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto my-16 text-center p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <ShieldCheck className="w-12 h-12 text-[#D4AF37] mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Super Admin Access Only</h3>
        <p className="text-xs text-slate-500 mt-1">This Design System Showcase is reserved for system administrators.</p>
      </div>
    );
  }

  const brandOptions: SelectOption[] = [
    { value: 'Anker', label: 'Anker Innovations', sublabel: 'Charging & Cables', badge: '14 items' },
    { value: 'Apple', label: 'Apple Original', sublabel: 'Official Accessories', badge: '8 items' },
    { value: 'Logitech', label: 'Logitech Masters', sublabel: 'Peripherals', badge: '22 items' },
    { value: 'UGREEN', label: 'UGREEN High-Tech', sublabel: 'GaN & Hubs', badge: '19 items' },
    { value: 'Baseus', label: 'Baseus Audio', sublabel: 'Lifestyle Gadgets', badge: '11 items' },
  ];

  const chipOptions = [
    { value: 'SAT', label: 'Sky Automation Tech', count: 142 },
    { value: 'GZ', label: 'GadgetZu', count: 87 },
    { value: 'RTX', label: 'RTX Gadget', count: 54 },
    { value: 'Accessories', label: 'Accessories', count: 32 },
  ];

  const tableColumns: Column<DemoProduct>[] = [
    {
      key: 'sku',
      header: 'SKU Code',
      sortable: true,
      width: '140px',
      render: (row) => <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">{row.sku}</span>,
    },
    {
      key: 'name',
      header: 'Product Details',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100 leading-tight">{row.name}</p>
          <span className="text-[11px] text-slate-400">{row.category}</span>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock Qty',
      sortable: true,
      align: 'center',
      render: (row) => (
        <span className="font-mono font-bold text-xs">
          {row.stock} pcs
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => {
        if (row.status === 'In Stock') return <Badge variant="success" dot>{row.status}</Badge>;
        if (row.status === 'Low Stock') return <Badge variant="warning" dot pulse>{row.status}</Badge>;
        return <Badge variant="danger" dot>{row.status}</Badge>;
      },
    },
    {
      key: 'price',
      header: 'Price (BDT)',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
          ৳{row.price.toLocaleString()}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full max-w-full space-y-8 font-sans pb-16">
      
      {/* Top Banner & Theme Switcher (Laptop Full-Width Header) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255] uppercase tracking-wider">
              Internal Review
            </span>
            <span className="text-xs font-mono text-slate-400">Phase 1 Design Foundation</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 font-display mt-1">
            SAT Design System Showcase
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
            Laptop-first design system with explicit hex tokens, soft-UI tactile controls, glassmorphic layered surfaces, and dark mode.
          </p>
        </div>

        {/* Live Theme Toggle & Navigation Segment */}
        <div className="flex items-center gap-3 shrink-0">
          <Tabs
            variant="segmented"
            tabs={[
              { id: 'components', label: 'All Components' },
              { id: 'tokens', label: 'Color Tokens' },
              { id: 'tables', label: 'Data Table' },
            ]}
            activeTab={activeSegmentTab}
            onChange={(tab) => setActiveSegmentTab(tab as any)}
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={toggleTheme}
            leftIcon={theme === 'dark' ? <Sun className="w-4 h-4 text-[#D4AF37]" /> : <Moon className="w-4 h-4 text-slate-600" />}
          >
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
      </div>

      {/* SECTION 1: DESIGN TOKENS (HEX Colors & Scales) */}
      {(activeSegmentTab === 'tokens' || activeSegmentTab === 'components') && (
        <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#D4AF37]" /> Brand Gold Palette & Semantic Hex Tokens (Zero OKLCH)</h3>}>
          <div className="space-y-4">
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Gold Brand Scale</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2 text-center text-xs">
                {[
                  { step: '50', hex: '#FDFBF2', darkText: true },
                  { step: '100', hex: '#FAF4DD', darkText: true },
                  { step: '200', hex: '#F3E6B2', darkText: true },
                  { step: '300', hex: '#EBD584', darkText: true },
                  { step: '400', hex: '#E2C255', darkText: true },
                  { step: '500', hex: '#D4AF37', isPrimary: true, darkText: true },
                  { step: '600', hex: '#B89628', darkText: true },
                  { step: '700', hex: '#93741E', darkText: false },
                  { step: '800', hex: '#6E5517', darkText: false },
                  { step: '900', hex: '#4A380F', darkText: false },
                  { step: '950', hex: '#261C05', darkText: false },
                ].map(item => (
                  <div key={item.step} className="rounded-xl p-2.5 flex flex-col justify-between shadow-2xs border border-black/5" style={{ backgroundColor: item.hex }}>
                    <span className={`text-[10px] font-mono font-bold ${item.darkText ? 'text-slate-950' : 'text-white'}`}>
                      {item.step} {item.isPrimary && '★'}
                    </span>
                    <span className={`text-[9px] font-mono mt-2 font-bold ${item.darkText ? 'text-slate-900' : 'text-slate-100'}`}>
                      {item.hex}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Semantic & Feedback Hex Colors</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-emerald-500 text-white font-mono text-xs flex justify-between items-center shadow-xs">
                  <span className="font-bold">Success</span>
                  <span>#10B981</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-500 text-slate-950 font-mono text-xs flex justify-between items-center shadow-xs font-bold">
                  <span>Warning</span>
                  <span>#F59E0B</span>
                </div>
                <div className="p-3 rounded-xl bg-rose-500 text-white font-mono text-xs flex justify-between items-center shadow-xs">
                  <span className="font-bold">Danger</span>
                  <span>#EF4444</span>
                </div>
                <div className="p-3 rounded-xl bg-blue-500 text-white font-mono text-xs flex justify-between items-center shadow-xs">
                  <span className="font-bold">Info</span>
                  <span>#3B82F6</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 2: STAT / KPI CARDS (Soft-UI Neumorphic with Animated Count-up) */}
      {(activeSegmentTab === 'components') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display">
              KPI & Stat Cards (Neumorphic Soft-UI + Animated Count-Up)
            </h3>
            <span className="text-xs text-slate-400">Desktop 4-column multi-grid</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Live Cash in Hand"
              value={24850}
              prefix="৳"
              variant="gold"
              icon={<DollarSign className="w-5 h-5 text-[#93741E] dark:text-[#E2C255]" />}
              trend={{ value: '+12.4%', isPositive: true, label: 'vs last week' }}
            />
            <StatCard
              label="Total Capital Investment"
              value={39550}
              prefix="৳"
              variant="default"
              icon={<TrendingUp className="w-5 h-5" />}
              trend={{ value: 'Active', label: 'Baseline Locked' }}
            />
            <StatCard
              label="Today's Orders Delivered"
              value={142}
              suffix="orders"
              variant="success"
              icon={<Package className="w-5 h-5" />}
              trend={{ value: '+8.1%', isPositive: true }}
            />
            <StatCard
              label="Pending Due Collectibles"
              value={6800}
              prefix="৳"
              variant="danger"
              icon={<AlertCircle className="w-5 h-5" />}
              trend={{ value: '3 overdue', isPositive: false }}
            />
          </div>
        </div>
      )}

      {/* SECTION 3: BUTTONS & INTERACTION CONTROLS */}
      {(activeSegmentTab === 'components') && (
        <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">Buttons & Action Controls (All States)</h3>}>
          <div className="space-y-5">
            {/* Variants */}
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Variants (Primary Gold, Secondary, Ghost, Danger, Soft-UI):</span>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary">Primary Gold</Button>
                <Button variant="secondary">Secondary Button</Button>
                <Button variant="ghost">Ghost Button</Button>
                <Button variant="danger">Danger Action</Button>
                <Button variant="soft">Soft Neumorphic</Button>
                <Button variant="primary" isLoading>Loading State</Button>
                <Button variant="primary" disabled>Disabled State</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Desktop Ergonomic Sizes (xs, sm, md, lg, xl):</span>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="xs" variant="secondary">Extra Small (28px)</Button>
                <Button size="sm" variant="secondary">Small (32px)</Button>
                <Button size="md" variant="primary">Medium Default (36px)</Button>
                <Button size="lg" variant="secondary">Large (44px)</Button>
                <Button size="xl" variant="primary">Extra Large (52px)</Button>
              </div>
            </div>

            {/* Icon Buttons & Button Groups */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Icon Buttons:</span>
                <div className="flex items-center gap-2">
                  <IconButton icon={<Plus className="w-4 h-4" />} variant="primary" aria-label="Add item" />
                  <IconButton icon={<Settings className="w-4 h-4" />} variant="secondary" aria-label="Settings" />
                  <IconButton icon={<Download className="w-4 h-4" />} variant="ghost" aria-label="Download" />
                  <IconButton icon={<Trash2 className="w-4 h-4" />} variant="danger" aria-label="Delete item" />
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Segmented Button Group:</span>
                <ButtonGroup>
                  <Button variant="secondary" size="sm">Day</Button>
                  <Button variant="primary" size="sm">Week</Button>
                  <Button variant="secondary" size="sm">Month</Button>
                  <Button variant="secondary" size="sm">Quarter</Button>
                </ButtonGroup>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 4: FORM FIELDS & INPUTS */}
      {(activeSegmentTab === 'components') && (
        <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">Form Inputs & Field Validation</h3>}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <FormField label="Standard Product Name" required hint="Enter full marketing name">
              <Input placeholder="e.g. Anker Soundcore 2" defaultValue="Anker PowerPort III 20W GaN" />
            </FormField>

            <FormField label="Search Field with Clear Button" hint="Soft-UI inset search">
              <SearchInput
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                onClear={() => setSearchVal('')}
                placeholder="Search products or orders..."
              />
            </FormField>

            <FormField label="Password with Eye Toggle" required>
              <PasswordInput defaultValue="SecurePass123!" />
            </FormField>

            <FormField label="Price in BDT (৳ Prefix)" required>
              <CurrencyInput defaultValue={1450} />
            </FormField>

            <FormField label="Input with Inline Validation Error" error="This SKU code is already registered in inventory">
              <Input defaultValue="SAT-ANK-4921" error />
            </FormField>

            <FormField label="Searchable Select Dropdown" required>
              <Select
                options={brandOptions}
                value={selectedBrand}
                onChange={(val) => setSelectedBrand(String(val))}
              />
            </FormField>

            <div className="col-span-full">
              <FormField label="Product Overview / Notes" hint="Rich multiline remarks">
                <Textarea rows={2} placeholder="Add description or internal warehouse notes..." />
              </FormField>
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 5: SELECTION CONTROLS (Checkbox, Radio, Soft-UI Switch, Chips) */}
      {(activeSegmentTab === 'components') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">Tactile Switches, Checkbox & Radio Controls</h3>}>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Soft-UI Neumorphic Toggle Switches:</span>
                <div className="flex flex-col gap-3">
                  <ToggleSwitch
                    checked={toggleState}
                    onChange={setToggleState}
                    label="Auto Push to Secondary Sky Reseller App"
                    description="Automatically mirrors product updates to reseller database"
                    size="md"
                  />
                  <ToggleSwitch
                    checked={true}
                    onChange={() => {}}
                    label="Large Toggle Switch Active"
                    size="lg"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Checkboxes:</span>
                  <div className="space-y-2">
                    <Checkbox
                      checked={checkboxState}
                      onChange={(e) => setCheckboxState(e.target.checked)}
                      label="Include in Daily Reconciliation"
                      description="Calculates cash flow"
                    />
                    <Checkbox checked={false} onChange={() => {}} label="Send Email Invoice" />
                    <Checkbox disabled checked={true} label="Disabled Selected" />
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Radios:</span>
                  <div className="space-y-2">
                    <Radio
                      name="demo-radio"
                      checked={radioState === 'opt1'}
                      onChange={() => setRadioState('opt1')}
                      label="Cash on Delivery (COD)"
                    />
                    <Radio
                      name="demo-radio"
                      checked={radioState === 'opt2'}
                      onChange={() => setRadioState('opt2')}
                      label="Bank / bKash Transfer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">Multi-Select Chips & Date/Time Controls</h3>}>
            <div className="space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Multi-Select Filter Chips:</span>
                <MultiSelectChips
                  options={chipOptions}
                  selected={selectedChips}
                  onChange={setSelectedChips}
                />
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-2">Removable Tag Chips:</span>
                <div className="flex flex-wrap gap-2">
                  <RemovableChip label="SAT Division" onRemove={() => {}} variant="gold" />
                  <RemovableChip label="In Stock Only" onRemove={() => {}} variant="default" />
                  <RemovableChip label="Pending Audit" onRemove={() => {}} variant="danger" />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Date Range Preset Picker:</span>
                <DateRangePicker
                  startDate={dateRange.start}
                  endDate={dateRange.end}
                  onChange={(start, end) => setDateRange({ start, end })}
                />
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SECTION 6: TOASTS, MODALS, DRAWERS, POPOVERS & PROGRESS */}
      {(activeSegmentTab === 'components') && (
        <Card header={<h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-display">Layered Surfaces (Modals, Toasts, Drawers, Popovers & Progress)</h3>}>
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
                Open Glass Modal
              </Button>
              <Button variant="danger" onClick={() => setIsConfirmOpen(true)}>
                Open Confirm Dialog
              </Button>
              <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
                Open Side Drawer
              </Button>
              
              <Button
                variant="primary"
                onClick={() => toast.success('Cash reconciliation balanced at ৳2,250 BDT.', 'Success!')}
              >
                Trigger Success Toast
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.error('Connection interrupted. Offline sandbox active.', 'Attention')}
              >
                Trigger Error Toast
              </Button>

              <Tooltip content="Tooltip showing SKU shortcut info" position="top">
                <Button variant="ghost">Hover Tooltip</Button>
              </Tooltip>

              <Popover
                title="Quick Profile HUD"
                trigger={<Button variant="secondary" size="sm">Open Popover</Button>}
              >
                <div className="space-y-1.5">
                  <p className="font-semibold text-slate-900 dark:text-slate-100">Super Administrator</p>
                  <p className="text-[11px] text-slate-500">skyautomationtech@gmail.com</p>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <Badge variant="gold">SAT SuperAdmin</Badge>
                  </div>
                </div>
              </Popover>
            </div>

            {/* Progress Bar & Ring */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              <div className="space-y-3">
                <ProgressBar value={72} label="Daily Sales Target" showPercentage variant="gold" />
                <ProgressBar value={40} label="Storage Capacity" showPercentage variant="info" size="sm" />
              </div>

              <div className="flex items-center justify-around gap-4">
                <div className="text-center">
                  <ProgressRing value={85} size={70} strokeWidth={6} variant="gold" />
                  <span className="text-[11px] text-slate-400 block mt-1">Audit Score</span>
                </div>
                <div className="text-center">
                  <ProgressRing value={94} size={70} strokeWidth={6} variant="success" />
                  <span className="text-[11px] text-slate-400 block mt-1">Fulfillment</span>
                </div>
              </div>

              {/* Badges / Status Pills */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="gold">Gold Status</Badge>
                <Badge variant="success" dot>Delivered</Badge>
                <Badge variant="warning" dot pulse>Pending Review</Badge>
                <Badge variant="danger" dot>Out of Stock</Badge>
                <Badge variant="info">In Transit</Badge>
                <Badge variant="subBrand">SAT Division</Badge>
              </div>
            </div>

            {/* Stepper Wizard Indicator */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 block mb-3">Order Checkout Stepper:</span>
              <Stepper
                steps={[
                  { id: 1, label: 'Catalog Selection', description: 'Choose products' },
                  { id: 2, label: 'Customer Connection', description: 'Address & phone' },
                  { id: 3, label: 'Payment & Advance', description: 'Cash / gateway' },
                  { id: 4, label: 'Invoice Generated', description: 'Receipt print' },
                ]}
                activeStep={activeStep}
                onStepClick={setActiveStep}
              />
            </div>
          </div>
        </Card>
      )}

      {/* SECTION 7: DATA TABLE (Laptop-first Full Width) */}
      {(activeSegmentTab === 'tables' || activeSegmentTab === 'components') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-display">
                Desktop Data Table (Sticky Headers, Sortable, Multi-Select Checkboxes)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Full laptop screen width utilization, sticky header row with backdrop blur, row hover, and pagination.
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-slate-500">
              {selectedProductIds.length} items selected
            </span>
          </div>

          <DataTable
            columns={tableColumns}
            data={DEMO_PRODUCTS}
            selectable
            selectedIds={selectedProductIds}
            onSelectionChange={setSelectedProductIds}
            actions={(row) => (
              <div className="flex items-center gap-1">
                <Button size="xs" variant="secondary" onClick={() => toast.info(`Viewing ${row.name}`)}>
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                <Button size="xs" variant="primary" onClick={() => toast.success(`Order initiated for ${row.name}`)}>
                  Order
                </Button>
              </div>
            )}
          />
        </div>
      )}

      {/* DEMO MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Glassmorphic Layered Modal"
        subtitle="Desktop 1280px+ centered overlay with translucent backdrop blur"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(false)}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            This modal uses clean translucent backdrop blur with subtle borders. Notice the typography renders both English and Bengali clearly:
          </p>
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            বাংলা টেক্সট টেস্ট: আজকের নগদ ক্যাশ ব্যালেন্স ৳২,২৫০ এবং মোট মূলধন বিনিয়োগ ৳৩৯,৫৫০।
          </div>
        </div>
      </Modal>

      {/* DEMO CONFIRM DIALOG */}
      <ConfirmDialog
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false);
          toast.success('Confirmed action successfully.');
        }}
        title="Confirm Inventory Stock Reset?"
        message="Are you sure you want to reset stock levels? This will create an audit trail record."
        variant="danger"
        confirmLabel="Yes, Reset"
      />

      {/* DEMO DRAWER */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Side Drawer / Slide-Over Panel"
        subtitle="Desktop slide-in inspector"
        footer={<Button variant="primary" fullWidth onClick={() => setIsDrawerOpen(false)}>Close Drawer</Button>}
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Right slide-over panel designed for laptop desktop viewing.
          </p>
          <EmptyState
            icon={<ShoppingBag className="w-6 h-6" />}
            title="Drawer Inspector Ready"
            description="Inspect orders, audit logs, and customer profiles without leaving the main page."
          />
        </div>
      </Drawer>

    </div>
  );
};
