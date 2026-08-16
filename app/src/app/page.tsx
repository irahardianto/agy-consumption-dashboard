// Force server-side rendering — BigQuery calls need service account creds at runtime
export const dynamic = 'force-dynamic';

import React from 'react';
import {
  getOverviewMetrics,
  getUsageOverTime,
  getTopUsers,
} from '@/lib/bigquery';
import { getSettings } from '@/lib/settings';
import { DateFilter } from '@/components/DateFilter';
import { resolveDateRange, toLocalDateString } from '@/lib/dateUtils';
import {
  calculateTrend,
  computeModelBreakdown,
  calculatePreviousPeriodDates,
} from '@/lib/metricsUtils';
import { OverviewKpiGrid } from '@/components/OverviewKpiGrid';
import { OverviewCharts } from '@/components/OverviewCharts';
import { ModelBreakdownCard } from '@/components/ModelBreakdownCard';
import { sanitizeDateParams } from './dateSanitizer';

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
  const { prevStartStr, prevEndStr } = calculatePreviousPeriodDates(start, end);

  const [metrics, prevMetrics, usageData, topUsers] = await Promise.all([
    getOverviewMetrics(start, end),
    getOverviewMetrics(prevStartStr, prevEndStr),
    getUsageOverTime(start, end),
    getTopUsers(start, end),
  ]);

  const trends = {
    requestsTrend: calculateTrend(metrics.totalRequests, prevMetrics.totalRequests),
    activeUsersTrend: calculateTrend(metrics.activeUsers, prevMetrics.activeUsers),
    tokensTrend: calculateTrend(metrics.totalTokens, prevMetrics.totalTokens),
    costTrend: calculateTrend(metrics.totalCost, prevMetrics.totalCost),
  };

  const modelBreakdown = computeModelBreakdown(usageData);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Page Header */}
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

      {/* KPI Grid */}
      <OverviewKpiGrid metrics={metrics} trends={trends} currency={currency} />

      {/* Charts & Heatmap */}
      <OverviewCharts
        usageData={usageData}
        topUsers={topUsers}
        startDate={start || prevStartStr}
        endDate={end || toLocalDateString(new Date())}
      />

      {/* Model Breakdown */}
      <ModelBreakdownCard breakdown={modelBreakdown} />
    </div>
  );
}
