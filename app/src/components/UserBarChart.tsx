'use client';

import React from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export interface UserBarChartProps {
  data: any[];
}

export const UserBarChart: React.FC<UserBarChartProps> = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--md-sys-color-outline-variant)" />
        <XAxis 
          type="number"
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
        />
        <YAxis 
          dataKey="displayName" 
          type="category"
          axisLine={false} 
          tickLine={false} 
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          width={120}
        />
        <Tooltip 
          cursor={{ fill: 'var(--md-sys-color-surface-variant)', opacity: 0.4 }}
          contentStyle={{ 
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: 'var(--md-sys-elevation-2)',
            color: 'var(--md-sys-color-on-surface)'
          }}
        />
        <Bar dataKey="tokens" fill="var(--md-sys-color-primary)" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={index === 0 ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-secondary)'} 
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
