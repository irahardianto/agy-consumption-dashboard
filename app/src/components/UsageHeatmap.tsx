'use client';

import React, { useState, useRef } from 'react';

interface UsageHeatmapProps {
  startDate: string;
  endDate: string;
  data: { day: string; tokens: number }[];
}

export function UsageHeatmap({ startDate, endDate, data }: UsageHeatmapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Generate sequence of days between startDate and endDate
  const days: { dateStr: string; value: number }[] = [];
  const startObj = new Date(`${startDate}T00:00:00`);
  const endObj = new Date(`${endDate}T00:00:00`);

  const current = new Date(startObj);
  while (current <= endObj) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    // Sum tokens for this day
    const dayData = data.filter(d => d.day === dateStr);
    const value = dayData.reduce((sum, d) => sum + d.tokens, 0);

    days.push({
      dateStr,
      value,
    });

    current.setDate(current.getDate() + 1);
  }

  const maxTokens = Math.max(...days.map(d => d.value), 0);
  const firstDayOfWeek = startObj.getDay(); // 0 is Sunday, 1 is Monday...

  const getHeatmapColor = (value: number) => {
    if (value === 0) return 'var(--heatmap-empty)';
    if (maxTokens === 0) return 'var(--heatmap-empty)';

    const pct = value / maxTokens;
    if (pct <= 0.25) return 'var(--heatmap-low)';
    if (pct <= 0.5) return 'var(--heatmap-med)';
    if (pct <= 0.75) return 'var(--heatmap-high)';
    return 'var(--heatmap-max)';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* Weekday Labels column */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: 'repeat(7, 12px)',
            gap: '4px',
            fontSize: '9px',
            color: 'var(--md-sys-color-on-surface-variant)',
            paddingTop: '16px', // Align with grid padding
            textAlign: 'right',
            width: '24px',
            userSelect: 'none',
          }}
        >
          <div></div>
          <div>Mon</div>
          <div></div>
          <div>Wed</div>
          <div></div>
          <div>Fri</div>
          <div></div>
        </div>

        {/* Heatmap scrollable wrapper */}
        <div style={{ flex: 1, overflowX: 'auto', paddingBottom: '4px' }}>
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 12px)',
              gridAutoFlow: 'column',
              gap: '4px',
              padding: '16px',
              width: 'max-content',
              backgroundColor: 'var(--md-sys-color-surface-container-low)',
              borderRadius: 'var(--md-sys-shape-corner-medium)',
              border: '1px solid var(--md-sys-color-outline-variant)',
              position: 'relative',
            }}
          >
            {/* Week start offset placeholders */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} style={{ width: '12px', height: '12px' }} />
            ))}

            {/* Render daily cells */}
            {days.map((day, index) => {
              const color = getHeatmapColor(day.value);
              const isHovered = hoveredIndex === index;
              return (
                <div
                  key={day.dateStr}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '4px',
                    backgroundColor: color,
                    cursor: 'pointer',
                    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                    transform: isHovered ? 'scale(1.2)' : 'scale(1)',
                    zIndex: isHovered ? 2 : 1,
                    boxShadow: isHovered ? 'var(--md-sys-elevation-1)' : 'none',
                  }}
                  id={`heatmap-cell-${day.dateStr}`}
                />
              );
            })}

            {/* Hover Tooltip */}
            {hoveredIndex !== null && days[hoveredIndex] && (
              <div
                className="glass"
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  padding: '6px 10px',
                  borderRadius: 'var(--md-sys-shape-corner-extra-small, 4px)',
                  zIndex: 100,
                  left: `${mousePos.x + 12}px`,
                  top: `${mousePos.y + 12}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                  boxShadow: 'var(--md-sys-elevation-2)',
                  whiteSpace: 'nowrap',
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--md-sys-color-on-surface)' }}>
                  {new Date(`${days[hoveredIndex].dateStr}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--md-sys-color-primary)', fontWeight: '600' }}>
                  {days[hoveredIndex].value.toLocaleString()} tokens
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Heatmap Legend */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--md-sys-color-on-surface-variant)', paddingRight: '16px' }}>
        <span>Less</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--heatmap-empty)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--heatmap-low)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--heatmap-med)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--heatmap-high)' }} />
          <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--heatmap-max)' }} />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
