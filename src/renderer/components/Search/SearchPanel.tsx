/**
 * SearchPanel — VS Code-style project-wide search sidebar panel.
 *
 * Composes sub-components from SearchPanel.parts.tsx and SearchPanel.results.tsx.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';

import type { SearchResultItem } from '../../types/electron-runtime-apis';
import {
  FilterInputs,
  SearchInput,
  SearchStatus,
  SearchToggleBar,
  TruncatedWarning,
} from './SearchPanel.parts';
import type { FlatSearchItem } from './SearchPanel.results';
import { flattenSearchResults, VirtualResultsArea } from './SearchPanel.results';
import { useSearchPanel } from './useSearchPanel';

// ── Helpers ───────────────────────────────────────────────────────────────────

function openFileAtLine(item: SearchResultItem): void {
  window.dispatchEvent(
    new CustomEvent('agent-ide:open-file', {
      detail: { filePath: item.filePath, line: item.line + 1, col: item.column },
    }),
  );
}

function toDisplayPath(filePath: string, projectRoot: string): string {
  const normalRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const normalPath = filePath.replace(/\\/g, '/');
  if (normalPath.startsWith(normalRoot + '/')) {
    return normalPath.slice(normalRoot.length + 1);
  }
  return normalPath;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const EMPTY_HINT_STYLE: React.CSSProperties = {
  fontSize: '0.6875rem', fontFamily: 'var(--font-ui)', padding: '20px 12px',
  textAlign: 'center', lineHeight: '1.6', flexShrink: 0,
};

function PanelContent({ query, hasResults, showEmpty, flatItems, truncated, onToggleFile }: {
  query: string; hasResults: boolean; showEmpty: boolean;
  flatItems: FlatSearchItem[]; truncated: boolean; onToggleFile: (fp: string) => void;
}): React.ReactElement {
  if (hasResults) {
    return (
      <>
        <VirtualResultsArea flatItems={flatItems} onToggle={onToggleFile} onClick={openFileAtLine} />
        {truncated && <TruncatedWarning />}
      </>
    );
  }
  return (
    <div className="flex-1 overflow-x-hidden min-h-0">
      {showEmpty && (
        <div className="flex items-center justify-center text-text-semantic-muted" style={EMPTY_HINT_STYLE}>
          {`No results found for '${query}'`}
        </div>
      )}
      {!query && (
        <div className="flex items-center justify-center text-text-semantic-faint" style={EMPTY_HINT_STYLE}>
          Enter a search term to find in files
        </div>
      )}
    </div>
  );
}

// ── Panel state hook ──────────────────────────────────────────────────────────

function useSearchPanelLocalState(
  setIncludeGlob: (v: string) => void,
  setExcludeGlob: (v: string) => void,
) {
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [includeGlob, setIncludeGlobLocal] = useState('');
  const [excludeGlob, setExcludeGlobLocal] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleIncludeChange = useCallback((v: string) => {
    setIncludeGlobLocal(v); setIncludeGlob(v);
  }, [setIncludeGlob]);

  const handleExcludeChange = useCallback((v: string) => {
    setExcludeGlobLocal(v); setExcludeGlob(v);
  }, [setExcludeGlob]);

  const handleToggleFile = useCallback((fp: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fp)) { next.delete(fp); } else { next.add(fp); }
      return next;
    });
  }, []);

  return {
    filterExpanded, setFilterExpanded, collapsedFiles, includeGlob, excludeGlob,
    handleIncludeChange, handleExcludeChange, handleToggleFile, inputRef,
  };
}

// ── Main SearchPanel ──────────────────────────────────────────────────────────

interface SearchPanelProps {
  projectRoot: string;
}

export function SearchPanel({ projectRoot }: SearchPanelProps): React.ReactElement {
  const { state, setQuery, setOption, setIncludeGlob, setExcludeGlob } = useSearchPanel(projectRoot);
  const local = useSearchPanelLocalState(setIncludeGlob, setExcludeGlob);
  const hasResults = state.groupedResults.size > 0;
  const showEmpty = !state.isSearching && !state.error && state.query.length >= 2 && !hasResults;
  const flatItems = useMemo(
    () => flattenSearchResults(state.groupedResults, local.collapsedFiles, (fp) => toDisplayPath(fp, projectRoot)),
    [state.groupedResults, local.collapsedFiles, projectRoot],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1" style={{ padding: '6px 8px', flexShrink: 0 }}>
        <SearchInput value={state.query} onChange={setQuery} inputRef={local.inputRef} />
        <SearchToggleBar
          isRegex={state.options.isRegex ?? false}
          caseSensitive={state.options.caseSensitive ?? false}
          wholeWord={state.options.wholeWord ?? false}
          onToggleRegex={() => setOption('isRegex', !state.options.isRegex)}
          onToggleCase={() => setOption('caseSensitive', !state.options.caseSensitive)}
          onToggleWord={() => setOption('wholeWord', !state.options.wholeWord)}
        />
      </div>
      <div style={{ padding: '0 8px 6px', flexShrink: 0 }}>
        <FilterInputs
          includeGlob={local.includeGlob} excludeGlob={local.excludeGlob}
          onIncludeChange={local.handleIncludeChange} onExcludeChange={local.handleExcludeChange}
          expanded={local.filterExpanded} onToggle={() => local.setFilterExpanded((v) => !v)}
        />
      </div>
      <SearchStatus query={state.query} resultCount={state.results.length}
        fileCount={state.groupedResults.size} isSearching={state.isSearching} error={state.error} />
      <PanelContent query={state.query} hasResults={hasResults} showEmpty={showEmpty}
        flatItems={flatItems} truncated={state.truncated} onToggleFile={local.handleToggleFile} />
    </div>
  );
}
