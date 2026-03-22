/**
 * SessionMemoryPanel.tsx — View, edit, and delete cross-session memories.
 *
 * Rendered in the right sidebar via the view switcher dropdown.
 * Loads memories from the main process on mount, supports inline editing
 * and deletion. Sorted by confidence (highest first), then recency.
 */

import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import type { SessionMemoryEntry } from '../../types/electron';
import { SessionMemoryRow } from './SessionMemoryRow';

function sortMemories(memories: SessionMemoryEntry[]): SessionMemoryEntry[] {
  return [...memories].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}

function MemoryEmptyState(): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 p-8 text-center text-text-semantic-muted"
      style={{ fontSize: 12, fontFamily: 'var(--font-ui)' }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <path d="M12 2a7 7 0 0 1 7 7c0 2.5-1.5 4.5-3 6s-2 3.5-2 5h-4c0-1.5-.5-3.5-2-5s-3-3.5-3-6a7 7 0 0 1 7-7z" />
        <path d="M9 22h6" />
        <path d="M10 18h4" />
      </svg>
      <span className="text-xs">No memories stored for this workspace.</span>
      <span className="text-[11px] text-text-semantic-faint">
        Memories are created automatically from chat sessions, or manually with /remember.
      </span>
    </div>
  );
}

function MemoryPanelHeader({ count }: { count: number }): React.ReactElement {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 border-b"
      style={{
        borderColor: 'var(--border)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wider text-text-semantic-muted"
        style={{ letterSpacing: '0.04em' }}
      >
        Session Memory
      </span>
      {count > 0 && (
        <span
          className="text-[10px] rounded-full px-1.5 py-0.5 bg-interactive-accent text-white"
          style={{ fontWeight: 600, minWidth: 18, textAlign: 'center' }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

export interface SessionMemoryPanelProps {
  workspaceRoot: string | null;
}

export const SessionMemoryPanel = memo(function SessionMemoryPanel({
  workspaceRoot,
}: SessionMemoryPanelProps): React.ReactElement {
  const [memories, setMemories] = useState<SessionMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load memories on mount and when workspaceRoot changes
  useEffect(() => {
    if (!workspaceRoot) {
      setMemories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      void window.electronAPI.agentChat.listMemories(workspaceRoot).then((result) => {
        if (!mountedRef.current) return;
        if (result.success && result.memories) {
          setMemories(sortMemories(result.memories));
        }
        setLoading(false);
      });
    } catch (err) {
      console.warn('[SessionMemoryPanel] Failed to load memories:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, [workspaceRoot]);

  const handleUpdate = useCallback((id: string, updates: { content?: string; type?: string; relevantFiles?: string[] }) => {
    if (!workspaceRoot) return;
    try {
      void window.electronAPI.agentChat.updateMemory(workspaceRoot, id, updates).then((result) => {
        if (!mountedRef.current) return;
        if (result.success && result.memory) {
          setMemories((prev) => sortMemories(prev.map((m) => (m.id === id ? result.memory! : m))));
        }
      });
    } catch (err) {
      console.warn('[SessionMemoryPanel] Failed to update memory:', err);
    }
  }, [workspaceRoot]);

  const handleDelete = useCallback((id: string) => {
    if (!workspaceRoot) return;
    // Optimistic removal
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      void window.electronAPI.agentChat.deleteMemory(workspaceRoot, id);
    } catch (err) {
      console.warn('[SessionMemoryPanel] Failed to delete memory:', err);
    }
  }, [workspaceRoot]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <MemoryPanelHeader count={0} />
        <div className="flex items-center justify-center flex-1 text-xs text-text-semantic-muted">
          Loading memories...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <MemoryPanelHeader count={memories.length} />
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {memories.length === 0 ? (
          <MemoryEmptyState />
        ) : (
          memories.map((entry) => (
            <SessionMemoryRow
              key={entry.id}
              entry={entry}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
});
