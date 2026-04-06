import React, { useCallback } from 'react';

import type {
  GitActionParams,
  GitDerivedState,
  GitPanelModel,
  GitPanelState,
} from './useGitPanelModel.shared';
import { runGitMutation } from './useGitPanelModel.shared';

type FileActionsResult = Pick<
  GitPanelModel,
  | 'handleDiscardFile'
  | 'handleStageAll'
  | 'handleStageFile'
  | 'handleUnstageAll'
  | 'handleUnstageFile'
>;

function makeFileMutation(
  params: GitActionParams,
  execute: (root: string, filePath: string) => Promise<unknown>,
): (filePath: string) => Promise<void> {
  return async (filePath: string) =>
    runGitMutation({ ...params, execute: (root) => execute(root, filePath) });
}

function makeAllMutation(
  params: GitActionParams,
  execute: (root: string) => Promise<unknown>,
): () => Promise<void> {
  return async () => runGitMutation({ ...params, execute });
}

export function useGitFileActions(params: GitActionParams): FileActionsResult {
  const { projectRoot, refreshStatus } = params;

  const handleStageFile = useCallback(
    (filePath: string) =>
      makeFileMutation(params, (root, f) => window.electronAPI.git.stage(root, f))(filePath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot, refreshStatus],
  );
  const handleUnstageFile = useCallback(
    (filePath: string) =>
      makeFileMutation(params, (root, f) => window.electronAPI.git.unstage(root, f))(filePath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot, refreshStatus],
  );
  const handleStageAll = useCallback(
    () => makeAllMutation(params, (root) => window.electronAPI.git.stageAll(root))(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot, refreshStatus],
  );
  const handleUnstageAll = useCallback(
    () => makeAllMutation(params, (root) => window.electronAPI.git.unstageAll(root))(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot, refreshStatus],
  );
  const handleDiscardFile = useCallback(
    (filePath: string) =>
      makeFileMutation(params, (root, f) => window.electronAPI.git.discardFile(root, f))(filePath),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectRoot, refreshStatus],
  );

  return {
    handleDiscardFile,
    handleStageAll,
    handleStageFile,
    handleUnstageAll,
    handleUnstageFile,
  };
}

export interface BuildModelParams {
  state: GitPanelState;
  derived: GitDerivedState;
  fileActions: ReturnType<typeof useGitFileActions>;
  handleCheckout: (branch: string) => Promise<void>;
  handleCommit: () => Promise<void>;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isGenerating: boolean;
  handleGenerateCommitMessage: () => Promise<void>;
}

export function buildGitPanelModel(p: BuildModelParams): GitPanelModel {
  return {
    branches: p.state.branches,
    canCommit: p.derived.canCommit,
    clearError: () => p.state.setError(null),
    commitMessage: p.state.commitMessage,
    currentBranch: p.state.currentBranch,
    error: p.state.error,
    handleCheckout: p.handleCheckout,
    handleCommit: p.handleCommit,
    handleCommitMessageChange: p.state.setCommitMessage,
    handleDiscardFile: p.fileActions.handleDiscardFile,
    handleGenerateCommitMessage: p.handleGenerateCommitMessage,
    handleKeyDown: p.handleKeyDown,
    handleStageAll: p.fileActions.handleStageAll,
    handleStageFile: p.fileActions.handleStageFile,
    handleUnstageAll: p.fileActions.handleUnstageAll,
    handleUnstageFile: p.fileActions.handleUnstageFile,
    isCommitting: p.state.isCommitting,
    isGenerating: p.isGenerating,
    isRepo: p.state.isRepo,
    stagedCount: p.derived.stagedCount,
    stagedFiles: p.derived.stagedFiles,
    unstagedCount: p.derived.unstagedCount,
    unstagedFiles: p.derived.unstagedFiles,
  };
}
