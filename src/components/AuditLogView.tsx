import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, RefreshCw, Calendar, User, Activity, FileText } from 'lucide-react';
import { AuditLog, UserProfile } from '../types';
import { getAuditLogs } from '../firebase/db';

interface AuditLogViewProps {
  user: UserProfile | null;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ user }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await getAuditLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.targetName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'ALL' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'CREATE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">CREATE</span>;
      case 'UPDATE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">UPDATE</span>;
      case 'DELETE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800">DELETE</span>;
      case 'PRICE_CHANGE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">PRICE CHANGE</span>;
      case 'STOCK_ADJUSTMENT':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800">STOCK</span>;
      case 'STATUS_CHANGE':
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">STATUS</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">{action}</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Audit Trail & Activity Logs</h1>
              <p className="text-sm text-slate-500">Track all administrative actions, product edits, deletions, and price changes across the system.</p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Logs
        </button>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by target name, user, or details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Action:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="PRICE_CHANGE">Price Change</option>
            <option value="STOCK_ADJUSTMENT">Stock Adjustment</option>
            <option value="STATUS_CHANGE">Status Change</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading audit logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto" />
            <p className="text-slate-600 font-medium">No audit logs found.</p>
            <p className="text-sm text-slate-400">Actions performed by admins and staff will be automatically recorded here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Timestamp</th>
                  <th className="py-3.5 px-6">User</th>
                  <th className="py-3.5 px-6">Action</th>
                  <th className="py-3.5 px-6">Target</th>
                  <th className="py-3.5 px-6">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-6 text-slate-500 whitespace-nowrap text-xs font-medium">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-900">{log.userName}</div>
                      <div className="text-xs text-slate-400 uppercase">{log.userRole}</div>
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      {getActionBadge(log.action)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-800">{log.targetName}</div>
                      <div className="text-xs text-slate-400">{log.targetType}</div>
                    </td>
                    <td className="py-4 px-6 text-slate-600 max-w-md truncate" title={log.details}>
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
