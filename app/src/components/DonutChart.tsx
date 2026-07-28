'use client';

import React, { useState, useRef } from 'react';

interface DonutChartProps {
  data: { label: string; value: number }[];
}

function formatTokens(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toLocaleString();
}

function formatModelLabel(label: string): string {
  if (!label) return 'Unknown';
  return label.replace(/^publishers\/[^\/]+\/models\//, '').replace(/^models\//, '');
}

export const DonutChart: React.FC<DonutChartProps> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter out zero or negative values
  const validData = data
    .map(d => ({ ...d, label: formatModelLabel(d.label) }))
    .filter(d => d.value > 0);

  const total = validData.reduce((sum, item) => sum + item.value, 0);

  if (!validData || validData.length === 0 || total === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '240px',
          width: '100%',
          padding: '24px',
          textAlign: 'center',
          color: 'var(--md-sys-color-on-surface-variant)',
        }}
      >
        <span className="icon" style={{ fontSize: '48px', marginBottom: '8px', opacity: 0.5 }}>
          donut_large
        </span>
        <p style={{ fontSize: '14px', fontWeight: '500' }}>No model usage data available for this period.</p>
      </div>
    );
  }

  let currentAngle = 0;
  const size = 220;
  const strokeWidth = 26;
  const center = size / 2;
  const baseRadius = (size - strokeWidth - 10) / 2;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const segments = validData.map((item, index) => {
    const angle = total > 0 ? (item.value / total) * 360 : 0;
    const isHovered = hoveredIndex === index;
    const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;

    const circumference = 2 * Math.PI * baseRadius;
    const dashArray = `${(angle / 360) * circumference} ${circumference}`;

    const transform = `rotate(${currentAngle - 90} ${center} ${center})`;
    currentAngle += angle;

    return {
      ...item,
      index,
      dashArray,
      transform,
      isHovered,
      isOtherHovered,
      percentage: ((item.value / total) * 100).toFixed(1),
    };
  });

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
        width: '100%',
        minHeight: '240px',
        padding: '12px',
        position: 'relative',
      }}
    >
      {/* SVG Donut */}
      <div
        style={{
          position: 'relative',
          width: `${size}px`,
          height: `${size}px`,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {segments.map((segment) => (
            <circle
              key={segment.index}
              cx={center}
              cy={center}
              r={baseRadius}
              fill="transparent"
              stroke={`var(--chart-color-${(segment.index % 5) + 1})`}
              strokeWidth={strokeWidth}
              strokeDasharray={segment.dashArray}
              style={{
                transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1.0)',
                transformOrigin: 'center',
                transform: `${segment.transform} ${segment.isHovered ? 'scale(1.05)' : 'scale(1)'}`,
                opacity: segment.isOtherHovered ? 0.35 : 1,
                cursor: 'pointer',
              }}
              onMouseEnter={() => setHoveredIndex(segment.index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>

        {/* Center Total Text */}
        <div
          style={{
            position: 'absolute',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: '18px',
              fontWeight: '700',
              color: 'var(--md-sys-color-on-surface)',
              lineHeight: '1.2',
            }}
          >
            {formatTokens(total)}
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--md-sys-color-on-surface-variant)',
              fontWeight: '500',
              marginTop: '2px',
            }}
          >
            Total Tokens
          </span>
        </div>
      </div>

      {/* Legend & Breakdown List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          flex: '1 1 200px',
          minWidth: '180px',
          maxHeight: '220px',
          overflowY: 'auto',
          paddingRight: '4px',
        }}
      >
        {segments.map((segment) => (
          <div
            key={segment.index}
            onMouseEnter={() => setHoveredIndex(segment.index)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '6px 10px',
              borderRadius: 'var(--md-sys-shape-corner-small)',
              backgroundColor: segment.isHovered
                ? 'var(--md-sys-color-surface-container-high)'
                : 'transparent',
              opacity: segment.isOtherHovered ? 0.4 : 1,
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: `var(--chart-color-${(segment.index % 5) + 1})`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: '500',
                  color: 'var(--md-sys-color-on-surface)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={segment.label}
              >
                {segment.label}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: '600',
                  color: 'var(--md-sys-color-on-surface)',
                }}
              >
                {formatTokens(segment.value)}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: '500',
                  color: 'var(--md-sys-color-on-surface-variant)',
                  minWidth: '38px',
                  textAlign: 'right',
                }}
              >
                {segment.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Tooltip on Hover */}
      {hoveredIndex !== null && validData[hoveredIndex] && (
        <div
          className="glass"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            padding: '8px 12px',
            borderRadius: 'var(--md-sys-shape-corner-small)',
            zIndex: 20,
            left: `${Math.min(mousePos.x + 12, (containerRef.current?.clientWidth || 300) - 160)}px`,
            top: `${Math.max(mousePos.y - 40, 10)}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            boxShadow: 'var(--md-sys-elevation-2)',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--md-sys-color-on-surface)' }}>
            {validData[hoveredIndex].label}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
            {validData[hoveredIndex].value.toLocaleString()} tokens
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '700',
              color: `var(--chart-color-${(hoveredIndex % 5) + 1})`,
            }}
          >
            {total > 0 ? ((validData[hoveredIndex].value / total) * 100).toFixed(1) : '0.0'}%
          </div>
        </div>
      )}
    </div>
  );
};
