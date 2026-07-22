// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { ChartCard } from '@/components/ChartCard';
import { KpiCard } from '@/components/KpiCard';
import { getUserUsage, getUsageOverTime } from '@/lib/bigquery';
import { getUserSessions } from '@/app/db';
import { notFound } from 'next/navigation';
import { UsageChart } from '@/components/UsageChart';
import { DonutChart } from '@/components/DonutChart';
import { DateFilter } from '@/components/DateFilter';
import { resolveDateRange } from '@/lib/dateUtils';
import { sanitizeDateParams } from '@/app/dateSanitizer';
import { UserSessionBreakdown } from '@/components/UserSessionBreakdown';

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}) {
  const { username } = await params;
  const { preset, startDate, endDate } = await searchParams;
  const safeParams = sanitizeDateParams(preset, startDate, endDate);
  const { start, end } = resolveDateRange(safeParams.preset, safeParams.startDate, safeParams.endDate);

  // Format dates for BigQuery
  if (!start || !end) {
    throw new Error('Invalid date range');
  }
  const startStr = start;
  const endStr = end;

  const [user, usageData, sessions] = await Promise.all([
    getUserUsage(username, start, end),
    getUsageOverTime(start, end, username),
    getUserSessions(username, startStr, endStr),
  ]);

  if (!user) {
    notFound();
  }

  // Aggregate model usage from usageData
  const modelUsageMap = usageData.reduce((acc, curr) => {
    acc[curr.model] = (acc[curr.model] || 0) + curr.tokens;
    return acc;
  }, {} as Record<string, number>);

  const modelUsageData = Object.entries(modelUsageMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            fontWeight: '600',
            flexShrink: 0,
          }}>
            {user.displayName[0]}
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>{user.displayName}</h2>
            <p style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>@{user.os_username}</p>
          </div>
        </div>
        <DateFilter />
      </header>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '24px' 
      }}>
        <KpiCard label="Total Requests" value={user.requests} icon="bolt" />
        <KpiCard label="Total Tokens" value={`${(user.tokens / 1000000).toFixed(2)}M`} icon="token" />
        <KpiCard label="Total Cost" value={`$${user.cost.toFixed(2)}`} icon="payments" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '24px' }}>
        <ChartCard title="Usage Trend" subtitle="Daily token consumption for this user">
          <UsageChart data={usageData} />
        </ChartCard>

        <ChartCard title="Model Usage" subtitle="Token consumption by model">
          <DonutChart data={modelUsageData} />
        </ChartCard>
      </div>

      <ChartCard title="Session Breakdown" subtitle="Detailed breakdown of recent sessions">
        <UserSessionBreakdown sessions={sessions} />
      </ChartCard>
    </div>
  );
}
