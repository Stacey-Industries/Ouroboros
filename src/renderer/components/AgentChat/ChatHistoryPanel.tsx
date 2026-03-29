import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import { classifyThread, ThreadSectionView } from './ChatHistoryPanelParts';

export interface ChatHistoryPanelProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onClose: () => void;
}

function SearchIcon(): React.ReactElement<any> {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

type HistorySections = Record<'active' | 'recent' | 'older', AgentChatThreadRecord[]>;

function usePanelDismiss(panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest?.('[data-history-toggle]')
      )
        onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, panelRef]);
}

function useHistoryPanelState(
  panelRef: React.RefObject<HTMLDivElement | null>,
  threads: AgentChatThreadRecord[],
  onClose: () => void,
  onSelect: (id: string) => void,
) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  usePanelDismiss(panelRef, onClose);
  const filteredThreads = useMemo(
    () =>
      searchQuery.trim()
        ? threads.filter((t) => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
        : threads,
    [threads, searchQuery],
  );
  const sections = useMemo<HistorySections>(() => {
    const groups: HistorySections = { active: [], recent: [], older: [] };
    for (const t of filteredThreads) groups[classifyThread(t)].push(t);
    (Object.keys(groups) as Array<keyof HistorySections>).forEach((k) =>
      groups[k].sort((a, b) => b.updatedAt - a.updatedAt),
    );
    return groups;
  }, [filteredThreads]);
  const handleSelect = useCallback(
    (threadId: string) => {
      onSelect(threadId);
      onClose();
    },
    [onClose, onSelect],
  );
  return { searchRef, searchQuery, setSearchQuery, filteredThreads, sections, handleSelect };
}

function HistoryPanelSearch({
  searchRef,
  searchQuery,
  setSearchQuery,
}: {
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}): React.ReactElement<any> {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-semantic px-3 py-2">
      <span className="text-text-semantic-muted">
        <SearchIcon />
      </span>
      <input
        ref={searchRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search conversations..."
        className="flex-1 bg-transparent text-xs text-text-semantic-primary outline-none"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery('')}
          className="rounded px-1 text-[10px] text-text-semantic-muted"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function HistoryPanelFooter({ count }: { count: number }): React.ReactElement<any> | null {
  if (count === 0) return null;
  return (
    <div className="flex flex-shrink-0 items-center justify-between border-t border-border-semantic px-3 py-1.5">
      <span className="text-[10px] text-text-semantic-muted">
        {count} conversation{count !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

type PanelBodyProps = {
  searchQuery: string;
  filteredThreads: AgentChatThreadRecord[];
  sections: HistorySections;
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

function HistoryPanelBody(p: PanelBodyProps): React.ReactElement<any> {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
      {p.filteredThreads.length === 0 && (
        <div className="px-3 py-4 text-center text-xs text-text-semantic-muted">
          {p.searchQuery ? 'No matching conversations' : 'No conversations yet'}
        </div>
      )}
      {(['active', 'recent', 'older'] as const).map((section) => (
        <ThreadSectionView
          key={section}
          section={section}
          items={p.sections[section]}
          filteredCount={p.filteredThreads.length}
          activeThreadId={p.activeThreadId}
          onSelect={p.onSelect}
          onDelete={p.onDelete}
        />
      ))}
    </div>
  );
}

const PANEL_STYLE: React.CSSProperties = {
  top: 0,
  maxHeight: '60%',
  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  backgroundColor: 'var(--surface-overlay)',
  backdropFilter: 'blur(24px) saturate(140%)',
  WebkitBackdropFilter: 'blur(24px) saturate(140%)',
  borderRadius: '0 0 10px 10px',
};

export function ChatHistoryPanel({
  threads,
  activeThreadId,
  onSelect,
  onDelete,
  onClose,
}: ChatHistoryPanelProps): React.ReactElement<any> {
  const panelRef = useRef<HTMLDivElement>(null);
  const { searchRef, searchQuery, setSearchQuery, filteredThreads, sections, handleSelect } =
    useHistoryPanelState(panelRef, threads, onClose, onSelect);
  return (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 z-50 flex flex-col overflow-hidden border-b border-border-semantic"
      style={PANEL_STYLE}
    >
      <HistoryPanelSearch
        searchRef={searchRef}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />
      <HistoryPanelBody
        searchQuery={searchQuery}
        filteredThreads={filteredThreads}
        sections={sections}
        activeThreadId={activeThreadId}
        onSelect={handleSelect}
        onDelete={onDelete}
      />
      <HistoryPanelFooter count={threads.length} />
    </div>
  );
}
