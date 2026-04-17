/**
 * researchDashboardHandlers.ts — IPC handler for the research metrics dashboard
 * (Wave 30 Phase H).
 *
 * Channel: research:getDashboardMetrics
 *
 * Aggregates data from:
 *   - SQLite research_invocations table (via TelemetryStore)
 *   - research-outcomes-YYYY-MM-DD.jsonl (daily JSONL)
 *   - corrections-YYYY-MM-DD.jsonl (daily JSONL)
 *
 * Results are cached in-main for 60 s per range to avoid repeated queries.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain } from 'electron';

import log from '../logger';
import { getTelemetryStore } from '../telemetry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardRange = '7d' | '30d' | 'all';

export interface ResearchDashboardMetrics {
  range: DashboardRange;
  window: { fromIso: string; toIso: string };
  invocations: {
    total: number;
    byTrigger: Record<'hook' | 'fact-claim' | 'slash' | 'correction' | 'other', number>;
    cacheHitRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
  outcomes: {
    total: number;
    accepted: number;
    reverted: number;
    unknown: number;
    acceptanceRate: number;
  };
  correlated: {
    firedCount: number;
    outcomeCorrelatedCount: number;
    falsePositiveCount: number;
    falsePositiveRate: number;
  };
  corrections: {
    total: number;
    enhancedLibrariesCount: number;
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  at: number;
  value: ResearchDashboardMetrics;
}

const CACHE_TTL_MS = 60_000;
const metricsCache = new Map<DashboardRange, CacheEntry>();

function getCached(range: DashboardRange): ResearchDashboardMetrics | null {
  const entry = metricsCache.get(range);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    metricsCache.delete(range);
    return null;
  }
  return entry.value;
}

function setCache(range: DashboardRange, value: ResearchDashboardMetrics): void {
  metricsCache.set(range, { at: Date.now(), value });
}

// ─── Range helpers ────────────────────────────────────────────────────────────

function rangeToSinceMs(range: DashboardRange): number {
  if (range === 'all') return 0;
  const days = range === '7d' ? 7 : 30;
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

// ─── JSONL reader ─────────────────────────────────────────────────────────────

function parseJsonlLines(text: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // Malformed line — skip
    }
  }
  return out;
}

function isFileDateInRange(dateStamp: string, sinceMs: number): boolean {
  const fileDate = new Date(`${dateStamp}T00:00:00Z`);
  const dayBefore = new Date(sinceMs - 86_400_000);
  return fileDate >= dayBefore;
}

async function readJsonlFile(filePath: string): Promise<Record<string, unknown>[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    const text = await fs.readFile(filePath, 'utf8');
    return parseJsonlLines(text);
  } catch {
    return [];
  }
}

async function readJsonlDir(
  dir: string,
  basename: string,
  sinceMs: number,
): Promise<Record<string, unknown>[]> {
  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted userData path
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  // basename is a trusted internal constant (e.g. 'research-outcomes', 'corrections')
  // eslint-disable-next-line security/detect-non-literal-regexp -- basename is a trusted internal constant, not user input
  const pattern = new RegExp(`^${basename}-(\\d{4}-\\d{2}-\\d{2})(?:\\.\\d+)?\\.jsonl$`);
  const records: Record<string, unknown>[] = [];

  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (!match) continue;
    if (sinceMs > 0 && !isFileDateInRange(match[1], sinceMs)) continue;
    const fileRecords = await readJsonlFile(path.join(dir, entry));
    records.push(...fileRecords);
  }
  return records;
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

function calcP95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

type TriggerBucket = 'hook' | 'fact-claim' | 'slash' | 'correction' | 'other';

function classifyTrigger(reason: string): TriggerBucket {
  if (reason === 'hook') return 'hook';
  if (reason === 'fact-claim') return 'fact-claim';
  if (reason === 'slash-command') return 'slash';
  if (reason === 'correction') return 'correction';
  return 'other';
}

function emptyByTrigger(): ResearchDashboardMetrics['invocations']['byTrigger'] {
  return { hook: 0, 'fact-claim': 0, slash: 0, correction: 0, other: 0 };
}

function incrementTriggerBucket(
  tally: ResearchDashboardMetrics['invocations']['byTrigger'],
  bucket: TriggerBucket,
): void {
  // Explicit switch avoids security/detect-object-injection on variable key
  switch (bucket) {
    case 'hook': tally.hook++; break;
    case 'fact-claim': tally['fact-claim']++; break;
    case 'slash': tally.slash++; break;
    case 'correction': tally.correction++; break;
    default: tally.other++; break;
  }
}

// ─── Main aggregation ─────────────────────────────────────────────────────────

async function aggregateInvocations(sinceMs: number): Promise<ResearchDashboardMetrics['invocations']> {
  const store = getTelemetryStore();
  const filter = sinceMs > 0 ? { since: sinceMs } : {};
  const rows = store?.queryInvocations(filter) ?? [];

  const byTrigger = emptyByTrigger();
  let cacheHits = 0;
  const latencies: number[] = [];

  for (const row of rows) {
    incrementTriggerBucket(byTrigger, classifyTrigger(row.triggerReason));
    if (row.hitCache) cacheHits++;
    latencies.push(row.latencyMs);
  }

  const total = rows.length;
  const avgLatencyMs = total > 0 ? latencies.reduce((a, b) => a + b, 0) / total : 0;

  return {
    total,
    byTrigger,
    cacheHitRate: total > 0 ? cacheHits / total : 0,
    avgLatencyMs,
    p95LatencyMs: calcP95(latencies),
  };
}

async function aggregateOutcomes(
  dir: string,
  sinceMs: number,
): Promise<ResearchDashboardMetrics['outcomes']> {
  const records = await readJsonlDir(dir, 'research-outcomes', sinceMs);
  const filtered = sinceMs > 0
    ? records.filter((r) => typeof r.timestamp === 'number' && r.timestamp >= sinceMs)
    : records;

  let accepted = 0;
  let reverted = 0;
  let unknown = 0;

  for (const r of filtered) {
    const signal = r.outcomeSignal as string | undefined;
    if (signal === 'accepted') accepted++;
    else if (signal === 'reverted') reverted++;
    else unknown++;
  }

  const decided = accepted + reverted;
  return {
    total: filtered.length,
    accepted,
    reverted,
    unknown,
    acceptanceRate: decided > 0 ? accepted / decided : 0,
  };
}

interface CorrelatedInput {
  invTotal: number;
  outcomes: ResearchDashboardMetrics['outcomes'];
}

function computeCorrelated({ invTotal, outcomes }: CorrelatedInput): ResearchDashboardMetrics['correlated'] {
  const correlated = outcomes.accepted + outcomes.reverted;
  const fp = outcomes.reverted;
  return {
    firedCount: invTotal,
    outcomeCorrelatedCount: correlated,
    falsePositiveCount: fp,
    falsePositiveRate: invTotal > 0 ? fp / invTotal : 0,
  };
}

async function aggregateCorrections(
  dir: string,
  sinceMs: number,
): Promise<ResearchDashboardMetrics['corrections']> {
  const records = await readJsonlDir(dir, 'corrections', sinceMs);
  const filtered = sinceMs > 0
    ? records.filter((r) => typeof r.timestamp === 'number' && r.timestamp >= sinceMs)
    : records;

  const libraries = new Set<string>();
  for (const r of filtered) {
    if (typeof r.library === 'string') libraries.add(r.library);
  }

  return { total: filtered.length, enhancedLibrariesCount: libraries.size };
}

// ─── getDashboardMetrics ──────────────────────────────────────────────────────

export async function getDashboardMetrics(
  range: DashboardRange,
): Promise<ResearchDashboardMetrics> {
  const cached = getCached(range);
  if (cached) return cached;

  const sinceMs = rangeToSinceMs(range);
  const now = new Date();
  const fromIso = sinceMs > 0 ? new Date(sinceMs).toISOString() : new Date(0).toISOString();
  const toIso = now.toISOString();

  const userDataDir = app.getPath('userData');
  const [invocations, outcomes, corrections] = await Promise.all([
    aggregateInvocations(sinceMs),
    aggregateOutcomes(userDataDir, sinceMs),
    aggregateCorrections(userDataDir, sinceMs),
  ]);

  const correlated = computeCorrelated({ invTotal: invocations.total, outcomes });
  const metrics: ResearchDashboardMetrics = {
    range,
    window: { fromIso, toIso },
    invocations,
    outcomes,
    correlated,
    corrections,
  };

  setCache(range, metrics);
  return metrics;
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerResearchDashboardHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.removeHandler('research:getDashboardMetrics');
  ipcMain.handle('research:getDashboardMetrics', async (_event, range: unknown) => {
    const validRange = range === '7d' || range === '30d' || range === 'all'
      ? (range as DashboardRange)
      : '7d';
    try {
      const metrics = await getDashboardMetrics(validRange);
      return { success: true, metrics };
    } catch (err) {
      log.error('[researchDashboard] getDashboardMetrics error:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  channels.push('research:getDashboardMetrics');

  registeredChannels = channels;
  return channels;
}

export function cleanupResearchDashboardHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
