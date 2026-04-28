/* eslint-disable no-console */
/**
 * analyze-graph-adherence.ts — Wave 50 Phase D
 *
 * Walks the Claude Code session JSONL corpus at
 * ~/.claude/projects/C--Web-App-Agent-IDE/ and classifies every
 * Grep/Read tool_use entry as symbol-shaped, literal-shaped, or unknown.
 *
 * Corpus schema (confirmed from samples):
 *   Each JSONL line is a session event. Lines with type="assistant"
 *   carry message.content[] arrays. Items with type="tool_use" have:
 *     { type: "tool_use", id: string, name: string, input: { ... } }
 *   Grep input has: { pattern: string, path?: string, ... }
 *   Read  input has: { file_path: string, offset?: number, limit?: number }
 *
 * Outputs:
 *   - stdout: human-readable report
 *   - roadmap/wave-50-graph-adherence-data.json: machine-readable archive
 *
 * Run: npx tsx scripts/analyze-graph-adherence.ts
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

import { classifyGrepPattern, classifyShape } from '../src/main/hooks/graphUsageClassifier';

// ─── Config ───────────────────────────────────────────────────────────────────

const CORPUS_DIR = path.join(os.homedir(), '.claude', 'projects', 'C--Web-App-Agent-IDE');
const ROOT = path.resolve(path.join(path.dirname(process.argv[1] ?? ''), '..'));
const OUT_FILE = path.join(ROOT, 'roadmap', 'wave-50-graph-adherence-data.json');
const TARGET_TOOLS = new Set(['Grep', 'Read']);
const SAMPLE_LIMIT = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionStats {
  sessionId: string;
  total: number;
  grepCount: number;
  readCount: number;
  symbolShaped: number;
  literalShaped: number;
  unknownShaped: number;
  adherence: number;
}

interface SampleViolation {
  sessionId: string;
  tool: string;
  pattern: string;
}

interface AnalysisResult {
  corpusDir: string;
  analyzedAt: string;
  filesScanned: number;
  filesWithToolCalls: number;
  skippedLines: number;
  totalGrep: number;
  totalRead: number;
  totalToolCalls: number;
  symbolShaped: number;
  literalShaped: number;
  unknownShaped: number;
  adherenceRate: number;
  decision: string;
  distribution: Record<string, number>;
  perSession: SessionStats[];
  sampleViolations: SampleViolation[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function anonymizePattern(pattern: string): string {
  return pattern.replace(/[A-Za-z]:\\[^\s,]+/g, '<path>').replace(/\/home\/[^\s,]+/g, '<path>');
}

function bucketLabel(adherence: number): string {
  const idx = Math.min(4, Math.floor(adherence * 5));
  return ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'][idx];
}

function pct(n: number, d: number): string {
  return d === 0 ? 'N/A' : `${((n / d) * 100).toFixed(1)}%`;
}

function applyDecision(result: AnalysisResult): void {
  result.adherenceRate =
    result.totalToolCalls > 0 ? 1 - result.symbolShaped / result.totalToolCalls : 1;
  if (result.adherenceRate >= 0.7) {
    result.decision = 'stay log-only';
  } else if (result.adherenceRate >= 0.4) {
    result.decision = 'optional warn';
  } else {
    result.decision = 'enforce';
  }
}

// ─── Item-level processing (extracted to reduce processFile complexity) ────────

/** Shared mutable accumulator threaded through line/item processors. */
interface ProcessCtx {
  stats: SessionStats;
  result: AnalysisResult;
  violations: SampleViolation[];
}

function captureViolation(
  ctx: ProcessCtx,
  sessionId: string,
  name: string,
  input: Record<string, unknown>,
): void {
  if (ctx.violations.length >= SAMPLE_LIMIT || name !== 'Grep') return;
  const raw = typeof input.pattern === 'string' ? input.pattern : '';
  ctx.violations.push({
    sessionId: sessionId.slice(0, 8),
    tool: name,
    pattern: anonymizePattern(raw.slice(0, 80)),
  });
}

function accumulateShape(
  ctx: ProcessCtx,
  sessionId: string,
  name: string,
  input: Record<string, unknown>,
): void {
  const shape = classifyShape(name, input);
  ctx.stats.total++;
  ctx.result.totalToolCalls++;
  if (name === 'Grep') {
    ctx.stats.grepCount++;
    ctx.result.totalGrep++;
  } else {
    ctx.stats.readCount++;
    ctx.result.totalRead++;
  }

  if (shape === 'symbol') {
    ctx.stats.symbolShaped++;
    ctx.result.symbolShaped++;
    captureViolation(ctx, sessionId, name, input);
  } else if (shape === 'literal') {
    ctx.stats.literalShaped++;
    ctx.result.literalShaped++;
  } else {
    ctx.stats.unknownShaped++;
    ctx.result.unknownShaped++;
  }
}

function processToolItem(item: Record<string, unknown>, sessionId: string, ctx: ProcessCtx): void {
  if (item.type !== 'tool_use') return;
  const name = typeof item.name === 'string' ? item.name : '';
  if (!TARGET_TOOLS.has(name)) return;
  const input = (item.input as Record<string, unknown>) ?? {};
  accumulateShape(ctx, sessionId, name, input);
}

