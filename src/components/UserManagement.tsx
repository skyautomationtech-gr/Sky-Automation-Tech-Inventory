import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { UserProfile, UserRole } from '../types';
import { 
  getAllUsers, 
  subscribeToUsers,
  createUserProfile, 
  findUserProfileByEmail,
  updateUserProfile, 
  getPrivateEmploymentInfo,
  updatePrivateEmploymentInfo,
  getNextEmployeeId
} from '../firebase/db';
import { 
  UserPlus, 
  Shield, 
  UserCheck, 
  UserX, 
  Mail, 
  User as UserIcon, 
  PlusCircle, 
  Lock, 
  Check, 
  Search, 
  Filter, 
  SlidersHorizontal,
  Phone,
  Camera,
  ChevronDown,
  ChevronUp,
  Briefcase,
  DollarSign,
  MapPin,
  CreditCard,
  Calendar,
  Send,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  Wrench,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X
} from 'lucide-react';
import { storage, auth } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { sendCredentialsEmail, sendWelcomeEmail } from '../lib/emailjs';

const DEFAULT_PERMISSIONS = {
  admin: {
    addProduct: true,
    editProduct: true,
    deleteProduct: true,
    manageCategories: true,
    stockIn: true,
    stockOut: true,
    stockAdjustment: true,
    manageOrders: true
  },
  manager: {
    addProduct: true,
    editProduct: true,
    deleteProduct: false,
    manageCategories: true,
    stockIn: true,
    stockOut: true,
    stockAdjustment: true,
    manageOrders: true
  },
  staff: {
    addProduct: false,
    editProduct: false,
    deleteProduct: false,
    manageCategories: false,
    stockIn: true,
    stockOut: true,
    stockAdjustment: false,
    manageOrders: false
  }
};

interface UserManagementProps {
  user: UserProfile;
}

