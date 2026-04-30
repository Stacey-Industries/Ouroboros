/**
 * patterns.ts — Seed library of delegation patterns.
 *
 * Hand-curated. Each entry is a pure-data PatternDefinition the detector
 * interprets at runtime. The build step emits this list as
 * `out/coach-patterns.json` for `~/.claude/hooks/delegation_coach.mjs`.
 *
 * All patterns ship at the soft tier per Wave 61 ADR Decision 3 — promote to
 * acknowledgment / hard tiers only after Phase F soak data shows the pattern
 * is high-precision and the take-rate justifies the friction.
 *
 * Patterns deferred to a follow-up because the simple trigger DSL can't
 * express them yet:
 *   - "Repetitive edit" (same Edit shape across N files) — needs same-shape
 *     diffing; defer until detector grows a per-call argument-fingerprint.
 *   - "Failed-fix loop" — needs same-target tracking across Edit attempts.
 *   - "Library API research" — needs file-content inspection (do imports
 *     exist; is there a recent context7 lookup).
 *   - "Mass lint cleanup" — needs lint context outside the tool stream.
 *   - "New module being designed" — needs Write content size inspection.
 */

import type { PatternDefinition } from './types';

/** Default cooldown: 5 minutes. Shared across patterns unless overridden. */
const DEFAULT_COOLDOWN_MS = 300_000;

export const SEED_PATTERNS: PatternDefinition[] = [
  {
    id: 'multi-file-scan-no-edit',
    name: 'Multi-file scan, no edit',
    description:
      'Opus has read 3+ files in the last 60s without editing or writing. ' +
      'This is the classic haiku-explorer task shape.',
    trigger: {
      current: { tool: 'Read' },
      history: [
        { match: { tool: 'Read' }, count: { min: 3 }, withinMs: 60_000 },
        { match: { tool: 'Edit' }, count: { max: 0 }, withinMs: 60_000 },
        { match: { tool: 'Write' }, count: { max: 0 }, withinMs: 60_000 },
      ],
    },
    suggestion:
      'You have read 3+ files without editing. If this is exploration, dispatch ' +
      'haiku-explorer with a specific return shape (file:line list, symbol summary, ' +
      'pattern enumeration). Reading more files yourself burns context that the ' +
      'subagent would absorb in isolation.',
    escalation: 'soft',
    cooldownMs: DEFAULT_COOLDOWN_MS,
    confidence: 0.75,
  },
  {
    id: 'symbol-chase-no-graph',
    name: 'Symbol chase without graph tools',
    description:
      'Grep followed by 3+ Reads of files containing the searched identifier. ' +
      'The codebase graph (trace_call_path / search_graph) returns the same ' +
      'information in one structured call without the false-positive noise.',
    trigger: {
      current: { tool: ['Read', 'Grep'] },
      history: [
        { match: { tool: 'Grep' }, count: { min: 1 }, withinMs: 120_000 },
        { match: { tool: 'Read' }, count: { min: 3 }, withinMs: 120_000 },
      ],
    },
    suggestion:
      'Grep + multiple Reads on related files = symbol chase. The codebase graph ' +
      'is faster and more precise here. Use servers.ouroboros.trace_call_path ' +
      '(callers/callees) or servers.ouroboros.search_graph (definition by name) ' +
      'instead. Grep returns text matches in comments and unrelated same-name ' +
      'occurrences; the graph returns actual structural edges.',
    escalation: 'soft',
    cooldownMs: DEFAULT_COOLDOWN_MS,
    confidence: 0.7,
  },
  {
    id: 'test-first-violation',
    name: 'Test-first violation',
    description:
      'About to Edit an implementation file after reading both the impl and a ' +
      'corresponding test file, without writing a failing test first.',
    trigger: {
      current: { tool: 'Edit', argPathDoesNotMatch: '*.test.*' },
      history: [
        {
          match: { tool: 'Read', argPathMatches: '*.test.*' },
          count: { min: 1 },
          withinMs: 120_000,
        },
        {
          match: { tool: 'Write', argPathMatches: '*.test.*' },
          count: { max: 0 },
          withinMs: 120_000,
        },
      ],
    },
    suggestion:
      'You read a test file but are editing implementation without first writing ' +
      'a failing test. Invoke the superpowers:test-driven-development skill — write ' +
      'the failing assertion that proves the bug or new requirement, then implement.',
    escalation: 'soft',
    cooldownMs: DEFAULT_COOLDOWN_MS,
    confidence: 0.7,
  },
  {
    id: 'test-authorship-for-existing-function',
    name: 'Test authorship for existing function',
    description:
      'About to Write a *.test.* file after reading the corresponding source. ' +
      'Tight-spec test scaffolding — exactly haiku-test-author shape.',
    trigger: {
      current: { tool: 'Write', argPathMatches: '*.test.*' },
      history: [
        {
          match: { tool: 'Read', argPathDoesNotMatch: '*.test.*' },
          count: { min: 1 },
          withinMs: 120_000,
        },
      ],
    },
    suggestion:
      'Writing tests for an existing function is haiku-test-author shape. The ' +
      'function signature is the contract; happy path + boundary cases is mechanical. ' +
      'Dispatching saves your context window for the surrounding work.',
    escalation: 'soft',
    cooldownMs: DEFAULT_COOLDOWN_MS,
    confidence: 0.65,
  },
  {
    id: 'large-read-burst',
    name: 'Large read burst — orientation suggested',
    description:
      'Opus has read 6+ files in the current window — likely orienting in an ' +
      'unfamiliar subsystem. The graph architecture summary returns the ' +
      'subsystem shape in one call.',
    trigger: {
      current: { tool: 'Read' },
      history: [{ match: { tool: 'Read' }, count: { min: 6 }, withinMs: 120_000 }],
    },
    suggestion:
      'You have read 6+ files. If you are orienting in a subsystem, ' +
      'servers.ouroboros.get_architecture returns the file map, hotspots, and ' +
      'top-connected functions in one structured call. Use it before more Reads.',
    escalation: 'soft',
    cooldownMs: DEFAULT_COOLDOWN_MS,
    confidence: 0.6,
  },
];

/** Convenience export for the build step / runtime that filters disabled entries. */
export function activePatterns(all: PatternDefinition[] = SEED_PATTERNS): PatternDefinition[] {
  return all.filter((p) => p.enabled !== false);
}
