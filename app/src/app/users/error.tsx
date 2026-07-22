'use client';

import React from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '16px' }}>
      <span className="icon" style={{ fontSize: '48px', color: 'var(--md-sys-color-error)' }}>error</span>
      <h2 style={{ fontSize: 'var(--md-sys-typescale-title-large-size)', color: 'var(--md-sys-color-on-surface)' }}>Something went wrong!</h2>
      <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', maxWidth: '400px' }}>
        {error.message || 'An unexpected error occurred while loading the users.'}
      </p>
      <button
        onClick={() => reset()}
        style={{
          marginTop: '16px',
          padding: '10px 24px',
          backgroundColor: 'var(--md-sys-color-primary)',
          color: 'var(--md-sys-color-on-primary)',
          border: 'none',
          borderRadius: '20px',
          cursor: 'pointer',
          fontWeight: '600'
        }}
      >
        Try again
      </button>
    </div>
  );
}
