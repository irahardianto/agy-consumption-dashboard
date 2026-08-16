import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserSessions, getUsersWithDetails } from './db';
import { bq } from '@/lib/bigquery';

describe('db application queries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getUserSessions', () => {
    it('should format rows and parse last_active dates correctly', async () => {
      const mockRows = [
        {
          trajectory_id: 'traj-123',
          request_count: 5,
          input_tokens: 1000,
          output_tokens: 2000,
          thinking_tokens: 500,
          total_tokens: 3500,
          cost: 0.05,
          models: ['gemini-3.5-flash'],
          last_active: '2026-08-15T08:00:00.000Z',
        },
        {
          trajectory_id: 'traj-456',
          request_count: 2,
          input_tokens: 500,
          output_tokens: 800,
          thinking_tokens: 0,
          total_tokens: 1300,
          cost: 0.02,
          models: ['gemini-3.1-pro-preview'],
          last_active: { value: '2026-08-14T12:00:00.000Z' },
        },
        {
          trajectory_id: '',
          request_count: 0,
          input_tokens: 0,
          output_tokens: 0,
          thinking_tokens: 0,
          total_tokens: 0,
          cost: 0,
          models: null,
          last_active: null,
        },
      ];

      vi.spyOn(bq, 'query').mockResolvedValueOnce(mockRows);

      const result = await getUserSessions('testuser', '2026-08-01', '2026-08-15');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        trajectory_id: 'traj-123',
        request_count: 5,
        input_tokens: 1000,
        output_tokens: 2000,
        thinking_tokens: 500,
        total_tokens: 3500,
        cost: 0.05,
        models: ['gemini-3.5-flash'],
        last_active: '2026-08-15T08:00:00.000Z',
      });
      expect(result[1].last_active).toBe('2026-08-14T12:00:00.000Z');
      expect(result[2].last_active).toBe('');
      expect(result[2].models).toEqual([]);
    });

    it('should return empty array on query error', async () => {
      vi.spyOn(bq, 'query').mockRejectedValueOnce(new Error('BigQuery connection error'));

      const result = await getUserSessions('testuser', '2026-08-01', '2026-08-15');
      expect(result).toEqual([]);
    });
  });

  describe('getUsersWithDetails', () => {
    it('should combine user rows and construct sparkline date arrays', async () => {
      const mockUserRows = [
        {
          os_username: 'alice',
          displayName: 'Alice Smith',
          email: 'alice@example.com',
          team: 'Engineering',
          requests: 20,
          input_tokens: 10000,
          output_tokens: 15000,
          thinking_tokens: 2000,
          tokens: 27000,
          cost: 0.15,
          last_active: '2026-08-02',
        },
        {
          os_username: 'bob',
          displayName: null,
          email: null,
          team: null,
          requests: 5,
          input_tokens: 1000,
          output_tokens: 2000,
          thinking_tokens: 0,
          tokens: 3000,
          cost: 0.02,
          last_active: null,
        },
      ];

      const mockSparklineRows = [
        { os_username: 'alice', day: '2026-08-01', tokens: 10000 },
        { os_username: 'alice', day: '2026-08-02', tokens: 17000 },
      ];

      const querySpy = vi.spyOn(bq, 'query')
        .mockResolvedValueOnce(mockUserRows)
        .mockResolvedValueOnce(mockSparklineRows);

      const result = await getUsersWithDetails('2026-08-01', '2026-08-03');

      expect(querySpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        os_username: 'alice',
        displayName: 'Alice Smith',
        email: 'alice@example.com',
        team: 'Engineering',
        requests: 20,
        input_tokens: 10000,
        output_tokens: 15000,
        thinking_tokens: 2000,
        tokens: 27000,
        cost: 0.15,
        last_active: '2026-08-02',
        sparkline: [10000, 17000, 0], // 2026-08-01, 2026-08-02, 2026-08-03
      });
      expect(result[1]).toEqual({
        os_username: 'bob',
        displayName: 'bob',
        email: null,
        team: null,
        requests: 5,
        input_tokens: 1000,
        output_tokens: 2000,
        thinking_tokens: 0,
        tokens: 3000,
        cost: 0.02,
        last_active: null,
        sparkline: [0, 0, 0],
      });
    });

    it('should return empty array on query failure', async () => {
      vi.spyOn(bq, 'query').mockRejectedValueOnce(new Error('BigQuery error'));

      const result = await getUsersWithDetails('2026-08-01', '2026-08-03');
      expect(result).toEqual([]);
    });
  });
});
