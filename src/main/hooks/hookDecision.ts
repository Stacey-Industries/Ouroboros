/**
 * hookDecision.ts — Wave 50 Phase B
 *
 * Shared return type for all PreToolUse hook evaluators.
 * Each evaluator returns a HookDecision indicating whether to pass,
 * warn (non-blocking), or deny the tool call.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type HookDecision =
  | { kind: 'pass' }
  | { kind: 'warn'; ruleName: string; message: string }
  | { kind: 'deny'; ruleName: string; message: string };

export const PASS: HookDecision = { kind: 'pass' };
