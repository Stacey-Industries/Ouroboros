import React from 'react';

import { SearchBarPanel, useSearchBarController } from './SearchBar.parts';

export interface SearchMatch {
  nodeIndex: number;
  offsetInNode: number;
  length: number;
  absoluteOffset: number;
}

export interface SearchBarProps {
  /** The container element holding rendered code (Shiki or plain <pre>) */
  codeContainer: HTMLElement | null;
  /** The scrollable ancestor that wraps the code area */
  scrollContainer: HTMLElement | null;
  /** Whether the search bar is visible */
  visible: boolean;
  /** Called when the user closes the search bar */
  onClose: () => void;
  /**
   * Called whenever the set of matched line numbers changes.
   * Line numbers are 1-based. Pass an empty array when there are no matches
   * or the search bar is closed.
   */
  onMatchLinesChange?: (lines: number[]) => void;
}

export function SearchBar(props: SearchBarProps): React.ReactElement | null {
  const controller = useSearchBarController(props);
  if (!props.visible) return null;
  return <SearchBarPanel {...controller} />;
}
