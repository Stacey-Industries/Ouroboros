import type React from 'react';

export type GitStatusMap = Record<string, string>;
export type GitFileEntry = [string, string];

export interface GitPanelState {
  branches: string[];
  commitMessage: string;
  currentBranch: string | null;
  error: string | null;
  isCommitting: boolean;
  isRepo: boolean | null;
  staged: GitStatusMap;
  unstaged: GitStatusMap;
  setBranches: React.Dispatch<React.SetStateAction<string[]>>;
  setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  setCurrentBranch: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsCommitting: React.Dispatch<React.SetStateAction<boolean>>;
  setIsRepo: React.Dispatch<React.SetStateAction<boolean | null>>;
  setStaged: React.Dispatch<React.SetStateAction<GitStatusMap>>;
  setUnstaged: React.Dispatch<React.SetStateAction<GitStatusMap>>;
}

export interface RefreshStatusParams {
  projectRoot: string | null;
  setCurrentBranch: React.Dispatch<React.SetStateAction<string | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setStaged: React.Dispatch<React.SetStateAction<GitStatusMap>>;
  setUnstaged: React.Dispatch<React.SetStateAction<GitStatusMap>>;
}

export interface RefreshBranchesParams {
  projectRoot: string | null;
  setBranches: React.Dispatch<React.SetStateAction<string[]>>;
}

export interface GitActionParams {
  projectRoot: string | null;
  refreshStatus: () => Promise<void>;
}

export interface CheckoutActionParams extends GitActionParams {
  refreshBranches: () => Promise<void>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface CommitActionParams extends GitActionParams {
  commitMessage: string;
  staged: GitStatusMap;
  setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsCommitting: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface GitDerivedState {
  canCommit: boolean;
  stagedCount: number;
  stagedFiles: GitFileEntry[];
  unstagedCount: number;
  unstagedFiles: GitFileEntry[];
}

export function sortEntries(entries: GitStatusMap): GitFileEntry[] {
  return Object.entries(entries).sort(([left], [right]) => left.localeCompare(right));
}

export function resetRepoState(
  state: Pick<GitPanelState, 'setBranches' | 'setCurrentBranch' | 'setStaged' | 'setUnstaged'>,
): void {
  state.setBranches([]);
  state.setCurrentBranch(null);
  state.setStaged({});
  state.setUnstaged({});
}

export async function runGitMutation(params: {
  projectRoot: string | null;
  refreshStatus: () => Promise<void>;
  execute: (projectRoot: string) => Promise<unknown>;
}): Promise<void> {
  if (!params.projectRoot) {
    return;
  }

  await params.execute(params.projectRoot);
  await params.refreshStatus();
}
