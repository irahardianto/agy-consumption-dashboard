import { describe, it, expect } from 'vitest';
import { UserSessionBreakdown, type SessionData } from './UserSessionBreakdown';

describe('UserSessionBreakdown component', () => {
  it('renders empty state message when sessions array is empty', () => {
    const result = UserSessionBreakdown({ sessions: [] });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('No session data found for this period.');
  });

  it('renders table with sessions properly', () => {
    const mockSessions: SessionData[] = [
      {
        trajectory_id: 'session-xyz-123',
        request_count: 8,
        input_tokens: 12000,
        output_tokens: 4000,
        thinking_tokens: 1000,
        total_tokens: 17000,
        models: ['publishers/google/models/gemini-3.5-flash'],
        last_active: '2026-08-15T09:00:00.000Z',
      }
    ];

    const result = UserSessionBreakdown({ sessions: mockSessions });
    expect(result).toBeDefined();
    const str = JSON.stringify(result);
    expect(str).toContain('session-xyz-123');
    expect(str).toContain('gemini-3.5-flash');
    expect(str).toContain('8');
    expect(str).toContain('17,000');
  });
});
