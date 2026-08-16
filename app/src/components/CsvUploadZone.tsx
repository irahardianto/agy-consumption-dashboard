'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { uploadUserMappings } from '@/app/actions';

export interface FeedbackStatus {
  type: 'success' | 'error';
  title: string;
  message: string;
  count?: number;
}

export interface CsvUploadZoneProps {
  onUploadSuccess?: (count: number) => void;
  onUploadError?: (error: string) => void;
}

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_CSV_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
];

export function validateCsvFile(file: File): { valid: true } | { valid: false; error: string; title: string } {
  if (file.size === 0) {
    return {
      valid: false,
      title: 'Validation Error',
      error: 'Selected file is empty (0 bytes). Please upload a valid CSV with header and data rows.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      title: 'Validation Error',
      error: `File exceeds 5MB limit (size: ${sizeMb} MB). Please select a smaller CSV file.`,
    };
  }

  const fileName = file.name || '';
  const isCsvExt = fileName.toLowerCase().endsWith('.csv');
  const mimeType = file.type ? file.type.toLowerCase() : '';
  const isValidMime = !mimeType || ALLOWED_CSV_MIME_TYPES.includes(mimeType);

  if (!isCsvExt || !isValidMime) {
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'unknown';
    return {
      valid: false,
      title: 'Validation Error',
      error: `Invalid file type '${ext}'. Only .csv files are supported.`,
    };
  }

  return { valid: true };
}

