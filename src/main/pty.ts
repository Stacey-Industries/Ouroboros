import { BrowserWindow } from 'electron';
import * as pty from 'node-pty';

import { getConfigValue } from './config';
import { dispatchActivationEvent } from './extensions';
import { resolvePtyCwd } from './ptyCwdResolver';
import { electronBatcher } from './ptyElectronBatcher';
import {
  buildShellEnvWithIntegration,
  getDefaultArgs,
  getDefaultShell,
  resolveSpawnOptions,
} from './ptyEnv';
import {
  getCwdViaPtyHost,
  getProxySession,
  getShellStateViaPtyHost,
  killAllViaPtyHost,
  killForWindowViaPtyHost,
  killViaPtyHost,
  listSessionsViaPtyHost,
  resizeViaPtyHost,
  spawnViaPtyHost,
  writeViaPtyHost,
} from './ptyHost/ptyHostProxy';
import {
  startRecordingViaPtyHost,
  stopRecordingViaPtyHost,
} from './ptyHost/ptyHostProxyRecording';
import { terminalOutputBuffer } from './ptyOutputBuffer';
import type { PtyPersistence } from './ptyPersistence';
import { createPtyPersistence } from './ptyPersistence';
import {
  type RecordingState,
  startPtyRecording as startRecording,
  stopPtyRecording as stopRecording,
} from './ptyRecording';
import type { ShellState } from './ptyShellIntegration';
import {
  getShellState as getDirectShellState,
  initShellState,
  processAndUpdateState,
  removeShellState,
} from './ptyShellIntegration';
import { writeOnShellReady } from './ptyShellReady';
import { ptyBatcher } from './web/ptyBatcher';
import { broadcastToWebClients } from './web/webServer';

/** Feature flag — route PTY operations through PtyHost utility process. */
function ptyHostEnabled(): boolean {
  return getConfigValue('usePtyHost') === true;
}

/**
 * Singleton PTY persistence store — created once at module load.
 * When persistTerminalSessions is false, this is a no-op instance
 * (isEnabled() returns false, all methods are zero-overhead stubs).
 * When ptyHost is active, main-side does NOT double-write; the host owns persistence.
 */
let _persistence: PtyPersistence | null = null;
function getPersistence(): PtyPersistence {
  if (!_persistence) _persistence = createPtyPersistence();
  return _persistence;
}

export interface PtySession {
  id: string;
  process: pty.IPty;
  cwd: string;
  shell: string;
}

export interface SpawnOptions {
  cwd?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  startupCommand?: string;
  /** 'continue' = --continue (resume latest session in cwd), or a UUID string = --resume <id> */
  resumeMode?: 'continue' | string;
}

export interface ActiveSessionInfo {
  id: string;
  cwd: string;
}

export { buildClaudeArgs, buildClaudeCommand } from './ptyClaude';
export { buildCodexArgs, buildCodexCommand } from './ptyCodex';
export type { AsciicastEvent } from './ptyRecording';

const recordings = new Map<string, RecordingState>();
export const sessions = new Map<string, PtySession>();
const sessionWindowMap = new Map<string, number>();

export interface SessionRegistration {
  id: string;
  proc: pty.IPty;
  cwd: string;
  shell: string;
  win: BrowserWindow;
}

export function cleanupSession(id: string): void {
  sessions.delete(id);
  sessionWindowMap.delete(id);
  electronBatcher.cleanup(id);
  terminalOutputBuffer.removeSession(id);
  ptyBatcher.removeSession(id);
  removeShellState(id);
}

function handleSessionExit(id: string, win: BrowserWindow, exitCode: number, signal: number): void {
  if (!sessions.has(id)) {
    return;
  }

  cleanupSession(id);
  try {
    if (!win.isDestroyed()) {
      win.webContents.mainFrame.send(`pty:exit:${id}`, { exitCode, signal });
    }
  } catch {
    // Render frame disposed — safe to ignore
  }
  broadcastToWebClients(`pty:exit:${id}`, { exitCode, signal });
}

