import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useGenerateCommitMessage } from './useGitCommitGeneration';
import {
  type CheckoutActionParams,
  type CommitActionParams,
  type GitActionParams,
  type GitDerivedState,
  type GitFileEntry,
  type GitPanelState,
  type GitStatusMap,
  type RefreshBranchesParams,
  type RefreshStatusParams,
  resetRepoState,
  runGitMutation,
  sortEntries,
} from './useGitPanelModel.shared';

export interface GitPanelModel {
  branches: string[];
  canCommit: boolean;
  commitMessage: string;
  currentBranch: string | null;
  error: string | null;
  isCommitting: boolean;
  isGenerating: boolean;
  isRepo: boolean | null;
  stagedCount: number;
  stagedFiles: GitFileEntry[];
  unstagedCount: number;
  unstagedFiles: GitFileEntry[];
  clearError: () => void;
  handleCheckout: (branch: string) => Promise<void>;
  handleCommit: () => Promise<void>;
  handleCommitMessageChange: (value: string) => void;
  handleDiscardFile: (filePath: string) => Promise<void>;
  handleGenerateCommitMessage: () => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleStageAll: () => Promise<void>;
  handleStageFile: (filePath: string) => Promise<void>;
  handleUnstageAll: () => Promise<void>;
  handleUnstageFile: (filePath: string) => Promise<void>;
}

function useGitPanelState(): GitPanelState {
  const [staged, setStaged] = useState<GitStatusMap>({});
  const [unstaged, setUnstaged] = useState<GitStatusMap>({});
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  return {
    branches,
    commitMessage,
    currentBranch,
    error,
    isCommitting,
    isRepo,
    staged,
    unstaged,
    setBranches,
    setCommitMessage,
    setCurrentBranch,
    setError,
    setIsCommitting,
    setIsRepo,
    setStaged,
    setUnstaged,
  };
}

