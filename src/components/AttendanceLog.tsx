import React, { useState, useEffect } from 'react';
import { UserProfile, AttendanceRecord } from '../types';
import { 
  getAllAttendanceRecords, 
  getAllUsers, 
  deleteAttendanceRecord, 
  cleanupDuplicateSessions,
  checkInOnBehalf,
  checkOutOnBehalf
} from '../firebase/db';
import { Clock, Filter, Calendar, User, Trash2, ShieldAlert, Sparkles, LogIn, LogOut, CheckCircle, X } from 'lucide-react';

interface AttendanceLogProps {
  user: UserProfile | null;
}

export default function AttendanceLog({ user }: AttendanceLogProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [dateFilter, setDateFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [behalfModal, setBehalfModal] = useState<{
    type: 'checkin' | 'checkout';
    targetUser: UserProfile;
    useCustomTime: boolean;
    customDateTime: string;
    submitting: boolean;
    error: string;
  } | null>(null);

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
  }, []);

  const fetchUsers = async () => {
    const u = await getAllUsers();
    setUsers(u || []);
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const records = await getAllAttendanceRecords(dateFilter || undefined, userFilter || undefined);
      setLogs(records);
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
      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Failed to delete attendance record.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Run automated session cleanup? This will auto-close any orphaned duplicate open sessions.')) return;
    setCleaning(true);
    try {
      const count = await cleanupDuplicateSessions();
      alert(`Cleanup finished. Closed ${count} orphan sessions.`);
      await fetchLogs();
    } catch (error) {
      console.error(error);
      alert('Cleanup failed.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">
            WORKFORCE MANAGEMENT
          </span>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Attendance Log</h2>
        </div>
        {user?.role === 'superadmin' && (
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="bg-amber-100 text-amber-700 font-bold text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl hover:bg-amber-200 transition-all flex items-center gap-2 border border-amber-200 shadow-sm"
          >
            {cleaning ? (
              <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Run Duplicate Cleanup
          </button>
        )}
      </div>

      {/* Staff Session Board - Super Admin Only */}
      {user?.role === 'superadmin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <span className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest flex items-center gap-2">
              <Clock size={14} /> Session Management
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">Staff Session Status & Behalf Actions</h3>
            <p className="text-xs text-slate-500 mt-1">
              Real-time shift dashboard. Initiate or end work sessions for team members.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map(u => {
              const isCheckedIn = u.currentSessionStatus === 'checked_in';
              return (
                <div key={u.id} className="border border-slate-150 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between hover:border-slate-250 transition-all shadow-xs">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{u.name}</h4>
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5 capitalize">
                        {u.role} &bull; {u.subBrandAccess?.join(', ') || 'None'}
                      </p>
                    </div>
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                      isCheckedIn 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-150 animate-pulse' 
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {isCheckedIn ? 'Checked In' : 'Checked Out'}
                    </span>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
                    {isCheckedIn ? (
                      <button
                        type="button"
                        onClick={() => handleOpenBehalfModal('checkout', u)}
                        className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-rose-150 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <LogOut size={12} /> Check Out on Behalf
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenBehalfModal('checkin', u)}
                        className="w-full py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-emerald-150 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <LogIn size={12} /> Check In on Behalf
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4 items-end bg-slate-50/50">
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Calendar size={12} /> Date Filter
            </label>
            <input 
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <User size={12} /> Staff Member
            </label>
            <select 
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            >
              <option value="">All Staff</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-auto">
            <button 
              onClick={fetchLogs}
              className="w-full sm:w-auto bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <Filter size={14} /> Filter
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-400">
              <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm font-medium">
              No attendance records found matching filters.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <table className="w-full text-left hidden md:table">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-400 font-black tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3">Staff Member</th>
                    <th className="px-6 py-3">Role & Brand</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Check In</th>
                    <th className="px-6 py-3">Check Out</th>
                    <th className="px-6 py-3 text-right">Duration</th>
                    {user?.role === 'superadmin' && <th className="px-6 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-800">
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5">
                            {log.userName}
                            {log.isManualEntry && (
                              <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded-md border border-slate-200">
                                Manual Entry
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-500">
                        <span className="capitalize">{log.role}</span> &bull; {log.subBrand}
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-600">
                        {log.date}
                      </td>
                      <td className="px-6 py-4 font-mono text-emerald-600 font-bold">
                        <div>
                          {new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {log.isManualEntry && log.checkedInBy && (
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              Manually by {log.checkedInBy}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-600">
                        {log.checkOutTime ? (
                          <div>
                            {new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {log.isManualEntry && log.checkedOutBy && (
                              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                Manually by {log.checkedOutBy}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-500 text-[10px] uppercase tracking-wider bg-amber-50 px-2 py-0.5 rounded-sm animate-pulse">Active</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-800 text-right">
                        {log.durationMinutes ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                      </td>
                      {user?.role === 'superadmin' && (
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDelete(log.id)}
                            disabled={deletingId === log.id}
                            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                          >
                            {deletingId === log.id ? (
                              <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-slate-100">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          {log.userName}
                          {log.isManualEntry && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.5 rounded-md border border-slate-200">
                              Manual
                            </span>
                          )}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                          {log.role} &bull; {log.subBrand}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                          {log.date}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Check In</p>
                        <p className="text-xs font-mono font-bold text-emerald-600">
                          {new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {log.isManualEntry && log.checkedInBy && (
                          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">By {log.checkedInBy}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Check Out</p>
                        <p className="text-xs font-mono font-bold text-slate-600">
                          {log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                            <span className="text-amber-500 animate-pulse">Active</span>
                          )}
                        </p>
                        {log.isManualEntry && log.checkedOutBy && (
                          <p className="text-[9px] text-slate-400 mt-0.5 font-medium">By {log.checkedOutBy}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Clock size={14} className="text-slate-400" />
                        <span className="text-xs font-mono font-bold">
                          {log.durationMinutes ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : 'In Progress'}
                        </span>
                      </div>
                      
                      {user?.role === 'superadmin' && (
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deletingId === log.id}
                          className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-all active:scale-95"
                        >
                          {deletingId === log.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                          Delete Record
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Behalf Confirmation Modal */}
      {behalfModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${behalfModal.type === 'checkin' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    {behalfModal.type === 'checkin' ? <LogIn size={20} /> : <LogOut size={20} />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {behalfModal.type === 'checkin' ? 'Check In on Behalf' : 'Check Out on Behalf'}
                    </h3>
                    <p className="text-xs text-slate-500">Super Admin Manual Action</p>
                  </div>
                </div>
                <button 
                  onClick={() => setBehalfModal(null)}
                  className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-xl transition-all"
                >
                  <X size={16} />
                </button>
              </div>

              {behalfModal.error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs font-semibold rounded-xl flex items-start gap-2">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  <span>{behalfModal.error}</span>
                </div>
              )}

              <p className="text-xs text-slate-600 font-medium">
                Are you sure you want to {behalfModal.type === 'checkin' ? 'start' : 'end'} the work session for <strong className="text-slate-900">{behalfModal.targetUser.name}</strong>?
              </p>

              <div className="pt-2 space-y-3">
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
                      Session Date & Time
                    </label>
                    <input 
                      type="datetime-local" 
                      value={behalfModal.customDateTime}
                      onChange={(e) => setBehalfModal(prev => prev ? { ...prev, customDateTime: e.target.value } : null)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setBehalfModal(null)}
                  disabled={behalfModal.submitting}
                  className="flex-1 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleBehalfSubmit}
                  disabled={behalfModal.submitting}
                  className={`flex-1 py-2 font-bold text-xs uppercase tracking-wider rounded-xl transition-all text-white flex items-center justify-center gap-1.5 ${
                    behalfModal.type === 'checkin' 
                      ? 'bg-emerald-600 hover:bg-emerald-500' 
                      : 'bg-rose-600 hover:bg-rose-500'
                  }`}
                >
                  {behalfModal.submitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    behalfModal.type === 'checkin' ? <LogIn size={14} /> : <LogOut size={14} />
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