function attachSessionListeners(id: string, proc: pty.IPty, win: BrowserWindow): void {
  electronBatcher.register(id, win);
  proc.onData((data: string) => {
    const cleaned = processAndUpdateState(id, data);
    electronBatcher.append(id, cleaned);
    ptyBatcher.append(id, cleaned);
    terminalOutputBuffer.append(id, cleaned);
  });

  proc.onExit(({ exitCode, signal }) => {
    handleSessionExit(id, win, exitCode ?? 0, signal ?? 0);
  });
}

export function scheduleStartupCommand(id: string, proc: pty.IPty, command: string): void {
  writeOnShellReady(id, proc, command, sessions);
}

export function registerSession(registration: SessionRegistration): void {
  sessions.set(registration.id, {
    id: registration.id,
    process: registration.proc,
    cwd: registration.cwd,
    shell: registration.shell,
  });
  sessionWindowMap.set(registration.id, registration.win.id);
  initShellState(registration.id, registration.cwd);
  attachSessionListeners(registration.id, registration.proc, registration.win);
}

export function notifyTerminalCreated(id: string, cwd: string): void {
  dispatchActivationEvent('onTerminalCreate', { id, cwd }).catch(() => {});
}

/**
 * Escape a single argument for safe use inside a PowerShell command string.
 * Handles all PowerShell metacharacters — not just backticks — to prevent
 * command injection via crafted CLI arguments (e.g. appendSystemPrompt).
 *
 * Security: wraps every argument in single-quotes and doubles any embedded
 * single-quotes, which is the only safe quoting strategy for PowerShell.
 * Single-quoted strings in PowerShell are literal — no variable expansion,
 * no backtick escapes, no subexpression evaluation.
 */
export function escapePowerShellArg(arg: string): string {
  // In PowerShell single-quoted strings, the only special character is
  // the single-quote itself, which is escaped by doubling it.
  return `'${arg.replace(/'/g, "''")}'`;
}

interface SpawnDirectOpts {
  id: string;
  win: BrowserWindow;
  shell: string;
  finalArgs: string[];
  shellEnv: Record<string, string>;
  cwd: string;
  cols: number;
  rows: number;
  startupCommand?: string;
}

