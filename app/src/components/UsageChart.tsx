'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { UsageDataPoint } from '@/lib/bigquery';

export interface UsageChartProps {
  data: UsageDataPoint[];
}

/**
 * Aggregates multiple per-model rows for the same day into a single daily total.
 * The BigQuery query returns one row per (day, model) — recharts needs one row per day.
 */
function aggregateByDay(data: UsageDataPoint[]): { day: string; tokens: number; requests: number; cost: number }[] {
  const map = new Map<string, { tokens: number; requests: number; cost: number }>();

  for (const row of data) {
    const existing = map.get(row.day);
    if (existing) {
      existing.tokens += row.tokens;
      existing.requests += row.requests;
      existing.cost += row.cost;
    } else {
      map.set(row.day, { tokens: row.tokens, requests: row.requests, cost: row.cost });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, vals]) => ({ day, ...vals }));
}

/** Format YYYY-MM-DD to short readable label like "Jul 9". */
function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format token values cleanly (e.g. 60.30M, 120k). */
function formatTokenValue(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return value.toString();
}

export const UsageChart: React.FC<UsageChartProps> = ({ data }) => {
  const aggregated = aggregateByDay(data);

  if (aggregated.length === 0) {
    return (
      <div
        style={{
          height: 300,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--md-sys-color-on-surface-variant)',
          gap: '8px',
        }}
      >
        <span className="icon" style={{ fontSize: '40px', opacity: 0.4 }}>
          show_chart
        </span>
        <span style={{ fontSize: '14px', opacity: 0.6 }}>No data for this period</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={aggregated}>
        <defs>
          <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--md-sys-color-primary)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="var(--md-sys-color-primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="var(--md-sys-color-outline-variant)"
        />
        <XAxis
          dataKey="day"
          tickFormatter={formatDay}
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          dy={10}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: 'var(--md-sys-color-on-surface-variant)', fontSize: 12 }}
          tickFormatter={formatTokenValue}
        />
        <Tooltip
          labelFormatter={formatDay}
          formatter={(value: number, name: string) => {
            if (name === 'tokens') return [`${formatTokenValue(value)} (${value.toLocaleString()})`, 'Tokens'];
            if (name === 'requests') return [value.toLocaleString(), 'Requests'];
            return [value, name];
          }}
          contentStyle={{
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            border: 'none',
            borderRadius: '8px',
            boxShadow: 'var(--md-sys-elevation-2)',
            color: 'var(--md-sys-color-on-surface)',
          }}
        />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="var(--md-sys-color-primary)"
          fillOpacity={1}
          fill="url(#colorTokens)"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