export function CsvUploadZone({ onUploadSuccess, onUploadError }: CsvUploadZoneProps = {}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingTime, setRemainingTime] = useState(5000);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerStartRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startAutoDismiss = useCallback((duration: number = 5000) => {
    clearTimer();
    timerStartRef.current = Date.now();
    setRemainingTime(duration);
    timerRef.current = setTimeout(() => {
      setStatus(null);
    }, duration);
  }, [clearTimer]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  const triggerShake = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 300);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovered(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovered(false);
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      clearTimer();
      setStatus(null);

      // Client-side pre-validation
      const validation = validateCsvFile(file);
      if (!validation.valid) {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setStatus({
          type: 'error',
          title: validation.title,
          message: validation.error,
        });
        triggerShake();
        onUploadError?.(validation.error);
        return;
      }

      setIsUploading(true);

      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadUserMappings(formData);

      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (result.success) {
        const count = result.count ?? result.data?.count ?? 0;
        setStatus({
          type: 'success',
          title: 'Upload Successful',
          message: `Successfully uploaded ${count} user mappings.`,
          count,
        });
        startAutoDismiss(5000);
        onUploadSuccess?.(count);
      } else {
        const errorMessage = result.error || 'Failed to upload CSV';
        setStatus({
          type: 'error',
          title: 'Upload Failed',
          message: errorMessage,
        });
        triggerShake();
        onUploadError?.(errorMessage);
      }
    },
    [clearTimer, triggerShake, startAutoDismiss, onUploadError, onUploadSuccess]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsHovered(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await processFile(files[0]);
      }
    },
    [processFile]
  );

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && status) {
      e.stopPropagation();
      clearTimer();
      setStatus(null);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const handleBannerMouseEnter = () => {
    if (status?.type === 'success' && timerRef.current) {
      clearTimer();
      const elapsed = Date.now() - timerStartRef.current;
      setRemainingTime((prev) => Math.max(0, prev - elapsed));
      setIsPaused(true);
    }
  };

  const handleBannerMouseLeave = () => {
    if (status?.type === 'success' && isPaused) {
      setIsPaused(false);
      startAutoDismiss(remainingTime > 0 ? remainingTime : 5000);
    }
  };

  return (
    <div onKeyDown={handleKeyDown} style={{ position: 'relative' }}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload user mappings CSV file"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${
            status?.type === 'error' && isShaking
              ? 'var(--feedback-error-icon, #d32f2f)'
              : isHovered
              ? 'var(--md-sys-color-primary)'
              : 'var(--upload-zone-border, var(--md-sys-color-outline-variant))'
          }`,
          borderRadius: 'var(--md-sys-shape-corner-medium, 12px)',
          padding: '40px 24px',
          backgroundColor: isUploading
            ? 'var(--upload-zone-bg-active, var(--md-sys-color-surface-container))'
            : isHovered
            ? 'var(--upload-zone-bg-hover, var(--md-sys-color-surface-container-lowest))'
            : status?.type === 'error' && isShaking
            ? 'var(--feedback-error-bg, #fdecea)'
            : 'var(--upload-zone-bg, var(--md-sys-color-surface))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isUploading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
          position: 'relative',
          overflow: 'hidden',
          animation: isShaking ? 'dropzoneErrorShake 300ms ease-in-out' : undefined,
          outline: 'none',
        }}
        className={isHovered ? 'dropzone-pulse' : ''}
      >
        <span
          className="icon"
          style={{
            fontSize: '48px',
            color: isHovered ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)',
            marginBottom: '16px',
          }}
        >
          cloud_upload
        </span>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', margin: 0, fontWeight: 500 }}>
          {isUploading ? 'Uploading and validating CSV...' : 'Drag and drop CSV here to upload mappings'}
        </p>
        <span style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '8px' }}>
          Format: os_username, display_name, email, team (Max 5MB)
        </span>
        <input
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleChange}
          disabled={isUploading}
        />
        {isUploading && (
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '4px',
              backgroundColor: 'var(--md-sys-color-primary)',
              animation: 'indeterminate-progress 1.5s infinite linear',
              width: '50%',
            }}
          />
        )}
      </div>

      {status && (
        <div
          role={status.type === 'success' ? 'status' : 'alert'}
          aria-live={status.type === 'success' ? 'polite' : 'assertive'}
          aria-atomic="true"
          onMouseEnter={handleBannerMouseEnter}
          onMouseLeave={handleBannerMouseLeave}
          onFocus={handleBannerMouseEnter}
          onBlur={handleBannerMouseLeave}
          style={{
            marginTop: '12px',
            padding: '14px 16px',
            backgroundColor:
              status.type === 'success'
                ? 'var(--feedback-success-bg, #e8f5e9)'
                : 'var(--feedback-error-bg, #fdecea)',
            border: `1px solid ${
              status.type === 'success'
                ? 'var(--feedback-success-border, #a5d6a7)'
                : 'var(--feedback-error-border, #f5c6cb)'
            }`,
            borderRadius: 'var(--radius-sm, 8px)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            position: 'relative',
            animation: 'feedbackSlideIn 200ms cubic-bezier(0.2, 0.8, 0.2, 1.0) forwards',
          }}
        >
          <span
            className="icon"
            style={{
              fontSize: '20px',
              color:
                status.type === 'success'
                  ? 'var(--feedback-success-icon, #2e7d32)'
                  : 'var(--feedback-error-icon, #d32f2f)',
              flexShrink: 0,
              marginTop: '1px',
            }}
          >
            {status.type === 'success' ? 'check_circle' : 'error'}
          </span>

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color:
                  status.type === 'success'
                    ? 'var(--feedback-success-text, #1b5e20)'
                    : 'var(--feedback-error-text, #b3261e)',
              }}
            >
              {status.title}
            </div>
            <div
              style={{
                fontSize: '13px',
                fontWeight: 400,
                color:
                  status.type === 'success'
                    ? 'var(--feedback-success-text, #1b5e20)'
                    : 'var(--feedback-error-text, #b3261e)',
                marginTop: '2px',
              }}
            >
              {status.message}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearTimer();
              setStatus(null);
            }}
            aria-label="Dismiss feedback message"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color:
                status.type === 'success'
                  ? 'var(--feedback-success-text, #1b5e20)'
                  : 'var(--feedback-error-text, #b3261e)',
              opacity: 0.7,
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="icon" style={{ fontSize: '18px' }}>
              close
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
