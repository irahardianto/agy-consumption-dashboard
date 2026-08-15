import { describe, it, expect } from 'vitest';
import { isValidDateStr, sanitizeDateParams } from './dateSanitizer';

describe('dateSanitizer utilities', () => {
  describe('isValidDateStr', () => {
    it('should validate proper YYYY-MM-DD strings', () => {
      expect(isValidDateStr('2026-08-15')).toBe(true);
      expect(isValidDateStr('2024-02-29')).toBe(true); // Leap year
    });

    it('should reject invalid date strings or non-existent calendar dates', () => {
      expect(isValidDateStr(undefined)).toBe(false);
      expect(isValidDateStr('')).toBe(false);
      expect(isValidDateStr('2026-13-01')).toBe(false);
      expect(isValidDateStr('2025-02-29')).toBe(false); // Non-leap year
      expect(isValidDateStr('2026/08/15')).toBe(false);
      expect(isValidDateStr('invalid-date')).toBe(false);
      expect(isValidDateStr('2026-8-15')).toBe(false);
    });
  });

  describe('sanitizeDateParams', () => {
    it('should allow valid presets', () => {
      expect(sanitizeDateParams('today')).toEqual({ preset: 'today' });
      expect(sanitizeDateParams('3days')).toEqual({ preset: '3days' });
      expect(sanitizeDateParams('week')).toEqual({ preset: 'week' });
      expect(sanitizeDateParams('month')).toEqual({ preset: 'month' });
    });

    it('should fallback to default preset for invalid preset string', () => {
      expect(sanitizeDateParams('year', undefined, undefined, 'week')).toEqual({ preset: 'week' });
      expect(sanitizeDateParams(undefined, undefined, undefined, '3days')).toEqual({ preset: '3days' });
    });

    it('should handle custom preset with valid start and end dates', () => {
      expect(
        sanitizeDateParams('custom', '2026-08-01', '2026-08-15')
      ).toEqual({
        preset: 'custom',
        startDate: '2026-08-01',
        endDate: '2026-08-15',
      });
    });

    it('should fallback to default preset if custom range has startDate > endDate', () => {
      expect(
        sanitizeDateParams('custom', '2026-08-15', '2026-08-01', '3days')
      ).toEqual({
        preset: '3days',
      });
    });

    it('should fallback to default preset if custom range has invalid date format', () => {
      expect(
        sanitizeDateParams('custom', '2026-08-01', 'invalid', 'today')
      ).toEqual({
        preset: 'today',
      });
    });
  });
});
