// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { ChartCard } from '@/components/ChartCard';
import { KpiCard } from '@/components/KpiCard';
import { getTopUsers, getUsageOverTime } from '@/lib/bigquery';
import { notFound } from 'next/navigation';
import { UsageChart } from '@/components/UsageChart';

export default async function UserDetailPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const allUsers = await getTopUsers();
  const user = allUsers.find(u => u.os_username === username);

  if (!user) {
    notFound();
  }

  const usageData = await getUsageOverTime();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
          fontWeight: '600'
        }}>
          {user.displayName[0]}
        </div>
        <div>
          <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>{user.displayName}</h2>
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>@{user.os_username}</p>
        </div>
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

      <ChartCard title="Usage Trend" subtitle="Daily token consumption for this user">
        <UsageChart data={usageData} />
      </ChartCard>
    </div>
  );
}
