import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (init: any) => [init, vi.fn()],
    useMemo: (factory: any) => factory(),
  };
});
import { SortableUsersTable } from './SortableUsersTable';

const replacer = () => {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return;
      seen.add(value);
    }
    return value;
  };
};

describe('SortableUsersTable Edge Cases', () => {
  it('renders empty data state without crashing', () => {
    const result = SortableUsersTable({ data: [] });
    expect(result).toBeDefined();
    // The component should render the "No users found" message when data is empty
    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('No users found for this period');
  });

  it('renders correctly with multiple items', () => {
    const data = [
      { 
        os_username: 'user1', 
        displayName: 'User One', 
        email: 'user1@test.com',
        team: 'engineering',
        requests: 10, 
        input_tokens: 50,
        output_tokens: 30,
        thinking_tokens: 20,
        tokens: 100, 
        cost: 1.5,
        last_active: '2026-07-22',
        sparkline: [10, 20, 30]
      },
      { 
        os_username: 'user2', 
        displayName: 'User Two', 
        email: null,
        team: null,
        requests: 5, 
        input_tokens: 20,
        output_tokens: 20,
        thinking_tokens: 10,
        tokens: 50, 
        cost: 0.5,
        last_active: '2026-07-21',
        sparkline: [5, 15, 25]
      }
    ];
    const result = SortableUsersTable({ data });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result, replacer());
    expect(jsonStr).toContain('User One');
    expect(jsonStr).toContain('user2');
  });
});
