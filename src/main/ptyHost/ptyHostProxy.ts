/**
 * ptyHostProxy.ts — Main-process proxy that fronts the PtyHost utility process.
 *
 * Lazily forks the PtyHost on first use. Wires PtyHost data/exit events into
 * the existing Electron + web batchers, terminalOutputBuffer, agent bridges,
 * and active recordings so main-process consumers see the same data flow as
 * the direct path in pty.ts.
 *
 * Crash recovery: PtyHost is auto-restarted on unexpected exit. Affected
 * sessions get a `pty:disconnected:${id}` IPC event with their pre-crash
 * scrollback so the renderer can display a "Terminal disconnected" banner
 * with read-only history. (Renderer banner is a deferred follow-up task.)
 *
 * Behavior is gated by the `usePtyHost` config flag — when off, pty.ts uses
 * the direct node-pty path and this module is never instantiated.
 */

import type { BrowserWindow } from 'electron';
import path from 'path';

import log from '../logger';
import { electronBatcher } from '../ptyElectronBatcher';
import { terminalOutputBuffer } from '../ptyOutputBuffer';
import type { ShellState } from '../ptyShellIntegration';
import { UtilityProcessHost } from '../utilityProcessHost';
import { ptyBatcher } from '../web/ptyBatcher';
import { broadcastToWebClients } from '../web/webServer';
import type {
  PtyHostEvent,
  PtyHostOutbound,
  PtyHostRequest,
  PtyHostResponse,
  PtySessionInfo,
  PtySpawnInstruction,
} from './ptyHostProtocol';
import { isEvent } from './ptyHostProtocol';
import { feedRecordingFrame } from './ptyHostProxyRecording';

// ── Session-side bookkeeping (kept in main, mirrors PtyHost map) ──

interface ProxySession {
  id: string;
  cwd: string;
  win: BrowserWindow;
  shellState: ShellState | null;
  cols: number;
  rows: number;
}

const proxySessions = new Map<string, ProxySession>();

/** Agent bridges (NDJSON parsers) attached to data events for agent sessions. */
interface AgentBridgeFeeder {
  feed(data: string): void;
  handleExit(exitCode: number): void;
}
const agentBridges = new Map<string, AgentBridgeFeeder>();

let host: UtilityProcessHost<PtyHostRequest, PtyHostOutbound> | null = null;

function resolveModulePath(): string {
  const outMainDir = __dirname.endsWith('chunks') ? path.dirname(__dirname) : __dirname;
  return path.join(outMainDir, 'ptyHostMain.js');
}

function getHost(): UtilityProcessHost<PtyHostRequest, PtyHostOutbound> {
  if (host && host.alive) return host;
  host = new UtilityProcessHost<PtyHostRequest, PtyHostOutbound>({
    name: 'ptyHost',
    modulePath: resolveModulePath(),
    autoRestart: true,
    onCrash: handleHostCrash,
  });
  host.fork();
  host.onEvent((msg) => {
    if (isEvent(msg)) handleEvent(msg);
  });
  return host;
}

// ── Event handlers (PtyHost → main → renderer/web/buffer) ──

function handleEvent(event: PtyHostEvent): void {
  switch (event.type) {
    case 'data': handleData(event.id, event.data); return;
    case 'exit': handleExit(event.id, event.exitCode, event.signal); return;
    case 'shellStateChanged': handleShellStateChanged(event.id, event.state); return;
  }
}

function handleData(id: string, data: string): void {
  electronBatcher.append(id, data);
  ptyBatcher.append(id, data);
  terminalOutputBuffer.append(id, data);
  agentBridges.get(id)?.feed(data);
  feedRecordingFrame(id, data);
}

function handleExit(id: string, exitCode: number, signal: number): void {
  const session = proxySessions.get(id);
  agentBridges.get(id)?.handleExit(exitCode);
  agentBridges.delete(id);
  proxySessions.delete(id);
  electronBatcher.cleanup(id);
  terminalOutputBuffer.removeSession(id);
  ptyBatcher.removeSession(id);
  if (session && !session.win.isDestroyed()) {
    try {
      session.win.webContents.mainFrame.send(`pty:exit:${id}`, { exitCode, signal });
    } catch {
      // Render frame disposed — safe to ignore.
    }
  }
  broadcastToWebClients(`pty:exit:${id}`, { exitCode, signal });
}

function handleShellStateChanged(id: string, state: ShellState): void {
  const session = proxySessions.get(id);
  if (session) session.shellState = state;
}

// ── Crash recovery ──

