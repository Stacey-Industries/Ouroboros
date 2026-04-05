/**
 * routerExporter.ts — Merges routing decisions + quality signals into
 * the format expected by tools/train-router.py.
 *
 * Reads router-decisions.jsonl and router-quality-signals.jsonl via
 * streaming readline (same pattern as usageReader.ts), joins by traceId,
 * and outputs router-full-extracted.jsonl + router-full-judged.jsonl.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import log from '../logger';
import type { QualityAnnotation } from './qualitySignalTypes';
import type { ExtractedRecord, JudgedRecord } from './routerExporterHelpers';
import {
  buildExtractedRecord,
  buildJudgedRecord,
  pickHighestConfidence,
  signalToLabel,
} from './routerExporterHelpers';
import type { EnrichedRoutingLogEntry } from './routerTypes';

/* ── Constants ───────────────────────────────────────────────────────── */

const DECISIONS_FILE = 'router-decisions.jsonl';
const SIGNALS_FILE = 'router-quality-signals.jsonl';
const OUTPUT_EXTRACTED = 'router-full-extracted.jsonl';
const OUTPUT_JUDGED = 'router-full-judged.jsonl';

/* ── Public API ──────────────────────────────────────────────────────── */

export interface ExportOptions {
  /** Directory containing the input JSONL files (defaults to userData). */
  inputDir: string;
  /** Directory for output files (defaults to inputDir). */
  outputDir?: string;
  /** Max records to export (0 = unlimited). */
  maxSamples?: number;
}

export interface ExportResult {
  extractedCount: number;
  judgedCount: number;
  outputDir: string;
}

/**
 * Merge routing decisions with quality signals and export training data.
 * Streams input files — does not load them entirely into memory.
 */
export async function exportTrainingData(opts: ExportOptions): Promise<ExportResult> {
  const outputDir = opts.outputDir ?? opts.inputDir;
  const signals = await loadSignals(opts.inputDir);
  const signalsByTrace = indexSignalsByTrace(signals);
  const signalsBySession = indexSignalsBySession(signals);

  return writeExportFiles({
    inputDir: opts.inputDir,
    outputDir,
    maxSamples: opts.maxSamples ?? 0,
    signalsByTrace,
    signalsBySession,
  });
}

/* ── Signal indexing ─────────────────────────────────────────────────── */

function indexSignalsByTrace(signals: QualityAnnotation[]): Map<string, QualityAnnotation[]> {
  const map = new Map<string, QualityAnnotation[]>();
  for (const s of signals) {
    if (!s.traceId) continue;
    const arr = map.get(s.traceId) ?? [];
    arr.push(s);
    map.set(s.traceId, arr);
  }
  return map;
}

function indexSignalsBySession(signals: QualityAnnotation[]): Map<string, QualityAnnotation[]> {
  const map = new Map<string, QualityAnnotation[]>();
  for (const s of signals) {
    if (!s.sessionId) continue;
    const arr = map.get(s.sessionId) ?? [];
    arr.push(s);
    map.set(s.sessionId, arr);
  }
  return map;
}

/* ── Signal file loader ──────────────────────────────────────────────── */

async function loadSignals(dir: string): Promise<QualityAnnotation[]> {
  const filePath = path.join(dir, SIGNALS_FILE);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is app.getPath('userData'), trusted
  if (!fs.existsSync(filePath)) return [];
  return streamJsonl<QualityAnnotation>(filePath);
}

/* ── Export writer ───────────────────────────────────────────────────── */

interface WriteArgs {
  inputDir: string;
  outputDir: string;
  maxSamples: number;
  signalsByTrace: Map<string, QualityAnnotation[]>;
  signalsBySession: Map<string, QualityAnnotation[]>;
}

