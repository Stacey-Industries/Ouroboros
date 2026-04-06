/**
 * retrainTrigger.ts — Monitors quality signal growth and triggers retraining.
 *
 * Periodically checks the number of quality signal annotations. When enough
 * new samples have accumulated since the last retrain, runs the export pipeline
 * and spawns `tools/train-router.py` as a subprocess. On success, validates
 * the new weights, atomically swaps the file, and hot-reloads the classifier.
 */

import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import { reloadWeights } from './classifier';
import {
  countSignalLines,
  findPython,
  RETRAINED_WEIGHTS_FILE,
  spawnTrainer,
  validateWeightFile,
} from './retrainTriggerHelpers';
import { exportTrainingData } from './routerExporter';

/* ── Constants ───────────────────────────────────────────────────────── */

const DEFAULT_MIN_SAMPLES = 50;
const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const TRAINER_SCRIPT = 'tools/train-router.py';

/* ── State ───────────────────────────────────────────────────────────── */

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/* ── Public API ──────────────────────────────────────────────────────── */

export interface RetrainOpts {
  /** Min new quality signal annotations before triggering. Default: 50. */
  minNewSamples?: number;
  /** How often to check (ms). Default: 30000. */
  checkIntervalMs?: number;
}

/** Start the periodic dataset growth observer. */
export function observeDatasetGrowth(opts?: RetrainOpts): void {
  if (intervalHandle) return; // already observing
  const minSamples = opts?.minNewSamples ?? DEFAULT_MIN_SAMPLES;
  const intervalMs = opts?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;

  intervalHandle = setInterval(() => {
    void checkAndRetrain(minSamples);
  }, intervalMs);

  log.info(`[retrain] observing dataset growth (min=${minSamples}, interval=${intervalMs}ms)`);
}

/** Stop the observer and clean up. */
export function stopObserving(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/* ── Core check-and-retrain logic ────────────────────────────────────── */

async function checkAndRetrain(minSamples: number): Promise<void> {
  if (isRunning) return; // prevent concurrent retrains
  const routerConfig = getConfigValue('routerSettings');
  if (!routerConfig?.enabled) return;

  const dataDir = app.getPath('userData');
  const currentCount = await countSignalLines(dataDir);
  const lastCount = getLastRetrainCount();

  if (currentCount - lastCount < minSamples) return;

  isRunning = true;
  try {
    await runRetrainPipeline(dataDir, currentCount);
  } finally {
    isRunning = false;
  }
}

async function runRetrainPipeline(dataDir: string, signalCount: number): Promise<void> {
  log.info(`[retrain] triggering retrain (${signalCount} signals)`);

  // Step 1: Export training data
  const exportResult = await exportTrainingData({ inputDir: dataDir });
  if (exportResult.judgedCount === 0) {
    log.info('[retrain] no judged entries — skipping');
    return;
  }

  // Step 2: Find Python
  const pythonBin = await findPython();
  if (!pythonBin) {
    log.warn('[retrain] Python not found — skipping');
    return;
  }

  // Step 3: Resolve trainer script path
  const trainerScript = resolveTrainerScript();
  if (!trainerScript) {
    log.warn('[retrain] trainer script not found — skipping');
    return;
  }

  // Step 4: Run trainer
  const outputPath = path.join(dataDir, RETRAINED_WEIGHTS_FILE);
  const result = await spawnTrainer({
    pythonBin,
    trainerScript,
    inputDir: dataDir,
    outputPath,
  });

  if (!result.success) {
    log.warn(`[retrain] trainer failed (exit=${result.exitCode}): ${result.stderr.slice(0, 200)}`);
    return;
  }

  // Step 5: Validate + reload
  if (!(await validateWeightFile(outputPath))) {
    log.warn('[retrain] output weights invalid — keeping old weights');
    return;
  }

  const loaded = reloadWeights(outputPath);
  if (loaded) {
    setLastRetrainCount(signalCount);
    log.info('[retrain] weights updated successfully');
  } else {
    log.warn('[retrain] reloadWeights failed — keeping old weights');
  }
}

/* ── Trainer script resolution ───────────────────────────────────────── */

function resolveTrainerScript(): string | null {
  // Development: relative to repo root
  const devPath = path.join(app.getAppPath(), TRAINER_SCRIPT);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- app.getAppPath() is trusted
  if (fs.existsSync(devPath)) return devPath;

  // Packaged: extraResources
  const resPath = path.join(process.resourcesPath, 'train-router.py');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- process.resourcesPath is trusted
  if (fs.existsSync(resPath)) return resPath;

  return null;
}

/* ── Persisted retrain counter ───────────────────────────────────────── */

function getLastRetrainCount(): number {
  return (getConfigValue('routerLastRetrainCount') as number) ?? 0;
}

function setLastRetrainCount(count: number): void {
  setConfigValue('routerLastRetrainCount', count);
}

/* ── Startup: load retrained weights if available ────────────────────── */

/**
 * Called once at startup to load retrained weights from userData if they exist.
 * Falls back to bundled weights silently.
 */
export function loadRetrainedWeightsIfAvailable(): void {
  try {
    const weightsPath = path.join(app.getPath('userData'), RETRAINED_WEIGHTS_FILE);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted path
    if (!fs.existsSync(weightsPath)) return;
    const loaded = reloadWeights(weightsPath);
    if (loaded) log.info('[retrain] loaded retrained weights from userData');
  } catch {
    // Silently fall back to bundled weights
  }
}