function spawnDirect(opts: SpawnDirectOpts): { success: boolean; error?: string } {
  const { id, win, shell, finalArgs, shellEnv, cwd, cols, rows, startupCommand } = opts;
  try {
    const proc = pty.spawn(shell, finalArgs, {
      name: 'xterm-256color', cols, rows, cwd, env: shellEnv,
    });
    registerSession({ id, proc, cwd, shell, win });
    if (startupCommand) scheduleStartupCommand(id, proc, startupCommand);
    notifyTerminalCreated(id, cwd);
    const persistence = getPersistence();
    if (persistence.isEnabled()) {
      persistence.saveSession({
        id, cwd, shellPath: shell, shellArgs: finalArgs, cols, rows,
        windowId: win.id, envHash: '', createdAt: Date.now(), lastSeenAt: Date.now(),
      });
    }
    return { success: true };
  } catch (error) {
    cleanupSession(id);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function spawnPty(
  id: string,
  win: BrowserWindow,
  options: SpawnOptions = {},
): { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }> {
  if (sessions.has(id)) {
    return { success: false, error: `Session ${id} already exists` };
  }
  const shell = (getConfigValue('shell') as string) || getDefaultShell();
  const { cwd, cols, rows } = resolveSpawnOptions(options);
  const { env: shellEnv, shellArgs } = buildShellEnvWithIntegration(shell, options.env);
  const finalArgs = shellArgs ?? getDefaultArgs(shell);
  if (ptyHostEnabled()) {
    const inst = { id, shell, args: finalArgs, env: shellEnv, cwd, cols, rows, windowId: win.id,
      ...(options.startupCommand ? { startupCommand: options.startupCommand } : {}) };
    return spawnViaPtyHost(inst, win).then((res) => {
      if (res.success) notifyTerminalCreated(id, cwd);
      return res;
    });
  }
  return spawnDirect({ id, win, shell, finalArgs, shellEnv, cwd, cols, rows, startupCommand: options.startupCommand });
}

export function writeToPty(id: string, data: string): { success: boolean; error?: string } {
  if (ptyHostEnabled()) return writeViaPtyHost(id, data);
  const session = sessions.get(id);
  if (!session) return { success: false, error: `Session ${id} not found` };
  try {
    session.process.write(data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function resizePty(
  id: string,
  cols: number,
  rows: number,
): { success: boolean; error?: string } {
  if (ptyHostEnabled()) return resizeViaPtyHost(id, cols, rows);
  const session = sessions.get(id);
  if (!session) return { success: false, error: `Session ${id} not found` };
  try {
    session.process.resize(cols, rows);
    const persistence = getPersistence();
    if (persistence.isEnabled()) {
      persistence.updateSession(id, { cols, rows, lastSeenAt: Date.now() });
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function killPty(
  id: string,
): { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }> {
  if (ptyHostEnabled()) return killViaPtyHost(id);
  const session = sessions.get(id);
  if (!session) return { success: false, error: `Session ${id} not found` };
  try {
    session.process.kill();
    cleanupSession(id);
    const persistence = getPersistence();
    if (persistence.isEnabled()) {
      persistence.removeSession(id);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function killAllPtySessions(): void | Promise<void> {
  if (ptyHostEnabled()) return killAllViaPtyHost();
  for (const [id, session] of sessions) {
    try { session.process.kill(); } catch { /* ignore */ }
    cleanupSession(id);
  }
}

export function killPtySessionsForWindow(windowId: number): void | Promise<void> {
  if (ptyHostEnabled()) return killForWindowViaPtyHost(windowId);
  for (const [sessionId, ownerWindowId] of sessionWindowMap) {
    if (ownerWindowId !== windowId) continue;
    const session = sessions.get(sessionId);
    if (session) {
      try { session.process.kill(); } catch { /* ignore */ }
    }
    cleanupSession(sessionId);
  }
}

export function getActiveSessions(): ActiveSessionInfo[] | Promise<ActiveSessionInfo[]> {
  if (ptyHostEnabled()) {
    return listSessionsViaPtyHost().then((list) => list.map((s) => ({ id: s.id, cwd: s.cwd })));
  }
  return Array.from(sessions.values()).map((session) => ({ id: session.id, cwd: session.cwd }));
}

export async function getPtyCwd(
  id: string,
): Promise<{ success: boolean; cwd?: string; error?: string }> {
  if (ptyHostEnabled()) return getCwdViaPtyHost(id);
  const session = sessions.get(id);
  if (!session) return { success: false, error: `Session ${id} not found` };
  const cwd = await resolvePtyCwd(session.process.pid ?? 0, session.cwd);
  return { success: true, cwd };
}

export function startPtyRecording(
  id: string,
  win: BrowserWindow,
): { success: boolean; error?: string } {
  if (ptyHostEnabled()) {
    const session = getProxySession(id);
    if (!session) return { success: false, error: `Session ${id} not found` };
    return startRecordingViaPtyHost(id, session.cols, session.rows, win);
  }
  return startRecording(id, sessions, recordings, win);
}

export async function stopPtyRecording(
  id: string,
  win: BrowserWindow,
): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
  if (ptyHostEnabled()) return stopRecordingViaPtyHost(id, win);
  return stopRecording(id, recordings, win);
}

export function getShellState(id: string): ShellState | null {
  if (ptyHostEnabled()) return getShellStateViaPtyHost(id);
  return getDirectShellState(id);
}

export type { AgentPtyOptions, AgentPtyResult } from './ptyAgent';
export { spawnAgentPty } from './ptyAgent';
export type { ShellState } from './ptyShellIntegration';
export { spawnClaudePty, spawnCodexPty } from './ptySpawn';
