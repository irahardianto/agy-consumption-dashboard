'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { UserUsage } from '@/lib/bigquery';

type SortKey = 'displayName' | 'requests' | 'tokens' | 'cost';
type SortDir = 'asc' | 'desc';

interface SortableUsersTableProps {
  data: UserUsage[];
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className="icon"
      aria-hidden="true"
      style={{
        fontSize: '16px',
        opacity: active ? 1 : 0.3,
        transition: 'opacity 0.15s ease, transform 0.15s ease',
        display: 'inline-block',
        transform: active && dir === 'asc' ? 'rotate(180deg)' : 'none',
      }}
    >
      arrow_downward
    </span>
  );
}

/**
 * Client-side sortable table for the User Breakdown page.
 * Columns: User, Requests, Tokens, Cost — all sortable.
 */
export function SortableUsersTable({ data }: SortableUsersTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('tokens');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'displayName':
          cmp = a.displayName.localeCompare(b.displayName);
          break;
        case 'requests':
          cmp = a.requests - b.requests;
          break;
        case 'tokens':
          cmp = a.tokens - b.tokens;
          break;
        case 'cost':
          cmp = a.cost - b.cost;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: '16px',
    fontSize: 'var(--md-sys-typescale-label-medium-size)',
    fontWeight: '600',
    color: sortKey === key ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s ease',
  });

  const tdStyle: React.CSSProperties = {
    padding: '16px',
    fontSize: '14px',
    color: 'var(--md-sys-color-on-surface)',
    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
  };

  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: 'var(--md-sys-shape-corner-medium)',
        border: '1px solid var(--md-sys-color-outline-variant)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr
            style={{
              backgroundColor: 'var(--md-sys-color-surface-container-high)',
              borderBottom: '1px solid var(--md-sys-color-outline-variant)',
            }}
          >
            <th
              style={{ ...thStyle('displayName'), textAlign: 'left' }}
              onClick={() => handleSort('displayName')}
              aria-sort={sortKey === 'displayName' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                User
                <SortIcon active={sortKey === 'displayName'} dir={sortDir} />
              </span>
            </th>
            <th
              style={{ ...thStyle('requests'), textAlign: 'right' }}
              onClick={() => handleSort('requests')}
              aria-sort={sortKey === 'requests' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                Requests
                <SortIcon active={sortKey === 'requests'} dir={sortDir} />
              </span>
            </th>
            <th
              style={{ ...thStyle('tokens'), textAlign: 'right' }}
              onClick={() => handleSort('tokens')}
              aria-sort={sortKey === 'tokens' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                Tokens
                <SortIcon active={sortKey === 'tokens'} dir={sortDir} />
              </span>
            </th>
            <th
              style={{ ...thStyle('cost'), textAlign: 'right' }}
              onClick={() => handleSort('cost')}
              aria-sort={sortKey === 'cost' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                Cost
                <SortIcon active={sortKey === 'cost'} dir={sortDir} />
              </span>
            </th>
            <th style={{ padding: '16px', width: '80px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  ...tdStyle,
                  textAlign: 'center',
                  padding: '48px 16px',
                  color: 'var(--md-sys-color-on-surface-variant)',
                }}
              >
                No users found for this period.
              </td>
            </tr>
          ) : (
            sorted.map((user, i) => (
              <tr
                key={user.os_username}
                style={{
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--md-sys-color-surface-container-lowest)',
                  transition: 'background-color 0.1s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--md-sys-color-surface-variant)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor =
                    i % 2 === 0 ? 'transparent' : 'var(--md-sys-color-surface-container-lowest)';
                }}
              >
                <td style={tdStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '600' }}>{user.displayName}</span>
                    <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      @{user.os_username}
                    </span>
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {user.requests.toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {(user.tokens / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  ${user.cost.toFixed(3)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <Link
                    href={`/users/${user.os_username}`}
                    style={{
                      color: 'var(--md-sys-color-primary)',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
