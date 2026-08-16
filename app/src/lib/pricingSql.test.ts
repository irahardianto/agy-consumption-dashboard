import { describe, it, expect } from 'vitest';
import {
  getPricingCteSql,
  getInputCostCaseSql,
  getOutputCostCaseSql,
  getCostSqlSnippet,
} from './pricingSql';
import { PRICING_DEFAULTS } from './cost';

describe('pricingSql module', () => {
  describe('getPricingCteSql', () => {
    it('should generate default CTE SQL with dataset', () => {
      const sql = getPricingCteSql({ dataset: 'agy_consumption' });
      expect(sql).toContain('pricing AS (');
      expect(sql).toContain('FROM `agy_consumption.dashboard_settings`');
      expect(sql).toContain("WHERE key LIKE 'pricing:%'");
      expect(sql).toContain("SPLIT(key, ':')[SAFE_OFFSET(1)] AS model");
    });

    it('should support custom cteName and settingsTable', () => {
      const sql = getPricingCteSql({
        dataset: 'custom_ds',
        cteName: 'custom_pricing',
        settingsTable: 'custom_settings',
      });
      expect(sql).toContain('custom_pricing AS (');
      expect(sql).toContain('FROM `custom_ds.custom_settings`');
    });
  });

  describe('getInputCostCaseSql and getOutputCostCaseSql', () => {
    it('should generate input cost CASE statement with PRICING_DEFAULTS rates and correct alias', () => {
      const inputSql = getInputCostCaseSql('u', 'model');
      expect(inputSql).toContain(`WHEN LOWER(u.model) LIKE '%gemini-3.6-flash%' OR LOWER(u.model) LIKE '%3.6-flash%' THEN ${PRICING_DEFAULTS['gemini-3.6-flash'].input.toFixed(2)}`);
      expect(inputSql).toContain(`WHEN LOWER(u.model) LIKE '%gemini-3.5-flash-lite%' OR LOWER(u.model) LIKE '%3.5-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash-lite'].input.toFixed(2)}`);
      expect(inputSql).toContain("WHEN LOWER(u.model) LIKE '%flash-lite%' THEN 0.25");
      expect(inputSql).toContain('ELSE 1.50');
    });

    it('should generate output cost CASE statement with PRICING_DEFAULTS rates and correct alias', () => {
      const outputSql = getOutputCostCaseSql('a', 'raw_model_name');
      expect(outputSql).toContain(`WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.6-flash%' OR LOWER(a.raw_model_name) LIKE '%3.6-flash%' THEN ${PRICING_DEFAULTS['gemini-3.6-flash'].output.toFixed(2)}`);
      expect(outputSql).toContain(`WHEN LOWER(a.raw_model_name) LIKE '%gemini-3.5-flash-lite%' OR LOWER(a.raw_model_name) LIKE '%3.5-flash-lite%' THEN ${PRICING_DEFAULTS['gemini-3.5-flash-lite'].output.toFixed(2)}`);
      expect(outputSql).toContain("WHEN LOWER(a.raw_model_name) LIKE '%flash-lite%' THEN 1.50");
      expect(outputSql).toContain('ELSE 7.50');
    });

    it('should maintain strict evaluation order for specific models before wildcard families', () => {
      const inputSql = getInputCostCaseSql('u', 'model');
      const idx35FlashLite = inputSql.indexOf('3.5-flash-lite');
      const idx35Flash = inputSql.indexOf('3.5-flash%');
      const idxFlash = inputSql.indexOf("LIKE '%flash%'");
      const idxFlashLite = inputSql.indexOf("LIKE '%flash-lite%'");
      const idx31Pro = inputSql.indexOf('3.1-pro');
      const idxPro = inputSql.indexOf("LIKE '%pro%'");

      expect(idx35FlashLite).toBeLessThan(idx35Flash);
      expect(idx35FlashLite).toBeLessThan(idxFlash);
      expect(idxFlashLite).toBeLessThan(idxFlash);
      expect(idx31Pro).toBeLessThan(idxPro);
    });
  });

  describe('getCostSqlSnippet', () => {
    it('should generate full cost calculation expression with defaults', () => {
      const snippet = getCostSqlSnippet();
      expect(snippet).toContain('(u.input_tokens / 1000000) * COALESCE(p.input_cost_per_m,');
      expect(snippet).toContain('((u.output_tokens + COALESCE(u.thinking_tokens, 0)) / 1000000) * COALESCE(p.output_cost_per_m,');
    });

    it('should support custom aliases and columns without thinking tokens', () => {
      const snippet = getCostSqlSnippet({
        usageAlias: 'usage',
        pricingAlias: 'pr',
        modelColumn: 'm_name',
        inputTokensColumn: 'in_tok',
        outputTokensColumn: 'out_tok',
        includeThinkingTokens: false,
      });

      expect(snippet).toContain('(usage.in_tok / 1000000) * COALESCE(pr.input_cost_per_m,');
      expect(snippet).toContain('(usage.out_tok / 1000000) * COALESCE(pr.output_cost_per_m,');
      expect(snippet).not.toContain('thinking_tokens');
    });
  });
});
