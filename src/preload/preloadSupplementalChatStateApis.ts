/**
 * preloadSupplementalChatStateApis.ts — preload bridge for the new chat
 * orchestration state path (Wave 86+).
 *
 * The existing agentChat:* bridge is completely independent.
 */

import {
  CHAT_STATE_CHANNELS,
  diffChannel,
  errorChannel,
  snapshotChannel,
} from '@shared/ipc/chatStateChannels';
import type { AgentChatSendMessageRequest } from '@shared/types/agentChat';
import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import type { ChatStateErrorPayload } from '@shared/types/chatStateError';
import { ipcRenderer } from 'electron';

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const chatStateNewPathApi = {
  sendMessage: (payload: AgentChatSendMessageRequest) =>
    ipcRenderer.invoke(CHAT_STATE_CHANNELS.sendMessage, payload),
  cancelTurn: (turnId: string) => ipcRenderer.invoke(CHAT_STATE_CHANNELS.cancelTurn, { turnId }),
  requestSnapshot: (threadId: string) =>
    ipcRenderer.invoke(CHAT_STATE_CHANNELS.requestSnapshot, { threadId }),
  onStateDiff: (threadId: string, callback: (diff: ChatStateDiff) => void) =>
    onChannel<ChatStateDiff>(diffChannel(threadId), callback),
  onSnapshot: (threadId: string, callback: (snap: ChatStateSnapshot) => void) =>
    onChannel<ChatStateSnapshot>(snapshotChannel(threadId), callback),
  /** Phase 5: subscribe to hard-fail error pushes for a thread. */
  onError: (threadId: string, callback: (err: ChatStateErrorPayload) => void) =>
    onChannel<ChatStateErrorPayload>(errorChannel(threadId), callback),
  /** Phase 5: reset in-memory state machine for a thread (Restart Chat Session). */
  restartSession: (threadId: string) =>
    ipcRenderer.invoke(CHAT_STATE_CHANNELS.restartSession, { threadId }),
};
