/**
 * webPreloadChatStateApi.ts — Web preload builder for the new chat orchestration
 * state path (Wave 86 Phase 6b).
 *
 * Mirrors src/preload/preloadSupplementalChatStateApis.ts for web mode.
 * Routes through WebSocketTransport instead of Electron ipcRenderer.
 *
 * The existing agentChat:* bridge in buildAgentChatApi is completely independent.
 */

import {
  CHAT_STATE_CHANNELS,
  diffChannel,
  errorChannel,
  snapshotChannel,
} from '@shared/ipc/chatStateChannels';

import type { WebSocketTransport } from './webPreloadTransport';

/**
 * Builds the chatStateNewPath API namespace for web mode.
 * Returned object is assigned to electronAPI.chatStateNewPath.
 */
export function buildChatStateNewPathApi(t: WebSocketTransport) {
  return {
    sendMessage: (payload: { threadId: string; content: string; cwd: string }) =>
      t.invoke(CHAT_STATE_CHANNELS.sendMessage, payload),

    requestSnapshot: (threadId: string) =>
      t.invoke(CHAT_STATE_CHANNELS.requestSnapshot, { threadId }),

    onStateDiff: (threadId: string, cb: (diff: unknown) => void) =>
      t.on(diffChannel(threadId), cb),

    onSnapshot: (threadId: string, cb: (snap: unknown) => void) =>
      t.on(snapshotChannel(threadId), cb),

    /** Phase 5: subscribe to hard-fail error pushes for a thread. */
    onError: (threadId: string, cb: (err: unknown) => void) =>
      t.on(errorChannel(threadId), cb),

    /** Phase 5: reset in-memory state machine for a thread (Restart Chat Session). */
    restartSession: (threadId: string) =>
      t.invoke(CHAT_STATE_CHANNELS.restartSession, { threadId }),
  };
}
