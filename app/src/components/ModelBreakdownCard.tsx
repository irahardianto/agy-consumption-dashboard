import React from 'react';
import { DonutChart } from '@/components/DonutChart';
import { ModelBreakdownEntry } from '@/lib/metricsUtils';

export interface ModelBreakdownCardProps {
  breakdown: ModelBreakdownEntry[];
}

export const ModelBreakdownCard: React.FC<ModelBreakdownCardProps> = ({ breakdown }) => {
  if (!breakdown || breakdown.length === 0) {
    return null;
  }

  return (
    <section className="card" style={{ padding: '28px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Model Breakdown</h3>
        <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Token distribution across Gemini models in the selected period
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '32px',
          alignItems: 'center',
        }}
      >
        {/* SVG Donut Chart Column */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <DonutChart
            data={breakdown.map((item) => ({
              label: item.shortModel,
              value: item.tokens,
            }))}
          />
        </div>

        {/* List Breakdown Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {breakdown.map((item) => {
            const pct = item.percentage;
            return (
              <div key={item.model}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                    gap: '12px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: 'var(--md-sys-color-on-surface)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={item.model}
                  >
                    {item.shortModel}
                  </span>
                  <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
                    <span style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {`${(item.tokens / 1_000_000).toFixed(2)}M tokens`}
                    </span>
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: 'var(--md-sys-color-primary)',
                        minWidth: '48px',
                        textAlign: 'right',
                      }}
                    >
                      {`${pct.toFixed(1)}%`}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: '6px',
                    borderRadius: '3px',
                    backgroundColor: 'var(--md-sys-color-surface-variant)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      borderRadius: '3px',
                      background:
                        'linear-gradient(90deg, var(--md-sys-color-primary), var(--md-sys-color-tertiary, var(--md-sys-color-primary)))',
                      transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
