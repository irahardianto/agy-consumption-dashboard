// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import { KpiCard } from '@/components/KpiCard';
import { ChartCard } from '@/components/ChartCard';
import {
  getOverviewMetrics,
  getUsageOverTime,
  getTopUsers,
} from '@/lib/bigquery';
import { UsageChart } from '@/components/UsageChart';
import { UserBarChart } from '@/components/UserBarChart';
import { DateFilter } from '@/components/DateFilter';
import { resolveDateRange } from '@/lib/dateUtils';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}) {
  const { preset, startDate, endDate } = await searchParams;
  const { start, end } = resolveDateRange(preset, startDate, endDate);

  const [metrics, usageData, topUsers] = await Promise.all([
    getOverviewMetrics(start, end),
    getUsageOverTime(start, end),
    getTopUsers(start, end),
  ]);

  // Compute model breakdown from usageData
  const modelTotals = usageData.reduce<Record<string, { tokens: number; cost: number }>>(
    (acc, row) => {
      if (!acc[row.model]) acc[row.model] = { tokens: 0, cost: 0 };
      acc[row.model]!.tokens += row.tokens;
      acc[row.model]!.cost += row.cost;
      return acc;
    },
    {}
  );
  const modelBreakdown = Object.entries(modelTotals)
    .sort(([, a], [, b]) => b.tokens - a.tokens)
    .slice(0, 5);

  const totalTokens = modelBreakdown.reduce((s, [, v]) => s + v.tokens, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 'var(--md-sys-typescale-headline-medium-size)', fontWeight: '600' }}>
            Overview
          </h2>
          <p style={{ color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
            Tracking AI consumption across your organization.
          </p>
        </div>
        <DateFilter />
      </header>

      {/* KPI Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
        }}
      >
        <KpiCard
          label="Total Requests"
          value={metrics.totalRequests.toLocaleString()}
          icon="bolt"
        />
        <KpiCard
          label="Active Users"
          value={metrics.activeUsers.toString()}
          icon="group"
        />
        <KpiCard
          label="Tokens Consumed"
          value={(metrics.totalTokens / 1_000_000).toFixed(2)}
          unit="M"
          icon="token"
        />
        <KpiCard
          label="Inferred Cost"
          value={`$${metrics.totalCost.toFixed(3)}`}
          icon="payments"
        />
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
          gap: '24px',
        }}
      >
        <ChartCard
          title="Token Consumption Over Time"
          subtitle="Daily token volume across all models"
        >
          <UsageChart data={usageData} />
        </ChartCard>

        <ChartCard
          title="Top Users by Token Usage"
          subtitle="Most active users in the current period"
        >
          <UserBarChart data={topUsers} />
        </ChartCard>
      </div>

      {/* Model Breakdown */}
      {modelBreakdown.length > 0 && (
        <section className="card" style={{ padding: '28px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600' }}>Model Breakdown</h3>
            <p style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
              Token distribution across Gemini models in the selected period
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {modelBreakdown.map(([model, vals]) => {
              const pct = (vals.tokens / totalTokens) * 100;
              const shortModel = model.split('/').pop() ?? model;
              return (
                <div key={model}>
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
                      title={model}
                    >
                      {shortModel}
                    </span>
                    <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                        {(vals.tokens / 1_000_000).toFixed(2)}M tokens
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
                        {pct.toFixed(1)}%
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
        </section>
      )}
    </div>
  );
}
