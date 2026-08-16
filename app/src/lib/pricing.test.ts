import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  calculateCost,
  PRICING_DEFAULTS,
  getPricingFromSettings,
  redistributeUnattributed,
  UsageRecord,
  PricingConfig,
} from './cost';

describe('PRICING_DEFAULTS configuration', () => {
  it('should define authoritative pricing for all supported Gemini 3.x models', () => {
    // Arrange & Assert
    expect(PRICING_DEFAULTS['gemini-3.6-flash']).toEqual({ input: 1.50, output: 7.50 });
    expect(PRICING_DEFAULTS['gemini-3.5-flash']).toEqual({ input: 1.50, output: 9.00 });
    expect(PRICING_DEFAULTS['gemini-3.5-flash-lite']).toEqual({ input: 0.30, output: 2.50 });
    expect(PRICING_DEFAULTS['gemini-3.1-pro-preview']).toEqual({ input: 2.00, output: 12.00 });
    expect(PRICING_DEFAULTS['gemini-3.1-flash-lite']).toEqual({ input: 0.25, output: 1.50 });
    expect(PRICING_DEFAULTS['gemini-3-flash-preview']).toEqual({ input: 0.50, output: 3.00 });
  });
});

describe('calculateCost', () => {
  it('should calculate cost accurately for gemini-3.6-flash including thinking tokens', () => {
    // Arrange
    const model = 'gemini-3.6-flash';
    const inputTokens = 2_000_000;
    const outputTokens = 1_000_000;
    const thinkingTokens = 500_000;

    // Act
    // Input: (2M / 1M) * $1.50 = $3.00
    // Output + Thinking: ((1M + 0.5M) / 1M) * $7.50 = 1.5 * $7.50 = $11.25
    // Total: $14.25
    const cost = calculateCost(model, inputTokens, outputTokens, thinkingTokens);

    // Assert
    expect(cost).toBeCloseTo(14.25, 5);
  });

  it('should calculate cost accurately for gemini-3.5-flash including thinking tokens', () => {
    // Arrange
    const model = 'gemini-3.5-flash';
    const inputTokens = 1_000_000;
    const outputTokens = 2_000_000;
    const thinkingTokens = 1_000_000;

    // Act
    // Input: 1 * $1.50 = $1.50
    // Output: (2 + 1) * $9.00 = $27.00
    // Total: $28.50
    const cost = calculateCost(model, inputTokens, outputTokens, thinkingTokens);

    // Assert
    expect(cost).toBeCloseTo(28.50, 5);
  });

  it('should calculate cost accurately for gemini-3.5-flash-lite', () => {
    // Arrange
    const model = 'gemini-3.5-flash-lite';
    const inputTokens = 10_000_000;
    const outputTokens = 4_000_000;

    // Act
    // Input: 10 * $0.30 = $3.00
    // Output: 4 * $2.50 = $10.00
    // Total: $13.00
    const cost = calculateCost(model, inputTokens, outputTokens);

    // Assert
    expect(cost).toBeCloseTo(13.00, 5);
  });

  it('should calculate cost accurately for gemini-3.1-pro-preview', () => {
    // Arrange
    const model = 'gemini-3.1-pro-preview';
    const inputTokens = 1_000_000;
    const outputTokens = 1_000_000;
    const thinkingTokens = 500_000;

    // Act
    // Input: 1 * $2.00 = $2.00
    // Output: 1.5 * $12.00 = $18.00
    // Total: $20.00
    const cost = calculateCost(model, inputTokens, outputTokens, thinkingTokens);

    // Assert
    expect(cost).toBeCloseTo(20.00, 5);
  });

  it('should calculate cost accurately for gemini-3.1-flash-lite', () => {
    // Arrange
    const model = 'gemini-3.1-flash-lite';
    const inputTokens = 4_000_000;
    const outputTokens = 2_000_000;

    // Act
    // Input: 4 * $0.25 = $1.00
    // Output: 2 * $1.50 = $3.00
    // Total: $4.00
    const cost = calculateCost(model, inputTokens, outputTokens);

    // Assert
    expect(cost).toBeCloseTo(4.00, 5);
  });

  it('should calculate cost accurately for gemini-3-flash-preview', () => {
    // Arrange
    const model = 'gemini-3-flash-preview';
    const inputTokens = 2_000_000;
    const outputTokens = 1_000_000;
    const thinkingTokens = 1_000_000;

    // Act
    // Input: 2 * $0.50 = $1.00
    // Output: 2 * $3.00 = $6.00
    // Total: $7.00
    const cost = calculateCost(model, inputTokens, outputTokens, thinkingTokens);

    // Assert
    expect(cost).toBeCloseTo(7.00, 5);
  });

  it('should resolve model when full publisher model path is provided', () => {
    // Arrange
    const model = 'publishers/google/models/gemini-3.5-flash';

    // Act
    const cost = calculateCost(model, 1_000_000, 1_000_000);

    // Assert
    expect(cost).toBe(1.50 + 9.00);
  });

  it('should apply custom pricing overrides over defaults', () => {
    // Arrange
    const customPricing: PricingConfig = {
      'gemini-3.5-flash': {
        input: 2.50,
        output: 10.00,
      },
    };

    // Act
    const cost = calculateCost('gemini-3.5-flash', 1_000_000, 1_000_000, 500_000, customPricing);

    // Assert
    // Input: 1 * $2.50 = $2.50; Output: 1.5 * $10.00 = $15.00 -> $17.50
    expect(cost).toBeCloseTo(17.50, 5);
  });

  it('should return zero for unknown models without throwing errors', () => {
    // Arrange & Act
    const cost = calculateCost('unknown-unregistered-model', 5_000_000, 5_000_000);

    // Assert
    expect(cost).toBe(0);
  });
});

