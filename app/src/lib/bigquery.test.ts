import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOverviewMetrics, getUsageOverTime, getTopUsers, getUserUsage, bq } from './bigquery';

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
        model: 'gemini-1.5-flash',
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
        model: 'gemini-1.5-flash',
        tokens: 5000,
        requests: 10,
        cost: 0.1,
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
