'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  updateSetting,
  replaceUserMappings,
  updatePricing,
  resetPricingToDefaults,
  type UserMapping,
} from '@/lib/settings';
import { requireUser } from '@/lib/auth';
import { type PricingConfig } from '@/lib/cost';
import logger from '@/lib/logger';

/**
 * Action to update a single dashboard setting.
 */
export async function updateDashboardSetting(key: string, value: string) {
  try {
    await requireUser();
    
    const UpdateDashboardSettingSchema = z.object({
      key: z.string().min(1, "Key is required"),
      value: z.string()
    });

    const parsed = UpdateDashboardSettingSchema.parse({ key, value });
    
    await updateSetting(parsed.key, parsed.value);
    
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
    const { parse } = await import('csv-parse/sync');
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Validate and transform records
    const rawMappings = records.map((record: any) => ({
      os_username: String(record.os_username || ''),
      display_name: record.display_name ? String(record.display_name) : null,
      email: record.email ? String(record.email) : null,
      team: record.team ? String(record.team) : null,
    }));

    const UserMappingCsvRowSchema = z.object({
      os_username: z.string().min(1, "os_username is required"),
      display_name: z.string().nullable().optional(),
      email: z.string().email("Invalid email format").nullable().optional().or(z.literal('')),
      team: z.string().nullable().optional()
    });
    
    const UserMappingsUploadSchema = z.array(UserMappingCsvRowSchema).min(1, "CSV file is empty or invalid");

    const mappings = UserMappingsUploadSchema.parse(rawMappings);

    await replaceUserMappings(mappings);
    
    revalidatePath('/settings');
    return { success: true, count: mappings.length };
  } catch (error) {
    logger.error({ error, operation: 'action_upload_mappings' }, 'Failed to upload mappings via action');
    return { success: false, error: error instanceof Error ? error.message : 'Failed to upload mappings' };
  }
}

/**
 * Action to save user mappings from the UI table.
 */
export async function saveUserMappingsAction(mappings: UserMapping[]) {
  try {
    await requireUser();

    const UserMappingSchema = z.object({
      os_username: z.string().min(1, "os_username is required"),
      display_name: z.string().nullable().optional(),
      email: z.string().email("Invalid email format").nullable().optional().or(z.literal('')),
      team: z.string().nullable().optional()
    });
    
    const UserMappingsArraySchema = z.array(UserMappingSchema);

    const parsedMappings = UserMappingsArraySchema.parse(mappings);

    await replaceUserMappings(parsedMappings);
    
    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    logger.error({ error, operation: 'action_save_mappings' }, 'Failed to save mappings via action');
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save mappings' };
  }
}

/**
 * Action to save the updated model pricing configuration.
 */
export async function savePricingAction(pricing: PricingConfig) {
  const correlationId = crypto.randomUUID();
  const start = Date.now();

  logger.info({
    operation: 'save_pricing_action',
    correlationId,
  }, 'Starting pricing save action');

  try {
    await requireUser();

    const PricingRateSchema = z.object({
      input: z.number().min(0, "Input rate must be a non-negative number"),
      output: z.number().min(0, "Output rate must be a non-negative number")
    });
    
    const PricingConfigSchema = z.record(z.string(), PricingRateSchema);

    const parsedPricing = PricingConfigSchema.parse(pricing);

    await updatePricing(parsedPricing);

    logger.info({
      operation: 'save_pricing_action',
      correlationId,
      durationMs: Date.now() - start,
    }, 'Pricing saved successfully via action');

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    logger.error({
      operation: 'save_pricing_action',
      correlationId,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Pricing save action failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save settings',
    };
  }
}

/**
 * Action to reset custom model pricing to default standard rates.
 */
export async function resetPricingAction() {
  const correlationId = crypto.randomUUID();
  const start = Date.now();

  logger.info({
    operation: 'reset_pricing_action',
    correlationId,
  }, 'Starting pricing reset action');

  try {
    await requireUser();

    await resetPricingToDefaults();

    logger.info({
      operation: 'reset_pricing_action',
      correlationId,
      durationMs: Date.now() - start,
    }, 'Pricing reset successfully via action');

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    logger.error({
      operation: 'reset_pricing_action',
      correlationId,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 'Pricing reset action failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reset settings',
    };
  }
}
