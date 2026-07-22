'use client';

import React, { useEffect } from 'react';

export default function Error({
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
      minHeight: '400px',
      padding: '32px',
      textAlign: 'center'
    }}>
      <div className="icon" style={{ fontSize: '48px', color: 'var(--md-sys-color-error)', marginBottom: '16px' }}>
        error_outline
      </div>
      <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', marginBottom: '8px' }}>
        Something went wrong!
      </h2>
      <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginBottom: '24px', maxWidth: '400px' }}>
        We encountered an error while loading the data. Please try again.
      </p>
      <button
        onClick={() => reset()}
        className="button-primary"
      >
        <span className="icon">refresh</span>
        Try again
      </button>
    </div>
  );
}
