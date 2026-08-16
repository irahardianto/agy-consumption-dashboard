# Database and Data Layer Contracts: Audit Findings Remediation

**Status:** APPROVED DESIGN CONTRACT  
**Author:** Database Expert  
**Scope:** BigQuery Data Access Layer, Atomic Mutation Contracts, Singleton Lifecycle, Observability Redaction, SQL Pricing Dialect  

---

## 1. Atomic `replaceUserMappings` Specification (`app/src/lib/settings.ts`) — [MAJ-002]

### 1.1 Problem & Root Cause
In `app/src/lib/settings.ts`, `replaceUserMappings` currently executes two separate, disconnected BigQuery DML calls:
1. `DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`
2. `INSERT INTO \`${DATASET}.${MAPPINGS_TABLE}\` ... SELECT ... FROM UNNEST(@mappings)`

Because BigQuery DML does not span multiple independent API calls with transaction semantics by default, any failure during step 2 (network disconnect, quota exhaustion, schema validation error, malformed row) leaves the table completely empty, resulting in total data loss for all user identity mappings.

---

### 1.2 Data Pre-Validation & Deduplication Contract

Before executing any BigQuery mutation, the input batch must be validated and sanitized in TypeScript:

```typescript
import { z } from 'zod';

export const UserMappingItemSchema = z.object({
  os_username: z
    .string()
    .trim()
    .min(1, 'os_username is required')
    .max(128, 'os_username exceeds max length of 128'),
  display_name: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform(v => (v === '' ? null : v ?? null)),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform(v => (v === '' || !v ? null : v)),
  team: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform(v => (v === '' ? null : v ?? null)),
});

export type UserMappingItem = z.infer<typeof UserMappingItemSchema>;
```

#### Deduplication Requirement
BigQuery standard SQL `MERGE` statements throw runtime error `UPDATE/MERGE must match at most one source row for each target row` if the source subquery contains duplicate `os_username` values.

Therefore, `replaceUserMappings` MUST enforce deduplication on `os_username` before dispatching to BigQuery:
- If duplicate keys exist, keep the latest entry in the array (or fail validation).
- Nullable fields (`display_name`, `email`, `team`) must be normalized to JavaScript `null` rather than `undefined` so that `@google-cloud/bigquery` correctly serializes them as SQL `NULL` within BigQuery STRUCT arrays.

```typescript
export function sanitizeAndDeduplicateMappings(rawMappings: UserMappingItem[]): UserMappingItem[] {
  const map = new Map<string, UserMappingItem>();
  for (const raw of rawMappings) {
    const validated = UserMappingItemSchema.parse(raw);
    map.set(validated.os_username, {
      os_username: validated.os_username,
      display_name: validated.display_name ?? null,
      email: validated.email ?? null,
      team: validated.team ?? null,
    });
  }
  return Array.from(map.values());
}
```

---

### 1.3 Atomic BigQuery DML / MERGE Specification

#### Primary Approach: Single-Statement Atomic `MERGE` with `NOT MATCHED BY SOURCE`
BigQuery supports `WHEN NOT MATCHED BY SOURCE THEN DELETE` in standard SQL `MERGE`. This guarantees full ACID atomicity in a single query execution:
- Existing matching rows are updated.
- New rows are inserted.
- Rows in the database absent from the source batch are deleted.
- If the query fails for any reason, no modifications take effect (zero data loss window).

```sql
MERGE INTO `${DATASET}.${MAPPINGS_TABLE}` AS T
USING (
  SELECT
    os_username,
    display_name,
    email,
    team
  FROM UNNEST(@mappings)
) AS S
ON T.os_username = S.os_username
WHEN MATCHED THEN
  UPDATE SET
    T.display_name = S.display_name,
    T.email = S.email,
    T.team = S.team
WHEN NOT MATCHED THEN
  INSERT (os_username, display_name, email, team)
  VALUES (S.os_username, S.display_name, S.email, S.team)
WHEN NOT MATCHED BY SOURCE THEN
  DELETE;
```

