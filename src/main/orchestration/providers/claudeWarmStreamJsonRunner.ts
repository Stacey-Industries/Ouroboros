// ---------------------------------------------------------------------------
// Warm (long-lived, multi-turn) Claude Code process spawner.
// Spawns `claude -p --output-format stream-json --input-format stream-json`
// and keeps stdin open for subsequent NDJSON user turns.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto';

import { type ChildProcess, spawn } from 'child_process';

import log from '../../logger';
import { enqueueTrace, redactArgv } from '../../telemetry/traceBatcher';
import {
  buildProcessEnv,
  buildStreamJsonArgs,
  killStreamJsonProcess,
} from './claudeStreamJsonRunner';
import type {
  StreamJsonEvent,
  StreamJsonResultEvent,
  StreamJsonSpawnOptions,
  WarmStreamJsonHandle,
} from './streamJsonTypes';

// ---- Buffer cap (mirrors claudeStreamJsonRunner) ---------------------------
const MAX_BUFFER_BYTES = 100 * 1024 * 1024;

// ---- Internal state types --------------------------------------------------

interface WarmSessionState {
  sessionId: string | null;
  stdoutBuf: string;
  stderrBuf: string;
}

interface WarmTurnState {
  resolve: (result: StreamJsonResultEvent) => void;
  reject: (err: Error) => void;
  onEvent: (event: StreamJsonEvent) => void;
}

// ---- NDJSON line parser (local copy to avoid circular import) ---------------

function tryParseWarmEvent(line: string): StreamJsonEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as StreamJsonEvent;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Dispatch a single parsed event to the active turn ---------------------

function dispatchWarmEvent(
  event: StreamJsonEvent,
  state: WarmSessionState,
  getTurn: () => WarmTurnState | null,
): void {
  if (!state.sessionId && event.session_id) state.sessionId = event.session_id;
  const turn = getTurn();
  turn?.onEvent(event);
  if (event.type === 'result') {
    turn?.resolve(event as StreamJsonResultEvent);
  }
}

// ---- Drain the line buffer, dispatching complete NDJSON lines --------------

function drainWarmBuffer(state: WarmSessionState, getTurn: () => WarmTurnState | null): void {
  let newlineIdx: number;
  while ((newlineIdx = state.stdoutBuf.indexOf('\n')) !== -1) {
    const line = state.stdoutBuf.slice(0, newlineIdx);
    state.stdoutBuf = state.stdoutBuf.slice(newlineIdx + 1);
    const event = tryParseWarmEvent(line);
    if (event) dispatchWarmEvent(event, state, getTurn);
  }
}

// ---- Stdout chunk processor ------------------------------------------------

function processWarmChunk(
  chunk: Buffer,
  state: WarmSessionState,
  child: ChildProcess,
  getTurn: () => WarmTurnState | null,
): void {
  state.stdoutBuf += chunk.toString();
  if (state.stdoutBuf.length > MAX_BUFFER_BYTES) {
    log.error('[warm] stdout buffer exceeded 100 MB — killing process');
    try {
      child.kill();
    } catch {
      /* already dead */
    }
    getTurn()?.reject(
      new Error('Stream buffer exceeded maximum allowed size (100 MB). Process killed.'),
    );
    return;
  }
  drainWarmBuffer(state, getTurn);
}

// ---- Child event listeners -------------------------------------------------

interface WarmListenerOpts {
  child: ChildProcess;
  state: WarmSessionState;
  getTurn: () => WarmTurnState | null;
  clearTurn: () => void;
  onExitCallback: (() => void) | undefined;
}

function attachWarmListeners(opts: WarmListenerOpts): void {
  const { child, state, getTurn, clearTurn, onExitCallback } = opts;
  child.stdout?.on('data', (chunk: Buffer) => processWarmChunk(chunk, state, child, getTurn));
  child.stderr?.on('data', (chunk: Buffer) => {
    state.stderrBuf += chunk.toString();
    if (state.stderrBuf.length > MAX_BUFFER_BYTES)
      state.stderrBuf = state.stderrBuf.slice(-MAX_BUFFER_BYTES);
  });
  child.on('error', (err) => {
    getTurn()?.reject(err);
  });
  child.on('exit', () => {
    const turn = getTurn();
    clearTurn();
    turn?.reject(new Error('Warm process exited unexpectedly'));
    onExitCallback?.();
  });
}

// ---- Handle builder --------------------------------------------------------

function makeWarmKill(child: ChildProcess): () => void {
  return () => {
    try { child.stdin?.end(); } catch { /* already closed */ }
    setTimeout(() => killStreamJsonProcess(child), 500);
  };
}

function buildWarmHandleFromChild(
  child: ChildProcess,
  state: WarmSessionState,
  onExitCallback: (() => void) | undefined,
): WarmStreamJsonHandle {
  let currentTurn: WarmTurnState | null = null;
  const getTurn = () => currentTurn;
  const clearTurn = () => { currentTurn = null; };
  attachWarmListeners({ child, state, getTurn, clearTurn, onExitCallback });
  const writeUserTurn = (content: string): void => {
    child.stdin?.write(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
  };
  const sendTurn = (content: string, onEvent: (event: StreamJsonEvent) => void): Promise<StreamJsonResultEvent> =>
    new Promise<StreamJsonResultEvent>((resolve, reject) => {
      currentTurn = { resolve, reject, onEvent };
      writeUserTurn(content);
    }).finally(clearTurn);
  const injectUserMessage = (content: string): void => {
    if (!currentTurn) { log.warn('[warm] injectUserMessage: no active turn — message dropped'); return; }
    writeUserTurn(content);
  };
  const kill = makeWarmKill(child);
  return { sendTurn, injectUserMessage, kill, pid: child.pid, get sessionId() { return state.sessionId; } };
}

// ---- Public spawner --------------------------------------------------------

export type WarmSpawnOptions = Omit<StreamJsonSpawnOptions, 'prompt'> & {
  onExit?: () => void;
};

export function spawnWarmStreamJsonProcess(options: WarmSpawnOptions): WarmStreamJsonHandle {
  const builtArgs = buildStreamJsonArgs({ ...options, warmMode: true, prompt: '' });
  const traceId = options.traceId ?? crypto.randomUUID();
  const telemetrySessionId = options.telemetrySessionId ?? 'unknown';
  const child: ChildProcess = spawn(builtArgs.command, builtArgs.args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const cwdHash = crypto.createHash('sha256').update(options.cwd).digest('hex').slice(0, 16);
  enqueueTrace({
    traceId,
    sessionId: telemetrySessionId,
    kind: 'spawn',
    payload: {
      argv: redactArgv([builtArgs.command, ...builtArgs.args]),
      cwdHash,
      timestamp: Date.now(),
    },
  });
  const state: WarmSessionState = { sessionId: null, stdoutBuf: '', stderrBuf: '' };
  return buildWarmHandleFromChild(child, state, options.onExit);
}
