import React from 'react';

import type { SearchResultItem } from '../../types/electron-runtime-apis';
import { FilterInputs, SearchInput, SearchStatus, SearchToggleBar, TruncatedWarning } from './SearchPanel.parts';
import type { FlatSearchItem } from './SearchPanel.results';
import { VirtualResultsArea } from './SearchPanel.results';

const EMPTY_HINT_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontFamily: 'var(--font-ui)',
  padding: '20px 12px',
  textAlign: 'center',
  lineHeight: '1.6',
  flexShrink: 0,
};

function openFileAtLine(item: SearchResultItem): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-file', {
      detail: { filePath: item.filePath, line: item.line + 1, col: item.column },
    }),
  );
}

function EmptySearchHint({
  text,
  className,
}: {
  text: string;
  className: string;
}): React.ReactElement {
  return (
    <div className={className} style={EMPTY_HINT_STYLE}>
      {text}
    </div>
  );
}

function ResultsState({
  flatItems,
  onToggleFile,
  truncated,
}: {
  flatItems: FlatSearchItem[];
  onToggleFile: (fp: string) => void;
  truncated: boolean;
}): React.ReactElement {
  return (
    <>
      <VirtualResultsArea flatItems={flatItems} onToggle={onToggleFile} onClick={openFileAtLine} />
      {truncated && <TruncatedWarning />}
    </>
  );
}

interface SearchPanelBodyProps {
  query: string;
  options: { isRegex?: boolean; caseSensitive?: boolean; wholeWord?: boolean };
  resultCount: number;
  groupedResultsSize: number;
  isSearching: boolean;
  error: string | null;
  truncated: boolean;
  flatItems: FlatSearchItem[];
  includeGlob: string;
  excludeGlob: string;
  filterExpanded: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onToggleRegex: () => void;
  onToggleCase: () => void;
  onToggleWord: () => void;
  onIncludeChange: (value: string) => void;
  onExcludeChange: (value: string) => void;
  onToggleFilter: () => void;
  onToggleFile: (fp: string) => void;
}

interface SearchControlsProps {
  query: string;
  options: { isRegex?: boolean; caseSensitive?: boolean; wholeWord?: boolean };
  inputRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void;
  onToggleRegex: () => void;
  onToggleCase: () => void;
  onToggleWord: () => void;
  includeGlob: string;
  excludeGlob: string;
  filterExpanded: boolean;
  onIncludeChange: (value: string) => void;
  onExcludeChange: (value: string) => void;
  onToggleFilter: () => void;
}

function SearchQueryBar({
  query,
  options,
  inputRef,
  onQueryChange,
  onToggleRegex,
  onToggleCase,
  onToggleWord,
}: Pick<
  SearchControlsProps,
  'query' | 'options' | 'inputRef' | 'onQueryChange' | 'onToggleRegex' | 'onToggleCase' | 'onToggleWord'
>): React.ReactElement {
  return (
    <div className="flex items-center gap-1" style={{ padding: '6px 8px', flexShrink: 0 }}>
      <SearchInput value={query} onChange={onQueryChange} inputRef={inputRef} />
      <SearchToggleBar
        isRegex={options.isRegex ?? false}
        caseSensitive={options.caseSensitive ?? false}
        wholeWord={options.wholeWord ?? false}
        onToggleRegex={onToggleRegex}
        onToggleCase={onToggleCase}
        onToggleWord={onToggleWord}
      />
    </div>
  );
}

function SearchFilterBar({
  includeGlob,
  excludeGlob,
  filterExpanded,
  onIncludeChange,
  onExcludeChange,
  onToggleFilter,
}: Pick<
  SearchControlsProps,
  | 'includeGlob'
  | 'excludeGlob'
  | 'filterExpanded'
  | 'onIncludeChange'
  | 'onExcludeChange'
  | 'onToggleFilter'
>): React.ReactElement {
  return (
    <div style={{ padding: '0 8px 6px', flexShrink: 0 }}>
      <FilterInputs
        includeGlob={includeGlob}
        excludeGlob={excludeGlob}
        onIncludeChange={onIncludeChange}
        onExcludeChange={onExcludeChange}
        expanded={filterExpanded}
        onToggle={onToggleFilter}
      />
    </div>
  );
}

function SearchControls({
  query,
  options,
  inputRef,
  onQueryChange,
  onToggleRegex,
  onToggleCase,
  onToggleWord,
  includeGlob,
  excludeGlob,
  filterExpanded,
  onIncludeChange,
  onExcludeChange,
  onToggleFilter,
}: SearchControlsProps): React.ReactElement {
  return (
    <>
      <SearchQueryBar
        query={query}
        options={options}
        inputRef={inputRef}
        onQueryChange={onQueryChange}
        onToggleRegex={onToggleRegex}
        onToggleCase={onToggleCase}
        onToggleWord={onToggleWord}
      />
      <SearchFilterBar
        includeGlob={includeGlob}
        excludeGlob={excludeGlob}
        filterExpanded={filterExpanded}
        onIncludeChange={onIncludeChange}
        onExcludeChange={onExcludeChange}
        onToggleFilter={onToggleFilter}
      />
    </>
  );
}

function EmptyState({
  query,
  showEmpty,
}: {
  query: string;
  showEmpty: boolean;
}): React.ReactElement {
  return (
    <div className="flex-1 overflow-x-hidden min-h-0">
      {showEmpty && (
        <EmptySearchHint
          className="flex items-center justify-center text-text-semantic-muted"
          text={`No results found for '${query}'`}
        />
      )}
      {!query && (
        <EmptySearchHint
          className="flex items-center justify-center text-text-semantic-faint"
          text="Enter a search term to find in files"
        />
      )}
    </div>
  );
}

export function PanelContent({
  query,
  hasResults,
  showEmpty,
  flatItems,
  truncated,
  onToggleFile,
}: {
  query: string;
  hasResults: boolean;
  showEmpty: boolean;
  flatItems: FlatSearchItem[];
  truncated: boolean;
  onToggleFile: (fp: string) => void;
}): React.ReactElement {
  return hasResults ? (
    <ResultsState flatItems={flatItems} onToggleFile={onToggleFile} truncated={truncated} />
  ) : (
    <EmptyState query={query} showEmpty={showEmpty} />
  );
}

export function SearchPanelBody({
  query,
  options,
  resultCount,
  groupedResultsSize,
  isSearching,
  error,
  truncated,
  flatItems,
  includeGlob,
  excludeGlob,
  filterExpanded,
  inputRef,
  onQueryChange,
  onToggleRegex,
  onToggleCase,
  onToggleWord,
  onIncludeChange,
  onExcludeChange,
  onToggleFilter,
  onToggleFile,
}: SearchPanelBodyProps): React.ReactElement {
  const hasResults = groupedResultsSize > 0;
  const showEmpty = !isSearching && !error && query.length >= 2 && !hasResults;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SearchControls {...{ query, options, inputRef, onQueryChange, onToggleRegex, onToggleCase, onToggleWord, includeGlob, excludeGlob, filterExpanded, onIncludeChange, onExcludeChange, onToggleFilter }} />
      <SearchStatus query={query} resultCount={resultCount} fileCount={groupedResultsSize} isSearching={isSearching} error={error} />
      <PanelContent query={query} hasResults={hasResults} showEmpty={showEmpty} flatItems={flatItems} truncated={truncated} onToggleFile={onToggleFile} />
    </div>
  );
}
