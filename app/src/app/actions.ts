'use server';

import { revalidatePath } from 'next/cache';
import { parse } from 'csv-parse/sync';
import { updateSetting, replaceUserMappings, type UserMapping } from '@/lib/settings';
import { requireUser } from '@/lib/auth';
import logger from '@/lib/logger';

/**
 * Action to update a single dashboard setting.
 */
export async function updateDashboardSetting(key: string, value: string) {
  try {
    await requireUser();
    
    await updateSetting(key, value);
    
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    logger.error({ error, key, operation: 'action_update_setting' }, 'Failed to update setting via action');
    return { success: false, error: 'Failed to update setting' };
  }
}

/**
 * Action to upload user mappings from a CSV file.
 * Expected CSV format: os_username,display_name,email,team
 */
export async function uploadUserMappings(formData: FormData) {
  try {
    await requireUser();
    
    const file = formData.get('file') as File;
    if (!file) {
      return { success: false, error: 'No file uploaded' };
    }

    const text = Buffer.from(await file.arrayBuffer()).toString();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Validate and transform records
    const mappings: UserMapping[] = records.map((record: any) => ({
      os_username: String(record.os_username || ''),
      display_name: record.display_name ? String(record.display_name) : null,
      email: record.email ? String(record.email) : null,
      team: record.team ? String(record.team) : null,
    }));

    if (mappings.length === 0) {
      return { success: false, error: 'CSV file is empty or invalid' };
    }

    // Validate os_username presence
    for (const mapping of mappings) {
      if (!mapping.os_username) {
        return { success: false, error: 'All records must have an os_username' };
      }
    }

    await replaceUserMappings(mappings);
    
    revalidatePath('/settings');
    return { success: true, count: mappings.length };
  } catch (error) {
    logger.error({ error, operation: 'action_upload_mappings' }, 'Failed to upload mappings via action');
    return { success: false, error: error instanceof Error ? error.message : 'Failed to upload mappings' };
  }
}
