/**
 * usageExporter.ts — Wave 37 Phase C
 *
 * Exports cost-history entries as newline-delimited JSON (JSONL) to a user-chosen file.
 * Generic format (no vendor lock-in). A splitrail adapter can be layered in a future
 * splitrailFormat.ts without touching this module.
 *
 * Security: outputPath is user-supplied and non-literal.
 * All fs calls are guarded by validateOutputPath() which rejects non-absolute paths
 * and paths whose parent directory does not exist (no silent auto-mkdir).
 */

import fs from 'fs/promises';
import path from 'path';

import { getCostHistory } from './costHistory';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UsageExportOptions {
  windowStart: number; // ms epoch (inclusive)
  windowEnd: number;   // ms epoch (inclusive)
  outputPath: string;  // absolute file path
}

export interface UsageExportRow {
  timestamp: string;            // ISO 8601
  sessionId: string;
  provider: string;             // 'claude' | 'codex' | 'gemini'
  model?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  projectPath?: string;
  threadId?: string;
}

export interface UsageExportResult {
  rowsWritten: number;
  path: string;
}

// ─── Validation ──────────────────────────────────────────────────────────────

async function validateOutputPath(outputPath: string): Promise<void> {
  if (!path.isAbsolute(outputPath)) {
    throw new Error(`outputPath must be absolute; got: ${outputPath}`);
  }
  const parentDir = path.dirname(outputPath);
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- parentDir derived from validated absolute outputPath, not raw user string
    const stat = await fs.stat(parentDir);
    if (!stat.isDirectory()) {
      throw new Error(`Parent path is not a directory: ${parentDir}`);
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`Parent directory does not exist: ${parentDir}`);
    }
    throw err;
  }
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

function toExportRow(entry: Awaited<ReturnType<typeof getCostHistory>>[number]): UsageExportRow {
  return {
    timestamp: new Date(entry.timestamp).toISOString(),
    sessionId: entry.sessionId,
    provider: 'claude',
    model: entry.model || undefined,
    inputTokens: entry.inputTokens,
    cachedInputTokens: entry.cacheReadTokens,
    outputTokens: entry.outputTokens,
    costUsd: entry.estimatedCost,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function exportUsage(opts: UsageExportOptions): Promise<UsageExportResult> {
  await validateOutputPath(opts.outputPath);

  const allEntries = await getCostHistory();
  const filtered = allEntries.filter(
    (e) => e.timestamp >= opts.windowStart && e.timestamp <= opts.windowEnd,
  );

  const lines = filtered.map((e) => JSON.stringify(toExportRow(e)));
  const content = lines.length > 0 ? lines.join('\n') + '\n' : '';

  // eslint-disable-next-line security/detect-non-literal-fs-filename -- outputPath validated as absolute by validateOutputPath above
  await fs.writeFile(opts.outputPath, content, 'utf-8');

  return { rowsWritten: filtered.length, path: opts.outputPath };
}
