import React from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, subtitle, children }) => {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ 
          fontSize: 'var(--md-sys-typescale-title-large-size)',
          fontWeight: '500',
          marginBottom: '4px'
        }}>
          {title}
        </h3>
        {subtitle && (
          <p style={{ 
            color: 'var(--md-sys-color-on-surface-variant)',
            fontSize: '14px'
          }}>
            {subtitle}
          </p>
        )}
      </div>
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
};
