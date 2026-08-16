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

export type ActionSuccess<T = void> = {
  success: true;
  data?: T;
  count?: number;
};

export type ActionFailure = {
  success: false;
  error: string;
  validationErrors?: Record<string, string[]>;
};

export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_CSV_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'text/plain',
];

/**
 * Action to update a single dashboard setting.
 */
export async function updateDashboardSetting(
  key: string,
  value: string
): Promise<ActionResult> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  // 1. OPERATION START
  logger.info(
    { operation: 'update_dashboard_setting', correlationId, userId, key },
    'Starting dashboard setting update'
  );

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    const UpdateDashboardSettingSchema = z.object({
      key: z.string().trim().min(1, 'Key is required').max(128, 'Key exceeds maximum length'),
      value: z.string(),
    });

    const parsed = UpdateDashboardSettingSchema.parse({ key, value });

    await updateSetting(parsed.key, parsed.value);

    // 2. OPERATION SUCCESS
    logger.info(
      {
        operation: 'update_dashboard_setting',
        correlationId,
        userId,
        key: parsed.key,
        durationMs: Date.now() - startTime,
      },
      'Dashboard setting updated successfully'
    );

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error(
      {
        operation: 'update_dashboard_setting',
        correlationId,
        userId,
        key,
        durationMs,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Dashboard setting update failed'
    );

    return { success: false, error: errorMessage };
  }
}

/**
 * Action to upload user mappings from a CSV file.
 * Expected CSV format: os_username,display_name,email,team
 */
export async function uploadUserMappings(
  formData: FormData
): Promise<ActionResult<{ count: number }>> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  const file = formData.get('file') as File | null;

  // 1. OPERATION START
  logger.info(
    {
      operation: 'upload_user_mappings',
      correlationId,
      userId,
      fileName: file?.name,
      fileSize: file?.size,
    },
    'Starting user mappings CSV upload'
  );

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    if (!file || typeof (file as any).arrayBuffer !== 'function') {
      throw new Error('No file uploaded');
    }

    if (file.size === 0) {
      throw new Error('CSV file is empty');
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `File size exceeds maximum allowed limit of 5MB (got ${(file.size / (1024 * 1024)).toFixed(2)} MB)`
      );
    }

    const fileName = file.name || '';
    const isCsvExt = fileName.toLowerCase().endsWith('.csv');
    const mimeType = file.type ? file.type.toLowerCase() : '';
    const isValidMime = !mimeType || ALLOWED_CSV_MIME_TYPES.includes(mimeType);

    if (!isCsvExt || !isValidMime) {
      throw new Error('Invalid file type. Only CSV files (.csv) are supported.');
    }

    const text = Buffer.from(await file.arrayBuffer()).toString('utf-8');
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
      os_username: z.string().trim().min(1, 'os_username is required'),
      display_name: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v ?? null)),
      email: z
        .string()
        .trim()
        .email('Invalid email format')
        .nullable()
        .optional()
        .or(z.literal(''))
        .transform((v) => (v === '' || !v ? null : v)),
      team: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v ?? null)),
    });

    const UserMappingsUploadSchema = z
      .array(UserMappingCsvRowSchema)
      .min(1, 'CSV file is empty or contains no valid rows');

    const mappings = UserMappingsUploadSchema.parse(rawMappings);

    await replaceUserMappings(mappings);

    // 2. OPERATION SUCCESS
    logger.info(
      {
        operation: 'upload_user_mappings',
        correlationId,
        userId,
        count: mappings.length,
        durationMs: Date.now() - startTime,
      },
      'User mappings CSV uploaded and applied successfully'
    );

    revalidatePath('/settings');
    return { success: true, count: mappings.length, data: { count: mappings.length } };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error(
      {
        operation: 'upload_user_mappings',
        correlationId,
        userId,
        durationMs,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'User mappings CSV upload failed'
    );

    return { success: false, error: errorMessage };
  }
}

/**
 * Action to save user mappings from the UI table.
 */
export async function saveUserMappingsAction(
  mappings: UserMapping[]
): Promise<ActionResult<{ count: number }>> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  // 1. OPERATION START
  logger.info(
    {
      operation: 'save_user_mappings_action',
      correlationId,
      userId,
      rowCount: mappings?.length,
    },
    'Starting user mappings save'
  );

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    const UserMappingSchema = z.object({
      os_username: z.string().trim().min(1, 'os_username is required'),
      display_name: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v ?? null)),
      email: z
        .string()
        .trim()
        .email('Invalid email format')
        .nullable()
        .optional()
        .or(z.literal(''))
        .transform((v) => (v === '' || !v ? null : v)),
      team: z
        .string()
        .trim()
        .nullable()
        .optional()
        .transform((v) => (v === '' ? null : v ?? null)),
    });

    const UserMappingsArraySchema = z.array(UserMappingSchema);
    const parsedMappings = UserMappingsArraySchema.parse(mappings);

    await replaceUserMappings(parsedMappings);

    // 2. OPERATION SUCCESS
    logger.info(
      {
        operation: 'save_user_mappings_action',
        correlationId,
        userId,
        count: parsedMappings.length,
        durationMs: Date.now() - startTime,
      },
      'User mappings saved successfully'
    );

    revalidatePath('/settings');
    return { success: true, count: parsedMappings.length, data: { count: parsedMappings.length } };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error(
      {
        operation: 'save_user_mappings_action',
        correlationId,
        userId,
        durationMs,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'User mappings save failed'
    );

    return { success: false, error: errorMessage };
  }
}

/**
 * Action to save the updated model pricing configuration.
 */
export async function savePricingAction(
  pricing: PricingConfig
): Promise<ActionResult> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  // 1. OPERATION START
  logger.info(
    {
      operation: 'save_pricing_action',
      correlationId,
      userId,
    },
    'Starting pricing save action'
  );

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    const PricingRateSchema = z.object({
      input: z.number().min(0, 'Input rate must be non-negative'),
      output: z.number().min(0, 'Output rate must be non-negative'),
    });

    const PricingConfigSchema = z.record(z.string().min(1), PricingRateSchema);
    const parsedPricing = PricingConfigSchema.parse(pricing);

    await updatePricing(parsedPricing);

    // 2. OPERATION SUCCESS
    logger.info(
      {
        operation: 'save_pricing_action',
        correlationId,
        userId,
        durationMs: Date.now() - startTime,
      },
      'Pricing saved successfully via action'
    );

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error(
      {
        operation: 'save_pricing_action',
        correlationId,
        userId,
        durationMs,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Pricing save action failed'
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Action to reset custom model pricing to default standard rates.
 */
export async function resetPricingAction(): Promise<ActionResult> {
  const correlationId = crypto.randomUUID();
  const startTime = Date.now();
  let userId = 'anonymous';

  // 1. OPERATION START
  logger.info(
    {
      operation: 'reset_pricing_action',
      correlationId,
      userId,
    },
    'Starting pricing reset action'
  );

  try {
    const user = await requireUser();
    userId = user.email || user.id;

    await resetPricingToDefaults();

    // 2. OPERATION SUCCESS
    logger.info(
      {
        operation: 'reset_pricing_action',
        correlationId,
        userId,
        durationMs: Date.now() - startTime,
      },
      'Pricing reset successfully via action'
    );

    revalidatePath('/settings');
    return { success: true };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 3. OPERATION FAILURE
    logger.error(
      {
        operation: 'reset_pricing_action',
        correlationId,
        userId,
        durationMs,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Pricing reset action failed'
    );

    return {
      success: false,
      error: errorMessage,
    };
  }
}
