import { BigQuery, type Query } from '@google-cloud/bigquery';
import logger from './logger';
import { redistributeUnattributed } from './cost';

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
  cost: number;
  model: string;
}

export interface UserUsage {
  os_username: string;
  displayName: string;
  email: string | null;
  team: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  cost: number;
}

const DATASET = process.env.BQ_DATASET || 'agy_consumption';

/**
 * Format a Date object or string as YYYY-MM-DD.
 * Handles UTC midnight dates properly to prevent timezone shift issues.
 */
function formatDate(date?: Date | string): string | null {
  if (!date) return null;
  if (date instanceof Date) {
    if (
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0
    ) {
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return date;
}

export async function getOverviewMetrics(
  startDate?: Date | string,
  endDate?: Date | string
): Promise<OverviewMetrics> {
  const query = `
    WITH pricing AS (
      SELECT
        SPLIT(key, ':')[SAFE_OFFSET(1)] AS model,
        MAX(CASE WHEN ENDS_WITH(key, ':input') THEN CAST(value AS FLOAT64) END) AS input_cost_per_m,
        MAX(CASE WHEN ENDS_WITH(key, ':output') THEN CAST(value AS FLOAT64) END) AS output_cost_per_m
      FROM \`${DATASET}.dashboard_settings\`
      WHERE key LIKE 'pricing:%'
      GROUP BY 1
    )
    SELECT 
      COALESCE(SUM(u.request_count), 0) AS totalRequests,
      COUNT(DISTINCT CASE WHEN u.os_username != '__unattributed__' THEN u.os_username END) AS activeUsers,
      COALESCE(SUM(u.total_tokens), 0) AS totalTokens,
      COALESCE(SUM(
        (u.input_tokens / 1000000) * COALESCE(
          p.input_cost_per_m,
          CASE 
            WHEN u.model LIKE '%pro%' THEN 1.25 
            WHEN u.model LIKE '%flash%' THEN 0.075 
            ELSE 0.0 
          END
        ) + 
        (u.output_tokens / 1000000) * COALESCE(
          p.output_cost_per_m,
          CASE 
            WHEN u.model LIKE '%pro%' THEN 3.75 
            WHEN u.model LIKE '%flash%' THEN 0.30 
            ELSE 0.0 
          END
        )
      ), 0.0) AS totalCost
    FROM \`${DATASET}.usage_summary_daily\` u
    LEFT JOIN pricing p ON u.model = p.model
    WHERE u.day >= COALESCE(CAST(@startDate AS DATE), DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
      AND u.day <= COALESCE(CAST(@endDate AS DATE), CURRENT_DATE())
  `;

  const options = {
    query,
    params: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    },
  };

  try {
    const rows = await bq.query<any>(options);
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

export async function getUsageOverTime(
  startDate?: Date | string,
  endDate?: Date | string,
  username?: string
): Promise<UsageDataPoint[]> {
  const query = `
    WITH pricing AS (
      SELECT
        SPLIT(key, ':')[SAFE_OFFSET(1)] AS model,
        MAX(CASE WHEN ENDS_WITH(key, ':input') THEN CAST(value AS FLOAT64) END) AS input_cost_per_m,
        MAX(CASE WHEN ENDS_WITH(key, ':output') THEN CAST(value AS FLOAT64) END) AS output_cost_per_m
      FROM \`${DATASET}.dashboard_settings\`
      WHERE key LIKE 'pricing:%'
      GROUP BY 1
    )
    SELECT 
      FORMAT_DATE('%Y-%m-%d', u.day) AS day,
      u.model,
      COALESCE(SUM(u.total_tokens), 0) AS tokens,
      COALESCE(SUM(u.request_count), 0) AS requests,
      COALESCE(SUM(
        (u.input_tokens / 1000000) * COALESCE(
          p.input_cost_per_m,
          CASE 
            WHEN u.model LIKE '%pro%' THEN 1.25 
            WHEN u.model LIKE '%flash%' THEN 0.075 
            ELSE 0.0 
          END
        ) + 
        (u.output_tokens / 1000000) * COALESCE(
          p.output_cost_per_m,
          CASE 
            WHEN u.model LIKE '%pro%' THEN 3.75 
            WHEN u.model LIKE '%flash%' THEN 0.30 
            ELSE 0.0 
          END
        )
      ), 0.0) AS cost
    FROM \`${DATASET}.usage_summary_daily\` u
    LEFT JOIN pricing p ON u.model = p.model
    WHERE u.day >= COALESCE(CAST(@startDate AS DATE), DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
      AND u.day <= COALESCE(CAST(@endDate AS DATE), CURRENT_DATE())
      AND (@username IS NULL OR u.os_username = @username)
    GROUP BY u.day, u.model
    ORDER BY day ASC
  `;

  const options = {
    query,
    params: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      username: username || null,
    },
  };

  try {
    const rows = await bq.query<any>(options);
    return rows.map(r => ({
      day: String(r.day),
      tokens: Number(r.tokens),
      requests: Number(r.requests),
      cost: Number(r.cost),
      model: String(r.model)
    }));
  } catch (error) {
    logger.error({ error, operation: 'get_usage_over_time' }, 'Failed to fetch usage over time');
    return [];
  }
}

export async function getTopUsers(
  startDate?: Date | string,
  endDate?: Date | string,
  limit?: number
): Promise<UserUsage[]> {
  const query = `
    WITH pricing AS (
      SELECT
        SPLIT(key, ':')[SAFE_OFFSET(1)] AS model,
        MAX(CASE WHEN ENDS_WITH(key, ':input') THEN CAST(value AS FLOAT64) END) AS input_cost_per_m,
        MAX(CASE WHEN ENDS_WITH(key, ':output') THEN CAST(value AS FLOAT64) END) AS output_cost_per_m
      FROM \`${DATASET}.dashboard_settings\`
      WHERE key LIKE 'pricing:%'
      GROUP BY 1
    ),
    user_aggregated AS (
      SELECT 
        u.os_username,
        COALESCE(SUM(u.request_count), 0) AS requests,
        COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(u.total_tokens), 0) AS tokens,
        COALESCE(SUM(
          (u.input_tokens / 1000000) * COALESCE(
            p.input_cost_per_m,
            CASE 
              WHEN u.model LIKE '%pro%' THEN 1.25 
              WHEN u.model LIKE '%flash%' THEN 0.075 
              ELSE 0.0 
            END
          ) + 
          (u.output_tokens / 1000000) * COALESCE(
            p.output_cost_per_m,
            CASE 
              WHEN u.model LIKE '%pro%' THEN 3.75 
              WHEN u.model LIKE '%flash%' THEN 0.30 
              ELSE 0.0 
            END
          )
        ), 0.0) AS cost
      FROM \`${DATASET}.usage_summary_daily\` u
      LEFT JOIN pricing p ON u.model = p.model
      WHERE u.day >= COALESCE(CAST(@startDate AS DATE), DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
        AND u.day <= COALESCE(CAST(@endDate AS DATE), CURRENT_DATE())
      GROUP BY u.os_username
    )
    SELECT 
      c.os_username,
      COALESCE(m.display_name, c.os_username) AS displayName,
      m.email,
      m.team,
      c.requests,
      c.input_tokens,
      c.output_tokens,
      c.tokens,
      c.cost
    FROM user_aggregated c
    LEFT JOIN \`${DATASET}.user_mappings\` m ON c.os_username = m.os_username
    ORDER BY c.tokens DESC
    LIMIT @limit
  `;

  // We request all records to perform accurate unattributed redistribution
  const sqlLimit = 1000000;
  const options = {
    query,
    params: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      limit: sqlLimit,
    },
  };

  try {
    const rows = await bq.query<any>(options);
    const rawUsers = rows.map(r => ({
      os_username: String(r.os_username),
      displayName: String(r.displayName || r.os_username),
      email: r.email ? String(r.email) : null,
      team: r.team ? String(r.team) : null,
      requests: Number(r.requests),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      tokens: Number(r.tokens),
      cost: Number(r.cost || 0),
    }));

    const redistributed = redistributeUnattributed(rawUsers);

    if (limit !== undefined) {
      return redistributed.slice(0, limit);
    }
    return redistributed;
  } catch (error) {
    logger.error({ error, operation: 'get_top_users' }, 'Failed to fetch top users');
    return [];
  }
}

export async function getUserUsage(
  username: string,
  startDate?: Date | string,
  endDate?: Date | string
): Promise<UserUsage | null> {
  // Direct per-user query — avoids the redistribution and limit of getTopUsers
  // which could cause real users to appear as "not found"
  const query = `
    WITH pricing AS (
      SELECT
        SPLIT(key, ':')[SAFE_OFFSET(1)] AS model,
        MAX(CASE WHEN ENDS_WITH(key, ':input') THEN CAST(value AS FLOAT64) END) AS input_cost_per_m,
        MAX(CASE WHEN ENDS_WITH(key, ':output') THEN CAST(value AS FLOAT64) END) AS output_cost_per_m
      FROM \`${DATASET}.dashboard_settings\`
      WHERE key LIKE 'pricing:%'
      GROUP BY 1
    )
    SELECT
      u.os_username,
      COALESCE(m.display_name, u.os_username) AS displayName,
      m.email,
      m.team,
      COALESCE(SUM(u.request_count), 0) AS requests,
      COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(u.total_tokens), 0) AS tokens,
      COALESCE(SUM(
        (u.input_tokens / 1000000) * COALESCE(
          p.input_cost_per_m,
          CASE
            WHEN u.model LIKE '%pro%' THEN 1.25
            WHEN u.model LIKE '%flash%' THEN 0.075
            ELSE 0.0
          END
        ) +
        (u.output_tokens / 1000000) * COALESCE(
          p.output_cost_per_m,
          CASE
            WHEN u.model LIKE '%pro%' THEN 3.75
            WHEN u.model LIKE '%flash%' THEN 0.30
            ELSE 0.0
          END
        )
      ), 0.0) AS cost
    FROM \`${DATASET}.usage_summary_daily\` u
    LEFT JOIN pricing p ON u.model = p.model
    LEFT JOIN \`${DATASET}.user_mappings\` m ON u.os_username = m.os_username
    WHERE u.os_username = @username
      AND u.day >= COALESCE(CAST(@startDate AS DATE), DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
      AND u.day <= COALESCE(CAST(@endDate AS DATE), CURRENT_DATE())
    GROUP BY u.os_username, m.display_name, m.email, m.team
  `;

  const options = {
    query,
    params: {
      username,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    },
  };

  try {
    const rows = await bq.query<any>(options);
    if (rows.length === 0) return null;

    const r = rows[0];
    return {
      os_username: String(r.os_username),
      displayName: String(r.displayName || r.os_username),
      email: r.email ? String(r.email) : null,
      team: r.team ? String(r.team) : null,
      requests: Number(r.requests),
      input_tokens: Number(r.input_tokens),
      output_tokens: Number(r.output_tokens),
      tokens: Number(r.tokens),
      cost: Number(r.cost || 0),
    };
  } catch (error) {
    logger.error({ error, username, operation: 'get_user_usage' }, 'Failed to fetch user usage');
    return null;
  }
}