async function writeExportFiles(args: WriteArgs): Promise<ExportResult> {
  const { inputDir, outputDir, maxSamples, signalsByTrace, signalsBySession } = args;
  const decisionsPath = path.join(inputDir, DECISIONS_FILE);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
  if (!fs.existsSync(decisionsPath)) {
    return { extractedCount: 0, judgedCount: 0, outputDir };
  }

  const extractedPath = path.join(outputDir, OUTPUT_EXTRACTED);
  const judgedPath = path.join(outputDir, OUTPUT_JUDGED);

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
  const extractedFd = fs.openSync(extractedPath, 'w');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
  const judgedFd = fs.openSync(judgedPath, 'w');

  let extractedCount = 0;
  let judgedCount = 0;

  const entries = await streamJsonl<EnrichedRoutingLogEntry>(decisionsPath);
  for (const entry of entries) {
    if (!isEnrichedEntry(entry)) continue;
    if (maxSamples > 0 && extractedCount >= maxSamples) break;

    writeExtracted(extractedFd, entry);
    extractedCount++;

    const label = resolveLabel(entry, signalsByTrace, signalsBySession);
    if (label) {
      writeJudged(judgedFd, entry.traceId, label.label, label.signalKind);
      judgedCount++;
    }
  }

  fs.closeSync(extractedFd);
  fs.closeSync(judgedFd);
  log.info(`[exporter] wrote ${extractedCount} extracted, ${judgedCount} judged to ${outputDir}`);
  return { extractedCount, judgedCount, outputDir };
}

/* ── Label resolution ────────────────────────────────────────────────── */

interface ResolvedLabel {
  label: { judgedTier: string; confidence: string };
  signalKind: string;
}

function resolveLabel(
  entry: EnrichedRoutingLogEntry,
  byTrace: Map<string, QualityAnnotation[]>,
  bySession: Map<string, QualityAnnotation[]>,
): ResolvedLabel | null {
  const signals = [
    ...(byTrace.get(entry.traceId) ?? []),
    ...(entry.sessionId ? (bySession.get(entry.sessionId) ?? []) : []),
  ];
  if (signals.length === 0) return null;

  const labels = signals
    .map((s) => ({ derived: signalToLabel(s, entry.tier), kind: s.signalKind }))
    .filter((x) => x.derived !== null);

  if (labels.length === 0) return null;
  const best = pickHighestConfidence(labels.map((l) => l.derived!));
  if (!best) return null;

  const bestMatch = labels.find((l) => l.derived!.judgedTier === best.judgedTier);
  return { label: best, signalKind: bestMatch?.kind ?? labels[0].kind };
}

/* ── Record writers ──────────────────────────────────────────────────── */

function writeExtracted(fd: number, entry: EnrichedRoutingLogEntry): void {
  const rec: ExtractedRecord = buildExtractedRecord(entry);
  fs.writeSync(fd, JSON.stringify(rec) + '\n', undefined, 'utf8');
}

function writeJudged(
  fd: number,
  traceId: string,
  label: { judgedTier: string; confidence: string },
  signalKind: string,
): void {
  const rec: JudgedRecord = buildJudgedRecord(
    traceId,
    label as { judgedTier: 'HAIKU' | 'SONNET' | 'OPUS'; confidence: 'HIGH' | 'MEDIUM' | 'LOW' },
    signalKind,
  );
  fs.writeSync(fd, JSON.stringify(rec) + '\n', undefined, 'utf8');
}

/* ── Type guard for enriched entries ─────────────────────────────────── */

function isEnrichedEntry(obj: unknown): obj is EnrichedRoutingLogEntry {
  if (!obj || typeof obj !== 'object') return false;
  const rec = obj as Record<string, unknown>;
  return typeof rec.traceId === 'string' && rec.traceId.length > 0;
}

/* ── Streaming JSONL reader ──────────────────────────────────────────── */

function streamJsonl<T>(filePath: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results: T[] = [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path derived from app.getPath('userData')
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        results.push(JSON.parse(trimmed) as T);
      } catch {
        /* skip malformed */
      }
    });
    rl.on('close', () => resolve(results));
    rl.on('error', reject);
  });
}
