# Code Audit: agy-consumption-dashboard (Full Codebase)
Date: 2026-08-15
Auditor: AI Code Audit (multi-dimensional, coordinator-direct scan)

## Executive Summary
- **Dimensions activated:** A, B, C, D, E, F, G
- **Dimensions skipped:** None
- **Files scanned:** ~45 source files (app/src/, bq/, terraform/, deploy.sh, config.env.example)
- **Findings:** 25 total (2 critical, 7 major, 8 minor, 8 enhancement)
- **Automated verification:** Lint: PASS | Tests: PASS (129 passed, 0 failed, 20 test files) | Build: PASS | Coverage: N/A (no coverage provider configured)
- **Overall codebase health:** NEEDS ATTENTION

---

## Critical Issues

### [CRIT-001] IAP JWT Verification Opt-In By Default — Auth Can Be Bypassed Without IAP_AUDIENCE
- **File:** `app/src/lib/auth.ts:43`
- **Severity:** CRITICAL
- **Dimension:** A (Security)
- **Rule Source:** `security-principles.md`, `rugged-software-constitution.md`
- **Description:** The IAP JWT assertion (`x-goog-iap-jwt-assertion`) is only cryptographically verified when `IAP_AUDIENCE` is set. When the env var is absent (not documented in config.env.example), the application trusts raw IAP email/ID headers without verifying the JWT signature. A forged `x-goog-authenticated-user-email` header is accepted if traffic bypasses IAP.
- **Evidence:**
```typescript
// auth.ts line 43
if (AUDIENCE) {  // JWT validation only happens when AUDIENCE is set
  // ... JWT verification
}
// Without AUDIENCE, getUser() returns a user from raw headers with zero cryptographic proof
```
- **Impact:** An attacker who can reach Cloud Run directly (before the load balancer/IAP layer) or who spoofs headers can impersonate any user.
- **Remediation:** Fail fast in production if IAP_AUDIENCE is not set:
```typescript
if (process.env.NODE_ENV !== 'development' && !process.env.IAP_AUDIENCE) {
  throw new Error('IAP_AUDIENCE is required in production for secure JWT validation');
}
```
- **Fix workflow:** `/bugfix` — immediate priority

---

### [CRIT-002] Content Security Policy Allows unsafe-inline and unsafe-eval Scripts
- **File:** `app/next.config.ts:29`
- **Severity:** CRITICAL
- **Dimension:** A (Security)
- **Rule Source:** `security-principles.md`
- **Description:** The CSP header permits `script-src 'self' 'unsafe-inline' 'unsafe-eval'`. This negates XSS protection entirely.
- **Evidence:**
```typescript
value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..."
```
- **Impact:** Any XSS vector (reflected param, compromised dependency, stored content) can execute arbitrary JS in the user's browser.
- **Remediation:** Use nonce-based CSP via Next.js 15 middleware. Remove `'unsafe-eval'` (not required by React 19/Next.js App Router in production).
- **Fix workflow:** `/bugfix` — immediate priority

---

## Major Issues

### [MAJ-001] SQL Pricing CASE-WHEN Block Duplicated 5 Times Across 2 Files
- **File:** `app/src/lib/bigquery.ts:149`, `app/src/app/db.ts:120`
- **Severity:** MAJOR (escalated: E + F cross-dimension)
- **Dimensions:** E (Code Quality) + F (Integration)
- **Rule Source:** `core-design-principles.md` (Rule of Three), `database-design-principles.md`
- **Description:** The 30-line pricing fallback CASE-WHEN SQL block is duplicated verbatim 5 times across `getOverviewMetrics`, `getUsageOverTime`, `getTopUsers` (bigquery.ts) and `getUserSessions`, `getUsersWithDetails` (db.ts). Adding a new model requires updating 5 SQL strings manually.
- **Impact:** Price inconsistencies between endpoints when a model is added to `cost.ts` but not all SQL blocks are updated. The `pricing.test.ts` cross-module synchronization test already guards against this, signaling the team is aware of the risk.
- **Remediation:** Extract a shared SQL snippet helper (`lib/pricingSql.ts`), or eliminate SQL cost computation by fetching raw token counts and computing cost in TypeScript using `calculateCost()`.
- **Fix workflow:** `/refactor`

---

