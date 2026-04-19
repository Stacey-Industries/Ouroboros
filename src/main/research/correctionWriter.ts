/**
 * correctionWriter.ts — Async-batched JSONL writer for self-correction records.
 *
 * Writes one JSON line per CorrectionRecord to
 * `{userData}/corrections-YYYY-MM-DD.jsonl` (UTC date, Wave 29.5 M2 pattern).
 * A new file is opened each UTC day. Intraday size-rotation fires at 10 MB.
 * 30-day retention is enforced by `scheduleJsonlRetentionPurge` in mainStartup.ts
 * (the 'corrections' basename must be in the purge list there).
 *
 * Mirrors researchOutcomeWriter.ts pattern exactly.
 * Wave 29.5 Phase H (H4).
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { CorrectionConfidence } from './correctionDetector';

// ─── Wire format ──────────────────────────────────────────────────────────────

export interface CorrectionRecord {
  id: string;
  library: string;
  userCorrectionText: string;
  sessionId: string;
  timestamp: number;
  phrasingMatch: string;
  confidence: CorrectionConfidence;
  /** Schema version — matches the v2 convention used across Wave 29.5 JSONL. */
  schemaVersion: 2;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CORRECTION_BASENAME = 'corrections';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB intraday safety valve
const FLUSH_INTERVAL_MS = 50;

// ─── Deps injection ───────────────────────────────────────────────────────────

export interface CorrectionWriterDeps {
  getDir: () => string;
  readSize: (filePath: string) => Promise<number>;
  appendLine: (filePath: string, line: string) => Promise<void>;
  rotate: (src: string, dst: string) => Promise<void>;
  /** Return today's UTC date stamp (YYYY-MM-DD). Injected for testability. */
  todayStamp: () => string;
}

// ─── Production deps ──────────────────────────────────────────────────────────

function makeProductionDeps(userDataPath: string): CorrectionWriterDeps {
  return {
    getDir: () => userDataPath,
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
    todayStamp: () => new Date().toISOString().slice(0, 10),
  };
}

// ─── Intraday size-rotation ───────────────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem}.${n}${ext}`;
}

async function rotateIfNeeded(filePath: string, deps: CorrectionWriterDeps): Promise<void> {
  const size = await deps.readSize(filePath);
  if (size <= MAX_BYTES) return;

  for (let i = 2; i >= 1; i--) {
    const src = rotationPath(filePath, i);
    const dst = rotationPath(filePath, i + 1);
    try { await deps.rotate(src, dst); } catch { /* may not exist */ }
  }
  await deps.rotate(filePath, rotationPath(filePath, 1));
}

// ─── Writer interface ─────────────────────────────────────────────────────────

export interface AppendCorrectionArgs {
  library: string;
  userCorrectionText: string;
  sessionId: string;
  phrasingMatch: string;
  confidence: CorrectionConfidence;
}

export interface CorrectionWriter {
  append(args: AppendCorrectionArgs): void;
  flushPendingWrites(): Promise<void>;
  closeWriter(): Promise<void>;
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface WriterState {
  queue: CorrectionRecord[];
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  activeStamp: string;
}

async function flush(state: WriterState, deps: CorrectionWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const stamp = deps.todayStamp();
  if (stamp !== state.activeStamp) state.activeStamp = stamp;

  const filePath = path.join(deps.getDir(), `${CORRECTION_BASENAME}-${stamp}.jsonl`);
  const batch = state.queue.splice(0);
  await rotateIfNeeded(filePath, deps);

  const lines = batch.map((r) => JSON.stringify(r)).join('\n') + '\n';
  try {
    await deps.appendLine(filePath, lines);
  } catch (err) {
    log.error('[correctionWriter] appendLine error', err);
  }
}

function scheduleFlush(state: WriterState, deps: CorrectionWriterDeps): void {
  if (state.timer !== null || state.closed) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state, deps).catch((err) => {
      log.error('[correctionWriter] flush error', err);
    });
  }, FLUSH_INTERVAL_MS);
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCorrectionWriter(deps: CorrectionWriterDeps): CorrectionWriter {
  const state: WriterState = {
    queue: [],
    timer: null,
    closed: false,
    activeStamp: deps.todayStamp(),
  };

  return {
    append({ library, userCorrectionText, sessionId, phrasingMatch, confidence }) {
      if (state.closed) return;
      const record: CorrectionRecord = {
        id: randomUUID(),
        library,
        userCorrectionText,
        sessionId,
        timestamp: Date.now(),
        phrasingMatch,
        confidence,
        schemaVersion: 2,
      };
      state.queue.push(record);
      scheduleFlush(state, deps);
    },

    async flushPendingWrites() {
      await flush(state, deps);
    },

    async closeWriter() {
      state.closed = true;
      await flush(state, deps);
    },
  };
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let singleton: CorrectionWriter | null = null;

export function initCorrectionWriter(userDataPath: string): void {
  if (singleton) return;
  singleton = createCorrectionWriter(makeProductionDeps(userDataPath));
  log.info('[correctionWriter] initialised');
}

export function getCorrectionWriter(): CorrectionWriter | null {
  return singleton;
}

export function closeCorrectionWriter(): Promise<void> {
  if (!singleton) return Promise.resolve();
  const writer = singleton;
  singleton = null;
  log.info('[correctionWriter] closing');
  return writer.closeWriter();
}

