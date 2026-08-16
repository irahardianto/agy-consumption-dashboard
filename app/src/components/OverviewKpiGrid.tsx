import React from 'react';
import { KpiCard } from '@/components/KpiCard';
import { TrendResult } from '@/lib/metricsUtils';
import { formatCost } from '@/app/currencyUtils';

export interface OverviewMetricsData {
  totalRequests: number;
  activeUsers: number;
  totalTokens: number;
  totalCost: number;
}

export interface OverviewTrendsData {
  requestsTrend?: TrendResult;
  activeUsersTrend?: TrendResult;
  tokensTrend?: TrendResult;
  costTrend?: TrendResult;
}

export interface OverviewKpiGridProps {
  metrics: OverviewMetricsData;
  trends?: OverviewTrendsData;
  currency?: string;
}

export const OverviewKpiGrid: React.FC<OverviewKpiGridProps> = ({
  metrics,
  trends,
  currency = 'USD',
}) => {
  return (
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
        trend={trends?.requestsTrend}
        trendLabel="vs prev period"
      />
      <KpiCard
        label="Active Users"
        value={metrics.activeUsers.toString()}
        icon="group"
        trend={trends?.activeUsersTrend}
        trendLabel="vs prev period"
      />
      <KpiCard
        label="Tokens Consumed"
        value={(metrics.totalTokens / 1_000_000).toFixed(2)}
        unit="M"
        icon="token"
        trend={trends?.tokensTrend}
        trendLabel="vs prev period"
      />
      <KpiCard
        label="Inferred Cost"
        value={formatCost(metrics.totalCost, currency)}
        icon="payments"
        trend={trends?.costTrend}
        trendLabel="vs prev period"
      />
    </div>
  );
};
