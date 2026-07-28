'use client';

import React, { useState } from 'react';
import { type PricingConfig, PRICING_DEFAULTS } from '@/lib/cost';
import { savePricingAction, resetPricingAction } from '@/app/actions';
import styles from './PricingForm.module.css';

interface RowState {
  model: string;
  input: string;
  output: string;
  status: 'idle' | 'editing' | 'saving' | 'success' | 'error';
  tempInput?: string;
  tempOutput?: string;
  errorInput?: string;
  errorOutput?: string;
}

interface PricingFormProps {
  initialPricing: PricingConfig;
}

function formatRate(valStr: string): string {
  const num = parseFloat(valStr);
  if (isNaN(num)) return '0.000';
  const decimals = valStr.includes('.') && (valStr.split('.')[1]?.length ?? 0) > 3 ? 4 : 3;
  return num.toFixed(decimals);
}

export function PricingForm({ initialPricing }: PricingFormProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    Object.entries(initialPricing).forEach(([model, rate]) => {
      initial[model] = {
        model,
        input: rate.input.toString(),
        output: rate.output.toString(),
        status: 'idle',
      };
    });
    return initial;
  });

  const [isResetting, setIsResetting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const validateRate = (val: string): string | null => {
    if (val.trim() === '') {
      return 'Rate is required';
    }
    const parsed = parseFloat(val);
    if (isNaN(parsed)) {
      return 'Must be a number';
    }
    if (parsed < 0) {
      return 'Must be a non-negative number';
    }
    return null;
  };

  const handleRateChange = (model: string, direction: 'input' | 'output', value: string) => {
    setRows((prev) => {
      const row = prev[model];
      if (!row) return prev;

      const error = validateRate(value);
      const errorKey = direction === 'input' ? 'errorInput' : 'errorOutput';

      return {
        ...prev,
        [model]: {
          ...row,
          [direction]: value,
          [errorKey]: error || undefined,
        },
      };
    });
  };

  const startEditing = (model: string) => {
    setRows((prev) => {
      const row = prev[model];
      if (!row) return prev;

      return {
        ...prev,
        [model]: {
          ...row,
          status: 'editing',
          tempInput: row.input,
          tempOutput: row.output,
          errorInput: undefined,
          errorOutput: undefined,
        },
      };
    });

    // Auto-focus Input field
    setTimeout(() => {
      const inputEl = document.getElementById(`input-rate-${model}-input`);
      inputEl?.focus();
    }, 0);
  };

  const cancelEditing = (model: string) => {
    setRows((prev) => {
      const row = prev[model];
      if (!row) return prev;

      return {
        ...prev,
        [model]: {
          ...row,
          status: 'idle',
          input: row.tempInput ?? row.input,
          output: row.tempOutput ?? row.output,
          errorInput: undefined,
          errorOutput: undefined,
        },
      };
    });

    // Restore focus to Edit button
    setTimeout(() => {
      const editBtn = document.getElementById(`edit-btn-${model}`);
      editBtn?.focus();
    }, 0);
  };

  const handleSave = async (model: string) => {
    const row = rows[model];
    if (!row) return;

    // Validate both fields before saving
    const inputError = validateRate(row.input);
    const outputError = validateRate(row.output);

    if (inputError || outputError) {
      setRows((prev) => ({
        ...prev,
        [model]: {
          ...row,
          status: 'error',
          errorInput: inputError || undefined,
          errorOutput: outputError || undefined,
        },
      }));
      return;
    }

    // Set saving mode
    setRows((prev) => ({
      ...prev,
      [model]: {
        ...row,
        status: 'saving',
      },
    }));

    const updatePayload: PricingConfig = {
      [model]: {
        input: parseFloat(row.input),
        output: parseFloat(row.output),
      },
    };

    const result = await savePricingAction(updatePayload);

    if (result.success) {
      // Flash success state then return to idle
      setRows((prev) => ({
        ...prev,
        [model]: {
          ...prev[model]!,
          status: 'success',
          errorInput: undefined,
          errorOutput: undefined,
        },
      }));

      setTimeout(() => {
        setRows((prev) => {
          const r = prev[model];
          if (r?.status === 'success') {
            return {
              ...prev,
              [model]: {
                ...r,
                status: 'idle',
              },
            };
          }
          return prev;
        });
        
        // Restore focus to edit button
        const editBtn = document.getElementById(`edit-btn-${model}`);
        editBtn?.focus();
      }, 800);
    } else {
      setRows((prev) => ({
        ...prev,
        [model]: {
          ...prev[model]!,
          status: 'error',
          errorInput: result.error || 'Failed to save',
        },
      }));
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all model pricing to standard defaults?')) {
      return;
    }

    setIsResetting(true);
    setGlobalError(null);

    const result = await resetPricingAction();

    if (result.success) {
      setRows(() => {
        const reset: Record<string, RowState> = {};
        Object.keys(initialPricing).forEach((model) => {
          const rate = PRICING_DEFAULTS[model] || initialPricing[model] || { input: 0, output: 0 };
          reset[model] = {
            model,
            input: rate.input.toString(),
            output: rate.output.toString(),
            status: 'idle',
          };
        });
        return reset;
      });
    } else {
      setGlobalError(result.error || 'Failed to reset settings');
    }
    setIsResetting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent, model: string) => {
    if (e.key === 'Escape') {
      cancelEditing(model);
    } else if (e.key === 'Enter') {
      if (e.target instanceof HTMLInputElement) {
        void handleSave(model);
      }
    }
  };

  return (
    <section className={styles.section} aria-busy={isResetting ? 'true' : 'false'}>
      <div className={styles.headerRow}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>Model Pricing</h3>
          <p className={styles.subtitle}>
            Inferred costs are calculated based on these rates.
          </p>
        </div>
        <button
          className="button-primary"
          onClick={handleReset}
          disabled={isResetting}
          aria-label="Reset pricing rates to standards"
        >
          {isResetting ? (
            <span className={styles.spinner} />
          ) : (
            <>
              <span className="icon">refresh</span>
              Reset to Defaults
            </>
          )}
        </button>
      </div>

      {globalError && (
        <div style={{ color: 'var(--md-sys-color-error)', fontSize: '14px', fontWeight: '500' }}>
          {globalError}
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Model</th>
              <th className={`${styles.th} ${styles.alignRight}`}>Input ($/1M)</th>
              <th className={`${styles.th} ${styles.alignRight}`}>Output ($/1M)</th>
              <th className={`${styles.th} ${styles.alignRight}`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(rows).map((row) => {
              const isEditing = row.status === 'editing' || row.status === 'error';
              const isSaving = row.status === 'saving';
              const isSuccess = row.status === 'success';

              return (
                <tr
                  key={row.model}
                  className={`${styles.tr} ${isSuccess ? styles.trSuccess : ''} ${
                    isSaving ? styles.savingRow : ''
                  }`}
                  onKeyDown={(e) => handleKeyDown(e, row.model)}
                  aria-busy={isSaving ? 'true' : 'false'}
                >
                  <td className={styles.td}>
                    <span className={styles.modelName}>{row.model}</span>
                  </td>

                  <td className={`${styles.td} ${styles.alignRight}`}>
                    {isEditing ? (
                      <div className={styles.inputContainer}>
                        <input
                          id={`input-rate-${row.model}-input`}
                          aria-label={`Input token pricing rate for ${row.model}`}
                          type="text"
                          value={row.input}
                          onChange={(e) => handleRateChange(row.model, 'input', e.target.value)}
                          className={`${styles.input} ${row.errorInput ? styles.inputError : ''}`}
                          disabled={isSaving}
                          aria-describedby={row.errorInput ? `row-${row.model}-error-input` : undefined}
                        />
                        {row.errorInput && (
                          <span
                            className={`${styles.warningIcon} icon`}
                            id={`row-${row.model}-error-input`}
                            role="tooltip"
                            title={row.errorInput}
                          >
                            warning
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={styles.rateValue}>
                        {formatRate(row.input)}
                      </span>
                    )}
                  </td>

                  <td className={`${styles.td} ${styles.alignRight}`}>
                    {isEditing ? (
                      <div className={styles.inputContainer}>
                        <input
                          id={`input-rate-${row.model}-output`}
                          aria-label={`Output token pricing rate for ${row.model}`}
                          type="text"
                          value={row.output}
                          onChange={(e) => handleRateChange(row.model, 'output', e.target.value)}
                          className={`${styles.input} ${row.errorOutput ? styles.inputError : ''}`}
                          disabled={isSaving}
                          aria-describedby={row.errorOutput ? `row-${row.model}-error-output` : undefined}
                        />
                        {row.errorOutput && (
                          <span
                            className={`${styles.warningIcon} icon`}
                            id={`row-${row.model}-error-output`}
                            role="tooltip"
                            title={row.errorOutput}
                          >
                            warning
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className={styles.rateValue}>
                        {formatRate(row.output)}
                      </span>
                    )}
                  </td>

                  <td className={`${styles.td} ${styles.alignRight}`}>
                    <div className={styles.actionsCell}>
                      {isEditing ? (
                        <>
                          <button
                            className={`${styles.btnAction} ${styles.btnSave}`}
                            onClick={() => handleSave(row.model)}
                            disabled={isSaving}
                            aria-label={`Save rate changes for ${row.model}`}
                          >
                            <span className="icon">save</span>
                          </button>
                          <button
                            className={`${styles.btnAction} ${styles.btnCancel}`}
                            onClick={() => cancelEditing(row.model)}
                            disabled={isSaving}
                            aria-label={`Cancel rate changes for ${row.model}`}
                          >
                            <span className="icon">close</span>
                          </button>
                        </>
                      ) : (
                        <button
                          id={`edit-btn-${row.model}`}
                          className={styles.btnEdit}
                          onClick={() => startEditing(row.model)}
                          disabled={isSaving}
                          aria-label={`Edit pricing rates for ${row.model}`}
                        >
                          EDIT
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
