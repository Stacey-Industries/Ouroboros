 
/**
 * analyze-ranker-hit-rate.ts — Wave 53b Phase A
 *
 * Walks ~/.claude/projects/C--Web-App-Agent-IDE/*.jsonl and measures how
 * often the context ranker's pre-loaded files were actually Read by the
 * agent. Writes a machine-readable archive to roadmap/wave-53b-data.json
 * and a human-readable report to stdout.
 *
 * Run: npx tsx scripts/analyze-ranker-hit-rate.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

import type { GoalShape } from '../src/main/orchestration/providers/goalClassifier';
import { printReport } from './analyze-ranker-hit-rate-report';
import type { AnalysisResult, FileResult, SessionMetrics } from './analyze-ranker-hit-rate-types';
import {
  applyDecision,
  bucketLabel,
  buildSessionMetrics,
  collectTopMisses,
  computeBucketStats,
  extractReadPaths,
  extractStringContent,
  mean,
  median,
  normalizePath,
  RECALL_KS,
} from './analyze-ranker-hit-rate-types';

// ─── Config ───────────────────────────────────────────────────────────────────

const CORPUS_DIR = path.join(os.homedir(), '.claude', 'projects', 'C--Web-App-Agent-IDE');
const ROOT = path.resolve(path.join(path.dirname(process.argv[1] ?? ''), '..'));
const OUT_FILE = path.join(ROOT, 'roadmap', 'wave-53b-data.json');

// ─── Per-file streaming parser ────────────────────────────────────────────────

async function scanLines(
  filePath: string,
): Promise<{ turn0Content: string | null; readPaths: Set<string>; skippedLines: number }> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let skippedLines = 0;
  let turn0Content: string | null = null;
  let firstUserSeen = false;
  const readPaths = new Set<string>();

  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      skippedLines++;
      continue;
    }
    if (obj.type === 'user' && !firstUserSeen) {
      firstUserSeen = true;
      const c = extractStringContent(obj);
      if (c) turn0Content = c;
    } else if (obj.type === 'assistant') {
      for (const p of extractReadPaths(obj)) readPaths.add(normalizePath(p));
    }
  }
  return { turn0Content, readPaths, skippedLines };
}

async function processFile(filePath: string, sessionId: string): Promise<FileResult> {
  const { turn0Content, readPaths, skippedLines } = await scanLines(filePath);
  if (!turn0Content?.includes('<relevant_code>')) {
    return { metrics: null, skippedLines, filteredNoise: false, noRelevantCode: true };
  }
  const metrics = buildSessionMetrics(sessionId, turn0Content, readPaths);
  const filteredNoise = metrics === null;
  return { metrics, skippedLines, filteredNoise, noRelevantCode: false };
}

// ─── Result initializer ───────────────────────────────────────────────────────

function makeEmptyBucket() {
  return { count: 0, meanHitRate: 0, medianHitRate: 0, anyHitRate: 0, recallAt1: 0, recallAt3: 0, recallAt5: 0, recallAt10: 0 };
}

function initResult(entries: string[]): AnalysisResult {
  return {
    corpusDir: CORPUS_DIR,
    analyzedAt: new Date().toISOString(),
    totalFilesScanned: entries.length,
    sessionsWithRelevantCode: 0,
    sessionsFilteredNoise: 0,
    sessionsAnalyzed: 0,
    skippedLines: 0,
    goalBuckets: { code: 0, casual: 0, unknown: 0 },
    overallMeanHitRate: 0,
    overallMedianHitRate: 0,
    overallAnyHitRate: 0,
    recallAtK: {},
    distribution: { '0-20%': 0, '20-40%': 0, '40-60%': 0, '60-80%': 0, '80-100%': 0 },
    byBucket: { code: makeEmptyBucket(), casual: makeEmptyBucket(), unknown: makeEmptyBucket() },
    decision: '',
    topMisses: [],
    perSession: [],
  };
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function aggregate(result: AnalysisResult, sessions: SessionMetrics[]): void {
  const hitRates = sessions.map((s) => s.hitRate);
  result.overallMeanHitRate = mean(hitRates);
  result.overallMedianHitRate = median(hitRates);
  result.overallAnyHitRate = sessions.filter((s) => s.anyHit).length / (sessions.length || 1);
  for (const k of RECALL_KS) {
    result.recallAtK[`recall@${k}`] = mean(sessions.map((s) => s[`recallAt${k}` as keyof SessionMetrics] as number));
  }
  for (const bucket of ['code', 'casual', 'unknown'] as GoalShape[]) {
    result.byBucket[bucket] = computeBucketStats(sessions.filter((s) => s.goalBucket === bucket));
  }
  result.decision = applyDecision(result.overallMeanHitRate);
  result.topMisses = collectTopMisses(sessions.filter((s) => !s.anyHit));
  result.perSession = sessions;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const entries = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.jsonl'));
  const result = initResult(entries);
  const analyzed: SessionMetrics[] = [];

  for (const entry of entries) {
    const sessionId = entry.replace('.jsonl', '');
    let fileResult: FileResult;
    try {
      fileResult = await processFile(path.join(CORPUS_DIR, entry), sessionId);
    } catch (err) {
      console.warn(`[warn] Failed to process ${entry}:`, err);
      continue;
    }
    result.skippedLines += fileResult.skippedLines;
    if (fileResult.noRelevantCode) continue;
    result.sessionsWithRelevantCode++;
    if (fileResult.filteredNoise) { result.sessionsFilteredNoise++; continue; }
    if (!fileResult.metrics) continue;
    result.sessionsAnalyzed++;
    result.goalBuckets[fileResult.metrics.goalBucket]++;
    const label = bucketLabel(fileResult.metrics.hitRate);
    result.distribution[label] = (result.distribution[label] ?? 0) + 1;
    analyzed.push(fileResult.metrics);
  }

  aggregate(result, analyzed);
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  printReport(result, OUT_FILE);
}

main().catch((err) => {
  console.error('analyze-ranker-hit-rate: fatal error:', err);
  process.exit(1);
});
