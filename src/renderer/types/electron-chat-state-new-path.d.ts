/**
 * electron-chat-state-new-path.d.ts — IPC type contract for the new chat
 * orchestration state path (Wave 86+).
 *
 * The existing agentChat:* path is completely independent.
 */

import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import type { ChatStateErrorPayload } from '@shared/types/chatStateError';

export interface ChatStateNewPathAPI {
  /**
   * Submit a new message on a thread. Returns the minted turnId.
   * Throws (propagated as IPC error) when required fields are missing.
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

  /**
   * Phase 5: subscribe to hard-fail error pushes for a thread.
   * Fires when main catches a ChatStateError on the new path.
   * Returns a cleanup function.
   */
  onError: (threadId: string, callback: (err: ChatStateErrorPayload) => void) => () => void;

  /**
   * Phase 5: reset the in-memory state machine for a thread (Restart Chat Session).
   * Clears the in-flight state so the user can re-send.
   */
  restartSession: (threadId: string) => Promise<{ success: boolean; error?: string }>;
}