#### Special Case: Empty Input Array (`mappings.length === 0`)
When `mappings` is an empty array:
- Passing an empty array to `UNNEST(@mappings)` in BigQuery requires typed parameter declarations or explicit typing.
- When the user explicitly requests to clear all mappings (`mappings = []`), execute a single atomic `DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`.

---

### 1.4 TypeScript Implementation Contract for `replaceUserMappings`

```typescript
/**
 * Atomically replaces all user mappings in BigQuery with the provided batch.
 * Uses a single atomic MERGE statement to eliminate data loss race conditions.
 *
 * @param mappings - Raw or sanitized list of user mappings.
 * @throws ZodError on invalid schema.
 * @throws Error if BigQuery execution fails (leaving table untouched).
 */
export async function replaceUserMappings(mappings: UserMappingItem[]): Promise<void> {
  const sanitized = sanitizeAndDeduplicateMappings(mappings);

  if (sanitized.length === 0) {
    // If clearing all records, single DELETE statement is atomic
    await bq.query({
      query: `DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`,
    });
    logger.info({ count: 0, operation: 'replace_user_mappings' }, 'User mappings cleared successfully');
    return;
  }

  const query = `
    MERGE INTO \`${DATASET}.${MAPPINGS_TABLE}\` AS T
    USING (
      SELECT
        os_username,
        display_name,
        email,
        team
      FROM UNNEST(@mappings)
    ) AS S
    ON T.os_username = S.os_username
    WHEN MATCHED THEN
      UPDATE SET
        T.display_name = S.display_name,
        T.email = S.email,
        T.team = S.team
    WHEN NOT MATCHED THEN
      INSERT (os_username, display_name, email, team)
      VALUES (S.os_username, S.display_name, S.email, S.team)
    WHEN NOT MATCHED BY SOURCE THEN
      DELETE
  `;

  // BigQuery type options to ensure STRUCT array is accurately typed
  const options = {
    query,
    params: {
      mappings: sanitized,
    },
    types: {
      mappings: [
        {
          os_username: 'STRING',
          display_name: 'STRING',
          email: 'STRING',
          team: 'STRING',
        },
      ],
    },
  };

  try {
    await bq.query(options);
    logger.info(
      { count: sanitized.length, operation: 'replace_user_mappings' },
      'User mappings atomically replaced successfully'
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), count: sanitized.length, operation: 'replace_user_mappings' },
      'Failed to atomically replace user mappings'
    );
    throw error;
  }
}
```

---

## 2. BigQueryService Lifecycle & Singleton Pattern (`app/src/lib/bigquery.ts`) — [MAJ-003]

### 2.1 Problem & Root Cause
1. Direct top-level evaluation `export const bq = BigQueryService.getInstance()` runs at module import time.
2. In Next.js App Router (development HMR), static class properties are cleared on file reload, creating new instances, accumulating client connections, and leaking event emitters.
3. If `PROJECT_ID` is missing in unit test runs that only import types or utility helpers, module evaluation throws immediately.

---

### 2.2 Interface & Service Contract

To adhere to `@.agents/rules/architectural-pattern.md` (Rule 1: I/O Isolation & Rule 3: Dependency Direction), BigQuery client access is abstracted behind an interface contract.

```typescript
import { BigQuery, type Query } from '@google-cloud/bigquery';

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
```

---

### 2.3 `globalThis` Singleton Implementation

To survive Next.js Fast Refresh / HMR across development server reloads without leaking instances, the singleton is attached to `globalThis`.

```typescript
// app/src/lib/bigquery.ts

