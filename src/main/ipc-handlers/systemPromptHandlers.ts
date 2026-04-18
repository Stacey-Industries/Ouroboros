/**
 * systemPromptHandlers.ts — IPC handlers for Wave 37 Phase A.
 *
 * Exposes the cached system prompt captured by ptyAgentBridge.ts.
 * The system prompt text is NEVER logged — it may contain sensitive
 * project context that the user has not explicitly shared.
 */

import { ipcMain } from 'electron';

import {
  clearSystemPromptForSession,
  getSystemPromptForSession,
} from '../ptyAgentBridge';

// ---- Types ----------------------------------------------------------------

type CacheMissReason = 'not-yet-captured' | 'unknown-session';

type GetSystemPromptResult =
  | { success: true; text: string; capturedAt: number }
  | { success: false; reason: CacheMissReason };

// ---- Helpers ---------------------------------------------------------------

function resolveResult(sessionId: string): GetSystemPromptResult {
  if (typeof sessionId !== 'string' || !sessionId) {
    return { success: false, reason: 'unknown-session' };
  }
  const entry = getSystemPromptForSession(sessionId);
  if (!entry) {
    return { success: false, reason: 'not-yet-captured' };
  }
  return { success: true, text: entry.text, capturedAt: entry.at };
}

// ---- Registration ----------------------------------------------------------

export function registerSystemPromptHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle(
    'sessions:getSystemPrompt',
    (_event, sessionId: string): GetSystemPromptResult => resolveResult(sessionId),
  );
  channels.push('sessions:getSystemPrompt');

  return channels;
}

export function cleanupSystemPromptHandlers(): void {
  // clearSystemPromptForSession is called per-session from ptyAgent on close;
  // no module-level cleanup is required here.
}

export { clearSystemPromptForSession };
