/**
 * analyze-claude-corpus.ts — Wave 53c Phase B
 *
 * Walks ~/.claude/projects/<project>/*.jsonl, computes per-session metrics,
 * and emits:
 *   <out-dir>/corpus-analysis.csv   — one row per session
 *   <out-dir>/corpus-analysis.json  — aggregate cross-tabs
 *
 * Run:
 *   npx tsx scripts/analyze-claude-corpus.ts
 *   npx tsx scripts/analyze-claude-corpus.ts --project=C--Web-App-Agent-IDE
 *   npx tsx scripts/analyze-claude-corpus.ts --out-dir=./roadmap/wave-53c-output/
 *   npx tsx scripts/analyze-claude-corpus.ts --json-only
 *
 * Edit-failure regex (ADR Decision 3):
 *   /String to replace not found in file/i
 *   Confirmed phrase from corpus: "String to replace not found in file."
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

import { finalizeSession, makeAcc, processLine } from './analyze-claude-corpus-metrics';
import {
  type AggregateOutput,
  bucketStats,
  CSV_HEADER,
  isoWeekLabel,
  type SessionSummary,
  sessionToCsvRow,
} from './analyze-claude-corpus-types';
import type { IntentBucket } from './intent-classifier';

// ─── CLI flag parsing ─────────────────────────────────────────────────────────

interface CliOptions {
  project: string;
  outDir: string;
  jsonOnly: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let project = 'C--Web-App-Agent-IDE';
  const root = path.resolve(path.join(path.dirname(process.argv[1] ?? ''), '..'));
  let outDir = path.join(root, 'roadmap', 'wave-53c-output');
  let jsonOnly = false;
  for (const arg of args) {
    if (arg.startsWith('--project=')) project = arg.slice('--project='.length);
    else if (arg.startsWith('--out-dir=')) outDir = arg.slice('--out-dir='.length);
    else if (arg === '--json-only') jsonOnly = true;
  }
  return { project, outDir, jsonOnly };
}

// ─── File processing ──────────────────────────────────────────────────────────

async function processFile(
  filePath: string,
  sessionId: string,
): Promise<SessionSummary & { parseErrors: number }> {
  const acc = makeAcc(sessionId);
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    processLine(acc, line);
  }
  return { ...finalizeSession(acc), parseErrors: acc.parseErrors };
}

// ─── Aggregate helpers ────────────────────────────────────────────────────────

const ALL_BUCKETS: IntentBucket[] = [
  'bug-fix',
  'feature',
  'refactor',
  'review',
  'meta-ux',
  'continuation',
  'other',
];

function buildIntentDistribution(sessions: SessionSummary[]): Record<IntentBucket, number> {
  const dist = Object.fromEntries(ALL_BUCKETS.map((b) => [b, 0])) as Record<IntentBucket, number>;
  for (const s of sessions) dist[s.intentBucket]++;
  return dist;
}

function buildIntentXMetric(
  sessions: SessionSummary[],
  getValue: (s: SessionSummary) => number,
): Record<IntentBucket, ReturnType<typeof bucketStats>> {
  const result = {} as Record<IntentBucket, ReturnType<typeof bucketStats>>;
  for (const b of ALL_BUCKETS) {
    result[b] = bucketStats(sessions.filter((s) => s.intentBucket === b).map(getValue));
  }
  return result;
}

function buildTopPromptPatterns(
  sessions: SessionSummary[],
): Record<IntentBucket, Array<{ pattern: string; count: number }>> {
  const byBucket: Record<string, Map<string, number>> = {};
  for (const b of ALL_BUCKETS) byBucket[b] = new Map();
  for (const s of sessions) {
    const topTool = Object.entries(s.toolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
    const m = byBucket[s.intentBucket];
    m?.set(topTool, (m.get(topTool) ?? 0) + 1);
  }
  const out = {} as Record<IntentBucket, Array<{ pattern: string; count: number }>>;
  for (const b of ALL_BUCKETS) {
    out[b] = [...(byBucket[b]?.entries() ?? [])]
      .map(([pattern, count]) => ({ pattern, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
  return out;
}

function buildFilesTouchedTopK(
  sessions: SessionSummary[],
): Array<{ path: string; sessionCount: number }> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    for (const f of s.filesTouched) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([p, sessionCount]) => ({ path: p, sessionCount }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
    .slice(0, 20);
}

function buildWeekHistogram(sessions: SessionSummary[]): Record<string, number> {
  const hist: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.startTs) continue;
    const week = isoWeekLabel(s.startTs);
    hist[week] = (hist[week] ?? 0) + 1;
  }
  return hist;
}

function buildSampleBiasNotes(
  sessions: SessionSummary[],
  topK: Array<{ path: string; sessionCount: number }>,
): string[] {
  const total = sessions.length;
  if (total === 0) return ['No sessions analyzed.'];
  const notes: string[] = [];
  const top = topK[0];
  if (top && top.sessionCount / total > 0.3) {
    const pct = Math.round((top.sessionCount / total) * 100);
    notes.push(
      `Top file "${top.path}" in ${top.sessionCount}/${total} sessions (${pct}%) — corpus may be skewed.`,
    );
  }
  const withEdit = sessions.filter((s) => s.editAttempts > 0).length;
  const editPct = Math.round((withEdit / total) * 100);
  notes.push(`${withEdit}/${total} sessions (${editPct}%) contain at least one Edit attempt.`);
  return notes;
}

function buildAggregate(sessions: SessionSummary[]): AggregateOutput {
  const sorted = [...sessions].sort((a, b) => a.startTs.localeCompare(b.startTs));
  const topK = buildFilesTouchedTopK(sessions);
  return {
    corpusStats: {
      sessionCount: sessions.length,
      dateRangeStart: sorted[0]?.startTs ?? '',
      dateRangeEnd: sorted[sorted.length - 1]?.startTs ?? '',
      sessionsPerWeekHistogram: buildWeekHistogram(sessions),
    },
    intentDistribution: buildIntentDistribution(sessions),
    intentXEditFailure: buildIntentXMetric(sessions, (s) => s.editFirstTryFailureRate),
    intentXGrepDepth: buildIntentXMetric(sessions, (s) => s.maxGrepLoopDepth),
    topPromptPatternsByBucket: buildTopPromptPatterns(sessions),
    filesTouchedTopK: topK,
    sampleBiasNotes: buildSampleBiasNotes(sessions, topK),
  };
}

// ─── Output writing ───────────────────────────────────────────────────────────

function writeOutputs(opts: CliOptions, sessions: SessionSummary[]): void {
  const aggregate = buildAggregate(sessions);
  const jsonPath = path.join(opts.outDir, 'corpus-analysis.json');
  fs.writeFileSync(jsonPath, JSON.stringify(aggregate, null, 2));
  console.warn(`[info] JSON written: ${jsonPath}`);
  if (opts.jsonOnly) return;
  const csvPath = path.join(opts.outDir, 'corpus-analysis.csv');
  const rows = [CSV_HEADER, ...sessions.map(sessionToCsvRow)].join('\n');
  fs.writeFileSync(csvPath, rows + '\n');
  console.warn(`[info] CSV written: ${csvPath} (${sessions.length} rows)`);
}

// ─── Corpus scanning ──────────────────────────────────────────────────────────

async function scanCorpus(
  corpusDir: string,
  entries: string[],
): Promise<{ sessions: SessionSummary[]; parseErrors: number; fileErrors: number }> {
  const sessions: SessionSummary[] = [];
  let parseErrors = 0;
  let fileErrors = 0;
  for (const entry of entries) {
    const sessionId = entry.replace('.jsonl', '');
    try {
      const result = await processFile(path.join(corpusDir, entry), sessionId);
      const { parseErrors: pe, ...summary } = result;
      parseErrors += pe;
      sessions.push(summary);
    } catch (err) {
      fileErrors++;
      console.warn(`[warn] Failed to process ${entry}: ${String(err)}`);
    }
  }
  return { sessions, parseErrors, fileErrors };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs();
  const corpusDir = path.join(os.homedir(), '.claude', 'projects', opts.project);
  if (!fs.existsSync(corpusDir)) {
    console.error(`[fatal] Corpus directory not found: ${corpusDir}`);
    process.exit(1);
  }
  fs.mkdirSync(opts.outDir, { recursive: true });
  const entries = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.jsonl'));
  console.warn(`[info] Scanning ${entries.length} sessions in ${corpusDir}`);
  const { sessions, parseErrors, fileErrors } = await scanCorpus(corpusDir, entries);
  writeOutputs(opts, sessions);
  process.stdout.write(
    `analyze-claude-corpus: ${sessions.length} sessions, ${parseErrors} parse errors, ${fileErrors} file errors\n`,
  );
}

main().catch((err) => {
  console.error('analyze-claude-corpus: fatal error:', err);
  process.exit(1);
});
