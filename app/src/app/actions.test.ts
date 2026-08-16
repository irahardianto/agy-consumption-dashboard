import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  uploadUserMappings,
  savePricingAction,
  resetPricingAction,
  updateDashboardSetting,
  saveUserMappingsAction,
} from './actions';
import * as settings from '@/lib/settings';
import * as auth from '@/lib/auth';
import logger from '@/lib/logger';

vi.mock('@/lib/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/settings', () => ({
  replaceUserMappings: vi.fn(),
  updatePricing: vi.fn(),
  resetPricingToDefaults: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('Server Actions - Validation, Auth, and 3-Point Structured Logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.requireUser).mockResolvedValue({
      id: 'test-user-id',
      email: 'user@example.com',
    });
  });

  describe('updateDashboardSetting', () => {
    it('succeeds and performs 3-point structured logging on valid input', async () => {
      const result = await updateDashboardSetting('currency', 'EUR');

      expect(result.success).toBe(true);
      expect(settings.updateSetting).toHaveBeenCalledWith('currency', 'EUR');

      // Point 1: Start log
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'update_dashboard_setting',
          correlationId: expect.any(String),
          userId: 'anonymous',
          key: 'currency',
        }),
        'Starting dashboard setting update'
      );

      // Point 2: Success log
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'update_dashboard_setting',
          correlationId: expect.any(String),
          userId: 'user@example.com',
          key: 'currency',
          durationMs: expect.any(Number),
        }),
        'Dashboard setting updated successfully'
      );
    });

    it('fails with validation error on empty key', async () => {
      const result = await updateDashboardSetting('', 'EUR');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Point 3: Error log
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'update_dashboard_setting',
          correlationId: expect.any(String),
          error: expect.any(String),
        }),
        'Dashboard setting update failed'
      );
    });

    it('fails when user is unauthorized', async () => {
      vi.mocked(auth.requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await updateDashboardSetting('currency', 'USD');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'update_dashboard_setting',
          userId: 'anonymous',
          error: 'Unauthorized',
        }),
        'Dashboard setting update failed'
      );
    });
  });

  describe('uploadUserMappings', () => {
    it('fails if no file is uploaded', async () => {
      const formData = new FormData();
      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No file uploaded');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'upload_user_mappings',
          error: 'No file uploaded',
        }),
        'User mappings CSV upload failed'
      );
    });

    it('fails if CSV file is empty (0 bytes)', async () => {
      const formData = new FormData();
      const file = new File([''], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('CSV file is empty');
    });

    it('fails if file size exceeds 5MB limit', async () => {
      const formData = new FormData();
      // Mock a file larger than 5MB
      const largeContent = new Uint8Array(5 * 1024 * 1024 + 1024);
      const file = new File([largeContent], 'large.csv', { type: 'text/csv' });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File size exceeds maximum allowed limit of 5MB');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'upload_user_mappings',
          error: expect.stringContaining('5MB'),
        }),
        'User mappings CSV upload failed'
      );
    });

    it('fails if file extension is not .csv', async () => {
      const formData = new FormData();
      const file = new File(['data'], 'malicious.exe', { type: 'text/csv' });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid file type. Only CSV files (.csv) are supported.');
    });

    it('fails if MIME type is disallowed', async () => {
      const formData = new FormData();
      const file = new File(['data'], 'photo.csv', { type: 'image/png' });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid file type. Only CSV files (.csv) are supported.');
    });

    it('fails if CSV rows are missing os_username', async () => {
      const formData = new FormData();
      const file = new File(['display_name,email\nJohn,j@j.com'], 'test.csv', {
        type: 'text/csv',
      });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('fails if CSV has invalid email format', async () => {
      const formData = new FormData();
      const file = new File(
        ['os_username,display_name,email\njohn,John Doe,not-an-email'],
        'test.csv',
        { type: 'text/csv' }
      );
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('succeeds with valid CSV mapping, performs 3-point logging, and calls replaceUserMappings', async () => {
      const formData = new FormData();
      const file = new File(
        ['os_username,display_name,email,team\njohn,John Doe,j@j.com,Platform'],
        'valid_mappings.csv',
        { type: 'text/csv' }
      );
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('count', 1);
      expect(settings.replaceUserMappings).toHaveBeenCalledWith([
        {
          os_username: 'john',
          display_name: 'John Doe',
          email: 'j@j.com',
          team: 'Platform',
        },
      ]);

      // Point 1: Start log
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'upload_user_mappings',
          correlationId: expect.any(String),
          userId: 'anonymous',
          fileName: 'valid_mappings.csv',
        }),
        'Starting user mappings CSV upload'
      );

      // Point 2: Success log
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'upload_user_mappings',
          correlationId: expect.any(String),
          userId: 'user@example.com',
          count: 1,
          durationMs: expect.any(Number),
        }),
        'User mappings CSV uploaded and applied successfully'
      );
    });

    it('handles empty optional email or team gracefully', async () => {
      const formData = new FormData();
      const file = new File(
        ['os_username,display_name,email,team\njane,Jane,,'],
        'valid.csv',
        { type: 'application/vnd.ms-excel' }
      );
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('count', 1);
      expect(settings.replaceUserMappings).toHaveBeenCalledWith([
        {
          os_username: 'jane',
          display_name: 'Jane',
          email: null,
          team: null,
        },
      ]);
    });

    it('fails when user is unauthenticated', async () => {
      vi.mocked(auth.requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

      const formData = new FormData();
      const file = new File(['os_username\njohn'], 'test.csv', { type: 'text/csv' });
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('saveUserMappingsAction', () => {
    it('succeeds and logs correctly for valid mappings array', async () => {
      const mappings = [
        {
          os_username: 'alice',
          display_name: 'Alice',
          email: 'alice@example.com',
          team: 'Core',
        },
      ];

      const result = await saveUserMappingsAction(mappings);

      expect(result.success).toBe(true);
      expect(result).toHaveProperty('count', 1);
      expect(settings.replaceUserMappings).toHaveBeenCalledWith(mappings);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_user_mappings_action',
          rowCount: 1,
        }),
        'Starting user mappings save'
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_user_mappings_action',
          count: 1,
          userId: 'user@example.com',
        }),
        'User mappings saved successfully'
      );
    });

    it('fails when an entry has invalid email format', async () => {
      const mappings = [
        {
          os_username: 'alice',
          display_name: 'Alice',
          email: 'not-an-email',
          team: 'Core',
        },
      ];

      const result = await saveUserMappingsAction(mappings);

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_user_mappings_action',
          error: expect.any(String),
        }),
        'User mappings save failed'
      );
    });

    it('fails when user is unauthenticated', async () => {
      vi.mocked(auth.requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await saveUserMappingsAction([]);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('savePricingAction', () => {
    it('fails if pricing has invalid negative values', async () => {
      const result = await savePricingAction({
        'gpt-4': { input: -1, output: 0.05 },
      });

      expect(result.success).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_pricing_action',
          error: expect.any(String),
        }),
        'Pricing save action failed'
      );
    });

    it('succeeds if pricing is valid and logs 3 points', async () => {
      const pricing = {
        'gemini-1.5-pro': { input: 3.5, output: 10.5 },
      };

      const result = await savePricingAction(pricing);

      expect(result.success).toBe(true);
      expect(settings.updatePricing).toHaveBeenCalledWith(pricing);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_pricing_action',
          correlationId: expect.any(String),
        }),
        'Starting pricing save action'
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'save_pricing_action',
          userId: 'user@example.com',
          durationMs: expect.any(Number),
        }),
        'Pricing saved successfully via action'
      );
    });

    it('fails when user is unauthenticated', async () => {
      vi.mocked(auth.requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await savePricingAction({
        'gemini-1.5-pro': { input: 1.0, output: 2.0 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });
  });

  describe('resetPricingAction', () => {
    it('succeeds, calls resetPricingToDefaults, and logs correctly', async () => {
      const result = await resetPricingAction();

      expect(result.success).toBe(true);
      expect(settings.resetPricingToDefaults).toHaveBeenCalled();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'reset_pricing_action',
        }),
        'Starting pricing reset action'
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'reset_pricing_action',
          userId: 'user@example.com',
          durationMs: expect.any(Number),
        }),
        'Pricing reset successfully via action'
      );
    });

    it('fails when user is unauthenticated', async () => {
      vi.mocked(auth.requireUser).mockRejectedValueOnce(new Error('Unauthorized'));

      const result = await resetPricingAction();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'reset_pricing_action',
          userId: 'anonymous',
          error: 'Unauthorized',
        }),
        'Pricing reset action failed'
      );
    });
  });
});
