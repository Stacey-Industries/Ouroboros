/**
 * hooksChatLaunch.ts — Chat-session launch counter with timeout safety net.
 *
 * Tracks in-flight chat session launches so hooks.ts can suppress phantom
 * terminal-hook events that arrive before the synthetic agent_start fires.
 * If Claude Code crashes before emitting agent_start, the safety timeout
 * auto-decrements the counter after 30 s to prevent permanent suppression.
 */

import log from './logger';

let chatLaunchesInFlight = 0;
const chatLaunchTimeouts = new Set<ReturnType<typeof setTimeout>>();
const CHAT_LAUNCH_TIMEOUT_MS = 30_000;

function onChatLaunchTimeout(handle: ReturnType<typeof setTimeout>): void {
  chatLaunchTimeouts.delete(handle);
  if (chatLaunchesInFlight > 0) {
    chatLaunchesInFlight--;
    log.warn(`chatLaunchesInFlight safety timeout — counter now ${chatLaunchesInFlight}`);
  }
}

export function beginChatSessionLaunch(): void {
  chatLaunchesInFlight++;
  const handle = setTimeout(() => onChatLaunchTimeout(handle), CHAT_LAUNCH_TIMEOUT_MS);
  chatLaunchTimeouts.add(handle);
}

export function endChatSessionLaunch(): void {
  if (chatLaunchesInFlight <= 0) return;
  chatLaunchesInFlight--;
  const [first] = chatLaunchTimeouts;
  if (first !== undefined) {
    clearTimeout(first);
    chatLaunchTimeouts.delete(first);
  }
}

export function getChatLaunchesInFlight(): number {
  return chatLaunchesInFlight;
}
