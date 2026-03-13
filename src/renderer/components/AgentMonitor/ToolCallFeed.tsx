/**
 * ToolCallFeed.tsx — Scrollable list of tool calls for an agent session.
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { ToolCallEvent } from './types';
import { ToolCallRow } from './ToolCallRow';

// ─── Feed header ──────────────────────────────────────────────────────────────

interface FeedHeaderProps {
  count: number;
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

const FeedHeader = memo(function FeedHeader({ count, allExpanded, onExpandAll, onCollapseAll }: FeedHeaderProps): React.ReactElement {
  return (
    <div
      className="flex items-center justify-between px-3 py-1"
      style={{ borderBottom: '1px solid var(--border-muted)' }}
    >
      <span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}>
        {count} tool call{count !== 1 ? 's' : ''}
      </span>
      <button
        onClick={allExpanded ? onCollapseAll : onExpandAll}
        className="shrink-0 text-[10px] px-1.5 py-0.5 rounded transition-colors"
        style={{ color: 'var(--text-faint)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-tertiary)';
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
    setExpandedIds(new Set(toolCalls.map((toolCall) => toolCall.id)));
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

export const ToolCallFeed = memo(function ToolCallFeed({
  toolCalls,
}: ToolCallFeedProps): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    expandedIds,
    allExpanded,
    handleToggle,
    handleExpandAll,
    handleCollapseAll,
  } = useExpandedToolCalls(toolCalls);

  useAutoScrollToBottom(toolCalls.length, containerRef, bottomRef);

  if (toolCalls.length === 0) {
    return (
      <div className="px-3 py-3 text-[11px] italic" style={{ color: 'var(--text-faint)' }}>
        No tool calls yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <FeedHeader count={toolCalls.length} allExpanded={allExpanded} onExpandAll={handleExpandAll} onCollapseAll={handleCollapseAll} />
      <div ref={containerRef} className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: '320px' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        {toolCalls.map((call) => (
          <ToolCallRow key={call.id} call={call} expanded={expandedIds.has(call.id)} onToggle={handleToggle} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
