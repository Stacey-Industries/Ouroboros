/**
 * shared/ipc/chatStateChannels.ts — Wave 86 chat-state IPC channel names.
 *
 * Single source of truth for every channel string used by:
 *   - src/main/agentChat/chatStateBroadcaster.ts  (sends)
 *   - src/main/ipc-handlers/chatStateNewPath.ts   (registers ipcMain.handle)
 *   - src/preload/preloadSupplementalChatStateApis.ts (ipcRenderer.invoke / on)
 *
 * Import this file on either side of the IPC boundary. It has no runtime
 * dependencies so it is safe in main, preload, and renderer contexts.
 */

export const CHAT_STATE_CHANNELS = {
  /** renderer → main: invoke to send a user message. */
  sendMessage: 'chatCommand:sendMessage',
  /** renderer → main: invoke to fetch a full thread snapshot. */
  requestSnapshot: 'chatState:requestSnapshot',
  /**
   * main → renderer (per-thread): push prefix. Use diffChannel(threadId) to
   * build the full channel name. Never use this prefix directly as a channel.
   */
  diffPrefix: 'chatState:diff',
  /**
   * main → renderer (per-thread): initial snapshot push prefix sent when a
   * renderer window subscribes. Use snapshotChannel(threadId) to build the
   * full channel name.
   */
  snapshotPrefix: 'chatState:snapshot',
} as const;

/**
 * Build the per-thread diff push channel name.
 * Broadcaster sends to this; renderer subscribes to this.
 *
 * @example diffChannel('t-abc') === 'chatState:diff:t-abc'
 */
export function diffChannel(threadId: string): string {
  return `${CHAT_STATE_CHANNELS.diffPrefix}:${threadId}`;
}

/**
 * Build the per-thread initial-snapshot push channel name.
 * Broadcaster sends on subscribe; renderer hydrates on receipt.
 *
 * @example snapshotChannel('t-abc') === 'chatState:snapshot:t-abc'
 */
export function snapshotChannel(threadId: string): string {
  return `${CHAT_STATE_CHANNELS.snapshotPrefix}:${threadId}`;
}
