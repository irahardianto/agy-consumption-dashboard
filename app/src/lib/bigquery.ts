import { BigQuery } from '@google-cloud/bigquery';
import crypto from 'crypto';
import logger from './logger';
import { redistributeUnattributed } from './cost';
import { getPricingCteSql, getCostSqlSnippet } from './pricingSql';

export interface QueryOptions {
  query: string;
  params?: Record<string, any>;
  types?: Record<string, any>;
  [key: string]: any;
}

export interface IBigQueryService {
  query<T = any>(query: string | QueryOptions): Promise<T[]>;
  getClient(): BigQuery;
}

declare global {
  var __bigQueryServiceInstance: BigQueryService | undefined;
}

/**
 * Generates an 8-character SHA-256 fingerprint for a SQL query string.
 */
export function getSqlFingerprint(sql: string): string {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 8);
}

/**
 * Sanitizes parameters for logging by redacting sensitive keys and formatting objects/arrays.
 */
export function sanitizeLogParams(params?: Record<string, any>): Record<string, any> | undefined {
  if (!params) return undefined;
  const sanitized: Record<string, any> = {};
  const sensitiveKeys = new Set(['email', 'token', 'jwt', 'secret', 'password', 'authorization']);

  for (const [key, value] of Object.entries(params)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      sanitized[key] = `Array(length=${value.length})`;
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = '[Object]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * BigQuery client wrapper using the Singleton pattern.
 */
export class BigQueryService implements IBigQueryService {
  private client: BigQuery | null = null;
  private projectId: string | null = null;

  public constructor(customClient?: BigQuery) {
    if (customClient) {
      this.client = customClient;
    }
  }

  private initClient(): BigQuery {
    if (!this.client) {
      const projectId = process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
      if (!projectId) {
        throw new Error(
          'Missing required environment variable: PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set.'
        );
      }
      this.projectId = projectId;
      this.client = new BigQuery({ projectId });
      logger.info({ projectId }, 'BigQuery client lazily initialized');
    }
    return this.client;
  }

  public static getInstance(): BigQueryService {
    if (!globalThis.__bigQueryServiceInstance) {
      globalThis.__bigQueryServiceInstance = new BigQueryService();
    }
    return globalThis.__bigQueryServiceInstance;
  }

  /**
   * For testing purposes: Allows injecting a mock service double.
   */
  public static setInstance(service?: BigQueryService): void {
    globalThis.__bigQueryServiceInstance = service;
  }

  /**
   * Get the underlying BigQuery client.
   */
  public getClient(): BigQuery {
    return this.initClient();
  }

  /**
   * Execute a query and return results with 3-point logging and parameter masking.
   */
  public async query<T = any>(queryInput: string | QueryOptions): Promise<T[]> {
    const start = Date.now();
    const sql = typeof queryInput === 'string' ? queryInput : queryInput.query;
    const params = typeof queryInput === 'object' ? queryInput.params : undefined;
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

    const sqlFingerprint = getSqlFingerprint(sql);
    const sanitizedParams = sanitizeLogParams(params);

    // Short-circuit during build: no credentials available in Docker build environment.
    if (isBuild) {
      logger.info(
        { operation: 'bigquery_query', sqlFingerprint },
        'Build phase: skipping BigQuery execution, returning empty result'
      );
      return [] as T[];
    }

    // Point 1: Entry log (Debug level, fingerprinted)
    logger.debug(
      {
        operation: 'bigquery_query',
        sqlFingerprint,
        params: sanitizedParams,
      },
      'Executing BigQuery query'
    );

    try {
      const client = this.initClient();
      const options = typeof queryInput === 'string' ? { query: queryInput } : queryInput;
      const [rows] = await (client.query(options as any) as any);

      const durationMs = Date.now() - start;

      // Point 2: Success log (Info level)
      logger.info(
        {
          operation: 'bigquery_query',
          sqlFingerprint,
          durationMs,
          rowCount: rows.length,
        },
        'BigQuery query executed successfully'
      );

      return rows as T[];
    } catch (error) {
      const durationMs = Date.now() - start;
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Point 3: Failure log (Error level, sanitized)
      logger.error(
        {
          operation: 'bigquery_query',
          sqlFingerprint,
          durationMs,
          error: errorMsg,
          params: sanitizedParams,
        },
        'BigQuery query execution failed'
      );

      // During build phase, return empty array instead of failing the build
      if (isBuild || errorMsg.includes('Not found: Table')) {
        return [] as T[];
      }

      throw error;
    }
  }
}

// Export singleton instance backed by globalThis
export const bq: IBigQueryService = {
  query: <T = any>(q: string | QueryOptions) => BigQueryService.getInstance().query<T>(q),
  getClient: () => BigQueryService.getInstance().getClient(),
};

// --- UI-helper functions using the singleton ---

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
    WITH ${getPricingCteSql({ dataset: DATASET })}
    SELECT 
      COALESCE(SUM(u.request_count), 0) AS totalRequests,
      COUNT(DISTINCT CASE WHEN u.os_username != '__unattributed__' THEN u.os_username END) AS activeUsers,
      COALESCE(SUM(u.total_tokens), 0) AS totalTokens,
      COALESCE(SUM(${getCostSqlSnippet({ usageAlias: 'u', pricingAlias: 'p' })}), 0.0) AS totalCost
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
  const userFilter = username ? 'AND u.os_username = @username' : '';

  const query = `
    WITH ${getPricingCteSql({ dataset: DATASET })}
    SELECT 
      FORMAT_DATE('%Y-%m-%d', u.day) AS day,
      u.model,
      COALESCE(SUM(u.total_tokens), 0) AS tokens,
      COALESCE(SUM(u.request_count), 0) AS requests,
      COALESCE(SUM(${getCostSqlSnippet({ usageAlias: 'u', pricingAlias: 'p' })}), 0.0) AS cost
    FROM \`${DATASET}.usage_summary_daily\` u
    LEFT JOIN pricing p ON u.model = p.model
    WHERE u.day >= COALESCE(CAST(@startDate AS DATE), DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY))
      AND u.day <= COALESCE(CAST(@endDate AS DATE), CURRENT_DATE())
      ${userFilter}
    GROUP BY u.day, u.model
    ORDER BY day ASC
  `;

  const params: Record<string, any> = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  };
  if (username) {
    params.username = username;
  }

  const options = {
    query,
    params,
  };

  try {
    const rows = await bq.query<any>(options);
    return rows.map(r => ({
      day: typeof r.day === 'object' && r.day !== null && 'value' in r.day ? String(r.day.value) : String(r.day || ''),
      tokens: Number(r.tokens || 0),
      requests: Number(r.requests || 0),
      cost: Number(r.cost || 0),
      model: String(r.model || ''),
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
    WITH ${getPricingCteSql({ dataset: DATASET })},
    user_aggregated AS (
      SELECT 
        u.os_username,
        COALESCE(SUM(u.request_count), 0) AS requests,
        COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
        COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
        COALESCE(SUM(u.total_tokens), 0) AS tokens,
        COALESCE(SUM(${getCostSqlSnippet({ usageAlias: 'u', pricingAlias: 'p' })}), 0.0) AS cost
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
  const allUsers = await getTopUsers(startDate, endDate);
  return allUsers.find(u => u.os_username === username) || null;
}
