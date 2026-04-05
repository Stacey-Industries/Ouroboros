/**
 * retrainTriggerHelpers.ts — Pure helpers for the automatic retraining trigger.
 *
 * Handles sample counting, weight file validation, and Python trainer spawning.
 */

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';

import log from '../logger';

/* ── Constants ───────────────────────────────────────────────────────── */

const SIGNALS_FILENAME = 'router-quality-signals.jsonl';
const RETRAINED_WEIGHTS_FILE = 'router-weights-retrained.json';
const TRAINER_TIMEOUT_MS = 120_000; // 2 minutes

/* ── Exports ─────────────────────────────────────────────────────────── */

export { RETRAINED_WEIGHTS_FILE };

/* ── Sample counting ─────────────────────────────────────────────────── */

/**
 * Count the number of lines (annotations) in the quality signals file.
 * Returns 0 if the file doesn't exist.
 */
export function countSignalLines(dataDir: string): number {
  const filePath = `${dataDir}/${SIGNALS_FILENAME}`;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataDir is app.getPath('userData'), trusted
    const content = fs.readFileSync(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/* ── Weight file validation ──────────────────────────────────────────── */

export function validateWeightFile(filePath: string): boolean {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return isValidShape(parsed);
  } catch {
    return false;
  }
}

function isValidShape(obj: Record<string, unknown>): boolean {
  return (
    (obj.type === 'logistic_regression' || obj.type === 'random_forest') &&
    Array.isArray(obj.feature_names) &&
    Array.isArray(obj.label_names)
  );
}

/* ── Python trainer subprocess ───────────────────────────────────────── */

export interface TrainerResult {
  success: boolean;
  exitCode: number | null;
  stderr: string;
}

/**
 * Spawn the Python trainer as a child process.
 * Returns a promise that resolves when the process exits.
 */
export function spawnTrainer(args: {
  pythonBin: string;
  trainerScript: string;
  inputDir: string;
  outputPath: string;
}): Promise<TrainerResult> {
  return new Promise((resolve) => {
    let stderr = '';
    try {
      const proc = spawn(
        args.pythonBin,
        [args.trainerScript, '--input-dir', args.inputDir, '--output-path', args.outputPath],
        { timeout: TRAINER_TIMEOUT_MS },
      );

      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        log.warn('[retrain] spawn error:', err.message);
        resolve({ success: false, exitCode: null, stderr: err.message });
      });
      proc.on('close', (code) => {
        resolve({ success: code === 0, exitCode: code, stderr });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ success: false, exitCode: null, stderr: msg });
    }
  });
}

/* ── Python binary detection ─────────────────────────────────────────── */

export function findPython(): string | null {
  const candidates =
    process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

  for (const bin of candidates) {
    try {
      execSync(`${bin} --version`, { stdio: 'ignore', timeout: 5_000 });
      return bin;
    } catch {
      continue;
    }
  }
  return null;
}
