/**
 * ipc-handlers/researchControl.ts — IPC handler registrar for research mode
 * controls (Wave 30 Phase G).
 *
 * Channels:
 *   research:getSessionMode  { sessionId }                     → { success, mode? }
 *   research:setSessionMode  { sessionId, mode }               → { success, error? }
 *   research:getGlobalDefault                                  → { success, globalEnabled?, defaultMode? }
 *   research:setGlobalDefault { globalEnabled, defaultMode }   → { success, error? }
 */

import { ipcMain } from 'electron';

import { getConfigValue, setConfigValue } from '../config';
import log from '../logger';
import {
  getResearchMode,
  type ResearchMode,
  setResearchMode,
} from '../research/researchSessionState';

// ─── Types ────────────────────────────────────────────────────────────────────

type OkPayload<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };

function ok<T extends object>(data: T): OkPayload<T> {
  return { success: true, ...data };
}

function fail(err: unknown): FailResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { success: false, error: msg };
}

const VALID_MODES: ReadonlySet<string> = new Set(['off', 'conservative', 'aggressive']);

function isValidMode(v: unknown): v is ResearchMode {
  return typeof v === 'string' && VALID_MODES.has(v);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

interface GetSessionModeArgs { sessionId?: unknown }
interface SetSessionModeArgs { sessionId?: unknown; mode?: unknown }
interface SetGlobalDefaultArgs { globalEnabled?: unknown; defaultMode?: unknown }

function handleGetSessionMode(
  args: GetSessionModeArgs,
): OkPayload<{ mode: ResearchMode }> | FailResult {
  const { sessionId } = args;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return fail('sessionId is required');
  }
  const mode = getResearchMode(sessionId.trim());
  return ok({ mode });
}

function handleSetSessionMode(
  args: SetSessionModeArgs,
): OkPayload<Record<never, never>> | FailResult {
  const { sessionId, mode } = args;
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return fail('sessionId is required');
  }
  if (!isValidMode(mode)) {
    return fail(`mode must be one of: off, conservative, aggressive. Got: ${String(mode)}`);
  }
  setResearchMode(sessionId.trim(), mode);
  return ok({});
}

function handleGetGlobalDefault(): OkPayload<{ globalEnabled: boolean; defaultMode: ResearchMode }> | FailResult {
  const settings = getConfigValue('researchSettings') as {
    globalEnabled?: boolean;
    defaultMode?: string;
  } | undefined;
  const globalEnabled = settings?.globalEnabled ?? false;
  const rawMode = settings?.defaultMode ?? 'conservative';
  const defaultMode: ResearchMode = isValidMode(rawMode) ? rawMode : 'conservative';
  return ok({ globalEnabled, defaultMode });
}

async function handleSetGlobalDefault(
  args: SetGlobalDefaultArgs,
): Promise<OkPayload<Record<never, never>> | FailResult> {
  const { globalEnabled, defaultMode } = args;
  if (typeof globalEnabled !== 'boolean') {
    return fail('globalEnabled must be a boolean');
  }
  if (!isValidMode(defaultMode)) {
    return fail(`defaultMode must be one of: off, conservative, aggressive. Got: ${String(defaultMode)}`);
  }
  await setConfigValue('researchSettings', { globalEnabled, defaultMode });
  return ok({});
}

// ─── Registration ─────────────────────────────────────────────────────────────

let registeredChannels: string[] = [];

export function registerResearchControlHandlers(): string[] {
  const channels: string[] = [];

  function reg(channel: string, handler: (args: unknown) => unknown): void {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, ...handlerArgs) => {
      try {
        return await Promise.resolve(handler(handlerArgs[0] ?? {}));
      } catch (err) {
        log.error(`[researchControl ipc] ${channel} error:`, err);
        return fail(err);
      }
    });
    channels.push(channel);
  }

  reg('research:getSessionMode', (a) => handleGetSessionMode(a as GetSessionModeArgs));
  reg('research:setSessionMode', (a) => handleSetSessionMode(a as SetSessionModeArgs));
  reg('research:getGlobalDefault', () => handleGetGlobalDefault());
  reg('research:setGlobalDefault', (a) => handleSetGlobalDefault(a as SetGlobalDefaultArgs));

  registeredChannels = channels;
  return channels;
}

export function cleanupResearchControlHandlers(): void {
  for (const ch of registeredChannels) {
    ipcMain.removeHandler(ch);
  }
  registeredChannels = [];
}
