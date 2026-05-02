/**
 * ContextPreviewMemoryRow.tsx — Expandable memory entry row for the
 * ContextPreview popover's Memory tab.
 *
 * Clicking the row fetches full entry content via memory:read IPC and displays
 * it inline. Read results are cached so re-expanding within the same popover
 * session doesn't re-fetch.
 */

import React, { useCallback, useState } from 'react';

import type { ContextItem } from '../../hooks/useContextPreview';

export interface ContentCache {
  [id: string]: string | 'loading' | 'error';
}

function LoadingSpinner(): React.ReactElement {
  return (
    <span
      className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-text-semantic-faint"
      style={{ borderTopColor: 'var(--interactive-accent)', verticalAlign: 'middle' }}
      aria-label="Loading"
    />
  );
}

function ChevronRight({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 9 9"
      fill="none"
      aria-hidden="true"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 120ms',
        flexShrink: 0,
      }}
    >
      <path
        d="M3 2L6 4.5L3 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
    </svg>
  );
}

function TrashIcon(): React.ReactElement {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
    </svg>
  );
}

function MemoryContentPanel({ content }: { content: string }): React.ReactElement {
  return (
    <div
      className="mt-1 rounded border border-border-subtle bg-surface-inset px-2 py-1.5 text-[10px] text-text-semantic-secondary"
      style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {content}
    </div>
  );
}

function MemoryExpandedContent({
  cached,
}: {
  cached: string | 'loading' | 'error' | undefined;
}): React.ReactElement {
  if (cached === 'loading') {
    return (
      <div className="mt-1 flex items-center gap-1.5 pl-4 text-[10px] text-text-semantic-faint">
        <LoadingSpinner />
        <span>Loading…</span>
      </div>
    );
  }
  if (cached === 'error') {
    return <div className="mt-1 pl-4 text-[10px] text-status-error">Failed to load entry.</div>;
  }
  if (cached !== undefined) {
    return <div className="pl-4"><MemoryContentPanel content={cached} /></div>;
  }
  return <></>;
}

function EditButton({ entryId, label, onEditClick }: {
  entryId: string;
  label: string;
  onEditClick: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onEditClick(entryId)}
      className="shrink-0 text-text-semantic-faint hover:text-interactive-accent transition-colors duration-75"
      title="Edit memory entry"
      aria-label={`Edit memory entry: ${label}`}
    >
      <EditIcon />
    </button>
  );
}

function DeleteButton({ entryId, label, onDeleteClick }: {
  entryId: string;
  label: string;
  onDeleteClick: (id: string) => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onDeleteClick(entryId)}
      className="shrink-0 text-text-semantic-faint hover:text-status-error transition-colors duration-75"
      title="Delete memory entry"
      aria-label={`Delete memory entry: ${label}`}
    >
      <TrashIcon />
    </button>
  );
}

function MemoryRowHeader({
  item,
  entryId,
  expanded,
  onToggle,
  onEditClick,
  onDeleteClick,
}: {
  item: ContextItem;
  entryId: string;
  expanded: boolean;
  onToggle: () => void;
  onEditClick?: (id: string) => void;
  onDeleteClick?: (id: string) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-text-semantic-primary hover:text-text-semantic-secondary"
        aria-expanded={expanded}
        title={expanded ? 'Collapse entry' : 'Expand to view content'}
      >
        <ChevronRight expanded={expanded} />
        <span className="flex-1 truncate" title={item.label}>{item.label}</span>
      </button>
      {item.detail && (
        <span className="shrink-0 truncate text-text-semantic-faint" style={{ maxWidth: 100 }}
          title={item.detail}>{item.detail}</span>
      )}
      {onEditClick && <EditButton entryId={entryId} label={item.label} onEditClick={onEditClick} />}
      {onDeleteClick && <DeleteButton entryId={entryId} label={item.label} onDeleteClick={onDeleteClick} />}
      <span className="shrink-0 tabular-nums text-text-semantic-faint">~{item.estimatedTokens}</span>
    </div>
  );
}

function fetchMemoryContent(
  entryId: string,
  projectRoot: string | null | undefined,
  cache: ContentCache,
  refresh: () => void,
): void {
  cache[entryId] = 'loading';
  refresh();
  const api = window.electronAPI?.memory;
  if (!api?.read) {
    cache[entryId] = 'error';
    refresh();
    return;
  }
  void api.read({ projectRoot: projectRoot ?? undefined, id: entryId }).then((res) => {
    cache[entryId] = res.success && res.content ? res.content : 'error';
    refresh();
  });
}

export interface MemoryItemRowProps {
  item: ContextItem;
  projectRoot?: string | null;
  /** Shared mutable cache across all rows in a popover session; keyed by entry id. */
  contentCache: ContentCache;
  onEditClick?: (id: string) => void;
  onDeleteClick?: (id: string) => void;
}

export function MemoryItemRow({
  item,
  projectRoot,
  contentCache,
  onEditClick,
  onDeleteClick,
}: MemoryItemRowProps): React.ReactElement {
  const entryId = item.id.startsWith('memory:') ? item.id.slice('memory:'.length) : item.id;
  const [expanded, setExpanded] = useState(false);
  const [, forceRender] = useState(0);
  const refresh = useCallback(() => forceRender((n) => n + 1), []);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    if (!next) return;
    if (contentCache[entryId] !== undefined) return;
    fetchMemoryContent(entryId, projectRoot, contentCache, refresh);
  }, [expanded, entryId, projectRoot, contentCache, refresh]);

  return (
    <div className="flex flex-col px-3 py-1 text-[11px]" style={{ fontFamily: 'var(--font-ui)' }}>
      <MemoryRowHeader
        item={item}
        entryId={entryId}
        expanded={expanded}
        onToggle={toggle}
        onEditClick={onEditClick}
        onDeleteClick={onDeleteClick}
      />
      {expanded && <MemoryExpandedContent cached={contentCache[entryId]} />}
    </div>
  );
}
