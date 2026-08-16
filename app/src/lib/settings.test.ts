import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  replaceUserMappings,
  getSettings,
  updateSetting,
  getUserMappings,
  getPricingSettings,
  updatePricing,
  resetPricingToDefaults,
  sanitizeAndDeduplicateMappings,
  UserMappingItem,
} from './settings';
import { bq } from './bigquery';
import { ZodError } from 'zod';

describe('settings module', () => {
  let querySpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    querySpy = vi.spyOn(bq, 'query');
  });

  describe('sanitizeAndDeduplicateMappings', () => {
    it('should deduplicate mappings by os_username taking the latest entry', () => {
      const raw: UserMappingItem[] = [
        { os_username: 'alice', display_name: 'Alice 1', email: 'alice1@example.com', team: 'Team A' },
        { os_username: 'bob', display_name: 'Bob', email: 'bob@example.com', team: 'Team B' },
        { os_username: 'alice', display_name: 'Alice 2', email: 'alice2@example.com', team: 'Team A2' },
      ];

      const result = sanitizeAndDeduplicateMappings(raw);
      expect(result).toHaveLength(2);
      expect(result.find(r => r.os_username === 'alice')).toEqual({
        os_username: 'alice',
        display_name: 'Alice 2',
        email: 'alice2@example.com',
        team: 'Team A2',
      });
    });

    it('should transform empty strings to null for nullable fields', () => {
      const raw: any[] = [
        { os_username: 'user1', display_name: '', email: '', team: '' },
      ];

      const result = sanitizeAndDeduplicateMappings(raw);
      expect(result[0]).toEqual({
        os_username: 'user1',
        display_name: null,
        email: null,
        team: null,
      });
    });

    it('should throw ZodError if os_username is missing or empty', () => {
      expect(() => sanitizeAndDeduplicateMappings([{ os_username: '' } as any])).toThrow(ZodError);
    });

    it('should throw ZodError if email is invalid', () => {
      expect(() => sanitizeAndDeduplicateMappings([{ os_username: 'user1', email: 'not-an-email' }])).toThrow(ZodError);
    });
  });

  describe('replaceUserMappings', () => {
    it('should execute single atomic MERGE query with typed parameters when mappings exist', async () => {
      querySpy.mockResolvedValue([]);

      const mappings: UserMappingItem[] = [
        {
          os_username: 'user1',
          display_name: 'User One',
          email: 'user1@example.com',
          team: 'A-Team',
        },
      ];

      await replaceUserMappings(mappings);

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.query).toContain('MERGE INTO');
      expect(callArgs.query).toContain('WHEN NOT MATCHED BY SOURCE THEN');
      expect(callArgs.query).toContain('DELETE');
      expect(callArgs.params.mappings).toEqual([
        {
          os_username: 'user1',
          display_name: 'User One',
          email: 'user1@example.com',
          team: 'A-Team',
        },
      ]);
      expect(callArgs.types.mappings).toEqual([
        {
          os_username: 'STRING',
          display_name: 'STRING',
          email: 'STRING',
          team: 'STRING',
        },
      ]);
    });

    it('should execute single DELETE query when mappings list is empty', async () => {
      querySpy.mockResolvedValue([]);

      await replaceUserMappings([]);

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][0].query).toContain('DELETE FROM');
      expect(querySpy.mock.calls[0][0].query).toContain('WHERE TRUE');
    });

    it('should rethrow error on BigQuery failure without leaving partial state', async () => {
      querySpy.mockRejectedValue(new Error('BigQuery quota exceeded'));

      const mappings: UserMappingItem[] = [
        { os_username: 'user1', display_name: 'User One', email: 'user1@example.com', team: 'A-Team' },
      ];

      await expect(replaceUserMappings(mappings)).rejects.toThrow('BigQuery quota exceeded');
    });
  });

  describe('getSettings', () => {
    it('should return settings as a key-value record', async () => {
      querySpy.mockResolvedValue([
        { key: 'pricing:gemini-3.5-flash:input', value: '1.50' },
        { key: 'pricing:gemini-3.5-flash:output', value: '9.00' },
      ]);

      const result = await getSettings();
      expect(result).toEqual({
        'pricing:gemini-3.5-flash:input': '1.50',
        'pricing:gemini-3.5-flash:output': '9.00',
      });
    });

    it('should return empty object on error', async () => {
      querySpy.mockRejectedValue(new Error('BigQuery error'));

      const result = await getSettings();
      expect(result).toEqual({});
    });
  });

  describe('updateSetting', () => {
    it('should execute MERGE query to update setting', async () => {
      querySpy.mockResolvedValue([]);

      await updateSetting('setting:key', 'setting_value');

      expect(querySpy).toHaveBeenCalledTimes(1);
      const callArgs = querySpy.mock.calls[0][0];
      expect(callArgs.query).toContain('MERGE');
      expect(callArgs.params).toEqual({
        key: 'setting:key',
        value: 'setting_value',
      });
    });

    it('should throw error on invalid key', async () => {
      await expect(updateSetting('', 'val')).rejects.toThrow();
    });

    it('should rethrow error on query failure', async () => {
      querySpy.mockRejectedValue(new Error('Query failed'));

      await expect(updateSetting('valid_key', 'val')).rejects.toThrow('Query failed');
    });
  });

  describe('getUserMappings', () => {
    it('should return user mappings from BigQuery', async () => {
      const mockMappings = [
        { os_username: 'alice', display_name: 'Alice', email: 'alice@example.com', team: 'Alpha' },
      ];
      querySpy.mockResolvedValue(mockMappings);

      const result = await getUserMappings();
      expect(result).toEqual(mockMappings);
    });

    it('should return empty array on query error', async () => {
      querySpy.mockRejectedValue(new Error('Connection error'));

      const result = await getUserMappings();
      expect(result).toEqual([]);
    });
  });

  describe('getPricingSettings, updatePricing, resetPricingToDefaults', () => {
    it('should load pricing config overlaying settings', async () => {
      querySpy.mockResolvedValue([
        { key: 'pricing:gemini-3.6-flash:input', value: '2.00' },
      ]);

      const result = await getPricingSettings();
      expect(result['gemini-3.6-flash'].input).toBe(2.00);
      expect(result['gemini-3.6-flash'].output).toBe(7.50); // default
    });

    it('should update multiple pricing keys concurrently', async () => {
      querySpy.mockResolvedValue([]);

      await updatePricing({
        'gemini-3.6-flash': { input: 1.80, output: 8.00 },
      });

      expect(querySpy).toHaveBeenCalledTimes(2);
    });

    it('should reset pricing to defaults by deleting pricing keys', async () => {
      querySpy.mockResolvedValue([]);

      await resetPricingToDefaults();

      expect(querySpy).toHaveBeenCalledTimes(1);
      expect(querySpy.mock.calls[0][0]).toContain("DELETE FROM `agy_consumption.dashboard_settings` WHERE key LIKE 'pricing:%'");
    });

    it('should rethrow error when resetPricingToDefaults fails', async () => {
      querySpy.mockRejectedValue(new Error('Delete failed'));

      await expect(resetPricingToDefaults()).rejects.toThrow('Delete failed');
    });
  });
});