describe('getPricingFromSettings', () => {
  it('should overlay database settings onto defaults correctly', () => {
    // Arrange
    const settings = {
      'pricing:gemini-3.6-flash:input': '1.80',
      'pricing:gemini-3.6-flash:output': '8.00',
      'pricing:custom-model:input': '3.00',
      'pricing:custom-model:output': '15.00',
      'ignored:setting': 'true',
    };

    // Act
    const config = getPricingFromSettings(settings);

    // Assert
    expect(config['gemini-3.6-flash']).toEqual({ input: 1.80, output: 8.00 });
    expect(config['gemini-3.5-flash']).toEqual({ input: 1.50, output: 9.00 }); // unchanged default
    expect(config['custom-model']).toEqual({ input: 3.00, output: 15.00 });
  });

  it('should infer fallback pricing for unlisted models from GEMINI_MODELS env var', () => {
    // Arrange
    const originalEnv = process.env.GEMINI_MODELS;
    try {
      process.env.GEMINI_MODELS = 'gemini-3.6-flash, gemini-3.5-flash-lite, custom-3-flash, custom-ultra';

      // Act
      const config = getPricingFromSettings({});

      // Assert
      expect(config['gemini-3.6-flash']).toEqual({ input: 1.50, output: 7.50 });
      expect(config['gemini-3.5-flash-lite']).toEqual({ input: 0.30, output: 2.50 });
      expect(config['custom-3-flash']).toEqual({ input: 0.50, output: 3.00 });
      expect(config['custom-ultra']).toEqual({ input: 0.0, output: 0.0 });
    } finally {
      process.env.GEMINI_MODELS = originalEnv;
    }
  });
});

