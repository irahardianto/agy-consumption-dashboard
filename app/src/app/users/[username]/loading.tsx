import React from 'react';

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            animation: 'pulse 1.5s infinite',
            flexShrink: 0,
          }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ width: '150px', height: '32px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
            <div style={{ width: '100px', height: '20px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
          </div>
        </div>
        <div style={{ width: '250px', height: '40px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '20px', animation: 'pulse 1.5s infinite' }} />
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
        {[1, 2, 3].map(i => (
          <div key={i} className="card" style={{ height: '100px', animation: 'pulse 1.5s infinite', backgroundColor: 'var(--md-sys-color-surface-container)' }} />
        ))}
      </div>

      <div className="card" style={{ height: '400px', animation: 'pulse 1.5s infinite', backgroundColor: 'var(--md-sys-color-surface-container)' }} />
      <div className="card" style={{ height: '400px', animation: 'pulse 1.5s infinite', backgroundColor: 'var(--md-sys-color-surface-container)' }} />

      <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 0.8; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
