import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Globe,
  Lock,
  Package,
  Paperclip,
  Plane,
  Plus,
  RotateCcw,
  Search,
  Ship,
  ShieldAlert,
  Store,
  Truck,
} from 'lucide-react';
import {
  Category,
  CompanySettings,
  PreOrder,
  PreOrderPrivateCost,
  PreOrderSupplierPayment,
  RolePermissionsMap,
  Supplier,
  UserProfile,
} from '../../types';
import {
  addSupplier,
  findDuplicateSupplier,
  getSuppliers,
  updateSupplier,
} from '../../firebase/db';
import {
  getPreOrderPrivateCostsMap,
  getPreOrderSupplierPaymentsBySupplier,
  getPreOrdersBySupplier,
} from '../../firebase/preOrderDb';
import {
  computeItemCostMap,
  formatBDT,
  formatPreOrderProductLabel,
  hasPermission,
  isPreOrderAdminRole,
  isPreOrderOverdue,
  normalizePreOrderItems,
} from '../../preOrders/constants';
import { fromPaisa, toPaisa } from '../../preOrders/calculations';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from '../../design-system';
import { PreOrderStatusBadge } from './PreOrderStatusBadge';
import PreOrderDetailDrawer from './PreOrderDetailDrawer';
import {
  RecordSupplierPaymentModal,
  ReverseSupplierPaymentModal,
} from './SupplierPaymentModal';

const SOURCING_PLATFORMS = [
  '1688',
  'Taobao',
  'AliExpress',
  'Alibaba',
  'Direct factory',
  'Agent',
  'Other',
];

export interface PreOrderSupplierManagementViewProps {
  user: UserProfile;
  rolePermissions: RolePermissionsMap | null;
  categories: Category[];
  companySettings?: CompanySettings | null;
}

type SupplierDetailTab = 'profile' | 'preorders' | 'payments' | 'shipments';

