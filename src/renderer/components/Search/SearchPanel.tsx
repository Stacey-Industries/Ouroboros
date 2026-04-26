/**
 * SearchPanel — VS Code-style project-wide search sidebar panel.
 *
 * Composes sub-components from SearchPanel.parts.tsx, SearchPanel.content.tsx,
 * and SearchPanel.results.tsx.
 */

import React, { useMemo } from 'react';

import { SearchPanelBody } from './SearchPanel.content';
import { flattenSearchResults } from './SearchPanel.results';
import { useSearchPanel } from './useSearchPanel';
import { useSearchPanelLocalState } from './useSearchPanelLocalState';

function toDisplayPath(filePath: string, projectRoot: string): string {
  const normalRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '');
  const normalPath = filePath.replace(/\\/g, '/');
  if (normalPath.startsWith(normalRoot + '/')) {
    return normalPath.slice(normalRoot.length + 1);
  }
  return normalPath;
}

interface SearchPanelProps {
  projectRoot: string;
}

export function SearchPanel({ projectRoot }: SearchPanelProps): React.ReactElement {
  const { state, setQuery, setOption, setIncludeGlob, setExcludeGlob } =
    useSearchPanel(projectRoot);
  const local = useSearchPanelLocalState(setIncludeGlob, setExcludeGlob);
  const flatItems = useMemo(
    () =>
      flattenSearchResults(state.groupedResults, local.collapsedFiles, (fp) =>
        toDisplayPath(fp, projectRoot),
      ),
    [state.groupedResults, local.collapsedFiles, projectRoot],
  );

  return (
    <SearchPanelBody
      query={state.query}
      options={state.options}
      resultCount={state.results.length}
      groupedResultsSize={state.groupedResults.size}
      isSearching={state.isSearching}
      error={state.error}
      truncated={state.truncated}
      flatItems={flatItems}
      includeGlob={local.includeGlob}
      excludeGlob={local.excludeGlob}
      filterExpanded={local.filterExpanded}
      inputRef={local.inputRef}
      onQueryChange={setQuery}
      onToggleRegex={() => setOption('isRegex', !state.options.isRegex)}
      onToggleCase={() => setOption('caseSensitive', !state.options.caseSensitive)}
      onToggleWord={() => setOption('wholeWord', !state.options.wholeWord)}
      onIncludeChange={local.handleIncludeChange}
      onExcludeChange={local.handleExcludeChange}
      onToggleFilter={() => local.setFilterExpanded((v) => !v)}
      onToggleFile={local.handleToggleFile}
    />
  );
}