### [MAJ-002] replaceUserMappings Is a Non-Atomic Delete+Insert — Data Loss Window
- **File:** `app/src/lib/settings.ts:79-101`
- **Severity:** MAJOR (escalated: B + F cross-dimension)
- **Dimensions:** B (Reliability) + F (Integration)
- **Rule Source:** `error-handling-principles.md`, `database-design-principles.md`
- **Description:** `replaceUserMappings` deletes all rows then inserts new ones in two separate BigQuery DML calls. BigQuery DML has no cross-call transaction support. If insert fails after delete, the table is permanently empty.
- **Evidence:**
```typescript
await bq.query(`DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`); // succeeds
await bq.query({ query: insertQuery, params: { mappings } }); // if this fails: empty table
```
- **Impact:** Complete loss of all user identity mappings on any insert-side failure (quota, network timeout, oversized payload).
- **Remediation:** Use a MERGE statement to upsert, or a temp-table + SWAP pattern. At minimum, validate all data completely before executing the delete.
- **Fix workflow:** `/bugfix`

---

### [MAJ-003] BigQueryService Singleton Initialized at Module Import Time
- **File:** `app/src/lib/bigquery.ts:86`
- **Severity:** MAJOR
- **Dimensions:** C (Architecture) + B (Reliability)
- **Rule Source:** `architectural-pattern.md`
- **Description:** `export const bq = BigQueryService.getInstance()` executes at module import time. In dev HMR, static class properties don't survive Next.js hot reloads, creating new client instances. The module throws on import if `PROJECT_ID` is missing, crashing unrelated tests.
- **Remediation:**
```typescript
const globalForBq = globalThis as unknown as { bq: BigQueryService };
export const bq = globalForBq.bq ?? (globalForBq.bq = BigQueryService.getInstance());
```
- **Fix workflow:** `/bugfix`

---

### [MAJ-004] No Server-Side File Size or Type Validation in CSV Upload
- **File:** `app/src/app/actions.ts:49-88`
- **Severity:** MAJOR (escalated: A + B cross-dimension)
- **Dimensions:** A (Security) + B (Reliability)
- **Rule Source:** `security-principles.md`, `rugged-software-constitution.md`
- **Description:** `uploadUserMappings` loads the entire file into memory with no size limit or server-side MIME type validation. The client-side `accept=".csv"` filter is bypassable.
- **Impact:** Multi-GB file upload exhausts Node.js heap memory causing process crash.
- **Remediation:**
```typescript
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
if (file.size > MAX_UPLOAD_BYTES) {
  return { success: false, error: 'File too large (max 5 MB)' };
}
if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
  return { success: false, error: 'Only CSV files are accepted' };
}
```
- **Fix workflow:** `/bugfix`

---

### [MAJ-005] Missing Operation-Start Log, correlationId, and userId in Two Server Actions
- **File:** `app/src/app/actions.ts:20-89`
- **Severity:** MAJOR (escalated: D + A cross-dimension)
- **Dimensions:** D (Observability) + A (Security/Audit)
- **Rule Source:** `logging-and-observability-mandate.md`
- **Description:** `updateDashboardSetting` and `uploadUserMappings` have no start log, no `correlationId`, no `userId`, and no success log. Only `savePricingAction` and `resetPricingAction` have proper 3-point logging. No audit trail for who mutated what settings.
- **Remediation:**
```typescript
const correlationId = crypto.randomUUID();
const start = Date.now();
const user = await requireUser();
logger.info({ correlationId, operation: 'update_setting', key, userId: user.id }, 'Starting update_setting');
// on success:
logger.info({ correlationId, durationMs: Date.now() - start }, 'update_setting succeeded');
```
- **Fix workflow:** `/bugfix`

---

### [MAJ-006] No Tests for Critical Error Paths in replaceUserMappings and Settings
- **File:** `app/src/lib/settings.test.ts`, `app/src/app/db.test.ts`
- **Severity:** MAJOR
- **Dimension:** G (Test Coverage)
- **Rule Source:** `testing-strategy.md`
- **Description:** `settings.test.ts` has zero tests for error paths of `updateSetting`, `getPricingSettings`, or `getUserMappings`. No test covers the data-loss scenario: DELETE succeeds but INSERT fails in `replaceUserMappings`.
- **Remediation:**
```typescript
it('should rethrow when insert fails after delete', async () => {
  querySpy.mockResolvedValueOnce([]) // DELETE succeeds
           .mockRejectedValueOnce(new Error('Insert quota exceeded'));
  await expect(replaceUserMappings([{ os_username: 'u1' }])).rejects.toThrow();
});
```
- **Fix workflow:** `/bugfix`