describe('Cross-module Pricing Synchronization (cost.ts, pricingSql.ts, bigquery.ts, db.ts)', () => {
  const readSource = (relPath: string): string => {
    const fullPath = path.resolve(__dirname, '..', relPath);
    return fs.readFileSync(fullPath, 'utf8');
  };

  const pricingSqlSrc = readSource('lib/pricingSql.ts');
  const bigquerySrc = readSource('lib/bigquery.ts');
  const dbSrc = readSource('app/db.ts');

  it('should ensure pricingSql.ts, bigquery.ts and db.ts contain zero references to deprecated models', () => {
    // Assert
    expect(pricingSqlSrc).not.toContain('2.0-flash-exp');
    expect(bigquerySrc).not.toContain('2.0-flash-exp');
    expect(dbSrc).not.toContain('2.0-flash-exp');
    expect(pricingSqlSrc).not.toContain('irahardianto-labs');
    expect(bigquerySrc).not.toContain('irahardianto-labs');
    expect(dbSrc).not.toContain('irahardianto-labs');
  });

  it('should ensure pricingSql.ts SQL fallback pricing matches cost.ts PRICING_DEFAULTS', () => {
    // Verify each model in PRICING_DEFAULTS is explicitly matched with exact prices in pricingSql.ts
    const expectedModelRates: Record<string, { input: number; output: number }> = {
      'gemini-3.6-flash': { input: 1.50, output: 7.50 },
      'gemini-3.5-flash': { input: 1.50, output: 9.00 },
      'gemini-3.5-flash-lite': { input: 0.30, output: 2.50 },
      'gemini-3.1-pro-preview': { input: 2.00, output: 12.00 },
      'gemini-3.1-flash-lite': { input: 0.25, output: 1.50 },
      'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
    };

    for (const [model, rates] of Object.entries(expectedModelRates)) {
      // Check input pricing
      const inputPattern = new RegExp(`%${model}%.*?THEN\\s+\\$\\{PRICING_DEFAULTS\\['${model}'\\]\\.input\\.toFixed\\(2\\)\\}|%${model}%.*?THEN\\s+${rates.input.toFixed(2)}`, 's');
      expect(pricingSqlSrc).toMatch(inputPattern);

      // Check output pricing
      const outputPattern = new RegExp(`%${model}%.*?THEN\\s+\\$\\{PRICING_DEFAULTS\\['${model}'\\]\\.output\\.toFixed\\(2\\)\\}|%${model}%.*?THEN\\s+${rates.output.toFixed(2)}`, 's');
      expect(pricingSqlSrc).toMatch(outputPattern);
    }
  });

  it('should maintain strict SQL CASE WHEN specificity order in pricingSql.ts', () => {
    const caseMatches = pricingSqlSrc.match(/CASE[\s\S]*?END/g) || [];
    expect(caseMatches.length).toBeGreaterThan(0);

    const verifyCaseOrdering = (caseSql: string) => {
      // 3.5-flash-lite must appear before 3.5-flash and before wildcard %flash%
      const idx35FlashLite = caseSql.indexOf('3.5-flash-lite');
      const idx35Flash = caseSql.indexOf('3.5-flash%');
      const idxFlash = caseSql.indexOf("LIKE '%flash%'");
      const idxFlashLite = caseSql.indexOf("LIKE '%flash-lite%'");

      if (idx35FlashLite !== -1 && idx35Flash !== -1) {
        expect(idx35FlashLite).toBeLessThan(idx35Flash);
      }
      if (idx35FlashLite !== -1 && idxFlash !== -1) {
        expect(idx35FlashLite).toBeLessThan(idxFlash);
      }
      if (idxFlashLite !== -1 && idxFlash !== -1) {
        expect(idxFlashLite).toBeLessThan(idxFlash);
      }

      // 3.1-pro-preview must appear before wildcard %pro%
      const idx31Pro = caseSql.indexOf('3.1-pro');
      const idxPro = caseSql.indexOf("LIKE '%pro%'");
      if (idx31Pro !== -1 && idxPro !== -1) {
        expect(idx31Pro).toBeLessThan(idxPro);
      }
    };

    caseMatches.forEach(verifyCaseOrdering);
  });

  it('should correctly simulate BigQuery SQL fallback pricing evaluation against real model names', () => {
    // Simulated BigQuery SQL CASE WHEN evaluation function matching bigquery.ts and db.ts
    const evaluateSqlPricing = (model: string): { input: number; output: number } => {
      const lower = model.toLowerCase();
      let input = 1.50; // ELSE fallback
      let output = 7.50; // ELSE fallback

      // Input pricing evaluation
      if (lower.includes('gemini-3.5-flash-lite') || lower.includes('3.5-flash-lite')) {
        input = 0.30;
      } else if (lower.includes('gemini-3.1-flash-lite') || lower.includes('3.1-flash-lite')) {
        input = 0.25;
      } else if (lower.includes('gemini-3.6-flash') || lower.includes('3.6-flash')) {
        input = 1.50;
      } else if (lower.includes('gemini-3.5-flash') || lower.includes('3.5-flash')) {
        input = 1.50;
      } else if (lower.includes('gemini-3.1-pro-preview') || lower.includes('3.1-pro')) {
        input = 2.00;
      } else if (lower.includes('gemini-3-flash-preview') || lower.includes('3-flash')) {
        input = 0.50;
      } else if (lower.includes('flash-lite')) {
        input = 0.25;
      } else if (lower.includes('flash')) {
        input = 1.50;
      } else if (lower.includes('pro')) {
        input = 2.00;
      } else if (lower.includes('ultra')) {
        input = 5.00;
      }

      // Output pricing evaluation
      if (lower.includes('gemini-3.5-flash-lite') || lower.includes('3.5-flash-lite')) {
        output = 2.50;
      } else if (lower.includes('gemini-3.1-flash-lite') || lower.includes('3.1-flash-lite')) {
        output = 1.50;
      } else if (lower.includes('gemini-3.6-flash') || lower.includes('3.6-flash')) {
        output = 7.50;
      } else if (lower.includes('gemini-3.5-flash') || lower.includes('3.5-flash')) {
        output = 9.00;
      } else if (lower.includes('gemini-3.1-pro-preview') || lower.includes('3.1-pro')) {
        output = 12.00;
      } else if (lower.includes('gemini-3-flash-preview') || lower.includes('3-flash')) {
        output = 3.00;
      } else if (lower.includes('flash-lite')) {
        output = 1.50;
      } else if (lower.includes('flash')) {
        output = 7.50;
      } else if (lower.includes('pro')) {
        output = 12.00;
      } else if (lower.includes('ultra')) {
        output = 20.00;
      }

      return { input, output };
    };

    // Assert that every standard Gemini model evaluates to PRICING_DEFAULTS rates
    for (const [model, expectedRates] of Object.entries(PRICING_DEFAULTS)) {
      const evaluated = evaluateSqlPricing(model);
      expect(evaluated.input).toBe(expectedRates.input);
      expect(evaluated.output).toBe(expectedRates.output);
    }

    // Assert wildcard fallbacks
    expect(evaluateSqlPricing('custom-gemini-ultra')).toEqual({ input: 5.00, output: 20.00 });
    expect(evaluateSqlPricing('unknown-fallback-model')).toEqual({ input: 1.50, output: 7.50 });
  });
});

