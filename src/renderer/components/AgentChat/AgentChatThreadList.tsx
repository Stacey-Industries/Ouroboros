import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { AgentChatThreadRecord } from '../../types/electron';
import {
  formatThreadPreview,
  formatTimestamp,
  getStatusLabel,
  getStatusTone,
} from './agentChatFormatters';
import { buildThreadTree, flattenThreadTree } from './buildThreadTree';

export interface AgentChatThreadListProps {
  activeThreadId: string | null;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  onThreadImported?: (threadId: string) => void;
  threads: AgentChatThreadRecord[];
}

// ─── Thread header ────────────────────────────────────────────────────────────

function ThreadListHeader({ onNewChat }: { onNewChat: () => void }): React.ReactElement {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-text-semantic-muted">
          Chats
        </div>
        <div className="mt-1 text-xs text-text-semantic-muted">
          Recent agent threads for this project
        </div>
      </div>
      <button
        onClick={onNewChat}
        className="rounded border border-border-semantic px-2 py-1 text-xs text-text-semantic-muted transition-colors duration-100 hover:border-interactive-accent hover:text-text-semantic-primary"
      >
        New
      </button>
    </div>
  );
}

function EmptyThreadList(): React.ReactElement {
  return (
    <div className="rounded border border-dashed border-border-semantic px-3 py-4 text-xs text-text-semantic-muted">
      No previous chats yet.
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function ThreadStatusBadge({
  status,
}: {
  status: AgentChatThreadRecord['status'];
}): React.ReactElement {
  return (
    <span
      className="rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={getStatusTone(status)}
    >
      {getStatusLabel(status)}
    </span>
  );
}

// ─── Export actions ───────────────────────────────────────────────────────────

type ExportFormat = 'markdown' | 'json' | 'html';
type ExportState = 'idle' | 'busy' | 'done' | 'error';

const FORMAT_EXT: Record<ExportFormat, string> = {
  markdown: 'md',
  json: 'json',
  html: 'html',
};

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function useExportHandler(
  threadId: string,
  title: string,
  format: ExportFormat,
  setState: (s: ExportState) => void,
) {
  return useCallback(async () => {
    if (!window.electronAPI) return;
    setState('busy');
    const result = await window.electronAPI.agentChat.exportThread(threadId, format);
    if (!result.success || !result.content) { setState('error'); return; }
    const mime =
      format === 'html' ? 'text/html' :
      format === 'json' ? 'application/json' : 'text/markdown';
    const slug = title.replace(/[^a-z0-9]/gi, '-').slice(0, 40) || threadId.slice(0, 8);
    downloadBlob(result.content, `${slug}.${FORMAT_EXT[format]}`, mime);
    setState('done');
    setTimeout(() => setState('idle'), 2000);
  }, [threadId, title, format, setState]);
}

function ThreadExportRow({ thread }: { thread: AgentChatThreadRecord }): React.ReactElement {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [state, setState] = useState<ExportState>('idle');
  const handleExport = useExportHandler(thread.id, thread.title, format, setState);
  const label = state === 'busy' ? 'Exporting…' : state === 'done' ? 'Saved ✓' : 'Export';

  return (
    <div className="mt-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as ExportFormat)}
        className="rounded border border-border-subtle bg-surface-inset px-1 py-0.5 text-[10px] text-text-semantic-muted"
        aria-label="Export format"
      >
        <option value="markdown">MD</option>
        <option value="json">JSON</option>
        <option value="html">HTML</option>
      </select>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={handleExport}
        className="rounded px-1.5 py-0.5 text-[10px] text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary transition-colors"
      >
        {label}
      </button>
    </div>
  );
}

// ─── Import action ────────────────────────────────────────────────────────────

interface ImportRowProps { onImported?: (threadId: string) => void }

function ThreadImportRow({ onImported }: ImportRowProps): React.ReactElement {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !window.electronAPI) return;
    setState('busy');
    const text = await file.text();
    const fmt = file.name.endsWith('.json') ? 'json' : 'transcript';
    const result = await window.electronAPI.agentChat.importThread(text, fmt);
    if (!result.success || !result.threadId) { setState('error'); return; }
    setState('done');
    onImported?.(result.threadId);
    setTimeout(() => setState('idle'), 2000);
    if (inputRef.current) inputRef.current.value = '';
  }, [onImported]);

  const label = state === 'busy' ? 'Importing…' : state === 'done' ? 'Imported ✓' : 'Import';

  return (
    <div className="mt-1">
      <label className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-text-semantic-muted hover:bg-surface-hover hover:text-text-semantic-primary transition-colors">
        {label}
        <input
          ref={inputRef}
          type="file"
          accept=".json,.md,.txt"
          className="sr-only"
          onChange={handleFile}
          disabled={state === 'busy'}
        />
      </label>
    </div>
  );
}

// ─── Thread list item ─────────────────────────────────────────────────────────

function ThreadItemBody({
  thread,
  isBranch,
}: {
  thread: AgentChatThreadRecord;
  isBranch: boolean;
}): React.ReactElement {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-text-semantic-primary">
            {isBranch && <span className="mr-1 text-text-semantic-faint">{'\u21B3'}</span>}
            {thread.title}
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-text-semantic-muted">
            {formatThreadPreview(thread)}
          </div>
        </div>
        <ThreadStatusBadge status={thread.status} />
      </div>
      <div className="mt-2 text-[11px] text-text-semantic-faint">
        {formatTimestamp(thread.updatedAt)}
      </div>
    </>
  );
}

function ThreadListItem(props: {
  activeThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onThreadImported?: (threadId: string) => void;
  thread: AgentChatThreadRecord;
  depth: number;
}): React.ReactElement {
  const isActive = props.activeThreadId === props.thread.id;
  return (
    <div
      className="rounded border transition-colors duration-100"
      style={{
        borderColor: isActive ? 'var(--interactive-accent)' : 'var(--border-default)',
        backgroundColor: isActive ? 'var(--surface-panel)' : 'transparent',
        marginLeft: `${props.depth * 16}px`,
        width: `calc(100% - ${props.depth * 16}px)`,
      }}
    >
      <button onClick={() => props.onSelectThread(props.thread.id)} className="w-full px-3 py-2 text-left">
        <ThreadItemBody thread={props.thread} isBranch={props.depth > 0} />
      </button>
      {isActive && (
        <div className="flex items-center gap-3 border-t border-border-subtle px-3 pb-2 pt-1">
          <ThreadExportRow thread={props.thread} />
          <ThreadImportRow onImported={props.onThreadImported} />
        </div>
      )}
    </div>
  );
}

// ─── AgentChatThreadList ──────────────────────────────────────────────────────

export function AgentChatThreadList({
  activeThreadId,
  onNewChat,
  onSelectThread,
  onThreadImported,
  threads,
}: AgentChatThreadListProps): React.ReactElement {
  const flatNodes = useMemo(() => flattenThreadTree(buildThreadTree(threads)), [threads]);

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border-semantic bg-surface-base px-3 py-3">
      <ThreadListHeader onNewChat={onNewChat} />
      <div className="flex-1 space-y-2 overflow-y-auto">
        {threads.length === 0 ? <EmptyThreadList /> : null}
        {flatNodes.map((node) => (
          <ThreadListItem
            key={node.thread.id}
            activeThreadId={activeThreadId}
            onSelectThread={onSelectThread}
            onThreadImported={onThreadImported}
            thread={node.thread}
            depth={node.depth}
          />
        ))}
      </div>
    </div>
  );
}
