import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  CsvUploadZone,
  validateCsvFile,
  MAX_FILE_SIZE_BYTES,
} from './CsvUploadZone';
import * as actions from '@/app/actions';

vi.mock('@/app/actions', () => ({
  uploadUserMappings: vi.fn(),
}));

describe('CsvUploadZone Component & Client-Side Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateCsvFile helper', () => {
    it('returns error when file size is 0', () => {
      const file = new File([''], 'empty.csv', { type: 'text/csv' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Selected file is empty');
      }
    });

    it('returns error when file size exceeds MAX_FILE_SIZE_BYTES (5MB)', () => {
      const largeContent = new Uint8Array(MAX_FILE_SIZE_BYTES + 1024);
      const file = new File([largeContent], 'too_large.csv', { type: 'text/csv' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('File exceeds 5MB limit');
      }
    });

    it('returns error when file extension is not .csv', () => {
      const file = new File(['data'], 'document.pdf', { type: 'application/pdf' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("Invalid file type 'pdf'");
      }
    });

    it('returns error when MIME type is not an allowed CSV MIME type', () => {
      const file = new File(['data'], 'data.csv', { type: 'image/png' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Only .csv files are supported');
      }
    });

    it('returns valid: true for valid CSV with text/csv MIME', () => {
      const file = new File(['os_username\nalice'], 'data.csv', { type: 'text/csv' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(true);
    });

    it('returns valid: true for valid CSV with application/vnd.ms-excel MIME', () => {
      const file = new File(['os_username\nalice'], 'data.csv', {
        type: 'application/vnd.ms-excel',
      });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(true);
    });

    it('returns valid: true for valid CSV with text/plain MIME', () => {
      const file = new File(['os_username\nalice'], 'data.csv', { type: 'text/plain' });
      const result = validateCsvFile(file);

      expect(result.valid).toBe(true);
    });
  });

  describe('CsvUploadZone rendering', () => {
    it('renders initial dropzone with accessibility attributes and prompt', () => {
      const html = renderToString(<CsvUploadZone />);

      expect(html).toContain('role="button"');
      expect(html).toContain('aria-label="Upload user mappings CSV file"');
      expect(html).toContain('Drag and drop CSV here to upload mappings');
      expect(html).toContain('Format: os_username, display_name, email, team (Max 5MB)');
      expect(html).toContain('cloud_upload');
    });
  });
});