---

### [MAJ-007] Page Components Have No Tests — Inline Business Logic Is Untestable
- **File:** `app/src/app/page.tsx`, `app/src/app/users/page.tsx`, `app/src/app/users/[username]/page.tsx`
- **Severity:** MAJOR
- **Dimension:** G (Test Coverage)
- **Rule Source:** `testing-strategy.md`
- **Description:** None of the three primary page components have tests. `OverviewPage` contains non-trivial pure logic (trend calculation, model breakdown aggregation) defined inline — untestable without extraction.
- **Remediation:** Extract `calculateTrend` and `computeModelBreakdown` to `lib/metricsUtils.ts` with unit tests. Add Server Component render tests.
- **Fix workflow:** `/bugfix`

---

## Minor Issues

### [MIN-001] Unnecessary `as any` Casts in auth.ts
- **File:** `app/src/lib/auth.ts:20-22` | **Dimension:** E
- **Description:** `(headerList as any).get(...)` — Next.js `ReadonlyHeaders` fully types `.get()`. Three unnecessary casts.
- **Remediation:** Use `headerList.get(...)` directly.

### [MIN-002] toLocalDateString Duplicated in page.tsx and dateUtils.ts
- **File:** `app/src/app/page.tsx:42`, `app/src/lib/dateUtils.ts:7` | **Dimension:** E
- **Description:** Identical helper defined twice. DRY violation.
- **Remediation:** Export `toLocalDateString` from `dateUtils.ts`, remove duplicate.

### [MIN-003] OverviewPage Is 278 Lines — Violates SRP and 50-Line Guideline
- **File:** `app/src/app/page.tsx:22-300` | **Dimension:** E
- **Description:** Single async function handles date resolution, trend math, model aggregation, and all JSX markup.
- **Remediation:** Extract helpers to `lib/metricsUtils.ts`; split JSX into sub-components.

### [MIN-004] No Client-Side File Size Check in CsvUploadZone
- **File:** `app/src/components/CsvUploadZone.tsx:38` | **Dimension:** B
- **Description:** No client-side size pre-check before calling server action.
- **Remediation:** `if (file.size > 5 * 1024 * 1024) { setError('File too large'); return; }`

### [MIN-005] alert() Used for Upload Success Feedback
- **File:** `app/src/components/CsvUploadZone.tsx:50` | **Dimension:** E
- **Description:** Blocking browser modal is inconsistent with inline error display pattern.
- **Remediation:** Replace with inline success state `<p>` element.

### [MIN-006] IAP_AUDIENCE Env Var Not Documented in config.env.example
- **File:** `config.env.example` | **Dimensions:** A + Config
- **Description:** Critical security variable absent from operator configuration reference.
- **Remediation:** Add `IAP_AUDIENCE=""  # Required for production JWT validation`.

### [MIN-007] BigQuery Error Logs Include Full SQL Query
- **File:** `app/src/lib/bigquery.ts:45` | **Dimension:** D
- **Description:** `logger.debug({ sql }, ...)` logs full SQL. If queries contain inline user data, this becomes a data leak.
- **Remediation:** Log SQL fingerprint/hash at DEBUG; full SQL in ERROR only when safe.

### [MIN-008] react and react-dom Use Floating rc Tag in package.json
- **File:** `app/package.json` | **Dimension:** G
- **Description:** `"react": "rc"` is not pinned — npm install could silently upgrade to a breaking RC.
- **Remediation:** Pin to `"react": "19.0.0-rc.1"` or current installed version.

---

## Enhancement Issues

