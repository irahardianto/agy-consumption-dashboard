'use client';

import React, { useState, useRef } from 'react';

interface DonutChartProps {
  data: { label: string; value: number }[];
}

export const DonutChart: React.FC<DonutChartProps> = ({ data }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  let currentAngle = 0;

  const size = 280;
  const strokeWidth = 30;
  const center = size / 2;
  const baseRadius = (size - strokeWidth - 10) / 2; // leave room for scale expansion

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const segments = data.map((item, index) => {
    const angle = total > 0 ? (item.value / total) * 360 : 0;
    const isHovered = hoveredIndex === index;
    const isOtherHovered = hoveredIndex !== null && hoveredIndex !== index;
    
    const circumference = 2 * Math.PI * baseRadius;
    const dashArray = `${(angle / 360) * circumference} ${circumference}`;
    
    // Rotate to start at current angle (SVG rotates starting from 3 o'clock, so adjust by -90deg)
    const transform = `rotate(${currentAngle - 90} ${center} ${center})`;
    
    currentAngle += angle;

    return {
      ...item,
      index,
      dashArray,
      transform,
      isHovered,
      isOtherHovered,
    };
  });

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '280px', 
        height: '280px', 
        position: 'relative' 
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
              opacity: segment.isOtherHovered ? 0.4 : 1,
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHoveredIndex(segment.index)}
            onMouseLeave={() => setHoveredIndex(null)}
          />
        ))}
      </svg>
      {hoveredIndex !== null && data[hoveredIndex] && (
        <div 
          className="glass"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            padding: '8px 12px',
            borderRadius: 'var(--md-sys-shape-corner-small)',
            zIndex: 10,
            left: `${mousePos.x + 12}px`,
            top: `${mousePos.y + 12}px`,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: 'var(--md-sys-elevation-2)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--md-sys-color-on-surface)' }}>
            {data[hoveredIndex].label}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--md-sys-color-on-surface-variant)' }}>
            {data[hoveredIndex].value.toLocaleString()} tokens
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: `var(--chart-color-${(hoveredIndex % 5) + 1})` }}>
            {total > 0 ? ((data[hoveredIndex].value / total) * 100).toFixed(1) : '0.0'}%
          </div>
        </div>
      )}
    </div>
  );
};
