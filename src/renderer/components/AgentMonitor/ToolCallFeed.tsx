/**
 * ToolCallFeed.tsx — Scrollable merged feed of tool calls and conversation turns.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConversationTurnRow } from './ConversationTurnRow';
import { ToolCallRow } from './ToolCallRow';
import type { ConversationTurn, ToolCallEvent } from './types';

// ─── Merged feed item type ────────────────────────────────────────────────────

type FeedItem =
  | { kind: 'tool'; item: ToolCallEvent }
  | { kind: 'turn'; item: ConversationTurn };

export function buildFeedItems(
  toolCalls: ToolCallEvent[],
  conversationTurns: ConversationTurn[] | undefined,
): FeedItem[] {
  const toolItems: FeedItem[] = toolCalls.map((item) => ({ kind: 'tool', item }));
  if (!conversationTurns || conversationTurns.length === 0) return toolItems;
  const turnItems: FeedItem[] = conversationTurns.map((item) => ({ kind: 'turn', item }));
  return [...toolItems, ...turnItems].sort((a, b) => a.item.timestamp - b.item.timestamp);
}

function feedItemKey(fi: FeedItem, idx: number): string {
  if (fi.kind === 'tool') return `tool-${fi.item.id}`;
  return `turn-${fi.item.timestamp}-${idx}`;
}

// ─── Feed header ──────────────────────────────────────────────────────────────

interface FeedHeaderProps {
  count: number;
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

const FeedHeader = memo(function FeedHeader({
  count,
  allExpanded,
  onExpandAll,
  onCollapseAll,
}: FeedHeaderProps): React.ReactElement<unknown> {
  return (
    <div
      className="flex items-center justify-between px-3 py-1"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <span className="text-[10px] font-medium text-text-semantic-faint">
        {count} tool call{count !== 1 ? 's' : ''}
      </span>
      <button
        onClick={allExpanded ? onCollapseAll : onExpandAll}
        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
        style={{
          color: 'var(--text-faint)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)';
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
        title={allExpanded ? 'Collapse all tool outputs' : 'Expand all tool outputs'}
      >
        {allExpanded ? 'Collapse All' : 'Expand All'}
      </button>
    </div>
  );
});

// ─── Main component ───────────────────────────────────────────────────────────

interface ToolCallFeedProps {
  toolCalls: ToolCallEvent[];
  conversationTurns?: ConversationTurn[];
}

function useExpandedToolCalls(toolCalls: ToolCallEvent[]): {
  expandedIds: Set<string>;
  allExpanded: boolean;
  handleToggle: (id: string) => void;
  handleExpandAll: () => void;
  handleCollapseAll: () => void;
} {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(toolCalls.map((tc) => tc.id)));
  }, [toolCalls]);

  const handleCollapseAll = useCallback(() => setExpandedIds(new Set()), []);

  return {
    expandedIds,
    allExpanded: toolCalls.length > 0 && expandedIds.size >= toolCalls.length,
    handleToggle,
    handleExpandAll,
    handleCollapseAll,
  };
}

function useAutoScrollToBottom(
  itemCount: number,
  containerRef: React.RefObject<HTMLDivElement | null>,
  bottomRef: React.RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    if (isAtBottom) bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [itemCount, bottomRef, containerRef]);
}

function FeedBody({
  feedItems,
  expandedIds,
  onToggle,
  containerRef,
  bottomRef,
}: {
  feedItems: FeedItem[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}): React.ReactElement<unknown> {
  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement | null>}
      className="overflow-y-auto overflow-x-hidden"
      style={{ maxHeight: '320px' }}
    >
      {feedItems.map((fi, idx) =>
        fi.kind === 'tool' ? (
          <ToolCallRow
            key={feedItemKey(fi, idx)}
            call={fi.item}
            expanded={expandedIds.has(fi.item.id)}
            onToggle={onToggle}
          />
        ) : (
          <ConversationTurnRow key={feedItemKey(fi, idx)} turn={fi.item} />
        ),
      )}
      <div ref={bottomRef as React.RefObject<HTMLDivElement | null>} />
    </div>
  );
}

export const ToolCallFeed = memo(function ToolCallFeed({
  toolCalls,
  conversationTurns,
}: ToolCallFeedProps): React.ReactElement<unknown> {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const feedItems = useMemo(
    () => buildFeedItems(toolCalls, conversationTurns),
    [toolCalls, conversationTurns],
  );
  const { expandedIds, allExpanded, handleToggle, handleExpandAll, handleCollapseAll } =
    useExpandedToolCalls(toolCalls);

  useAutoScrollToBottom(feedItems.length, containerRef, bottomRef);

  if (toolCalls.length === 0 && (!conversationTurns || conversationTurns.length === 0)) {
    return (
      <div className="px-3 py-3 text-[11px] italic text-text-semantic-faint">
        No tool calls yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <FeedHeader
        count={toolCalls.length}
        allExpanded={allExpanded}
        onExpandAll={handleExpandAll}
        onCollapseAll={handleCollapseAll}
      />
      <FeedBody
        feedItems={feedItems}
        expandedIds={expandedIds}
        onToggle={handleToggle}
        containerRef={containerRef}
        bottomRef={bottomRef}
      />
    </div>
  );
});
