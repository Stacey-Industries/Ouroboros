/* eslint-disable no-console */
/**
 * analyze-ranker-hit-rate-report.ts — Wave 53b Phase A
 * Report printing helpers for the ranker hit-rate analyzer.
 */

import type { GoalShape } from '../src/main/orchestration/providers/goalClassifier';
import type { AnalysisResult, BucketStats } from './analyze-ranker-hit-rate-types';
import { pct, RECALL_KS } from './analyze-ranker-hit-rate-types';

const BUCKETS: GoalShape[] = ['code', 'casual', 'unknown'];

function printHeader(result: AnalysisResult): void {
  console.log('\n=== Context Ranker Hit-Rate Analysis — Wave 53b Phase A ===\n');
  console.log(`Corpus:             ${result.corpusDir}`);
  console.log(`Analyzed at:        ${result.analyzedAt}`);
  console.log(`Files scanned:      ${result.totalFilesScanned} JSONL`);
  console.log(`Sessions w/ ranker: ${result.sessionsWithRelevantCode} (IDE-orchestrated subset)`);
  console.log(`Sessions filtered:  ${result.sessionsFilteredNoise} (preLoaded<3 OR reads<1)`);
  console.log(`Sessions analyzed:  ${result.sessionsAnalyzed}`);
  console.log(`Skipped lines:      ${result.skippedLines} (malformed JSON)`);
  console.log('');
  console.log('NOTE: CORPUS BIAS — ~40% IDE-orchestrated. Analysis is directionally correct,');
  console.log('   not definitive. Re-run quarterly as unified corpus grows.');
}

function printOverall(result: AnalysisResult): void {
  console.log('');
  console.log('Goal bucket breakdown:');
  for (const [bucket, count] of Object.entries(result.goalBuckets)) {
    console.log(`  ${bucket.padEnd(8)}: ${count}`);
  }
  console.log('');
  console.log('Overall hit rate:');
  console.log(`  Mean:    ${pct(result.overallMeanHitRate)}`);
  console.log(`  Median:  ${pct(result.overallMedianHitRate)}`);
  console.log(`  Any-hit: ${pct(result.overallAnyHitRate)}`);
  console.log('');
  console.log('Recall@k (overall):');
  for (const k of RECALL_KS) {
    const val = result.recallAtK[`recall@${k}`] ?? 0;
    console.log(`  recall@${String(k).padEnd(3)}: ${pct(val)}`);
  }
}

function printBucketRow(bucket: GoalShape, stats: BucketStats): void {
  if (stats.count === 0) {
    console.log(`  ${bucket}: (no sessions)`);
    return;
  }
  console.log(
    `  ${bucket.padEnd(8)}: mean=${pct(stats.meanHitRate)}  ` +
      `median=${pct(stats.medianHitRate)}  any-hit=${pct(stats.anyHitRate)}  n=${stats.count}`,
  );
}

function printBuckets(result: AnalysisResult): void {
  console.log('');
  console.log('Per-bucket hit rates (mean | median | any-hit):');
  for (const bucket of BUCKETS) printBucketRow(bucket, result.byBucket[bucket]);
  console.log('');
  console.log('Recall@k per bucket:');
  const header = 'bucket'.padEnd(10) + RECALL_KS.map((k) => `@${k}`.padEnd(8)).join('');
  console.log('  ' + header);
  for (const bucket of BUCKETS) {
    const stats = result.byBucket[bucket];
    const row =
      bucket.padEnd(10) +
      RECALL_KS.map((k) => pct((stats[`recallAt${k}` as keyof BucketStats] as number) ?? 0).padEnd(8)).join('');
    console.log('  ' + row);
  }
}

function printDistribution(result: AnalysisResult): void {
  console.log('');
  console.log('Hit-rate distribution (bucket → session count):');
  const maxCount = Math.max(1, ...Object.values(result.distribution));
  for (const [label, count] of Object.entries(result.distribution)) {
    const bar = '|'.repeat(Math.round((count / maxCount) * 20));
    console.log(`  ${label.padEnd(8)}: ${String(count).padStart(3)}  ${bar}`);
  }
}

function printMisses(result: AnalysisResult): void {
  console.log('');
  console.log(`Sample zero-hit sessions (${result.topMisses.length} shown):`);
  for (const m of result.topMisses) {
    console.log(`  [${m.sessionId}] preLoaded=${m.score === 0 ? '' : m.score} ${m.path}`);
    console.log(`    ${m.reasons}`);
  }
}

export function printReport(result: AnalysisResult, outFile: string): void {
  printHeader(result);
  printOverall(result);
  printBuckets(result);
  printDistribution(result);
  printMisses(result);
  console.log('');
  console.log(`DECISION: ${result.decision.toUpperCase()}`);
  console.log('');
  console.log(`Archive written: ${outFile}`);
}
