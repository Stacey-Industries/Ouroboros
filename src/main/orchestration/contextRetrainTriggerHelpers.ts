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

export async function countRows(filePath: string): Promise<number> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
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
          '--decisions', opts.decisionsPath,
          '--outcomes', opts.outcomesPath,
          '--out', opts.weightsOutPath,
        ],
        { timeout: TRAINER_TIMEOUT_MS },
      );

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
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
