import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ShieldAlert } from 'lucide-react';
import { Card } from '../../design-system';
import { formatBDT } from '../../preOrders/constants';

const CHART_COLORS = ['#D4AF37', '#0EA5E9', '#10B981', '#8B5CF6', '#F97316', '#EC4899'];

export interface PreOrderOverviewChartsProps {
  scopedOrdersCount: number;
  statusChartData: { name: string; fullStatus: string; count: number }[];
  dailyTrendData: { date: string; orders: number; advance: number }[];
  paymentMethodData: { name: string; value: number }[];
  subBrandChartData: { name: string; orders: number; orderValue: number; advance: number }[];
  pipelineChartData: { stage: string; count: number }[];
  profitComparisonData: { month: string; revenue: number; expectedProfit: number; actualProfit: number }[];
  canViewProfit: boolean;
}

const PreOrderOverviewCharts: React.FC<PreOrderOverviewChartsProps> = ({
  scopedOrdersCount,
  statusChartData,
  dailyTrendData,
  paymentMethodData,
  subBrandChartData,
  pipelineChartData,
  profitComparisonData,
  canViewProfit,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Chart 1: Pre-Orders by Status */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            1. Pre-Orders by Status
          </h2>
          <span className="text-[11px] font-mono text-slate-400">{scopedOrdersCount} in view</span>
        </div>
        <div className="h-60 w-full">
          {statusChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No status data in current filter window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusChartData} margin={{ top: 8, right: 12, left: -12, bottom: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#f8fafc',
                  }}
                />
                <Bar dataKey="count" name="Orders" fill="#D4AF37" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Chart 2: Daily Pre-Orders & Advance Trend */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            2. Daily Pre-Orders &amp; Verified Advance (৳)
          </h2>
          <span className="text-[11px] font-mono text-slate-400">Last {dailyTrendData.length} active days</span>
        </div>
        <div className="h-60 w-full">
          {dailyTrendData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No daily trend data in selected window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrendData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#f8fafc',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="advance"
                  name="Advance (৳)"
                  stroke="#10B981"
                  fill="#10B981"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Chart 3: Payment Collection by Method */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            3. Verified Collection by Method
          </h2>
        </div>
        <div className="h-60 w-full">
          {paymentMethodData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No verified collections in window
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentMethodData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={84}
                  paddingAngle={3}
                >
                  {paymentMethodData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: any) => formatBDT(Number(v))}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    fontSize: 12,
                    color: '#f8fafc',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Chart 4: Sub-Brand Split */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            4. Sub-Brand Volume &amp; Value Split
          </h2>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={subBrandChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: any, name: any) =>
                  name === 'Orders' ? v : formatBDT(Number(v))
                }
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#f8fafc',
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="orderValue" name="Order Value (৳)" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              <Bar dataKey="advance" name="Verified Advance (৳)" fill="#D4AF37" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Chart 5: China Procurement & Shipment Pipeline */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            5. China to Bangladesh Pipeline Funnel
          </h2>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pipelineChartData} layout="vertical" margin={{ top: 4, right: 20, left: 16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis dataKey="stage" type="category" width={90} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#f8fafc',
                }}
              />
              <Bar dataKey="count" name="Orders" fill="#8B5CF6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Chart 6: Revenue vs Expected Profit vs Actual Profit (Strictly permission gated) */}
      {canViewProfit ? (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              6. Net Revenue vs Expected vs Actual Profit
            </h2>
            <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
              Admin Profit View
            </span>
          </div>
          <div className="h-60 w-full">
            {profitComparisonData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No monthly profit postings yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitComparisonData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: any) => formatBDT(Number(v))}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: 10,
                      fontSize: 12,
                      color: '#f8fafc',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Net Revenue" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expectedProfit" name="Expected Profit" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualProfit" name="Actual Recognized" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-4 flex flex-col justify-center items-center text-center bg-slate-50/70 dark:bg-slate-900/50">
          <ShieldAlert size={24} className="text-slate-400 mb-2" />
          <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Profit Margin Analytics Restricted
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
            Role permission <span className="font-mono">preOrderViewProfit</span> is required to view China costs and profit comparisons.
          </p>
        </Card>
      )}
    </div>
  );
};

export default PreOrderOverviewCharts;
