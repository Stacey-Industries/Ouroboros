import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useProjectFileIndex } from '../../hooks/useProjectFileIndex';
import type { FileEntry } from '../FileTree/FileListItem';
import type { MentionItem } from './MentionAutocomplete';

export interface PinnedFile {
  path: string;
  relativePath: string;
  name: string;
  estimatedTokens: number;
}

export interface AgentChatContextModel {
  /** Files pinned to this thread's context */
  pinnedFiles: PinnedFile[];
  /** Add a file to pinned context */
  addFile: (file: FileEntry) => void;
  /** Remove a file from pinned context by path */
  removeFile: (path: string) => void;
  /** Clear all pinned files */
  clearFiles: () => void;
  /** Formatted summary string like "3 files, ~2.1k tokens" */
  contextSummary: string | null;
  /** Total estimated token count */
  totalTokens: number;
  /** All file paths for the context selection */
  filePaths: string[];
  /** Autocomplete results filtered by query */
  autocompleteResults: FileEntry[];
  /** Update the autocomplete query (debounced) */
  setAutocompleteQuery: (query: string) => void;
  /** Whether autocomplete dropdown is visible */
  isAutocompleteOpen: boolean;
  /** Close autocomplete dropdown */
  closeAutocomplete: () => void;
  /** Open autocomplete dropdown */
  openAutocomplete: () => void;
  /** All indexed files for mention autocomplete */
  allFiles: FileEntry[];
  /** Active mentions (upgraded @-mention system) */
  mentions: MentionItem[];
  /** Add a mention */
  addMention: (mention: MentionItem) => void;
  /** Remove a mention by key */
  removeMention: (key: string) => void;
}

const MAX_AUTOCOMPLETE_RESULTS = 8;
const DEBOUNCE_MS = 150;
const CHARS_PER_TOKEN = 4;

function estimateTokens(file: FileEntry): number {
  // Use file size if available, otherwise estimate ~500 tokens for unknown files
  if (file.size > 0) {
    return Math.ceil(file.size / CHARS_PER_TOKEN);
  }
  return 500;
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    const k = tokens / 1000;
    return `~${k >= 10 ? Math.round(k) : k.toFixed(1)}k tokens`;
  }
  return `~${tokens} tokens`;
}

function buildContextSummary(pinnedFiles: PinnedFile[], totalTokens: number): string | null {
  if (pinnedFiles.length === 0) return null;
  const fileLabel = pinnedFiles.length === 1 ? '1 file' : `${pinnedFiles.length} files`;
  return `${fileLabel}, ${formatTokenCount(totalTokens)}`;
}

function useDebouncedAutocompleteQuery(): {
  debouncedQuery: string;
  setAutocompleteQuery: (query: string) => void;
} {
  const [, setAutocompleteQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
  }, []);

  const setAutocompleteQuery = useCallback((query: string) => {
    setAutocompleteQueryRaw(query);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
  }, []);

  return { debouncedQuery, setAutocompleteQuery };
}

function usePinnedFilesState(activeThreadId: string | null) {
  const [pinnedFiles, setPinnedFiles] = useState<PinnedFile[]>([]);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);

  useEffect(() => { setPinnedFiles([]); }, [activeThreadId]);

  const addFile = useCallback((file: FileEntry) => {
    setPinnedFiles((current) => {
      if (current.some((f) => f.path === file.path)) return current;
      return [...current, { path: file.path, relativePath: file.relativePath, name: file.name, estimatedTokens: estimateTokens(file) }];
    });
    setIsAutocompleteOpen(false);
  }, []);

  const removeFile = useCallback((path: string) => {
    setPinnedFiles((current) => current.filter((f) => f.path !== path));
  }, []);

  const clearFiles = useCallback(() => setPinnedFiles([]), []);
  const closeAutocomplete = useCallback(() => setIsAutocompleteOpen(false), []);
  const openAutocomplete = useCallback(() => setIsAutocompleteOpen(true), []);

  return { pinnedFiles, isAutocompleteOpen, addFile, removeFile, clearFiles, closeAutocomplete, openAutocomplete };
}

function useMentionsState(activeThreadId: string | null) {
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  useEffect(() => { setMentions([]); }, [activeThreadId]);

  const addMention = useCallback((mention: MentionItem) => {
    setMentions((current) => {
      if (current.some((m) => m.key === mention.key)) return current;
      return [...current, mention];
    });
  }, []);

  const removeMention = useCallback((key: string) => {
    setMentions((current) => current.filter((m) => m.key !== key));
  }, []);

  return { mentions, addMention, removeMention };
}

export function useAgentChatContext(
  projectRoot: string | null,
  activeThreadId: string | null,
): AgentChatContextModel {
  const { debouncedQuery, setAutocompleteQuery } = useDebouncedAutocompleteQuery();
  const { pinnedFiles, isAutocompleteOpen, addFile, removeFile, clearFiles, closeAutocomplete, openAutocomplete } = usePinnedFilesState(activeThreadId);
  const { mentions, addMention, removeMention } = useMentionsState(activeThreadId);

  const roots = useMemo(() => (projectRoot ? [projectRoot] : []), [projectRoot]);
  const { allFiles } = useProjectFileIndex({ roots, enabled: Boolean(projectRoot) });

  const autocompleteResults = useMemo(() => {
    if (!debouncedQuery || !isAutocompleteOpen) return [];
    const lowerQuery = debouncedQuery.toLowerCase();
    const pinnedPaths = new Set(pinnedFiles.map((f) => f.path));
    const matches: FileEntry[] = [];
    for (const file of allFiles) {
      if (pinnedPaths.has(file.path)) continue;
      if (file.relativePath.toLowerCase().includes(lowerQuery)) {
        matches.push(file);
        if (matches.length >= MAX_AUTOCOMPLETE_RESULTS) break;
      }
    }
    return matches;
  }, [allFiles, debouncedQuery, isAutocompleteOpen, pinnedFiles]);

  const totalTokens = useMemo(() => pinnedFiles.reduce((sum, f) => sum + f.estimatedTokens, 0), [pinnedFiles]);
  const contextSummary = useMemo(() => buildContextSummary(pinnedFiles, totalTokens), [pinnedFiles, totalTokens]);
  const filePaths = useMemo(() => pinnedFiles.map((f) => f.path), [pinnedFiles]);

  return {
    pinnedFiles, addFile, removeFile, clearFiles, contextSummary, totalTokens, filePaths,
    autocompleteResults, setAutocompleteQuery, isAutocompleteOpen, closeAutocomplete, openAutocomplete,
    allFiles, mentions, addMention, removeMention,
  };
}
