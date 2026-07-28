'use client';

import React from 'react';

export interface SessionData {
  trajectory_id: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
  models: string[];
  last_active: string | Date;
}

interface UserSessionBreakdownProps {
  sessions: SessionData[];
}

const formatModelName = (model: string): string => {
  if (!model) return 'unknown';
  let name = model.replace(/^publishers\/[^\/]+\/models\//, '').replace(/^models\//, '');
  return name;
};

export const UserSessionBreakdown: React.FC<UserSessionBreakdownProps> = ({ sessions }) => {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>No session data found for this period.</p>
      </div>
    );
  }

  const tdStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '14px',
    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
    color: 'var(--md-sys-color-on-surface)',
  };

  const thStyle: React.CSSProperties = {
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--md-sys-color-on-surface-variant)',
    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
    textAlign: 'left',
  };

  return (
    <div className="card" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
            <th style={thStyle}>Session ID</th>
            <th style={thStyle}>Models Used</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Requests</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Total Tokens</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Last Active</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session, i) => {
            let formattedDate = 'N/A';
            if (session.last_active) {
              const d = typeof session.last_active === 'string' ? new Date(session.last_active) : session.last_active;
              if (!isNaN(d.getTime())) {
                formattedDate = d.toLocaleString();
              }
            }

            return (
              <tr
                key={session.trajectory_id || `session-${i}`}
                style={{
                  backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--md-sys-color-surface-container-lowest)',
                }}
              >
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  {session.trajectory_id || 'Unknown'}
                </td>
                <td style={tdStyle}>
                  {session.models.map(m => (
                    <span key={m} style={{ 
                      display: 'inline-block', 
                      padding: '2px 8px', 
                      margin: '2px', 
                      borderRadius: '12px', 
                      backgroundColor: 'var(--md-sys-color-secondary-container)', 
                      color: 'var(--md-sys-color-on-secondary-container)', 
                      fontSize: '12px' 
                    }}>
                      {formatModelName(m)}
                    </span>
                  ))}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {session.request_count}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {session.total_tokens.toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {formattedDate}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
