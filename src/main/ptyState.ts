/**
 * ptyState.ts — Shared PTY session state.
 * Extracted to avoid circular imports between pty.ts, ptySpawn.ts, and ptyAgent.ts.
 */

import * as pty from 'node-pty'

import type { RecordingState } from './ptyRecording'

export interface PtySession {
  id: string
  process: pty.IPty
  cwd: string
  shell: string
}

export interface SessionRegistration {
  id: string
  proc: pty.IPty
  cwd: string
  shell: string
  win: import('electron').BrowserWindow
}

export const recordings = new Map<string, RecordingState>()
export const sessions = new Map<string, PtySession>()
export const sessionWindowMap = new Map<string, number>()
