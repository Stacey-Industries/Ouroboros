/**
 * electron-chat-state-new-path.d.ts — IPC type contract for the new chat
 * orchestration state path (Wave 86+).
 *
 * These channels are gated behind agentChatSettings.chatOrchestration.useNewStateMachine.
 * The existing agentChat:* path is completely independent.
 */

import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';

export interface ChatStateNewPathAPI {
  /**
   * Submit a new message on a thread. Returns the minted turnId.
   * Throws (propagated as IPC error) when the feature flag is false or fields are missing.
   */
  sendMessage: (payload: {
    threadId: string;
    content: string;
    cwd: string;
  }) => Promise<{ success: boolean; error?: string; turnId?: string }>;

  /**
   * Request a full snapshot of thread state.
   * Throws when the feature flag is false or the thread is unknown.
   */
  requestSnapshot: (threadId: string) => Promise<ChatStateSnapshot>;

  /**
   * Subscribe to state diffs for a thread. The broadcaster sends diffs
   * via this push channel after each dispatched event.
   * Returns a cleanup function.
   */
  onStateDiff: (threadId: string, callback: (diff: ChatStateDiff) => void) => () => void;

  /**
   * Subscribe to initial-snapshot pushes for a thread. The broadcaster
   * sends the current snapshot immediately when a subscribe() call is made
   * from main. Returns a cleanup function.
   */
  onSnapshot: (threadId: string, callback: (snap: ChatStateSnapshot) => void) => () => void;
}
