'use client';

import React, { useState } from 'react';
import { type UserMapping } from '@/lib/settings';
import { saveUserMappingsAction } from '@/app/actions';

interface UserMappingTableProps {
  initialMappings: UserMapping[];
}

export function UserMappingTable({ initialMappings }: UserMappingTableProps) {
  const [mappings, setMappings] = useState<UserMapping[]>(initialMappings);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const itemsPerPage = 10;
  const totalPages = Math.ceil(mappings.length / itemsPerPage);
  const paginatedMappings = mappings.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleAddRow = () => {
    setMappings([...mappings, { os_username: '', display_name: '', email: '', team: '' }]);
    setCurrentPage(Math.ceil((mappings.length + 1) / itemsPerPage));
  };

  const handleDeleteRow = (index: number) => {
    const globalIndex = (currentPage - 1) * itemsPerPage + index;
    const newMappings = [...mappings];
    newMappings.splice(globalIndex, 1);
    setMappings(newMappings);
    
    if (currentPage > Math.ceil(newMappings.length / itemsPerPage) && currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleUpdateRow = (index: number, field: keyof UserMapping, value: string) => {
    const globalIndex = (currentPage - 1) * itemsPerPage + index;
    const newMappings = [...mappings];
    newMappings[globalIndex] = { ...newMappings[globalIndex], [field]: value };
    setMappings(newMappings);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    const result = await saveUserMappingsAction(mappings);
    setIsSaving(false);
    if (!result.success) {
      setError(result.error || 'Failed to save mappings');
    } else {
      alert('Mappings saved successfully');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--table-border, var(--md-sys-color-outline-variant))' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--table-header-bg, var(--md-sys-color-surface-container-low))' }}>
              <th style={{ padding: '12px 16px', fontSize: 'var(--md-sys-typescale-table-header-size, 14px)', fontWeight: 'var(--md-sys-typescale-table-header-weight, 600)', borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))' }}>OS Username</th>
              <th style={{ padding: '12px 16px', fontSize: 'var(--md-sys-typescale-table-header-size, 14px)', fontWeight: 'var(--md-sys-typescale-table-header-weight, 600)', borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))' }}>Display Name</th>
              <th style={{ padding: '12px 16px', fontSize: 'var(--md-sys-typescale-table-header-size, 14px)', fontWeight: 'var(--md-sys-typescale-table-header-weight, 600)', borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))' }}>Email</th>
              <th style={{ padding: '12px 16px', fontSize: 'var(--md-sys-typescale-table-header-size, 14px)', fontWeight: 'var(--md-sys-typescale-table-header-weight, 600)', borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))' }}>Team</th>
              <th style={{ padding: '12px 16px', fontSize: 'var(--md-sys-typescale-table-header-size, 14px)', fontWeight: 'var(--md-sys-typescale-table-header-weight, 600)', borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))', width: '60px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedMappings.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>No mappings defined</td>
              </tr>
            ) : (
              paginatedMappings.map((mapping, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--table-border, var(--md-sys-color-outline-variant))', backgroundColor: 'var(--md-sys-color-surface)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input 
                      type="text" 
                      value={mapping.os_username} 
                      onChange={(e) => handleUpdateRow(idx, 'os_username', e.target.value)} 
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input 
                      type="text" 
                      value={mapping.display_name || ''} 
                      onChange={(e) => handleUpdateRow(idx, 'display_name', e.target.value)} 
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input 
                      type="email" 
                      value={mapping.email || ''} 
                      onChange={(e) => handleUpdateRow(idx, 'email', e.target.value)} 
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <input 
                      type="text" 
                      value={mapping.team || ''} 
                      onChange={(e) => handleUpdateRow(idx, 'team', e.target.value)} 
                      style={{ width: '100%', padding: '8px', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', backgroundColor: 'transparent', color: 'inherit' }}
                    />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button 
                      onClick={() => handleDeleteRow(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--md-sys-color-error)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Delete Row"
                    >
                      <span className="icon">delete</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={handleAddRow} className="button-text" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="icon">add</span> Add Row
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>
            Page {currentPage} of {Math.max(1, totalPages)}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} 
              disabled={currentPage === 1}
              style={{ background: 'none', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', padding: '4px 8px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <span className="icon">chevron_left</span>
            </button>
            <button 
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} 
              disabled={currentPage >= totalPages}
              style={{ background: 'none', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px', padding: '4px 8px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.5 : 1, display: 'flex', alignItems: 'center' }}
            >
              <span className="icon">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button 
          onClick={handleSave} 
          disabled={isSaving}
          className="button-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          {isSaving ? <span className="icon" style={{ animation: 'spin 1s linear infinite' }}>sync</span> : <span className="icon">save</span>}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--md-sys-color-error)', textAlign: 'right', marginTop: '8px', fontSize: '14px' }}>{error}</p>}
    </div>
  );
}
