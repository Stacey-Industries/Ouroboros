/**
 * contextRetrainTrigger.ts — File-watch based retrain trigger for the context ranker.
 *
 * Watches context-outcomes.jsonl for row growth. When enough new outcomes have
 * accumulated since the last retrain (default 200 rows), spawns
 * tools/train-context.py and hot-swaps the classifier weights on success.
 *
 * Structural clone of src/main/router/retrainTrigger.ts — same threshold
 * pattern, same spawn logic (close event), same log format. Differences:
 * JSONL input paths, trainer script, and reload target (reloadContextWeights).
 *
 * Caller passes all paths explicitly — no Electron imports — keeping the
 * module fully testable without mocking app.getPath().
 */

import fs from 'node:fs';

import log from '../logger';
import { reloadContextWeights } from './contextClassifier';
import {
  countRows,
  findPython,
  parseSummaryLine,
  spawnTrainer,
} from './contextRetrainTriggerHelpers';

/* ── Constants ────────────────────────────────────────────────────────── */

const DEFAULT_MIN_NEW_ROWS = 200;
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1_000; // 5 minutes
const DEBOUNCE_MS = 500;

/* ── Public types ─────────────────────────────────────────────────────── */

export interface ContextRetrainConfig {
  /** Full path to context-outcomes.jsonl */
  outcomesPath: string;
  /** Full path to context-decisions.jsonl */
  decisionsPath: string;
  /** Full path to output context-retrained-weights.json */
  weightsOutPath: string;
  /** Full path to tools/train-context.py */
  scriptPath: string;
  /** Minimum new rows since last run before triggering. Default: 200 */
  minNewRowsToTrigger?: number;
  /** Minimum ms between retrains. Default: 300_000 (5 min) */
  cooldownMs?: number;
  /** Python binary to use. Default: autodetected via findPython(). */
  pythonBin?: string;
}

export interface ContextRetrainStatus {
  enabled: boolean;
  lastRunAt: string | null;
  lastOutcome: 'success' | 'failure' | 'skipped' | null;
  lastError: string | null;
  rowCountAtLastRun: number;
  nextTriggerRowCount: number;
}

export interface ContextRetrainController {
  stop: () => void;
  getStatus: () => ContextRetrainStatus;
  requestNow: () => void;
}

/* ── Internal state shape ─────────────────────────────────────────────── */

interface RetrainState {
  lastRunAt: Date | null;
  lastOutcome: 'success' | 'failure' | 'skipped' | null;
  lastError: string | null;
  rowCountAtLastRun: number;
  isRunning: boolean;
}

/* ── Retrain execution ────────────────────────────────────────────────── */

async function handleTrainResult(
  result: Awaited<ReturnType<typeof spawnTrainer>>,
  state: RetrainState,
  newRowCount: number,
  weightsOutPath: string,
): Promise<void> {
  if (!result.success) {
    const errSnippet = result.stderr.slice(0, 200);
    log.warn(`[context-ranker] retrain failed: ${errSnippet}`);
    state.lastOutcome = 'failure';
    state.lastError = errSnippet;
    state.lastRunAt = new Date();
    return;
  }

  const summary = parseSummaryLine(result.stdout);
  const label = summary
    ? `samples=${summary.samples} auc=${summary.auc} version=${summary.version}`
    : '(no summary)';

  await reloadContextWeights(weightsOutPath);

  if (summary?.belowMinSamples) {
    log.info(`[context-ranker] retrain succeeded (below-min-samples shadow-mode) ${label}`);
  } else {
    log.info(`[context-ranker] retrain succeeded ${label}`);
  }

  state.lastOutcome = 'success';
  state.lastError = null;
  state.lastRunAt = new Date();
  state.rowCountAtLastRun = newRowCount;
}

async function executeRetrain(
  config: Required<ContextRetrainConfig>,
  state: RetrainState,
  newRowCount: number,
): Promise<void> {
  if (state.isRunning) return;
  state.isRunning = true;
  try {
    const pythonBin = config.pythonBin || (await findPython());
    if (!pythonBin) {
      log.warn('[context-ranker] Python not found — skipping retrain');
      state.lastOutcome = 'skipped';
      return;
    }
    log.info(`[context-ranker] retrain triggered rows=${newRowCount}`);
    const result = await spawnTrainer({
      pythonBin,
      scriptPath: config.scriptPath,
      decisionsPath: config.decisionsPath,
      outcomesPath: config.outcomesPath,
      weightsOutPath: config.weightsOutPath,
    });
    await handleTrainResult(result, state, newRowCount, config.weightsOutPath);
  } finally {
    state.isRunning = false;
  }
}

