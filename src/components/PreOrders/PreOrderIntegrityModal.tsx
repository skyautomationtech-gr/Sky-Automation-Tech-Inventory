import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { PreOrderIntegrityReport } from '../../types';
import { runPreOrderIntegrityCheck } from '../../firebase/preOrderDb';
import { Badge, Button, Modal, Skeleton } from '../../design-system';

export interface PreOrderIntegrityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreOrder?: (preOrderId: string) => void;
}

export const PreOrderIntegrityModal: React.FC<PreOrderIntegrityModalProps> = ({
  isOpen,
  onClose,
  onSelectPreOrder,
}) => {
  const [report, setReport] = useState<PreOrderIntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<
    'all' | 'error' | 'warning'
  >('all');

  const runCheck = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await runPreOrderIntegrityCheck();
      setReport(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to run integrity check.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runCheck();
    }
  }, [isOpen]);

  const filteredIssues = (report?.issues || []).filter(
    (issue) => filterSeverity === 'all' || issue.severity === filterSeverity
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pre-Order Financial & Stock Integrity Check"
      subtitle="Read-only cross-audit of payment ledgers, supplier allocations, stock reservations, invoices, and accounting postings"
      size="xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {(['all', 'error', 'warning'] as const).map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setFilterSeverity(sev)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer capitalize ${
                  filterSeverity === sev
                    ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#93741E] dark:text-[#E2C255]'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="xs"
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={runCheck}
          >
            Re-run Audit
          </Button>
        </div>

        {loading && !report ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : report ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <div className="text-[11px] text-slate-400">Pre-Orders Audited</div>
                <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                  {report.checkedCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
                <div className="text-[11px] text-slate-400">Total Findings</div>
                <div className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                  {report.issueCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/20">
                <div className="text-[11px] text-rose-600 dark:text-rose-300">Errors</div>
                <div className="text-lg font-mono font-bold text-rose-700 dark:text-rose-400">
                  {report.errorCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/20">
                <div className="text-[11px] text-amber-700 dark:text-amber-300">Warnings</div>
                <div className="text-lg font-mono font-bold text-amber-700 dark:text-amber-400">
                  {report.warningCount}
                </div>
              </div>
            </div>

            {filteredIssues.length === 0 ? (
              <div className="p-8 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Zero discrepancies detected
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  All audited pre-order payment ledgers, stock reservations, sales conversions, and accounting postings reconcile cleanly.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
                {filteredIssues.map((issue, idx) => (
                  <div
                    key={`${issue.preOrderId}_${issue.code}_${idx}`}
                    className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-slate-900"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={issue.severity === 'error' ? 'danger' : 'warning'}
                          size="xs"
                        >
                          {issue.severity}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => {
                            if (onSelectPreOrder && issue.preOrderId) {
                              onClose();
                              onSelectPreOrder(issue.preOrderId);
                            }
                          }}
                          className="font-mono font-bold text-[#93741E] dark:text-[#E2C255] hover:underline cursor-pointer"
                        >
                          {issue.preOrderNumber}
                        </button>
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {issue.code}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200">
                        {issue.message}
                      </p>
                      {(issue.expected !== undefined || issue.actual !== undefined) && (
                        <div className="text-[11px] font-mono text-slate-400">
                          Expected: {String(issue.expected ?? '—')} • Actual:{' '}
                          {String(issue.actual ?? '—')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
            Read-only diagnostic; modifies zero records.
          </span>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default PreOrderIntegrityModal;
