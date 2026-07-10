import logger from './logger';

export interface ModelPricing {
  input: number;  // Price in USD per 1,000,000 input tokens
  output: number; // Price in USD per 1,000,000 output tokens
}

export type PricingConfig = Record<string, ModelPricing>;

/**
 * Standard pricing for Gemini models (per 1,000,000 tokens).
 * These are defaults and could be overridden by settings in the future.
 */
export const PRICING_DEFAULTS: PricingConfig = {
  'gemini-1.5-pro': {
    input: 1.25,
    output: 3.75,
  },
  'gemini-1.5-flash': {
    input: 0.075,
    output: 0.30,
  },
  'gemini-2.0-flash-exp': {
    input: 0.00,
    output: 0.00,
  },
};

/**
 * Parses flat database settings records to build a structured pricing configuration.
 * Resolves settings keys like "pricing:gemini-1.5-pro:input".
 * 
 * @param settings Flat key-value record fetched from settings table.
 */
export function getPricingFromSettings(settings: Record<string, string>): PricingConfig {
  const result: PricingConfig = {};
  for (const [model, defaults] of Object.entries(PRICING_DEFAULTS)) {
    result[model] = { ...defaults };
  }

  for (const [key, value] of Object.entries(settings)) {
    if (key.startsWith('pricing:')) {
      const parts = key.split(':');
      if (parts.length === 3) {
        const [, model, direction] = parts;
        if (model && (direction === 'input' || direction === 'output')) {
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            if (!result[model]) {
              result[model] = { input: 0, output: 0 };
            }
            result[model][direction] = numValue;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Calculates the total cost for a specific request's token usage.
 * Falls back to PRICING_DEFAULTS if the model is not found in the custom config.
 * 
 * @param model The full model string (e.g. "publishers/google/models/gemini-1.5-pro").
 * @param inputTokens The number of input prompt tokens.
 * @param outputTokens The number of output candidate and thinking tokens.
 * @param pricing Custom pricing overrides mapping.
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  pricing: PricingConfig = {}
): number {
  let modelKey = Object.keys(pricing).find(k => model.includes(k));
  let rates = modelKey ? pricing[modelKey] : undefined;

  if (!rates) {
    const defaultKey = Object.keys(PRICING_DEFAULTS).find(k => model.includes(k));
    rates = defaultKey ? PRICING_DEFAULTS[defaultKey] : undefined;
  }

  if (!rates) {
    logger.warn({ model }, 'Unknown model for cost calculation, using zero');
    return 0;
  }

  const inputCost = (inputTokens / 1_000_000) * rates.input;
  const outputCost = (outputTokens / 1_000_000) * rates.output;
  
  return inputCost + outputCost;
}

export interface UsageRecord {
  os_username: string;
  displayName: string;
  email?: string | null;
  team?: string | null;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  cost: number;
}

/**
 * Distributes unattributed usage metrics proportionally among all attributed users.
 */
export function redistributeUnattributed<T extends UsageRecord>(records: T[]): T[] {
  const unattributedIndex = records.findIndex(r => r.os_username === '__unattributed__');
  if (unattributedIndex === -1) {
    return records;
  }

  const unattributed = records[unattributedIndex];
  if (!unattributed) {
    return records;
  }

  const attributedRecords = records.filter((_, idx) => idx !== unattributedIndex);

  const totalAttributedTokens = attributedRecords.reduce((sum, r) => sum + r.tokens, 0);
  const totalAttributedRequests = attributedRecords.reduce((sum, r) => sum + r.requests, 0);

  if (totalAttributedTokens === 0 || totalAttributedRequests === 0) {
    return attributedRecords;
  }

  return attributedRecords.map(user => {
    const p_tokens = user.tokens / totalAttributedTokens;
    const p_requests = user.requests / totalAttributedRequests;

    return {
      ...user,
      tokens: user.tokens + p_tokens * unattributed.tokens,
      input_tokens: user.input_tokens + p_tokens * unattributed.input_tokens,
      output_tokens: user.output_tokens + p_tokens * unattributed.output_tokens,
      requests: user.requests + p_requests * unattributed.requests,
      cost: user.cost + p_tokens * unattributed.cost,
    } as T;
  });
}

/**
 * Extract user identity (OS username) from the system prompt using regex.
 * Example pattern: "Agent OS Username: irahardianto"
 */
export function extractIdentity(systemPrompt: string): string | null {
  // Common pattern for identity injection in Antigravity system prompts
  const regex = /Agent OS Username: ([a-zA-Z0-9._-]+)/i;
  const match = systemPrompt.match(regex);
  
  if (match && match[1]) {
    return match[1];
  }
  
  return null;
}

/**
 * Attribution logic for sub-agent calls.
 * If a request has a trajectory_id, it might be linked to a parent session.
 */
export function getAttributionId(labels: Record<string, string>): string | null {
  return labels['trajectory_id'] || labels['session_id'] || null;
}
