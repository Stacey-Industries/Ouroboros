/**
 * ptyHostProtocol.ts — IPC message protocol between main process and PtyHost
 * utility process. All messages are structured-cloneable.
 *
 * Phase 1 scope: spawn (plain shell), write, resize, kill, getCwd, listSessions,
 * shellState, killAll, killForWindow + data/exit/shellStateChanged events.
 *
 * Phase 2 will add: agent spawn (stream-json bridge), recording.
 */

import type { ShellState } from '../ptyShellIntegration';

// ── Spawn instructions (fully resolved by main, never built in PtyHost) ──

export interface PtySpawnInstruction {
  id: string;
  shell: string;                       // resolved shell path
  args: string[];                      // resolved argv
  env: Record<string, string>;         // complete env (computed in main)
  cwd: string;
  cols: number;
  rows: number;
  windowId: number;                    // for session-to-window mapping
  startupCommand?: string;             // written after shell-ready (OSC 633;A)
}

// ── Session info returned by listSessions ──

export interface PtySessionInfo {
  id: string;
  cwd: string;
  windowId: number;
}

// ── Main → PtyHost: requests ──

export type PtyHostRequest =
  | { type: 'spawn'; requestId: string; instruction: PtySpawnInstruction }
  | { type: 'write'; id: string; data: string }
  | { type: 'resize'; id: string; cols: number; rows: number }
  | { type: 'kill'; requestId: string; id: string }
  | { type: 'getCwd'; requestId: string; id: string }
  | { type: 'listSessions'; requestId: string }
  | { type: 'getShellState'; requestId: string; id: string }
  | { type: 'killAll'; requestId: string }
  | { type: 'killForWindow'; requestId: string; windowId: number };

// ── PtyHost → Main: responses (request/response with correlation) ──

export type PtyHostResponse =
  | { type: 'spawned'; requestId: string; id: string; pid: number }
  | { type: 'killed'; requestId: string; id: string }
  | { type: 'cwd'; requestId: string; id: string; cwd: string }
  | { type: 'sessions'; requestId: string; list: PtySessionInfo[] }
  | { type: 'shellState'; requestId: string; id: string; state: ShellState | null }
  | { type: 'killAllDone'; requestId: string }
  | { type: 'killForWindowDone'; requestId: string }
  | { type: 'error'; requestId: string; message: string };

// ── PtyHost → Main: push events (high frequency, no correlation) ──

export type PtyHostEvent =
  | { type: 'data'; id: string; data: string }
  | { type: 'exit'; id: string; exitCode: number; signal: number }
  | { type: 'shellStateChanged'; id: string; state: ShellState };

// ── Discriminated message envelope from PtyHost → Main ──

export type PtyHostOutbound = PtyHostResponse | PtyHostEvent;

// Type guards

export function isResponse(msg: PtyHostOutbound): msg is PtyHostResponse {
  return 'requestId' in msg;
}

export function isEvent(msg: PtyHostOutbound): msg is PtyHostEvent {
  return !('requestId' in msg);
}
