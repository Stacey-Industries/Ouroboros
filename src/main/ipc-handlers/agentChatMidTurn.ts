/**
 * agentChatMidTurn.ts — IPC handler for mid-turn message injection.
 *
 * Registers `agentChat:injectMidTurn` which writes a raw user-message
 * NDJSON line to the active warm process stdin without awaiting —
 * allowing the user to steer a running turn mid-stream.
 */

import { AGENT_CHAT_INVOKE_CHANNELS } from '../agentChat';
import { injectWarmUserMessage } from '../orchestration/providers/claudeWarmProcessManager';

type RegisterFn = (
  channels: string[],
  channel: string,
  handler: (...args: unknown[]) => unknown,
) => void;

type RequireStringFn = (value: unknown, name: string) => string;

export function registerMidTurnHandlers(
  channels: string[],
  register: RegisterFn,
  requireValidString: RequireStringFn,
): void {
  register(
    channels,
    AGENT_CHAT_INVOKE_CHANNELS.injectMidTurn,
    (taskId: unknown, content: unknown) => {
      const tid = requireValidString(taskId, 'taskId');
      const msg = requireValidString(content, 'content');
      injectWarmUserMessage(tid, msg);
      return { success: true };
    },
  );
}
