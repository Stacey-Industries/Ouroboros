/**
 * analyze-ranker-hit-rate-types.ts — Wave 53b Phase A
 * Shared types and pure-function helpers for the ranker hit-rate analyzer.
 */

import path from 'path';

import { classifyGoal, type GoalShape } from '../src/main/orchestration/providers/goalClassifier';

// ─── Constants ────────────────────────────────────────────────────────────────

export const RECALL_KS = [1, 3, 5, 10] as const;
export const MIN_PRE_LOADED = 3;
export const MIN_READS = 1;
export const SAMPLE_MISS_LIMIT = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreLoadedFile {
  path: string;
  score: number;
  confidence: string;
  reasons: string;
}

export interface SessionMetrics {
  sessionId: string;
  goalBucket: GoalShape;
  goalText: string;
  preLoadedCount: number;
  totalReads: number;
  uniquePreLoadedReads: number;
  hitRate: number;
  anyHit: boolean;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
}

export interface TopMiss {
  sessionId: string;
  rank: number;
  path: string;
  score: number;
  reasons: string;
}

export interface BucketStats {
  count: number;
  meanHitRate: number;
  medianHitRate: number;
  anyHitRate: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  recallAt10: number;
}

export interface AnalysisResult {
  corpusDir: string;
  analyzedAt: string;
  totalFilesScanned: number;
  sessionsWithRelevantCode: number;
  sessionsFilteredNoise: number;
  sessionsAnalyzed: number;
  skippedLines: number;
  goalBuckets: Record<GoalShape, number>;
  overallMeanHitRate: number;
  overallMedianHitRate: number;
  overallAnyHitRate: number;
  recallAtK: Record<string, number>;
  distribution: Record<string, number>;
  byBucket: Record<GoalShape, BucketStats>;
  decision: string;
  topMisses: TopMiss[];
  perSession: SessionMetrics[];
}

export interface FileResult {
  metrics: SessionMetrics | null;
  skippedLines: number;
  filteredNoise: boolean;
  noRelevantCode: boolean;
}

// ─── XML parsing ──────────────────────────────────────────────────────────────

const FILE_TAG_RE =
  /<file\s+path="([^"]+)"\s+score="([^"]+)"\s+confidence="([^"]+)"\s+reasons="([^"]*)"/g;

export function parseRelevantCodeFiles(content: string): PreLoadedFile[] {
  const rcStart = content.indexOf('<relevant_code>');
  const rcEnd = content.indexOf('</relevant_code>');
  if (rcStart < 0 || rcEnd < 0) return [];
  const block = content.slice(rcStart, rcEnd + '</relevant_code>'.length);
  const files: PreLoadedFile[] = [];
  FILE_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_TAG_RE.exec(block)) !== null) {
    files.push({ path: match[1], score: parseFloat(match[2]) || 0, confidence: match[3], reasons: match[4] });
  }
  return files;
}

