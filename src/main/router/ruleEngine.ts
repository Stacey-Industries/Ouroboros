/**
 * ruleEngine.ts — Deterministic rule-based prompt classifier (Layer 1).
 *
 * Runs synchronously with zero latency. Returns a tier + rule code when
 * a rule matches with sufficient confidence, or null to fall through
 * to the ML classifier (Layer 2).
 */

import type { RuleCode, RuleEngineResult } from './routerTypes';
import { SLASH_COMMAND_TIERS } from './routerTypes';

/* ── Public API ───────────────────────────────────────────────────── */

/**
 * Evaluate a prompt against the rule cascade.
 * Returns the first matching rule, or null if no rule triggers.
 */
export function routeByRules(
  prompt: string,
  previousAssistantMessage?: string,
): RuleEngineResult | null {
  const p = prompt.trim();
  const lower = p.toLowerCase();

  return (
    matchSlashCommand(p) ??
    matchHaikuRules(p, lower, previousAssistantMessage) ??
    matchOpusRules(lower) ??
    matchSonnetConfirmation(p, lower, previousAssistantMessage) ??
    null
  );
}

/* ── Slash-command override (highest priority) ────────────────────── */

function matchSlashCommand(prompt: string): RuleEngineResult | null {
  for (const [cmd, tier] of Object.entries(SLASH_COMMAND_TIERS)) {
    if (prompt.startsWith(cmd)) {
      return { tier, rule: 'CMD', confidence: 'HIGH' };
    }
  }
  return null;
}

/* ── HAIKU rules ──────────────────────────────────────────────────── */

function matchHaikuRules(
  prompt: string,
  lower: string,
  prevAssistant?: string,
): RuleEngineResult | null {
  return (
    matchH1(prompt, prevAssistant) ??
    matchH2(lower) ??
    matchH3(lower) ??
    matchH4(prompt) ??
    matchH5(lower, prevAssistant) ??
    null
  );
}

/** H1 — User directly answers a question the assistant just asked. */
function matchH1(
  prompt: string,
  prevAssistant?: string,
): RuleEngineResult | null {
  if (!prevAssistant) return null;
  if (!prevAssistant.trimEnd().endsWith('?')) return null;
  // Short direct answer — not a new topic or bug report
  if (prompt.length > 120) return null;
  // Must not contain new-observation signals
  if (hasNewObservationSignal(prompt)) return null;
  return haiku('H1');
}

/** H2 — Verification or status check. */
function matchH2(lower: string): RuleEngineResult | null {
  const patterns = [
    /\b(confirm|verify|check if|is it still|does it say)\b/,
    /\b(can you confirm|are all .+ done)\b/,
    /\b(is there more .+ than)\b/,
    /\b(did (all|it|that|the) .+ (complete|finish|work|pass))\b/,
    /\b(are any .+ missing)\b/,
    /\b(is it (still |)running)\b/,
    /\b(did (this|it|that) (finish|complete|work))\b/,
  ];
  if (!patterns.some((rx) => rx.test(lower))) return null;
  // Must be a question or short statement, not a long bug report
  if (lower.length > 200) return null;
  return haiku('H2');
}

/** H3 — Factual question with a definite answer. */
function matchH3(lower: string): RuleEngineResult | null {
  const factualPhrases = [
    'what does', 'what is', 'where is', 'how does',
    'does it load', 'does claude', 'which one is',
    'what are the', 'how many', 'how do i',
  ];
  if (!factualPhrases.some((ph) => lower.includes(ph))) return null;
  // Exclude questions that need investigation (long or multi-sentence)
  if (lower.length > 150) return null;
  // Exclude judgment-seeking even if phrased as factual
  if (hasJudgmentSignal(lower)) return null;
  return haiku('H3');
}

/** H4 — Simple confirmation (very short, no additional instructions). */
function matchH4(prompt: string): RuleEngineResult | null {
  const trimmed = prompt.trim();
  if (trimmed.length > 30) return null;
  const confirmations = [
    /^(yes|no|yep|nope|sure|ok|okay|correct|exactly|right)\.?$/i,
    /^do it\.?$/i,
    /^go for it\.?$/i,
    /^sounds good\.?$/i,
    /^that works\.?$/i,
    /^perfect\.?$/i,
  ];
  if (!confirmations.some((rx) => rx.test(trimmed))) return null;
  return haiku('H4');
}

/** H5 — Simple continuation in a predefined sequence. */
function matchH5(
  lower: string,
  prevAssistant?: string,
): RuleEngineResult | null {
  if (lower.length > 40) return null;
  const navPatterns = [
    /^(next|continue|keep going|move on)\.?$/,
    /^(another \d+ percent)$/,
    /^phase \d+$/,
    /^execute phase \d+$/,
  ];
  if (!navPatterns.some((rx) => rx.test(lower))) return null;
  // Only if there IS a preceding assistant context (in-flight work)
  if (!prevAssistant) return null;
  return haiku('H5');
}

/* ── OPUS rules ───────────────────────────────────────────────────── */

