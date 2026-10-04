import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile } from '../types';
import { 
  getAllAttendanceRecords, 
  getAllUsers, 
  deleteAttendanceRecord, 
  cleanupDuplicateSessions,
  cleanupOldAttendanceRecords,
  checkInOnBehalf,
  checkOutOnBehalf
} from '../firebase/db';
import { 
  Clock, 
  Filter, 
  Calendar, 
  User, 
  Trash2, 
  ShieldAlert, 
  Sparkles, 
  LogIn, 
  LogOut, 
  CheckCircle, 
  X, 
  Shield, 
  Users,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  Check
} from 'lucide-react';

interface AttendanceLogProps {
  user: UserProfile | null;
}

export default function AttendanceLog({ user }: AttendanceLogProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [purgingOld, setPurgingOld] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [timeframeFilter, setTimeframeFilter] = useState<'all' | 'today' | 'this_month'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [behalfModal, setBehalfModal] = useState<{
    type: 'checkin' | 'checkout';
    targetUser: UserProfile;
    useCustomTime: boolean;
    customDateTime: string;
    submitting: boolean;
    error: string;
  } | null>(null);

  const isSuperAdmin = user?.role === 'superadmin';

  const getLocalDatetimeString = (date: Date = new Date()) => {
    const tzoffset = date.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
    return localISOTime;
  };

  const handleOpenBehalfModal = (type: 'checkin' | 'checkout', targetUser: UserProfile) => {
    setBehalfModal({
      type,
      targetUser,
      useCustomTime: false,
      customDateTime: getLocalDatetimeString(),
      submitting: false,
      error: ''
    });
  };

  const handleBehalfSubmit = async () => {
    if (!behalfModal) return;
    setBehalfModal(prev => prev ? { ...prev, submitting: true, error: '' } : null);
    try {
      const customTime = behalfModal.useCustomTime ? new Date(behalfModal.customDateTime).getTime() : undefined;
      const adminName = user?.name || user?.email || 'Super Admin';
      const adminId = user?.id || 'sys';

      if (behalfModal.type === 'checkin') {
        await checkInOnBehalf(behalfModal.targetUser.id, behalfModal.targetUser, adminId, adminName, customTime);
      } else {
        await checkOutOnBehalf(behalfModal.targetUser.id, behalfModal.targetUser, adminId, adminName, customTime);
      }

      setBehalfModal(null);
      setNotification({
        type: 'success',
        message: `${behalfModal.targetUser.name} has been checked ${behalfModal.type === 'checkin' ? 'in' : 'out'} successfully.`
      });
      setTimeout(() => setNotification(null), 4000);
      await fetchUsers();
      await fetchLogs();
    } catch (err: any) {
      console.error(err);
      setBehalfModal(prev => prev ? { ...prev, submitting: false, error: err.message || 'Action failed.' } : null);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLogs();

    // 1-Month background auto-cleanup of attendance records (>30 days old)
    const runAutoCleanup = async () => {
      try {
        const res = await cleanupOldAttendanceRecords(30);
        if (res && res.deletedCount > 0) {
          console.info(`[Attendance 1-Month Retention] Auto-deleted ${res.deletedCount} old attendance record(s).`);
          fetchLogs();
        }
      } catch (e) {
        console.warn('Auto attendance cleanup notice:', e);
      }
    };
    runAutoCleanup();
  }, []);

  const fetchUsers = async () => {
    const u = await getAllUsers();
    setUsers(u || []);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const records = await getAllAttendanceRecords(dateFilter || undefined, userFilter || undefined);
      setLogs(records || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this attendance record? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteAttendanceRecord(id);
      setNotification({ type: 'success', message: 'Attendance record deleted.' });
      setTimeout(() => setNotification(null), 3000);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: 'Failed to delete attendance record.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicateCleanup = async () => {
    if (!window.confirm('Run automated session cleanup? This will auto-close any duplicate open sessions.')) return;
    setCleaning(true);
    try {
      const count = await cleanupDuplicateSessions();
      setNotification({ type: 'success', message: `Cleanup completed. Closed ${count} orphan open session(s).` });
      setTimeout(() => setNotification(null), 4000);
      await fetchLogs();
      await fetchUsers();
    } catch (error) {
      console.error(error);
      setNotification({ type: 'error', message: 'Cleanup failed.' });
    } finally {
      setCleaning(false);
    }
  };

  const handleManualPurgeOldRecords = async () => {
    if (!window.confirm('১ মাসের (৩০ দিনের) বেশি পুরনো সমস্ত অ্যাটেনডেন্স রেকর্ড মুছে ফেলতে চান? এটি মুছে নতুন মাস থেকে ফ্রেশ শুরু হবে।')) {
      return;
    }
    setPurgingOld(true);
    try {
      const res = await cleanupOldAttendanceRecords(30);
      if (res.deletedCount > 0) {
        setNotification({
          type: 'success',
          message: `১ মাসের পুরনো ${res.deletedCount} টি অ্যাটেনডেন্স রেকর্ড সফলভাবে মোছা হয়েছে!`
        });
      } else {
        setNotification({
          type: 'success',
          message: '১ মাসের বেশি পুরনো কোনো অ্যাটেনডেন্স রেকর্ড নেই। বর্তমান রেকর্ডগুলো ৩০ দিনের সীমার মধ্যে আছে।'
        });
      }
      setTimeout(() => setNotification(null), 4000);
      await fetchLogs();
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Purge failed: ' + (e.message || 'Error') });
    } finally {
      setPurgingOld(false);
    }
  };

  const currentMonthName = useMemo(() => {
    return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Filter logs by timeframe in client
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return logs.filter(log => {
      if (timeframeFilter === 'today') {
        if (log.date !== todayStr) return false;
      } else if (timeframeFilter === 'this_month') {
        if ((log.checkInTime || 0) < currentMonthStart) return false;
      }
      return true;
    });
  }, [logs, timeframeFilter, todayStr]);

  // Active in-session count
  const activeSessionsCount = useMemo(() => {
    return users.filter(u => u.currentSessionStatus === 'checked_in').length;
  }, [users]);

  return (
    <div className="w-full space-y-4 max-w-full">
      {/* Header Row - Standardized Compact Full Screen */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-amber-500 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
              Workforce Shift Desk
            </span>
            <span className="text-[11px] font-mono font-bold bg-slate-900 text-amber-400 px-2.5 py-0.5 rounded-md">
              ১ Month Rolling Cycle
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Attendance Log</h1>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-full border border-slate-200">
              {filteredLogs.length} Records
            </span>
            {activeSessionsCount > 0 && (
              <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                {activeSessionsCount} Active Now
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standard full-screen attendance tracker. ১ মাস (৩০ দিন) পূর্ণ হলে পুরনো অ্যাটেনডেন্স অটো ডিলিট হয়ে নতুন মাস থেকে শুরু হয়।
          </p>
        </div>
        
        {/* SuperAdmin Quick Action Buttons */}
        {isSuperAdmin && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleManualPurgeOldRecords}
              disabled={purgingOld}
              title="১ মাসের বেশি পুরনো অ্যাটেনডেন্স রেকর্ড এখনই মুছুন"
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2 px-3 rounded-xl border border-slate-200 transition cursor-pointer"
            >
              <RotateCcw size={13} className={purgingOld ? 'animate-spin text-amber-500' : 'text-slate-500'} />
              <span>{purgingOld ? 'ক্লিন হচ্ছে...' : '১ মাসের পুরনো মুছুন'}</span>
            </button>

            <button
              onClick={handleDuplicateCleanup}
              disabled={cleaning}
              title="অতিরিক্ত ডুপ্লিকেট ওপেন সেশন ক্লোজ করুন"
              className="inline-flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs py-2 px-3 rounded-xl border border-amber-200 transition cursor-pointer"
            >
              {cleaning ? (
                <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={13} className="text-amber-600" />
              )}
              <span>ডুপ্লিকেট ক্লিন</span>
            </button>
          </div>
        )}
      </div>

      {/* Monthly Cycle & Stats Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">চলতি মাস সাইকেল</span>
            <span className="text-sm font-black text-slate-900">{currentMonthName}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-mono text-xs">
            <Calendar size={16} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">মোট স্টাফ সদস্য</span>
            <span className="text-base font-black text-slate-900 font-mono">{users.length}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-mono text-xs">
            <Users size={16} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">বর্তমানে সক্রিয় শিফট</span>
            <span className="text-base font-black text-emerald-600 font-mono">{activeSessionsCount} In Shift</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-mono text-xs">
            <Clock size={16} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">অটো-রিসেট মেয়াদ</span>
            <span className="text-xs font-black text-slate-800">৩০ দিনের রোলিং রুটিন</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-mono text-xs">
            <RotateCcw size={16} />
          </div>
        </div>
      </div>

      {/* Notifications */}
      {notification && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={15} className="text-red-500 shrink-0" />
          )}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* SuperAdmin Staff Session Management Board (Standardized Compact Size) */}
      {isSuperAdmin && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-500" />
                Staff Session Status & Behalf Actions
              </span>
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.2 rounded-md">
                {users.length} Members
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Superadmin live check-in and check-out control.
            </p>
          </div>

          {/* Standard Compact Grid of Staff Members */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {users.map(u => {
              const isCheckedIn = u.currentSessionStatus === 'checked_in';
              return (
                <div 
                  key={u.id} 
                  className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/50 hover:bg-white transition shadow-2xs flex flex-col justify-between gap-2"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs font-mono shrink-0 ${
                        isCheckedIn ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-amber-400'
                      }`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-xs truncate" title={u.name}>{u.name}</h4>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider truncate font-mono">
                          {u.role} &bull; {u.subBrandAccess?.join(', ') || 'All'}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider shrink-0 flex items-center gap-1 border ${
                      isCheckedIn 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isCheckedIn ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
                      {isCheckedIn ? 'In' : 'Out'}
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-200/60">
                    {isCheckedIn ? (
                      <button
                        type="button"
                        onClick={() => handleOpenBehalfModal('checkout', u)}
                        className="w-full py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold uppercase tracking-wider transition border border-rose-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <LogOut size={11} /> Check Out On Behalf
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenBehalfModal('checkin', u)}
                        className="w-full py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold uppercase tracking-wider transition border border-emerald-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <LogIn size={11} /> Check In On Behalf
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Log Table (Standardized Compact Size) */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200/80 overflow-hidden w-full">
        {/* Filter Bar */}
        <div className="p-3 border-b border-slate-200/80 flex flex-col md:flex-row gap-2.5 items-center justify-between bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Timeframe selector */}
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setTimeframeFilter('all')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  timeframeFilter === 'all' 
                    ? 'bg-white text-slate-900 shadow-2xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All (30 Days)
              </button>
              <button
                onClick={() => setTimeframeFilter('today')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  timeframeFilter === 'today' 
                    ? 'bg-white text-slate-900 shadow-2xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeframeFilter('this_month')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  timeframeFilter === 'this_month' 
                    ? 'bg-white text-slate-900 shadow-2xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                This Month
              </button>
            </div>

            {/* Date Picker Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs">
              <Calendar size={13} className="text-slate-400" />
              <input 
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-xs focus:outline-hidden"
              />
              {dateFilter && (
                <button onClick={() => setDateFilter('')} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Staff Selector Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs">
              <User size={13} className="text-slate-400" />
              <select 
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-xs focus:outline-hidden"
              >
                <option value="">All Staff</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
              {userFilter && (
                <button onClick={() => setUserFilter('')} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button 
              onClick={fetchLogs}
              className="bg-slate-900 text-white font-bold text-xs px-3 py-1.5 rounded-xl hover:bg-slate-800 transition flex items-center gap-1 shadow-2xs cursor-pointer"
            >
              <Filter size={12} /> Apply Filter
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto w-full">
          {loading ? (
            <div className="p-12 text-center flex flex-col items-center justify-center space-y-2">
              <div className="w-7 h-7 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">LOADING ATTENDANCE...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
              <Clock size={32} className="text-slate-300 mb-1.5" />
              <span className="text-xs font-mono uppercase tracking-wider font-bold text-slate-600">No Attendance Records Found</span>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                No shift entries found matching the selected filters for this monthly cycle.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="bg-slate-50/80 text-[11px] uppercase text-slate-400 font-black tracking-wider border-b border-slate-200/80">
                <tr>
                  <th className="px-3.5 py-2.5">Staff Member</th>
                  <th className="px-3.5 py-2.5">Role & Brand</th>
                  <th className="px-3.5 py-2.5">Date</th>
                  <th className="px-3.5 py-2.5">Check In</th>
                  <th className="px-3.5 py-2.5">Check Out</th>
                  <th className="px-3.5 py-2.5 text-right">Duration</th>
                  {isSuperAdmin && <th className="px-3.5 py-2.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Staff Member */}
                    <td className="px-3.5 py-2.5 font-bold text-slate-900">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{log.userName}</span>
                        {log.isManualEntry && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.2 rounded border border-slate-200">
                            Manual
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Role & Brand */}
                    <td className="px-3.5 py-2.5 font-medium text-slate-500">
                      <span className="capitalize">{log.role}</span> &bull; <span className="font-mono font-bold text-slate-700">{log.subBrand || 'SAT'}</span>
                    </td>

                    {/* Date */}
                    <td className="px-3.5 py-2.5 font-mono text-slate-600">
                      {log.date}
                    </td>

                    {/* Check In */}
                    <td className="px-3.5 py-2.5 font-mono text-emerald-600 font-bold">
                      <div>
                        {new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {log.isManualEntry && log.checkedInBy && (
                          <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                            By {log.checkedInBy}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Check Out */}
                    <td className="px-3.5 py-2.5 font-mono text-slate-600 font-bold">
                      {log.checkOutTime ? (
                        <div>
                          {new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {log.isManualEntry && log.checkedOutBy && (
                            <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                              By {log.checkedOutBy}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-600 text-[10px] uppercase font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 animate-pulse">
                          Active
                        </span>
                      )}
                    </td>

                    {/* Duration */}
                    <td className="px-3.5 py-2.5 font-mono font-bold text-slate-800 text-right">
                      {log.durationMinutes ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                    </td>

                    {/* Action */}
                    {isSuperAdmin && (
                      <td className="px-3.5 py-2.5 text-center">
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deletingId === log.id}
                          className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="Delete Record"
                        >
                          {deletingId === log.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Behalf Confirmation Modal */}
      {behalfModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 space-y-3.5">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${behalfModal.type === 'checkin' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {behalfModal.type === 'checkin' ? <LogIn size={18} /> : <LogOut size={18} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {behalfModal.type === 'checkin' ? 'Check In On Behalf' : 'Check Out On Behalf'}
                    </h3>
                    <p className="text-[11px] text-slate-500">Superadmin Manual Shift Action</p>
                  </div>
                </div>
                <button 
                  onClick={() => setBehalfModal(null)}
                  className="p-1 text-slate-400 hover:bg-slate-50 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>

              {behalfModal.error && (
                <div className="p-2.5 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold rounded-xl flex items-start gap-1.5">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  <span>{behalfModal.error}</span>
                </div>
              )}

              <p className="text-xs text-slate-600">
                Are you sure you want to {behalfModal.type === 'checkin' ? 'start' : 'end'} the shift for <strong className="text-slate-900">{behalfModal.targetUser.name}</strong>?
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={behalfModal.useCustomTime}
                    onChange={(e) => setBehalfModal(prev => prev ? { ...prev, useCustomTime: e.target.checked } : null)}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  Specify custom date & time
                </label>

                {behalfModal.useCustomTime && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Shift Date & Time
                    </label>
                    <input 
                      type="datetime-local" 
                      value={behalfModal.customDateTime}
                      onChange={(e) => setBehalfModal(prev => prev ? { ...prev, customDateTime: e.target.value } : null)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-medium focus:outline-hidden focus:border-amber-400"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBehalfModal(null)}
                  disabled={behalfModal.submitting}
                  className="flex-1 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBehalfSubmit}
                  disabled={behalfModal.submitting}
                  className={`flex-1 py-1.5 font-bold text-xs uppercase tracking-wider rounded-xl transition text-white flex items-center justify-center gap-1.5 shadow-xs ${
                    behalfModal.type === 'checkin' 
                      ? 'bg-emerald-600 hover:bg-emerald-500' 
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {behalfModal.submitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    behalfModal.type === 'checkin' ? <LogIn size={13} /> : <LogOut size={13} />
                  )}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
