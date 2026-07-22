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
import { getSettings } from '@/lib/settings';
import { UsageChart } from '@/components/UsageChart';
import { UserBarChart } from '@/components/UserBarChart';
import { DateFilter } from '@/components/DateFilter';
import { DonutChart } from '@/components/DonutChart';
import { UsageHeatmap } from '@/components/UsageHeatmap';
import { resolveDateRange } from '@/lib/dateUtils';
import { sanitizeDateParams } from './dateSanitizer';
import { formatCost } from './currencyUtils';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; startDate?: string; endDate?: string }>;
}) {
  const rawParams = await searchParams;
  const settings = await getSettings();
  const defaultPreset = settings['defaultDateRange'] || '3days';
  const currency = settings['currencyDisplay'] || 'USD';

  const { preset: resolvedPreset, startDate: validatedStart, endDate: validatedEnd } = sanitizeDateParams(
    rawParams.preset,
    rawParams.startDate,
    rawParams.endDate,
    defaultPreset
  );

  const { start, end } = resolveDateRange(resolvedPreset, validatedStart, validatedEnd);

  // Helper local date string builder
  const toLocalDateString = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Parse current range for period-over-period trend calculations
  const currentStart = start ? new Date(`${start}T00:00:00`) : new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const currentEnd = end ? new Date(`${end}T00:00:00`) : new Date();
  const durationMs = currentEnd.getTime() - currentStart.getTime();

  // Formulation:
  // prev_end = current_start - 1 day
  // prev_start = prev_end - current_duration
  const prevEnd = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  const prevStartStr = toLocalDateString(prevStart);
  const prevEndStr = toLocalDateString(prevEnd);

  const [metrics, prevMetrics, usageData, topUsers] = await Promise.all([
    getOverviewMetrics(start, end),
    getOverviewMetrics(prevStartStr, prevEndStr),
    getUsageOverTime(start, end),
    getTopUsers(start, end),
  ]);

  // Calculate trend percentages
  const calculateTrend = (current: number, prev: number) => {
    if (prev === 0) return { value: current > 0 ? 100 : 0, isPositive: current >= 0 };
    const pct = Math.round(((current - prev) / prev) * 100);
    return { value: Math.abs(pct), isPositive: pct >= 0 };
  };

  const requestsTrend = calculateTrend(metrics.totalRequests, prevMetrics.totalRequests);
  const activeUsersTrend = calculateTrend(metrics.activeUsers, prevMetrics.activeUsers);
  const tokensTrend = calculateTrend(metrics.totalTokens, prevMetrics.totalTokens);
  const costTrend = calculateTrend(metrics.totalCost, prevMetrics.totalCost);

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
        <DateFilter defaultPreset={defaultPreset} />
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
          trend={requestsTrend}
          trendLabel="vs prev period"
        />
        <KpiCard
          label="Active Users"
          value={metrics.activeUsers.toString()}
          icon="group"
          trend={activeUsersTrend}
          trendLabel="vs prev period"
        />
        <KpiCard
          label="Tokens Consumed"
          value={(metrics.totalTokens / 1_000_000).toFixed(2)}
          unit="M"
          icon="token"
          trend={tokensTrend}
          trendLabel="vs prev period"
        />
        <KpiCard
          label="Inferred Cost"
          value={formatCost(metrics.totalCost, currency)}
          icon="payments"
          trend={costTrend}
          trendLabel="vs prev period"
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

      {/* Heatmap Card */}
      <ChartCard
        title="Usage Heatmap"
        subtitle="Daily token density across selected range"
      >
        <UsageHeatmap
          startDate={start || toLocalDateString(prevStart)}
          endDate={end || toLocalDateString(currentEnd)}
          data={usageData}
        />
      </ChartCard>

      {/* Model Breakdown */}
      {modelBreakdown.length > 0 && (
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
                data={modelBreakdown.map(([model, vals]) => ({
                  label: model.split('/').pop() ?? model,
                  value: vals.tokens,
                }))}
              />
            </div>

            {/* List Breakdown Column */}
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
          </div>
        </section>
      )}
    </div>
  );
}