declare global {
  // eslint-disable-next-line no-var
  var __bigQueryServiceInstance: BigQueryService | undefined;
}

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
    if (process.env.NODE_ENV === 'production') {
      if (!global.__bigQueryServiceInstance) {
        global.__bigQueryServiceInstance = new BigQueryService();
      }
      return global.__bigQueryServiceInstance;
    }

    // In development & test, preserve instance across HMR reloads
    if (!global.__bigQueryServiceInstance) {
      global.__bigQueryServiceInstance = new BigQueryService();
    }
    return global.__bigQueryServiceInstance;
  }

  /**
   * For testing purposes: Allows injecting a mock service double.
   */
  public static setInstance(service?: BigQueryService): void {
    global.__bigQueryServiceInstance = service;
  }

  public getClient(): BigQuery {
    return this.initClient();
  }

  public async query<T = any>(query: string | QueryOptions): Promise<T[]> {
    // Execution with logging & fingerprinting (detailed in Section 3)
    ...
  }
}

// Export singleton instance backed by globalThis
export const bq = {
  query: <T = any>(q: string | QueryOptions) => BigQueryService.getInstance().query<T>(q),
  getClient: () => BigQueryService.getInstance().getClient(),
};
```

---

## 3. BigQuery Error Logging & SQL Redaction / Fingerprinting — [MIN-007]

### 3.1 Security & Observability Risk
- Currently, `lib/bigquery.ts` logs raw SQL queries directly in `logger.debug({ sql })` and `logger.error({ sql })`.
- If a query includes literal values or sensitive user strings, raw SQL logging leaks sensitive data / PII into telemetry streams (Cloud Logging, Datadog, stdout).

### 3.2 SQL Parameterization & Sanitization Rules
1. **Zero String Interpolation:** All user-supplied input MUST use `@param` query parameters.
2. **Whitespace Normalization:** Query text is trimmed and consecutive whitespaces/line breaks collapsed.
3. **Query Fingerprinting:** Generate a deterministic SHA-256 fingerprint (short 8-character hash) or normalized signature for tracing query shapes without dumping unredacted text.
4. **Parameter Masking:** Parameters containing potential sensitive fields (`email`, `password`, `token`, `secret`, `jwt`) must be masked as `[REDACTED]`.

---

### 3.3 Helper Utilities Specification

```typescript
import crypto from 'crypto';

/**
 * Generates an 8-character SHA-256 fingerprint for a SQL query string.
 */
export function getSqlFingerprint(sql: string): string {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 8);
}

/**
 * Sanitizes parameters for logging by redacting sensitive keys and truncating long arrays.
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
```

---

### 3.4 3-Point BigQuery Query Logging Contract

```typescript
public async query<T = any>(queryInput: string | QueryOptions): Promise<T[]> {
  const start = Date.now();
  const sql = typeof queryInput === 'string' ? queryInput : queryInput.query;
  const params = typeof queryInput === 'object' ? queryInput.params : undefined;
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';

  const sqlFingerprint = getSqlFingerprint(sql);
  const sanitizedParams = sanitizeLogParams(params);

  // Short-circuit for Docker production builds
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

    if (isBuild || errorMsg.includes('Not found: Table')) {
      return [] as T[];
    }

    throw error;
  }
}
```

---

## 4. SQL Pricing CASE-WHEN Snippet Specification (`app/src/lib/pricingSql.ts`) — [MAJ-001]

### 4.1 BigQuery SQL Dialect Specifications

1. **Case-Insensitive Matching:** Uses `LOWER(model) LIKE '%...'` for wildcard pattern matching.
2. **Evaluation Hierarchy:** Specific models (`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.1-pro-preview`, `gemini-3-flash-preview`) MUST appear BEFORE wildcard families (`flash-lite`, `flash`, `pro`, `ultra`).
3. **Settings Table CTE Resolution:**
   - Keys follow `pricing:${model}:input` and `pricing:${model}:output`.
   - Extracted using `SPLIT(key, ':')[SAFE_OFFSET(1)] AS model`.
   - Costs parsed with `CAST(value AS FLOAT64)`.
4. **Token Multipliers & Calculations:**
   - Input cost: `(input_tokens / 1000000) * COALESCE(p.input_cost_per_m, CASE ... END)`
   - Output cost: `((output_tokens + COALESCE(thinking_tokens, 0)) / 1000000) * COALESCE(p.output_cost_per_m, CASE ... END)`

---

### 4.2 Module Contracts & Implementation (`app/src/lib/pricingSql.ts`)

```typescript
import { PRICING_DEFAULTS } from './cost';

export interface PricingSqlOptions {
  /**
   * Table alias for the usage table (e.g., 'u' or 'a'). Defaults to 'u'.
   */
  usageAlias?: string;
  /**
   * Table alias for the pricing CTE (e.g., 'p'). Defaults to 'p'.
   */
  pricingAlias?: string;
  /**
   * Column name for model in the usage table (e.g., 'model' or 'raw_model_name'). Defaults to 'model'.
   */
  modelColumn?: string;
  /**
   * Column name for input tokens. Defaults to 'input_tokens'.
   */
  inputTokensColumn?: string;
  /**
   * Column name for output tokens. Defaults to 'output_tokens'.
   */
  outputTokensColumn?: string;
  /**
   * Column name for thinking tokens. Defaults to 'thinking_tokens'.
   */
  thinkingTokensColumn?: string;
}

