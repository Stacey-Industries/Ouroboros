import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { SessionMemoryEntry } from '../../types/electron';
import { SessionMemoryRow } from './SessionMemoryRow';

function sortMemories(memories: SessionMemoryEntry[]): SessionMemoryEntry[] {
  return [...memories].sort((a, b) =>
    b.confidence !== a.confidence
      ? b.confidence - a.confidence
      : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

function MemoryEmptyState(): React.ReactElement {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 p-8 text-center text-text-semantic-muted"
      style={{ fontSize: 12, fontFamily: 'var(--font-ui)' }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.4 }}
      >
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
      className="flex items-center justify-between border-b px-3 py-2"
      style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-ui)' }}
    >
      <span
        className="text-[11px] font-semibold uppercase tracking-wider text-text-semantic-muted"
        style={{ letterSpacing: '0.04em' }}
      >
        Session Memory
      </span>
      {count > 0 && (
        <span
          className="rounded-full bg-interactive-accent px-1.5 py-0.5 text-[10px] font-semibold text-white"
          style={{ minWidth: 18, textAlign: 'center' }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

async function loadWorkspaceMemories(
  workspaceRoot: string,
  setMemories: React.Dispatch<React.SetStateAction<SessionMemoryEntry[]>>,
  mountedRef: React.MutableRefObject<boolean>,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<void> {
  try {
    const result = await window.electronAPI.agentChat.listMemories(workspaceRoot);
    if (!mountedRef.current) return;
    if (result.success && result.memories) setMemories(sortMemories(result.memories));
  } catch (err) {
    console.warn('[SessionMemoryPanel] Failed to load memories:', err);
  } finally {
    if (mountedRef.current) setLoading(false);
  }
}

async function updateWorkspaceMemory(args: {
  workspaceRoot: string;
  id: string;
  updates: { content?: string; type?: string; relevantFiles?: string[] };
  setMemories: React.Dispatch<React.SetStateAction<SessionMemoryEntry[]>>;
  mountedRef: React.MutableRefObject<boolean>;
}): Promise<void> {
  const { workspaceRoot, id, updates, setMemories, mountedRef } = args;
  try {
    const result = await window.electronAPI.agentChat.updateMemory(workspaceRoot, id, updates);
    if (!mountedRef.current) return;
    if (result.success && result.memory) {
      setMemories((prev) =>
        sortMemories(prev.map((entry) => (entry.id === id ? result.memory! : entry))),
      );
    }
  } catch (err) {
    console.warn('[SessionMemoryPanel] Failed to update memory:', err);
  }
}

async function deleteWorkspaceMemory(workspaceRoot: string, id: string): Promise<void> {
  try {
    await window.electronAPI.agentChat.deleteMemory(workspaceRoot, id);
  } catch (err) {
    console.warn('[SessionMemoryPanel] Failed to delete memory:', err);
  }
}

function useMountedRef(): React.MutableRefObject<boolean> {
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return mountedRef;
}

function useMemoryActions(
  workspaceRoot: string | null,
  setMemories: React.Dispatch<React.SetStateAction<SessionMemoryEntry[]>>,
  mountedRef: React.MutableRefObject<boolean>,
) {
  const handleUpdate = useCallback(
    (id: string, updates: { content?: string; type?: string; relevantFiles?: string[] }) => {
      if (!workspaceRoot) return;
      void updateWorkspaceMemory({ workspaceRoot, id, updates, setMemories, mountedRef });
    },
    [workspaceRoot, setMemories, mountedRef],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!workspaceRoot) return;
      setMemories((prev) => prev.filter((entry) => entry.id !== id));
      void deleteWorkspaceMemory(workspaceRoot, id);
    },
    [workspaceRoot, setMemories],
  );

  return { handleUpdate, handleDelete };
}

function useSessionMemoryPanelModel(workspaceRoot: string | null): {
  loading: boolean;
  memories: SessionMemoryEntry[];
  handleUpdate: (
    id: string,
    updates: { content?: string; type?: string; relevantFiles?: string[] },
  ) => void;
  handleDelete: (id: string) => void;
} {
  const [memories, setMemories] = useState<SessionMemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useMountedRef();

  useEffect(() => {
    if (!workspaceRoot) {
      setMemories([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadWorkspaceMemories(workspaceRoot, setMemories, mountedRef, setLoading);
  }, [workspaceRoot, mountedRef]);

  const { handleUpdate, handleDelete } = useMemoryActions(workspaceRoot, setMemories, mountedRef);
  return { loading, memories, handleUpdate, handleDelete };
}

export interface SessionMemoryPanelProps {
  workspaceRoot: string | null;
}

export const SessionMemoryPanel = memo(function SessionMemoryPanel({
  workspaceRoot,
}: SessionMemoryPanelProps): React.ReactElement {
  const { loading, memories, handleUpdate, handleDelete } =
    useSessionMemoryPanelModel(workspaceRoot);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <MemoryPanelHeader count={0} />
        <div className="flex flex-1 items-center justify-center text-xs text-text-semantic-muted">
          Loading memories...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MemoryPanelHeader count={memories.length} />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
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