| ID | Title | Dimension | Workflow |
|---|---|---|---|
| ENH-001 | Add Content-Security-Policy-Report-Only header for CSP monitoring | A | backlog |
| ENH-002 | Add Permissions-Policy header (camera, microphone, geolocation) | A | backlog |
| ENH-003 | Validate JWT payload.email against expected Cloud Run service account | A | backlog |
| ENH-004 | Make getPricingFromSettings pure — pass modelList as param, not env read | C | `/workflow-solo` |
| ENH-005 | Add vitest.config.ts with coverage thresholds (v8/istanbul, >=70%) | G | `/workflow-solo` |
| ENH-006 | Thread correlationId from Server Actions into bq.query() calls | D | `/workflow-solo` |
| ENH-007 | Add Pino redact config for email, token, jwt, authorization fields | D | backlog |
| ENH-008 | Extract SQL strings to named constants or a queries/ directory | E | backlog |

---

## Verification Suite Results
- **Linter & Static Analysis:** PASS — `next lint` 0 warnings, 0 errors
- **Automated Tests:** PASS — 129 passed, 0 failed, 20 test files (Vitest)
- **Build Verification:** PASS — `next build` succeeds, all 6 routes build as dynamic (force-dynamic)
- **Test Coverage:** Not configured (no coverage provider in vitest setup)

---

## Cross-Dimension Correlations

| Finding | Dimensions | Escalation Applied |
|---|---|---|
| IAP JWT opt-in + missing env doc | A + Config | MAJOR to CRITICAL |
| CSP unsafe-inline/eval (active, no mitigation) | A | standalone CRITICAL |
| SQL pricing duplicated 5x | E + F | MINOR to MAJOR |
| Delete-insert non-atomic | B + F | MINOR to MAJOR |
| CSV upload: no size limit | A + B | MINOR to MAJOR |
| Missing action log points + no audit trail | D + A | MINOR to MAJOR |

---

## Dimensions Covered

| Dimension | Status | Files / Queries Examined |
|---|---|---|
| A. Security & Configuration | Checked | auth.ts, actions.ts, next.config.ts, config.env.example, all Server Actions |
| B. Reliability & Error Handling | Checked | bigquery.ts, settings.ts, db.ts, actions.ts, CsvUploadZone.tsx |
| C. Testability & Architecture | Checked | All lib/ modules, app/src/app/, components/ |
| D. Observability & Logging | Checked | logger.ts, all Server Actions, all page.tsx files, bigquery.ts, auth.ts |
| E. Code Quality & Patterns | Checked | All files in app/src/ |
| F. Integration Contracts & DB | Checked | bq/schemas/*.json vs bigquery.ts/db.ts, merge_usage_summary.sql, settings.ts |
| G. Dependencies & Tests | Checked | package.json, package-lock.json, all 20 test files |

---

## Rules Applied
- `security-mandate.md` / `security-principles.md`
- `rugged-software-constitution.md`
- `error-handling-principles.md`
- `architectural-pattern.md`
- `logging-and-observability-mandate.md`
- `code-organization-principles.md`
- `core-design-principles.md`
- `api-design-principles.md` / `database-design-principles.md`
- `dependency-management-principles.md` / `testing-strategy.md`
- `configuration-management-principles.md`

---

## Remediation Action Plan

| Priority | Finding | Summary | Workflow |
|---|---|---|---|
| 1 | CRIT-001 | IAP JWT verification disabled without IAP_AUDIENCE | `/bugfix` immediate |
| 2 | CRIT-002 | CSP allows unsafe-inline/unsafe-eval | `/bugfix` immediate |
| 3 | MAJ-002 | Non-atomic delete+insert in replaceUserMappings | `/bugfix` |
| 4 | MAJ-004 | No file size/type validation in CSV upload | `/bugfix` |
| 5 | MAJ-005 | Missing start logs and userId context in actions | `/bugfix` |
| 6 | MAJ-006 | No tests for critical error paths | `/bugfix` |
| 7 | MAJ-001 | SQL pricing duplicated 5x | `/refactor` |
| 8 | MAJ-007 | No tests for page components | `/bugfix` |
| 9 | MAJ-003 | BigQuery singleton — use globalThis pattern | `/bugfix` |
| 10 | MIN-006 | Add IAP_AUDIENCE to config.env.example | direct fix |
| 11 | MIN-001 | Remove as any casts in auth.ts | direct fix |
| 12 | MIN-002 | Export toLocalDateString from dateUtils | direct fix |
| 13 | MIN-008 | Pin react/react-dom to explicit version | direct fix |
| 14 | MIN-003 | Extract inline logic from 278-line OverviewPage | `/refactor` |
| 15 | MIN-005 | Replace alert() with inline success state | direct fix |
