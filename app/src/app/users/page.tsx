// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { DataTable, type Column } from '@/components/DataTable';
import { getTopUsers, type UserUsage } from '@/lib/bigquery';
import Link from 'next/link';

export default async function UsersPage() {
  const users = await getTopUsers();
  const columns: Column<UserUsage>[] = [
    { 
      header: 'User', 
      accessor: (user: any) => (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: '600' }}>{user.displayName}</span>
          <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>@{user.os_username}</span>
        </div>
      )
    },
    { header: 'Requests', accessor: 'requests', align: 'right' as const },
    { 
      header: 'Tokens', 
      accessor: (user: any) => `${(user.tokens / 1000000).toFixed(2)}M`,
      align: 'right' as const 
    },
    { 
      header: 'Cost', 
      accessor: (user: any) => `$${user.cost.toFixed(2)}`,
      align: 'right' as const 
    },
    {
      header: '',
      accessor: (user: any) => (
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
      <header>
        <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>User Breakdown</h2>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Detailed usage and cost attribution per user.
        </p>
      </header>

      <div className="card" style={{ padding: '0' }}>
        <DataTable data={users} columns={columns} />
      </div>
    </div>
  );
}
