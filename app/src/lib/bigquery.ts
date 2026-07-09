import { BigQuery, type Query } from '@google-cloud/bigquery';
import logger from './logger';

/**
 * BigQuery client wrapper using the Singleton pattern.
 */
export class BigQueryService {
  private static instance: BigQueryService;
  private client: BigQuery;

  private constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'irahardianto-labs';
    this.client = new BigQuery({ projectId });
    logger.info({ projectId }, 'BigQuery client initialized');
  }

  public static getInstance(): BigQueryService {
    if (!BigQueryService.instance) {
      BigQueryService.instance = new BigQueryService();
    }
    return BigQueryService.instance;
  }

  /**
   * Execute a query and return results.
   * @param query The SQL query or Query object.
   * @param options Query options.
   */
  public async query<T>(query: string | Query): Promise<T[]> {
    const start = Date.now();
    const sql = typeof query === 'string' ? query : query.query;
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

    // Short-circuit during build: no credentials available in Docker build environment.
    // Pages are force-dynamic so this branch should never be hit in production.
    if (isBuild) {
      logger.info({ sql }, 'Build phase — skipping BigQuery query, returning empty array');
      return [] as T[];
    }

    logger.debug({ sql }, 'Executing BigQuery query');

    try {
      const options = typeof query === 'string' ? { query } : query;
      const [rows] = await (this.client.query(options) as any);
      
      logger.info({
        operation: 'bigquery_query',
        duration: Date.now() - start,
        rowCount: rows.length,
      }, 'BigQuery query successful');
      
      return rows as T[];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error({
        operation: 'bigquery_query',
        duration: Date.now() - start,
        error: errorMsg,
        sql,
      }, 'BigQuery query failed');

      // During build phase, return empty array instead of failing the build
      if (isBuild || errorMsg.includes('Not found: Table')) {
        return [] as T[];
      }
      
      throw error;
    }
  }

  /**
   * Get the underlying BigQuery client.
   */
  public getClient(): BigQuery {
    return this.client;
  }
}

// Export a singleton instance
export const bq = BigQueryService.getInstance();

// --- Add back UI-helper functions using the singleton ---

export interface OverviewMetrics {
  totalRequests: number;
  activeUsers: number;
  totalTokens: number;
  totalCost: number;
}

export interface UsageDataPoint {
  day: string;
  tokens: number;
  requests: number;
  model: string;
}

export interface UserUsage {
  os_username: string;
  displayName: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  cost: number;
}

const DATASET = process.env.BQ_DATASET || 'agy_consumption';

export async function getOverviewMetrics(): Promise<OverviewMetrics> {
  const query = `
    SELECT 
      SUM(request_count) as totalRequests,
      COUNT(DISTINCT os_username) as activeUsers,
      SUM(total_tokens) as totalTokens,
      SUM(
        CASE 
          WHEN model LIKE '%pro%' THEN (input_tokens / 1000000) * 1.25 + (output_tokens / 1000000) * 3.75
          WHEN model LIKE '%flash%' THEN (input_tokens / 1000000) * 0.075 + (output_tokens / 1000000) * 0.3
          ELSE 0
        END
      ) as totalCost
    FROM \`${DATASET}.usage_summary_daily\`
    WHERE day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
  `;

  try {
    const rows = await bq.query<any>(query);
    const row = rows[0] || {};
    
    return {
      totalRequests: Number(row.totalRequests || 0),
      activeUsers: Number(row.activeUsers || 0),
      totalTokens: Number(row.totalTokens || 0),
      totalCost: Number(row.totalCost || 0)
    };
  } catch (error) {
    logger.error({ error, operation: 'get_overview_metrics' }, 'Failed to fetch overview metrics');
    return { totalRequests: 0, activeUsers: 0, totalTokens: 0, totalCost: 0 };
  }
}

export async function getUsageOverTime(): Promise<UsageDataPoint[]> {
  const query = `
    SELECT 
      FORMAT_DATE('%Y-%m-%d', day) as day,
      SUM(total_tokens) as tokens,
      SUM(request_count) as requests,
      model
    FROM \`${DATASET}.usage_summary_daily\`
    WHERE day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    GROUP BY day, model
    ORDER BY day ASC
  `;

  try {
    const rows = await bq.query<any>(query);
    return rows.map(r => ({
      day: String(r.day),
      tokens: Number(r.tokens),
      requests: Number(r.requests),
      model: String(r.model)
    }));
  } catch (error) {
    logger.error({ error, operation: 'get_usage_over_time' }, 'Failed to fetch usage over time');
    return [];
  }
}

export async function getTopUsers(): Promise<UserUsage[]> {
  const query = `
    WITH user_costs AS (
      SELECT 
        U.os_username,
        SUM(U.request_count) as requests,
        SUM(U.input_tokens) as input_tokens,
        SUM(U.output_tokens) as output_tokens,
        SUM(U.total_tokens) as tokens,
        SUM(
          CASE 
            WHEN U.model LIKE '%pro%' THEN (U.input_tokens / 1000000) * 1.25 + (U.output_tokens / 1000000) * 3.75
            WHEN U.model LIKE '%flash%' THEN (U.input_tokens / 1000000) * 0.075 + (U.output_tokens / 1000000) * 0.3
            ELSE 0
          END
        ) as cost
      FROM \`${DATASET}.usage_summary_daily\` U
      WHERE U.day >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      GROUP BY U.os_username
    )
    SELECT 
      C.os_username,
      M.display_name as displayName,
      C.requests,
      C.input_tokens,
      C.output_tokens,
      C.tokens,
      C.cost
    FROM user_costs C
    LEFT JOIN \`${DATASET}.user_mappings\` M ON C.os_username = M.os_username
    ORDER BY C.tokens DESC
    LIMIT 10
  `;

  try {
    const rows = await bq.query<any>(query);
    return rows.map(r => ({
      os_username: String(r.os_username),
      displayName: String(r.displayName || r.os_username),
      requests: Number(r.requests),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      tokens: Number(r.tokens),
      cost: Number(r.cost || 0)
    }));
  } catch (error) {
    logger.error({ error, operation: 'get_top_users' }, 'Failed to fetch top users');
    return [];
  }
}
