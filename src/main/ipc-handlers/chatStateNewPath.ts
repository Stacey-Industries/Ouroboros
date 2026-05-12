/**
 * chatStateNewPath.ts — IPC handlers for the new chat orchestration state path.
 *
 * Wave 86 Phase 1: walking skeleton.
 * Wave 86 Phase 2: adds ChatPersistenceLayer wiring (alias CRUD + thread columns).
 *
 * Registers two channels:
 *   chatCommand:sendMessage  — renderer submits a new message on a NEW thread
 *   chatState:requestSnapshot — renderer requests a full state snapshot
 *
 * Both channels are no-ops (return error) unless the feature flag
 * agentChatSettings.chatOrchestration.useNewStateMachine is true.
 *
 * Decision 10: feature-flag gated rollout.
 * Decision 3: hard-fail on impossible states — throws propagate as IPC errors.
 * Decision 5: SQLite is authoritative; persistence failures must NOT kill
 *             in-flight runtime state — every persistence call is try/catch-wrapped
 *             inside ChatPersistenceLayer itself.
 *
 * The existing agentChat:* path is completely untouched.
 */

import crypto from 'node:crypto';

import { CHAT_STATE_CHANNELS } from '@shared/ipc/chatStateChannels';
import type { ProviderSessionId, TurnId } from '@shared/types/canonicalChatEvent';
import { ipcMain } from 'electron';

import {
  broadcaster,
  getPersistence,
  normalizer,
  registry,
} from '../agentChat/chatOrchestrationSingletons';
import { ChatStateError } from '../agentChat/chatStateError';
import { DualEmitOrchestrator } from '../agentChat/dualEmitOrchestrator';
import { setShadowTap } from '../agentChat/shadowTap';
import { getConfigValue } from '../config';
import log from '../logger';
import { spawnStreamJsonProcess } from '../orchestration/providers/claudeStreamJsonRunner';
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes';

// ─── App-start registry rebuild ───────────────────────────────────────────────

/**
 * Called once from the IPC registration path after the DB is guaranteed open.
 * Rebuilds the in-memory IdentityRegistry from persisted identity_aliases rows
 * so the registry survives app restart (spec §4.3, Decision 9).
 */
function rebuildRegistryFromSqlite(): void {
  try {
    registry.rebuildFromSQLite(getPersistence());
  } catch (err) {
    log.error('[chatStateNewPath] rebuildRegistryFromSqlite failed', { err });
  }
}

/**
 * Phase 4: construct DualEmitOrchestrator over the shared singletons and
 * install it as the shadow tap. After this call, getShadowTap() returns the
 * orchestrator and the three bridge taps (command/stream/hook) actually fire.
 * Called once, after SQLite is open (rebuildRegistryFromSqlite has already run).
 */
