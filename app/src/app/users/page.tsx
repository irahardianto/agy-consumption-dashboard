// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { getTopUsers } from '@/lib/bigquery';
import { DateFilter } from '@/components/DateFilter';
import { resolveDateRange } from '@/lib/dateUtils';
import { SortableUsersTable } from '@/components/SortableUsersTable';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}) {
  const { preset, startDate, endDate } = await searchParams;
  const { start, end } = resolveDateRange(preset, startDate, endDate);

  const users = await getTopUsers(start, end);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>User Breakdown</h2>
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
            Detailed usage and cost attribution per user. Click column headers to sort.
          </p>
        </div>
        <DateFilter />
      </header>

      <div className="card" style={{ padding: '0' }}>
        <SortableUsersTable data={users} />
      </div>
    </div>
  );
}
