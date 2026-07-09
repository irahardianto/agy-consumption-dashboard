// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { KpiCard } from '@/components/KpiCard';
import { ChartCard } from '@/components/ChartCard';
import { 
  getOverviewMetrics, 
  getUsageOverTime, 
  getTopUsers 
} from '@/lib/bigquery';
import { UsageChart } from '@/components/UsageChart';
import { UserBarChart } from '@/components/UserBarChart';

export default async function OverviewPage() {
  const [metrics, usageData, topUsers] = await Promise.all([
    getOverviewMetrics(),
    getUsageOverTime(),
    getTopUsers()
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>Overview</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Tracking AI consumption across your organization (last 30 days).
        </p>
      </header>

      {/* KPI Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px' 
      }}>
        <KpiCard 
          label="Total Requests" 
          value={metrics.totalRequests.toLocaleString()} 
          icon="bolt"
          trend={{ value: 12, isPositive: true }}
        />
        <KpiCard 
          label="Active Users" 
          value={metrics.activeUsers} 
          icon="group"
          trend={{ value: 5, isPositive: true }}
        />
        <KpiCard 
          label="Tokens Consumed" 
          value={(metrics.totalTokens / 1000000).toFixed(2)} 
          unit="M"
          icon="token"
          trend={{ value: 8, isPositive: true }}
        />
        <KpiCard 
          label="Inferred Cost" 
          value={`$${metrics.totalCost.toLocaleString()}`} 
          icon="payments"
          trend={{ value: 15, isPositive: false }}
        />
      </div>

      {/* Charts Row */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 500px), 1fr))', 
        gap: '24px' 
      }}>
        <ChartCard title="Token Consumption Over Time" subtitle="Daily input and output token volume">
          <UsageChart data={usageData} />
        </ChartCard>

        <ChartCard title="Top Users by Token Usage" subtitle="Most active users in the current period">
          <UserBarChart data={topUsers} />
        </ChartCard>
      </div>
    </div>
  );
}
