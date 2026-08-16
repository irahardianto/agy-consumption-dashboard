# API and Design Contracts: Audit Findings Remediation

**Status:** APPROVED DESIGN CONTRACT  
**Author:** Architect  
**Scope:** Server Actions, Helper Modules, Auth Error Handling, CSP Configuration  

---

## 1. Server Actions Contract (`app/src/app/actions.ts`)

All Server Actions follow the **Action Response Envelope** standard with mandatory **3-point structured logging** (Start, Success, Failure) and Correlation ID propagation.

### 1.1 Action Response Envelope Types

```typescript
export type ActionSuccess<T = void> = {
  success: true;
  data?: T;
  count?: number;
};

export type ActionFailure = {
  success: false;
  error: string;
  validationErrors?: Record<string, string[]>;
};

export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;
```

---

### 1.2 Action Signatures and Behavior

#### A. `updateDashboardSetting`
Updates a single key-value setting in `dashboard_settings`.

```typescript
/**
 * Updates a single dashboard configuration setting.
 *
 * @param key - The settings key (must be non-empty string, trimmed).
 * @param value - The configuration string value.
 * @returns ActionResult indicating success or failure with error message.
 */
export async function updateDashboardSetting(
  key: string,
  value: string
): Promise<ActionResult>;
```

**Logging Contract:**
- **Entry (Point 1):** `logger.info({ operation: 'update_dashboard_setting', correlationId, userId, key }, 'Starting dashboard setting update')`
- **Success (Point 2):** `logger.info({ operation: 'update_dashboard_setting', correlationId, userId, key, durationMs }, 'Dashboard setting updated successfully')`
- **Failure (Point 3):** `logger.error({ operation: 'update_dashboard_setting', correlationId, userId, key, durationMs, error: err.message, stack: err.stack }, 'Dashboard setting update failed')`

**Validation Rules:**
- `key`: `z.string().min(1, 'Key is required').max(128, 'Key exceeds maximum length')`
- `value`: `z.string()`

---

#### B. `uploadUserMappings`
Parses and validates a multipart CSV file containing user identity mappings (`os_username`, `display_name`, `email`, `team`) and atomic batch replaces existing records.

```typescript
/**
 * Uploads user mapping records from a CSV file.
 *
 * @param formData - FormData containing 'file' field with CSV content.
 * @returns ActionResult with the count of imported records or validation errors.
 */
export async function uploadUserMappings(
  formData: FormData
): Promise<ActionResult<{ count: number }>>;
```

**Logging Contract:**
- **Entry (Point 1):** `logger.info({ operation: 'upload_user_mappings', correlationId, userId, fileName: file?.name, fileSize: file?.size }, 'Starting user mappings CSV upload')`
- **Success (Point 2):** `logger.info({ operation: 'upload_user_mappings', correlationId, userId, count, durationMs }, 'User mappings CSV uploaded and applied successfully')`
- **Failure (Point 3):** `logger.error({ operation: 'upload_user_mappings', correlationId, userId, durationMs, error: err.message, stack: err.stack }, 'User mappings CSV upload failed')`

**Validation Rules (Zod):**
```typescript
const UserMappingCsvRowSchema = z.object({
  os_username: z.string().trim().min(1, 'os_username is required'),
  display_name: z.string().trim().nullable().optional(),
  email: z
    .string()
    .trim()
    .email('Invalid email format')
    .nullable()
    .optional()
    .or(z.literal('')),
  team: z.string().trim().nullable().optional(),
});

const UserMappingsUploadSchema = z
  .array(UserMappingCsvRowSchema)
  .min(1, 'CSV file is empty or contains no valid rows');
```

---

#### C. `saveUserMappingsAction`
Saves an array of `UserMapping` records edited directly in the UI table.

```typescript
/**
 * Saves modified user mappings directly from the UI.
 *
 * @param mappings - Array of user mapping items.
 * @returns ActionResult indicating success or validation failure.
 */
export async function saveUserMappingsAction(
  mappings: UserMapping[]
): Promise<ActionResult<{ count: number }>>;
```

**Logging Contract:**
- **Entry (Point 1):** `logger.info({ operation: 'save_user_mappings_action', correlationId, userId, rowCount: mappings?.length }, 'Starting user mappings save')`
- **Success (Point 2):** `logger.info({ operation: 'save_user_mappings_action', correlationId, userId, count: mappings.length, durationMs }, 'User mappings saved successfully')`
- **Failure (Point 3):** `logger.error({ operation: 'save_user_mappings_action', correlationId, userId, durationMs, error: err.message, stack: err.stack }, 'User mappings save failed')`

