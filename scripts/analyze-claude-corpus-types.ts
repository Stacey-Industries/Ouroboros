/**
 * analyze-claude-corpus-types.ts — Wave 53c Phase B
 *
 * Shared types, constants, and pure-function helpers for the corpus analyzer.
 * No I/O. No Electron imports.
 */

import type { IntentBucket } from './intent-classifier';

// ─── Edit-failure detection ───────────────────────────────────────────────────

/**
 * Canonical Edit mismatch phrase from real corpus samples.
 *
 * Confirmed in corpus via files:
 *   29b99c29 → "String to replace not found in file."
 *   2be858a5 → "String to replace not found in file."
 *
 * This regex is intentionally narrow (Decision 3 in ADR): it targets only
 * the old_string-didn't-match failure mode that Wave 54 would address.
 * Permission errors, missing-file errors, and validation errors are excluded
 * because Wave 54's semantic-aware editing would not help with those.
 *
 * Cite this constant in Phase C report.
 */
export const EDIT_MISMATCH_RE = /String to replace not found in file/i;

// ─── Tool name constants ──────────────────────────────────────────────────────

export const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
export const NON_SEARCH_TOOLS = new Set(['Read', 'Edit', 'Write']);
export const FILE_TOOLS = new Set(['Read', 'Edit', 'Write']);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SessionSummary {
  sessionId: string;
  startTs: string;
  endTs: string;
  durationMs: number;
  toolCounts: Record<string, number>;
  editAttempts: number;
  editFirstTryFailures: number;
  editFirstTryFailureRate: number;
  maxGrepLoopDepth: number;
  intentBucket: IntentBucket;
  intentConfidence: number;
  userPromptCount: number;
  filesTouched: string[];
  tokenUsage: TokenUsage | null;
}

export interface BucketStats {
  mean: number;
  median: number;
  p90: number;
  n: number;
}

export interface AggregateOutput {
  corpusStats: {
    sessionCount: number;
    dateRangeStart: string;
    dateRangeEnd: string;
    sessionsPerWeekHistogram: Record<string, number>;
  };
  intentDistribution: Record<IntentBucket, number>;
  intentXEditFailure: Record<IntentBucket, BucketStats>;
  intentXGrepDepth: Record<IntentBucket, BucketStats>;
  topPromptPatternsByBucket: Record<IntentBucket, Array<{ pattern: string; count: number }>>;
  filesTouchedTopK: Array<{ path: string; sessionCount: number }>;
  sampleBiasNotes: string[];
}

// ─── Per-session mutable accumulator (internal to metrics module) ─────────────

export interface SessionAcc {
  sessionId: string;
  firstTs: string;
  lastTs: string;
  toolCounts: Record<string, number>;
  toolUseIdToName: Record<string, string>;
  editAttempts: number;
  editFirstTryFailures: number;
  /** current consecutive grep/glob run depth */
  currentGrepRun: number;
  maxGrepRun: number;
  userPrompts: string[];
  filesTouched: Set<string>;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  hasTokens: boolean;
  parseErrors: number;
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

export function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function sortedCopy(vals: number[]): number[] {
  return [...vals].sort((a, b) => a - b);
}

export function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = sortedCopy(vals);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export function p90(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = sortedCopy(vals);
  const idx = Math.floor(s.length * 0.9);
  return s[Math.min(idx, s.length - 1)];
}

export function bucketStats(vals: number[]): BucketStats {
  return { mean: mean(vals), median: median(vals), p90: p90(vals), n: vals.length };
}

// ─── Week-bucket helper ───────────────────────────────────────────────────────

/** Returns an ISO week label like "2026-W15" for the given ISO timestamp. */
export function isoWeekLabel(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 'unknown';
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((d.getTime() - jan4.getTime()) / 86400000) + 4;
  const week = Math.ceil(dayOfYear / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ─── CSV serialization ────────────────────────────────────────────────────────

function csvCell(val: unknown): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function sessionToCsvRow(s: SessionSummary): string {
  const toolStr = JSON.stringify(s.toolCounts);
  const filesStr = s.filesTouched.join('|');
  const tok = s.tokenUsage;
  const cells = [
    s.sessionId,
    s.startTs,
    s.endTs,
    s.durationMs,
    csvCell(toolStr),
    s.editAttempts,
    s.editFirstTryFailures,
    s.editFirstTryFailureRate.toFixed(4),
    s.maxGrepLoopDepth,
    s.intentBucket,
    s.intentConfidence.toFixed(4),
    s.userPromptCount,
    csvCell(filesStr),
    tok ? tok.inputTokens : '',
    tok ? tok.outputTokens : '',
    tok ? tok.cacheCreationTokens : '',
    tok ? tok.cacheReadTokens : '',
  ];
  return cells.join(',');
}

export const CSV_HEADER = [
  'sessionId',
  'startTs',
  'endTs',
  'durationMs',
  'toolCounts',
  'editAttempts',
  'editFirstTryFailures',
  'editFirstTryFailureRate',
  'maxGrepLoopDepth',
  'intentBucket',
  'intentConfidence',
  'userPromptCount',
  'filesTouched',
  'inputTokens',
  'outputTokens',
  'cacheCreationTokens',
  'cacheReadTokens',
].join(',');
