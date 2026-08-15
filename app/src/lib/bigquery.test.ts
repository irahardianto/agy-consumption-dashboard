import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BigQueryService, getOverviewMetrics, getUsageOverTime, getTopUsers, getUserUsage, bq } from './bigquery';
import { BigQuery } from '@google-cloud/bigquery';

describe('BigQueryService project ID resolution and lifecycle', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    (BigQueryService as any).instance = undefined;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    (BigQueryService as any).instance = undefined;
  });

  it('should resolve project ID when PROJECT_ID is set', () => {
    // Arrange
    process.env.PROJECT_ID = 'test-primary-project';
    delete process.env.GOOGLE_CLOUD_PROJECT;

    // Act
    const service = BigQueryService.getInstance();
    const client = service.getClient();

    // Assert
    expect(client.projectId).toBe('test-primary-project');
  });

  it('should fallback to GOOGLE_CLOUD_PROJECT when PROJECT_ID is unset', () => {
    // Arrange
    delete process.env.PROJECT_ID;
    process.env.GOOGLE_CLOUD_PROJECT = 'test-fallback-project';

    // Act
    const service = BigQueryService.getInstance();
    const client = service.getClient();

    // Assert
    expect(client.projectId).toBe('test-fallback-project');
  });

  it('should prioritize PROJECT_ID over GOOGLE_CLOUD_PROJECT when both are provided', () => {
    // Arrange
    process.env.PROJECT_ID = 'primary-proj';
    process.env.GOOGLE_CLOUD_PROJECT = 'fallback-proj';

    // Act
    const service = BigQueryService.getInstance();
    const client = service.getClient();

    // Assert
    expect(client.projectId).toBe('primary-proj');
  });

  it('should throw an explicit error when neither PROJECT_ID nor GOOGLE_CLOUD_PROJECT is set', () => {
    // Arrange
    delete process.env.PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    // Act & Assert
    expect(() => BigQueryService.getInstance()).toThrow(
      'Missing required environment variable: PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set.'
    );
  });

  it('should throw an explicit error when constructor is invoked directly without env vars', () => {
    // Arrange
    delete process.env.PROJECT_ID;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    // Act & Assert
    expect(() => new (BigQueryService as any)()).toThrow(
      'Missing required environment variable: PROJECT_ID or GOOGLE_CLOUD_PROJECT must be set.'
    );
  });

  it('should maintain singleton instance across multiple getInstance() calls', () => {
    // Arrange
    process.env.PROJECT_ID = 'singleton-test-project';

    // Act
    const instance1 = BigQueryService.getInstance();
    const instance2 = BigQueryService.getInstance();

    // Assert
    expect(instance1).toBe(instance2);
  });

  it('should return empty array and skip query execution when NEXT_PHASE is phase-production-build', async () => {
    // Arrange
    process.env.PROJECT_ID = 'build-phase-project';
    process.env.NEXT_PHASE = 'phase-production-build';
    const service = BigQueryService.getInstance();
    const querySpy = vi.spyOn(service.getClient(), 'query');

    // Act
    const result = await service.query('SELECT 1');

    // Assert
    expect(result).toEqual([]);
    expect(querySpy).not.toHaveBeenCalled();
  });

  it('should return empty array when Table Not Found error occurs during query execution', async () => {
    // Arrange
    process.env.PROJECT_ID = 'test-table-not-found';
    delete process.env.NEXT_PHASE;
    const service = BigQueryService.getInstance();
    vi.spyOn(service.getClient(), 'query').mockRejectedValueOnce(new Error('Not found: Table agy_consumption.usage_summary_daily'));

    // Act
    const result = await service.query('SELECT * FROM `agy_consumption.usage_summary_daily`');

    // Assert
    expect(result).toEqual([]);
  });

  it('should rethrow general query execution errors', async () => {
    // Arrange
    process.env.PROJECT_ID = 'test-error-handling';
    delete process.env.NEXT_PHASE;
    const service = BigQueryService.getInstance();
    vi.spyOn(service.getClient(), 'query').mockRejectedValueOnce(new Error('Access Denied: User does not have bigquery.jobs.create'));

    // Act & Assert
    await expect(service.query('SELECT 1')).rejects.toThrow('Access Denied: User does not have bigquery.jobs.create');
  });
});

