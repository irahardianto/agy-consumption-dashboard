import React from 'react';

export default function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ width: '200px', height: '32px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
          <div style={{ width: '400px', height: '20px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
        </div>
        <div style={{ width: '250px', height: '40px', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '20px', animation: 'pulse 1.5s infinite' }} />
      </header>
      <div className="card" style={{ height: '600px', animation: 'pulse 1.5s infinite', backgroundColor: 'var(--md-sys-color-surface-container)' }} />
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