describe('redistributeUnattributed', () => {
  it('should accurately distribute unattributed tokens, requests, and cost proportionally', () => {
    // Arrange
    const records: UsageRecord[] = [
      {
        os_username: 'dev_alice',
        displayName: 'Alice',
        requests: 100,
        input_tokens: 1_000_000,
        output_tokens: 500_000,
        tokens: 1_500_000,
        cost: 15.00,
      },
      {
        os_username: 'dev_bob',
        displayName: 'Bob',
        requests: 300,
        input_tokens: 3_000_000,
        output_tokens: 1_500_000,
        tokens: 4_500_000,
        cost: 45.00,
      },
      {
        os_username: '__unattributed__',
        displayName: 'Unattributed',
        requests: 200,
        input_tokens: 2_000_000,
        output_tokens: 1_000_000,
        tokens: 3_000_000,
        cost: 30.00,
      },
    ];

    // Act
    const result = redistributeUnattributed(records);

    // Assert
    // Total attributed tokens = 1.5M + 4.5M = 6.0M
    // Alice proportion: 1.5M / 6.0M = 25%
    // Bob proportion: 4.5M / 6.0M = 75%
    expect(result.length).toBe(2);
    const alice = result.find(r => r.os_username === 'dev_alice')!;
    const bob = result.find(r => r.os_username === 'dev_bob')!;

    expect(alice.tokens).toBe(1_500_000 + 0.25 * 3_000_000); // 2,250,000
    expect(alice.input_tokens).toBe(1_000_000 + 0.25 * 2_000_000); // 1,500,000
    expect(alice.output_tokens).toBe(500_000 + 0.25 * 1_000_000); // 750,000
    expect(alice.requests).toBe(100 + 0.25 * 200); // 150
    expect(alice.cost).toBeCloseTo(15.00 + 0.25 * 30.00, 5); // 22.50

    expect(bob.tokens).toBe(4_500_000 + 0.75 * 3_000_000); // 6,750,000
    expect(bob.input_tokens).toBe(3_000_000 + 0.75 * 2_000_000); // 4,500,000
    expect(bob.output_tokens).toBe(1_500_000 + 0.75 * 1_000_000); // 2,250,000
    expect(bob.requests).toBe(300 + 0.75 * 200); // 450
    expect(bob.cost).toBeCloseTo(45.00 + 0.75 * 30.00, 5); // 67.50

    // Ensure total sum matches original total across all 3 records
    const totalOriginalCost = records.reduce((sum, r) => sum + r.cost, 0);
    const totalRedistributedCost = result.reduce((sum, r) => sum + r.cost, 0);
    expect(totalRedistributedCost).toBeCloseTo(totalOriginalCost, 5);

    const totalOriginalTokens = records.reduce((sum, r) => sum + r.tokens, 0);
    const totalRedistributedTokens = result.reduce((sum, r) => sum + r.tokens, 0);
    expect(totalRedistributedTokens).toBe(totalOriginalTokens);
  });

  it('should return records unmodified when no __unattributed__ record is present', () => {
    // Arrange
    const records: UsageRecord[] = [
      {
        os_username: 'dev_alice',
        displayName: 'Alice',
        requests: 10,
        input_tokens: 1000,
        output_tokens: 2000,
        tokens: 3000,
        cost: 0.05,
      },
    ];

    // Act
    const result = redistributeUnattributed(records);

    // Assert
    expect(result).toEqual(records);
  });
});
