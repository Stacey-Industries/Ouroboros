/**
 * useVirtualScroll.ts — Hook for virtualizing the AgentChat message list.
 *
 * Splits messages into virtualized (completed) and non-virtualized (streaming).
 * Handles auto-scroll-to-bottom behavior with user-scroll-up detection.
 */

import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AgentChatMessageRecord } from '../../types/electron';

export interface VirtualItemData {
  message: AgentChatMessageRecord;
  index: number;
}

function isStreamingMessage(msg: AgentChatMessageRecord): boolean {
  return '_streaming' in msg && (msg as Record<string, unknown>)._streaming === true;
}

interface VirtualScrollResult {
  scrollRef: React.RefObject<HTMLDivElement>;
  handleScroll: () => void;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualizedMessages: AgentChatMessageRecord[];
  streamingMessage: AgentChatMessageRecord | null;
}

export function useVirtualScroll(messages: AgentChatMessageRecord[]): VirtualScrollResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const prevCountRef = useRef(0);

  const lastMsg = messages[messages.length - 1];
  const hasStreamingTail = lastMsg && isStreamingMessage(lastMsg);
  const virtualizedMessages = hasStreamingTail ? messages.slice(0, -1) : messages;
  const streamingMessage = hasStreamingTail ? lastMsg : null;

  const virtualizer = useVirtualizer({
    count: virtualizedMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 120,
    overscan: 5,
    getItemKey: (index) => virtualizedMessages[index].id,
  });

  useEffect(() => {
    if (userScrolledUp) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [virtualizedMessages.length, streamingMessage, userScrolledUp]);

  useEffect(() => {
    if (virtualizedMessages.length > prevCountRef.current && !userScrolledUp) {
      virtualizer.scrollToIndex(virtualizedMessages.length - 1, { align: 'end' });
    }
    prevCountRef.current = virtualizedMessages.length;
  }, [virtualizedMessages.length, userScrolledUp, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setUserScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 80);
  }, []);

  return {
    scrollRef: scrollRef as React.RefObject<HTMLDivElement>,
    handleScroll,
    virtualizer,
    virtualizedMessages,
    streamingMessage,
  };
}
