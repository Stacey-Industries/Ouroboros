import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

import { extractTimestampFromFilename } from './ptyCodexCapture';

const CODEX_LOOKBACK_DAYS = 14;
const MAX_ROLLOUT_FILES = 40;
const FIVE_HOUR_WINDOW_MINUTES = 300;
const WEEKLY_WINDOW_MINUTES = 10_080;

export interface CodexUsageWindow {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number | null;
}

export interface CodexUsageSnapshot {
  capturedAt: number;
  planType: string | null;
  fiveHour: CodexUsageWindow | null;
  weekly: CodexUsageWindow | null;
}

export interface ParsedRateLimitRecord {
  timestamp: number;
  planType: string | null;
  windows: CodexUsageWindow[];
}

function getCodexSessionDir(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return path.join(os.homedir(), '.codex', 'sessions', yyyy, mm, dd);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function normalizeResetTimestamp(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value > 1_000_000_000_000 ? value : value * 1000;
}

function parseUsageWindow(value: unknown): CodexUsageWindow | null {
  const record = asRecord(value);
  if (!record) return null;

  const usedPercent = record.used_percent;
  const windowMinutes = record.window_minutes;
  if (typeof usedPercent !== 'number' || typeof windowMinutes !== 'number') return null;

  return {
    usedPercent,
    windowMinutes,
    resetsAt: normalizeResetTimestamp(record.resets_at),
  };
}

function parseRateLimitWindows(rateLimits: Record<string, unknown>): {
  planType: string | null;
  windows: CodexUsageWindow[];
} | null {
  const windows = [parseUsageWindow(rateLimits.primary), parseUsageWindow(rateLimits.secondary)].filter(
    (window): window is CodexUsageWindow => window !== null,
  );
  if (windows.length === 0) return null;

  return {
    planType: typeof rateLimits.plan_type === 'string' ? rateLimits.plan_type : null,
    windows,
  };
}

function parseEventTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function parseCodexRateLimitLine(line: string): ParsedRateLimitRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  const event = asRecord(parsed);
  if (!event || event.type !== 'event_msg') return null;

  const payload = asRecord(event.payload);
  if (!payload || payload.type !== 'token_count') return null;

  const rateLimits = asRecord(payload.rate_limits);
  if (!rateLimits) return null;

  const parsedWindows = parseRateLimitWindows(rateLimits);
  const timestamp = parseEventTimestamp(event.timestamp);
  if (!parsedWindows || timestamp === null) return null;

  return {
    timestamp,
    planType: parsedWindows.planType,
    windows: parsedWindows.windows,
  };
}

function mapSnapshot(record: ParsedRateLimitRecord): CodexUsageSnapshot {
  const fiveHour =
    record.windows.find((window) => window.windowMinutes === FIVE_HOUR_WINDOW_MINUTES) ??
    record.windows[0] ??
    null;
  const weekly =
    record.windows.find((window) => window.windowMinutes === WEEKLY_WINDOW_MINUTES) ??
    record.windows[1] ??
    null;

  return {
    capturedAt: record.timestamp,
    planType: record.planType,
    fiveHour,
    weekly,
  };
}

async function readLatestRateLimitRecord(filePath: string): Promise<ParsedRateLimitRecord | null> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath is derived from the trusted Codex session directory scan above
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let latest: ParsedRateLimitRecord | null = null;

  try {
    for await (const line of lines) {
      const record = parseCodexRateLimitLine(line);
      if (record && (!latest || record.timestamp > latest.timestamp)) latest = record;
    }
  } catch {
    return latest;
  } finally {
    lines.close();
    stream.destroy();
  }

  return latest;
}

async function listRecentRolloutFiles(): Promise<string[]> {
  const files: Array<{ filePath: string; startedAt: number }> = [];

  for (let dayOffset = 0; dayOffset < CODEX_LOOKBACK_DAYS; dayOffset += 1) {
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const sessionDir = getCodexSessionDir(date);

    let entries: string[];
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from the user's local Codex session directory
      entries = await fs.promises.readdir(sessionDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.startsWith('rollout-') || !entry.endsWith('.jsonl')) continue;
      const startedAt = extractTimestampFromFilename(entry);
      if (startedAt === null) continue;
      files.push({ filePath: path.join(sessionDir, entry), startedAt });
    }
  }

  return files
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, MAX_ROLLOUT_FILES)
    .map((entry) => entry.filePath);
}

export async function getLatestCodexUsageSnapshot(): Promise<CodexUsageSnapshot | null> {
  const rolloutFiles = await listRecentRolloutFiles();
  let latest: ParsedRateLimitRecord | null = null;

  for (const filePath of rolloutFiles) {
    const record = await readLatestRateLimitRecord(filePath);
    if (record && (!latest || record.timestamp > latest.timestamp)) latest = record;
  }

  return latest ? mapSnapshot(latest) : null;
}
