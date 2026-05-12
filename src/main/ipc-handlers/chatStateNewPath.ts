/**
 * chatStateNewPath.ts — IPC handlers for the new chat orchestration state path.
 *
 * Wave 86 Phase 1: walking skeleton.
 * Wave 86 Phase 2: adds ChatPersistenceLayer wiring (alias CRUD + thread columns).
 * Wave 86 Phase 5: adds restartSession handler + crash-recovery scan + error-emit.
 *
 * Registers channels:
 *   chatCommand:sendMessage    — renderer submits a new message on a NEW thread
 *   chatState:requestSnapshot  — renderer requests a full state snapshot
 *   chatCommand:restartSession — renderer resets in-memory state (Restart Chat Session)
 *
 * All channels are no-ops (return error) unless the feature flag
 * agentChatSettings.chatOrchestration.useNewStateMachine is true.
 *
 * Decision 10: feature-flag gated rollout.
 * Decision 3: hard-fail on impossible states — throws propagate as IPC errors.
 * Decision 5: SQLite is authoritative; persistence failures must NOT kill
 *             in-flight runtime state — every persistence call is try/catch-wrapped
 *             inside ChatPersistenceLayer itself.
 *
 * The existing agentChat:* path is completely untouched.
 *
 * Note: agentChatThreadStore is accessed lazily (via require inside runCrashRecovery)
 * because threadStore.ts calls app.getPath('userData') at module-eval time. Importing
 * it statically would crash test environments where Electron's `app` is not available.
 */

import crypto from 'node:crypto';

import { CHAT_STATE_CHANNELS } from '@shared/ipc/chatStateChannels';
import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';
import type { ChatStateErrorPayload } from '@shared/types/chatStateError';
import { ipcMain } from 'electron';

import {
  broadcaster,
  getPersistence,
  normalizer,
  registry,
} from '../agentChat/chatOrchestrationSingletons';
import { ChatStateError } from '../agentChat/chatStateError';
import { reconcileInterruptedThreads } from '../agentChat/crashRecovery';
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

// ─── App-start crash recovery (Phase 5) ──────────────────────────────────────

/**
 * Scan threads with non-terminal status and mark them as interrupted.
 * Synthesizes [interrupted] tool_result for any dangling tool_use to prevent
 * Anthropic strict-adjacency violations on --resume (spec §4.5).
 *
 * agentChatThreadStore is loaded lazily via require to avoid module-eval of
 * threadStore.ts at import time (it calls app.getPath('userData') at module scope).
 */
function runCrashRecovery(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { agentChatThreadStore } = require('../agentChat/threadStore') as {
      agentChatThreadStore: import('../agentChat/threadStore').AgentChatThreadStore;
    };
    void reconcileInterruptedThreads(agentChatThreadStore, getPersistence());
  } catch (err) {
    log.error('[chatStateNewPath] crash recovery failed', { err });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNewPathEnabled(): boolean {
  // Production reads the stored flag (default now true per Decision 10 Phase 5).
  const settings = getConfigValue('agentChatSettings');
  return settings?.chatOrchestration?.useNewStateMachine !== false;
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

// ─── Error-emit helper (Phase 5) ─────────────────────────────────────────────

/**
 * Serialize a caught error into a ChatStateErrorPayload and push it to all
 * renderer windows subscribed to the given thread. Decision 3: hard-fail must
 * be visible in the renderer, not just in main-process logs.
 */
function emitErrorToRenderer(threadId: ThreadId, err: unknown): void {
  const payload: ChatStateErrorPayload =
    err instanceof ChatStateError
      ? { kind: err.kind, message: err.message, details: err.details }
      : { kind: 'malformed-event', message: String(err), details: {} };
  broadcaster.emitError(threadId, payload);
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
      // One raw event can map to multiple canonicals (e.g. user event with
      // several tool_result blocks). Normalize to array.
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
      try {
        const threadId = registry.threadIdForTurn(turnId);
        emitErrorToRenderer(threadId, err);
      } catch {
        // registry lookup may also fail; swallow to keep the stream alive
      }
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
      { threadId, hasContent: !!content, hasCwd: !!cwd },
    );
  }

  const tid = threadId as ThreadId;
  const turnId = mintTurnId();

  registry.registerTurn(tid, turnId);
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
  return broadcaster.snapshot(threadId as ThreadId);
}

// ─── restartSession handler (Phase 5) ─────────────────────────────────────────

/**
 * Resets the in-memory state machine for a thread so the user can re-send
 * after a hard-fail error. The broadcaster drops and re-creates the machine,
 * clearing any stuck state. Decision 3: Restart Chat Session action.
 */
function handleRestartSession(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): { success: boolean; error?: string } {
  try {
    requireNewPath();
    const { threadId } = payload as { threadId: string };
    broadcaster.resetThread(threadId as ThreadId);
    log.info('[chatStateNewPath] session restarted', { threadId });
    return { success: true };
  } catch (err) {
    log.error('[chatStateNewPath] restartSession failed', { err });
    return { success: false, error: String(err) };
  }
}

// ─── Registrar ────────────────────────────────────────────────────────────────

export function registerChatStateNewPathHandlers(): string[] {
  // Rebuild the registry from SQLite so crash-recovery state is restored.
  rebuildRegistryFromSqlite();
  // Phase 5: mark and repair threads interrupted by a prior crash.
  runCrashRecovery();
  // Phase 4: activate the shadow path so bridge taps actually fire.
  wireShadowTap();

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.sendMessage);
  ipcMain.handle(CHAT_STATE_CHANNELS.sendMessage, handleSendMessage);

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.requestSnapshot);
  ipcMain.handle(CHAT_STATE_CHANNELS.requestSnapshot, handleRequestSnapshot);

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.restartSession);
  ipcMain.handle(CHAT_STATE_CHANNELS.restartSession, handleRestartSession);

  log.info('[chatStateNewPath] handlers registered');
  return [
    CHAT_STATE_CHANNELS.sendMessage,
    CHAT_STATE_CHANNELS.requestSnapshot,
    CHAT_STATE_CHANNELS.restartSession,
  ];
}
