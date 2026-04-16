/**
 * useStreamCompletionNotifications.ts — Fire desktop notifications when a
 * chat stream completes and the window is not focused.
 *
 * Subscribes to agentChat stream chunks; on a 'complete' chunk, loads the
 * thread to extract the title and last assistant text, then requests a
 * desktop notification from main (which applies its own focus gate).
 *
 * Gated by config.chat.desktopNotifications (default true).
 */

import log from 'electron-log/renderer';
import { useEffect, useRef } from 'react';

import type { AgentChatContentBlock, AgentChatMessageRecord } from '../types/electron-agent-chat';
import type { AgentChatStreamChunk } from '../types/electron-agent-chat';
import type { AppConfig } from '../types/electron-foundation';

const TITLE_MAX = 60;
const BODY_MAX = 100;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function firstTextInBlocks(blocks: AgentChatContentBlock[]): string {
  for (const block of blocks) {
    if (block.kind === 'text' && block.text) return block.text.split('\n')[0].trim();
  }
  return '';
}

function extractLastAssistantLine(messages: AgentChatMessageRecord[]): string {
  for (const msg of [...messages].reverse()) {
    if (msg.role !== 'assistant') continue;
    const line = firstTextInBlocks(msg.content);
    if (line) return line;
  }
  return '';
}

async function buildNotificationContent(
  threadId: string,
): Promise<{ title: string; body: string } | null> {
  const api = window.electronAPI?.agentChat;
  if (!api) return null;

  try {
    const result = await api.loadThread(threadId);
    if (!result.success || !result.thread) return null;
    const { thread } = result;
    const title = truncate(thread.title || 'Chat complete', TITLE_MAX);
    const bodyText = extractLastAssistantLine(thread.messages);
    const body = truncate(bodyText || 'Stream complete', BODY_MAX);
    return { title, body };
  } catch (err) {
    log.warn('[useStreamCompletionNotifications] failed to load thread:', err);
    return null;
  }
}

function isNotificationsEnabled(config: AppConfig | null): boolean {
  return config?.chat?.desktopNotifications !== false;
}

function fireNotification(threadId: string): void {
  void buildNotificationContent(threadId).then((content) => {
    if (!content) return;
    void window.electronAPI?.app
      ?.showStreamCompletionNotification({ ...content, threadId })
      .catch((err: unknown) => {
        log.warn('[useStreamCompletionNotifications] IPC error:', err);
      });
  });
}

function buildChunkHandler(
  configRef: React.RefObject<AppConfig | null>,
): (chunk: AgentChatStreamChunk) => void {
  return (chunk) => {
    if (chunk.type !== 'complete' || !chunk.threadId) return;
    if (document.hasFocus()) return;
    if (!isNotificationsEnabled(configRef.current)) return;
    fireNotification(chunk.threadId);
  };
}

/**
 * Call from AgentChatWorkspace to wire up stream-completion desktop
 * notifications. Requires config from useConfig().
 */
export function useStreamCompletionNotifications(config: AppConfig | null): void {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const api = window.electronAPI?.agentChat;
    if (!api?.onStreamChunk) return;
    return api.onStreamChunk(buildChunkHandler(configRef));
  }, []);
}
