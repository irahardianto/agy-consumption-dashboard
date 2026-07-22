'use client';

import { useEffect } from 'react';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '48px 24px',
      gap: '16px',
      backgroundColor: 'var(--md-sys-color-error-container)',
      color: 'var(--md-sys-color-on-error-container)',
      borderRadius: '16px',
      margin: '24px'
    }}>
      <span className="icon" style={{ fontSize: '48px' }}>error</span>
      <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-small-size)', fontWeight: '600', margin: 0 }}>
        Failed to load settings
      </h2>
      <p style={{ margin: 0, textAlign: 'center', maxWidth: '400px' }}>
        {error.message || 'An unexpected error occurred while loading settings.'}
      </p>
      <button 
        onClick={() => reset()}
        style={{
          marginTop: '16px',
          padding: '10px 24px',
          backgroundColor: 'var(--md-sys-color-error)',
          color: 'var(--md-sys-color-on-error)',
          border: 'none',
          borderRadius: '100px',
          cursor: 'pointer',
          fontWeight: '600'
        }}
      >
        Try again
      </button>
    </div>
  );
}
