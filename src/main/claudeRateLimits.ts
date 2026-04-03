/**
 * claudeRateLimits.ts — Reads Claude Code rate limit data captured by the
 * statusline_capture script. The script writes rate_limits JSON from the
 * Claude Code statusline to ~/.ouroboros/claude-usage.json on each update.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ClaudeUsageWindow {
  usedPercent: number;
  resetsAt: string | number | null;
}

export interface ClaudeUsageSnapshot {
  capturedAt: number;
  fiveHour: ClaudeUsageWindow | null;
  weekly: ClaudeUsageWindow | null;
}

const USAGE_FILE_PATH = path.join(os.homedir(), '.ouroboros', 'claude-usage.json');

/** Maximum age (ms) before captured data is considered stale. */
const MAX_STALENESS_MS = 10 * 60 * 1000; // 10 minutes

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseWindow(value: unknown): ClaudeUsageWindow | null {
  const rec = asRecord(value);
  if (!rec) return null;

  const usedPercent = rec['used_percentage'];
  if (typeof usedPercent !== 'number') return null;

  const resetsRaw = rec['resets_at'];
  const resetsAt = (typeof resetsRaw === 'string' || typeof resetsRaw === 'number') ? resetsRaw : null;
  return { usedPercent, resetsAt };
}

export function getLatestClaudeUsageSnapshot(): ClaudeUsageSnapshot | null {
  let raw: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from os.homedir()
    raw = fs.readFileSync(USAGE_FILE_PATH, 'utf8').replace(/^\uFEFF/, '');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const data = asRecord(parsed);
  if (!data) return null;

  const capturedAt = typeof data['captured_at'] === 'number' ? (data['captured_at'] as number) : 0;
  if (Date.now() - capturedAt > MAX_STALENESS_MS) return null;

  const rateLimits = asRecord(data['rate_limits']);
  if (!rateLimits) return null;

  return {
    capturedAt,
    fiveHour: parseWindow(rateLimits['five_hour']),
    weekly: parseWindow(rateLimits['seven_day']),
  };
}