export function extractGoalText(content: string): string {
  const idx = content.indexOf('<ide_context>');
  if (idx < 0) return content.slice(0, 500).trim();
  return content.slice(0, idx).trim();
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

// ─── Metric computation ───────────────────────────────────────────────────────

export function computeRecallAtK(preLoaded: PreLoadedFile[], readPaths: Set<string>, k: number): number {
  if (preLoaded.length === 0) return 0;
  const topK = preLoaded.slice(0, k);
  const hits = topK.filter((f) => readPaths.has(normalizePath(f.path))).length;
  return hits / topK.length;
}

export function computeHitRate(preLoaded: PreLoadedFile[], readPaths: Set<string>): number {
  if (preLoaded.length === 0) return 0;
  const hits = preLoaded.filter((f) => readPaths.has(normalizePath(f.path))).length;
  return hits / preLoaded.length;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function bucketLabel(rate: number): string {
  const idx = Math.min(4, Math.floor(rate * 5));
  return ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'][idx];
}

export function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function applyDecision(meanHitRate: number): string {
  if (meanHitRate >= 0.7) return 'no-change';
  if (meanHitRate >= 0.4) return 'tune';
  return 'redesign';
}

export function computeBucketStats(sessions: SessionMetrics[]): BucketStats {
  if (sessions.length === 0) {
    return { count: 0, meanHitRate: 0, medianHitRate: 0, anyHitRate: 0, recallAt1: 0, recallAt3: 0, recallAt5: 0, recallAt10: 0 };
  }
  const hitRates = sessions.map((s) => s.hitRate);
  return {
    count: sessions.length,
    meanHitRate: mean(hitRates),
    medianHitRate: median(hitRates),
    anyHitRate: sessions.filter((s) => s.anyHit).length / sessions.length,
    recallAt1: mean(sessions.map((s) => s.recallAt1)),
    recallAt3: mean(sessions.map((s) => s.recallAt3)),
    recallAt5: mean(sessions.map((s) => s.recallAt5)),
    recallAt10: mean(sessions.map((s) => s.recallAt10)),
  };
}

export function collectTopMisses(sessions: SessionMetrics[]): TopMiss[] {
  const misses: TopMiss[] = [];
  for (const session of sessions) {
    if (misses.length >= SAMPLE_MISS_LIMIT) break;
    misses.push({
      sessionId: session.sessionId.slice(0, 8),
      rank: 1,
      path: session.goalText.slice(0, 60),
      score: 0,
      reasons: `preLoaded=${session.preLoadedCount} reads=${session.totalReads} bucket=${session.goalBucket}`,
    });
  }
  return misses;
}

// ─── JSONL line extraction ────────────────────────────────────────────────────

function extractFromToolResult(block: Record<string, unknown>): string | null {
  const inner = block.content;
  if (typeof inner === 'string') return inner;
  return null;
}

export function extractStringContent(obj: Record<string, unknown>): string | null {
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return null;
  const content = msg.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  for (const block of content as Record<string, unknown>[]) {
    if (block.type === 'text' && typeof block.text === 'string') return block.text;
    if (block.type === 'tool_result') {
      const s = extractFromToolResult(block);
      if (s) return s;
    }
  }
  return null;
}

export function extractReadPaths(obj: Record<string, unknown>): string[] {
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return [];
  const content = msg.content;
  if (!Array.isArray(content)) return [];
  const paths: string[] = [];
  for (const block of content as Record<string, unknown>[]) {
    if (block.type !== 'tool_use' || block.name !== 'Read') continue;
    const input = block.input as Record<string, unknown> | undefined;
    if (input && typeof input.file_path === 'string') paths.push(input.file_path);
  }
  return paths;
}

// ─── Session metrics builder ──────────────────────────────────────────────────

export function buildSessionMetrics(
  sessionId: string,
  turn0Content: string,
  readPaths: Set<string>,
): SessionMetrics | null {
  const preLoaded = parseRelevantCodeFiles(turn0Content);
  if (preLoaded.length < MIN_PRE_LOADED || readPaths.size < MIN_READS) return null;
  const goalText = extractGoalText(turn0Content);
  const goalBucket = classifyGoal(goalText);
  const hitRate = computeHitRate(preLoaded, readPaths);
  const uniqueHits = preLoaded.filter((f) => readPaths.has(normalizePath(f.path))).length;
  return {
    sessionId,
    goalBucket,
    goalText: goalText.slice(0, 200),
    preLoadedCount: preLoaded.length,
    totalReads: readPaths.size,
    uniquePreLoadedReads: uniqueHits,
    hitRate,
    anyHit: uniqueHits > 0,
    recallAt1: computeRecallAtK(preLoaded, readPaths, 1),
    recallAt3: computeRecallAtK(preLoaded, readPaths, 3),
    recallAt5: computeRecallAtK(preLoaded, readPaths, 5),
    recallAt10: computeRecallAtK(preLoaded, readPaths, 10),
  };
}

// Keep path import used via re-export consumers
export const pathModule = path;
