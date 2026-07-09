import React from 'react';

interface KpiCardProps {
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  icon?: string;
  unit?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({ label, value, trend, icon, unit }) => {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <span style={{ 
          color: 'var(--md-sys-color-on-surface-variant)', 
          fontSize: 'var(--md-sys-typescale-label-medium-size)',
          fontWeight: 'var(--md-sys-typescale-label-medium-weight)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          {label}
        </span>
        {icon && (
          <span className="icon" style={{ color: 'var(--md-sys-color-primary)' }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
        <h2 style={{ 
          fontSize: 'var(--md-sys-typescale-headline-medium-size)',
          fontWeight: '600',
          margin: 0
        }}>
          {value}
        </h2>
        {unit && (
          <span style={{ 
            color: 'var(--md-sys-color-on-surface-variant)',
            fontSize: '14px'
          }}>
            {unit}
          </span>
        )}
      </div>
      {trend && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '4px', 
          marginTop: '12px',
          color: trend.isPositive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-error)',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          <span className="icon" style={{ fontSize: '18px' }}>
            {trend.isPositive ? 'trending_up' : 'trending_down'}
          </span>
          <span>{trend.isPositive ? '+' : ''}{trend.value}%</span>
          <span style={{ color: 'var(--md-sys-color-on-surface-variant)', fontWeight: '400' }}>from last month</span>
        </div>
      )}
    </div>
  );
};
