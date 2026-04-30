/**
 * detector.ts — Pattern matcher for the delegation coach.
 *
 * Pure function. Takes a bounded tool-use history and the current call
 * about to fire, evaluates each pattern's trigger against the data, and
 * returns the matches. The hook layer (~/.claude/hooks/delegation_coach.mjs)
 * turns matches into nudges; the IDE consumes the same data for analytics.
 *
 * Invariants this module guarantees:
 *   - Stateless. Cooldown bookkeeping is the caller's responsibility (the
 *     hook holds it across invocations; tests pass an explicit `lastFiredAt`).
 *   - History is bounded by the caller. The detector trusts it not to grow.
 *   - Tool names are matched case-sensitively (matches Claude Code conventions).
 */

import type {
  HistoryRequirement,
  PatternDefinition,
  PatternMatch,
  ToolCallEvent,
  ToolCallMatcher,
} from './types';

/** History window the hook should retain. Older events can be evicted. */
export const DEFAULT_HISTORY_WINDOW_MS = 120_000;
/** Soft cap on retained events — the larger of "this many" or "in the window". */
export const DEFAULT_HISTORY_MAX_EVENTS = 20;

/* ── Public API ──────────────────────────────────────────────────────── */

export interface DetectOptions {
  /** Per-pattern last-fired epoch ms; used to honor cooldown. */
  lastFiredAt?: Record<string, number>;
}

/**
 * Run every active pattern against the provided history + current call.
 * Returns matches in pattern-list order (stable for the caller).
 *
 * `history` must NOT include `current` — the matcher counts them separately.
 */
export function detectPatterns(
  history: ToolCallEvent[],
  current: ToolCallEvent,
  patterns: PatternDefinition[],
  opts: DetectOptions = {},
): PatternMatch[] {
  const matches: PatternMatch[] = [];
  for (const p of patterns) {
    if (p.enabled === false) continue;
    if (isInCooldown(p, current.timestamp, opts.lastFiredAt)) continue;
    if (!triggerMatches(p, history, current)) continue;
    matches.push({
      patternId: p.id,
      suggestion: p.suggestion,
      escalation: p.escalation,
      confidence: p.confidence ?? 0.7,
    });
  }
  return matches;
}

/* ── Trigger evaluation ──────────────────────────────────────────────── */

function triggerMatches(
  pattern: PatternDefinition,
  history: ToolCallEvent[],
  current: ToolCallEvent,
): boolean {
  if (pattern.trigger.current && !toolMatcherFires(pattern.trigger.current, current)) {
    return false;
  }
  for (const req of pattern.trigger.history ?? []) {
    if (!historyRequirementSatisfied(req, history, current.timestamp)) return false;
  }
  return true;
}

function historyRequirementSatisfied(
  req: HistoryRequirement,
  history: ToolCallEvent[],
  anchorTs: number,
): boolean {
  const cutoff = anchorTs - req.withinMs;
  let count = 0;
  for (const ev of history) {
    if (ev.timestamp < cutoff) continue;
    if (ev.timestamp > anchorTs) continue; // ignore future events (defensive)
    if (toolMatcherFires(req.match, ev)) count++;
  }
  if (req.count.min !== undefined && count < req.count.min) return false;
  if (req.count.max !== undefined && count > req.count.max) return false;
  return true;
}

/* ── Matcher primitives ──────────────────────────────────────────────── */

function toolMatcherFires(matcher: ToolCallMatcher, ev: ToolCallEvent): boolean {
  if (matcher.tool !== undefined && !toolNameMatches(matcher.tool, ev.tool)) return false;
  const path = extractFilePath(ev.input);
  if (matcher.argPathMatches !== undefined) {
    if (path === undefined) return false;
    if (!globMatches(matcher.argPathMatches, path)) return false;
  }
  if (matcher.argPathDoesNotMatch !== undefined) {
    if (path !== undefined && globMatches(matcher.argPathDoesNotMatch, path)) return false;
  }
  return true;
}

function toolNameMatches(allowed: string | string[], actual: string): boolean {
  return Array.isArray(allowed) ? allowed.includes(actual) : allowed === actual;
}

/**
 * Pull a file path from a tool input. Claude Code conventions: most file
 * tools use `file_path`; some use `path`. Accepts either. Returns lower-cased
 * for stable glob matching across platforms.
 */
function extractFilePath(input: Record<string, unknown>): string | undefined {
  const fp = input.file_path ?? input.path;
  if (typeof fp !== 'string' || fp.length === 0) return undefined;
  return fp.toLowerCase();
}

/* ── Glob matching ───────────────────────────────────────────────────── */

const globCache = new Map<string, RegExp>();

/**
 * Tiny glob matcher covering the patterns the seed library uses: `*`, `**`,
 * literal characters. Patterns are anchored. Bash convention: when the
 * pattern contains no `/`, it is matched against the path's basename
 * (so `*.test.*` matches `/repo/foo.test.ts`); otherwise against the full
 * path (so `**foo/bar` walks across slashes).
 */
export function globMatches(pattern: string, path: string): boolean {
  const lower = path.toLowerCase();
  const re = compileGlob(pattern.toLowerCase());
  if (pattern.includes('/')) return re.test(lower);
  const slash = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'));
  const basename = slash >= 0 ? lower.slice(slash + 1) : lower;
  return re.test(basename);
}

function compileGlob(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  // eslint-disable-next-line security/detect-non-literal-regexp -- glob source is the static seed pattern table
  const re = new RegExp(`^${globToRegexBody(pattern)}$`);
  globCache.set(pattern, re);
  return re;
}

/**
 * Token-by-token translator: `**` → `.*`; `*` → `[^/]*`; everything else
 * regex-escaped literally.
 */
function globToRegexBody(pattern: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern.charAt(i);
    if (ch === '*' && pattern.charAt(i + 1) === '*') {
      out.push('.*');
      i += 2;
      continue;
    }
    if (ch === '*') {
      out.push('[^/]*');
      i += 1;
      continue;
    }
    out.push(escapeRegexChar(ch));
    i += 1;
  }
  return out.join('');
}

const REGEX_META_CHARS = new Set([
  '.',
  '+',
  '?',
  '^',
  '$',
  '(',
  ')',
  '|',
  '[',
  ']',
  '{',
  '}',
  '\\',
]);

function escapeRegexChar(ch: string): string {
  return REGEX_META_CHARS.has(ch) ? `\\${ch}` : ch;
}

/* ── Cooldown ────────────────────────────────────────────────────────── */

const DEFAULT_COOLDOWN_MS = 300_000;

function isInCooldown(
  pattern: PatternDefinition,
  now: number,
  lastFiredAt: Record<string, number> | undefined,
): boolean {
  if (!lastFiredAt) return false;
  const last = lastFiredAt[pattern.id];
  if (last === undefined) return false;
  const cooldown = pattern.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  return now - last < cooldown;
}

/* ── History pruning helper (used by the hook) ───────────────────────── */

/**
 * Drop events older than `windowMs` relative to `now`, then cap at `maxEvents`.
 * Pure; safe to call before each detect cycle.
 */
export function pruneHistory(
  history: ToolCallEvent[],
  now: number,
  windowMs: number = DEFAULT_HISTORY_WINDOW_MS,
  maxEvents: number = DEFAULT_HISTORY_MAX_EVENTS,
): ToolCallEvent[] {
  const cutoff = now - windowMs;
  const recent = history.filter((ev) => ev.timestamp >= cutoff);
  return recent.length > maxEvents ? recent.slice(recent.length - maxEvents) : recent;
}
