/**
 * coach-detector-template.mjs — Plain-JS port of src/main/delegationCoach/detector.ts
 *
 * DO NOT EDIT BY HAND. This file is the template used by scripts/build-coach-hook.mjs
 * to generate out/coach-detector.mjs and ~/.claude/hooks/lib/coach-detector.mjs.
 *
 * Edit the TypeScript source (detector.ts) and re-run:
 *   npm run build:coach-hook
 *
 * Exports: detectPatterns, globMatches, pruneHistory,
 *          DEFAULT_HISTORY_WINDOW_MS, DEFAULT_HISTORY_MAX_EVENTS
 */

/** History window the hook should retain. Older events can be evicted. */
export const DEFAULT_HISTORY_WINDOW_MS = 120_000;
/** Soft cap on retained events. */
export const DEFAULT_HISTORY_MAX_EVENTS = 20;

/* ── Public API ───────────────────────────────────────────────────────────── */

/**
 * Run every active pattern against history + current call.
 * Returns matches in pattern-list order.
 * history must NOT include current.
 *
 * @param {object[]} history
 * @param {object} current
 * @param {object[]} patterns
 * @param {{ lastFiredAt?: Record<string, number> }} [opts]
 * @returns {object[]}
 */
export function detectPatterns(history, current, patterns, opts = {}) {
  const matches = [];
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

/* ── Trigger evaluation ──────────────────────────────────────────────────── */

function triggerMatches(pattern, history, current) {
  if (pattern.trigger.current && !toolMatcherFires(pattern.trigger.current, current)) {
    return false;
  }
  for (const req of pattern.trigger.history ?? []) {
    if (!historyRequirementSatisfied(req, history, current.timestamp)) return false;
  }
  return true;
}

function historyRequirementSatisfied(req, history, anchorTs) {
  const cutoff = anchorTs - req.withinMs;
  let count = 0;
  for (const ev of history) {
    if (ev.timestamp < cutoff) continue;
    if (ev.timestamp > anchorTs) continue;
    if (toolMatcherFires(req.match, ev)) count++;
  }
  if (req.count.min !== undefined && count < req.count.min) return false;
  if (req.count.max !== undefined && count > req.count.max) return false;
  return true;
}

/* ── Matcher primitives ───────────────────────────────────────────────────── */

function toolMatcherFires(matcher, ev) {
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

function toolNameMatches(allowed, actual) {
  return Array.isArray(allowed) ? allowed.includes(actual) : allowed === actual;
}

function extractFilePath(input) {
  const fp = input.file_path ?? input.path;
  if (typeof fp !== 'string' || fp.length === 0) return undefined;
  return fp.toLowerCase();
}

/* ── Glob matching ────────────────────────────────────────────────────────── */

const globCache = new Map();

export function globMatches(pattern, path) {
  const lower = path.toLowerCase();
  const re = compileGlob(pattern.toLowerCase());
  if (pattern.includes('/')) return re.test(lower);
  const slash = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'));
  const basename = slash >= 0 ? lower.slice(slash + 1) : lower;
  return re.test(basename);
}

function compileGlob(pattern) {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  // Glob source is the static seed pattern table — no user input reaches here.
  const re = new RegExp('^' + globToRegexBody(pattern) + '$');
  globCache.set(pattern, re);
  return re;
}

function globToRegexBody(pattern) {
  const out = [];
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

function escapeRegexChar(ch) {
  return REGEX_META_CHARS.has(ch) ? '\\' + ch : ch;
}

/* ── Cooldown ─────────────────────────────────────────────────────────────── */

const DEFAULT_COOLDOWN_MS = 300_000;

function isInCooldown(pattern, now, lastFiredAt) {
  if (!lastFiredAt) return false;
  const last = lastFiredAt[pattern.id];
  if (last === undefined) return false;
  const cooldown = pattern.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  return now - last < cooldown;
}

/* ── History pruning helper ───────────────────────────────────────────────── */

/**
 * Drop events older than windowMs relative to now, then cap at maxEvents.
 * Pure; safe to call before each detect cycle.
 *
 * @param {object[]} history
 * @param {number} now
 * @param {number} [windowMs]
 * @param {number} [maxEvents]
 * @returns {object[]}
 */
export function pruneHistory(
  history,
  now,
  windowMs = DEFAULT_HISTORY_WINDOW_MS,
  maxEvents = DEFAULT_HISTORY_MAX_EVENTS,
) {
  const cutoff = now - windowMs;
  const recent = history.filter((ev) => ev.timestamp >= cutoff);
  return recent.length > maxEvents ? recent.slice(recent.length - maxEvents) : recent;
}
