import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadUserMappings, savePricingAction, resetPricingAction, updateDashboardSetting } from './actions';
import * as settings from '@/lib/settings';

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}));vi.mock('@/lib/settings', () => ({
  replaceUserMappings: vi.fn(),
  updatePricing: vi.fn(),
  resetPricingToDefaults: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Actions - CSV Parsing Issues & Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadUserMappings', () => {
    it('fails if no file uploaded', async () => {
      const formData = new FormData();
      const result = await uploadUserMappings(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe('No file uploaded');
    });

    it('fails if CSV is empty', async () => {
      const formData = new FormData();
      const file = new File([''], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);
      const result = await uploadUserMappings(formData);
      expect(result.success).toBe(false);
    });

    it('fails if CSV has invalid headers or missing os_username', async () => {
      const formData = new FormData();
      const file = new File(['display_name,email\nJohn,j@j.com'], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);
      const result = await uploadUserMappings(formData);
      expect(result.success).toBe(false);
    });

    it('fails if CSV has badly formatted email', async () => {
      const formData = new FormData();
      const file = new File(['os_username,display_name,email\njohn,John Doe,not-an-email'], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);
      const result = await uploadUserMappings(formData);
      expect(result.success).toBe(false);
    });

    it('succeeds with valid CSV mapping', async () => {
      const formData = new FormData();
      const file = new File(['os_username,display_name,email\njohn,John Doe,j@j.com'], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);
      const result = await uploadUserMappings(formData);
      expect(result.success).toBe(true);
      expect(result).toHaveProperty('count', 1);
      expect(settings.replaceUserMappings).toHaveBeenCalled();
    });
  });

  describe('savePricingAction', () => {
    it('fails if pricing has invalid negative values', async () => {
      const result = await savePricingAction({
        'gpt-4': { input: -1, output: 0.05 }
      });
      expect(result.success).toBe(false);
    });

    it('succeeds if pricing is valid', async () => {
      const result = await savePricingAction({
        'gpt-4': { input: 0.03, output: 0.06 }
      });
      expect(result.success).toBe(true);
      expect(settings.updatePricing).toHaveBeenCalled();
    });
  });
});