/* ── Watch loop ───────────────────────────────────────────────────────── */

interface WatchLoop {
  watcher: fs.FSWatcher | null;
  debounceHandle: ReturnType<typeof setTimeout> | null;
}

function startWatchLoop(
  outcomesPath: string,
  onDebounced: () => void,
  isStopped: () => boolean,
): WatchLoop {
  const loop: WatchLoop = { watcher: null, debounceHandle: null };

  function scheduleDebounce(): void {
    if (loop.debounceHandle) clearTimeout(loop.debounceHandle);
    loop.debounceHandle = setTimeout(() => {
      loop.debounceHandle = null;
      if (!isStopped()) onDebounced();
    }, DEBOUNCE_MS);
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- caller-supplied trusted path
    loop.watcher = fs.watch(outcomesPath, () => {
      if (!isStopped()) scheduleDebounce();
    });
    loop.watcher.on('error', () => { /* file may not exist yet — suppress */ });
  } catch {
    // outcomesPath does not exist yet; trigger only via requestNow until file appears
  }

  return loop;
}

/* ── Controller builder ───────────────────────────────────────────────── */

interface TriggerContext {
  resolved: Required<ContextRetrainConfig>;
  state: RetrainState;
  loop: WatchLoop;
  minNewRows: number;
  cooldownMs: number;
  isStopped: () => boolean;
  markStopped: () => void;
  checkAndMaybeRetrain: () => Promise<void>;
}

function buildController(ctx: TriggerContext): ContextRetrainController {
  return {
    stop() {
      if (ctx.isStopped()) return;
      ctx.markStopped();
      if (ctx.loop.debounceHandle) { clearTimeout(ctx.loop.debounceHandle); ctx.loop.debounceHandle = null; }
      if (ctx.loop.watcher) { ctx.loop.watcher.close(); ctx.loop.watcher = null; }
    },
    getStatus(): ContextRetrainStatus {
      return {
        enabled: !ctx.isStopped(),
        lastRunAt: ctx.state.lastRunAt?.toISOString() ?? null,
        lastOutcome: ctx.state.lastOutcome,
        lastError: ctx.state.lastError,
        rowCountAtLastRun: ctx.state.rowCountAtLastRun,
        nextTriggerRowCount: ctx.state.rowCountAtLastRun + ctx.minNewRows,
      };
    },
    requestNow() {
      if (ctx.isStopped()) return;
      const cooled = !!ctx.state.lastRunAt && Date.now() - ctx.state.lastRunAt.getTime() < ctx.cooldownMs;
      if (cooled) { log.info('[context-ranker] requestNow ignored — within cooldown window'); return; }
      void ctx.checkAndMaybeRetrain();
    },
  };
}

/* ── Public API ───────────────────────────────────────────────────────── */

/**
 * Start watching outcomesPath and trigger retrains when enough new rows
 * accumulate. Returns a controller with stop / getStatus / requestNow.
 *
 * Safe to call once per main-process boot. Integration point (Phase D/later):
 * wire into src/main/mainStartup.ts with paths from app.getPath('userData').
 */
export function startContextRetrainTrigger(
  config: ContextRetrainConfig,
): ContextRetrainController {
  const minNewRows = config.minNewRowsToTrigger ?? DEFAULT_MIN_NEW_ROWS;
  const cooldownMs = config.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const resolved: Required<ContextRetrainConfig> = {
    ...config, minNewRowsToTrigger: minNewRows, cooldownMs, pythonBin: config.pythonBin ?? '',
  };
  const state: RetrainState = {
    lastRunAt: null, lastOutcome: null, lastError: null, rowCountAtLastRun: 0, isRunning: false,
  };
  let stopped = false;

  void countRows(config.outcomesPath).then((n) => { state.rowCountAtLastRun = n; });

  function isCoolingDown(): boolean {
    return !!state.lastRunAt && Date.now() - state.lastRunAt.getTime() < cooldownMs;
  }

  async function checkAndMaybeRetrain(): Promise<void> {
    if (stopped) return;
    const current = await countRows(config.outcomesPath);
    if (current - state.rowCountAtLastRun < minNewRows || isCoolingDown()) return;
    await executeRetrain(resolved, state, current);
  }

  const loop = startWatchLoop(config.outcomesPath, () => { void checkAndMaybeRetrain(); }, () => stopped);
  log.info(`[context-ranker] retrain trigger started (minNewRows=${minNewRows}, cooldown=${cooldownMs}ms)`);

  return buildController({
    resolved, state, loop, minNewRows, cooldownMs,
    isStopped: () => stopped,
    markStopped: () => { stopped = true; },
    checkAndMaybeRetrain,
  });
}
