MERGE INTO `${project_id}.${dataset_id}.usage_summary_daily` AS T
USING (
  WITH affected_days AS (
    -- Identify distinct days affected by logs in the last 3 hours (handles late-arriving data & incremental runs)
    SELECT DISTINCT DATE(logging_time) AS day
    FROM `${project_id}.${dataset_id}.request_response_logs`
    WHERE logging_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR)
  ),
  raw_data AS (
    -- Re-aggregate all raw logs for those affected full days to ensure idempotent daily totals
    SELECT
      logging_time,
      model,
      full_request,
      full_response,
      metadata,
      JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') AS trajectory_id,
      COALESCE(
        JSON_EXTRACT_SCALAR(full_request, '$.system_instruction.parts[0].text'),
        JSON_EXTRACT_SCALAR(full_request, '$.contents[0].parts[0].text'),
        full_request
      ) AS first_part_text
    FROM `${project_id}.${dataset_id}.request_response_logs`
    WHERE DATE(logging_time) IN (SELECT day FROM affected_days)
  ),
  active_trajectories AS (
    SELECT DISTINCT trajectory_id
    FROM raw_data
    WHERE trajectory_id IS NOT NULL AND trajectory_id != ''
  ),
  user_sessions_raw AS (
    SELECT
      JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') AS trajectory_id,
      COALESCE(
        JSON_EXTRACT_SCALAR(full_request, '$.system_instruction.parts[0].text'),
        JSON_EXTRACT_SCALAR(full_request, '$.contents[0].parts[0].text'),
        full_request
      ) AS first_part_text
    FROM `${project_id}.${dataset_id}.request_response_logs`
    WHERE logging_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
      AND JSON_EXTRACT_SCALAR(full_request, '$.labels.trajectory_id') IN (SELECT trajectory_id FROM active_trajectories)
  ),
  user_sessions AS (
    -- Step 1: Extract user from calls that have <user_information> block in the prompt
    SELECT
      trajectory_id,
      MAX(COALESCE(
        REGEXP_EXTRACT(first_part_text, r'/Users/([^/]+)/'),
        REGEXP_EXTRACT(first_part_text, r'/home/([^/]+)/'),
        REGEXP_EXTRACT(first_part_text, r'C:\\Users\\([^\\/]+)')
      )) AS os_username
    FROM user_sessions_raw
    WHERE trajectory_id IS NOT NULL AND trajectory_id != ''
      AND (
        REGEXP_CONTAINS(first_part_text, r'/Users/([^/]+)/') OR
        REGEXP_CONTAINS(first_part_text, r'/home/([^/]+)/') OR
        REGEXP_CONTAINS(first_part_text, r'C:\\Users\\([^\\/]+)')
      )
    GROUP BY trajectory_id
  ),
  attributed AS (
    -- Step 2: Join all calls with user sessions and extract metrics
    SELECT
      DATE(r.logging_time) AS day,
      COALESCE(
        -- Direct username from this row if present
        COALESCE(
          REGEXP_EXTRACT(r.first_part_text, r'/Users/([^/]+)/'),
          REGEXP_EXTRACT(r.first_part_text, r'/home/([^/]+)/'),
          REGEXP_EXTRACT(r.first_part_text, r'C:\\Users\\([^\\/]+)')
        ),
        -- Or from parent session via trajectory_id
        su.os_username,
        '__unattributed__'
      ) AS os_username,
      COALESCE(REGEXP_EXTRACT(r.model, r'models/(.+)'), r.model) AS model_name,
      r.trajectory_id,
      CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.promptTokenCount') AS INT64) AS input_tokens,
      CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.candidatesTokenCount') AS INT64) AS output_tokens,
      CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.thoughtsTokenCount') AS INT64) AS thinking_tokens,
      CAST(JSON_EXTRACT_SCALAR(r.full_response, '$.usageMetadata.totalTokenCount') AS INT64) AS total_tokens,
      CAST(JSON_EXTRACT_SCALAR(r.metadata, '$.request_latency') AS FLOAT64) AS latency_ms
    FROM raw_data r
    LEFT JOIN user_sessions su ON r.trajectory_id = su.trajectory_id AND r.trajectory_id IS NOT NULL AND r.trajectory_id != ''
  ),
  aggregated_daily AS (
    -- Step 3: Aggregate full daily totals
    SELECT
      day,
      os_username,
      COALESCE(model_name, 'unknown') AS model,
      COUNT(*) AS request_count,
      COALESCE(SUM(input_tokens), 0) AS input_tokens,
      COALESCE(SUM(output_tokens), 0) AS output_tokens,
      COALESCE(SUM(thinking_tokens), 0) AS thinking_tokens,
      COALESCE(SUM(total_tokens), 0) AS total_tokens,
      COUNT(DISTINCT trajectory_id) AS sessions,
      AVG(latency_ms) AS avg_latency_ms
    FROM attributed
    GROUP BY 1, 2, 3
  )
  SELECT
    day,
    os_username,
    model,
    request_count,
    input_tokens,
    output_tokens,
    thinking_tokens,
    total_tokens,
    sessions,
    avg_latency_ms
  FROM aggregated_daily
) AS S
ON T.day = S.day AND T.os_username = S.os_username AND T.model = S.model
WHEN MATCHED THEN
  UPDATE SET
    T.request_count = S.request_count,
    T.input_tokens = S.input_tokens,
    T.output_tokens = S.output_tokens,
    T.thinking_tokens = S.thinking_tokens,
    T.total_tokens = S.total_tokens,
    T.sessions = S.sessions,
    T.avg_latency_ms = S.avg_latency_ms
WHEN NOT MATCHED THEN
  INSERT (day, os_username, model, request_count, input_tokens, output_tokens, thinking_tokens, total_tokens, sessions, avg_latency_ms)
  VALUES (S.day, S.os_username, S.model, S.request_count, S.input_tokens, S.output_tokens, S.thinking_tokens, S.total_tokens, S.sessions, S.avg_latency_ms)
