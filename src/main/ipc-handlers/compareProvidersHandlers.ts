/**
 * ipc-handlers/compareProvidersHandlers.ts — Compare-providers IPC (Wave 36 Phase F).
 *
 * Channels registered:
 *   compareProviders:start   — spawn two sessions via spawnForProfile, return compareId + session pair
 *   compareProviders:cancel  — cancel both in-flight sessions for a compareId
 *
 * Push channel (main → renderer):
 *   compareProviders:event   — session events fanned into one channel keyed by compareId
 *
 * Architecture decision: one event channel per compareId (not per session).
 * Each payload carries `providerId` so the renderer routes to the correct pane.
 * This avoids proliferating dynamic channel names in the catalog.
 */

import { ipcMain } from 'electron';

import log from '../logger';
import { getSessionProvider } from '../providers/providerRegistry';
import type { ProfileSnapshot, SessionEvent, SessionHandle, SpawnOptions } from '../providers/sessionProvider';
import { getAllActiveWindows } from '../windowManager';

// ─── Response helpers ──────────────────────────────────────────────────────────

type OkResult<T extends object> = { success: true } & T;
type FailResult = { success: false; error: string };

function ok<T extends object>(data: T): OkResult<T> {
  return { success: true, ...data };
}

function fail(err: unknown): FailResult {
  return { success: false, error: err instanceof Error ? err.message : String(err) };
}

// ─── In-flight session tracking ────────────────────────────────────────────────

interface CompareSession {
  sessionA: SessionHandle;
  sessionB: SessionHandle;
  cleanupA: () => void;
  cleanupB: () => void;
}

const activeSessions = new Map<string, CompareSession>();

// ─── Broadcast helper ──────────────────────────────────────────────────────────

interface CompareEventPayload {
  compareId: string;
  providerId: string;
  event: SessionEvent;
}

function broadcastCompareEvent(payload: CompareEventPayload): void {
  const windows = getAllActiveWindows().filter((w) => !w.isDestroyed());
  for (const win of windows) {
    try {
      win.webContents.mainFrame.send('compareProviders:event', payload);
    } catch {
      // Frame disposed — skip
    }
  }
}

// ─── Arg types ─────────────────────────────────────────────────────────────────

interface StartArgs {
  prompt: string;
  projectPath: string;
  providerIds: [string, string];
}

interface CancelArgs {
  compareId: string;
}

// ─── Synthetic profile builder ─────────────────────────────────────────────────

function syntheticProfile(providerId: string): ProfileSnapshot {
  return { id: `compare-${providerId}`, model: undefined, tools: [] };
}

// ─── Spawn helper ──────────────────────────────────────────────────────────────

async function spawnCompareSession(
  providerId: string,
  compareId: string,
  opts: Omit<SpawnOptions, 'sessionId' | 'profile'>,
): Promise<{ handle: SessionHandle; cleanup: () => void }> {
  const provider = getSessionProvider(providerId);
  if (!provider) {
    throw new Error(`Unknown provider: "${providerId}"`);
  }
  const sessionId = `${compareId}-${providerId}-${Date.now()}`;
  const handle = await provider.spawn({
    ...opts,
    sessionId,
    profile: syntheticProfile(providerId),
  });
  const cleanup = provider.onEvent(handle, (event) => {
    broadcastCompareEvent({ compareId, providerId, event });
  });
  return { handle, cleanup };
}

// ─── Handler: start ───────────────────────────────────────────────────────────

async function handleStart(args: unknown): Promise<OkResult<object> | FailResult> {
  const { prompt, projectPath, providerIds } = (args ?? {}) as StartArgs;
  if (!prompt || typeof prompt !== 'string') return fail('prompt is required');
  if (!projectPath || typeof projectPath !== 'string') return fail('projectPath is required');
  if (!Array.isArray(providerIds) || providerIds.length !== 2) return fail('providerIds must be [string, string]');

  const compareId = `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const spawnOpts = { prompt, projectPath };

  try {
    const [resA, resB] = await Promise.all([
      spawnCompareSession(providerIds[0], compareId, spawnOpts),
      spawnCompareSession(providerIds[1], compareId, spawnOpts),
    ]);
    activeSessions.set(compareId, {
      sessionA: resA.handle, sessionB: resB.handle,
      cleanupA: resA.cleanup, cleanupB: resB.cleanup,
    });
    log.info(`[compareProviders] started compareId=${compareId} providers=${providerIds.join(',')}`);
    return ok({
      compareId,
      sessions: [
        { id: resA.handle.id, providerId: providerIds[0] },
        { id: resB.handle.id, providerId: providerIds[1] },
      ],
    });
  } catch (err) {
    return fail(err);
  }
}

// ─── Handler: cancel ──────────────────────────────────────────────────────────

async function handleCancel(args: unknown): Promise<OkResult<object> | FailResult> {
  const { compareId } = (args ?? {}) as CancelArgs;
  if (!compareId || typeof compareId !== 'string') return fail('compareId is required');
  const session = activeSessions.get(compareId);
  if (!session) return fail(`No active compare session: ${compareId}`);

  const { sessionA, sessionB, cleanupA, cleanupB } = session;
  cleanupA();
  cleanupB();
  activeSessions.delete(compareId);

  const provA = getSessionProvider(sessionA.providerId);
  const provB = getSessionProvider(sessionB.providerId);
  await Promise.allSettled([
    provA?.cancel(sessionA),
    provB?.cancel(sessionB),
  ]);

  log.info(`[compareProviders] cancelled compareId=${compareId}`);
  return ok({});
}

// ─── Registration ──────────────────────────────────────────────────────────────

export function registerCompareProvidersHandlers(): string[] {
  const channels: string[] = [];

  ipcMain.handle('compareProviders:start', (_event, args) => handleStart(args));
  channels.push('compareProviders:start');

  ipcMain.handle('compareProviders:cancel', (_event, args) => handleCancel(args));
  channels.push('compareProviders:cancel');

  return channels;
}

export function cleanupCompareProvidersHandlers(): void {
  for (const { cleanupA, cleanupB } of activeSessions.values()) {
    cleanupA();
    cleanupB();
  }
  activeSessions.clear();
}
