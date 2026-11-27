import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface WeeklySalesTrendPoint {
  day: string;
  amount: number;
  count: number;
}

interface CategoryStockPoint {
  name: string;
  value: number;
}

const COLORS = ['#D4AF37', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#008080'];

export const DashboardSalesTrendChart: React.FC<{ data: WeeklySalesTrendPoint[] }> = React.memo(({ data }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
      <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
      <YAxis
        stroke="#94a3b8"
        fontSize={12}
        tickLine={false}
        axisLine={false}
        tickFormatter={(v) => `৳${v >= 1000 ? `${v / 1000}k` : v}`}
      />
      <Tooltip
        contentStyle={{
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderRadius: '0.75rem',
          color: '#f8fafc',
          fontSize: '12px',
        }}
        formatter={(value: any) => [`৳ ${Number(value).toLocaleString()}`, 'Revenue']}
      />
      <Bar dataKey="amount" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={48} />
    </BarChart>
  </ResponsiveContainer>
));

export const DashboardCategoryStockChart: React.FC<{ data: CategoryStockPoint[] }> = React.memo(({ data }) => (
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={50}
        outerRadius={80}
        paddingAngle={4}
        dataKey="value"
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={{
          backgroundColor: '#0f172a',
          borderColor: '#334155',
          borderRadius: '0.75rem',
          color: '#f8fafc',
          fontSize: '12px',
        }}
      />
    </PieChart>
  </ResponsiveContainer>
));
