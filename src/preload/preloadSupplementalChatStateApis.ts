/**
 * preloadSupplementalChatStateApis.ts — preload bridge for the new chat
 * orchestration state path (Wave 86+).
 *
 * Gated behind agentChatSettings.chatOrchestration.useNewStateMachine.
 * The existing agentChat:* bridge is completely independent.
 */

import { CHAT_STATE_CHANNELS, diffChannel } from '@shared/ipc/chatStateChannels';
import type { ChatStateDiff } from '@shared/types/chatStateDiff';
import { ipcRenderer } from 'electron';

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export const chatStateNewPathApi = {
  sendMessage: (payload: { threadId: string; content: string; cwd: string }) =>
    ipcRenderer.invoke(CHAT_STATE_CHANNELS.sendMessage, payload),
  requestSnapshot: (threadId: string) =>
    ipcRenderer.invoke(CHAT_STATE_CHANNELS.requestSnapshot, { threadId }),
  onStateDiff: (threadId: string, callback: (diff: ChatStateDiff) => void) =>
    onChannel<ChatStateDiff>(diffChannel(threadId), callback),
};
