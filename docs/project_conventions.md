# Project Conventions & Architectural Guidelines

**Project:** Antigravity Consumption Dashboard  
**Status:** FROZEN DESIGN CONTRACT  
**Author:** Architect  
**Audience:** All Implementers, Reviewers, and Automated Verification Agents  

---

## 1. Project Directory & Layering Layout

This project follows Next.js App Router conventions aligned with `@.agents/rules/project-structure.md` and `@.agents/rules/architectural-pattern.md`.

```
app/
├── src/
│   ├── app/                      # DELIVERY / ROUTING LAYER ONLY
│   │   ├── layout.tsx            # Root HTML shell & global providers
│   │   ├── page.tsx              # Overview page (Server Component)
│   │   ├── actions.ts            # Server Actions (Entry points with 3-point logging)
│   │   ├── actions.test.ts       # Action integration/unit tests
│   │   ├── settings/
│   │   │   └── page.tsx          # Settings page (Server Component)
│   │   ├── users/
│   │   │   ├── page.tsx          # Users directory page
│   │   │   └── [username]/
│   │   │       └── page.tsx      # User detail drilldown page
│   │   └── methodology/
│   │       └── page.tsx          # Methodology documentation page
│   │
│   ├── lib/                      # DOMAIN, UTILITIES, & INFRASTRUCTURE LAYER
│   │   ├── bigquery.ts           # BigQuery I/O Service & Adapter
│   │   ├── settings.ts           # Settings & User Mappings Store
│   │   ├── cost.ts               # Pure Pricing & Token Math calculations
│   │   ├── pricingSql.ts         # Centralized SQL generator for model pricing
│   │   ├── metricsUtils.ts       # Pure metrics transformations (trends, breakdowns)
│   │   ├── dateUtils.ts          # Pure date range & window calculations
│   │   ├── currencyUtils.ts      # Pure currency formatting
│   │   ├── auth.ts               # Google Cloud IAP Auth & JWT verification
│   │   ├── logger.ts             # Pino structured logger singleton
│   │   └── db.ts                 # Database query aggregations & helpers
│   │
│   ├── components/               # PRESENTATION UI LAYER (Pure/Stateful React Components)
│   │   ├── KpiCard.tsx
│   │   ├── ChartCard.tsx
│   │   ├── UsageChart.tsx
│   │   ├── DonutChart.tsx
│   │   ├── CsvUploadZone.tsx
│   │   └── ...
│   │
│   └── types/                    # SHARED DATA MODELS & INTERFACES
│       ├── metrics.ts
│       └── ...
│
└── tests/                        # E2E & CROSS-CUTTING TEST SUITES
```

### Layer Boundary Rules

1. **Routing Layer (`src/app/`):**
   - Must contain only React Server Components, Route Handlers, Server Actions, layouts, loading, and error boundaries.
   - **Never** place raw query logic, data transformations, or utility calculations directly in `src/app/` files.
2. **Infrastructure / Domain Layer (`src/lib/`):**
   - Business calculations must be pure functions with zero React or DOM dependencies.
   - All I/O operations (BigQuery, Cloud Storage, HTTP) must be encapsulated in injectable modules with test doubles.
3. **Presentation Layer (`src/components/`):**
   - Components accept domain types and pure callbacks.
   - Components must **never** import database clients (`bigquery.ts`, `db.ts`) or server secrets.

---

## 2. File & Symbol Naming Conventions

| Category | File Pattern | Export Style | Example |
| :--- | :--- | :--- | :--- |
| **Pure Utilities / Domain Logic** | `camelCase.ts` | Named exports | `metricsUtils.ts`, `dateUtils.ts` |
| **I/O Services / Adapters** | `camelCase.ts` or `PascalCase.ts` | Named classes/functions | `bigquery.ts`, `settings.ts` |
| **React Components** | `PascalCase.tsx` | Named exports preferred | `KpiCard.tsx`, `CsvUploadZone.tsx` |
| **CSS Modules** | `ComponentName.module.css` | Default CSS import | `DateFilter.module.css` |
| **Unit Tests** | `{name}.test.ts(x)` | Co-located with subject | `metricsUtils.test.ts` |
| **Server Actions** | `actions.ts` | Named async functions | `export async function uploadUserMappings...` |

---

## 3. Mandatory Structured Logging Pattern (3-Point Mandate)

Per `@.agents/rules/logging-and-observability-mandate.md`, every operation entry point (Server Actions, Route Handlers, I/O mutations) MUST implement the **3-Point Logging Requirement**.

### Template for Server Actions & Operation Handlers

```typescript
import logger from '@/lib/logger';
import { requireUser } from '@/lib/auth';

export async function executeOperationAction(payload: InputPayload): Promise<ActionResult> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  // 1. OPERATION START
  logger.info({
    operation: 'execute_operation',
    correlationId,
    // safe payload summary (scrub PII/secrets)
  }, 'Starting execute_operation');

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    // Validate inputs using Zod
    const validated = PayloadSchema.parse(payload);

    // Execute pure logic and persistence
    const result = await performDomainOperation(validated, { userId });

    // 2. OPERATION SUCCESS
    logger.info({
      operation: 'execute_operation',
      correlationId,
      userId,
      durationMs: Date.now() - startTime,
      resultId: result.id,
    }, 'execute_operation completed successfully');

    return { success: true, data: result };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error({
      operation: 'execute_operation',
      correlationId,
      userId,
      durationMs,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    }, 'execute_operation failed');

    return {
      success: false,
      error: errorMessage,
    };
  }
}
```

---

## 4. Testability-First Architectural Patterns

### 4.1 Rule 1: I/O Isolation & Test Doubles
- All I/O clients (e.g. `BigQueryService`) must be mockable without monkey-patching globals.
- Functions depending on external I/O must accept optional dependency overrides or implement explicit contracts.

### 4.2 Rule 2: Pure Business Logic (The 3-Step Pattern)
Code should always follow the strict separation:
1. **Fetch dependencies & data** (I/O)
2. **Execute pure logic / transformations** (No I/O, deterministic)
3. **Persist or Render results** (I/O or JSX)

**Example:**
```typescript
// 1. Fetch
const rawUsage = await getUsageOverTime(start, end);
const rawPrevMetrics = await getOverviewMetrics(prevStart, prevEnd);

// 2. Pure Logic (In isolated, unit-tested functions)
const trend = calculateTrend(currentMetrics.totalCost, rawPrevMetrics.totalCost);
const breakdown = computeModelBreakdown(rawUsage, 5);

// 3. Render
return <OverviewView trend={trend} breakdown={breakdown} />;
```

### 4.3 Time & Clock Determinism
Functions that compute date ranges must accept an optional reference timestamp (`now: Date = new Date()`) so tests are reproducible and deterministic across timezones and leap years.

```typescript
export function resolveDateRange(
  preset?: string,
  startDate?: string,
  endDate?: string,
  defaultPreset: string = '3days',
  referenceDate: Date = new Date()
): { start: string; end: string }
```

---

## 5. Security & Rugged Software Invariants

1. **Fail Secure (Closed):** If authentication or environment preconditions (`IAP_AUDIENCE` in production) fail, deny access immediately. Never default to permissive access on missing configuration.
2. **Defense in Depth Input Validation:** Validate all client payloads using strict Zod schemas with appropriate string length limits, sanitization, and type coercions.
3. **Strict Content Security Policy (CSP):** Prohibit `'unsafe-eval'` in all environments. Inline styles must be constrained, and fonts/images restricted to explicit Google and self origins.
4. **No Ambient State in Transformation Functions:** Do not read `process.env` inside pure functions; pass required config options as explicit arguments.
