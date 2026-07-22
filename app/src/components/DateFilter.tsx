'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { buildRangeLabel } from '@/lib/dateUtils';
import styles from './DateFilter.module.css';

// ─── Preset configuration ──────────────────────────────────────────────────

type Preset = {
  key: string;
  label: string;
};

const PRESETS: readonly Preset[] = [
  { key: 'today', label: 'Today' },
  { key: '3days', label: 'Last 3 Days' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'custom', label: 'Custom Range' },
] as const;

interface DateFilterProps {
  defaultPreset?: string | undefined;
}

function DateFilterInner({ defaultPreset }: DateFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentPreset = searchParams.get('preset') ?? defaultPreset ?? '3days';
  const currentStartDate = searchParams.get('startDate') ?? undefined;
  const currentEndDate = searchParams.get('endDate') ?? undefined;

  const [isOpen, setIsOpen] = useState(false);

  // Local state for custom date inputs (only committed on Apply)
  const [customStart, setCustomStart] = useState(currentStartDate ?? '');
  const [customEnd, setCustomEnd] = useState(currentEndDate ?? '');

  // Sync local custom inputs when URL params change from outside
  useEffect(() => {
    setCustomStart(currentStartDate ?? '');
    setCustomEnd(currentEndDate ?? '');
  }, [currentStartDate, currentEndDate]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const navigateTo = useCallback(
    (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      startTransition(() => {
        router.push(`?${qs}`);
      });
      setIsOpen(false);
    },
    [router]
  );

  const handlePresetClick = (preset: string) => {
    if (preset === 'custom') {
      // Don't navigate yet — just show the custom section
      startTransition(() => {
        router.push(`?preset=custom`);
      });
      return;
    }
    navigateTo({ preset });
  };

  const handleApply = () => {
    if (!customStart || !customEnd) return;
    navigateTo({ preset: 'custom', startDate: customStart, endDate: customEnd });
  };

  const handleCancel = () => {
    setIsOpen(false);
    // Reset local inputs to what is currently in the URL
    setCustomStart(currentStartDate ?? '');
    setCustomEnd(currentEndDate ?? '');
  };

  const isCustomActive = currentPreset === 'custom';
  const rangeLabel = buildRangeLabel(currentPreset, currentStartDate, currentEndDate);
  const canApply = Boolean(customStart && customEnd && customStart <= customEnd);

  return (
    <div className={styles.filterContainer} ref={containerRef}>
      {/* ── Trigger button ── */}
      <button
        type="button"
        id="date-filter-trigger"
        className={[
          styles.trigger,
          isOpen ? styles.triggerActive : '',
          isPending ? styles.pending : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="date-filter-picker"
        onClick={() => setIsOpen((v) => !v)}
      >
        <span className={`icon ${styles.calendarIcon}`} aria-hidden="true">
          calendar_month
        </span>
        <span>{rangeLabel}</span>
        <span className={`icon ${styles.chevron}`} aria-hidden="true">
          expand_more
        </span>
      </button>

      {/* ── Popover ── */}
      {isOpen && (
        <div
          id="date-filter-picker"
          role="dialog"
          aria-label="Date filter"
          className={[
            styles.popover,
            isCustomActive ? styles.popoverWide : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* Preset list */}
          <ul className={styles.presetList} role="listbox" aria-label="Quick presets">
            {PRESETS.map((preset) => {
              const isActive = currentPreset === preset.key;
              return (
                <li key={preset.key} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    className={[
                      styles.presetButton,
                      isActive ? styles.presetButtonActive : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handlePresetClick(preset.key)}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Custom date inputs — only visible when 'custom' is active */}
          {isCustomActive && (
            <div className={styles.customSection} aria-live="polite">
              <p className={styles.customSectionTitle}>Custom Range</p>

              <div className={styles.dateInputGroup}>
                <label className={styles.dateInputLabel}>
                  Start Date
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={customStart}
                    max={customEnd || undefined}
                    aria-label="Start date"
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </label>

                <label className={styles.dateInputLabel}>
                  End Date
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={customEnd}
                    min={customStart || undefined}
                    aria-label="End date"
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </label>
              </div>

              <div className={styles.customActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={styles.applyButton}
                  disabled={!canApply}
                  onClick={handleApply}
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Public export wrapped in Suspense ────────────────────────────────────

/**
 * DateFilter — URL-driven date range selector.
 *
 * Reads/writes `?preset=` and `?startDate=` / `?endDate=` search params.
 * Must be used inside a Next.js App Router layout that supports Suspense.
 */
export function DateFilter({ defaultPreset }: DateFilterProps) {
  return (
    <Suspense fallback={<div className={styles.filterSkeleton} aria-hidden="true" />}>
      <DateFilterInner defaultPreset={defaultPreset} />
    </Suspense>
  );
}

// Default export alias for test-file compatibility
export default DateFilter;

