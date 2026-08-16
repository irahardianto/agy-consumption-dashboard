import React from 'react';
import { ChartCard } from '@/components/ChartCard';
import { UsageChart } from '@/components/UsageChart';
import { UserBarChart } from '@/components/UserBarChart';
import { UsageHeatmap } from '@/components/UsageHeatmap';
import type { UsageDataPoint, UserUsage } from '@/lib/bigquery';

export interface OverviewChartsProps {
  usageData: UsageDataPoint[];
  topUsers: UserUsage[];
  startDate: string;
  endDate: string;
}

export const OverviewCharts: React.FC<OverviewChartsProps> = ({
  usageData,
  topUsers,
  startDate,
  endDate,
}) => {
  return (
    <>
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
          startDate={startDate}
          endDate={endDate}
          data={usageData}
        />
      </ChartCard>
    </>
  );
};
