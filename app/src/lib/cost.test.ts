import { describe, it, expect } from 'vitest';
import { calculateCost, extractIdentity, PRICING_DEFAULTS } from './cost';

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
