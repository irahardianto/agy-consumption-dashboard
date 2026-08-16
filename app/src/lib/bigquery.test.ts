import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BigQueryService,
  getOverviewMetrics,
  getUsageOverTime,
  getTopUsers,
  getUserUsage,
  getSqlFingerprint,
  sanitizeLogParams,
  bq,
} from './bigquery';
import logger from './logger';

describe('BigQueryService and Utilities', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    BigQueryService.setInstance(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    BigQueryService.setInstance(undefined);
  });

  describe('getSqlFingerprint', () => {
    it('should generate deterministic 8-character hex hash for normalized SQL', () => {
      const sql1 = 'SELECT  * \n  FROM `agy_consumption.users`   WHERE 1=1';
      const sql2 = 'SELECT * FROM `agy_consumption.users` WHERE 1=1';

      const fp1 = getSqlFingerprint(sql1);
      const fp2 = getSqlFingerprint(sql2);

      expect(fp1).toHaveLength(8);
      expect(fp1).toBe(fp2);
    });

    it('should produce different fingerprints for different queries', () => {
      const fp1 = getSqlFingerprint('SELECT 1');
      const fp2 = getSqlFingerprint('SELECT 2');
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('sanitizeLogParams', () => {
    it('should return undefined when params are undefined', () => {
      expect(sanitizeLogParams(undefined)).toBeUndefined();
    });

    it('should redact sensitive keys such as email, token, password, jwt, secret, authorization', () => {
      const params = {
        email: 'user@example.com',
        TOKEN: 'secret-token-123',
        password: 'pass',
        jwt: 'header.payload.sig',
        secret: 'my-secret',
        authorization: 'Bearer xyz',
        safeParam: 'hello',
        count: 42,
      };

      const sanitized = sanitizeLogParams(params);
      expect(sanitized).toEqual({
        email: '[REDACTED]',
        TOKEN: '[REDACTED]',
        password: '[REDACTED]',
        jwt: '[REDACTED]',
        secret: '[REDACTED]',
        authorization: '[REDACTED]',
        safeParam: 'hello',
        count: 42,
      });
    });

    it('should format array and object parameters', () => {
      const params = {
        mappings: [{ os_username: 'alice' }, { os_username: 'bob' }],
        nested: { foo: 'bar' },
        normal: 'text',
      };

      const sanitized = sanitizeLogParams(params);
      expect(sanitized).toEqual({
        mappings: 'Array(length=2)',
        nested: '[Object]',
        normal: 'text',
      });
    });
  });

  describe('BigQueryService Lifecycle & Singleton', () => {
    it('should resolve project ID from PROJECT_ID', () => {
      process.env.PROJECT_ID = 'test-primary-project';
      delete process.env.GOOGLE_CLOUD_PROJECT;

      const service = BigQueryService.getInstance();
      const client = service.getClient();
      expect(client.projectId).toBe('test-primary-project');
    });

    it('should fallback to GOOGLE_CLOUD_PROJECT when PROJECT_ID is unset', () => {
      delete process.env.PROJECT_ID;
      process.env.GOOGLE_CLOUD_PROJECT = 'test-fallback-project';

      const service = BigQueryService.getInstance();
      const client = service.getClient();
      expect(client.projectId).toBe('test-fallback-project');
    });

    it('should maintain singleton instance in globalThis across multiple getInstance calls', () => {
      process.env.PROJECT_ID = 'singleton-test-project';

      const instance1 = BigQueryService.getInstance();
      const instance2 = BigQueryService.getInstance();

      expect(instance1).toBe(instance2);
      expect(globalThis.__bigQueryServiceInstance).toBe(instance1);
    });

    it('should allow setting a custom instance via setInstance for mocking', () => {
      const mockService = {
        query: vi.fn(),
        getClient: vi.fn(),
      } as any;

      BigQueryService.setInstance(mockService);
      expect(BigQueryService.getInstance()).toBe(mockService);
    });

    it('should throw lazily when initClient is called without PROJECT_ID or GOOGLE_CLOUD_PROJECT', () => {
      delete process.env.PROJECT_ID;
      delete process.env.GOOGLE_CLOUD_PROJECT;

      const service = new BigQueryService();
      expect(() => service.getClient()).toThrow(
        'Missing required environment variable: PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set.'
      );
    });
  });

  describe('BigQueryService.query execution & 3-point logging', () => {
    it('should log entry, success, and return rows', async () => {
      process.env.PROJECT_ID = 'test-log-project';
      const mockClient = {
        query: vi.fn().mockResolvedValue([[{ id: 1 }, { id: 2 }]]),
        projectId: 'test-log-project',
      } as any;

      const service = new BigQueryService(mockClient);
      const debugSpy = vi.spyOn(logger, 'debug');
      const infoSpy = vi.spyOn(logger, 'info');

      const result = await service.query({
        query: 'SELECT * FROM test WHERE email = @email',
        params: { email: 'test@example.com' },
      });

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(debugSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'bigquery_query',
          params: { email: '[REDACTED]' },
        }),
        'Executing BigQuery query'
      );
      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'bigquery_query',
          rowCount: 2,
        }),
        'BigQuery query executed successfully'
      );
    });

    it('should log error and rethrow when query fails', async () => {
      process.env.PROJECT_ID = 'test-log-project';
      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('Permission denied')),
        projectId: 'test-log-project',
      } as any;

      const service = new BigQueryService(mockClient);
      const errorSpy = vi.spyOn(logger, 'error');

      await expect(service.query('SELECT 1')).rejects.toThrow('Permission denied');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'bigquery_query',
          error: 'Permission denied',
        }),
        'BigQuery query execution failed'
      );
    });

    it('should return empty array on build phase without calling client', async () => {
      process.env.PROJECT_ID = 'test-build-project';
      process.env.NEXT_PHASE = 'phase-production-build';

      const mockClient = {
        query: vi.fn(),
        projectId: 'test-build-project',
      } as any;

      const service = new BigQueryService(mockClient);
      const result = await service.query('SELECT 1');

      expect(result).toEqual([]);
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('should return empty array when Table Not Found error occurs', async () => {
      process.env.PROJECT_ID = 'test-notfound-project';
      delete process.env.NEXT_PHASE;

      const mockClient = {
        query: vi.fn().mockRejectedValue(new Error('Not found: Table agy_consumption.usage_summary_daily')),
        projectId: 'test-notfound-project',
      } as any;

      const service = new BigQueryService(mockClient);
      const result = await service.query('SELECT * FROM `agy_consumption.usage_summary_daily`');

      expect(result).toEqual([]);
    });
  });

  describe('bigquery helper functions and error handling', () => {
    let querySpy: any;

    beforeEach(() => {
      querySpy = vi.spyOn(bq, 'query');
    });

    it('should handle getOverviewMetrics success and failure', async () => {
      querySpy.mockResolvedValueOnce([
        { totalRequests: 100, activeUsers: 5, totalTokens: 10000, totalCost: 1.5 },
      ]);

      const metrics = await getOverviewMetrics('2026-07-01', '2026-07-07');
      expect(metrics).toEqual({
        totalRequests: 100,
        activeUsers: 5,
        totalTokens: 10000,
        totalCost: 1.5,
      });

      // Error branch
      querySpy.mockRejectedValueOnce(new Error('Query error'));
      const fallbackMetrics = await getOverviewMetrics();
      expect(fallbackMetrics).toEqual({
        totalRequests: 0,
        activeUsers: 0,
        totalTokens: 0,
        totalCost: 0,
      });
    });

    it('should handle getUsageOverTime success and failure', async () => {
      querySpy.mockResolvedValueOnce([
        { day: '2026-07-01', model: 'gemini-3.5-flash', tokens: 5000, requests: 10, cost: 0.1 },
      ]);

      const usage = await getUsageOverTime('2026-07-01', '2026-07-05', 'alice');
      expect(usage).toEqual([
        { day: '2026-07-01', model: 'gemini-3.5-flash', tokens: 5000, requests: 10, cost: 0.1 },
      ]);

      // Error branch
      querySpy.mockRejectedValueOnce(new Error('Query error'));
      const fallbackUsage = await getUsageOverTime();
      expect(fallbackUsage).toEqual([]);
    });

    it('should handle getTopUsers success and failure', async () => {
      querySpy.mockResolvedValueOnce([
        {
          os_username: 'user1',
          displayName: 'User One',
          email: 'user1@example.com',
          team: 'A-Team',
          requests: 10,
          input_tokens: 100,
          output_tokens: 200,
          tokens: 300,
          cost: 0.3,
        },
      ]);

      const topUsers = await getTopUsers('2026-07-01', '2026-07-05', 1);
      expect(topUsers).toHaveLength(1);
      expect(topUsers[0].os_username).toBe('user1');

      // Error branch
      querySpy.mockRejectedValueOnce(new Error('Query error'));
      const fallbackUsers = await getTopUsers();
      expect(fallbackUsers).toEqual([]);
    });

    it('should handle getUserUsage finding user and not finding user', async () => {
      querySpy.mockResolvedValueOnce([
        {
          os_username: 'user1',
          displayName: 'User One',
          email: 'user1@example.com',
          team: 'A-Team',
          requests: 10,
          input_tokens: 100,
          output_tokens: 200,
          tokens: 300,
          cost: 0.3,
        },
      ]);

      const user = await getUserUsage('user1');
      expect(user?.os_username).toBe('user1');

      querySpy.mockResolvedValueOnce([]);
      const notFound = await getUserUsage('nonexistent');
      expect(notFound).toBeNull();
    });
  });
});
