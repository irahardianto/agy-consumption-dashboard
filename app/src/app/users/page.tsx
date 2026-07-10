// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { getTopUsers, type UserUsage } from '@/lib/bigquery';
import Link from 'next/link';
import { DateFilter } from '@/components/DateFilter';
import { resolveDateRange } from '@/lib/dateUtils';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}) {
  const { preset, startDate, endDate } = await searchParams;
  const { start, end } = resolveDateRange(preset, startDate, endDate);

  const users = await getTopUsers(start, end);

  const columns: Column<UserUsage>[] = [
    { 
      header: 'User', 
      accessor: (user: UserUsage) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: '600' }}>{user.displayName}</span>
          <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>@{user.os_username}</span>
        </div>
      )
    },
    { header: 'Requests', accessor: 'requests', align: 'right' as const },
    { 
      header: 'Tokens', 
      accessor: (user: UserUsage) => `${(user.tokens / 1000000).toFixed(2)}M`,
      align: 'right' as const 
    },
    { 
      header: 'Cost', 
      accessor: (user: UserUsage) => `$${user.cost.toFixed(2)}`,
      align: 'right' as const 
    },
    {
      header: '',
      accessor: (user: UserUsage) => (
        <Link 
          href={`/users/${user.os_username}`}
          style={{ 
            color: 'var(--md-sys-color-primary)',
            fontSize: '12px',
            fontWeight: '600',
            textTransform: 'uppercase'
          }}
        >
          Details
        </Link>
      ),
      align: 'right' as const
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>User Breakdown</h2>
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
            Detailed usage and cost attribution per user.
          </p>
        </div>
        <DateFilter />
      </header>

      <div className="card" style={{ padding: '0' }}>
        <DataTable data={users} columns={columns} />
      </div>
    </div>
  );
}
