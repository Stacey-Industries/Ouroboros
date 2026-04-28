/**
 * routerShadowSchema.ts — Wave 53a Phase C
 *
 * Per-surface schema for the 'router-shadow' telemetry parity surface.
 * Hook scripts mirror this shape in a comment block at the top — changes
 * here must be reflected in user_prompt_submit_router_shadow.mjs.
 *
 * Dedup design:
 *   When the IDE is running at session time, `shadowRouteHookEvent` writes
 *   a live record to router-decisions.jsonl (no postHoc field). The hook
 *   also fires and appends a queue record. At drain time, the drain handler
 *   reads router-decisions.jsonl once to build a Set<sessionId> of live
 *   entries and skips any drain record whose sessionId is already present.
 *   "Live record beats drain record" — the real-time record has richer
 *   context (IDE state, model override info, etc.).
 */

export const ROUTER_SHADOW_SURFACE = 'router-shadow';
export const ROUTER_SHADOW_SCHEMA_VERSION = 1;

/**
 * Payload shape written by the UserPromptSubmit hook and consumed by
 * routerShadowDrainHandler. Fields match what shadowRouteHookEvent needs.
 */
export interface RouterShadowRecord {
  /** Claude Code session identifier. */
  sessionId: string;
  /** Raw user prompt text. */
  prompt: string;
  /** Absolute working directory at prompt submission time. */
  cwd: string;
  /** Unix timestamp (ms) of the prompt submission. */
  ts: number;
}
