import React, { useCallback } from 'react';

import type { AgentChatSearchResult } from '../../types/electron-agent-chat.d';

interface ResultCardProps {
  result: AgentChatSearchResult;
  isSelected: boolean;
  onSelect: () => void;
}

export function dispatchOpenThread(threadId: string, messageId?: string): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-thread', { detail: { threadId, messageId } }),
  );
}

function resultCardClassName(isSelected: boolean): string {
  return [
    'cursor-pointer rounded px-3 py-2 text-sm transition-colors',
    isSelected
      ? 'bg-interactive-selection text-text-semantic-primary'
      : 'hover:bg-surface-hover text-text-semantic-secondary',
  ].join(' ');
}

function renderSnippet(snippet?: string): React.ReactNode {
  if (!snippet) return null;
  return (
    <p className="mt-0.5 truncate text-xs text-text-semantic-muted">
      {snippet.replace(/<\/?b>/g, '')}
    </p>
  );
}

function ThreadSearchInput({
  query,
  inputRef,
  onChange,
  onKeyDown,
}: {
  query: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
}): React.ReactElement {
  return (
    <input
      ref={inputRef}
      type="search"
      placeholder="Search threads..."
      value={query}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={[
        'w-full rounded border border-border-semantic bg-surface-inset px-3 py-1.5',
        'text-sm text-text-semantic-primary placeholder:text-text-semantic-faint',
        'outline-none focus:border-border-accent',
      ].join(' ')}
    />
  );
}

function ResultCard({ result, isSelected, onSelect }: ResultCardProps): React.ReactElement {
  const handleClick = useCallback(() => {
    onSelect();
    dispatchOpenThread(result.threadId, result.messageId);
  }, [onSelect, result.threadId, result.messageId]);

  const handleKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick],
  );

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKey}
      className={resultCardClassName(isSelected)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-text-semantic-primary">{result.threadId}</span>
      </div>
      {renderSnippet(result.snippet)}
    </div>
  );
}

function SearchStatusLine({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="px-1 text-xs text-text-semantic-muted">{children}</p>;
}

function ThreadSearchResultsList({
  results,
  selectedIdx,
  onSelect,
}: {
  results: AgentChatSearchResult[];
  selectedIdx: number;
  onSelect: (index: number) => void;
}): React.ReactElement | null {
  if (results.length === 0) {
    return null;
  }
  return (
    <div role="listbox" className="flex flex-col gap-0.5">
      {results.map((result, index) => (
        <ResultCard
          key={`${result.threadId}-${index}`}
          result={result}
          isSelected={index === selectedIdx}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
}

export function ThreadSearchResults({
  query,
  loading,
  hasMore,
  results,
  selectedIdx,
  onSelect,
}: {
  query: string;
  loading: boolean;
  hasMore: boolean;
  results: AgentChatSearchResult[];
  selectedIdx: number;
  onSelect: (index: number) => void;
}): React.ReactElement {
  if (loading) {
    return <SearchStatusLine>Searching...</SearchStatusLine>;
  }

  if (query.trim() && results.length === 0) {
    return <SearchStatusLine>No results</SearchStatusLine>;
  }

  return (
    <>
      <ThreadSearchResultsList results={results} selectedIdx={selectedIdx} onSelect={onSelect} />
      {hasMore && (
        <SearchStatusLine>
          Showing {results.length} results — narrow your search to see all
        </SearchStatusLine>
      )}
    </>
  );
}

export function ThreadSearchBody({
  query,
  loading,
  hasMore,
  results,
  selectedIdx,
  inputRef,
  onChange,
  onKeyDown,
  onSelect,
}: {
  query: string;
  loading: boolean;
  hasMore: boolean;
  results: AgentChatSearchResult[];
  selectedIdx: number;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  onSelect: (index: number) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 p-2">
      <ThreadSearchInput query={query} inputRef={inputRef} onChange={onChange} onKeyDown={onKeyDown} />
      {loading && <p className="px-1 text-xs text-text-semantic-muted">Searching...</p>}
      <ThreadSearchResults
        query={query}
        loading={loading}
        hasMore={hasMore}
        results={results}
        selectedIdx={selectedIdx}
        onSelect={onSelect}
      />
    </div>
  );
}