---

#### D. `savePricingAction`
Updates model pricing rates in `dashboard_settings`.

```typescript
/**
 * Updates model pricing overrides in the dashboard settings.
 *
 * @param pricing - Map of model identifiers to input/output USD rates per 1M tokens.
 * @returns ActionResult indicating success or validation failure.
 */
export async function savePricingAction(
  pricing: PricingConfig
): Promise<ActionResult>;
```

**Validation Schema:**
```typescript
const PricingRateSchema = z.object({
  input: z.number().min(0, 'Input rate must be non-negative'),
  output: z.number().min(0, 'Output rate must be non-negative'),
});
const PricingConfigSchema = z.record(z.string().min(1), PricingRateSchema);
```

---

#### E. `resetPricingAction`
Deletes custom model pricing overrides, reverting to system defaults.

```typescript
/**
 * Resets all model pricing overrides back to standard defaults.
 *
 * @returns ActionResult indicating success or failure.
 */
export async function resetPricingAction(): Promise<ActionResult>;
```

---

## 2. SQL Pricing Generator Contract (`app/src/lib/pricingSql.ts`)

Centralizes raw BigQuery SQL generation for model cost calculation to eliminate duplication across queries (Resolves **[MAJOR-002]**).

### 2.1 Interface & Types

```typescript
export interface PricingSqlOptions {
  /**
   * Table alias for the usage table (e.g. 'u'). Defaults to 'u'.
   */
  usageAlias?: string;
  /**
   * Table alias for the pricing CTE/subquery (e.g. 'p'). Defaults to 'p'.
   */
  pricingAlias?: string;
  /**
   * Include thinking tokens in output token calculation. Defaults to true.
   */
  includeThinkingTokens?: boolean;
}

export interface PricingCteOptions {
  /**
   * Dataset name or expression (e.g. `${DATASET}`).
   */
  dataset: string;
  /**
   * CTE identifier name. Defaults to 'pricing'.
   */
  cteName?: string;
}
```

### 2.2 Function Signatures

```typescript
/**
 * Generates the common table expression (CTE) SQL definition for custom model pricing.
 *
 * @param options - Dataset and CTE identifier configuration.
 * @returns SQL CTE fragment (e.g. "pricing AS (SELECT ... FROM `dataset.dashboard_settings` ...)")
 */
export function getPricingCteSql(options: PricingCteOptions): string;

/**
 * Generates the SQL CASE statement for fallback model input token pricing.
 * Derived dynamically from PRICING_DEFAULTS in lib/cost.ts.
 *
 * @param usageAlias - Table alias containing the 'model' column. Defaults to 'u'.
 * @returns SQL CASE expression string.
 */
export function getInputCostCaseSql(usageAlias?: string): string;

/**
 * Generates the SQL CASE statement for fallback model output token pricing.
 * Derived dynamically from PRICING_DEFAULTS in lib/cost.ts.
 *
 * @param usageAlias - Table alias containing the 'model' column. Defaults to 'u'.
 * @returns SQL CASE expression string.
 */
export function getOutputCostCaseSql(usageAlias?: string): string;

/**
 * Generates the complete BigQuery SQL calculation snippet for total request cost:
 * (input_tokens / 1,000,000) * COALESCE(p.input_cost_per_m, CASE ... END) +
 * ((output_tokens + thinking_tokens) / 1,000,000) * COALESCE(p.output_cost_per_m, CASE ... END)
 *
 * @param options - Table aliases and calculation options.
 * @returns Full SQL expression string suitable for SELECT or SUM clauses.
 */
export function getCostSqlSnippet(options?: PricingSqlOptions): string;
```

---

## 3. Pure Metrics Utilities Contract (`app/src/lib/metricsUtils.ts`)

Pure business calculation functions extracted from presentation Server Components (Resolves **[MINOR-007]**).

### 3.1 Interface & Types

```typescript
export interface TrendResult {
  /**
   * Absolute percentage value (e.g., 25 for +25% or -25%).
   */
  value: number;
  /**
   * True if current >= prev (positive or neutral direction).
   */
  isPositive: boolean;
  /**
   * Explicit direction indicator.
   */
  direction: 'up' | 'down' | 'neutral';
}

export interface ModelBreakdownEntry {
  model: string;
  shortModel: string;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface UsageRow {
  model: string;
  tokens: number;
  cost: number;
  [key: string]: any;
}

export interface PeriodComparisonDates {
  prevStartStr: string;
  prevEndStr: string;
}
```

### 3.2 Function Signatures

