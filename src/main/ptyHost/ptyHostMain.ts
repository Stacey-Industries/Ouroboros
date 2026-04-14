/**
 * ptyHostMain.ts — PtyHost utility process entry point.
 *
 * Owns node-pty session lifecycle, OSC 633 shell integration parsing, and
 * shell-ready detection. Receives PtyHostRequest messages from the main
 * process via parentPort and sends PtyHostResponse / PtyHostEvent messages
 * back.
 *
 * Phase 1 scope: plain shell spawn, write, resize, kill, listSessions, getCwd,
 * shellState, killAll, killForWindow + data/exit/shellStateChanged events.
 */

import * as pty from 'node-pty';

import { resolvePtyCwd } from '../ptyCwdResolver';
import type { PtyPersistence } from '../ptyPersistence';
import { createPtyPersistence } from '../ptyPersistence';
import type { ShellState } from '../ptyShellIntegration';
import {
  initShellState,
  processShellData,
  removeShellState,
} from '../ptyShellIntegration';
import type {
  PtyHostEvent,
  PtyHostOutbound,
  PtyHostRequest,
  PtyHostResponse,
  PtySessionInfo,
  PtySpawnInstruction,
} from './ptyHostProtocol';
import { writeOnShellReady } from './ptyHostShellReady';

// ── Local session map ──

interface PtyHostSession {
  id: string;
  proc: pty.IPty;
  cwd: string;
  windowId: number;
  state: ShellState;
}

const sessions = new Map<string, PtyHostSession>();

/**
 * PTY persistence — created once at module load. No-op when
 * persistTerminalSessions config flag is off (isEnabled() → false).
 */
let _persistence: PtyPersistence | null = null;
function getPersistence(): PtyPersistence {
  if (!_persistence) _persistence = createPtyPersistence();
  return _persistence;
}

// ── Posting helpers ──

declare const process: NodeJS.Process & {
  parentPort: { postMessage: (msg: unknown) => void; on: (e: 'message', cb: (m: unknown) => void) => void };
};

function post(msg: PtyHostOutbound): void {
  process.parentPort.postMessage(msg);
}

function postError(requestId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  post({ type: 'error', requestId, message });
}

// ── Handlers ──

function handleSpawn(requestId: string, inst: PtySpawnInstruction): void {
  if (sessions.has(inst.id)) {
    postError(requestId, `Session ${inst.id} already exists`);
    return;
  }
  try {
    const proc = pty.spawn(inst.shell, inst.args, {
      name: 'xterm-256color',
      cols: inst.cols,
      rows: inst.rows,
      cwd: inst.cwd,
      env: inst.env,
    });
    const state = initShellStateForSession(inst.id, inst.cwd);
    const session: PtyHostSession = {
      id: inst.id, proc, cwd: inst.cwd, windowId: inst.windowId, state,
    };
    sessions.set(inst.id, session);
    attachListeners(session);
    if (inst.startupCommand) {
      writeOnShellReady(inst.id, proc, inst.startupCommand, sessions);
    }
    const persistence = getPersistence();
    if (persistence.isEnabled()) {
      persistence.saveSession({
        id: inst.id, cwd: inst.cwd, shellPath: inst.shell,
        shellArgs: inst.args, cols: inst.cols, rows: inst.rows,
        windowId: inst.windowId, envHash: '',
        createdAt: Date.now(), lastSeenAt: Date.now(),
      });
    }
    post({ type: 'spawned', requestId, id: inst.id, pid: proc.pid });
  } catch (err) {
    sessions.delete(inst.id);
    removeShellState(inst.id);
    postError(requestId, err);
  }
}

function initShellStateForSession(id: string, cwd: string): ShellState {
  initShellState(id, cwd);
  return { cwd, lastExitCode: null, lastCommand: null, isExecuting: false };
}

function attachListeners(session: PtyHostSession): void {
  const { id, proc } = session;
  proc.onData((data: string) => {
    const { cleaned, state } = processShellData(data, session.state);
    if (state !== session.state) {
      session.state = state;
      post({ type: 'shellStateChanged', id, state });
    }
    post({ type: 'data', id, data: cleaned });
  });
  proc.onExit(({ exitCode, signal }) => {
    sessions.delete(id);
    removeShellState(id);
    post({ type: 'exit', id, exitCode: exitCode ?? 0, signal: signal ?? 0 });
  });
}

