'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { UserUsageWithDetails } from '@/app/db';
import { Sparkline } from '@/components/Sparkline';

type SortKey = 'displayName' | 'requests' | 'tokens' | 'input_tokens' | 'output_tokens' | 'thinking_tokens' | 'cost' | 'last_active';
type SortDir = 'asc' | 'desc';

interface SortableUsersTableProps {
  data: UserUsageWithDetails[];
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
        case 'input_tokens':
          cmp = a.input_tokens - b.input_tokens;
          break;
        case 'output_tokens':
          cmp = a.output_tokens - b.output_tokens;
          break;
        case 'thinking_tokens':
          cmp = a.thinking_tokens - b.thinking_tokens;
          break;
        case 'cost':
          cmp = a.cost - b.cost;
          break;
        case 'last_active':
          cmp = (a.last_active || '').localeCompare(b.last_active || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const thStyle = (key: SortKey): React.CSSProperties => ({
    padding: '12px 16px',
    fontSize: '13px',
    fontWeight: '600',
    color: sortKey === key ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    transition: 'color 0.15s ease',
    verticalAlign: 'bottom',
  });

  const tdStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '13px',
    color: 'var(--md-sys-color-on-surface)',
    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
    verticalAlign: 'middle',
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
            >
              User <SortIcon active={sortKey === 'displayName'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('requests'), textAlign: 'right' }}
              onClick={() => handleSort('requests')}
            >
              Reqs <SortIcon active={sortKey === 'requests'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('input_tokens'), textAlign: 'right' }}
              onClick={() => handleSort('input_tokens')}
            >
              In Tokens <SortIcon active={sortKey === 'input_tokens'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('output_tokens'), textAlign: 'right' }}
              onClick={() => handleSort('output_tokens')}
            >
              Out Tokens <SortIcon active={sortKey === 'output_tokens'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('thinking_tokens'), textAlign: 'right' }}
              onClick={() => handleSort('thinking_tokens')}
            >
              Think Tokens <SortIcon active={sortKey === 'thinking_tokens'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('tokens'), textAlign: 'right' }}
              onClick={() => handleSort('tokens')}
            >
              Total Tokens <SortIcon active={sortKey === 'tokens'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('cost'), textAlign: 'right' }}
              onClick={() => handleSort('cost')}
            >
              Cost <SortIcon active={sortKey === 'cost'} dir={sortDir} />
            </th>
            <th
              style={{ ...thStyle('last_active'), textAlign: 'right' }}
              onClick={() => handleSort('last_active')}
            >
              Last Active <SortIcon active={sortKey === 'last_active'} dir={sortDir} />
            </th>
            <th style={{ padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center' }}>
              Trend
            </th>
            <th style={{ padding: '12px 16px', width: '80px' }} />
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={10}
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
                  {(user.input_tokens / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {(user.output_tokens / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {(user.thinking_tokens / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {(user.tokens / 1_000_000).toFixed(2)}M
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  ${user.cost.toFixed(3)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {user.last_active || 'N/A'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <Sparkline data={user.sparkline || []} />
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