function wireShadowTap(): void {
  try {
    const tap = new DualEmitOrchestrator({
      broadcaster,
      persistence: getPersistence(),
    });
    setShadowTap(tap);
    log.info('[chatStateNewPath] shadow tap installed');
  } catch (err) {
    log.error('[chatStateNewPath] wireShadowTap failed', { err });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNewPathEnabled(): boolean {
  // In development builds, default to true so Phase 4 is exercised without
  // requiring a manual config change. Production respects the stored flag.
  if (process.env.NODE_ENV === 'development') return true;
  const settings = getConfigValue('agentChatSettings');
  return settings?.chatOrchestration?.useNewStateMachine === true;
}

function requireNewPath(): void {
  if (!isNewPathEnabled()) {
    throw new ChatStateError(
      'malformed-event',
      'chatStateNewPath: useNewStateMachine flag is false — new path disabled',
      { reason: 'new-path-disabled' },
    );
  }
}

function mintTurnId(): TurnId {
  return crypto.randomUUID() as TurnId;
}

// ─── Stream wiring ────────────────────────────────────────────────────────────

function wireStreamToMachine(
  turnId: TurnId,
  onEvent: (event: StreamJsonEvent) => void,
): (raw: StreamJsonEvent) => void {
  const seenPsids = new Set<ProviderSessionId>();
  return (raw: StreamJsonEvent) => {
    try {
      const canonical = normalizer.fromStreamJson(raw, turnId, seenPsids);
      if (!canonical) return;
      // Phase 3 changed the contract: one raw event can map to multiple canonicals
      // (e.g. a user event with several tool_result blocks). Normalize to array.
      const events = Array.isArray(canonical) ? canonical : [canonical];
      for (const ev of events) {
        if (ev.type === 'provider_session_assigned') {
          registry.assignProviderSession(turnId, ev.providerSessionId);
          getPersistence().assignProviderSessionToAlias(turnId, ev.providerSessionId);
          const threadId = registry.threadIdForTurn(turnId);
          getPersistence().setLastProviderSession(threadId, ev.providerSessionId);
        }
        broadcaster.dispatch(ev);
      }
    } catch (err) {
      log.error('[chatStateNewPath] stream event dispatch failed', { err, turnId });
    }
    onEvent(raw);
  };
}

// ─── sendMessage handler ──────────────────────────────────────────────────────

function spawnAndRetire(turnId: TurnId, content: string, cwd: string, unsub: () => void): void {
  const handle = spawnStreamJsonProcess({
    prompt: content,
    cwd,
    onEvent: wireStreamToMachine(turnId, () => undefined),
  });
  handle.result
    .then(() => {
      registry.retireTurn(turnId);
      getPersistence().retireAlias(turnId, Date.now());
      unsub();
    })
    .catch((err: unknown) => {
      log.error('[chatStateNewPath] subprocess failed', { err, turnId });
      registry.retireTurn(turnId);
      getPersistence().retireAlias(turnId, Date.now());
      unsub();
    });
}

async function handleSendMessage(
  event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ success: boolean; error?: string; turnId?: string }> {
  requireNewPath();

  const { threadId, content, cwd } = payload as {
    threadId: string;
    content: string;
    cwd: string;
  };

  if (!threadId || !content || !cwd) {
    throw new ChatStateError(
      'malformed-event',
      'chatCommand:sendMessage: missing required fields',
      {
        threadId,
        hasContent: !!content,
        hasCwd: !!cwd,
      },
    );
  }

  const tid = threadId as import('@shared/types/canonicalChatEvent').ThreadId;
  const turnId = mintTurnId();

  registry.registerTurn(tid, turnId);
  // Persist the new alias row immediately — before spawning the subprocess.
  getPersistence().insertAlias({ threadId: tid, turnId, createdAt: Date.now() });

  broadcaster.ensureThread(tid);

  const unsub = broadcaster.subscribe(tid, event.sender);
  const submitEvent = normalizer.fromCommand({ threadId, content }, turnId);
  broadcaster.dispatch(submitEvent);
  spawnAndRetire(turnId, content, cwd, unsub);

  return { success: true, turnId };
}

// ─── requestSnapshot handler ──────────────────────────────────────────────────

function handleRequestSnapshot(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): import('@shared/types/chatStateDiff').ChatStateSnapshot {
  requireNewPath();
  const { threadId } = payload as { threadId: string };
  return broadcaster.snapshot(threadId as import('@shared/types/canonicalChatEvent').ThreadId);
}

// ─── Registrar ────────────────────────────────────────────────────────────────

export function registerChatStateNewPathHandlers(): string[] {
  // Rebuild the registry from SQLite so crash-recovery state is restored.
  rebuildRegistryFromSqlite();
  // Phase 4: activate the shadow path so bridge taps actually fire.
  wireShadowTap();

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.sendMessage);
  ipcMain.handle(CHAT_STATE_CHANNELS.sendMessage, handleSendMessage);

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.requestSnapshot);
  ipcMain.handle(CHAT_STATE_CHANNELS.requestSnapshot, handleRequestSnapshot);

  log.info('[chatStateNewPath] handlers registered');
  return [CHAT_STATE_CHANNELS.sendMessage, CHAT_STATE_CHANNELS.requestSnapshot];
}
