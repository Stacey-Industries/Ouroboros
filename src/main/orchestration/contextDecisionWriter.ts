/**
 * contextDecisionWriter.ts — Async-batched JSONL writer for context decisions.
 *
 * Writes one JSON line per ContextDecision to `{userData}/context-decisions.jsonl`.
 * Rotates at 10 MB, keeping the last 3 rotations (context-decisions.1.jsonl,
 * context-decisions.2.jsonl) and purging older ones.
 *
 * Adapter pattern: all I/O deps are injected for testability. Production code
 * calls `getDecisionWriter()` which lazily creates a singleton with real fs deps.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { ContextDecision } from './contextTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

const DECISION_FILENAME = 'context-decisions.jsonl';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROTATIONS = 3;
const FLUSH_INTERVAL_MS = 50;

// ─── Adapter (deps injection) ─────────────────────────────────────────────────

export interface DecisionWriterDeps {
  /** Resolve `{userData}/context-decisions.jsonl`. */
  getPath: () => string;
  /** Return file size in bytes, or 0 if missing. */
  readSize: (filePath: string) => Promise<number>;
  /** Append a newline-terminated string to the file. */
  appendLine: (filePath: string, line: string) => Promise<void>;
  /** Rename src → dst. */
  rotate: (src: string, dst: string) => Promise<void>;
  /** Delete a file (best-effort). */
  unlink: (filePath: string) => Promise<void>;
  /** List files in a directory, returning names. */
  listDir: (dir: string) => Promise<string[]>;
}

// ─── Production adapter ───────────────────────────────────────────────────────

function makeProductionDeps(userDataPath: string): DecisionWriterDeps {
  const filePath = path.join(userDataPath, DECISION_FILENAME);
  return {
    getPath: () => filePath,
    async readSize(fp) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        const stat = await fs.stat(fp);
        return stat.size;
      } catch {
        return 0;
      }
    },
    async appendLine(fp, line) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      await fs.appendFile(fp, line, 'utf8');
    },
    async rotate(src, dst) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
      await fs.rename(src, dst);
    },
    async unlink(fp) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        await fs.unlink(fp);
      } catch {
        // Best-effort
      }
    },
    async listDir(dir) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        return await fs.readdir(dir);
      } catch {
        return [];
      }
    },
  };
}

// ─── Rotation helpers ─────────────────────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  return path.join(path.dirname(base), `${stem}.${n}${ext}`);
}

async function rotateIfNeeded(deps: DecisionWriterDeps): Promise<void> {
  const filePath = deps.getPath();
  const size = await deps.readSize(filePath);
  if (size <= MAX_BYTES) return;

  // Keep .1 .2 .3 — purge .3, shift .2→.3, .1→.2, current→.1
  await deps.unlink(rotationPath(filePath, MAX_ROTATIONS));

  for (let i = MAX_ROTATIONS - 1; i >= 1; i--) {
    const src = rotationPath(filePath, i);
    const dst = rotationPath(filePath, i + 1);
    try {
      await deps.rotate(src, dst);
    } catch {
      // May not exist — skip
    }
  }

  await deps.rotate(filePath, rotationPath(filePath, 1));
}

// ─── Writer implementation ────────────────────────────────────────────────────

export interface DecisionWriter {
  recordDecision(decision: ContextDecision): void;
  flushPendingWrites(): Promise<void>;
  closeDecisionWriter(): Promise<void>;
}

interface WriterState {
  queue: ContextDecision[];
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
}

async function flush(state: WriterState, deps: DecisionWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const batch = state.queue.splice(0);
  await rotateIfNeeded(deps);

  const lines = batch.map((d) => JSON.stringify(d)).join('\n') + '\n';
  try {
    await deps.appendLine(deps.getPath(), lines);
  } catch (err) {
    log.error('[contextDecisionWriter] appendLine error', err);
  }
}

function scheduleFlush(state: WriterState, deps: DecisionWriterDeps): void {
  if (state.timer !== null || state.closed) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state, deps).catch((err) => {
      log.error('[contextDecisionWriter] flush error', err);
    });
  }, FLUSH_INTERVAL_MS);
}

export function createDecisionWriter(deps: DecisionWriterDeps): DecisionWriter {
  const state: WriterState = { queue: [], timer: null, closed: false };

  return {
    recordDecision(decision) {
      if (state.closed) return;
      state.queue.push({ ...decision, id: decision.id || randomUUID() });
      scheduleFlush(state, deps);
    },

    async flushPendingWrites() {
      await flush(state, deps);
    },

    async closeDecisionWriter() {
      state.closed = true;
      await flush(state, deps);
    },
  };
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

let singleton: DecisionWriter | null = null;

export function initDecisionWriter(userDataPath: string): void {
  if (singleton) return;
  singleton = createDecisionWriter(makeProductionDeps(userDataPath));
  log.info('[contextDecisionWriter] initialised');
}

export function getDecisionWriter(): DecisionWriter | null {
  return singleton;
}

export function closeDecisionWriter(): Promise<void> {
  if (!singleton) return Promise.resolve();
  const writer = singleton;
  singleton = null;
  log.info('[contextDecisionWriter] closing');
  return writer.closeDecisionWriter();
}

/** @internal Test-only reset */
export function _resetDecisionWriterForTests(): void {
  singleton = null;
}
