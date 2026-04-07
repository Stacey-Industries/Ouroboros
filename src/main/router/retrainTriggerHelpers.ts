/**
 * retrainTriggerHelpers.ts — Pure helpers for the automatic retraining trigger.
 *
 * Handles sample counting, weight file validation, and Python trainer spawning.
 */

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';

import log from '../logger';

/* ── Constants ───────────────────────────────────────────────────────── */

const SIGNALS_FILENAME = 'router-quality-signals.jsonl';
const RETRAINED_WEIGHTS_FILE = 'router-weights-retrained.json';
const RETRAINED_WEIGHTS_BACKUP_FILE = 'router-weights-retrained.backup.json';
const TRAINER_TIMEOUT_MS = 120_000; // 2 minutes

/* ── Exports ─────────────────────────────────────────────────────────── */

export { RETRAINED_WEIGHTS_BACKUP_FILE, RETRAINED_WEIGHTS_FILE };

/* ── Weight backup ───────────────────────────────────────────────────── */

/**
 * Copy current weights to a backup file before overwriting.
 * If no weights file exists yet (first retrain), this is a no-op.
 */
export async function backupWeightsFile(src: string, dest: string): Promise<void> {
  try {
    await fs.promises.copyFile(src, dest);
  } catch {
    // No existing weights to back up — first retrain, silently skip
  }
}

/* ── Sample counting ─────────────────────────────────────────────────── */

/**
 * Count the number of lines (annotations) in the quality signals file.
 * Returns 0 if the file doesn't exist.
 */
export async function countSignalLines(dataDir: string): Promise<number> {
  const filePath = `${dataDir}/${SIGNALS_FILENAME}`;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dataDir is app.getPath('userData'), trusted
    const content = await fs.promises.readFile(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/* ── Weight file validation ──────────────────────────────────────────── */

export async function validateWeightFile(filePath: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
    const raw = await fs.promises.readFile(filePath, 'utf8');
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

let cachedPythonBin: string | null | undefined;

function probeCandidate(bin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, ['--version'], { timeout: 5_000 }, (err) => {
      if (err) reject(err);
      else resolve(bin);
    });
  });
}

export async function findPython(): Promise<string | null> {
  if (cachedPythonBin !== undefined) return cachedPythonBin;

  const candidates =
    process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

  for (const bin of candidates) {
    try {
      const found = await probeCandidate(bin);
      cachedPythonBin = found;
      return found;
    } catch {
      continue;
    }
  }

  cachedPythonBin = null;
  return null;
}
