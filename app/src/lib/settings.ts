import { z } from 'zod';
import { bq } from './bigquery';
import logger from './logger';

export const SettingSchema = z.object({
  key: z.string(),
  value: z.string(),
  updated_at: z.date().or(z.string()),
});

export type Setting = z.infer<typeof SettingSchema>;

export const UserMappingSchema = z.object({
  os_username: z.string(),
  display_name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  team: z.string().optional().nullable(),
});

export type UserMapping = z.infer<typeof UserMappingSchema>;

const DATASET = process.env.BQ_DATASET || 'agy_consumption';
const SETTINGS_TABLE = 'dashboard_settings';
const MAPPINGS_TABLE = 'user_mappings';

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
 * Update or insert a setting.
 */
export async function updateSetting(key: string, value: string): Promise<void> {
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
    params: { key, value },
  };

  try {
    await bq.query(options);
    logger.info({ key, operation: 'update_setting' }, 'Setting updated successfully');
  } catch (error) {
    logger.error({ error, key, operation: 'update_setting' }, 'Failed to update setting');
    throw error;
  }
}

/**
 * Replace all user mappings (used for CSV upload).
 */
export async function replaceUserMappings(mappings: UserMapping[]): Promise<void> {
  const dataset = bq.getClient().dataset(DATASET);
  const table = dataset.table(MAPPINGS_TABLE);

  try {
    // Delete all existing mappings first
    await bq.query(`DELETE FROM \`${DATASET}.${MAPPINGS_TABLE}\` WHERE TRUE`);
    
    if (mappings.length > 0) {
      // Insert new mappings
      await table.insert(mappings);
    }
    
    logger.info({ count: mappings.length, operation: 'replace_user_mappings' }, 'User mappings replaced successfully');
  } catch (error) {
    logger.error({ error, operation: 'replace_user_mappings' }, 'Failed to replace user mappings');
    throw error;
  }
}
