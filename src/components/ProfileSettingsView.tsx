import React, { useState, useEffect, useRef } from 'react';
import { 
  User, Mail, Phone, Lock, Camera, Save, Calendar, MapPin, 
  UserCheck, AlertCircle, Shield, Bell, Clock, Monitor, 
  Smartphone, ChevronRight, CheckCircle2, Trash2, X, RefreshCw,
  Briefcase
} from 'lucide-react';
import { UserProfile } from '../types';
import { 
  Button, Input, Textarea, ToggleSwitch, Select, SelectOption, 
  Card, Badge, useToast, ThemeToggle, DataTable 
} from '../design-system';
import { 
  updateUserProfile, getLoginHistory, revokeAllSessions, 
  sanitizeData 
} from '../firebase/db';
import { storage, auth } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  updatePassword, EmailAuthProvider, reauthenticateWithCredential 
} from 'firebase/auth';

interface ProfileSettingsViewProps {
  user: UserProfile;
  onRefreshUser: () => Promise<void>;
}

type TabType = 'personal' | 'employment' | 'security' | 'account' | 'notifications';

export default function ProfileSettingsView({ user, onRefreshUser }: ProfileSettingsViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  // Personal Info State
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [address, setAddress] = useState(user.address || '');
  const [dob, setDob] = useState(user.dob || '');
  const [gender, setGender] = useState(user.gender || '');
  const [photoUrl, setPhotoUrl] = useState(user.photoUrl || '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled || false);
  const [loginHistory, setLoginHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Notifications State
  const [notifPrefs, setNotifPrefs] = useState(user.notificationPrefs || {
    orderUpdates: true,
    lowStockAlerts: true,
    pendingApprovals: true,
    duePaymentReminders: true,
    attendanceReminders: true,
    systemAnnouncements: true
  });

  // Track changes
  useEffect(() => {
    const hasChanges = 
      name !== (user.name || '') ||
      phone !== (user.phone || '') ||
      address !== (user.address || '') ||
      dob !== (user.dob || '') ||
      gender !== (user.gender || '') ||
      twoFactorEnabled !== (user.twoFactorEnabled || false) ||
      JSON.stringify(notifPrefs) !== JSON.stringify(user.notificationPrefs || {});
    
    setIsDirty(hasChanges);
  }, [name, phone, address, dob, gender, twoFactorEnabled, notifPrefs, user]);

  // Load login history when security tab is active
  useEffect(() => {
    if (activeTab === 'security') {
      fetchLoginHistory();
    }
  }, [activeTab]);

  const fetchLoginHistory = async () => {
    setLoadingHistory(true);
    try {
      const history = await getLoginHistory(user.id);
      setLoginHistory(history);
    } catch (err) {
      console.error('Failed to load login history', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toastError('Image size should be less than 2MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `profilePhotos/${user.id}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const url = await getDownloadURL(snapshot.ref);
      
      await updateUserProfile(user.id, { photoUrl: url });
      setPhotoUrl(url);
      await onRefreshUser();
      toastSuccess('Profile photo updated successfully!');
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      toastError(err.message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUpdateProfile = async () => {
    setIsSaving(true);
    try {
      const updatedData: Partial<UserProfile> = {
        name,
        phone,
        address,
        dob,
        gender,
        twoFactorEnabled,
        notificationPrefs: notifPrefs
      };
      
      await updateUserProfile(user.id, updatedData);
      await onRefreshUser();
      toastSuccess('Profile updated successfully!');
      setIsDirty(false);
    } catch (err: any) {
      console.error('Update profile failed:', err);
      toastError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toastError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      toastError('Password must be at least 6 characters');
      return;
    }

    setIsSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser || !currentUser.email) throw new Error('User not found');

      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      
      toastSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change failed:', err);
      toastError(err.message || 'Failed to change password. Ensure current password is correct.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeSessions = async () => {
    if (!window.confirm('Sign out from all other devices? You will stay signed in on this one.')) return;
    
    setIsSaving(true);
    try {
      await revokeAllSessions(user.id);
      toastSuccess('All other sessions have been revoked.');
    } catch (err: any) {
      toastError(err.message || 'Failed to revoke sessions');
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { id: TabType, label: string, icon: any }[] = [
    { id: 'personal', label: 'Personal Info', icon: User },
    { id: 'employment', label: 'Employment Info', icon: Briefcase },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'account', label: 'Account', icon: Lock },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar Tabs */}
        <div className="lg:w-64 shrink-0 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  console.log(`Switching to tab: ${tab.id}`);
                  setActiveTab(tab.id);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer relative z-20 ${
                  isActive 
                    ? 'bg-[#D4AF37] text-slate-950 shadow-md ring-1 ring-amber-400/20' 
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-slate-950' : 'text-slate-400'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 space-y-6">
          <Card className="p-6">
            
            {activeTab === 'personal' && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Personal Information</h3>
                  <p className="text-xs text-slate-500">Update your basic profile details and contact information.</p>
                </div>

                {/* Profile Photo */}
                <div className="flex items-center gap-6 pb-8 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden shadow-sm">
                      {photoUrl ? (
                        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-4xl font-black text-slate-300 uppercase">{name?.charAt(0) || 'U'}</span>
                      )}
                      {uploadingPhoto && (
                        <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center">
                          <RefreshCw size={24} className="text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhoto}
                      className="absolute -bottom-2 -right-2 p-2 bg-slate-900 text-white rounded-xl shadow-lg border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Camera size={16} />
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handlePhotoUpload} 
                      className="hidden" 
                      accept="image/*" 
                      onClick={(e) => { (e.target as any).value = null; }} // Reset to allow same file re-upload
                    />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">Profile Photo</h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-[240px]">JPG, GIF or PNG. Max size 2MB. This will be visible to your team.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <Input 
                        value={name} 
                        onChange={e => setName(e.target.value)} 
                        className="pl-10" 
                        placeholder="e.g. Tanvir Ahmed" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <Input 
                        value={phone} 
                        onChange={e => setPhone(e.target.value)} 
                        className="pl-10" 
                        placeholder="01XXXXXXXXX" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email Address (Read-only)</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={16} />
                      <Input value={user.email} disabled className="pl-10 opacity-60 bg-slate-50 dark:bg-slate-800" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Date of Birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <Input 
                        type="date" 
                        value={dob} 
                        onChange={e => setDob(e.target.value)} 
                        className="pl-10" 
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Gender</label>
                    <Select 
                      value={gender} 
                      onChange={val => setGender(val)}
                      options={[
                        { value: '', label: 'Select Gender' },
                        { value: 'Male', label: 'Male' },
                        { value: 'Female', label: 'Female' },
                        { value: 'Other', label: 'Other' },
                        { value: 'N/A', label: 'Prefer not to say' }
                      ]}
                    />
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Present Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3 text-slate-400" size={16} />
                      <Textarea 
                        value={address} 
                        onChange={e => setAddress(e.target.value)} 
                        className="pl-10 min-h-[100px]" 
                        placeholder="Your current location..." 
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'employment' && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Employment Information</h3>
                    <p className="text-xs text-slate-500">Your role and department details within the organization.</p>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1.5 py-1 px-3">
                    <Lock size={12} className="text-slate-400" />
                    Managed by Admin
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Employee ID</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{user.employeeId || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Department</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{user.department || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Designation</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{user.designation || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assigned Role</p>
                    <p className="text-sm font-black text-[#D4AF37] uppercase">{user.role}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Joined Date</p>
                    <p className="text-sm font-black text-slate-700 dark:text-slate-200">{user.joiningDate || 'N/A'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Brand Access</p>
                    <div className="flex gap-1 mt-1">
                      {user.subBrandAccess?.map(b => (
                        <span key={b} className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">{b}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-10 animate-fade-in">
                
                {/* 2FA Toggle */}
                <div className="pb-8 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-[#D4AF37] rounded-2xl">
                        <Shield size={24} />
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Secure your account with email OTP verification on each login.</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-medium bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded inline-block">
                          Note: Uses existing email verification system.
                        </p>
                      </div>
                    </div>
                    <ToggleSwitch 
                      checked={twoFactorEnabled} 
                      onChange={setTwoFactorEnabled} 
                    />
                  </div>
                </div>

                {/* Password Change Form */}
                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Lock size={18} className="text-slate-400" />
                    Change Account Password
                  </h4>
                  <form onSubmit={handleChangePassword} className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Current Password</label>
                      <Input 
                        type="password" 
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)} 
                        required 
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">New Password</label>
                      <Input 
                        type="password" 
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)} 
                        required 
                        placeholder="Min 6 chars"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Confirm New Password</label>
                      <Input 
                        type="password" 
                        value={confirmPassword} 
                        onChange={e => setConfirmPassword(e.target.value)} 
                        required 
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button type="submit" disabled={isSaving || !newPassword}>Update Password</Button>
                    </div>
                  </form>
                </div>

                {/* Login History */}
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock size={18} className="text-slate-400" />
                      Login History (Last 20)
                    </h4>
                    <Button variant="ghost" size="sm" onClick={handleRevokeSessions} className="text-red-500 hover:text-red-600 font-bold">
                      Sign Out Other Devices
                    </Button>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white/50 dark:bg-slate-900/50">
                          <th className="py-3 px-4">Date & Time</th>
                          <th className="py-3 px-4">Device / Browser</th>
                          <th className="py-3 px-4">OS / Platform</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {loadingHistory ? (
                          <tr><td colSpan={4} className="py-8 text-center text-slate-400 animate-pulse">Fetching records...</td></tr>
                        ) : loginHistory.length === 0 ? (
                          <tr><td colSpan={4} className="py-8 text-center text-slate-400 italic">No login records found.</td></tr>
                        ) : (
                          loginHistory.map((log, idx) => (
                            <tr key={log.id || idx} className="hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                                {new Date(log.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {log.userAgent?.includes('Mobile') ? <Smartphone size={14} className="text-slate-400" /> : <Monitor size={14} className="text-slate-400" />}
                                  <span className="truncate max-w-[140px] text-slate-500" title={log.userAgent}>{log.userAgent?.split(') ')[1] || 'Web Browser'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-500 font-mono text-[10px]">{log.platform || 'Unknown'}</td>
                              <td className="py-3 px-4">
                                <Badge variant={log.status === 'success' ? 'success' : 'danger'} className="text-[9px] uppercase">{log.status}</Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-4 italic">Device revocation is best-effort and may take up to 24 hours to take full effect across all caches.</p>
                </div>

              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Notification Preferences</h3>
                  <p className="text-xs text-slate-500">Configure which system alerts you want to receive in-app.</p>
                </div>

                <div className="space-y-4">
                  {[
                    { key: 'orderUpdates', label: 'Order Status Updates', desc: 'Alerts when orders are confirmed, shipped or delivered.', roles: ['all'] },
                    { key: 'lowStockAlerts', label: 'Low Stock Alerts', desc: 'Daily notification for products reaching reorder threshold.', roles: ['all'] },
                    { key: 'pendingApprovals', label: 'Pending Approvals', desc: 'Alerts for new staff registration or deletion requests.', roles: ['admin', 'superadmin'] },
                    { key: 'duePaymentReminders', label: 'Due Payment Reminders', desc: 'Alerts for invoices that have reached their due date.', roles: ['all'] },
                    { key: 'attendanceReminders', label: 'Attendance Reminders', desc: 'Reminder to check-in/out during work shifts.', roles: ['all'] },
                    { key: 'systemAnnouncements', label: 'System Announcements', desc: 'Updates about new features or maintenance windows.', roles: ['all'] },
                  ].filter(p => p.roles.includes('all') || p.roles.includes(user.role)).map(pref => (
                    <div key={pref.key} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{pref.label}</p>
                        <p className="text-[11px] text-slate-500">{pref.desc}</p>
                      </div>
                      <ToggleSwitch 
                        checked={(notifPrefs as any)[pref.key]} 
                        onChange={(val) => setNotifPrefs(prev => ({ ...prev, [pref.key]: val }))} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-8 animate-fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Account Management</h3>
                  <p className="text-xs text-slate-500">Overview of your account lifecycle and authentication state.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account Status</p>
                      <Badge variant={user.active !== false ? 'success' : 'danger'} className="text-xs py-1 px-3">
                        {user.active !== false ? 'Verified Active' : 'Suspended'}
                      </Badge>
                    </div>
                    <CheckCircle2 size={32} className="text-emerald-500 opacity-20" />
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Account Created By</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{user.createdBy || 'System / Auto'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Theme Preference</p>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-sm font-bold capitalize text-slate-700 dark:text-slate-200">{user.themePreference || 'System Default'}</span>
                      <ThemeToggle />
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">User UID (Ref)</p>
                    <p className="text-[11px] font-mono text-slate-500 break-all">{user.id}</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30 flex gap-3">
                  <AlertCircle size={18} className="text-blue-500 shrink-0" />
                  <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed">
                    To permanently delete your account and all associated data, please contact the System Super Admin. Self-deletion is restricted for data integrity and audit logging requirements.
                  </p>
                </div>
              </div>
            )}

          </Card>

          {/* Sticky Save Bar */}
          {isDirty && (
            <div className="sticky bottom-6 z-10 bg-slate-900/90 dark:bg-[#D4AF37]/90 backdrop-blur-md p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-slide-up border border-slate-800 dark:border-amber-400/50">
              <div className="flex items-center gap-2 text-white dark:text-slate-950">
                <AlertCircle size={18} />
                <span className="text-xs font-bold">You have unsaved changes in your profile.</span>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="ghost" 
                  onClick={() => {
                    setName(user.name || '');
                    setPhone(user.phone || '');
                    setAddress(user.address || '');
                    setDob(user.dob || '');
                    setGender(user.gender || '');
                    setTwoFactorEnabled(user.twoFactorEnabled || false);
                    setNotifPrefs(user.notificationPrefs || {
                      orderUpdates: true,
                      lowStockAlerts: true,
                      pendingApprovals: true,
                      duePaymentReminders: true,
                      attendanceReminders: true,
                      systemAnnouncements: true
                    });
                  }}
                  className="text-white hover:bg-white/10 dark:text-slate-950 dark:hover:bg-slate-950/10"
                >
                  Discard
                </Button>
                <Button 
                  onClick={handleUpdateProfile} 
                  disabled={isSaving}
                  className="bg-[#D4AF37] text-slate-950 dark:bg-slate-950 dark:text-amber-400"
                >
                  {isSaving ? 'Synchronizing...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


