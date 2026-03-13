import { useCallback, useEffect, useState } from 'react';
import type { CommitEntry } from '../../types/electron';

interface CommitHistoryModelArgs {
  filePath: string;
  projectRoot: string;
}

interface CommitListState {
  commits: CommitEntry[];
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  loadCommits: (offset: number) => Promise<void>;
  reset: () => void;
}

interface CommitPatchState {
  patch: string | null;
  patchError: string | null;
  patchLoading: boolean;
  reset: () => void;
  selectCommit: (hash: string) => Promise<void>;
  selectedHash: string | null;
}

export interface CommitHistoryViewModel {
  commits: CommitEntry[];
  error: string | null;
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => Promise<void>;
  onBack: () => void;
  onSelectCommit: (hash: string) => Promise<void>;
  patch: string | null;
  patchError: string | null;
  patchLoading: boolean;
  selectedHash: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function useCommitList(projectRoot: string, filePath: string): CommitListState {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCommits = useCallback(async (offset: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.git.log(projectRoot, filePath, offset);
      if (!result.success) {
        setError(result.error ?? 'Failed to load commit history');
        return;
      }
      const incoming = result.commits ?? [];
      setCommits((previous) => (offset === 0 ? incoming : [...previous, ...incoming]));
      setHasMore(incoming.length === 50);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to load commit history'));
    } finally {
      setIsLoading(false);
    }
  }, [filePath, projectRoot]);

  const reset = useCallback(() => {
    setCommits([]);
    setError(null);
    setHasMore(true);
    setIsLoading(false);
  }, []);

  return { commits, error, hasMore, isLoading, loadCommits, reset };
}

function useCommitPatch(projectRoot: string, filePath: string): CommitPatchState {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [patch, setPatch] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);

  const selectCommit = useCallback(async (hash: string) => {
    setSelectedHash(hash);
    setPatch(null);
    setPatchError(null);
    setPatchLoading(true);
    try {
      const result = await window.electronAPI.git.show(projectRoot, hash, filePath);
      if (!result.success) {
        setPatchError(result.error ?? 'Failed to load diff');
        return;
      }
      setPatch(result.patch ?? '');
    } catch (error) {
      setPatchError(getErrorMessage(error, 'Failed to load diff'));
    } finally {
      setPatchLoading(false);
    }
  }, [filePath, projectRoot]);

  const reset = useCallback(() => {
    setSelectedHash(null);
    setPatch(null);
    setPatchError(null);
    setPatchLoading(false);
  }, []);

  return { patch, patchError, patchLoading, reset, selectCommit, selectedHash };
}

export function useCommitHistoryModel({
  filePath,
  projectRoot,
}: CommitHistoryModelArgs): CommitHistoryViewModel {
  const { commits, error, hasMore, isLoading, loadCommits, reset: resetList } = useCommitList(projectRoot, filePath);
  const { patch, patchError, patchLoading, reset: resetPatch, selectCommit, selectedHash } = useCommitPatch(projectRoot, filePath);

  useEffect(() => {
    resetList();
    resetPatch();
    void loadCommits(0);
  }, [loadCommits, resetList, resetPatch]);

  const loadMore = useCallback(() => loadCommits(commits.length), [commits.length, loadCommits]);

  return {
    commits,
    error,
    hasMore,
    isLoading,
    loadMore,
    onBack: resetPatch,
    onSelectCommit: selectCommit,
    patch,
    patchError,
    patchLoading,
    selectedHash,
  };
}
