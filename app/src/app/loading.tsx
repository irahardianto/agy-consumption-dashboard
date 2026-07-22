import React from 'react';

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ width: '200px', height: '36px', backgroundColor: 'var(--md-sys-color-surface-variant)', borderRadius: 'var(--md-sys-shape-corner-small)', animation: 'pulse 1.5s infinite' }} />
          <div style={{ width: '300px', height: '20px', backgroundColor: 'var(--md-sys-color-surface-variant)', borderRadius: 'var(--md-sys-shape-corner-small)', marginTop: '8px', animation: 'pulse 1.5s infinite' }} />
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card" style={{ height: '116px', animation: 'pulse 1.5s infinite' }}>
            <div style={{ width: '40%', height: '16px', backgroundColor: 'var(--md-sys-color-surface-variant)', borderRadius: 'var(--md-sys-shape-corner-small)', marginBottom: '16px' }} />
            <div style={{ width: '60%', height: '36px', backgroundColor: 'var(--md-sys-color-surface-variant)', borderRadius: 'var(--md-sys-shape-corner-small)' }} />
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
          gap: '24px',
        }}
      >
        {[1, 2].map((i) => (
          <div key={i} className="card" style={{ height: '400px', animation: 'pulse 1.5s infinite' }} />
        ))}
      </div>
    </div>
  );
}
