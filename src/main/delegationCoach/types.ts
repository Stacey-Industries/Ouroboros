/**
 * types.ts — Delegation coach shared types.
 *
 * The coach observes Claude Code tool calls and matches them against a
 * pattern library to suggest catalog dispatches or cheaper-tier delegations
 * that Opus would otherwise skip. Pattern definitions are pure data
 * (JSON-serializable) so the build step can emit `out/coach-patterns.json`
 * for consumption by `~/.claude/hooks/delegation_coach.mjs`.
 */

/** A single tool call observed in the session stream. */
export interface ToolCallEvent {
  /** Tool name, e.g. 'Read', 'Edit', 'Grep', 'Bash'. */
  tool: string;
  /** Tool input. Free-form; coach inspects only well-known shape keys. */
  input: Record<string, unknown>;
  /** Epoch ms when the call was about to fire (PreToolUse) or completed. */
  timestamp: number;
  /** Stable Claude Code session id. Same value across all calls in a session. */
  sessionId: string;
}

/** Coach-facing escalation level for a matched pattern. */
export type EscalationTier = 'soft' | 'acknowledgment' | 'hard';

/**
 * Match result returned by the detector. The hook turns this into either a
 * stdout nudge (soft), a stderr rejection (acknowledgment), or a stderr
 * rejection with directive language + escape-hatch text (hard).
 */
export interface PatternMatch {
  patternId: string;
  /** Human-readable suggestion text, formatted for injection into Opus's next turn. */
  suggestion: string;
  /** Escalation tier — drives the hook's exit code and message format. */
  escalation: EscalationTier;
  /** 0–1 — used to suppress noisy matches when multiple patterns fire on the same call. */
  confidence: number;
}

/* ── Trigger DSL ─────────────────────────────────────────────────────── */

/**
 * Matcher applied to a single tool call. Fields are AND-ed; absent fields
 * are ignored. `tool` accepts a single name OR an array (any-of).
 */
export interface ToolCallMatcher {
  tool?: string | string[];
  /** Glob-like pattern matched against the tool input's `file_path` arg. */
  argPathMatches?: string;
  /** Inverse of the above — current call must NOT touch this path. */
  argPathDoesNotMatch?: string;
}

/**
 * A constraint on the recent tool history. Counts how many calls in the
 * given time window match the inner matcher and applies min/max bounds.
 * `withinMs` is anchored to the *current* call's timestamp.
 */
export interface HistoryRequirement {
  match: ToolCallMatcher;
  /** Inclusive bounds. At least one of `min`/`max` is required. */
  count: { min?: number; max?: number };
  withinMs: number;
}

/** A pattern fires when `current` matches AND every `history` requirement holds. */
export interface PatternTrigger {
  current?: ToolCallMatcher;
  history?: HistoryRequirement[];
}

/* ── Pattern definition ──────────────────────────────────────────────── */

export interface PatternDefinition {
  id: string;
  name: string;
  /** One-line summary; surfaced in analytics + log lines. */
  description: string;
  trigger: PatternTrigger;
  /** Text injected into Opus's next turn (or used as rejection reason). */
  suggestion: string;
  escalation: EscalationTier;
  /** Don't fire the same pattern again within this window. Default: 5 min. */
  cooldownMs?: number;
  /** Confidence emitted on match. Default 0.7. */
  confidence?: number;
  /** When false, pattern is in the library but inactive. */
  enabled?: boolean;
}
