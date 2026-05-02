/**
 * contextRetrainTriggerHelpers.ts — Pure helpers for the context retrain trigger.
 *
 * Handles JSONL row counting, trainer spawning, and stdout summary-line parsing.
 * Extracted to keep contextRetrainTrigger.ts under the 300-line ESLint limit.
 *
 * Python binary detection is delegated to the shared pythonFinder module.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';

import log from '../logger';
import { findPython, resetPythonCache } from '../shared/pythonFinder';

/* ── Constants ────────────────────────────────────────────────────────── */

const TRAINER_TIMEOUT_MS = 120_000; // 2 minutes

export { findPython, resetPythonCache };

/* ── Row counting ─────────────────────────────────────────────────────── */

// eslint-disable-next-line security/detect-unsafe-regex -- bounded date pattern; quantifiers are non-overlapping
const OUTCOMES_GLOB_RE = /^context-outcomes-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.jsonl$/;
// eslint-disable-next-line security/detect-unsafe-regex -- bounded date pattern; quantifiers are non-overlapping
const DECISIONS_GLOB_RE = /^context-decisions-\d{4}-\d{2}-\d{2}(?:\.\d+)?\.jsonl$/;

function classifyJsonlBasename(name: string): boolean {
  return OUTCOMES_GLOB_RE.test(name) || DECISIONS_GLOB_RE.test(name);
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path
    const st = await fs.promises.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function countRowsInFile(filePath: string): Promise<number> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Wave 70 Phase A2: support both single-file (legacy) and directory paths.
 * When `pathOrDir` is a directory, sums rows across all date-rotated
 * `context-{outcomes,decisions}-YYYY-MM-DD[.N].jsonl` files inside.
 *
 * Backward compat: single-file usage unchanged. Tests that pass a non-
 * existent file path still get 0 (via the file-mode fallback).
 */
export async function countRows(pathOrDir: string): Promise<number> {
  if (!(await isDirectory(pathOrDir))) return countRowsInFile(pathOrDir);

  let total = 0;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path
    const entries = await fs.promises.readdir(pathOrDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!classifyJsonlBasename(entry.name)) continue;
      total += await countRowsInFile(`${pathOrDir}/${entry.name}`);
    }
  } catch {
    // Unreadable directory — fall through with whatever we accumulated
  }
  return total;
}

/* ── Summary line parsing ─────────────────────────────────────────────── */

export interface TrainSummary {
  samples: number;
  auc: string;
  version: string;
  belowMinSamples: boolean;
}

export function parseSummaryLine(stdout: string): TrainSummary | null {
  const match = stdout.match(/trained samples=(\d+) auc=([\d.]+) version=(\S+)/);
  if (!match) return null;
  const belowMin = stdout.includes('belowMinSamples=true');
  return {
    samples: parseInt(match[1], 10),
    auc: match[2],
    version: match[3],
    belowMinSamples: belowMin,
  };
}

/* ── Trainer spawn ────────────────────────────────────────────────────── */

export interface SpawnResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface SpawnTrainerOpts {
  pythonBin: string;
  scriptPath: string;
  decisionsPath: string;
  outcomesPath: string;
  weightsOutPath: string;
}

export function spawnTrainer(opts: SpawnTrainerOpts): Promise<SpawnResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    try {
      const proc = spawn(
        opts.pythonBin,
        [
          opts.scriptPath,
          '--decisions',
          opts.decisionsPath,
          '--outcomes',
          opts.outcomesPath,
          '--out',
          opts.weightsOutPath,
        ],
        { timeout: TRAINER_TIMEOUT_MS },
      );

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        log.warn('[context-ranker] spawn error:', err.message);
        resolve({ success: false, exitCode: null, stdout, stderr: err.message });
      });
      proc.on('close', (code) => {
        resolve({ success: code === 0, exitCode: code, stdout, stderr });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ success: false, exitCode: null, stdout, stderr: msg });
    }
  });
}
