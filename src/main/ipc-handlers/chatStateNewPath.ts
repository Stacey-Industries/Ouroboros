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
 * Decision 3: hard-fail on impossible states — throws propagate as IPC errors.
 * Decision 5: SQLite is authoritative; persistence failures must NOT kill
 *             in-flight runtime state — every persistence call is try/catch-wrapped
 *             inside ChatPersistenceLayer itself.
 *
 * The existing agentChat:* path is completely untouched.
 * threadStore.ts is lazy-initialized at the singleton level (Wave 87 Phase 1).
 */

import { CHAT_STATE_CHANNELS } from '@shared/ipc/chatStateChannels';
import type { AgentChatSendMessageRequest } from '@shared/types/agentChat';
import type { ThreadId } from '@shared/types/canonicalChatEvent';
import { ipcMain } from 'electron';

import {
  broadcaster,
  getPersistence,
  normalizer,
  registry,
} from '../agentChat/chatOrchestrationSingletons';
import { cancelTurn, submitSend } from '../agentChat/chatSendCoordinator';
import { ChatStateError } from '../agentChat/chatStateError';
import { reconcileInterruptedThreads } from '../agentChat/crashRecovery';
import { DualEmitOrchestrator } from '../agentChat/dualEmitOrchestrator';
import { setShadowTap } from '../agentChat/shadowTap';
import { agentChatThreadStore } from '../agentChat/threadStore';
import log from '../logger';

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
 */
function runCrashRecovery(): void {
  try {
    void reconcileInterruptedThreads(agentChatThreadStore, getPersistence());
  } catch (err) {
    log.error('[chatStateNewPath] crash recovery failed', { err });
  }
}

// ─── sendMessage handler ──────────────────────────────────────────────────────

function assertValidSendRequest(request: AgentChatSendMessageRequest): void {
  if (hasRequiredSendFields(request)) return;
  throw new ChatStateError('malformed-event', 'chatCommand:sendMessage: missing required fields', {
    threadId: request?.threadId,
    hasContent: !!request?.content,
    hasWorkspaceRoot: !!request?.workspaceRoot,
  });
}

function hasRequiredSendFields(request: AgentChatSendMessageRequest | undefined): boolean {
  return !!request?.workspaceRoot && !!(request.content || request.attachments?.length);
}

function subscribeSender(threadId: string | undefined, sender: Electron.WebContents): void {
  if (!threadId) return;
  broadcaster.ensureThread(threadId as ThreadId);
  broadcaster.subscribe(threadId as ThreadId, sender);
}

async function handleSendMessage(
  event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ success: boolean; error?: string; turnId?: string; threadId?: string }> {
  const request = payload as AgentChatSendMessageRequest;
  assertValidSendRequest(request);
  const existingThreadId = request.threadId;
  subscribeSender(existingThreadId, event.sender);
  const result = await submitSend(request, {
    broadcaster,
    registry,
    normalizer,
    persistence: getPersistence(),
    threadStore: agentChatThreadStore,
  });
  subscribeSender(existingThreadId ? undefined : result.threadId, event.sender);
  return result;
}

async function handleCancelTurn(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): Promise<{ success: boolean; error?: string }> {
  const { turnId } = payload as { turnId?: string };
  if (!turnId) {
    throw new ChatStateError('malformed-event', 'chatCommand:cancelTurn: missing turnId', {
      turnId,
    });
  }
  return cancelTurn(turnId);
}

// ─── requestSnapshot handler ──────────────────────────────────────────────────

function handleRequestSnapshot(
  _event: Electron.IpcMainInvokeEvent,
  payload: unknown,
): import('@shared/types/chatStateDiff').ChatStateSnapshot {
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

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.cancelTurn);
  ipcMain.handle(CHAT_STATE_CHANNELS.cancelTurn, handleCancelTurn);

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.requestSnapshot);
  ipcMain.handle(CHAT_STATE_CHANNELS.requestSnapshot, handleRequestSnapshot);

  ipcMain.removeHandler(CHAT_STATE_CHANNELS.restartSession);
  ipcMain.handle(CHAT_STATE_CHANNELS.restartSession, handleRestartSession);

  log.info('[chatStateNewPath] handlers registered');
  return [
    CHAT_STATE_CHANNELS.sendMessage,
    CHAT_STATE_CHANNELS.cancelTurn,
    CHAT_STATE_CHANNELS.requestSnapshot,
    CHAT_STATE_CHANNELS.restartSession,
  ];
}