```typescript
/**
 * Calculates percentage trend between current and previous period metrics.
 *
 * Rules:
 * - If prev === 0 and current > 0 => { value: 100, isPositive: true, direction: 'up' }
 * - If prev === 0 and current === 0 => { value: 0, isPositive: true, direction: 'neutral' }
 * - Otherwise => Math.round(((current - prev) / prev) * 100)
 *
 * @param current - Current period metric value.
 * @param prev - Previous period metric value.
 * @returns Structured TrendResult.
 */
export function calculateTrend(current: number, prev: number): TrendResult;

/**
 * Aggregates token and cost metrics grouped by model, computes percentages,
 * and sorts descending by total tokens.
 *
 * @param data - Array of usage rows with model, tokens, and cost.
 * @param topN - Number of top models to return. Defaults to 5.
 * @returns Sorted array of ModelBreakdownEntry items with topN entries.
 */
export function computeModelBreakdown(
  data: UsageRow[],
  topN?: number
): ModelBreakdownEntry[];

/**
 * Calculates previous period window with identical duration immediately preceding current window.
 *
 * @param start - Start date string (YYYY-MM-DD).
 * @param end - End date string (YYYY-MM-DD).
 * @param referenceDate - Optional reference Date for clock injection.
 * @returns PeriodComparisonDates with ISO date strings (YYYY-MM-DD).
 */
export function calculatePreviousPeriodDates(
  start?: string | null,
  end?: string | null,
  referenceDate?: Date
): PeriodComparisonDates;
```

---

## 4. Auth & IAP Error Handling Contract (`app/src/lib/auth.ts`)

Enforces the Security Mandate (Rule 1 & Rugged Software Constitution) for Google Cloud Identity-Aware Proxy authentication.

### 4.1 Interface & Types

```typescript
export interface UserInfo {
  id: string;
  email: string;
}

export interface IapAuthConfig {
  audience?: string;
  nodeEnv?: string;
  devUserId?: string;
  devUserEmail?: string;
}
```

### 4.2 Security Rules & Error Behaviors

| Environment | `IAP_AUDIENCE` Set | `x-goog-authenticated-user-*` Present | `x-goog-iap-jwt-assertion` Valid | Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Development** (`NODE_ENV === 'development'`) | Optional | Missing or present | Optional | If `DEV_USER_EMAIL` is set, returns dev mock user. Otherwise warns and returns `null`. |
| **Production / Staging** (`NODE_ENV === 'production'`) | **MISSING** | Any | Any | **FAIL SECURE (CLOSED):** Logs `logger.error` with critical security configuration error and returns `null` (`requireUser()` throws `Unauthorized`). |
| **Production / Staging** (`NODE_ENV === 'production'`) | Present | Missing | Any | Logs `logger.warn` and returns `null`. |
| **Production / Staging** (`NODE_ENV === 'production'`) | Present | Present | Missing or Invalid Signature / Expired / Wrong Audience / Wrong Issuer | Logs `logger.error` with security context and returns `null`. |
| **Production / Staging** (`NODE_ENV === 'production'`) | Present | Present | Valid | Logs `logger.debug` and returns `{ id, email }`. |

### 4.3 Function Signatures

```typescript
/**
 * Pure verification helper to extract and validate IAP identity headers.
 * Decoupled from Next.js headers() to support edge, unit testing, and Node runtimes.
 *
 * @param headers - HTTP Headers map or interface.
 * @param config - Optional configuration override.
 * @param authClient - Optional OAuth2Client instance for testing injection.
 */
export async function verifyIapHeaders(
  headers: Headers | Map<string, string> | Record<string, string | string[] | undefined>,
  config?: IapAuthConfig,
  authClient?: { verifyIdToken: (options: any) => Promise<any> }
): Promise<UserInfo | null>;

/**
 * Server adapter: Extracts and validates user identity using Next.js request headers.
 *
 * @returns UserInfo if authenticated and verified, or null.
 */
export async function getUser(): Promise<UserInfo | null>;

/**
 * Guard adapter: Throws 'Unauthorized' Error if request is not authenticated.
 *
 * @throws Error('Unauthorized') when getUser() returns null.
 * @returns UserInfo
 */
export async function requireUser(): Promise<UserInfo>;
```

---

## 5. Next.js CSP Configuration Specification (`app/next.config.ts`)

Removes `'unsafe-eval'` to comply with the Security Mandate while allowing necessary styles, Google Fonts, and Next.js hydration.

### 5.1 Security Headers Definition

```typescript
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Note: 'unsafe-eval' is strictly eliminated
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: cspHeader },
];
```
