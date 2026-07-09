import logger from './logger';

/**
 * Standard pricing for Gemini models (per 1,000,000 tokens).
 * These are defaults and could be overridden by settings in the future.
 */
export const PRICING_DEFAULTS = {
  'gemini-1.5-pro': {
    input: 1.25,
    output: 3.75,
  },
  'gemini-1.5-flash': {
    input: 0.075,
    output: 0.3,
  },
  'gemini-2.0-flash-exp': {
    input: 0, // Assuming experimental is free or same as flash
    output: 0,
  },
};

/**
 * Calculate the cost of a request based on token usage.
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const modelKey = Object.keys(PRICING_DEFAULTS).find(k => model.includes(k)) as keyof typeof PRICING_DEFAULTS | undefined;
  
  if (!modelKey) {
    logger.warn({ model }, 'Unknown model for cost calculation, using zero');
    return 0;
  }

  const pricing = PRICING_DEFAULTS[modelKey];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
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
