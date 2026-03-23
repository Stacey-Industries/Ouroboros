import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';

export interface ChatHistoryPanelProps {
  threads: AgentChatThreadRecord[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onDelete: (threadId: string) => void;
  onClose: () => void;
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return weeks < 5 ? `${weeks}w ago` : `${Math.floor(days / 30)}mo ago`;
}

type StatusDisplay = { color: string; pulse: boolean; label: string; icon: 'spinner' | 'check' | 'warning' | 'error' | 'idle' };

function getStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'running': return { color: 'var(--accent)', pulse: true, label: 'Running', icon: 'spinner' };
    case 'submitting': return { color: 'var(--accent)', pulse: true, label: 'Starting', icon: 'spinner' };
    case 'verifying': return { color: '#f59e0b', pulse: true, label: 'Verifying', icon: 'spinner' };
    case 'needs_review': return { color: '#f59e0b', pulse: false, label: 'Needs review', icon: 'warning' };
    case 'complete': return { color: 'var(--success, #3fb950)', pulse: false, label: 'Complete', icon: 'check' };
    case 'failed': return { color: 'var(--error, #f85149)', pulse: false, label: 'Failed', icon: 'error' };
    case 'cancelled': return { color: 'var(--text-muted)', pulse: false, label: 'Cancelled', icon: 'idle' };
    default: return { color: 'var(--text-muted)', pulse: false, label: '', icon: 'idle' };
  }
}

function StatusIcon({ display }: { display: StatusDisplay }): React.ReactElement {
  switch (display.icon) {
    case 'spinner': return <svg className="h-3 w-3 animate-spin shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" /></svg>;
    case 'check': return <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}><path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case 'warning': return <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}><path d="M8 2L14 13H2L8 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M8 6v3M8 11h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
    case 'error': return <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" style={{ color: display.color }}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>;
    default: return <span className="flex-shrink-0 h-2 w-2 rounded-full" style={{ backgroundColor: display.color }} />;
  }
}

function classifyThread(thread: AgentChatThreadRecord): 'active' | 'recent' | 'older' {
  if (thread.status === 'running' || thread.status === 'submitting' || thread.status === 'verifying' || thread.status === 'needs_review') return 'active';
  return (Date.now() - thread.updatedAt) / (1000 * 60 * 60) < 24 ? 'recent' : 'older';
}

const SECTION_LABELS: Record<'active' | 'recent' | 'older', string> = { active: 'Active', recent: 'Today', older: 'Earlier' };

function SearchIcon(): React.ReactElement {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>;
}

function BranchIcon(): React.ReactElement {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>;
}

function ThreadItem({ thread, isActive, onSelect, onDelete }: { thread: AgentChatThreadRecord; isActive: boolean; onSelect: () => void; onDelete: () => void; }): React.ReactElement {
  const display = getStatusDisplay(thread.status);
  const msgCount = thread.messages?.length ?? 0;
  return (
    <div className={`group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors duration-75 ${!isActive ? 'hover:bg-surface-raised' : ''}`} style={{ backgroundColor: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined, minHeight: 40 }} onClick={onSelect}>
      <StatusIcon display={display} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">{thread.branchInfo && <span className="flex-shrink-0" style={{ color: 'var(--accent)', opacity: 0.7 }}><BranchIcon /></span>}<span className={`truncate text-xs font-medium ${isActive ? 'text-interactive-accent' : 'text-text-semantic-primary'}`}>{thread.title || 'New Chat'}</span></div>
        <div className="mt-0.5 flex items-center gap-2">{display.label && <span className="text-[10px] font-medium" style={{ color: display.color }}>{display.label}</span>}<span className="text-[10px] text-text-semantic-muted">{relativeTime(thread.updatedAt)}</span><span className="text-[10px] text-text-semantic-muted">{msgCount} {msgCount === 1 ? 'msg' : 'msgs'}</span></div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] text-text-semantic-muted opacity-0 transition-opacity duration-75 group-hover:opacity-70 hover:!opacity-100" title="Delete conversation"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l6 6M8 2l-6 6" /></svg></button>
    </div>
  );
}

function ThreadSectionView({ section, items, filteredCount, activeThreadId, onSelect, onDelete }: { section: 'active' | 'recent' | 'older'; items: AgentChatThreadRecord[]; filteredCount: number; activeThreadId: string | null; onSelect: (threadId: string) => void; onDelete: (threadId: string) => void; }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <div>
      {filteredCount > items.length && <div className={`px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide ${section === 'active' ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}>{SECTION_LABELS[section]}{section === 'active' && <span className="ml-1 font-normal normal-case">({items.length})</span>}</div>}
      {items.map((thread) => <ThreadItem key={thread.id} thread={thread} isActive={thread.id === activeThreadId} onSelect={() => onSelect(thread.id)} onDelete={() => onDelete(thread.id)} />)}
    </div>
  );
}

export function ChatHistoryPanel({ threads, activeThreadId, onSelect, onDelete, onClose }: ChatHistoryPanelProps): React.ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-history-toggle]')) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('mousedown', handleClickOutside);
    return () => { document.removeEventListener('keydown', handleEscape); document.removeEventListener('mousedown', handleClickOutside); };
  }, [onClose]);
  const filteredThreads = useMemo(() => (searchQuery.trim() ? threads.filter((thread) => thread.title.toLowerCase().includes(searchQuery.toLowerCase())) : threads), [threads, searchQuery]);
  const sections = useMemo(() => {
    const groups: Record<'active' | 'recent' | 'older', AgentChatThreadRecord[]> = { active: [], recent: [], older: [] };
    for (const thread of filteredThreads) groups[classifyThread(thread)].push(thread);
    (Object.keys(groups) as Array<'active' | 'recent' | 'older'>).forEach((key) => groups[key].sort((a, b) => b.updatedAt - a.updatedAt));
    return groups;
  }, [filteredThreads]);
  const handleSelect = useCallback((threadId: string) => { onSelect(threadId); onClose(); }, [onClose, onSelect]);
  return (
    <div ref={panelRef} className="absolute left-0 right-0 z-50 flex flex-col overflow-hidden border-b border-border-semantic" style={{ top: 0, maxHeight: '60%', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', backgroundColor: '#0d0d12', borderRadius: '0 0 10px 10px' }}>
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border-semantic px-3 py-2">
        <span className="text-text-semantic-muted"><SearchIcon /></span>
        <input ref={searchRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search conversations..." className="flex-1 bg-transparent text-xs text-text-semantic-primary outline-none" />
        {searchQuery && <button onClick={() => setSearchQuery('')} className="rounded px-1 text-[10px] text-text-semantic-muted">Clear</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
        {filteredThreads.length === 0 && <div className="px-3 py-4 text-center text-xs text-text-semantic-muted">{searchQuery ? 'No matching conversations' : 'No conversations yet'}</div>}
        {(['active', 'recent', 'older'] as const).map((section) => <ThreadSectionView key={section} section={section} items={sections[section]} filteredCount={filteredThreads.length} activeThreadId={activeThreadId} onSelect={handleSelect} onDelete={onDelete} />)}
      </div>
      {threads.length > 0 && <div className="flex flex-shrink-0 items-center justify-between border-t border-border-semantic px-3 py-1.5"><span className="text-[10px] text-text-semantic-muted">{threads.length} conversation{threads.length !== 1 ? 's' : ''}</span></div>}
    </div>
  );
}