function useRefreshStatus(params: RefreshStatusParams): () => Promise<void> {
  const { projectRoot, setCurrentBranch, setError, setStaged, setUnstaged } = params;

  return useCallback(async () => {
    if (!projectRoot) {
      return;
    }

    try {
      const [statusRes, branchRes] = await Promise.all([
        window.electronAPI.git.statusDetailed(projectRoot),
        window.electronAPI.git.branch(projectRoot),
      ]);

      if (statusRes.success) {
        setStaged(statusRes.staged ?? {});
        setUnstaged(statusRes.unstaged ?? {});
        setError(null);
      } else {
        setError(statusRes.error ?? 'Failed to get status');
      }

      if (branchRes.success) {
        setCurrentBranch(branchRes.branch ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [projectRoot, setCurrentBranch, setError, setStaged, setUnstaged]);
}

function useRefreshBranches(params: RefreshBranchesParams): () => Promise<void> {
  const { projectRoot, setBranches } = params;

  return useCallback(async () => {
    if (!projectRoot) {
      return;
    }

    const branchRes = await window.electronAPI.git.branches(projectRoot);
    if (branchRes.success && branchRes.branches) {
      setBranches(branchRes.branches);
    }
  }, [projectRoot, setBranches]);
}

function useGitInitialization(
  projectRoot: string | null,
  refreshStatus: () => Promise<void>,
  refreshBranches: () => Promise<void>,
  state: Pick<GitPanelState, 'setBranches' | 'setCurrentBranch' | 'setIsRepo' | 'setStaged' | 'setUnstaged'>,
): void {
  const { setBranches, setCurrentBranch, setIsRepo, setStaged, setUnstaged } = state;

  useEffect(() => {
    if (!projectRoot) {
      setIsRepo(null);
      resetRepoState({ setBranches, setCurrentBranch, setStaged, setUnstaged });
      return;
    }

    const root = projectRoot;
    let cancelled = false;

    async function initializeRepoState(): Promise<void> {
      try {
        const res = await window.electronAPI.git.isRepo(root);
        if (cancelled) {
          return;
        }

        const repoExists = Boolean(res.isRepo);
        setIsRepo(repoExists);
        if (!repoExists) {
          resetRepoState({ setBranches, setCurrentBranch, setStaged, setUnstaged });
          return;
        }

        await Promise.all([refreshStatus(), refreshBranches()]);
      } catch {
        if (!cancelled) {
          setIsRepo(false);
        }
      }
    }

    void initializeRepoState();

    return () => {
      cancelled = true;
    };
  }, [projectRoot, refreshBranches, refreshStatus, setBranches, setCurrentBranch, setIsRepo, setStaged, setUnstaged]);
}

function useGitPolling(
  projectRoot: string | null,
  isRepo: boolean | null,
  refreshStatus: () => Promise<void>,
): void {
  useEffect(() => {
    if (!projectRoot || !isRepo) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [projectRoot, isRepo, refreshStatus]);
}

function useGitFileActions(params: GitActionParams): Pick<GitPanelModel, 'handleDiscardFile' | 'handleStageAll' | 'handleStageFile' | 'handleUnstageAll' | 'handleUnstageFile'> {
  const { projectRoot, refreshStatus } = params;

  const handleStageFile = useCallback(async (filePath: string) => {
    await runGitMutation({ projectRoot, refreshStatus, execute: (root) => window.electronAPI.git.stage(root, filePath) });
  }, [projectRoot, refreshStatus]);
  const handleUnstageFile = useCallback(async (filePath: string) => {
    await runGitMutation({ projectRoot, refreshStatus, execute: (root) => window.electronAPI.git.unstage(root, filePath) });
  }, [projectRoot, refreshStatus]);
  const handleStageAll = useCallback(async () => {
    await runGitMutation({ projectRoot, refreshStatus, execute: (root) => window.electronAPI.git.stageAll(root) });
  }, [projectRoot, refreshStatus]);
  const handleUnstageAll = useCallback(async () => {
    await runGitMutation({ projectRoot, refreshStatus, execute: (root) => window.electronAPI.git.unstageAll(root) });
  }, [projectRoot, refreshStatus]);
  const handleDiscardFile = useCallback(async (filePath: string) => {
    await runGitMutation({ projectRoot, refreshStatus, execute: (root) => window.electronAPI.git.discardFile(root, filePath) });
  }, [projectRoot, refreshStatus]);

  return { handleDiscardFile, handleStageAll, handleStageFile, handleUnstageAll, handleUnstageFile };
}

function useCheckoutAction(params: CheckoutActionParams): (branch: string) => Promise<void> {
  const { projectRoot, refreshBranches, refreshStatus, setError } = params;

  return useCallback(async (branch: string) => {
    if (!projectRoot) {
      return;
    }

    const res = await window.electronAPI.git.checkout(projectRoot, branch);
    if (!res.success) {
      setError(res.error ?? 'Checkout failed');
    }

    await Promise.all([refreshStatus(), refreshBranches()]);
  }, [projectRoot, refreshBranches, refreshStatus, setError]);
}

function useCommitAction(params: CommitActionParams): () => Promise<void> {
  const { commitMessage, projectRoot, refreshStatus, setCommitMessage, setError, setIsCommitting, staged } = params;

  return useCallback(async () => {
    if (!projectRoot || !commitMessage.trim() || Object.keys(staged).length === 0) {
      return;
    }

    setIsCommitting(true);
    try {
      const res = await window.electronAPI.git.commit(projectRoot, commitMessage.trim());
      if (res.success) {
        setCommitMessage('');
        setError(null);
      } else {
        setError(res.error ?? 'Commit failed');
      }

      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setIsCommitting(false);
    }
  }, [commitMessage, projectRoot, refreshStatus, setCommitMessage, setError, setIsCommitting, staged]);
}

function useCommitSubmitShortcut(handleCommit: () => Promise<void>): (event: React.KeyboardEvent<HTMLTextAreaElement>) => void {
  return useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleCommit();
    }
  }, [handleCommit]);
}

function useGitDerivedState(
  staged: GitStatusMap,
  unstaged: GitStatusMap,
  commitMessage: string,
  isCommitting: boolean,
): GitDerivedState {
  const stagedFiles = useMemo(() => sortEntries(staged), [staged]);
  const unstagedFiles = useMemo(() => sortEntries(unstaged), [unstaged]);
  const stagedCount = stagedFiles.length;
  const unstagedCount = unstagedFiles.length;
  const canCommit = stagedCount > 0 && commitMessage.trim().length > 0 && !isCommitting;

  return { canCommit, stagedCount, stagedFiles, unstagedCount, unstagedFiles };
}

export function useGitPanelModel(projectRoot: string | null): GitPanelModel {
  const state = useGitPanelState();
  const refreshStatus = useRefreshStatus({ projectRoot, ...state });
  const refreshBranches = useRefreshBranches({ projectRoot, setBranches: state.setBranches });

  useGitInitialization(projectRoot, refreshStatus, refreshBranches, state);
  useGitPolling(projectRoot, state.isRepo, refreshStatus);

  const fileActions = useGitFileActions({ projectRoot, refreshStatus });
  const handleCheckout = useCheckoutAction({ projectRoot, refreshBranches, refreshStatus, setError: state.setError });
  const handleCommit = useCommitAction({ projectRoot, refreshStatus, setCommitMessage: state.setCommitMessage, setError: state.setError, setIsCommitting: state.setIsCommitting, commitMessage: state.commitMessage, staged: state.staged });
  const handleKeyDown = useCommitSubmitShortcut(handleCommit);
  const derived = useGitDerivedState(state.staged, state.unstaged, state.commitMessage, state.isCommitting);
  const { isGenerating, handleGenerateCommitMessage } = useGenerateCommitMessage(projectRoot, derived.stagedCount, state.setCommitMessage, state.setError);

  return {
    branches: state.branches,
    canCommit: derived.canCommit,
    clearError: () => state.setError(null),
    commitMessage: state.commitMessage,
    currentBranch: state.currentBranch,
    error: state.error,
    handleCheckout,
    handleCommit,
    handleCommitMessageChange: state.setCommitMessage,
    handleDiscardFile: fileActions.handleDiscardFile,
    handleGenerateCommitMessage,
    handleKeyDown,
    handleStageAll: fileActions.handleStageAll,
    handleStageFile: fileActions.handleStageFile,
    handleUnstageAll: fileActions.handleUnstageAll,
    handleUnstageFile: fileActions.handleUnstageFile,
    isCommitting: state.isCommitting,
    isGenerating,
    isRepo: state.isRepo,
    stagedCount: derived.stagedCount,
    stagedFiles: derived.stagedFiles,
    unstagedCount: derived.unstagedCount,
    unstagedFiles: derived.unstagedFiles,
  };
}
