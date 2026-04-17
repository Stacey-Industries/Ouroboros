/**
 * researchOutcomeWriter.ts — Async-batched JSONL writer for research outcome records
 * (Wave 25 Phase D, Wave 29.5 Phase G).
 *
 * Writes one JSON line per ResearchOutcomeRecord to
 * `{userData}/research-outcomes-YYYY-MM-DD.jsonl` (UTC date, Wave 29.5 M2).
 * A new file is opened each UTC day. Intraday size-rotation fires at 10 MB.
 * 30-day retention enforced at startup via `purgeOlderThan` (main.ts).
 *
 * Mirrors the contextDecisionWriter / contextOutcomeWriter pattern exactly.
 * Separate from context-outcomes.jsonl — research attribution is a distinct signal.
 *
 * Singleton lifecycle: initResearchOutcomeWriter / getResearchOutcomeWriter / closeResearchOutcomeWriter.
 */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import log from '../logger';
import type { ResearchToolKind } from '../telemetry/toolKindMap';

// ─── Wire format ──────────────────────────────────────────────────────────────

/** Signal indicating whether the research-attributed file touch was accepted. */
export type ResearchOutcomeSignal = 'accepted' | 'reverted' | 'unknown';

export interface ResearchOutcomeRecord {
  id: string;
  correlationId: string;
  sessionId: string;
  topic: string;
  toolName: string;
  /** Coarse tool-kind bucket — Wave 31 training uses this to weight Edit > Read. */
  toolKind: ResearchToolKind;
  filePath: string;
  timestamp: number;
  /**
   * Whether the file touch was accepted (Edit/Write that stuck), reverted
   * (checkpoint rolled it back), or unknown (only Reads or no signal within
   * the attribution window).
   */
  outcomeSignal: ResearchOutcomeSignal;
  /**
   * Exit code of the next PTY session exit in the same session within the
   * attribution window. Null if no PTY exit occurred.
   */
  followupTestExit: number | null;
  /** Schema version — Wave 31 training scripts filter on schemaVersion === 2. */
  schemaVersion: 2;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTCOME_BASENAME = 'research-outcomes';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB intraday safety valve
const FLUSH_INTERVAL_MS = 50;

// ─── Deps injection ───────────────────────────────────────────────────────────

export interface ResearchOutcomeWriterDeps {
  /** Return the directory where JSONL files are written. */
  getDir: () => string;
  readSize: (filePath: string) => Promise<number>;
  appendLine: (filePath: string, line: string) => Promise<void>;
  rotate: (src: string, dst: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
  /** Return today's UTC date stamp (YYYY-MM-DD). Injected for testability. */
  todayStamp: () => string;
}

// ─── Production deps ──────────────────────────────────────────────────────────

function makeProductionDeps(userDataPath: string): ResearchOutcomeWriterDeps {
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
    async unlink(fp) {
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- trusted internal path
        await fs.unlink(fp);
      } catch {
        // Best-effort
      }
    },
    todayStamp: () => new Date().toISOString().slice(0, 10),
  };
}

// ─── Intraday size-rotation helpers ──────────────────────────────────────────

function rotationPath(base: string, n: number): string {
  const ext = path.extname(base);
  const stem = base.slice(0, -ext.length);
  return `${stem}.${n}${ext}`;
}

async function rotateIfNeeded(filePath: string, deps: ResearchOutcomeWriterDeps): Promise<void> {
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

export interface RecordOutcomeArgs {
  correlationId: string;
  sessionId: string;
  topic: string;
  toolName: string;
  toolKind: ResearchToolKind;
  filePath: string;
  outcomeSignal: ResearchOutcomeSignal;
  followupTestExit: number | null;
}

export interface ResearchOutcomeWriter {
  recordOutcome(args: RecordOutcomeArgs): void;
  flushPendingWrites(): Promise<void>;
  closeWriter(): Promise<void>;
}

interface WriterState {
  queue: ResearchOutcomeRecord[];
  timer: ReturnType<typeof setTimeout> | null;
  closed: boolean;
  /** Stamp active when the handle was last resolved (YYYY-MM-DD). */
  activeStamp: string;
}

async function flush(state: WriterState, deps: ResearchOutcomeWriterDeps): Promise<void> {
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.queue.length === 0) return;

  const stamp = deps.todayStamp();
  if (stamp !== state.activeStamp) {
    state.activeStamp = stamp;
  }
  const filePath = path.join(deps.getDir(), `${OUTCOME_BASENAME}-${stamp}.jsonl`);

  const batch = state.queue.splice(0);
  await rotateIfNeeded(filePath, deps);

  const lines = batch.map((r) => JSON.stringify(r)).join('\n') + '\n';
  try {
    await deps.appendLine(filePath, lines);
  } catch (err) {
    log.error('[researchOutcomeWriter] appendLine error', err);
  }
}

function scheduleFlush(state: WriterState, deps: ResearchOutcomeWriterDeps): void {
  if (state.timer !== null || state.closed) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flush(state, deps).catch((err) => {
      log.error('[researchOutcomeWriter] flush error', err);
    });
  }, FLUSH_INTERVAL_MS);
}

export function createResearchOutcomeWriter(deps: ResearchOutcomeWriterDeps): ResearchOutcomeWriter {
  const state: WriterState = {
    queue: [],
    timer: null,
    closed: false,
    activeStamp: deps.todayStamp(),
  };

  return {
    recordOutcome({ correlationId, sessionId, topic, toolName, toolKind, filePath, outcomeSignal, followupTestExit }) {
      if (state.closed) return;
      const record: ResearchOutcomeRecord = {
        id: randomUUID(),
        correlationId,
        sessionId,
        topic,
        toolName,
        toolKind,
        filePath,
        timestamp: Date.now(),
        outcomeSignal,
        followupTestExit,
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

let singleton: ResearchOutcomeWriter | null = null;

export function initResearchOutcomeWriter(userDataPath: string): void {
  if (singleton) return;
  singleton = createResearchOutcomeWriter(makeProductionDeps(userDataPath));
  log.info('[researchOutcomeWriter] initialised');
}

export function getResearchOutcomeWriter(): ResearchOutcomeWriter | null {
  return singleton;
}

export function closeResearchOutcomeWriter(): Promise<void> {
  if (!singleton) return Promise.resolve();
  const writer = singleton;
  singleton = null;
  log.info('[researchOutcomeWriter] closing');
  return writer.closeWriter();
}

/** @internal Test-only reset */
export function _resetResearchOutcomeWriterForTests(): void {
  singleton = null;
}
