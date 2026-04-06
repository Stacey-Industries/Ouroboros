import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { useGenerateCommitMessage } from './useGitCommitGeneration';
import { buildGitPanelModel, useGitFileActions } from './useGitPanelModel.actions';
import {
  type CheckoutActionParams,
  type CommitActionParams,
  type GitDerivedState,
  type GitPanelModel,
  type GitPanelState,
  type GitStatusMap,
  type RefreshBranchesParams,
  type RefreshStatusParams,
  resetRepoState,
  sortEntries,
} from './useGitPanelModel.shared';

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
    if (!projectRoot) return;
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
      if (branchRes.success) setCurrentBranch(branchRes.branch ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [projectRoot, setCurrentBranch, setError, setStaged, setUnstaged]);
}

function useRefreshBranches(params: RefreshBranchesParams): () => Promise<void> {
  const { projectRoot, setBranches } = params;
  return useCallback(async () => {
    if (!projectRoot) return;
    const branchRes = await window.electronAPI.git.branches(projectRoot);
    if (branchRes.success && branchRes.branches) setBranches(branchRes.branches);
  }, [projectRoot, setBranches]);
}

type InitState = Pick<
  GitPanelState,
  'setBranches' | 'setCurrentBranch' | 'setIsRepo' | 'setStaged' | 'setUnstaged'
>;

interface RepoInitParams {
  root: string;
  state: InitState;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  cancelled: { current: boolean };
}

async function runRepoInit(params: RepoInitParams): Promise<void> {
  const { root, state, refreshStatus, refreshBranches, cancelled } = params;
  try {
    const res = await window.electronAPI.git.isRepo(root);
    if (cancelled.current) return;
    const repoExists = Boolean(res.isRepo);
    state.setIsRepo(repoExists);
    if (!repoExists) {
      resetRepoState(state);
      return;
    }
    await Promise.all([refreshStatus(), refreshBranches()]);
  } catch {
    if (!cancelled.current) state.setIsRepo(false);
  }
}

function useGitInitialization(
  projectRoot: string | null,
  refreshStatus: () => Promise<void>,
  refreshBranches: () => Promise<void>,
  state: InitState,
): void {
  useEffect(() => {
    if (!projectRoot) {
      state.setIsRepo(null);
      resetRepoState(state);
      return;
    }
    const cancelled = { current: false };
    void runRepoInit({ root: projectRoot, state, refreshStatus, refreshBranches, cancelled });
    return () => {
      cancelled.current = true;
    };
    // state object is stable (useState setters never change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot, refreshBranches, refreshStatus]);
}

function useCheckoutAction(params: CheckoutActionParams): (branch: string) => Promise<void> {
  const { projectRoot, refreshBranches, refreshStatus, setError } = params;
  return useCallback(
    async (branch: string) => {
      if (!projectRoot) return;
      const res = await window.electronAPI.git.checkout(projectRoot, branch);
      if (!res.success) setError(res.error ?? 'Checkout failed');
      await Promise.all([refreshStatus(), refreshBranches()]);
    },
    [projectRoot, refreshBranches, refreshStatus, setError],
  );
}

function useCommitAction(params: CommitActionParams): () => Promise<void> {
  const {
    commitMessage,
    projectRoot,
    refreshStatus,
    setCommitMessage,
    setError,
    setIsCommitting,
    staged,
  } = params;
  return useCallback(async () => {
    if (!projectRoot || !commitMessage.trim() || Object.keys(staged).length === 0) return;
    setIsCommitting(true);
    try {
      const res = await window.electronAPI.git.commit(projectRoot, commitMessage.trim());
      if (res.success) {
        setCommitMessage('');
        setError(null);
      } else setError(res.error ?? 'Commit failed');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed');
    } finally {
      setIsCommitting(false);
    }
  }, [
    commitMessage,
    projectRoot,
    refreshStatus,
    setCommitMessage,
    setError,
    setIsCommitting,
    staged,
  ]);
}

function useCommitSubmitShortcut(
  handleCommit: () => Promise<void>,
): (event: React.KeyboardEvent<HTMLTextAreaElement>) => void {
  return useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleCommit();
      }
    },
    [handleCommit],
  );
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

function useGitActions(
  projectRoot: string | null,
  state: GitPanelState,
  refreshStatus: () => Promise<void>,
): {
  handleCheckout: (b: string) => Promise<void>;
  handleCommit: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
} {
  const refreshBranches = useRefreshBranches({ projectRoot, setBranches: state.setBranches });
  const handleCheckout = useCheckoutAction({
    projectRoot,
    refreshBranches,
    refreshStatus,
    setError: state.setError,
  });
  const handleCommit = useCommitAction({
    projectRoot,
    refreshStatus,
    setCommitMessage: state.setCommitMessage,
    setError: state.setError,
    setIsCommitting: state.setIsCommitting,
    commitMessage: state.commitMessage,
    staged: state.staged,
  });
  const handleKeyDown = useCommitSubmitShortcut(handleCommit);
  return { handleCheckout, handleCommit, handleKeyDown };
}

export function useGitPanelModel(projectRoot: string | null): GitPanelModel {
  const state = useGitPanelState();
  const refreshStatus = useRefreshStatus({ projectRoot, ...state });
  const refreshBranches = useRefreshBranches({ projectRoot, setBranches: state.setBranches });

  useGitInitialization(projectRoot, refreshStatus, refreshBranches, state);

  const fileActions = useGitFileActions({ projectRoot, refreshStatus });
  const { handleCheckout, handleCommit, handleKeyDown } = useGitActions(
    projectRoot,
    state,
    refreshStatus,
  );
  const derived = useGitDerivedState(
    state.staged,
    state.unstaged,
    state.commitMessage,
    state.isCommitting,
  );
  const { isGenerating, handleGenerateCommitMessage } = useGenerateCommitMessage(
    projectRoot,
    derived.stagedCount,
    state.setCommitMessage,
    state.setError,
  );

  return buildGitPanelModel({
    state,
    derived,
    fileActions,
    handleCheckout,
    handleCommit,
    handleKeyDown,
    isGenerating,
    handleGenerateCommitMessage,
  });
}
