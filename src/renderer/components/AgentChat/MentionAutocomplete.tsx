import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FileEntry } from '../FileTree/FileListItem';
import {
  type AutocompleteResult,
  buildFileMentionIndex,
  buildMentionResults,
  getMentionTypeColor,
} from './MentionAutocompleteSupport';

export type MentionType = 'file' | 'folder' | 'diff' | 'terminal' | 'symbol' | 'codebase';

export interface MentionItem {
  type: MentionType;
  key: string;
  label: string;
  path: string;
  estimatedTokens: number;
  startLine?: number;
  endLine?: number;
  symbolType?: string;
}

export interface SymbolGraphNode {
  name: string;
  type: string;
  filePath: string;
  line: number;
  endLine?: number;
}

export interface MentionAutocompleteProps {
  query: string;
  allFiles: FileEntry[];
  selectedMentions: MentionItem[];
  onSelect: (mention: MentionItem) => void;
  onClose: () => void;
  isOpen: boolean;
  symbolResults?: SymbolGraphNode[];
}

function FileIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function FolderIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function DiffIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v18M3 12h18" />
    </svg>
  );
}

function TerminalIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SymbolIcon(): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" />
    </svg>
  );
}

function getMentionIcon(type: MentionType): React.ReactElement {
  if (type === 'file') return <FileIcon />;
  if (type === 'folder') return <FolderIcon />;
  if (type === 'diff') return <DiffIcon />;
  if (type === 'symbol') return <SymbolIcon />;
  return <TerminalIcon />;
}

function MentionResult({
  result,
  selected,
  onMouseDown,
  onMouseEnter,
}: {
  result: AutocompleteResult;
  selected: boolean;
  onMouseDown: () => void;
  onMouseEnter: () => void;
}): React.ReactElement {
  return (
    <button
      data-active={selected}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors duration-75 text-text-semantic-primary${selected ? ' bg-interactive-selection' : ''}`}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown();
      }}
      onMouseEnter={onMouseEnter}
    >
      <span className="shrink-0" style={{ color: getMentionTypeColor(result.mention.type) }}>
        {getMentionIcon(result.mention.type)}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ fontFamily: 'var(--font-mono)' }}>
        {result.mention.type === 'file' || result.mention.type === 'folder'
          ? result.mention.path
          : result.mention.label}
      </span>
      {result.mention.startLine != null && (
        <span className="shrink-0 text-[10px] text-text-semantic-faint">
          :{result.mention.startLine}
        </span>
      )}
      {result.description && (
        <span className="shrink-0 text-[10px] text-text-semantic-muted">{result.description}</span>
      )}
    </button>
  );
}

interface MentionKeyboardArgs {
  isOpen: boolean;
  results: AutocompleteResult[];
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelect: (mention: MentionItem) => void;
  onClose: () => void;
}

function useMentionAutocompleteKeyboard(args: MentionKeyboardArgs): (event: KeyboardEvent) => void {
  const { isOpen, results, selectedIndex, setSelectedIndex, onSelect, onClose } = args;
  return useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen || results.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % results.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((index) => (index - 1 + results.length) % results.length);
      } else if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault();
        onSelect(results[selectedIndex].mention);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    },
    [isOpen, results, selectedIndex, setSelectedIndex, onSelect, onClose],
  );
}

/**
 * Debounce ms for the mention query before re-running search. Without this,
 * each keystroke triggers Fuse.search across the full file index (~300-450ms
 * on a 5K-file index for long queries) — backspacing through a long mention
 * path queues many synchronous searches and freezes the renderer.
 */
const QUERY_DEBOUNCE_MS = 120;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

function buildMentionResultsTimed(args: Parameters<typeof buildMentionResults>[0]) {
  const t0 = performance.now();
  const out = buildMentionResults(args);
  const t1 = performance.now();
  if (t1 - t0 > 2) {
    console.warn('[trace:build-mention-results]', {
      ms: +(t1 - t0).toFixed(1),
      query: args.query,
      indexSize: args.fileIndex.files.length,
      results: out.length,
    });
  }
  return out;
}

function useMentionAutocompleteState(
  props: MentionAutocompleteProps,
  listRef: React.RefObject<HTMLDivElement | null>,
) {
  const { query, allFiles, selectedMentions, isOpen, onSelect, onClose, symbolResults } = props;
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debouncedQuery = useDebouncedValue(query, QUERY_DEBOUNCE_MS);
  const fileIndex = useMemo(() => buildFileMentionIndex(allFiles), [allFiles]);
  const results = useMemo(
    () =>
      buildMentionResultsTimed({
        query: debouncedQuery,
        fileIndex,
        selectedMentions,
        isOpen,
        symbolResults,
      }),
    [debouncedQuery, fileIndex, selectedMentions, isOpen, symbolResults],
  );
  const handleKeyDown = useMentionAutocompleteKeyboard({
    isOpen,
    results,
    selectedIndex,
    setSelectedIndex,
    onSelect,
    onClose,
  });
  useEffect(() => setSelectedIndex(0), [results.length, query]);
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, listRef]);
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);
  return { selectedIndex, setSelectedIndex, results };
}

export function MentionAutocomplete(props: MentionAutocompleteProps): React.ReactElement | null {
  const { isOpen, onSelect } = props;
  const listRef = useRef<HTMLDivElement>(null);
  const { selectedIndex, setSelectedIndex, results } = useMentionAutocompleteState(props, listRef);
  if (!isOpen || results.length === 0) return null;
  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-[280px] overflow-y-auto rounded-lg border border-border-semantic bg-surface-overlay shadow-xl"
      style={{
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      }}
    >
      <div className="px-2 py-1.5 text-[10px] font-medium text-text-semantic-muted">Mentions</div>
      {results.map((result, index) => (
        <MentionResult
          key={result.mention.key}
          result={result}
          selected={index === selectedIndex}
          onMouseDown={() => onSelect(result.mention)}
          onMouseEnter={() => setSelectedIndex(index)}
        />
      ))}
    </div>
  );
}
