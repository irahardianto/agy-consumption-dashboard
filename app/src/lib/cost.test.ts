import { describe, it, expect } from 'vitest';
import {
  calculateCost,
  extractIdentity,
  PRICING_DEFAULTS,
  getPricingFromSettings,
  redistributeUnattributed,
  UsageRecord,
} from './cost';

describe('calculateCost', () => {
  it('calculates cost correctly for gemini-1.5-pro', () => {
    const cost = calculateCost('gemini-1.5-pro', 1_000_000, 1_000_000);
    expect(cost).toBe(PRICING_DEFAULTS['gemini-1.5-pro'].input + PRICING_DEFAULTS['gemini-1.5-pro'].output);
  });

  it('calculates cost correctly for gemini-1.5-flash', () => {
    const cost = calculateCost('gemini-1.5-flash', 1_000_000, 1_000_000);
    expect(cost).toBe(PRICING_DEFAULTS['gemini-1.5-flash'].input + PRICING_DEFAULTS['gemini-1.5-flash'].output);
  });

  it('returns 0 for unknown models', () => {
    const cost = calculateCost('unknown-model', 100, 100);
    expect(cost).toBe(0);
  });

  it('calculates cost with custom pricing overrides', () => {
    const customPricing = {
      'gemini-1.5-pro': {
        input: 2.0,
        output: 5.0,
      },
    };
    const cost = calculateCost('gemini-1.5-pro', 1_000_000, 1_000_000, customPricing);
    expect(cost).toBe(7.0);
  });
});

describe('getPricingFromSettings', () => {
  it('merges settings onto defaults correctly', () => {
    const settings = {
      'pricing:gemini-1.5-pro:input': '2.50',
      'pricing:gemini-1.5-pro:output': '6.00',
      'pricing:new-custom-model:input': '1.00',
      'pricing:new-custom-model:output': '2.00',
      'other:setting:key': 'value',
    };

    const config = getPricingFromSettings(settings);

    expect(config['gemini-1.5-pro']).toEqual({
      input: 2.5,
      output: 6.0,
    });
    expect(config['gemini-1.5-flash']).toEqual({
      input: 0.075,
      output: 0.3,
    });
    expect(config['new-custom-model']).toEqual({
      input: 1.0,
      output: 2.0,
    });
  });

  it('ignores invalid numeric rates in settings', () => {
    const settings = {
      'pricing:gemini-1.5-pro:input': 'invalid-number',
      'pricing:gemini-1.5-pro:output': '4.50',
    };

    const config = getPricingFromSettings(settings);
    expect(config['gemini-1.5-pro']?.input).toBe(PRICING_DEFAULTS['gemini-1.5-pro'].input);
    expect(config['gemini-1.5-pro']?.output).toBe(4.5);
  });
});

describe('redistributeUnattributed', () => {
  it('correctly redistributes unattributed tokens', () => {
    const records: UsageRecord[] = [
      {
        os_username: 'user1',
        displayName: 'User One',
        requests: 10,
        input_tokens: 100,
        output_tokens: 200,
        tokens: 300,
        cost: 0.3,
      },
      {
        os_username: 'user2',
        displayName: 'User Two',
        requests: 30,
        input_tokens: 300,
        output_tokens: 600,
        tokens: 900,
        cost: 0.9,
      },
      {
        os_username: '__unattributed__',
        displayName: 'Unattributed',
        requests: 100,
        input_tokens: 1000,
        output_tokens: 2000,
        tokens: 3000,
        cost: 3.0,
      },
    ];

    const redistributed = redistributeUnattributed(records);

    expect(redistributed.length).toBe(2);

    const u1 = redistributed.find(r => r.os_username === 'user1')!;
    const u2 = redistributed.find(r => r.os_username === 'user2')!;

    // user1 has 300 / 1200 = 25% of attributed tokens
    // user2 has 900 / 1200 = 75% of attributed tokens
    // user1 has 10 / 40 = 25% of attributed requests
    // user2 has 30 / 40 = 75% of attributed requests

    expect(u1.tokens).toBe(300 + 0.25 * 3000);
    expect(u1.input_tokens).toBe(100 + 0.25 * 1000);
    expect(u1.output_tokens).toBe(200 + 0.25 * 2000);
    expect(u1.requests).toBe(10 + 0.25 * 100);
    expect(u1.cost).toBeCloseTo(0.3 + 0.25 * 3.0, 5);

    expect(u2.tokens).toBe(900 + 0.75 * 3000);
    expect(u2.input_tokens).toBe(300 + 0.75 * 1000);
    expect(u2.output_tokens).toBe(600 + 0.75 * 2000);
    expect(u2.requests).toBe(30 + 0.75 * 100);
    expect(u2.cost).toBeCloseTo(0.9 + 0.75 * 3.0, 5);
  });

  it('returns same records if no __unattributed__ record present', () => {
    const records: UsageRecord[] = [
      {
        os_username: 'user1',
        displayName: 'User One',
        requests: 10,
        input_tokens: 100,
        output_tokens: 200,
        tokens: 300,
        cost: 0.3,
      },
    ];
    const redistributed = redistributeUnattributed(records);
    expect(redistributed).toEqual(records);
  });

  it('avoids division by zero if total attributed tokens is 0', () => {
    const records: UsageRecord[] = [
      {
        os_username: 'user1',
        displayName: 'User One',
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        tokens: 0,
        cost: 0,
      },
      {
        os_username: '__unattributed__',
        displayName: 'Unattributed',
        requests: 10,
        input_tokens: 100,
        output_tokens: 200,
        tokens: 300,
        cost: 0.3,
      },
    ];
    const redistributed = redistributeUnattributed(records);
    expect(redistributed.length).toBe(1);
    expect(redistributed[0]?.tokens).toBe(0);
  });
});

describe('extractIdentity', () => {
  it('extracts identity from system prompt', () => {
    const prompt = 'You are a helpful assistant.\nAgent OS Username: irahardianto\nFollow instructions.';
    expect(extractIdentity(prompt)).toBe('irahardianto');
  });

  it('is case insensitive', () => {
    const prompt = 'agent os username: user123';
    expect(extractIdentity(prompt)).toBe('user123');
  });

  it('returns null if not found', () => {
    const prompt = 'Hello world';
    expect(extractIdentity(prompt)).toBeNull();
  });
});
