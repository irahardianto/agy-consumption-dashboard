import { z } from 'zod';
import { bq } from './bigquery';
import logger from './logger';
import { PricingConfig, getPricingFromSettings } from './cost';

export const SettingSchema = z.object({
  key: z.string().trim().min(1, 'Key is required').max(128, 'Key exceeds maximum length'),
  value: z.string(),
  updated_at: z.date().or(z.string()).optional(),
});

export type Setting = z.infer<typeof SettingSchema>;

export const UserMappingItemSchema = z.object({
  os_username: z
    .string()
    .trim()
    .min(1, 'os_username is required')
    .max(128, 'os_username exceeds max length of 128'),
  display_name: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform(v => (v === '' ? null : v ?? null)),
  email: z
    .string()
    .trim()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal(''))
    .transform(v => (v === '' || !v ? null : v)),
  team: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform(v => (v === '' ? null : v ?? null)),
});

export const UserMappingSchema = UserMappingItemSchema;

export type UserMappingItem = z.infer<typeof UserMappingItemSchema>;
export type UserMapping = UserMappingItem;

const DATASET = process.env.BQ_DATASET || 'agy_consumption';
const SETTINGS_TABLE = 'dashboard_settings';
const MAPPINGS_TABLE = 'user_mappings';

/**
 * Sanitizes and deduplicates user mapping items by os_username, keeping the latest entry.
 */
export function sanitizeAndDeduplicateMappings(rawMappings: UserMappingItem[]): UserMappingItem[] {
  const map = new Map<string, UserMappingItem>();
  for (const raw of rawMappings) {
    const validated = UserMappingItemSchema.parse(raw);
    map.set(validated.os_username, {
      os_username: validated.os_username,
      display_name: validated.display_name ?? null,
      email: validated.email ?? null,
      team: validated.team ?? null,
    });
  }
  return Array.from(map.values());
}

/**
 * Fetch all settings from BigQuery.
 */
export async function getSettings(): Promise<Record<string, string>> {
  const query = `SELECT key, value FROM \`${DATASET}.${SETTINGS_TABLE}\``;
  
  try {
    const rows = await bq.query<{ key: string; value: string }>(query);
    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.key && row.value) {
        result[row.key] = row.value;
      }
    }
    return result;
  } catch (error) {
    logger.error({ error, operation: 'get_settings' }, 'Failed to fetch settings');
    return {};
  }
}

/**
 * Update or insert a setting using an atomic MERGE statement.
 */
export async function updateSetting(key: string, value: string): Promise<void> {
  const validatedKey = z.string().trim().min(1, 'Key is required').max(128, 'Key exceeds maximum length').parse(key);
  const query = `
    MERGE \`${DATASET}.${SETTINGS_TABLE}\` T
    USING (SELECT @key AS key, @value AS value, CURRENT_TIMESTAMP() AS updated_at) S
    ON T.key = S.key
    WHEN MATCHED THEN
      UPDATE SET value = S.value, updated_at = S.updated_at
    WHEN NOT MATCHED THEN
      INSERT (key, value, updated_at) VALUES (S.key, S.value, S.updated_at)
  `;

  const options = {
    query,
    params: { key: validatedKey, value },
  };

  try {
    await bq.query(options);
    logger.info({ key: validatedKey, operation: 'update_setting' }, 'Setting updated successfully');
  } catch (error) {
    logger.error({ error, key: validatedKey, operation: 'update_setting' }, 'Failed to update setting');
    throw error;
  }
}

/**
 * Atomically replaces all user mappings in BigQuery with the provided batch.
 * Uses a single atomic MERGE statement to eliminate data loss race conditions.
 *
 * @param mappings - Raw or sanitized list of user mappings.
 * @throws ZodError on invalid schema.
 * @throws Error if BigQuery execution fails (leaving table untouched).
 */
export async function replaceUserMappings(mappings: UserMappingItem[]): Promise<void> {
  const sanitized = sanitizeAndDeduplicateMappings(mappings);

  if (sanitized.length === 0) {
    // If clearing all records, single DELETE statement is atomic
    await bq.query({
      query: `DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`,
    });
    logger.info({ count: 0, operation: 'replace_user_mappings' }, 'User mappings cleared successfully');
    return;
  }

  const query = `
    MERGE INTO \`${DATASET}.${MAPPINGS_TABLE}\` AS T
    USING (
      SELECT
        os_username,
        display_name,
        email,
        team
      FROM UNNEST(@mappings)
    ) AS S
    ON T.os_username = S.os_username
    WHEN MATCHED THEN
      UPDATE SET
        T.display_name = S.display_name,
        T.email = S.email,
        T.team = S.team
    WHEN NOT MATCHED THEN
      INSERT (os_username, display_name, email, team)
      VALUES (S.os_username, S.display_name, S.email, S.team)
    WHEN NOT MATCHED BY SOURCE THEN
      DELETE
  `;

  // BigQuery type options to ensure STRUCT array is accurately typed
  const options = {
    query,
    params: {
      mappings: sanitized,
    },
    types: {
      mappings: [
        {
          os_username: 'STRING',
          display_name: 'STRING',
          email: 'STRING',
          team: 'STRING',
        },
      ],
    },
  };

  try {
    await bq.query(options);
    logger.info(
      { count: sanitized.length, operation: 'replace_user_mappings' },
      'User mappings atomically replaced successfully'
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), count: sanitized.length, operation: 'replace_user_mappings' },
      'Failed to atomically replace user mappings'
    );
    throw error;
  }
}

/**
 * Fetch all user mappings.
 */
export async function getUserMappings(): Promise<UserMapping[]> {
  const query = `SELECT os_username, display_name, email, team FROM \`${DATASET}.${MAPPINGS_TABLE}\``;
  try {
    const rows = await bq.query<UserMapping>(query);
    return rows;
  } catch (error) {
    logger.error({ error, operation: 'get_user_mappings' }, 'Failed to fetch user mappings');
    return [];
  }
}

/**
 * Loads custom model pricing configurations from the BigQuery settings table.
 * Merges loaded overrides onto PRICING_DEFAULTS.
 */
export async function getPricingSettings(): Promise<PricingConfig> {
  const settings = await getSettings();
  return getPricingFromSettings(settings);
}

/**
 * Updates pricing rate overrides in the settings table.
 * Executes an idempotent MERGE statement in BigQuery for each updated key.
 * 
 * @param pricing Structured map of model configurations to save.
 */
export async function updatePricing(pricing: PricingConfig): Promise<void> {
  const promises = Object.entries(pricing).flatMap(([model, rates]) => [
    updateSetting(`pricing:${model}:input`, rates.input.toString()),
    updateSetting(`pricing:${model}:output`, rates.output.toString()),
  ]);
  await Promise.all(promises);
}

/**
 * Resets custom model pricing by clearing all keys prefixed with "pricing:" 
 * from the database settings table.
 */
export async function resetPricingToDefaults(): Promise<void> {
  const query = `DELETE FROM \`${DATASET}.${SETTINGS_TABLE}\` WHERE key LIKE 'pricing:%'`;
  try {
    await bq.query(query);
    logger.info({ operation: 'reset_pricing_to_defaults' }, 'Model pricing reset to defaults successfully');
  } catch (error) {
    logger.error({ error, operation: 'reset_pricing_to_defaults' }, 'Failed to reset model pricing');
    throw error;
  }
}