function processLine(line: string, sessionId: string, ctx: ProcessCtx): void {
  if (!line.trim()) return;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    ctx.result.skippedLines++;
    return;
  }
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg || !Array.isArray(msg.content)) return;
  for (const item of msg.content as Record<string, unknown>[]) {
    processToolItem(item, sessionId, ctx);
  }
}

// ─── Per-file processing (async streaming) ────────────────────────────────────

async function processFile(
  filePath: string,
  sessionId: string,
  result: AnalysisResult,
  violations: SampleViolation[],
): Promise<void> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const stats: SessionStats = {
    sessionId,
    total: 0,
    grepCount: 0,
    readCount: 0,
    symbolShaped: 0,
    literalShaped: 0,
    unknownShaped: 0,
    adherence: 1,
  };
  const ctx: ProcessCtx = { stats, result, violations };

  for await (const line of rl) {
    processLine(line, sessionId, ctx);
  }

  if (stats.total > 0) {
    stats.adherence = 1 - stats.symbolShaped / stats.total;
    result.filesWithToolCalls++;
    result.perSession.push(stats);
    result.distribution[bucketLabel(stats.adherence)] =
      (result.distribution[bucketLabel(stats.adherence)] ?? 0) + 1;
  }
}

// ─── Report printing ──────────────────────────────────────────────────────────

function printSummary(result: AnalysisResult): void {
  const t = result.totalToolCalls;
  console.log('\n=== Graph-First Adherence Analysis — Wave 50 Phase D ===\n');
  console.log(`Corpus:            ${result.corpusDir}`);
  console.log(`Analyzed at:       ${result.analyzedAt}`);
  console.log(`Files scanned:     ${result.filesScanned} JSONL`);
  console.log(`Sessions w/ calls: ${result.filesWithToolCalls}`);
  console.log(`Skipped lines:     ${result.skippedLines} (malformed JSON)`);
  console.log('');
  console.log(`Total Grep calls:  ${result.totalGrep}`);
  console.log(`Total Read calls:  ${result.totalRead}`);
  console.log(`Total Grep+Read:   ${t}`);
  console.log('');
  console.log(
    `Symbol-shaped:   ${result.symbolShaped}  (${pct(result.symbolShaped, t)}) — potential graph-tool candidates`,
  );
  console.log(
    `Literal-shaped:  ${result.literalShaped} (${pct(result.literalShaped, t)}) — correct tool choice`,
  );
  console.log(
    `Unknown:         ${result.unknownShaped} (${pct(result.unknownShaped, t)}) — empty / malformed`,
  );
  console.log('');
  console.log(
    `Adherence rate:  ${pct(result.literalShaped + result.unknownShaped, t)} (non-symbol-shaped)`,
  );
  console.log(`DECISION:        ${result.decision.toUpperCase()}`);
}

function printDetails(result: AnalysisResult, violations: SampleViolation[]): void {
  console.log('');
  console.log('Per-session distribution (adherence bucket → session count):');
  for (const [label, count] of Object.entries(result.distribution)) {
    console.log(`  ${label}: ${count}`);
  }
  console.log('');
  console.log('Worst-adherence sessions (bottom 5):');
  for (const s of result.perSession.slice(0, 5)) {
    const a = pct(s.literalShaped + s.unknownShaped, s.total);
    console.log(
      `  ${s.sessionId.slice(0, 8)}  total=${s.total}  symbol=${s.symbolShaped}  adherence=${a}`,
    );
  }
  console.log('');
  console.log(`Sample symbol-shaped Grep calls (${violations.length} shown):`);
  for (const v of violations) {
    console.log(`  [${v.sessionId}] ${v.tool}: "${v.pattern}"`);
  }
  console.log('');
  console.log(`Archive written: ${OUT_FILE}`);
}

function printReport(result: AnalysisResult, violations: SampleViolation[]): void {
  printSummary(result);
  printDetails(result, violations);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const entries = fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith('.jsonl'));
  const violations: SampleViolation[] = [];

  const result: AnalysisResult = {
    corpusDir: CORPUS_DIR,
    analyzedAt: new Date().toISOString(),
    filesScanned: entries.length,
    filesWithToolCalls: 0,
    skippedLines: 0,
    totalGrep: 0,
    totalRead: 0,
    totalToolCalls: 0,
    symbolShaped: 0,
    literalShaped: 0,
    unknownShaped: 0,
    adherenceRate: 0,
    decision: '',
    distribution: { '0-20%': 0, '20-40%': 0, '40-60%': 0, '60-80%': 0, '80-100%': 0 },
    perSession: [],
    sampleViolations: [],
  };

  for (const entry of entries) {
    await processFile(
      path.join(CORPUS_DIR, entry),
      entry.replace('.jsonl', ''),
      result,
      violations,
    );
  }

  result.sampleViolations = violations;
  applyDecision(result);
  result.perSession.sort((a, b) => a.adherence - b.adherence);
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  printReport(result, violations);
}

export { classifyGrepPattern, classifyShape };

main().catch((err) => {
  console.error('analyze-graph-adherence: fatal error:', err);
  process.exit(1);
});
