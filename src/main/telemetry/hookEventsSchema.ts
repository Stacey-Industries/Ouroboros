/**
 * hookEventsSchema.ts — Wave 53a Phase A
 *
 * Per-surface schema definition for the 'hook-events' telemetry parity surface.
 * Imported by `hookEventsDrainHandler.ts`; mirrored as a comment block at the
 * top of `assets/hooks/lib/ouroboros.mjs` (hook scripts cannot import TS).
 *
 * Schema-mirror discipline
 * ────────────────────────
 * The comment block in ouroboros.mjs MUST match `HookEventRecord` exactly.
 * When this type changes:
 *   1. Bump `HOOK_EVENTS_SCHEMA_VERSION`.
 *   2. Update the mirror comment in ouroboros.mjs.
 *   3. Update the drain handler to accept the new version.
 *
 * Dedup key: `(sessionId, eventId)` — NOT `(sessionId, surface)`.
 * Hook events fire N times per session (one per tool call, message, etc.).
 * Each event carries a unique `eventId` (UUID) for dedup within a drain run.
 * The drain handler maintains an in-memory Set for the run; cross-run dedup
 * is not required because the drain atomically moves queue files before
 * processing (each file is processed exactly once).
 */

// ---------------------------------------------------------------------------
// Schema version
// ---------------------------------------------------------------------------

/** Bump when `HookEventRecord` shape changes. Old handlers skip unknown versions. */
export const HOOK_EVENTS_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Hook event types emitted by Claude Code hook scripts.
 * Mirrors the `HookEventType` union in `hooksLifecycleHandlers.ts` (subset
 * that the drain handler routes — only types the hook scripts emit into the
 * parity queue).
 */
export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'user_prompt_submit'
  | 'session_start'
  | 'session_end'
  | 'agent_start'
  | 'agent_end'
  | 'agent_stop'
  | 'task_completed';

/**
 * Record shape written by `ouroboros.mjs` into the 'hook-events' queue surface.
 *
 * MUST match the comment-mirror block in `assets/hooks/lib/ouroboros.mjs`.
 * Schema version: {@link HOOK_EVENTS_SCHEMA_VERSION}.
 */
export interface HookEventRecord {
  /** Event type — routes the drain handler to the correct downstream tap. */
  eventType: HookEventType;
  /** Claude Code session ID from the hook event. */
  sessionId: string;
  /**
   * UUID assigned at hook time. Used as the dedup key paired with `sessionId`.
   * One event → one UUID → at-most-once drain dispatch.
   */
  eventId: string;
  /** The original hook event payload forwarded verbatim from Claude Code stdin. */
  payload: Record<string, unknown>;
}
