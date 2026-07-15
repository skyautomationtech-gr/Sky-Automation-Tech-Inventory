import React, { useState, useEffect } from 'react';
import { UserProfile, AttendanceRecord } from '../types';
import { getAllAttendanceRecords, getAllUsers, deleteAttendanceRecord, cleanupDuplicateSessions } from '../firebase/db';
import { Clock, Filter, Calendar, User, Trash2, ShieldAlert, Sparkles } from 'lucide-react';

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
                        {log.userName}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-500">
                        <span className="capitalize">{log.role}</span> &bull; {log.subBrand}
                      </td>
                      <td className="px-6 py-4 font-mono font-medium text-slate-600">
                        {log.date}
                      </td>
                      <td className="px-6 py-4 font-mono text-emerald-600 font-bold">
                        {new Date(log.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-slate-600">
                        {log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
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
                        <h4 className="font-bold text-slate-900">{log.userName}</h4>
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
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mb-1">Check Out</p>
                        <p className="text-xs font-mono font-bold text-slate-600">
                          {log.checkOutTime ? new Date(log.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                            <span className="text-amber-500 animate-pulse">Active</span>
                          )}
                        </p>
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
    </div>
  );
}
