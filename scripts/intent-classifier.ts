/**
 * intent-classifier.ts — Wave 53c Phase A
 *
 * Pure-function user-prompt intent classifier.
 * Takes a prompt string, returns a bucket, confidence score, and
 * the signals that fired the winning bucket.
 *
 * No I/O — no fs, no path, no process imports.
 *
 * Export:
 *   classifyIntent(prompt: string): IntentResult
 *   IntentResult: { bucket: IntentBucket; confidence: number; signals: string[] }
 *   IntentBucket: union of the seven bucket names
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IntentBucket =
  | 'bug-fix'
  | 'feature'
  | 'refactor'
  | 'review'
  | 'meta-ux'
  | 'continuation'
  | 'other';

export interface IntentResult {
  bucket: IntentBucket;
  confidence: number;
  signals: string[];
}

// ─── Bucket definitions ───────────────────────────────────────────────────────

/**
 * Each bucket entry is a human-readable signal name paired with a RegExp.
 * The regex is tested case-insensitively against the full prompt.
 */
type SignalEntry = { name: string; re: RegExp };

const CONTINUATION_SIGNALS: SignalEntry[] = [
  { name: 'go-ahead', re: /\bgo\s+ahead\b/ },
  { name: 'continue', re: /\bcontinue\b/ },
  { name: 'proceed', re: /\bproceed\b/ },
  { name: 'do-it', re: /\bdo\s+it\b/ },
  { name: 'next', re: /\bnext\b/ },
  { name: 'ok-affirmative', re: /^ok[.\s!]*$/i },
  { name: 'yes-affirmative', re: /^yes[.\s!]*$/i },
  { name: 'go-bare', re: /^go[.\s!]*$/i },
  { name: 'sounds-good', re: /\bsounds\s+good\b/ },
  { name: 'looks-good', re: /\blooks\s+good\b/ },
  { name: 'lgtm', re: /\blgtm\b/ },
  { name: 'ship-it', re: /\bship\s+it\b/ },
];