function handleWrite(id: string, data: string): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.proc.write(data);
  } catch {
    // Process likely dead — exit handler will clean up.
  }
}

function handleResize(id: string, cols: number, rows: number): void {
  const session = sessions.get(id);
  if (!session) return;
  try {
    session.proc.resize(cols, rows);
    const persistence = getPersistence();
    if (persistence.isEnabled()) {
      persistence.updateSession(id, { cols, rows, lastSeenAt: Date.now() });
    }
  } catch {
    // Ignore resize errors on dying processes.
  }
}

function handleKill(requestId: string, id: string): void {
  const session = sessions.get(id);
  if (!session) {
    post({ type: 'killed', requestId, id });
    return;
  }
  try {
    session.proc.kill();
  } catch {
    // Already dead.
  }
  sessions.delete(id);
  removeShellState(id);
  const persistence = getPersistence();
  if (persistence.isEnabled()) {
    persistence.removeSession(id);
  }
  post({ type: 'killed', requestId, id });
}

async function handleGetCwd(requestId: string, id: string): Promise<void> {
  const session = sessions.get(id);
  if (!session) {
    postError(requestId, `Session ${id} not found`);
    return;
  }
  const cwd = await resolvePtyCwd(session.proc.pid ?? 0, session.cwd);
  post({ type: 'cwd', requestId, id, cwd });
}

function handleListSessions(requestId: string): void {
  const list: PtySessionInfo[] = Array.from(sessions.values()).map((s) => ({
    id: s.id, cwd: s.cwd, windowId: s.windowId,
  }));
  post({ type: 'sessions', requestId, list });
}

function handleGetShellState(requestId: string, id: string): void {
  const session = sessions.get(id);
  post({ type: 'shellState', requestId, id, state: session?.state ?? null });
}

function handleKillAll(requestId: string): void {
  for (const [id, session] of sessions) {
    try { session.proc.kill(); } catch { /* ignore */ }
    removeShellState(id);
  }
  sessions.clear();
  post({ type: 'killAllDone', requestId });
}

function handleKillForWindow(requestId: string, windowId: number): void {
  for (const [id, session] of sessions) {
    if (session.windowId !== windowId) continue;
    try { session.proc.kill(); } catch { /* ignore */ }
    sessions.delete(id);
    removeShellState(id);
  }
  post({ type: 'killForWindowDone', requestId });
}

// ── Message dispatcher (exported for tests) ──

export function dispatch(msg: PtyHostRequest): void {
  switch (msg.type) {
    case 'spawn': handleSpawn(msg.requestId, msg.instruction); return;
    case 'write': handleWrite(msg.id, msg.data); return;
    case 'resize': handleResize(msg.id, msg.cols, msg.rows); return;
    case 'kill': handleKill(msg.requestId, msg.id); return;
    case 'getCwd': handleGetCwd(msg.requestId, msg.id).catch((e) => postError(msg.requestId, e)); return;
    case 'listSessions': handleListSessions(msg.requestId); return;
    case 'getShellState': handleGetShellState(msg.requestId, msg.id); return;
    case 'killAll': handleKillAll(msg.requestId); return;
    case 'killForWindow': handleKillForWindow(msg.requestId, msg.windowId); return;
  }
}

/** Reset all session state — used by tests. */
export function _resetForTests(): void {
  for (const [, session] of sessions) {
    try { session.proc.kill(); } catch { /* ignore */ }
  }
  sessions.clear();
}

/** Bootstrap parentPort listener. Skipped in test environment. */
function bootstrap(): void {
  if (typeof process.parentPort === 'undefined') return;
  process.parentPort.on('message', (raw: unknown) => {
    const data = (raw as { data?: unknown })?.data ?? raw;
    if (typeof data !== 'object' || data === null) return;
    try {
      dispatch(data as PtyHostRequest);
    } catch (err) {
      const requestId = (data as { requestId?: string }).requestId ?? 'unknown';
      postError(requestId, err);
    }
  });
}

bootstrap();

// Re-export type aliases used at runtime so the bundler can resolve them.
export type { PtyHostEvent,PtyHostRequest, PtyHostResponse };