export interface PricingCteOptions {
  /**
   * Dataset name or expression (e.g. 'agy_consumption').
   */
  dataset: string;
  /**
   * CTE identifier. Defaults to 'pricing'.
   */
  cteName?: string;
  /**
   * Settings table name. Defaults to 'dashboard_settings'.
   */
  settingsTable?: string;
}

/**
 * Generates the common table expression (CTE) SQL definition for custom model pricing.
 */
export function getPricingCteSql(options: PricingCteOptions): string {
  const { dataset, cteName = 'pricing', settingsTable = 'dashboard_settings' } = options;
  return `
    ${cteName} AS (
      SELECT
        SPLIT(key, ':')[SAFE_OFFSET(1)] AS model,
        MAX(CASE WHEN ENDS_WITH(key, ':input') THEN CAST(value AS FLOAT64) END) AS input_cost_per_m,
        MAX(CASE WHEN ENDS_WITH(key, ':output') THEN CAST(value AS FLOAT64) END) AS output_cost_per_m
      FROM \`${dataset}.${settingsTable}\`
      WHERE key LIKE 'pricing:%'
      GROUP BY 1
    )
  `.trim();
}

/**
 * Generates the SQL CASE statement for fallback model input token pricing.
 */
export function getInputCostCaseSql(usageAlias: string = 'u', modelColumn: string = 'model'): string {
  const modelRef = `${usageAlias}.${modelColumn}`;
  return `
    CASE 
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.5-flash-lite%' OR LOWER(${modelRef}) LIKE '%3.5-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash-lite'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.1-flash-lite%' OR LOWER(${modelRef}) LIKE '%3.1-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.1-flash-lite'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.6-flash%' OR LOWER(${modelRef}) LIKE '%3.6-flash%' THEN ${PRICING_DEFAULTS['gemini-3.6-flash'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.5-flash%' OR LOWER(${modelRef}) LIKE '%3.5-flash%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.1-pro-preview%' OR LOWER(${modelRef}) LIKE '%3.1-pro%' THEN ${PRICING_DEFAULTS['gemini-3.1-pro-preview'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3-flash-preview%' OR LOWER(${modelRef}) LIKE '%3-flash%' THEN ${PRICING_DEFAULTS['gemini-3-flash-preview'].input.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%flash-lite%' THEN 0.25
      WHEN LOWER(${modelRef}) LIKE '%flash%' THEN 1.50
      WHEN LOWER(${modelRef}) LIKE '%pro%' THEN 2.00
      WHEN LOWER(${modelRef}) LIKE '%ultra%' THEN 5.00
      ELSE 1.50 
    END
  `.trim();
}

