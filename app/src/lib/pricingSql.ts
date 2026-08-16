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
  /**
   * Include thinking tokens in output token calculation. Defaults to true.
   */
  includeThinkingTokens?: boolean;
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
    includeThinkingTokens = true,
  } = options;

  const inputCase = getInputCostCaseSql(usageAlias, modelColumn);
  const outputCase = getOutputCostCaseSql(usageAlias, modelColumn);

  const outputTokensExpr = includeThinkingTokens
    ? `(${usageAlias}.${outputTokensColumn} + COALESCE(${usageAlias}.${thinkingTokensColumn}, 0))`
    : `${usageAlias}.${outputTokensColumn}`;

  return `
    (
      (${usageAlias}.${inputTokensColumn} / 1000000) * COALESCE(${pricingAlias}.input_cost_per_m, ${inputCase}) +
      (${outputTokensExpr} / 1000000) * COALESCE(${pricingAlias}.output_cost_per_m, ${outputCase})
    )
  `.trim();
}
