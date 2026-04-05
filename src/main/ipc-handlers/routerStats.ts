/**
 * routerStats.ts — IPC handler for router analytics dashboard.
 *
 * Reads router-decisions.jsonl and router-quality-signals.jsonl via
 * streaming, aggregates stats, and caches results for 30 seconds by mtime.
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

import { app, ipcMain } from 'electron';

import log from '../logger';

/* ── Types ───────────────────────────────────────────────────────────── */

interface TierCounts {
  HAIKU: number;
  SONNET: number;
  OPUS: number;
}
interface SurfaceCounts {
  chat: TierCounts;
  terminal_shadow: TierCounts;
  agentic: TierCounts;
}

export interface RouterStatsResult {
  tierDistribution: TierCounts;
  bySurface: SurfaceCounts;
  overrideRate: number;
  overrideDirection: { upgradeCount: number; downgradeCount: number };
  layerDistribution: { rule: number; classifier: number; llm: number; default_: number };
  totalDecisions: number;
  signalCounts: Record<string, number>;
}

/* ── Constants ───────────────────────────────────────────────────────── */

const DECISIONS_FILE = 'router-decisions.jsonl';
const SIGNALS_FILE = 'router-quality-signals.jsonl';
const CACHE_TTL_MS = 30_000;

/* ── Cache ───────────────────────────────────────────────────────────── */

let cachedResult: RouterStatsResult | null = null;
let cachedMtime = 0;

/* ── Aggregation helpers ─────────────────────────────────────────────── */

function emptyTierCounts(): TierCounts {
  return { HAIKU: 0, SONNET: 0, OPUS: 0 };
}

function emptyStats(): RouterStatsResult {
  return {
    tierDistribution: emptyTierCounts(),
    bySurface: {
      chat: emptyTierCounts(),
      terminal_shadow: emptyTierCounts(),
      agentic: emptyTierCounts(),
    },
    overrideRate: 0,
    overrideDirection: { upgradeCount: 0, downgradeCount: 0 },
    layerDistribution: { rule: 0, classifier: 0, llm: 0, default_: 0 },
    totalDecisions: 0,
    signalCounts: {},
  };
}

function incrementTier(counts: TierCounts, tier: string): void {
  if (tier === 'HAIKU') counts.HAIKU++;
  else if (tier === 'SONNET') counts.SONNET++;
  else if (tier === 'OPUS') counts.OPUS++;
}

/* ── JSONL streaming ─────────────────────────────────────────────────── */

function streamLines(filePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path from app.getPath('userData')
    if (!fs.existsSync(filePath)) {
      resolve([]);
      return;
    }
    const lines: string[] = [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path derived from app.getPath('userData')
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({ input: stream });
    rl.on('line', (line) => {
      if (line.trim()) lines.push(line);
    });
    rl.on('close', () => resolve(lines));
    rl.on('error', () => resolve(lines));
  });
}

/* ── Core aggregation ────────────────────────────────────────────────── */

async function aggregateStats(): Promise<RouterStatsResult> {
  const dataDir = app.getPath('userData');
  const stats = emptyStats();

  const decisionLines = await streamLines(path.join(dataDir, DECISIONS_FILE));
  let overrideCount = 0;
  aggregateDecisions(decisionLines, stats, () => overrideCount++);
  stats.totalDecisions = decisionLines.length;
  stats.overrideRate = stats.totalDecisions > 0 ? overrideCount / stats.totalDecisions : 0;

  const signalLines = await streamLines(path.join(dataDir, SIGNALS_FILE));
  aggregateSignals(signalLines, stats);

  return stats;
}

function aggregateDecisions(
  lines: string[],
  stats: RouterStatsResult,
  onOverride: () => void,
): void {
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      const tier = rec.tier as string;
      incrementTier(stats.tierDistribution, tier);

      const surface = rec.interactionType as string;
      if (surface === 'chat') incrementTier(stats.bySurface.chat, tier);
      else if (surface === 'terminal_shadow') incrementTier(stats.bySurface.terminal_shadow, tier);
      else if (surface === 'agentic') incrementTier(stats.bySurface.agentic, tier);

      categorizeLayer(rec.routedBy as string, stats);
      if (rec.override) onOverride();
    } catch {
      /* skip malformed */
    }
  }
}

function categorizeLayer(routedBy: string, stats: RouterStatsResult): void {
  if (routedBy === 'rule') stats.layerDistribution.rule++;
  else if (routedBy === 'classifier') stats.layerDistribution.classifier++;
  else if (routedBy === 'llm') stats.layerDistribution.llm++;
  else stats.layerDistribution.default_++;
}

function aggregateSignals(lines: string[], stats: RouterStatsResult): void {
  const counts = new Map<string, number>();
  for (const line of lines) {
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      const kind = rec.signalKind as string;
      if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    } catch {
      /* skip */
    }
  }
  stats.signalCounts = Object.fromEntries(counts);
}

/* ── Cached getter ───────────────────────────────────────────────────── */

function getFileMtime(filePath: string): number {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

async function getStatsWithCache(): Promise<RouterStatsResult> {
  const dataDir = app.getPath('userData');
  const mtime = getFileMtime(path.join(dataDir, DECISIONS_FILE));
  const now = Date.now();

  if (cachedResult && mtime === cachedMtime && now - cachedMtime < CACHE_TTL_MS) {
    return cachedResult;
  }

  cachedResult = await aggregateStats();
  cachedMtime = mtime;
  return cachedResult;
}

/* ── IPC registration ────────────────────────────────────────────────── */

export function registerRouterStatsHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle('router:getStats', async () => {
    try {
      return { success: true, data: await getStatsWithCache() };
    } catch (err) {
      log.warn('[router:getStats] error:', err);
      return { success: false, error: String(err) };
    }
  });
  channels.push('router:getStats');

  return channels;
}
