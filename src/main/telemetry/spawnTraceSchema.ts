/**
 * spawnTraceSchema.ts — Wave 53a Phase B
 *
 * Per-surface schema for the 'spawn-trace' telemetry queue surface.
 *
 * Dedup key: (sessionId, surface) — one spawn trace per session.
 * - Internal sessions (IDE-spawned) emit via claudeStreamJsonRunner.ts AND
 *   via the SessionStart hook. The drain handler deduplicates by checking
 *   whether a trace for that sessionId already exists in orchestration_traces.
 * - External sessions (hook-only) emit once and land on first drain.
 *
 * The hook script `assets/hooks/session_start_spawn_cost.mjs` mirrors this
 * shape in a comment block. Schema changes here MUST be reflected there.
 */

export const SPAWN_TRACE_SURFACE = 'spawn-trace';

/** Drain handler accepts this schema version. Hook must match. */
export const SPAWN_TRACE_SCHEMA_VERSION = 1;

/**
 * The record shape written by the hook and consumed by spawnTraceDrainHandler.
 *
 * `argv` is captured raw by the hook; redactArgv() is applied drain-side
 * (single source of truth; hook has no access to the canonical TS redaction).
 *
 * `cwdHash` is SHA-256 of the cwd, first 12 hex chars — matches the 16-char
 * truncation used by the IDE side (both are fine; the goal is log brevity and
 * privacy, not exact byte match).
 */
export interface SpawnTraceRecord {
  /** Claude Code session ID from the SessionStart event payload. */
  sessionId: string;
  /**
   * Raw argv from the SessionStart event. Redacted drain-side via redactArgv()
   * before being stored in orchestration_traces.
   */
  argv: string[];
  /** SHA-256 of the cwd, truncated to 12 hex chars. */
  cwdHash: string;
  /** Epoch ms at hook invocation time. */
  ts: number;
}
