import { bq } from '@/lib/bigquery';
import logger from '@/lib/logger';

const DATASET = process.env.BQ_DATASET || 'agy_consumption';

export interface UserSession {
  trajectory_id: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  total_tokens: number;
  cost: number;
  models: string[];
  last_active: string;
}

export interface UserUsageWithDetails {
  os_username: string;
  displayName: string;
  email: string | null;
  team: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  tokens: number;
  cost: number;
  last_active: string | null;
  sparkline: number[];
}

/**
 * Fetch sessions (grouped by trajectory_id) for a specific user within a date range.
 */
export async function getUserSessions(
  username: string,
  startDate: string,
  endDate: string
): Promise<UserSession[]> {
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
    raw_logs AS (
      SELECT
        logging_time,
        model,
        full_request,
        full_response,
        JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') AS trajectory_id,
        COALESCE(
          JSON_EXTRACT_SCALAR(full_request, '$.system_instruction.parts[0].text'),
          JSON_EXTRACT_SCALAR(full_request, '$.contents[0].parts[0].text'),
          full_request
        ) AS first_part_text
      FROM \`${DATASET}.request_response_logs\`
      WHERE logging_time >= TIMESTAMP(@startDate)
        AND logging_time < TIMESTAMP_ADD(TIMESTAMP(@endDate), INTERVAL 1 DAY)
    ),
    active_trajectories AS (
      SELECT DISTINCT trajectory_id FROM raw_logs WHERE trajectory_id IS NOT NULL AND trajectory_id != ''
    ),
    user_sessions AS (
      SELECT DISTINCT
        trajectory_id,
        COALESCE(
          REGEXP_EXTRACT(first_part_text, r'/Users/([^/]+)/'),
          REGEXP_EXTRACT(first_part_text, r'/home/([^/]+)/'),
          REGEXP_EXTRACT(first_part_text, r'C:\\\\Users\\\\([^\\\\/]+)')
        ) AS os_username
      FROM (
        SELECT
          JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') AS trajectory_id,
          COALESCE(
            JSON_EXTRACT_SCALAR(full_request, '$.system_instruction.parts[0].text'),
            JSON_EXTRACT_SCALAR(full_request, '$.contents[0].parts[0].text'),
            full_request
          ) AS first_part_text
        FROM \`${DATASET}.request_response_logs\`
        WHERE logging_time >= TIMESTAMP_SUB(TIMESTAMP(@startDate), INTERVAL 14 DAY)
          AND logging_time < TIMESTAMP_ADD(TIMESTAMP(@endDate), INTERVAL 1 DAY)
      )
      WHERE trajectory_id IS NOT NULL AND trajectory_id != ''
        AND trajectory_id IN (SELECT trajectory_id FROM active_trajectories)
        AND (
          REGEXP_CONTAINS(first_part_text, r'/Users/([^/]+)/') OR
          REGEXP_CONTAINS(first_part_text, r'/home/([^/]+)/') OR
          REGEXP_CONTAINS(first_part_text, r'C:\\\\Users\\\\([^\\\\/]+)')
        )
    ),
    attributed AS (
      SELECT
        r.logging_time,
        r.model AS raw_model_name,
        COALESCE(REGEXP_EXTRACT(r.model, r'models/(.+)'), r.model) AS model_name,
        r.trajectory_id,
        COALESCE(
          REGEXP_EXTRACT(r.first_part_text, r'/Users/([^/]+)/'),
          REGEXP_EXTRACT(r.first_part_text, r'/home/([^/]+)/'),
          REGEXP_EXTRACT(r.first_part_text, r'C:\\\\Users\\\\([^\\\\/]+)')
        ) AS direct_username,
        su.os_username AS session_username,
        CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.promptTokenCount') AS INT64) AS input_tokens,
        CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.candidatesTokenCount') AS INT64) AS output_tokens,
        CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.thoughtsTokenCount') AS INT64) AS thinking_tokens,
        CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.totalTokenCount') AS INT64) AS total_tokens
      FROM raw_logs r
      LEFT JOIN user_sessions su ON r.trajectory_id = su.trajectory_id AND r.trajectory_id IS NOT NULL AND r.trajectory_id != ''
    ),
    attributed_with_cost AS (
      SELECT
        a.*,
        (COALESCE(a.input_tokens, 0) / 1000000) * COALESCE(
          p.input_cost_per_m,
          CASE 
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.5-flash-lite%' OR LOWER(a.raw_model_name) LIKE '%3.5-flash-lite%' THEN 0.30
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.1-flash-lite%' OR LOWER(a.raw_model_name) LIKE '%3.1-flash-lite%' THEN 0.25
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.6-flash%' OR LOWER(a.raw_model_name) LIKE '%3.6-flash%' THEN 1.50
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.5-flash%' OR LOWER(a.raw_model_name) LIKE '%3.5-flash%' THEN 1.50
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.1-pro-preview%' OR LOWER(a.raw_model_name) LIKE '%3.1-pro%' THEN 2.00
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3-flash-preview%' OR LOWER(a.raw_model_name) LIKE '%3-flash%' THEN 0.50
            WHEN LOWER(a.raw_model_name) LIKE '%flash-lite%' THEN 0.25
            WHEN LOWER(a.raw_model_name) LIKE '%flash%' THEN 1.50
            WHEN LOWER(a.raw_model_name) LIKE '%pro%' THEN 2.00
            WHEN LOWER(a.raw_model_name) LIKE '%ultra%' THEN 5.00
            ELSE 1.50 
          END
        ) + 
        ((COALESCE(a.output_tokens, 0) + COALESCE(a.thinking_tokens, 0)) / 1000000) * COALESCE(
          p.output_cost_per_m,
          CASE 
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.5-flash-lite%' OR LOWER(a.raw_model_name) LIKE '%3.5-flash-lite%' THEN 2.50
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.1-flash-lite%' OR LOWER(a.raw_model_name) LIKE '%3.1-flash-lite%' THEN 1.50
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.6-flash%' OR LOWER(a.raw_model_name) LIKE '%3.6-flash%' THEN 7.50
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.5-flash%' OR LOWER(a.raw_model_name) LIKE '%3.5-flash%' THEN 9.00
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.1-pro-preview%' OR LOWER(a.raw_model_name) LIKE '%3.1-pro%' THEN 12.00
            WHEN LOWER(a.raw_model_name) LIKE '%gemini-3-flash-preview%' OR LOWER(a.raw_model_name) LIKE '%3-flash%' THEN 3.00
            WHEN LOWER(a.raw_model_name) LIKE '%flash-lite%' THEN 1.50
            WHEN LOWER(a.raw_model_name) LIKE '%flash%' THEN 7.50
            WHEN LOWER(a.raw_model_name) LIKE '%pro%' THEN 12.00
            WHEN LOWER(a.raw_model_name) LIKE '%ultra%' THEN 20.00
            ELSE 7.50 
          END
        ) AS cost
      FROM attributed a
      LEFT JOIN pricing p ON a.model_name = p.model
    )
    SELECT
      trajectory_id,
      COUNT(*) as request_count,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(thinking_tokens), 0) as thinking_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COALESCE(SUM(cost), 0.0) as cost,
      ARRAY_AGG(DISTINCT model_name IGNORE NULLS) as models,
      MAX(logging_time) as last_active
    FROM attributed_with_cost
    WHERE COALESCE(direct_username, session_username, '__unattributed__') = @username
    GROUP BY trajectory_id
    ORDER BY last_active DESC
  `;

  const options = {
    query,
    params: {
      username,
      startDate,
      endDate,
    },
  };

  try {
    const rows = await bq.query<any>(options);
    return rows.map(r => {
      let lastActiveIso = '';
      if (r.last_active) {
        if (typeof r.last_active === 'object' && r.last_active !== null && 'value' in r.last_active) {
          lastActiveIso = new Date(r.last_active.value).toISOString();
        } else {
          lastActiveIso = new Date(r.last_active).toISOString();
        }
      }

      return {
        trajectory_id: String(r.trajectory_id || ''),
        request_count: Number(r.request_count || 0),
        input_tokens: Number(r.input_tokens || 0),
        output_tokens: Number(r.output_tokens || 0),
        thinking_tokens: Number(r.thinking_tokens || 0),
        total_tokens: Number(r.total_tokens || 0),
        cost: Number(r.cost || 0),
        models: Array.isArray(r.models) ? r.models.map(String) : [],
        last_active: lastActiveIso,
      };
    });
  } catch (error) {
    logger.error({ error, username, operation: 'get_user_sessions' }, 'Failed to fetch user sessions');
    return [];
  }
}

/**
 * Fetch detailed metrics for all users, including input, output, and thinking tokens, last active date, and sparkline trend.
 */
export async function getUsersWithDetails(
  startDate: string,
  endDate: string
): Promise<UserUsageWithDetails[]> {
  const userQuery = `
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
        COALESCE(SUM(u.thinking_tokens), 0) AS thinking_tokens,
        COALESCE(SUM(u.total_tokens), 0) AS tokens,
        MAX(u.day) AS last_active,
        COALESCE(SUM(
          (u.input_tokens / 1000000) * COALESCE(
            p.input_cost_per_m,
            CASE 
              WHEN LOWER(u.model) LIKE '%gemini-3.5-flash-lite%' OR LOWER(u.model) LIKE '%3.5-flash-lite%' THEN 0.30
              WHEN LOWER(u.model) LIKE '%gemini-3.1-flash-lite%' OR LOWER(u.model) LIKE '%3.1-flash-lite%' THEN 0.25
              WHEN LOWER(u.model) LIKE '%gemini-3.6-flash%' OR LOWER(u.model) LIKE '%3.6-flash%' THEN 1.50
              WHEN LOWER(u.model) LIKE '%gemini-3.5-flash%' OR LOWER(u.model) LIKE '%3.5-flash%' THEN 1.50
              WHEN LOWER(u.model) LIKE '%gemini-3.1-pro-preview%' OR LOWER(u.model) LIKE '%3.1-pro%' THEN 2.00
              WHEN LOWER(u.model) LIKE '%gemini-3-flash-preview%' OR LOWER(u.model) LIKE '%3-flash%' THEN 0.50
              WHEN LOWER(u.model) LIKE '%flash-lite%' THEN 0.25
              WHEN LOWER(u.model) LIKE '%flash%' THEN 1.50
              WHEN LOWER(u.model) LIKE '%pro%' THEN 2.00
              WHEN LOWER(u.model) LIKE '%ultra%' THEN 5.00
              ELSE 1.50 
            END
          ) + 
          ((u.output_tokens + COALESCE(u.thinking_tokens, 0)) / 1000000) * COALESCE(
            p.output_cost_per_m,
            CASE 
              WHEN LOWER(u.model) LIKE '%gemini-3.5-flash-lite%' OR LOWER(u.model) LIKE '%3.5-flash-lite%' THEN 2.50
              WHEN LOWER(u.model) LIKE '%gemini-3.1-flash-lite%' OR LOWER(u.model) LIKE '%3.1-flash-lite%' THEN 1.50
              WHEN LOWER(u.model) LIKE '%gemini-3.6-flash%' OR LOWER(u.model) LIKE '%3.6-flash%' THEN 7.50
              WHEN LOWER(u.model) LIKE '%gemini-3.5-flash%' OR LOWER(u.model) LIKE '%3.5-flash%' THEN 9.00
              WHEN LOWER(u.model) LIKE '%gemini-3.1-pro-preview%' OR LOWER(u.model) LIKE '%3.1-pro%' THEN 12.00
              WHEN LOWER(u.model) LIKE '%gemini-3-flash-preview%' OR LOWER(u.model) LIKE '%3-flash%' THEN 3.00
              WHEN LOWER(u.model) LIKE '%flash-lite%' THEN 1.50
              WHEN LOWER(u.model) LIKE '%flash%' THEN 7.50
              WHEN LOWER(u.model) LIKE '%pro%' THEN 12.00
              WHEN LOWER(u.model) LIKE '%ultra%' THEN 20.00
              ELSE 7.50 
            END
          )
        ), 0.0) AS cost
      FROM \`${DATASET}.usage_summary_daily\` u
      LEFT JOIN pricing p ON u.model = p.model
      WHERE u.day >= CAST(@startDate AS DATE) AND u.day <= CAST(@endDate AS DATE)
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
      c.thinking_tokens,
      c.tokens,
      c.cost,
      FORMAT_DATE('%Y-%m-%d', c.last_active) AS last_active
    FROM user_aggregated c
    LEFT JOIN \`${DATASET}.user_mappings\` m ON c.os_username = m.os_username
    ORDER BY c.tokens DESC
  `;

  const sparklineQuery = `
    SELECT os_username, FORMAT_DATE('%Y-%m-%d', day) AS day, SUM(total_tokens) AS tokens
    FROM \`${DATASET}.usage_summary_daily\`
    WHERE day >= CAST(@startDate AS DATE) AND day <= CAST(@endDate AS DATE)
    GROUP BY os_username, day
    ORDER BY os_username, day
  `;

  try {
    const [userRows, sparklineRows] = await Promise.all([
      bq.query<any>({ query: userQuery, params: { startDate, endDate } }),
      bq.query<any>({ query: sparklineQuery, params: { startDate, endDate } }),
    ]);

    // Group sparkline data by user
    const sparklineByUser: Record<string, Record<string, number>> = {};
    for (const r of sparklineRows) {
      if (!sparklineByUser[r.os_username]) {
        sparklineByUser[r.os_username] = {};
      }
      sparklineByUser[r.os_username]![String(r.day)] = Number(r.tokens || 0);
    }

    // Generate date array
    const dateList: string[] = [];
    const current = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (current <= end) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      const dd = String(current.getDate()).padStart(2, '0');
      dateList.push(`${yyyy}-${mm}-${dd}`);
      current.setDate(current.getDate() + 1);
    }

    // Combine user details with the formatted sparkline
    return userRows.map(r => {
      const userSparklineMap = sparklineByUser[r.os_username] || {};
      const sparkline = dateList.map(d => userSparklineMap[d] || 0);

      return {
        os_username: String(r.os_username),
        displayName: String(r.displayName || r.os_username),
        email: r.email ? String(r.email) : null,
        team: r.team ? String(r.team) : null,
        requests: Number(r.requests || 0),
        input_tokens: Number(r.input_tokens || 0),
        output_tokens: Number(r.output_tokens || 0),
        thinking_tokens: Number(r.thinking_tokens || 0),
        tokens: Number(r.tokens || 0),
        cost: Number(r.cost || 0),
        last_active: r.last_active ? String(r.last_active) : null,
        sparkline,
      };
    });
  } catch (error) {
    logger.error({ error, operation: 'get_users_with_details' }, 'Failed to fetch users with details');
    return [];
  }
}