function matchOpusRules(lower: string): RuleEngineResult | null {
  return (
    matchO1(lower) ??
    matchO2(lower) ??
    matchO3(lower) ??
    matchO4(lower) ??
    matchO5(lower) ??
    null
  );
}

/** O1 — Explicit judgment/opinion-seeking language. */
function matchO1(lower: string): RuleEngineResult | null {
  const judgmentPhrases = [
    'what do you think',
    'what should we do',
    'what should i do',
    'any improvements',
    "what's your take",
    'what would you recommend',
    'do you recommend',
    'what is the best approach',
    "what's the best",
    'would you suggest',
    'is this a good approach',
    'evaluate this',
    'is this worthwhile',
  ];
  if (!judgmentPhrases.some((ph) => lower.includes(ph))) return null;
  return opus('O1');
}

/** O2 — Planning or architecture at system scope. */
function matchO2(lower: string): RuleEngineResult | null {
  const planningVerbs = /\b(create a plan|design|architect|spec out|build a (?:detailed |thorough )?plan)\b/;
  if (!planningVerbs.test(lower)) return null;
  const scopeSignals = /\b(entire|whole|all|across|system|codebase|end[- ]to[- ]end|backend.+frontend|frontend.+backend)\b/;
  if (!scopeSignals.test(lower)) return null;
  return opus('O2');
}

/** O3 — Competitive/comparative design references. */
function matchO3(lower: string): RuleEngineResult | null {
  const competitors = [
    'like cursor', 'like windsurf', 'like vs code',
    'like vscode', 'similar to cursor', 'similar to windsurf',
    'industry standard', 'best practice',
    'like copilot', 'like kiro',
  ];
  if (!competitors.some((c) => lower.includes(c))) return null;
  return opus('O3');
}

/** O4 — Multiple unrelated concerns needing prioritization. */
function matchO4(lower: string): RuleEngineResult | null {
  const issueMarkers = [
    'additionally', 'also,', 'second,', 'third,',
    'on top of that', 'another thing',
  ];
  const matchCount = issueMarkers.filter((m) => lower.includes(m)).length;
  // Need 2+ distinct concern markers
  if (matchCount < 2) return null;
  // Must also contain judgment or design language
  if (!hasJudgmentSignal(lower)) return null;
  return opus('O4');
}

/** O5 — Delegation with judgment (not a known checklist). */
function matchO5(lower: string): RuleEngineResult | null {
  const delegationPhrases = [
    'fix what you can',
    'defer what needs my input',
    'your judgment',
    'your choice',
    'anything you think',
    'use your discretion',
    'whatever you think is best',
  ];
  if (!delegationPhrases.some((ph) => lower.includes(ph))) return null;
  // O5 exclusion: executing a known list is SONNET
  if (isKnownChecklist(lower)) return null;
  return opus('O5');
}

/* ── SONNET confirmation rules ────────────────────────────────────── */

function matchSonnetConfirmation(
  _prompt: string,
  lower: string,
  prevAssistant?: string,
): RuleEngineResult | null {
  return (
    matchS1(lower) ??
    matchS3(lower, prevAssistant) ??
    null
  );
}

/** S1 — Pasted-only prompt with no readable instruction. */
function matchS1(lower: string): RuleEngineResult | null {
  if (!/^\[pasted text #\d+/.test(lower)) return null;
  return { tier: 'SONNET', rule: 'S1', confidence: 'MEDIUM' };
}

/** S3 — "Go ahead" after assistant presented a plan. */
function matchS3(
  lower: string,
  prevAssistant?: string,
): RuleEngineResult | null {
  if (!prevAssistant || prevAssistant.length < 300) return null;
  const goAheadPatterns = /^(go ahead|proceed|execute|make those changes|do it|yes.{0,20}go ahead)/;
  if (!goAheadPatterns.test(lower)) return null;
  return sonnet('S3');
}

/* ── Helpers ──────────────────────────────────────────────────────── */

function haiku(rule: RuleCode): RuleEngineResult {
  return { tier: 'HAIKU', rule, confidence: 'HIGH' };
}

function sonnet(rule: RuleCode): RuleEngineResult {
  return { tier: 'SONNET', rule, confidence: 'HIGH' };
}

function opus(rule: RuleCode): RuleEngineResult {
  return { tier: 'OPUS', rule, confidence: 'HIGH' };
}

/** Signals that a prompt is reporting new observations, not answering a question. */
function hasNewObservationSignal(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  const signals = [
    'but now', 'also ', 'still ', 'another ',
    'it shows', 'it says', 'i see', 'i notice',
    'error', 'crash', 'broken', 'not working',
  ];
  return signals.some((s) => lower.includes(s));
}

function hasJudgmentSignal(lower: string): boolean {
  const signals = [
    'think', 'should', 'recommend', 'evaluate',
    'improve', 'best', 'better', 'worth',
  ];
  return signals.some((s) => lower.includes(s));
}

/** Detect references to known document/list (O5 exclusion). */
function isKnownChecklist(lower: string): boolean {
  return /\b(deferred|todo|backlog|checklist|the list)\b/.test(lower);
}
