/**
 * Shared utility helpers for the agentChat module.
 * Import from here instead of defining locally in each file.
 */

/**
 * Extract a human-readable error message from an unknown caught value.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Type guard: value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
