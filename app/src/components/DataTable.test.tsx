import { describe, it, expect } from 'vitest';
import { DataTable, Column } from './DataTable';

describe('DataTable Edge Cases', () => {
  it('renders empty data state without crashing', () => {
    const columns: Column<any>[] = [
      { header: 'Test', accessor: 'test' }
    ];
    const result = DataTable({ data: [], columns });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Test'); // Header should render
  });

  it('renders pagination bounds properly if implemented or handles standard data sizes', () => {
    const columns: Column<any>[] = [
      { header: 'Name', accessor: 'name' }
    ];
    const data = new Array(50).fill(null).map((_, i) => ({ name: `Name ${i}` }));
    const result = DataTable({ data, columns });
    expect(result).toBeDefined();
    const jsonStr = JSON.stringify(result);
    expect(jsonStr).toContain('Name 49');
  });
});
