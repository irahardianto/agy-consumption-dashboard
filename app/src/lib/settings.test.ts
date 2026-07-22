import { describe, it, expect, vi, beforeEach } from 'vitest';
import { replaceUserMappings } from './settings';
import { bq } from './bigquery';

describe('settings service', () => {
  let querySpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    querySpy = vi.spyOn(bq, 'query');
  });

  it('should delete and insert user mappings using DML', async () => {
    querySpy.mockResolvedValue([]);

    const mappings = [
      {
        os_username: 'user1',
        display_name: 'User One',
        email: 'user1@example.com',
        team: 'A-Team',
      },
    ];

    await replaceUserMappings(mappings);

    expect(querySpy).toHaveBeenCalledTimes(2);
    expect(querySpy.mock.calls[0][0]).toContain('DELETE FROM');
    expect(querySpy.mock.calls[1][0].query).toContain('INSERT INTO');
    expect(querySpy.mock.calls[1][0].params).toEqual({ mappings });
  });

  it('should not perform insert if mappings list is empty', async () => {
    querySpy.mockResolvedValue([]);

    await replaceUserMappings([]);

    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(querySpy.mock.calls[0][0]).toContain('DELETE FROM');
  });
});
