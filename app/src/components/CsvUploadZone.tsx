'use client';

import React, { useState, useRef, useCallback } from 'react';
import { uploadUserMappings } from '@/app/actions';

export function CsvUploadZone() {
  const [isHovered, setIsHovered] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovered(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsHovered(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsHovered(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await uploadFile(files[0]);
    }
  }, []);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadFile(files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setError(null);
    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('file', file);
    
    const result = await uploadUserMappings(formData);
    
    setIsUploading(false);
    
    if (result.success) {
      alert(`Successfully uploaded ${result.count} mappings.`);
    } else {
      setError(result.error || 'Failed to upload CSV');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      <div 
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isHovered ? 'var(--md-sys-color-primary)' : 'var(--upload-zone-border, var(--md-sys-color-outline-variant))'}`,
          borderRadius: 'var(--md-sys-shape-corner-medium, 12px)',
          padding: '40px 24px',
          backgroundColor: isUploading 
            ? 'var(--upload-zone-bg-active, var(--md-sys-color-surface-container))' 
            : isHovered 
              ? 'var(--upload-zone-bg-hover, var(--md-sys-color-surface-container-lowest))' 
              : 'var(--upload-zone-bg, var(--md-sys-color-surface))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
          position: 'relative',
          overflow: 'hidden'
        }}
        className={isHovered ? 'dropzone-pulse' : ''}
      >
        <span className="icon" style={{ fontSize: '48px', color: isHovered ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)', marginBottom: '16px' }}>
          cloud_upload
        </span>
        <p style={{ color: 'var(--md-sys-color-on-surface-variant)', margin: 0 }}>
          {isUploading ? 'Uploading...' : 'Drag and drop CSV here to upload mappings'}
        </p>
        <span style={{ fontSize: '12px', color: 'var(--md-sys-color-outline)', marginTop: '8px' }}>
          Format: os_username, display_name, email, team
        </span>
        <input 
          type="file" 
          accept=".csv" 
          style={{ display: 'none' }} 
          ref={fileInputRef}
          onChange={handleChange}
        />
        {isUploading && (
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '4px',
            backgroundColor: 'var(--md-sys-color-primary)',
            animation: 'indeterminate-progress 1.5s infinite linear',
            width: '50%'
          }} />
        )}
      </div>
      {error && <p style={{ color: 'var(--md-sys-color-error)', marginTop: '8px', fontSize: '14px' }}>{error}</p>}
    </div>
  );
}