const BUG_FIX_SIGNALS: SignalEntry[] = [
  { name: 'fix', re: /\bfix(ed|es|ing)?\b/ },
  { name: 'broken', re: /\bbroken\b/ },
  { name: 'error', re: /\berror\b/ },
  { name: 'bug', re: /\bbug\b/ },
  { name: 'crash', re: /\bcrash(es|ing|ed)?\b/ },
  { name: "doesn't-work", re: /doesn'?t\s+work/ },
  { name: 'not-working', re: /\bnot\s+working\b/ },
  { name: 'regression', re: /\bregression\b/ },
  { name: 'failing', re: /\bfail(s|ed|ing)?\b/ },
  { name: 'issue', re: /\bissue\b/ },
  { name: 'wrong', re: /\bwrong\b/ },
  { name: 'exception', re: /\bexception\b/ },
];

const FEATURE_SIGNALS: SignalEntry[] = [
  { name: 'add', re: /\badd\b/ },
  { name: 'new', re: /\bnew\b/ },
  { name: 'implement', re: /\bimplement(ed|s|ing)?\b/ },
  { name: 'build', re: /\bbuild\b/ },
  { name: 'create', re: /\bcreate\b/ },
  { name: 'support-for', re: /\bsupport\s+for\b/ },
  { name: 'feature', re: /\bfeature\b/ },
  { name: 'introduce', re: /\bintroduce\b/ },
  { name: 'wire-up', re: /\bwire\s+up\b/ },
];

const REFACTOR_SIGNALS: SignalEntry[] = [
  { name: 'refactor', re: /\brefactor(ed|s|ing)?\b/ },
  { name: 'rename', re: /\brename\b/ },
  { name: 'extract', re: /\bextract\b/ },
  { name: 'split', re: /\bsplit\b/ },
  { name: 'consolidate', re: /\bconsolidate\b/ },
  { name: 'clean-up', re: /\bclean\s*up\b/ },
  { name: 'reorganize', re: /\breorganize\b/ },
  { name: 'move', re: /\bmove\b/ },
  { name: 'restructure', re: /\brestructure\b/ },
  { name: 'simplify', re: /\bsimplify\b/ },
];

const REVIEW_SIGNALS: SignalEntry[] = [
  { name: 'review', re: /\breview\b/ },
  { name: 'audit', re: /\baudit\b/ },
  { name: 'check', re: /\bcheck\b/ },
  { name: 'look-at', re: /\blook\s+at\b/ },
  { name: 'what-do-you-think', re: /what\s+do\s+you\s+think/ },
  { name: 'is-this', re: /\bis\s+this\b/ },
  { name: 'should-this', re: /\bshould\s+this\b/ },
  { name: 'double-check', re: /\bdouble[\s-]check\b/ },
  { name: 'confirm', re: /\bconfirm\b/ },
  { name: 'verify', re: /\bverify\b/ },
];

const META_UX_SIGNALS: SignalEntry[] = [
  { name: 'you-keep-doing', re: /you\s+keep\s+(doing|saying|adding)/ },
  { name: 'stop-doing', re: /\bstop\s+(doing|adding|using)\b/ },
  { name: 'dont', re: /\bdon'?t\b/ },
  { name: 'always', re: /\balways\b/ },
  { name: 'never', re: /\bnever\b/ },
  { name: 'from-now-on', re: /from\s+now\s+on/ },
  { name: 'the-agent', re: /\bthe\s+agent\b/ },
  { name: 'you-should', re: /\byou\s+should\b/ },
  { name: 'claude', re: /\bclaude\b/ },
];

// ─── Ordered bucket list (priority for tie-breaking, continuation is special) ─

type BucketEntry = { bucket: IntentBucket; signals: SignalEntry[] };

const ORDERED_BUCKETS: BucketEntry[] = [
  { bucket: 'bug-fix', signals: BUG_FIX_SIGNALS },
  { bucket: 'refactor', signals: REFACTOR_SIGNALS },
  { bucket: 'feature', signals: FEATURE_SIGNALS },
  { bucket: 'review', signals: REVIEW_SIGNALS },
  { bucket: 'meta-ux', signals: META_UX_SIGNALS },
];

// ─── Continuation shortlist for fast-path check ───────────────────────────────

/** Short continuation prompts match the whole prompt; longer ones use signals. */
const CONTINUATION_EXACT = new Set([
  'go',
  'go ahead',
  'continue',
  'yes',
  'ok',
  'okay',
  'next',
  'proceed',
  'do it',
  'ok do it',
  'sure',
  'yep',
  'yup',
  'sounds good',
  'looks good',
  'lgtm',
  'ship it',
  'great',
  'perfect',
  'done',
  'agreed',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function matchSignals(prompt: string, signals: SignalEntry[]): string[] {
  const lower = prompt.toLowerCase();
  return signals.filter((s) => s.re.test(lower)).map((s) => s.name);
}

function clampConfidence(raw: number): number {
  return Math.min(1, Math.max(0, raw));
}

function computeConfidence(matchCount: number, totalSignals: number): number {
  if (totalSignals === 0) return 0;
  return clampConfidence(matchCount / totalSignals);
}

function isContinuation(prompt: string): boolean {
  const trimmed = prompt
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .trim();
  if (CONTINUATION_EXACT.has(trimmed)) return true;
  if (trimmed.length > 40) return false;
  return matchSignals(trimmed, CONTINUATION_SIGNALS).length > 0;
}

// ─── Helpers (continued) ─────────────────────────────────────────────────────

function buildContinuationResult(prompt: string): IntentResult {
  const matched = matchSignals(prompt, CONTINUATION_SIGNALS);
  const trimmed = prompt
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, '')
    .trim();
  const signals =
    matched.length > 0 ? matched : CONTINUATION_EXACT.has(trimmed) ? ['exact-match'] : [];
  return { bucket: 'continuation', confidence: 1, signals };
}

function pickWinner(prompt: string): IntentResult | null {
  let winner: IntentResult | null = null;
  for (const entry of ORDERED_BUCKETS) {
    const matched = matchSignals(prompt, entry.signals);
    if (matched.length === 0) continue;
    const confidence = computeConfidence(matched.length, entry.signals.length);
    if (!winner || matched.length > winner.signals.length) {
      winner = { bucket: entry.bucket, confidence, signals: matched };
    }
  }
  return winner;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function classifyIntent(prompt: string): IntentResult {
  const other: IntentResult = { bucket: 'other', confidence: 0, signals: [] };
  if (!prompt || !prompt.trim()) return other;
  if (isContinuation(prompt)) return buildContinuationResult(prompt);
  return pickWinner(prompt) ?? other;
}
