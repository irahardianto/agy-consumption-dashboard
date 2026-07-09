import React from 'react';

export interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
}

export function DataTable<T>({ data, columns }: DataTableProps<T>) {
  return (
    <div style={{ 
      width: '100%', 
      overflowX: 'auto',
      borderRadius: 'var(--md-sys-shape-corner-medium)',
      border: '1px solid var(--md-sys-color-outline-variant)'
    }}>
      <table style={{ 
        width: '100%', 
        borderCollapse: 'collapse',
        textAlign: 'left'
      }}>
        <thead>
          <tr style={{ 
            backgroundColor: 'var(--md-sys-color-surface-container-high)',
            borderBottom: '1px solid var(--md-sys-color-outline-variant)'
          }}>
            {columns.map((column, i) => (
              <th key={i} style={{ 
                padding: '16px',
                fontSize: 'var(--md-sys-typescale-label-medium-size)',
                fontWeight: '600',
                color: 'var(--md-sys-color-on-surface-variant)',
                textAlign: column.align || 'left'
              }}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, rowIndex) => (
            <tr 
              key={rowIndex} 
              className="table-row"
              style={{ 
                borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                transition: 'background-color 0.1s ease'
              }}
            >
              {columns.map((column, colIndex) => {
                const content = typeof column.accessor === 'function' 
                  ? column.accessor(item) 
                  : (item[column.accessor] as React.ReactNode);
                
                return (
                  <td key={colIndex} style={{ 
                    padding: '16px',
                    fontSize: '14px',
                    textAlign: column.align || 'left',
                    color: 'var(--md-sys-color-on-surface)'
                  }}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
