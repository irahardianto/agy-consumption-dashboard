const VALID_PRESETS = ['today', '3days', 'week', 'month', 'custom'];

export function isValidDateStr(s: string | undefined): boolean {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime()) && s === d.toISOString().slice(0, 10);
}

export function sanitizeDateParams(
  preset?: string,
  startDate?: string,
  endDate?: string,
  defaultPreset: string = '3days'
): { preset: string; startDate?: string; endDate?: string } {
  let resolvedPreset = preset && VALID_PRESETS.includes(preset) ? preset : defaultPreset;

  if (resolvedPreset === 'custom') {
    if (isValidDateStr(startDate) && isValidDateStr(endDate)) {
      if (startDate! <= endDate!) {
        return { preset: 'custom', startDate, endDate };
      }
    }
    // Fall back to default preset if dates are invalid
    resolvedPreset = defaultPreset;
  }

  return { preset: resolvedPreset };
}