export default function UserManagement({ user }: UserManagementProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Tab control
  const [activeTab, setActiveTab] = useState<'registry' | 'pending'>('registry');

  // Form sections visibility
  const [showEmploymentInfo, setShowEmploymentInfo] = useState(false);
  const [showAdvancedPerms, setShowAdvancedPerms] = useState(false);

  // Form states - Basic Info
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRepairTool, setShowRepairTool] = useState(false);
  const [repairEmail, setRepairEmail] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Form states - Role & Access
  const [selectedRole, setSelectedRole] = useState<UserRole>('staff');
  const [brandAccess, setBrandAccess] = useState<string[]>(['SAT', 'GZ', 'RTX']);
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean>>({});

  // Form states - Employment Info
  const [designation, setDesignation] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [salary, setSalary] = useState<number | ''>('');
  const [nidNumber, setNidNumber] = useState('');
  const [address, setAddress] = useState('');

  // Form states - Account Setup
  const [tempPassword, setTempPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);

  // Form states - Status
  const [isActiveAccount, setIsActiveAccount] = useState(true);

  // Editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editBrandAccess, setEditBrandAccess] = useState<string[]>([]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToUsers((list) => {
      setUsers(list || []);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const fetchUsersList = async () => {
    setLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list || []);
    } catch (err) {
      console.error('UserManagement: fetchUsersList failed:', err);
      setError('Could not retrieve operator registry.');
    } finally {
      setLoading(false);
    }
  };

  // Check permissions
  const isSuperAdmin = user.role === 'superadmin';

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 12; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setTempPassword(password);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleToggleBrandAccess = (brand: string, isEditing: boolean = false) => {
    if (isEditing) {
      if (editBrandAccess.includes(brand)) {
        if (editBrandAccess.length === 1) {
          setError('At least one brand domain must remain accessible.');
          return;
        }
        setEditBrandAccess(editBrandAccess.filter(b => b !== brand));
      } else {
        setEditBrandAccess([...editBrandAccess, brand]);
      }
    } else {
      if (brandAccess.includes(brand)) {
        if (brandAccess.length === 1) {
          setError('At least one brand domain must remain accessible.');
          return;
        }
        setBrandAccess(brandAccess.filter(b => b !== brand));
      } else {
        setBrandAccess([...brandAccess, brand]);
      }
    }
  };

  const handleRepairAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repairEmail.trim()) {
      setError('Enter email address to repair.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const targetUser = await findUserProfileByEmail(repairEmail.trim());
      if (!targetUser) {
        throw new Error(`Profile with email ${repairEmail} not found in Firestore.`);
      }
      await updateUserProfile(targetUser.id, {
        active: true,
        status: 'approved'
      });
      setSuccess(`Repaired operator profile for ${repairEmail}.`);
      setRepairEmail('');
      setShowRepairTool(false);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Failed to repair operator profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkRepair = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const list = await getAllUsers();
      let fixedCount = 0;
      for (const u of list) {
        if (!u.status || u.status === 'pending_approval') {
          await updateUserProfile(u.id, {
            status: 'approved',
            active: u.active !== false
          });
          fixedCount++;
        }
      }
      setSuccess(`Audit completed. Synced ${fixedCount} operator records.`);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Audit sync failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (!email.trim() || !fullName.trim() || !tempPassword.trim()) {
        throw new Error('Please provide full name, email, and password.');
      }

      const { initializeApp, getApps } = await import('firebase/app');
      const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
      const { firebaseConfig } = await import('../firebase/config');

      let secondaryApp = getApps().find(app => app.name === 'SecondaryApp');
      if (!secondaryApp) {
        secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
      }
      const secondaryAuth = getAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth, 
        email.toLowerCase().trim(), 
        tempPassword
      );
      const newUid = userCredential.user.uid;

      let photoUrl = '';
      if (photoFile) {
        const storageRef = ref(storage, `operator_avatars/${newUid}_${Date.now()}`);
        const uploadRes = await uploadBytes(storageRef, photoFile);
        photoUrl = await getDownloadURL(uploadRes.ref);
      }

      const employeeId = await getNextEmployeeId();

      await createUserProfile(newUid, {
        id: newUid,
        email: email.toLowerCase().trim(),
        name: fullName.trim(),
        role: selectedRole,
        active: isActiveAccount,
        subBrandAccess: brandAccess,
        permissionOverrides: permissionOverrides,
        phone: phoneNumber.trim(),
        photoUrl: photoUrl || undefined,
        employeeId,
        designation: designation.trim() || undefined,
        joiningDate: joiningDate || undefined,
        nidNumber: nidNumber.trim() || undefined,
        presentAddress: address.trim() || undefined,
        requirePasswordChange,
        status: 'approved'
      });

      if (salary !== '') {
        try {
          await updatePrivateEmploymentInfo(newUid, {
            salary: Number(salary),
            updatedAt: Date.now()
          });
        } catch (salaryErr) {
          console.error('Private info write error:', salaryErr);
        }
      }

      if (sendEmail) {
        try {
          await sendCredentialsEmail(email.toLowerCase().trim(), tempPassword, fullName);
        } catch (emailErr) {
          console.error('Email sending failed:', emailErr);
        }
      }

      await secondaryAuth.signOut();
      setSuccess(`Operator profile provisioned for ${fullName}.`);

      // Reset form
      setEmail('');
      setFullName('');
      setPhoneNumber('');
      setPhotoFile(null);
      setPhotoPreview(null);
      setSelectedRole('staff');
      setBrandAccess(['SAT', 'GZ', 'RTX']);
      setPermissionOverrides({});
      setDesignation('');
      setJoiningDate('');
      setSalary('');
      setNidNumber('');
      setAddress('');
      setTempPassword('');
      setShowAddForm(false);
      await fetchUsersList();
    } catch (err: any) {
      console.error('Add user error:', err);
      let errorMsg = err.message || 'Failed to provision user profile.';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'An account with this email already exists.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'The email address provided is invalid.';
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveUser = async (targetUser: UserProfile) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const employeeId = await getNextEmployeeId();
      const finalBrands = targetUser.requestedSubBrandAccess || targetUser.subBrandAccess || ['SAT'];
      const finalRole = targetUser.requestedRole || targetUser.role || 'staff';

      await updateUserProfile(targetUser.id, {
        status: 'approved',
        active: true,
        employeeId,
        role: finalRole,
        department: targetUser.requestedDepartment || targetUser.department || 'Operations',
        designation: targetUser.designation || targetUser.requestedDesignation || 'Executive',
        branch: targetUser.branch || targetUser.requestedBranch || 'Main Branch',
        joiningDate: targetUser.joiningDate || targetUser.requestedJoiningDate || new Date().toISOString().split('T')[0],
        employmentType: targetUser.employmentType || targetUser.requestedEmploymentType || 'Full-Time',
        subBrandAccess: finalBrands
      });

      const welcomeRes = await sendWelcomeEmail(targetUser.email, employeeId, targetUser.name);
      if (welcomeRes.success) {
        setSuccess(`Approved registration for ${targetUser.name} (ID: ${employeeId}). Welcome email sent.`);
      } else {
        setSuccess(`Approved registration for ${targetUser.name} (ID: ${employeeId}).`);
      }
      await fetchUsersList();
    } catch (err: any) {
      console.error('Error approving user:', err);
      setError(err.message || 'Failed to approve operator request.');
    } finally {
      setLoading(false);
    }
  };

  const handleRejectUser = async (targetUser: UserProfile) => {
    const reason = window.prompt(`Enter rejection reason for ${targetUser.name}:`, 'Application requirements not met.');
    if (reason === null) return;

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await updateUserProfile(targetUser.id, {
        status: 'rejected',
        active: false,
        rejectionReason: reason
      });
      setSuccess(`Rejected registration request for ${targetUser.name}.`);
      await fetchUsersList();
    } catch (err: any) {
      console.error('Error rejecting user:', err);
      setError(err.message || 'Failed to reject operator request.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRequest = async (targetUserId: string) => {
    if (!window.confirm('Are you sure you want to delete this registration request?')) {
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { doc, deleteDoc } = await import('firebase/firestore');
      const { db } = await import('../firebase/config');
      await deleteDoc(doc(db, 'users', targetUserId));
      setSuccess('Registration request deleted.');
      await fetchUsersList();
    } catch (err: any) {
      console.error('Error deleting request:', err);
      setError(err.message || 'Failed to delete request.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (targetUser: UserProfile) => {
    setEditingUserId(targetUser.id);
    setEditRole(targetUser.role || 'staff');
    setEditBrandAccess(targetUser.subBrandAccess || ['SAT']);
  };

  const handleUpdateUserRoleAndAccess = async (targetUserId: string) => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await updateUserProfile(targetUserId, {
        role: editRole,
        subBrandAccess: editBrandAccess
      });
      setSuccess('Operator authority and access scope updated.');
      setEditingUserId(null);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Failed to update operator profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserActive = async (targetUser: UserProfile) => {
    const isCurrentlyActive = targetUser.active !== false;
    const newActiveState = !isCurrentlyActive;

    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await updateUserProfile(targetUser.id, {
        active: newActiveState
      });
      setSuccess(`Operator ${targetUser.name} is now ${newActiveState ? 'Active' : 'Locked'}.`);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Failed to update account state.');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (u.status === 'pending_approval' || u.status === 'rejected') return false;
    const matchesSearch = 
      (u.name && u.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (u.employeeId && u.employeeId.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const isUserActive = u.active !== false;
    const matchesStatus = 
      statusFilter === 'all' || 
      (statusFilter === 'active' && isUserActive) || 
      (statusFilter === 'inactive' && !isUserActive);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const pendingUsers = users.filter((u) => u.status === 'pending_approval' || u.status === 'rejected');

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      
      {/* Top Header Strip - Standard Compact */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-amber-600 uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
              Access & Security
            </span>
            <span className="text-[10px] font-mono font-bold bg-slate-900 text-amber-400 px-2 py-0.5 rounded">
              Level: {user.role.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">Staff Registry & Permissions</h1>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full border border-slate-200">
              {users.filter(u => u.status !== 'pending_approval' && u.status !== 'rejected').length} Operators
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage operator accounts, sub-brand scope isolation, and access status.
          </p>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {isSuperAdmin && (
            <button
              onClick={() => setShowRepairTool(!showRepairTool)}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-1.5 px-3 rounded-lg border border-slate-200 transition cursor-pointer"
            >
              <Wrench size={13} className="text-slate-500" />
              <span>{showRepairTool ? 'Hide Repair' : 'System Repair'}</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs py-1.5 px-3 rounded-lg shadow-xs transition cursor-pointer"
            >
              <UserPlus size={13} />
              <span>Add Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row - Standard Compact */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Total Operators</span>
            <span className="text-base font-black text-slate-900 font-mono">
              {users.filter(u => u.status !== 'pending_approval' && u.status !== 'rejected').length}
            </span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-mono text-xs">
            <UserIcon size={14} />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Active Accounts</span>
            <span className="text-base font-black text-emerald-600 font-mono">
              {users.filter(u => u.active !== false && u.status !== 'pending_approval' && u.status !== 'rejected').length}
            </span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-mono text-xs">
            <UserCheck size={14} />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Locked / Suspended</span>
            <span className="text-base font-black text-slate-600 font-mono">
              {users.filter(u => u.active === false && u.status !== 'pending_approval' && u.status !== 'rejected').length}
            </span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-mono text-xs">
            <Lock size={14} />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">Pending Approvals</span>
            <span className={`text-base font-black font-mono ${pendingUsers.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
              {pendingUsers.length}
            </span>
          </div>
          <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-mono text-xs">
            <ShieldAlert size={14} />
          </div>
        </div>
      </div>

      {/* Repair Tool Accordion */}
      {showRepairTool && (
        <motion.div 
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50/80 rounded-xl border border-amber-200 p-3.5 space-y-2.5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
              <span>Automated Account Repair Utility</span>
            </div>
            <button
              onClick={handleBulkRepair}
              disabled={loading}
              className="flex items-center gap-1 text-[11px] font-bold bg-amber-200 text-amber-900 px-2.5 py-1 rounded-lg hover:bg-amber-300 transition uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Bulk Audit
            </button>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Resolves mismatches between Authentication credentials and Firestore profiles.
          </p>
          
          <form onSubmit={handleRepairAccount} className="flex flex-col sm:flex-row items-end gap-2 pt-0.5">
            <div className="flex-1 w-full space-y-1">
              <label className="text-[10px] font-bold text-amber-900 uppercase">Email Address to Fix</label>
              <input
                type="email"
                value={repairEmail}
                onChange={(e) => setRepairEmail(e.target.value)}
                placeholder="operator@example.com"
                className="w-full px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-xs text-slate-800 focus:outline-hidden"
              />
            </div>
            <div className="flex gap-1.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowRepairTool(false)}
                className="px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100 rounded-lg transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-3 py-1 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition disabled:opacity-50 shadow-2xs cursor-pointer"
              >
                {loading ? 'Scanning...' : 'Repair'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Notifications */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600"><X size={12} /></button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess('')} className="ml-auto text-emerald-500 hover:text-emerald-700"><X size={12} /></button>
        </div>
      )}

      {/* Tab Navigation Strip */}
      {isSuperAdmin && (
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80 shadow-2xs w-fit">
          <button
            onClick={() => setActiveTab('registry')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
              activeTab === 'registry' 
                ? 'bg-slate-900 text-amber-400 shadow-2xs' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Active Registry ({filteredUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'pending' 
                ? 'bg-slate-900 text-amber-400 shadow-2xs' 
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>Pending Approvals</span>
            {pendingUsers.length > 0 && (
              <span className="bg-amber-400 text-slate-950 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                {pendingUsers.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ADD STAFF MODAL FORM (Standard Clean Modal) */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Provision Operator Profile</h2>
                  <p className="text-[11px] text-slate-500">Create login credentials and brand access rights</p>
                </div>
              </div>
              <button 
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleAddUser} className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* Section 1: Basic Profile */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
                  <UserIcon size={14} className="text-amber-500" />
                  <span>1. Basic Profile</span>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  {/* Avatar Upload */}
                  <div className="shrink-0 flex flex-col items-center gap-1.5">
                    <div className="relative group">
                      <div className="w-18 h-18 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-amber-400">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Camera size={24} className="text-slate-300" />
                        )}
                      </div>
                      <label className="absolute -bottom-1 -right-1 bg-slate-900 text-white p-1 rounded-lg cursor-pointer shadow-sm hover:bg-amber-500 hover:text-slate-950 transition-all">
                        <PlusCircle size={13} />
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Photo</span>
                  </div>

                  {/* Fields */}
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                        placeholder="Operator Name"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400 font-mono"
                        placeholder="operator@company.com"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="text"
                        required
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400"
                        placeholder="017xxxxxxxx"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Authority & Brand Scope */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
                  <Shield size={14} className="text-amber-500" />
                  <span>2. Authority & Brand Access</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Authority Role
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('staff')}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedRole === 'staff'
                            ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <UserIcon size={14} />
                        <span>Staff</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isSuperAdmin}
                        onClick={() => setSelectedRole('admin')}
                        className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                          selectedRole === 'admin'
                            ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-40'
                        }`}
                      >
                        <Shield size={14} />
                        <span>Admin</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Sub-Brand Access Scope
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {['SAT', 'GZ', 'RTX'].map((brand) => {
                        const isSelected = brandAccess.includes(brand);
                        return (
                          <button
                            type="button"
                            key={brand}
                            onClick={() => handleToggleBrandAccess(brand, false)}
                            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
                              isSelected
                                ? 'bg-teal-50 border-teal-400 text-teal-700 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                            }`}
                          >
                            {isSelected ? <Check size={12} /> : <div className="w-3" />}
                            {brand === 'SAT' ? 'Sky Automation' : brand === 'GZ' ? 'GadgetZu' : 'RTX Gadget'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Overrides Toggle */}
                <div className="bg-slate-50 rounded-xl border border-slate-200/80 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPerms(!showAdvancedPerms)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal size={13} className="text-slate-400" />
                      <span>Individual Permission Overrides</span>
                    </div>
                    {showAdvancedPerms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showAdvancedPerms && (
                    <div className="p-3 pt-0 grid grid-cols-2 sm:grid-cols-4 gap-2 border-t border-slate-200/60 mt-2">
                      {Object.keys(DEFAULT_PERMISSIONS.admin).map((action) => {
                        const defaultVal = DEFAULT_PERMISSIONS[selectedRole as keyof typeof DEFAULT_PERMISSIONS][action as keyof (typeof DEFAULT_PERMISSIONS)['admin']];
                        const override = permissionOverrides[action];
                        const effective = override !== undefined ? override : defaultVal;

                        return (
                          <label 
                            key={action}
                            className={`p-2 rounded-lg border flex items-center justify-between text-[11px] font-medium transition cursor-pointer ${
                              effective ? 'bg-white border-teal-200 text-teal-800' : 'bg-slate-100 border-slate-200 text-slate-400'
                            }`}
                          >
                            <span className="truncate mr-1">{action.replace(/([A-Z])/g, ' $1')}</span>
                            <input 
                              type="checkbox"
                              checked={effective}
                              onChange={(e) => {
                                setPermissionOverrides(prev => ({
                                  ...prev,
                                  [action]: e.target.checked
                                }));
                              }}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600"
                            />
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Employment Details (Optional) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Briefcase size={14} className="text-amber-500" />
                    <span>3. Employment Details</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEmploymentInfo(!showEmploymentInfo)}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    {showEmploymentInfo ? 'Hide Details' : 'Show Optional Details'}
                    {showEmploymentInfo ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {showEmploymentInfo && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-slide-down">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Joining Date
                      </label>
                      <input
                        type="date"
                        value={joiningDate}
                        onChange={(e) => setJoiningDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Designation / Position
                      </label>
                      <input
                        type="text"
                        value={designation}
                        onChange={(e) => setDesignation(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                        placeholder="Sales Executive"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Monthly Salary (৳)
                      </label>
                      <input
                        type="number"
                        disabled={!isSuperAdmin}
                        value={salary}
                        onChange={(e) => setSalary(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden disabled:opacity-50"
                        placeholder="25000"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        NID / National ID
                      </label>
                      <input
                        type="text"
                        value={nidNumber}
                        onChange={(e) => setNidNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                        placeholder="1995xxxxxxxxx"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Address
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden"
                        placeholder="Current or permanent address"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 4: Temporary Password & Security */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 pb-1.5 border-b border-slate-100 text-xs font-bold text-slate-800">
                  <Lock size={14} className="text-amber-500" />
                  <span>4. Temporary Password & Delivery</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      Temporary Password *
                    </label>
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-hidden font-mono"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={generatePassword}
                        title="Generate strong password"
                        className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition text-xs font-bold"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendEmail}
                        onChange={(e) => setSendEmail(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Dispatch Credentials via Email</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requirePasswordChange}
                        onChange={(e) => setRequirePasswordChange(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                      />
                      <span>Enforce password change on first login</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Initial State:</span>
                  <button
                    type="button"
                    onClick={() => setIsActiveAccount(true)}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition ${
                      isActiveAccount ? 'bg-teal-500 text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsActiveAccount(false)}
                    className={`py-1 px-2.5 rounded-lg text-xs font-bold transition ${
                      !isActiveAccount ? 'bg-red-500 text-white shadow-2xs' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    Locked
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-200 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-1.5 bg-slate-900 text-amber-400 font-bold text-xs rounded-lg hover:bg-slate-800 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    {loading ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
                    <span>{loading ? 'Creating...' : 'Provision Staff'}</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* REGISTRY TABLE CARD (Standard Compact Enterprise Table) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        
        {activeTab === 'registry' ? (
          <>
            {/* Filter Bar */}
            <div className="p-3 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50/50">
              <div className="relative w-full sm:w-64">
                <Search className="absolute top-2 left-2.5 text-slate-400" size={13} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search name, email, ID..."
                  className="w-full bg-white border border-slate-200 rounded-lg py-1 pl-7 pr-3 text-xs text-slate-800 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={13} className="text-slate-400 hidden sm:inline" />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="superadmin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="staff">Staff</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Locked</option>
                </select>
              </div>
            </div>

            {/* Compact Table View */}
            <div className="overflow-x-auto">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center text-slate-400 italic text-xs">
                  No matching operators found.
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-bold uppercase tracking-wider bg-slate-50/30">
                      <th className="py-2.5 px-3.5">Operator & ID</th>
                      <th className="py-2.5 px-3">Role</th>
                      <th className="py-2.5 px-3">Sub-Brand Scope</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredUsers.map((u) => {
                      const isUserActive = u.active !== false;
                      const isCurrentEditing = editingUserId === u.id;
                      
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition">
                          
                          {/* Name / Email / ID */}
                          <td className="py-2 px-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                u.role === 'superadmin' ? 'bg-amber-100 text-amber-800' :
                                u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {u.photoUrl ? (
                                  <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover rounded-full" />
                                ) : (
                                  u.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5 truncate">
                                  <span>{u.name}</span>
                                  {u.id === user.id && (
                                    <span className="bg-slate-900 text-amber-400 font-mono text-[9px] px-1 py-0.2 rounded">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-400 font-mono text-[11px] truncate">{u.email}</div>
                                {u.employeeId && (
                                  <div className="text-[10px] font-mono font-bold text-slate-500">
                                    ID: {u.employeeId}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Role Column */}
                          <td className="py-2 px-3">
                            {isCurrentEditing ? (
                              <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as UserRole)}
                                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-hidden"
                              >
                                <option value="staff">Staff</option>
                                <option value="admin">Admin</option>
                                <option value="superadmin">Super Admin</option>
                              </select>
                            ) : (
                              <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-full font-bold text-[10px] ${
                                u.role === 'superadmin' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                u.role === 'admin' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Shield size={10} />
                                {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Staff'}
                              </span>
                            )}
                          </td>

                          {/* SubBrand Access Scope */}
                          <td className="py-2 px-3">
                            {isCurrentEditing ? (
                              <div className="flex gap-1 flex-wrap">
                                {['SAT', 'GZ', 'RTX'].map((brand) => (
                                  <button
                                    type="button"
                                    key={brand}
                                    onClick={() => handleToggleBrandAccess(brand, true)}
                                    className={`py-0.5 px-1.5 rounded text-[10px] font-bold border transition ${
                                      editBrandAccess.includes(brand)
                                        ? 'bg-teal-50 border-teal-400 text-teal-700'
                                        : 'bg-white border-slate-200 text-slate-400'
                                    }`}
                                  >
                                    {brand}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="flex gap-1 flex-wrap">
                                {u.subBrandAccess?.length === 3 ? (
                                  <span className="text-[10px] font-bold bg-slate-100 text-slate-700 py-0.5 px-1.5 rounded border border-slate-200">
                                    Global (All)
                                  </span>
                                ) : u.subBrandAccess && u.subBrandAccess.length > 0 ? (
                                  u.subBrandAccess.map((b) => (
                                    <span key={b} className="text-[10px] font-mono font-bold bg-slate-50 text-slate-600 border border-slate-200 py-0.5 px-1.5 rounded">
                                      {b}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] italic text-red-500 font-bold">None</span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                              isUserActive ? 'text-teal-600' : 'text-slate-400'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isUserActive ? 'bg-teal-500' : 'bg-slate-400'}`} />
                              {isUserActive ? 'Active' : 'Locked'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-2 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {isCurrentEditing ? (
                                <>
                                  <button
                                    onClick={() => handleUpdateUserRoleAndAccess(u.id)}
                                    className="py-1 px-2.5 bg-slate-900 text-amber-400 font-bold text-xs rounded hover:bg-slate-800 transition cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingUserId(null)}
                                    className="py-1 px-2 bg-slate-100 text-slate-600 font-bold text-xs rounded hover:bg-slate-200 transition cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  {isSuperAdmin && (
                                    <button
                                      onClick={() => startEdit(u)}
                                      className="py-1 px-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition cursor-pointer"
                                    >
                                      Edit
                                    </button>
                                  )}

                                  {u.id !== user.id && (
                                    <button
                                      onClick={() => handleToggleUserActive(u)}
                                      className={`py-1 px-2 text-xs font-bold rounded transition cursor-pointer ${
                                        isUserActive
                                          ? 'text-red-600 hover:bg-red-50'
                                          : 'text-teal-600 hover:bg-teal-50'
                                      }`}
                                    >
                                      {isUserActive ? 'Lock' : 'Unlock'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : (
          /* PENDING APPROVALS LIST */
          <div className="p-4 space-y-3">
            {pendingUsers.length === 0 ? (
              <div className="py-8 text-center text-slate-400 italic text-xs">
                No pending operator registration requests found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pendingUsers.map((u) => (
                  <div key={u.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between space-y-3 shadow-2xs">
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 shrink-0 overflow-hidden flex items-center justify-center font-bold text-sm text-amber-800">
                        {u.photoUrl ? (
                          <img src={u.photoUrl} alt={u.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        ) : (
                          u.name.charAt(0).toUpperCase()
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-slate-900 text-xs truncate">{u.name}</h4>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded ${
                            u.requestedRole === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-700'
                          }`}>
                            Req: {u.requestedRole === 'admin' ? 'Admin' : 'Staff'}
                          </span>
                        </div>
                        <p className="text-slate-400 font-mono text-[11px] truncate">{u.email}</p>
                        {u.phone && <p className="text-slate-600 text-xs">Phone: {u.phone}</p>}
                        {u.designation && <p className="text-slate-600 text-xs">Position: {u.designation}</p>}
                      </div>
                    </div>

                    {/* Sub-brand tag */}
                    <div className="bg-white p-2 rounded-lg border border-slate-100 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Brands:</span>
                      <div className="flex gap-1 flex-wrap">
                        {u.requestedSubBrandAccess && u.requestedSubBrandAccess.length > 0 ? (
                          u.requestedSubBrandAccess.map((brand: string) => (
                            <span key={brand} className="text-[10px] font-mono font-bold bg-slate-50 border border-slate-200 text-slate-600 px-1 py-0.2 rounded">
                              {brand}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">None</span>
                        )}
                      </div>
                    </div>

                    {u.status === 'rejected' && (
                      <div className="bg-red-50 border border-red-200 p-2 rounded-lg text-[11px] text-red-700">
                        <span className="font-bold">Rejected:</span> {u.rejectionReason || 'No reason'}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => handleApproveUser(u)}
                        disabled={loading}
                        className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <UserCheck size={12} />
                        <span>Approve</span>
                      </button>
                      <button
                        onClick={() => handleRejectUser(u)}
                        disabled={loading}
                        className="py-1.5 px-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-lg border border-red-200 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <UserX size={12} />
                        <span>Reject</span>
                      </button>
                      <button
                        onClick={() => handleDeleteRequest(u.id)}
                        disabled={loading}
                        className="py-1.5 px-2 hover:bg-slate-200 text-slate-400 hover:text-slate-600 font-bold text-xs rounded-lg transition flex items-center justify-center cursor-pointer"
                        title="Delete Request"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
}