function handleHostCrash(exitCode: number): void {
  log.warn(`[ptyHostProxy] PtyHost crashed (code=${exitCode}), notifying ${proxySessions.size} session(s)`);
  for (const [id, session] of proxySessions) {
    const scrollback = terminalOutputBuffer.getRecentLines(id, 200);
    if (session.win && !session.win.isDestroyed()) {
      try {
        session.win.webContents.mainFrame.send(`pty:disconnected:${id}`, {
          reason: 'ptyhost-crashed', exitCode, scrollback,
        });
      } catch {
        // Render frame disposed.
      }
    }
    broadcastToWebClients(`pty:disconnected:${id}`, {
      reason: 'ptyhost-crashed', exitCode, scrollback,
    });
    agentBridges.get(id)?.handleExit(exitCode);
    agentBridges.delete(id);
    electronBatcher.cleanup(id);
    terminalOutputBuffer.removeSession(id);
    ptyBatcher.removeSession(id);
  }
  proxySessions.clear();
}

// ── Public proxy API ──

export async function spawnViaPtyHost(
  instruction: PtySpawnInstruction,
  win: BrowserWindow,
): Promise<{ success: boolean; error?: string }> {
  try {
    const h = getHost();
    electronBatcher.register(instruction.id, win);
    proxySessions.set(instruction.id, {
      id: instruction.id, cwd: instruction.cwd, win, shellState: null,
      cols: instruction.cols, rows: instruction.rows,
    });
    const requestId = h.nextRequestId();
    await h.request<PtyHostResponse>({ type: 'spawn', requestId, instruction });
    return { success: true };
  } catch (err) {
    proxySessions.delete(instruction.id);
    electronBatcher.cleanup(instruction.id);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function writeViaPtyHost(id: string, data: string): { success: boolean; error?: string } {
  if (!host || !host.alive) return { success: false, error: 'PtyHost not started' };
  host.send({ type: 'write', id, data });
  return { success: true };
}

export function resizeViaPtyHost(
  id: string, cols: number, rows: number,
): { success: boolean; error?: string } {
  if (!host || !host.alive) return { success: false, error: 'PtyHost not started' };
  host.send({ type: 'resize', id, cols, rows });
  const s = proxySessions.get(id);
  if (s) { s.cols = cols; s.rows = rows; }
  return { success: true };
}

export async function killViaPtyHost(id: string): Promise<{ success: boolean; error?: string }> {
  if (!host || !host.alive) return { success: false, error: 'PtyHost not started' };
  try {
    const requestId = host.nextRequestId();
    await host.request<PtyHostResponse>({ type: 'kill', requestId, id });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getCwdViaPtyHost(
  id: string,
): Promise<{ success: boolean; cwd?: string; error?: string }> {
  if (!host || !host.alive) return { success: false, error: 'PtyHost not started' };
  try {
    const requestId = host.nextRequestId();
    const res = await host.request<PtyHostResponse & { type: 'cwd' }>(
      { type: 'getCwd', requestId, id },
    );
    return { success: true, cwd: res.cwd };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listSessionsViaPtyHost(): Promise<PtySessionInfo[]> {
  if (!host || !host.alive) return [];
  try {
    const requestId = host.nextRequestId();
    const res = await host.request<PtyHostResponse & { type: 'sessions' }>(
      { type: 'listSessions', requestId },
    );
    return res.list;
  } catch {
    return [];
  }
}

export function getShellStateViaPtyHost(id: string): ShellState | null {
  return proxySessions.get(id)?.shellState ?? null;
}

export async function killAllViaPtyHost(): Promise<void> {
  if (!host || !host.alive) return;
  try {
    const requestId = host.nextRequestId();
    await host.request<PtyHostResponse>({ type: 'killAll', requestId });
  } catch (err) {
    log.warn('[ptyHostProxy] killAll error:', err);
  }
  for (const id of proxySessions.keys()) agentBridges.delete(id);
  proxySessions.clear();
}

export async function killForWindowViaPtyHost(windowId: number): Promise<void> {
  if (!host || !host.alive) return;
  try {
    const requestId = host.nextRequestId();
    await host.request<PtyHostResponse>({ type: 'killForWindow', requestId, windowId });
  } catch (err) {
    log.warn('[ptyHostProxy] killForWindow error:', err);
  }
  for (const [id, session] of proxySessions) {
    if (session.win.id === windowId) {
      proxySessions.delete(id);
      agentBridges.delete(id);
    }
  }
}

export async function shutdownPtyHost(): Promise<void> {
  if (!host) return;
  await host.kill();
  host = null;
  proxySessions.clear();
  agentBridges.clear();
}

// ── Agent bridge support (used by spawnAgentViaPtyHost) ──

/** Register an agent bridge to receive data + exit events for a session. */
export function registerAgentBridge(id: string, feeder: AgentBridgeFeeder): void {
  agentBridges.set(id, feeder);
}

/** Look up the proxy session record (used by recording module). */
export function getProxySession(
  id: string,
): { win: BrowserWindow; cols: number; rows: number } | undefined {
  const s = proxySessions.get(id);
  return s ? { win: s.win, cols: s.cols, rows: s.rows } : undefined;
}