describe('bigquery service helpers', () => {
  let querySpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    querySpy = vi.spyOn(bq, 'query');
  });

  it('should pass correct date parameters to getOverviewMetrics', async () => {
    // Arrange
    const mockOverview = [
      {
        totalRequests: 100,
        activeUsers: 5,
        totalTokens: 10000,
        totalCost: 1.5,
      }
    ];
    querySpy.mockResolvedValueOnce(mockOverview);

    const startDate = new Date('2026-07-01');
    const endDate = new Date('2026-07-07');

    // Act
    const metrics = await getOverviewMetrics(startDate, endDate);

    // Assert
    expect(querySpy).toHaveBeenCalledTimes(1);
    const callArgs = querySpy.mock.calls[0][0];
    expect(callArgs.params).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-07',
    });
    expect(metrics).toEqual({
      totalRequests: 100,
      activeUsers: 5,
      totalTokens: 10000,
      totalCost: 1.5,
    });
  });

  it('should pass correct date and username parameters to getUsageOverTime', async () => {
    // Arrange
    const mockData = [
      {
        day: '2026-07-01',
        model: 'gemini-3.5-flash',
        tokens: 5000,
        requests: 10,
        cost: 0.1,
      }
    ];
    querySpy.mockResolvedValueOnce(mockData);

    const startDate = '2026-07-01';
    const endDate = '2026-07-05';
    const username = 'test-user';

    // Act
    const result = await getUsageOverTime(startDate, endDate, username);

    // Assert
    expect(querySpy).toHaveBeenCalledTimes(1);
    const callArgs = querySpy.mock.calls[0][0];
    expect(callArgs.params).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      username: 'test-user',
    });
    expect(result).toEqual([
      {
        day: '2026-07-01',
        model: 'gemini-3.5-flash',
        tokens: 5000,
        requests: 10,
        cost: 0.1,
      }
    ]);
  });

  it('should omit username from params when not provided in getUsageOverTime and handle BigQueryDate objects', async () => {
    // Arrange
    const mockData = [
      {
        day: { value: '2026-07-01' },
        model: 'gemini-3.5-flash',
        tokens: 15000,
        requests: 20,
        cost: 0.2,
      }
    ];
    querySpy.mockResolvedValueOnce(mockData);

    // Act
    const result = await getUsageOverTime('2026-07-01', '2026-07-05');

    // Assert
    expect(querySpy).toHaveBeenCalledTimes(1);
    const callArgs = querySpy.mock.calls[0][0];
    expect(callArgs.params).toEqual({
      startDate: '2026-07-01',
      endDate: '2026-07-05',
    });
    expect(result).toEqual([
      {
        day: '2026-07-01',
        model: 'gemini-3.5-flash',
        tokens: 15000,
        requests: 20,
        cost: 0.2,
      }
    ]);
  });

  it('should perform proportional redistribution in getTopUsers', async () => {
    // Arrange
    const mockUsers = [
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
      {
        os_username: '__unattributed__',
        displayName: 'Unattributed',
        email: null,
        team: null,
        requests: 10,
        input_tokens: 100,
        output_tokens: 200,
        tokens: 300,
        cost: 0.3,
      }
    ];
    querySpy.mockResolvedValueOnce(mockUsers);

    // Act
    const result = await getTopUsers('2026-07-01', '2026-07-05', 5);

    // Assert
    expect(querySpy).toHaveBeenCalledTimes(1);
    const callArgs = querySpy.mock.calls[0][0];
    expect(callArgs.params.limit).toBe(1000000); // gets all to redistribute
    
    // user1 has 100% of attributed usage, so should receive all of unattributed usage
    expect(result.length).toBe(1);
    expect(result[0]).toEqual({
      os_username: 'user1',
      displayName: 'User One',
      email: 'user1@example.com',
      team: 'A-Team',
      requests: 20,
      input_tokens: 200,
      output_tokens: 400,
      tokens: 600,
      cost: 0.6,
    });
  });

  it('should return specific user usage after redistribution in getUserUsage', async () => {
    // Arrange
    const mockUsers = [
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
      {
        os_username: 'user2',
        displayName: 'User Two',
        email: 'user2@example.com',
        team: 'B-Team',
        requests: 10,
        input_tokens: 100,
        output_tokens: 200,
        tokens: 300,
        cost: 0.3,
      }
    ];
    querySpy.mockResolvedValueOnce(mockUsers);

    // Act
    const user = await getUserUsage('user2', '2026-07-01', '2026-07-05');

    // Assert
    expect(user).toEqual({
      os_username: 'user2',
      displayName: 'User Two',
      email: 'user2@example.com',
      team: 'B-Team',
      requests: 10,
      input_tokens: 100,
      output_tokens: 200,
      tokens: 300,
      cost: 0.3,
    });
  });

  it('should return null if user is not found in getUserUsage', async () => {
    // Arrange
    querySpy.mockResolvedValueOnce([]);

    // Act
    const user = await getUserUsage('unknown', '2026-07-01', '2026-07-05');

    // Assert
    expect(user).toBeNull();
  });
});
