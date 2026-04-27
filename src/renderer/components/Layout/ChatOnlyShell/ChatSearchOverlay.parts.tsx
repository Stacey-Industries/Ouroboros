/**
 * ChatSearchOverlay.parts.tsx — stateless UI atoms for the chat search overlay.
 */
import React, { useCallback } from 'react';

import type { ChatSearchMatch, ChatSearchScope } from '../../../hooks/useChatSearch';

// ── ScopeToggle ───────────────────────────────────────────────────────────────

function scopeButtonClass(active: boolean): string {
  return [
    'rounded px-2 py-0.5 transition-colors',
    active
      ? 'bg-interactive-accent text-text-on-accent'
      : 'text-text-semantic-muted hover:bg-surface-hover',
  ].join(' ');
}

export function ScopeToggle(props: {
  scope: ChatSearchScope;
  onChange: (s: ChatSearchScope) => void;
}): React.ReactElement {
  return (
    <div className="flex gap-1 text-xs">
      <button
        type="button"
        onClick={() => props.onChange('project')}
        className={scopeButtonClass(props.scope === 'project')}
      >
        Active project
      </button>
      <button
        type="button"
        onClick={() => props.onChange('all')}
        className={scopeButtonClass(props.scope === 'all')}
      >
        All projects
      </button>
    </div>
  );
}

// ── ResultRow ─────────────────────────────────────────────────────────────────

function resultRowClass(isSelected: boolean): string {
  return [
    'cursor-pointer rounded px-3 py-2 text-sm transition-colors',
    isSelected
      ? 'bg-interactive-selection text-text-semantic-primary'
      : 'hover:bg-surface-hover text-text-semantic-secondary',
  ].join(' ');
}

export function ResultRow(props: {
  match: ChatSearchMatch;
  isSelected: boolean;
  onActivate: () => void;
}): React.ReactElement {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        props.onActivate();
      }
    },
    [props],
  );
  return (
    <div
      role="option"
      aria-selected={props.isSelected}
      tabIndex={0}
      onClick={props.onActivate}
      onKeyDown={handleKeyDown}
      data-testid="chat-search-result"
      className={resultRowClass(props.isSelected)}
    >
      <div className="truncate font-medium text-text-semantic-primary">{props.match.title}</div>
      {props.match.snippet && (
        <div className="mt-0.5 truncate text-xs text-text-semantic-muted">
          {props.match.snippet}
        </div>
      )}
      {props.match.model && (
        <div className="mt-0.5 text-[11px] text-text-semantic-faint">{props.match.model}</div>
      )}
    </div>
  );
}

// ── ResultsList ───────────────────────────────────────────────────────────────

export function ResultsList(props: {
  matches: ChatSearchMatch[];
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
  onActivate: (id: string) => void;
}): React.ReactElement {
  return (
    <div role="listbox" className="flex flex-col gap-0.5">
      {props.matches.map((m, i) => (
        <ResultRow
          key={m.threadId}
          match={m}
          isSelected={i === props.selectedIdx}
          onActivate={() => {
            props.onSelectIdx(i);
            props.onActivate(m.threadId);
          }}
        />
      ))}
    </div>
  );
}

// ── SearchInputRow ────────────────────────────────────────────────────────────

export function SearchInputRow(props: {
  query: string;
  scope: ChatSearchScope;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onScopeChange: (s: ChatSearchScope) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <input
        ref={props.inputRef}
        type="search"
        placeholder="Search chats…"
        value={props.query}
        onChange={(e) => props.onQueryChange(e.target.value)}
        onKeyDown={props.onKeyDown}
        data-testid="chat-search-input"
        className="flex-1 rounded border border-border-semantic bg-surface-inset px-3 py-1.5 text-sm text-text-semantic-primary placeholder:text-text-semantic-faint outline-none focus:border-border-accent"
      />
      <ScopeToggle scope={props.scope} onChange={props.onScopeChange} />
    </div>
  );
}

// ── DialogPanel ───────────────────────────────────────────────────────────────

export interface DialogPanelProps {
  query: string;
  scope: ChatSearchScope;
  matches: ChatSearchMatch[];
  selectedIdx: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (q: string) => void;
  onScopeChange: (s: ChatSearchScope) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectIdx: (i: number) => void;
  onActivate: (threadId: string) => void;
}

export function DialogPanel(p: DialogPanelProps): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search chats"
      className="flex w-[560px] flex-col gap-2 rounded-xl border border-border-semantic p-3 shadow-xl"
    >
      <SearchInputRow
        query={p.query}
        scope={p.scope}
        inputRef={p.inputRef}
        onQueryChange={p.onQueryChange}
        onScopeChange={p.onScopeChange}
        onKeyDown={p.onKeyDown}
      />
      {p.query.trim() !== '' && p.matches.length === 0 && (
        <p className="px-1 py-2 text-xs text-text-semantic-muted" data-testid="chat-search-empty">
          No results
        </p>
      )}
      {p.matches.length > 0 && (
        <ResultsList
          matches={p.matches}
          selectedIdx={p.selectedIdx}
          onSelectIdx={p.onSelectIdx}
          onActivate={p.onActivate}
        />
      )}
    </div>
  );
}
