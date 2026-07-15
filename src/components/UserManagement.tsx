import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { 
  getAllUsers, 
  createUserProfile, 
  updateUserProfile, 
  deleteSokolDemoData,
  getPrivateEmploymentInfo,
  updatePrivateEmploymentInfo
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
  Sparkles, 
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
  RefreshCw
} from 'lucide-react';
import { storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { sendCredentialsEmail } from '../lib/emailjs';

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

  // Form sections visibility
  const [showEmploymentInfo, setShowEmploymentInfo] = useState(false);
  const [showAdvancedPerms, setShowAdvancedPerms] = useState(false);

  // Form states - Basic Info
  const [showAddForm, setShowAddForm] = useState(false);
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
    deleteSokolDemoData().then(() => fetchUsersList());
  }, []);

  const fetchUsersList = async () => {
    setLoading(true);
    try {
      const list = await getAllUsers();
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError('Could not retrieve operator registry.');
    } finally {
      setLoading(false);
    }
  };

  // Check permissions
  const isSuperAdmin = user.role === 'superadmin';
  const isAdmin = user.role === 'admin';
  const canManageUsers = isSuperAdmin || isAdmin;

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
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleToggleBrandAccess = (brand: string, isEdit: boolean) => {
    if (isEdit) {
      if (editBrandAccess.includes(brand)) {
        setEditBrandAccess(editBrandAccess.filter(b => b !== brand));
      } else {
        setEditBrandAccess([...editBrandAccess, brand]);
      }
    } else {
      if (brandAccess.includes(brand)) {
        setBrandAccess(brandAccess.filter(b => b !== brand));
      } else {
        setBrandAccess([...brandAccess, brand]);
      }
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    console.log('UserManagement: Starting AddUser process...');

    // Validations
    if (!email.trim() || !fullName.trim() || !phoneNumber.trim()) {
      setError('Name, Email, and Phone Number are required basic fields.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    const bdPhoneRegex = /^(?:\+88|88)?(01[3-9]\d{8})$/;
    if (!bdPhoneRegex.test(phoneNumber.replace(/\s/g, ''))) {
      setError('Please enter a valid Bangladesh phone number (e.g. 01XXXXXXXXX).');
      return;
    }

    if (brandAccess.length === 0) {
      setError('Please assign access to at least one sub-brand.');
      return;
    }

    if (!tempPassword) {
      setError('Please set or generate a temporary password.');
      return;
    }

    // Role restrictions
    if (selectedRole === 'admin' && !isSuperAdmin) {
      setError('Only Super Admins can create Admin accounts.');
      return;
    }
    if (selectedRole === 'superadmin') {
      setError('Super Admin accounts cannot be created from this form.');
      return;
    }

    setLoading(true);
    try {
      const { initializeApp } = await import('firebase/app');
      const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
      const { auth: primaryAuth } = await import('../firebase/config');
      
      console.log('UserManagement: Initializing secondary app for operator creation...');
      const secondaryApp = initializeApp(primaryAuth.app.options, `SecondaryApp-${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);

      // 1. Create Auth User
      console.log('UserManagement: Creating Firebase Auth account for:', email);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.toLowerCase().trim(), tempPassword);
      const newUserId = userCredential.user.uid;
      console.log('UserManagement: Auth account created. UID:', newUserId);

      // 2. Upload Photo if present
      let photoUrl = '';
      if (photoFile) {
        console.log('UserManagement: Attempting photo upload for operator...');
        try {
          if (storage) {
            const photoRef = ref(storage, `avatars/${newUserId}/${photoFile.name}`);
            const uploadResult = await uploadBytes(photoRef, photoFile);
            photoUrl = await getDownloadURL(uploadResult.ref);
          } else {
            console.warn('Storage not available, using base64 fallback');
            photoUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(photoFile);
            });
          }
          await updateProfile(userCredential.user, { photoURL: photoUrl });
          console.log('UserManagement: Photo processed successfully.');
        } catch (storageErr) {
          console.error('Photo upload failed, continuing without photo:', storageErr);
        }
      }

      // 3. Create Public Profile
      const newProfile: UserProfile = {
        id: newUserId,
        name: fullName,
        email: email.toLowerCase().trim(),
        phone: phoneNumber,
        photoUrl: photoUrl || '',
        role: selectedRole,
        subBrandAccess: brandAccess || [],
        permissionOverrides: permissionOverrides || [],
        designation: designation || '',
        joiningDate: joiningDate || '',
        nidNumber: nidNumber || '',
        address: address || '',
        requirePasswordChange: !!requirePasswordChange,
        active: !!isActiveAccount,
        createdBy: user.id,
        createdAt: Date.now(),
        onboardingCompleted: true
      };

      console.log('UserManagement: Writing user profile to Firestore...');
      await createUserProfile(newUserId, newProfile);
      console.log('UserManagement: Profile write successful.');

      // 4. Save Private Salary Data if Super Admin
      if (isSuperAdmin && salary !== '') {
        console.log('UserManagement: Writing private employment info...');
        await updatePrivateEmploymentInfo(newUserId, {
          salary: Number(salary),
          updatedAt: Date.now()
        });
      }
      
      // 5. Send Email if requested
      if (sendEmail) {
        console.log('UserManagement: Sending credentials email...');
        try {
          await sendCredentialsEmail(email.toLowerCase().trim(), tempPassword, fullName);
        } catch (emailErr) {
          console.error('Email sending failed:', emailErr);
          setSuccess(`Profile created for ${fullName}, but email sending failed. Password: ${tempPassword}`);
        }
      }
      
      // Clean up
      await secondaryAuth.signOut();

      if (!success) {
        setSuccess(`Operator profile successfully provisioned for ${fullName}.`);
      }
      
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
      setSendEmail(true);
      setRequirePasswordChange(true);
      setIsActiveAccount(true);
      setShowAddForm(false);
      
      console.log('UserManagement: Refreshing operator list...');
      await fetchUsersList();
    } catch (err: any) {
      console.error('Add user error:', err);
      let errorMsg = err.message || 'Failed to provision user profile.';
      
      // Handle Firebase Auth specific errors
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'An account with this email already exists in the system. Please use a different email or contact a Super Admin to manage existing accounts.';
      } else if (err.code === 'auth/invalid-email') {
        errorMsg = 'The email address provided is invalid. Please check for typos.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'The generated password is too weak. Please try a more complex one.';
      } else {
        // Handle Firestore sanitized errors (JSON)
        try {
          const parsed = JSON.parse(err.message);
          errorMsg = `Cloud Database Error: ${parsed.error}`;
          if (parsed.path) errorMsg += ` (at ${parsed.path})`;
        } catch (e) {
          // Not JSON, keep original errorMsg or err.message
        }
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRoleAndAccess = async (targetUserId: string) => {
    setError('');
    setSuccess('');

    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return;

    if (!isSuperAdmin) {
      setError('Only Super Admins can edit roles and sub-brand access rights.');
      return;
    }

    setLoading(true);
    try {
      await updateUserProfile(targetUserId, {
        role: editRole,
        subBrandAccess: editBrandAccess
      });
      setSuccess(`Updated access permissions for ${targetUser.name}`);
      setEditingUserId(null);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Failed to update operator profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserActive = async (targetUser: UserProfile) => {
    setError('');
    setSuccess('');

    if (targetUser.id === user.id) {
      setError('You cannot activate or deactivate your own account.');
      return;
    }

    // Role safety restrictions
    if (targetUser.role === 'superadmin' && !isSuperAdmin) {
      setError('Only Super Admins can manage other Super Admin states.');
      return;
    }
    if (targetUser.role === 'admin' && !isSuperAdmin) {
      setError('Admins cannot activate or deactivate other Admin operators.');
      return;
    }

    const newActiveState = !(targetUser.active !== false);

    setLoading(true);
    try {
      await updateUserProfile(targetUser.id, {
        active: newActiveState
      });
      setSuccess(`Successfully ${newActiveState ? 'activated' : 'deactivated'} ${targetUser.name}`);
      await fetchUsersList();
    } catch (err: any) {
      setError(err.message || 'Failed to modify active status.');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (targetUser: UserProfile) => {
    if (!isSuperAdmin) {
      setError('Only Super Admins can modify existing operator profiles.');
      return;
    }
    setEditingUserId(targetUser.id);
    setEditRole(targetUser.role);
    setEditBrandAccess(targetUser.subBrandAccess || []);
  };

  // Filter lists
  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRole = roleFilter === 'all' ? true : u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' ? true : 
                          statusFilter === 'active' ? (u.active !== false) : (u.active === false);

    return matchesSearch && matchesRole && matchesStatus;
  });

  if (!canManageUsers) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center max-w-lg mx-auto mt-10">
        <Shield className="w-16 h-16 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          Only Super Admin and Admin operators have permission to access the User Management & Staff Permissions registry.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Upper Grid - Header & Stats (Bento Style) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Bento Cell 1: Main Title Banner */}
        <div className="md:col-span-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white p-6 rounded-3xl border border-slate-800 shadow-md flex flex-col justify-between relative overflow-hidden min-h-[140px]">
          <div className="absolute right-0 bottom-0 translate-x-10 translate-y-10 w-44 h-44 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />
          
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold bg-amber-400/20 text-amber-400 py-0.5 px-2 rounded-full uppercase tracking-wider">
                Operator Security
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Level: {user.role.toUpperCase()}
              </span>
            </div>
            <h1 className="text-2xl font-bold font-display mt-2 tracking-tight">Staff Registry & Permissions</h1>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Provision brand-isolated user accounts, assign roles, and handle operator state locks.
            </p>
          </div>
        </div>

        {/* Bento Cell 2: Quick Metrics & Invitation trigger */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Operator Coverage</span>
              <div className="text-3xl font-extrabold text-slate-900 mt-1 font-mono">{users.length}</div>
            </div>
            <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-600">
              <UserCheck size={20} />
            </div>
          </div>

          <button
            onClick={() => {
              setError('');
              setSuccess('');
              setShowAddForm(!showAddForm);
            }}
            className="w-full mt-3 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-amber-400 hover:text-amber-350 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <UserPlus size={14} />
            {showAddForm ? 'Close Invitation Pane' : 'Invite New Operator'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs font-medium">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-medium">
          {success}
        </div>
      )}

      {/* STEP / ACTION PANELS */}
      {showAddForm && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-md animate-fade-in overflow-hidden">
          <div className="p-6 md:p-8 space-y-8">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 text-amber-500">
                  <PlusCircle size={16} />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest">Provision Console Account</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-1">Operator Profile Provisioning</h2>
                <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                  Complete all sections to securely onboard a new operator to the Sky Automation ecosystem.
                </p>
              </div>
              <button 
                onClick={() => setShowAddForm(false)}
                className="text-slate-400 hover:text-slate-600 p-2"
              >
                <UserX size={20} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-8">
              
              {/* 1. BASIC INFO */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <UserIcon size={16} className="text-amber-500" />
                  1. Basic Information
                </h3>
                
                <div className="flex flex-col md:flex-row gap-8">
                  {/* Photo Upload */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-3">
                    <div className="relative group">
                      <div className="w-24 h-24 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-amber-400">
                        {photoPreview ? (
                          <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <Camera size={32} className="text-slate-300" />
                        )}
                      </div>
                      <label className="absolute -bottom-2 -right-2 bg-slate-900 text-white p-1.5 rounded-xl cursor-pointer shadow-lg hover:bg-amber-500 hover:text-slate-950 transition-all">
                        <PlusCircle size={16} />
                        <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                      </label>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Avatar Photo</span>
                  </div>

                  {/* Inputs */}
                  <div className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                        Full Name *
                      </label>
                      <div className="relative">
                        <UserIcon className="absolute top-3 left-3.5 text-slate-400" size={16} />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400 focus:border-transparent font-medium"
                          placeholder="e.g. Shakib Al Hasan"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="absolute top-3 left-3.5 text-slate-400" size={16} />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400 focus:border-transparent font-medium font-mono"
                          placeholder="operator@skyautomation.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                        Phone Number *
                      </label>
                      <div className="relative">
                        <Phone className="absolute top-3 left-3.5 text-slate-400" size={16} />
                        <input
                          type="text"
                          required
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-400 focus:border-transparent font-medium"
                          placeholder="e.g. 01712345678"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. ROLE & ACCESS */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Shield size={16} className="text-amber-500" />
                  2. Role & Access Domains
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                      Authority Level
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRole('staff')}
                        className={`py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                          selectedRole === 'staff'
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200'
                        }`}
                      >
                        <UserIcon size={16} />
                        <span className="font-bold text-xs uppercase tracking-tight">Staff</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isSuperAdmin}
                        onClick={() => setSelectedRole('admin')}
                        className={`py-3 px-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 ${
                          selectedRole === 'admin'
                            ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                            : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed'
                        }`}
                      >
                        <Shield size={16} />
                        <div className="text-left">
                          <span className="block font-bold text-xs uppercase tracking-tight">Admin</span>
                          {!isSuperAdmin && <span className="text-[8px] text-slate-400 font-mono">SUPER ONLY</span>}
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                      Sub-brand Access Rights
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {['SAT', 'GZ', 'RTX'].map((brand) => {
                        const isSelected = brandAccess.includes(brand);
                        return (
                          <button
                            type="button"
                            key={brand}
                            onClick={() => handleToggleBrandAccess(brand, false)}
                            className={`py-2.5 px-4 rounded-xl text-xs font-bold border-2 flex items-center gap-2 transition-all ${
                              isSelected
                                ? 'bg-teal-50 border-teal-500/30 text-teal-700 shadow-xs'
                                : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'
                            }`}
                          >
                            {isSelected ? <Check size={14} /> : <div className="w-3.5" />}
                            {brand === 'SAT' ? 'Sky Automation' : brand === 'GZ' ? 'GadgetZu' : 'RTX Gadget'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Advanced Permission Overrides */}
                <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedPerms(!showAdvancedPerms)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-100/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={14} className="text-slate-400" />
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Individual Permission Overrides</span>
                    </div>
                    {showAdvancedPerms ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  
                  {showAdvancedPerms && (
                    <div className="p-4 pt-0 grid grid-cols-2 md:grid-cols-4 gap-3 animate-slide-down">
                      {Object.keys(DEFAULT_PERMISSIONS.admin).map((action) => {
                        const defaultVal = DEFAULT_PERMISSIONS[selectedRole as keyof typeof DEFAULT_PERMISSIONS][action as keyof (typeof DEFAULT_PERMISSIONS)['admin']];
                        const override = permissionOverrides[action];
                        const effective = override !== undefined ? override : defaultVal;

                        return (
                          <div 
                            key={action}
                            className={`p-2 rounded-lg border flex flex-col gap-1.5 transition-all ${
                              effective ? 'bg-white border-teal-100 shadow-xs' : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-bold text-slate-500 uppercase truncate">
                                {action.replace(/([A-Z])/g, ' $1')}
                              </span>
                              <input 
                                type="checkbox"
                                checked={effective}
                                onChange={(e) => {
                                  setPermissionOverrides(prev => ({
                                    ...prev,
                                    [action]: e.target.checked
                                  }));
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                              />
                            </div>
                            <span className={`text-[8px] font-mono ${effective ? 'text-teal-600' : 'text-slate-400'}`}>
                              {effective ? 'GRANTED' : 'DENIED'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. EMPLOYMENT INFO */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Briefcase size={16} className="text-amber-500" />
                    3. Employment Details
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowEmploymentInfo(!showEmploymentInfo)}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                  >
                    {showEmploymentInfo ? 'Hide Details' : 'Show Optional Details'}
                    {showEmploymentInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {showEmploymentInfo && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-down">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                          Joining Date
                        </label>
                        <div className="relative">
                          <Calendar className="absolute top-3 left-3.5 text-slate-400" size={16} />
                          <input
                            type="date"
                            value={joiningDate}
                            onChange={(e) => setJoiningDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                          Designation / Position
                        </label>
                        <div className="relative">
                          <Briefcase className="absolute top-3 left-3.5 text-slate-400" size={16} />
                          <input
                            type="text"
                            value={designation}
                            onChange={(e) => setDesignation(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden"
                            placeholder="e.g. Sales Executive"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                          Monthly Salary (৳)
                        </label>
                        <div className="relative">
                          <DollarSign className="absolute top-3 left-3.5 text-slate-400" size={16} />
                          <input
                            type="number"
                            disabled={!isSuperAdmin}
                            value={salary}
                            onChange={(e) => setSalary(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden disabled:opacity-50 disabled:bg-slate-100"
                            placeholder={isSuperAdmin ? "e.g. 25000" : "Restricted for Super Admin"}
                          />
                        </div>
                        {isSuperAdmin && (
                          <p className="text-[9px] text-slate-400 italic mt-1 ml-1 flex items-center gap-1">
                            <Lock size={10} /> Private data: Restricted to Super Admin view only.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                          NID / Identification Number
                        </label>
                        <div className="relative">
                          <CreditCard className="absolute top-3 left-3.5 text-slate-400" size={16} />
                          <input
                            type="text"
                            value={nidNumber}
                            onChange={(e) => setNidNumber(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden"
                            placeholder="e.g. 1995123456789"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                          Home Address
                        </label>
                        <div className="relative">
                          <MapPin className="absolute top-3 left-3.5 text-slate-400" size={16} />
                          <textarea
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-xs text-slate-800 focus:outline-hidden resize-none"
                            placeholder="Full permanent or current address..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4. ACCOUNT SETUP */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Lock size={16} className="text-amber-500" />
                  4. Account Setup & Delivery
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">
                      Temporary Access Password *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-grow">
                        <Lock className="absolute top-3 left-3.5 text-slate-400" size={16} />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={tempPassword}
                          onChange={(e) => setTempPassword(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-xs text-slate-800 focus:outline-hidden font-mono"
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute top-2.5 right-3 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={generatePassword}
                        title="Generate strong password"
                        className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"
                      >
                        <RefreshCw size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 md:pt-6">
                    <label className="flex items-center gap-3 group cursor-pointer">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={sendEmail}
                          onChange={(e) => setSendEmail(e.target.checked)}
                          className="w-5 h-5 rounded-lg border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Dispatch Credentials via Email</span>
                        <span className="text-[10px] text-slate-400">Operator will receive their login link and temp password.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 group cursor-pointer">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={requirePasswordChange}
                          onChange={(e) => setRequirePasswordChange(e.target.checked)}
                          className="w-5 h-5 rounded-lg border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">Enforce Password Change</span>
                        <span className="text-[10px] text-slate-400">User will be prompted to reset password on their first login.</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* 5. STATUS */}
              <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Account Initial State</span>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setIsActiveAccount(true)}
                        className={`py-1.5 px-4 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all ${
                          isActiveAccount 
                          ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' 
                          : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        Active
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsActiveAccount(false)}
                        className={`py-1.5 px-4 rounded-full text-[10px] font-bold uppercase tracking-tight transition-all ${
                          !isActiveAccount 
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' 
                          : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        Suspended
                      </button>
                    </div>
                  </div>
                  {!isActiveAccount && (
                    <div className="flex items-center gap-2 text-red-500 bg-red-50 py-2 px-3 rounded-xl animate-pulse">
                      <Shield size={14} />
                      <span className="text-[10px] font-bold uppercase">Account will be locked on creation</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="py-3 px-6 bg-slate-50 text-slate-600 font-bold text-xs rounded-2xl hover:bg-slate-100 transition-all border border-slate-100"
                  >
                    Cancel Onboarding
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="py-3 px-8 bg-slate-900 text-amber-400 font-bold text-xs rounded-2xl shadow-xl hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {loading ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    )}
                    {loading ? 'Processing Onboarding...' : 'Commit Operator Onboarding'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FILTER & REGISTRY GRID */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        
        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="relative w-full sm:w-72">
            <Search className="absolute top-2.5 left-3 text-slate-400" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-8 pr-4 text-xs text-slate-800 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} className="text-slate-400 hidden sm:inline" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-600 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="superadmin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-xs text-slate-600 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Locked Only</option>
            </select>
          </div>
        </div>

        {/* User List Table */}
        <div className="overflow-x-auto">
          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-slate-400 italic text-xs">
              No active operator records found matching filters.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <table className="w-full text-left border-collapse hidden md:table">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Operator Info</th>
                    <th className="py-3 px-4">Authority Level</th>
                    <th className="py-3 px-4">Scope Domain</th>
                    <th className="py-3 px-4">Activity Status</th>
                    <th className="py-3 px-4 text-right">Registry Operations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((u) => {
                    const isUserActive = u.active !== false;
                    const isCurrentEditing = editingUserId === u.id;
                    
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        
                        {/* Name / Email */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              u.role === 'superadmin' ? 'bg-amber-100 text-amber-700' :
                              u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                {u.name}
                                {u.id === user.id && (
                                  <span className="bg-slate-900 text-amber-400 font-mono text-[9px] px-1 rounded">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-400 font-mono text-[11px] mt-0.5">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role Column */}
                        <td className="py-3.5 px-4 font-semibold uppercase tracking-wider text-[10px]">
                          {isCurrentEditing ? (
                            <select
                              value={editRole}
                              onChange={(e) => setEditRole(e.target.value as UserRole)}
                              className="bg-slate-50 border border-slate-200 rounded-lg p-1 text-[10px] font-bold focus:outline-hidden"
                            >
                              <option value="staff">Staff</option>
                              <option value="admin">Admin</option>
                              <option value="superadmin">Super Admin</option>
                            </select>
                          ) : (
                            <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-full font-bold ${
                              u.role === 'superadmin' ? 'bg-amber-400/10 text-amber-600' :
                              u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-slate-100 text-slate-600'
                            }`}>
                              <Shield size={10} />
                              {u.role === 'superadmin' ? 'Super Admin' : u.role === 'admin' ? 'Admin' : 'Staff'}
                            </span>
                          )}
                        </td>

                        {/* subBrand Access scope */}
                        <td className="py-3.5 px-4">
                          {isCurrentEditing ? (
                            <div className="flex gap-1.5 flex-wrap">
                              {['SAT', 'GZ', 'RTX'].map((brand) => (
                                <button
                                  type="button"
                                  key={brand}
                                  onClick={() => handleToggleBrandAccess(brand, true)}
                                  className={`py-0.5 px-1.5 rounded text-[10px] font-bold border ${
                                    editBrandAccess.includes(brand)
                                      ? 'bg-teal-500/10 border-teal-500/30 text-teal-700'
                                      : 'bg-slate-50 border-slate-200 text-slate-400'
                                  }`}
                                >
                                  {brand}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              {u.subBrandAccess?.length === 3 ? (
                                <span className="text-[10px] font-bold bg-slate-100 text-slate-600 py-0.5 px-2 rounded">
                                  Global Scope (All Brands)
                                </span>
                              ) : u.subBrandAccess && u.subBrandAccess.length > 0 ? (
                                u.subBrandAccess.map((b) => (
                                  <span key={b} className="text-[10px] font-mono font-bold bg-slate-50 text-slate-500 border border-slate-100 py-0.5 px-1.5 rounded">
                                    {b}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] italic text-red-500 font-bold">Isolated (None)</span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 font-bold ${
                            isUserActive ? 'text-teal-600' : 'text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isUserActive ? 'bg-teal-500' : 'bg-slate-400'}`} />
                            {isUserActive ? 'Active' : 'Locked'}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isCurrentEditing ? (
                              <>
                                <button
                                  onClick={() => handleUpdateUserRoleAndAccess(u.id)}
                                  className="py-1 px-2.5 bg-slate-900 text-amber-400 font-bold text-[10px] rounded hover:bg-slate-800"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingUserId(null)}
                                  className="py-1 px-2.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded hover:bg-slate-200"
                                >
                                  Exit
                                </button>
                              </>
                            ) : (
                              <>
                                {isSuperAdmin && (
                                  <button
                                    onClick={() => startEdit(u)}
                                    className="py-1 px-2 text-[10px] font-bold text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded transition-all"
                                  >
                                    Edit Access
                                  </button>
                                )}

                                {/* Only Admin or Super Admin can unlock/lock operators based on role */}
                                {u.id !== user.id && (
                                  <button
                                    onClick={() => handleToggleUserActive(u)}
                                    className={`py-1 px-2 text-[10px] font-bold rounded transition-all ${
                                      isUserActive
                                        ? 'text-red-600 hover:bg-red-50'
                                        : 'text-teal-600 hover:bg-teal-50'
                                    }`}
                                  >
                                    {isUserActive ? 'Deactivate' : 'Activate'}
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

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {filteredUsers.map((u) => {
                  const isUserActive = u.active !== false;
                  const isCurrentEditing = editingUserId === u.id;

                  return (
                    <div key={u.id} className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                          u.role === 'superadmin' ? 'bg-amber-100 text-amber-700' :
                          u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            {u.name}
                            {u.id === user.id && <span className="text-[9px] bg-slate-900 text-amber-400 px-1 rounded">You</span>}
                          </div>
                          <div className="text-slate-400 font-mono text-[10px]">{u.email}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded-full font-bold text-[9px] uppercase tracking-wider ${
                            u.role === 'superadmin' ? 'bg-amber-400/10 text-amber-600' :
                            u.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {u.role}
                          </span>
                          <span className={`text-[10px] font-bold ${isUserActive ? 'text-teal-600' : 'text-slate-400'}`}>
                            {isUserActive ? '● Active' : '● Locked'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Brand Access Scope</p>
                        <div className="flex flex-wrap gap-1">
                          {u.subBrandAccess?.length === 3 ? (
                            <span className="text-[10px] font-bold text-slate-600">Global (All Brands)</span>
                          ) : u.subBrandAccess && u.subBrandAccess.length > 0 ? (
                            u.subBrandAccess.map((b) => (
                              <span key={b} className="text-[10px] font-mono font-bold bg-white border border-slate-200 py-0.5 px-1.5 rounded">
                                {b}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] italic text-red-500 font-bold">None</span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        {isSuperAdmin && (
                          <button
                            onClick={() => startEdit(u)}
                            className="py-1.5 px-3 text-[10px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg"
                          >
                            Edit Access
                          </button>
                        )}
                        {u.id !== user.id && (
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className={`py-1.5 px-3 text-[10px] font-bold rounded-lg border transition-all ${
                              isUserActive
                                ? 'text-red-600 border-red-100 bg-red-50'
                                : 'text-teal-600 border-teal-100 bg-teal-50'
                            }`}
                          >
                            {isUserActive ? 'Lock Account' : 'Unlock Account'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>

    </div>
  );
}