export const PreOrderSupplierManagementView: React.FC<PreOrderSupplierManagementViewProps> = ({
  user,
  rolePermissions,
  categories,
  companySettings,
}) => {
  const toast = useToast();
  const isAdmin = isPreOrderAdminRole(user.role);
  const canAccess = hasPermission(user, rolePermissions, 'preOrderSupplier') || isAdmin;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [chinaOnlyFilter, setChinaOnlyFilter] = useState<'all' | 'china'>('all');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Detail selection
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [detailTab, setDetailTab] = useState<SupplierDetailTab>('profile');
  const [detailLoading, setDetailLoading] = useState(false);
  const [supplierOrders, setSupplierOrders] = useState<PreOrder[]>([]);
  const [supplierCostsMap, setSupplierCostsMap] = useState<Record<string, PreOrderPrivateCost>>({});
  const [supplierPayments, setSupplierPayments] = useState<PreOrderSupplierPayment[]>([]);

  // Modals
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [formError, setFormError] = useState('');
  const [allowDuplicateSave, setAllowDuplicateSave] = useState(false);

  const [showPayModal, setShowPayModal] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<PreOrderSupplierPayment | null>(null);
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<'overview' | 'shipment' | 'supplier'>('overview');

  // Form fields
  const [fName, setFName] = useState('');
  const [fContactPerson, setFContactPerson] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fWhatsapp, setFWhatsapp] = useState('');
  const [fWechatId, setFWechatId] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fAddress, setFAddress] = useState('');
  const [fCity, setFCity] = useState('');
  const [fCountry, setFCountry] = useState('China');
  const [fPlatform, setFPlatform] = useState('1688');
  const [fShopUrl, setFShopUrl] = useState('');
  const [fIsChinaSupplier, setFIsChinaSupplier] = useState(true);
  const [fStatus, setFStatus] = useState<'active' | 'inactive'>('active');
  const [fNotes, setFNotes] = useState('');

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSuppliers();
      setSuppliers(list);
      if (selectedSupplier) {
        const refreshed = list.find((s) => s.id === selectedSupplier.id);
        if (refreshed) setSelectedSupplier(refreshed);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, [selectedSupplier?.id, toast]);

  useEffect(() => {
    if (canAccess) {
      loadSuppliers();
    }
  }, [canAccess]);

  const loadSupplierDetail = useCallback(
    async (sup: Supplier) => {
      setDetailLoading(true);
      try {
        const [orders, payments] = await Promise.all([
          getPreOrdersBySupplier(sup.id, 150),
          getPreOrderSupplierPaymentsBySupplier(sup.id, 200),
        ]);
        setSupplierOrders(orders);
        setSupplierPayments(payments);
        const costs = await getPreOrderPrivateCostsMap(orders.map((o) => o.id));
        setSupplierCostsMap(costs);
      } catch (err: any) {
        toast.error(err?.message || 'Failed to load supplier pre-order history.');
      } finally {
        setDetailLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    if (selectedSupplier && canAccess) {
      loadSupplierDetail(selectedSupplier);
    }
  }, [selectedSupplier?.id, canAccess, loadSupplierDetail]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setFName('');
    setFContactPerson('');
    setFPhone('');
    setFWhatsapp('');
    setFWechatId('');
    setFEmail('');
    setFAddress('');
    setFCity('');
    setFCountry('China');
    setFPlatform('1688');
    setFShopUrl('');
    setFIsChinaSupplier(true);
    setFStatus('active');
    setFNotes('');
    setFormError('');
    setAllowDuplicateSave(false);
    setShowSupplierForm(true);
  };

  const openEditModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setFName(sup.name || '');
    setFContactPerson(sup.contactPerson || '');
    setFPhone(sup.phone || '');
    setFWhatsapp(sup.whatsapp || '');
    setFWechatId(sup.wechatId || '');
    setFEmail(sup.email || '');
    setFAddress(sup.address || '');
    setFCity(sup.city || '');
    setFCountry(sup.country || (sup.isChinaSupplier ? 'China' : 'Bangladesh'));
    setFPlatform(sup.platform || '1688');
    setFShopUrl(sup.shopUrl || '');
    setFIsChinaSupplier(Boolean(sup.isChinaSupplier));
    setFStatus(sup.status || 'active');
    setFNotes(sup.notes || '');
    setFormError('');
    setAllowDuplicateSave(false);
    setShowSupplierForm(true);
  };

  const duplicateCheck = useMemo(() => {
    if (!showSupplierForm) return { duplicateByPhone: null, duplicateByName: null };
    return findDuplicateSupplier(suppliers, fName, fPhone, editingSupplier?.id);
  }, [showSupplierForm, suppliers, fName, fPhone, editingSupplier?.id]);

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSupplier) return;
    setFormError('');

    if (!fName.trim()) {
      setFormError('Supplier name is required.');
      return;
    }
    if (!fPhone.trim() && !fWechatId.trim() && !fWhatsapp.trim()) {
      setFormError('Provide at least a phone number, WhatsApp, or WeChat ID.');
      return;
    }

    if ((duplicateCheck.duplicateByPhone || duplicateCheck.duplicateByName) && !allowDuplicateSave) {
      setFormError(
        'Potential duplicate supplier detected below. Select the existing supplier instead, or tick "Confirm create despite match" if genuinely separate.'
      );
      return;
    }

    setSavingSupplier(true);
    try {
      const payload = {
        name: fName.trim(),
        contactPerson: fContactPerson.trim(),
        phone: fPhone.trim() || fWhatsapp.trim() || fWechatId.trim(),
        whatsapp: fWhatsapp.trim(),
        wechatId: fWechatId.trim(),
        email: fEmail.trim(),
        address: fAddress.trim(),
        city: fCity.trim(),
        country: fCountry.trim(),
        platform: fPlatform,
        shopUrl: fShopUrl.trim(),
        isChinaSupplier: fIsChinaSupplier,
        supplierType: fIsChinaSupplier ? ('Importer' as const) : (editingSupplier?.supplierType || 'Distributor'),
        status: fStatus,
        notes: fNotes.trim(),
        createdBy: editingSupplier?.createdBy || user.id,
      };

      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
        toast.success(`Updated supplier "${payload.name}".`);
      } else {
        await addSupplier(payload as any);
        toast.success(`Added supplier "${payload.name}" (${fIsChinaSupplier ? 'China / Pre-Order' : 'General'}).`);
      }

      setShowSupplierForm(false);
      await loadSuppliers();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save supplier.');
    } finally {
      setSavingSupplier(false);
    }
  };

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      if (chinaOnlyFilter === 'china' && !s.isChinaSupplier) return false;
      if (platformFilter !== 'ALL' && s.platform !== platformFilter) return false;
      if (statusFilter !== 'all' && (s.status || 'active') !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const hay = [
          s.name,
          s.supplierCode,
          s.contactPerson,
          s.phone,
          s.whatsapp,
          s.wechatId,
          s.platform,
          s.city,
          s.country,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [suppliers, chinaOnlyFilter, platformFilter, statusFilter, searchTerm]);

  const reversedPaymentIds = useMemo(() => {
    const set = new Set<string>();
    supplierPayments.forEach((p) => {
      if (p.type === 'reversal' && p.reversesPaymentId) {
        set.add(p.reversesPaymentId);
      }
    });
    return set;
  }, [supplierPayments]);

  const detailMetrics = useMemo(() => {
    let orderedPaisa = 0;
    let activeOrders = 0;
    let deliveredOrders = 0;

    for (const o of supplierOrders) {
      if (o.status === 'Delivered') deliveredOrders++;
      else if (o.status !== 'Cancelled' && o.status !== 'Refunded') activeOrders++;

      if (o.status !== 'Cancelled' && o.status !== 'Refunded') {
        const priv = supplierCostsMap[o.id];
        if (priv) {
          const items = normalizePreOrderItems(o);
          const costMap = computeItemCostMap(o, priv);
          for (const it of items) {
            const unitCost = costMap[it.itemId]?.chinaUnitCost ?? Number(priv.chinaUnitCost || 0);
            orderedPaisa += Math.max(0, Math.round(Number(it.qty || 0))) * Math.max(0, toPaisa(unitCost));
          }
        }
      }
    }

    let paidPaisa = 0;
    for (const p of supplierPayments) {
      const amtP = Math.max(0, toPaisa(p.amountBdt));
      if (p.type === 'reversal') paidPaisa -= amtP;
      else paidPaisa += amtP;
    }

    const totalOrderedValue = fromPaisa(orderedPaisa);
    const totalPaid = fromPaisa(Math.max(0, paidPaisa));
    const balancePayable = fromPaisa(orderedPaisa - Math.max(0, paidPaisa));

    return {
      totalOrderedValue,
      totalPaid,
      balancePayable,
      activeOrders,
      deliveredOrders,
    };
  }, [supplierOrders, supplierCostsMap, supplierPayments]);

  if (!canAccess) {
    return (
      <div className="p-8 rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 text-center max-w-lg mx-auto mt-10 space-y-3">
        <Lock className="w-8 h-8 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Supplier & China Cost Access Restricted
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Your role does not include the <code className="font-mono">preOrderSupplier</code> permission. Contact an Admin or Super Admin for access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!selectedSupplier ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight">
                Pre-Order & China Supplier Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Reuses your SUP-0001 directory with sourcing platform details, per-supplier pre-order ledgers, and multi-order disbursements.
              </p>
            </div>
            <Button
              type="button"
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={openAddModal}
            >
              Add Supplier
            </Button>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search SUP code, supplier name, phone, WeChat, city..."
                className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/40"
              />
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
              <button
                type="button"
                onClick={() => setChinaOnlyFilter('all')}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                  chinaOnlyFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                All ({suppliers.length})
              </button>
              <button
                type="button"
                onClick={() => setChinaOnlyFilter('china')}
                className={`px-3 py-1.5 rounded-md font-semibold cursor-pointer ${
                  chinaOnlyFilter === 'china'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                China / Pre-Order ({suppliers.filter((s) => s.isChinaSupplier).length})
              </button>
            </div>

            <div className="w-40">
              <Select
                options={[
                  { value: 'ALL', label: 'All Platforms' },
                  ...SOURCING_PLATFORMS.map((p) => ({ value: p, label: p })),
                ]}
                value={platformFilter}
                onChange={(val) => setPlatformFilter(String(val))}
                searchable={false}
              />
            </div>

            <div className="w-32">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All Status' },
                ]}
                value={statusFilter}
                onChange={(val) => setStatusFilter(val as any)}
                searchable={false}
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              icon={<Store className="w-6 h-6" />}
              title="No matching suppliers"
              description="Add a China factory/agent or adjust your filters to inspect existing SUP-0001 suppliers."
              action={
                <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddModal}>
                  Add China / Pre-Order Supplier
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSuppliers.map((sup) => (
                <div
                  key={sup.id}
                  onClick={() => {
                    setSelectedSupplier(sup);
                    setDetailTab('profile');
                  }}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 hover:border-[#D4AF37]/70 transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {sup.supplierCode || 'SUP'}
                          </span>
                          {sup.isChinaSupplier && (
                            <Badge variant="gold" size="xs">
                              China / Pre-Order
                            </Badge>
                          )}
                          {sup.platform && (
                            <Badge variant="info" size="xs">
                              {sup.platform}
                            </Badge>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-1.5 truncate group-hover:text-[#93741E] dark:group-hover:text-[#E2C255]">
                          {sup.name}
                        </h3>
                        {sup.contactPerson && (
                          <div className="text-xs text-slate-500 truncate">
                            Contact: {sup.contactPerson}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Badge variant={sup.status === 'inactive' ? 'neutral' : 'success'} size="xs">
                          {sup.status === 'inactive' ? 'Inactive' : 'Active'}
                        </Badge>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(sup);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="Edit supplier"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="truncate">
                        <span className="text-slate-400">Phone:</span>{' '}
                        <span className="font-mono">{sup.phone || '—'}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-400">WeChat:</span>{' '}
                        <span className="font-mono">{sup.wechatId || '—'}</span>
                      </div>
                      <div className="col-span-2 truncate">
                        <span className="text-slate-400">Location:</span>{' '}
                        {[sup.city, sup.country].filter(Boolean).join(', ') || sup.address || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                    <span className="text-slate-500">Click to open Pre-Order ledger</span>
                    {sup.shopUrl && (
                      <a
                        href={sup.shopUrl.startsWith('http') ? sup.shopUrl : `https://${sup.shopUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 font-semibold text-[#93741E] dark:text-[#E2C255] hover:underline"
                      >
                        Store <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* SUPPLIER DETAIL VIEW */
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<ArrowLeft className="w-4 h-4" />}
                onClick={() => setSelectedSupplier(null)}
              >
                All Suppliers
              </Button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    {selectedSupplier.supplierCode || 'SUP'}
                  </span>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedSupplier.name}
                  </h2>
                  {selectedSupplier.isChinaSupplier && (
                    <Badge variant="gold" size="xs">China / Pre-Order</Badge>
                  )}
                  {selectedSupplier.platform && (
                    <Badge variant="info" size="xs">{selectedSupplier.platform}</Badge>
                  )}
                  <Badge variant={selectedSupplier.status === 'inactive' ? 'neutral' : 'success'} size="xs">
                    {selectedSupplier.status === 'inactive' ? 'Inactive' : 'Active'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[selectedSupplier.contactPerson, selectedSupplier.city, selectedSupplier.country]
                    .filter(Boolean)
                    .join(' • ') || 'Supplier Account'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                onClick={() => openEditModal(selectedSupplier)}
              >
                Edit Profile
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={<Banknote className="w-4 h-4" />}
                onClick={() => setShowPayModal(true)}
              >
                Record Supplier Payment
              </Button>
            </div>
          </div>

          {/* 5 Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 tabular-nums">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Total Ordered Value
              </div>
              <div className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                {detailLoading ? '...' : formatBDT(detailMetrics.totalOrderedValue)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">China unit cost × qty</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Total Paid to Supplier
              </div>
              <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                {detailLoading ? '...' : formatBDT(detailMetrics.totalPaid)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Net of reversals</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Supplier Balance Payable
              </div>
              <div
                className={`text-lg font-mono font-bold mt-1 ${
                  detailMetrics.balancePayable > 0
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {detailLoading ? '...' : formatBDT(detailMetrics.balancePayable)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Ordered − Paid</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Active Orders
              </div>
              <div className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                {detailLoading ? '...' : detailMetrics.activeOrders}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">In pipeline / transit</div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Delivered Orders
              </div>
              <div className="text-lg font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-1">
                {detailLoading ? '...' : detailMetrics.deliveredOrders}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Completed</div>
            </div>
          </div>

          {/* 4 Sub-tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
            {(
              [
                { id: 'profile', label: 'Profile', icon: <Building2 className="w-3.5 h-3.5" /> },
                {
                  id: 'preorders',
                  label: `Pre-Orders (${supplierOrders.length})`,
                  icon: <Package className="w-3.5 h-3.5" />,
                },
                {
                  id: 'payments',
                  label: `Payments (${supplierPayments.length})`,
                  icon: <Banknote className="w-3.5 h-3.5" />,
                },
                {
                  id: 'shipments',
                  label: 'Shipments',
                  icon: <Truck className="w-3.5 h-3.5" />,
                },
              ] as const
            ).map((tab) => {
              const active = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-[#D4AF37] text-[#93741E] dark:text-[#E2C255]'
                      : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>

          {detailLoading ? (
            <Skeleton className="h-60 w-full rounded-2xl" />
          ) : (
            <>
              {/* TAB 1: PROFILE */}
              {detailTab === 'profile' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-slate-400">Supplier Code</div>
                    <div className="font-mono font-bold mt-0.5">{selectedSupplier.supplierCode}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Contact Person</div>
                    <div className="font-semibold mt-0.5">{selectedSupplier.contactPerson || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Phone</div>
                    <div className="font-mono font-semibold mt-0.5">{selectedSupplier.phone || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">WhatsApp</div>
                    <div className="font-mono mt-0.5">{selectedSupplier.whatsapp || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">WeChat ID</div>
                    <div className="font-mono mt-0.5">{selectedSupplier.wechatId || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Email</div>
                    <div className="mt-0.5">{selectedSupplier.email || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">City / Country</div>
                    <div className="mt-0.5">
                      {[selectedSupplier.city, selectedSupplier.country].filter(Boolean).join(', ') || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Sourcing Platform</div>
                    <div className="font-semibold mt-0.5">{selectedSupplier.platform || '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Shop / Store Link</div>
                    <div className="mt-0.5">
                      {selectedSupplier.shopUrl ? (
                        <a
                          href={
                            selectedSupplier.shopUrl.startsWith('http')
                              ? selectedSupplier.shopUrl
                              : `https://${selectedSupplier.shopUrl}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#93741E] dark:text-[#E2C255] font-semibold hover:underline"
                        >
                          Open Store <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-slate-400">Address</div>
                    <div className="mt-0.5">{selectedSupplier.address || '—'}</div>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <div className="text-slate-400">Notes</div>
                    <div className="mt-0.5 whitespace-pre-line text-slate-700 dark:text-slate-300">
                      {selectedSupplier.notes || '—'}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PRE-ORDERS */}
              {detailTab === 'preorders' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {supplierOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No pre-orders linked to {selectedSupplier.name} yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Pre-Order</th>
                            <th className="px-4 py-3 font-semibold">Product</th>
                            <th className="px-4 py-3 font-semibold">Supplier Order ID</th>
                            <th className="px-4 py-3 font-semibold text-right">Qty</th>
                            <th className="px-4 py-3 font-semibold text-right">China Cost</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
                          {supplierOrders.map((ord) => {
                            const priv = supplierCostsMap[ord.id];
                            const orderItems = normalizePreOrderItems(ord);
                            const totalQty =
                              ord.totalQty ?? orderItems.reduce((s, it) => s + it.qty, 0);
                            let chinaCostPaisa = 0;
                            if (priv) {
                              const costMap = computeItemCostMap(ord, priv);
                              for (const it of orderItems) {
                                const unitCost =
                                  costMap[it.itemId]?.chinaUnitCost ??
                                  Number(priv.chinaUnitCost || 0);
                                chinaCostPaisa +=
                                  Math.max(0, Math.round(Number(it.qty || 0))) *
                                  Math.max(0, toPaisa(unitCost));
                              }
                            }
                            const chinaCost = fromPaisa(chinaCostPaisa);
                            return (
                              <tr
                                key={ord.id}
                                onClick={() => {
                                  setDrawerInitialTab('supplier');
                                  setDrawerOrderId(ord.id);
                                }}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                              >
                                <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {ord.preOrderNumber}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-slate-800 dark:text-slate-200">
                                    {formatPreOrderProductLabel(ord)}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {ord.customerName}
                                    {orderItems.length > 1 ? ` · ${orderItems.length} items` : ''}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300">
                                  {ord.supplierOrderRef || priv?.supplierOrderRef || '—'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold">{totalQty}</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {formatBDT(chinaCost)}
                                </td>
                                <td className="px-4 py-3">
                                  <PreOrderStatusBadge status={ord.status} size="xs" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PAYMENTS (APPEND-ONLY) */}
              {detailTab === 'payments' && (
                <div className="space-y-3">
                  {supplierPayments.length === 0 ? (
                    <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center text-xs text-slate-500">
                      No supplier payments recorded for {selectedSupplier.name} yet.
                    </div>
                  ) : (
                    supplierPayments.map((pay) => {
                      const isReversal = pay.type === 'reversal';
                      const isReversed = reversedPaymentIds.has(pay.id);
                      return (
                        <div
                          key={pay.id}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-mono text-sm font-bold ${
                                  isReversal
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {isReversal ? '-' : ''}
                                {formatBDT(pay.amountBdt)}
                              </span>
                              {pay.currency && pay.currency !== 'BDT' && (
                                <Badge variant="neutral" size="xs">
                                  {pay.amount} {pay.currency} @ {pay.exchangeRate || '—'}
                                </Badge>
                              )}
                              <Badge variant={isReversal ? 'danger' : 'info'} size="xs">
                                {isReversal ? 'Reversal' : pay.method}
                              </Badge>
                              {isReversed && (
                                <Badge variant="warning" size="xs">
                                  Reversed
                                </Badge>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-600 dark:text-slate-300">
                              Date: <span className="font-mono">{pay.date}</span>
                              {pay.referenceNo ? ` • Ref: ${pay.referenceNo}` : ''}
                              {' • '}Recorded by {pay.recordedByName}
                            </div>

                            {pay.allocations && pay.allocations.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                {pay.allocations.map((a) => (
                                  <span
                                    key={a.preOrderId}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono"
                                  >
                                    {a.preOrderNumber}: {formatBDT(a.amountBdt)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400">
                                Orders: {pay.preOrderNumber || 'Unallocated Advance'}
                              </div>
                            )}

                            {pay.note && <div className="text-[11px] text-slate-500">{pay.note}</div>}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {pay.receiptUrl && (
                              <a
                                href={pay.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                Receipt
                              </a>
                            )}
                            {isAdmin && !isReversal && !isReversed && (
                              <Button
                                type="button"
                                variant="danger"
                                size="xs"
                                leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                                onClick={() => setReverseTarget(pay)}
                              >
                                Reverse
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 4: SHIPMENTS */}
              {detailTab === 'shipments' && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {supplierOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No shipments found for this supplier.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                            <th className="px-4 py-3 font-semibold">Pre-Order</th>
                            <th className="px-4 py-3 font-semibold">Method / Forwarder</th>
                            <th className="px-4 py-3 font-semibold">Tracking No</th>
                            <th className="px-4 py-3 font-semibold">Expected Arrival</th>
                            <th className="px-4 py-3 font-semibold">Customs</th>
                            <th className="px-4 py-3 font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {supplierOrders.map((ord) => {
                            const overdue = isPreOrderOverdue(
                              ord.estimatedDeliveryDate,
                              ord.status,
                              ord.stockReceived
                            );
                            return (
                              <tr
                                key={ord.id}
                                onClick={() => {
                                  setDrawerInitialTab('shipment');
                                  setDrawerOrderId(ord.id);
                                }}
                                className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                              >
                                <td className="px-4 py-3">
                                  <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {ord.preOrderNumber}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {formatPreOrderProductLabel(ord)}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="inline-flex items-center gap-1 font-medium">
                                    {ord.shippingMethod === 'Sea' ? (
                                      <Ship className="w-3.5 h-3.5 text-sky-500" />
                                    ) : (
                                      <Plane className="w-3.5 h-3.5 text-indigo-500" />
                                    )}
                                    {ord.shippingMethod || '—'}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {ord.freightForwarder || ord.courier || '—'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono">{ord.trackingNumber || '—'}</td>
                                <td className="px-4 py-3 font-mono">
                                  <div className="flex items-center gap-1.5">
                                    <span>{ord.estimatedDeliveryDate || '—'}</span>
                                    {(overdue || ord.isDelayed) && (
                                      <Badge variant="danger" size="xs">
                                        {overdue ? 'Overdue' : 'Delayed'}
                                      </Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge
                                    variant={
                                      ord.customsStatus === 'Cleared'
                                        ? 'success'
                                        : ord.customsStatus === 'Held/Issue'
                                        ? 'danger'
                                        : 'neutral'
                                    }
                                    size="xs"
                                  >
                                    {ord.customsStatus || 'Not started'}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <PreOrderStatusBadge status={ord.status} size="xs" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ADD / EDIT SUPPLIER MODAL */}
      <Modal
        isOpen={showSupplierForm}
        onClose={() => !savingSupplier && setShowSupplierForm(false)}
        title={editingSupplier ? `Edit Supplier (${editingSupplier.supplierCode})` : 'Add China / Pre-Order Supplier'}
        subtitle="Saved in the shared SUP-0001 /suppliers directory"
        size="lg"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          {(duplicateCheck.duplicateByPhone || duplicateCheck.duplicateByName) && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Existing supplier match found! Avoid creating duplicate suppliers:</span>
              </div>
              {duplicateCheck.duplicateByPhone && (
                <div className="flex items-center justify-between gap-2 pl-6">
                  <span>
                    Phone match: <strong>{duplicateCheck.duplicateByPhone.name}</strong> (
                    {duplicateCheck.duplicateByPhone.supplierCode})
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      setShowSupplierForm(false);
                      setSelectedSupplier(duplicateCheck.duplicateByPhone);
                    }}
                  >
                    Open Existing
                  </Button>
                </div>
              )}
              {duplicateCheck.duplicateByName &&
                duplicateCheck.duplicateByName.id !== duplicateCheck.duplicateByPhone?.id && (
                  <div className="flex items-center justify-between gap-2 pl-6">
                    <span>
                      Name match: <strong>{duplicateCheck.duplicateByName.name}</strong> (
                      {duplicateCheck.duplicateByName.supplierCode})
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        setShowSupplierForm(false);
                        setSelectedSupplier(duplicateCheck.duplicateByName);
                      }}
                    >
                      Open Existing
                    </Button>
                  </div>
                )}
              <label className="flex items-center gap-2 pl-6 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicateSave}
                  onChange={(e) => setAllowDuplicateSave(e.target.checked)}
                  className="rounded border-amber-400 text-[#D4AF37]"
                />
                <span>Confirm create as a separate supplier anyway</span>
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={fIsChinaSupplier}
                onChange={(e) => setFIsChinaSupplier(e.target.checked)}
                className="rounded border-slate-300 text-[#D4AF37] focus:ring-[#D4AF37]"
              />
              <span>China / Pre-Order Supplier</span>
            </label>
            <div className="w-36">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
                value={fStatus}
                onChange={(val) => setFStatus(val as 'active' | 'inactive')}
                searchable={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Supplier / Factory Name" required>
              <Input
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                placeholder="e.g. Shenzhen Apex Tech Co."
              />
            </FormField>
            <FormField label="Contact Person">
              <Input
                value={fContactPerson}
                onChange={(e) => setFContactPerson(e.target.value)}
                placeholder="Account manager / Agent name"
              />
            </FormField>
            <FormField label="Phone" required>
              <Input
                value={fPhone}
                onChange={(e) => setFPhone(e.target.value)}
                placeholder="+86 ... or 01XXXXXXXXX"
                className="font-mono"
              />
            </FormField>
            <FormField label="WhatsApp">
              <Input
                value={fWhatsapp}
                onChange={(e) => setFWhatsapp(e.target.value)}
                placeholder="+86 ... / +880 ..."
                className="font-mono"
              />
            </FormField>
            <FormField label="WeChat ID">
              <Input
                value={fWechatId}
                onChange={(e) => setFWechatId(e.target.value)}
                placeholder="WeChat handle"
                className="font-mono"
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder="sales@supplier.com"
              />
            </FormField>
            <FormField label="City">
              <Input value={fCity} onChange={(e) => setFCity(e.target.value)} placeholder="Shenzhen / Yiwu" />
            </FormField>
            <FormField label="Country">
              <Input value={fCountry} onChange={(e) => setFCountry(e.target.value)} placeholder="China" />
            </FormField>
            <FormField label="Sourcing Platform">
              <Select
                options={SOURCING_PLATFORMS.map((p) => ({ value: p, label: p }))}
                value={fPlatform}
                onChange={(val) => setFPlatform(String(val))}
                searchable={false}
              />
            </FormField>
            <FormField label="Shop / Store URL">
              <Input
                value={fShopUrl}
                onChange={(e) => setFShopUrl(e.target.value)}
                placeholder="https://shop.1688.com/..."
              />
            </FormField>
            <FormField label="Address" className="sm:col-span-2">
              <Input
                value={fAddress}
                onChange={(e) => setFAddress(e.target.value)}
                placeholder="Warehouse / industrial park address"
              />
            </FormField>
            <FormField label="Notes" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Payment terms, MOQ, lead time, bank/Alipay details..."
              />
            </FormField>
          </div>

          {formError && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="secondary"
              disabled={savingSupplier}
              onClick={() => setShowSupplierForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={savingSupplier}>
              {editingSupplier ? 'Save Changes' : 'Add Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SUPPLIER PAYMENT & REVERSAL MODALS */}
      <RecordSupplierPaymentModal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        supplier={selectedSupplier}
        supplierOrders={supplierOrders}
        user={user}
        onSuccess={() => {
          if (selectedSupplier) loadSupplierDetail(selectedSupplier);
        }}
      />

      <ReverseSupplierPaymentModal
        isOpen={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        payment={reverseTarget}
        user={user}
        onSuccess={() => {
          if (selectedSupplier) loadSupplierDetail(selectedSupplier);
        }}
      />

      {/* PRE-ORDER DETAIL DRAWER */}
      <PreOrderDetailDrawer
        preOrderId={drawerOrderId}
        isOpen={Boolean(drawerOrderId)}
        onClose={() => setDrawerOrderId(null)}
        user={user}
        rolePermissions={rolePermissions}
        categories={categories}
        suppliers={suppliers}
        companySettings={companySettings}
        initialTab={drawerInitialTab}
        onUpdated={() => {
          if (selectedSupplier) loadSupplierDetail(selectedSupplier);
        }}
      />
    </div>
  );
};

export default PreOrderSupplierManagementView;
