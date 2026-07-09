'use client';

import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export interface UsageChartProps {
  data: any[];
}

export const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--md-sys-color-outline-variant)" />
        <XAxis 
          dataKey="day" 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          dy={10}
        />
        <YAxis 
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: 'var(--md-sys-elevation-2)',
            color: 'var(--md-sys-color-on-surface)'
          }}
        />
        <Area 
          type="monotone" 
          dataKey="tokens" 
          stroke="var(--md-sys-color-primary)" 
          fillOpacity={1} 
          fill="url(#colorTokens)" 
          strokeWidth={3}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