/**
 * Generates the SQL CASE statement for fallback model output token pricing.
 */
export function getOutputCostCaseSql(usageAlias: string = 'u', modelColumn: string = 'model'): string {
  const modelRef = `${usageAlias}.${modelColumn}`;
  return `
    CASE 
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.5-flash-lite%' OR LOWER(${modelRef}) LIKE '%3.5-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash-lite'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.1-flash-lite%' OR LOWER(${modelRef}) LIKE '%3.1-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.1-flash-lite'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.6-flash%' OR LOWER(${modelRef}) LIKE '%3.6-flash%' THEN ${PRICING_DEFAULTS['gemini-3.6-flash'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.5-flash%' OR LOWER(${modelRef}) LIKE '%3.5-flash%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3.1-pro-preview%' OR LOWER(${modelRef}) LIKE '%3.1-pro%' THEN ${PRICING_DEFAULTS['gemini-3.1-pro-preview'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%gemini-3-flash-preview%' OR LOWER(${modelRef}) LIKE '%3-flash%' THEN ${PRICING_DEFAULTS['gemini-3-flash-preview'].output.toFixed(2)}
      WHEN LOWER(${modelRef}) LIKE '%flash-lite%' THEN 1.50
      WHEN LOWER(${modelRef}) LIKE '%flash%' THEN 7.50
      WHEN LOWER(${modelRef}) LIKE '%pro%' THEN 12.00
      WHEN LOWER(${modelRef}) LIKE '%ultra%' THEN 20.00
      ELSE 7.50 
    END
  `.trim();
}

/**
 * Generates the complete BigQuery SQL calculation snippet for total request/session cost.
 */
export function getCostSqlSnippet(options: PricingSqlOptions = {}): string {
  const {
    usageAlias = 'u',
    pricingAlias = 'p',
    modelColumn = 'model',
    inputTokensColumn = 'input_tokens',
    outputTokensColumn = 'output_tokens',
    thinkingTokensColumn = 'thinking_tokens',
  } = options;

  const inputCase = getInputCostCaseSql(usageAlias, modelColumn);
  const outputCase = getOutputCostCaseSql(usageAlias, modelColumn);

  return `
    (
      (${usageAlias}.${inputTokensColumn} / 1000000) * COALESCE(${pricingAlias}.input_cost_per_m, ${inputCase}) +
      ((${usageAlias}.${outputTokensColumn} + COALESCE(${usageAlias}.${thinkingTokensColumn}, 0)) / 1000000) * COALESCE(${pricingAlias}.output_cost_per_m, ${outputCase})
    )
  `.trim();
}
```

---

## 5. Verification & Test Plan

| Test Scope | Target File | Verification Method |
| :--- | :--- | :--- |
| **Atomic MERGE Operation** | `lib/settings.test.ts` | Verify single MERGE query executed when array is non-empty; verify DELETE executed when array is empty. Verify that if query fails, rethrow occurs without partial state. |
| **Deduplication Validation** | `lib/settings.test.ts` | Supply duplicate `os_username` records; verify deduplication selects the latest record and does not throw BigQuery multiple-match errors. |
| **globalThis Singleton Lifecycle** | `lib/bigquery.test.ts` | Verify `BigQueryService.getInstance()` returns identical instance across multiple calls and preserves `globalThis` reference. Verify `setInstance` replaces instance for testing. |
| **Query Logging & Redaction** | `lib/bigquery.test.ts` | Verify that logged objects contain `sqlFingerprint`, `durationMs`, and masked parameters (`[REDACTED]`), with zero unredacted PII. |
| **SQL Pricing Generation** | `lib/pricing.test.ts` | Verify `getCostSqlSnippet()` produces valid SQL containing PRICING_DEFAULTS rates and maintains strict CASE WHEN evaluation order. |
