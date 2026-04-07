import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';

import {
  applyPatch,
  discardFile,
  gitBlame,
  gitBranch,
  gitBranches,
  gitChangedFilesBetween,
  gitCheckout,
  gitCheckpoint,
  gitCommit,
  gitCreateSnapshot,
  gitDiff,
  gitDiffBetween,
  gitDiffCached,
  gitDiffRaw,
  gitDiffReview,
  gitDirtyCount,
  gitExec,
  gitFileAtCommit,
  gitIsRepo,
  gitLog,
  gitRestoreSnapshot,
  gitRevertFile,
  gitShow,
  gitSnapshot,
  gitStage,
  gitStageAll,
  gitStatus,
  gitStatusDetailed,
  gitUnstage,
  gitUnstageAll,
  stagePatch,
} from './gitOperations';
import { assertPathAllowed } from './pathSecurity';

type SenderWindow = (event: IpcMainInvokeEvent) => BrowserWindow;
type SecureRegister = <T extends [string, ...unknown[]]>(
  channel: string,
  handler: (...args: T) => Promise<unknown>,
) => string;

function buildSecureRegister(): SecureRegister {
  return (channel, handler) => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const root = args[0] as string;
      const denied = assertPathAllowed(event, root);
      if (denied) return denied;
      return handler(...(args as Parameters<typeof handler>));
    });
    return channel;
  };
}

function registerCoreGitChannels(rs: SecureRegister): string[] {
  return [
    rs('git:isRepo', gitIsRepo),
    rs('git:status', gitStatus),
    rs('git:branch', gitBranch),
    rs('git:diff', gitDiff),
    rs('git:log', gitLog),
    rs('git:show', gitShow),
    rs('git:branches', gitBranches),
    rs('git:checkout', gitCheckout),
    rs('git:stage', gitStage),
    rs('git:unstage', gitUnstage),
    rs('git:statusDetailed', gitStatusDetailed),
    rs('git:commit', gitCommit),
    rs('git:stageAll', gitStageAll),
    rs('git:unstageAll', gitUnstageAll),
  ];
}

function registerCheckpointChannel(rs: SecureRegister): string {
  return rs('git:checkpoint', async (root: string, message: string) => {
    const ok = await gitCheckpoint(root, message);
    return { success: ok };
  });
}

function registerSnapshotGitChannels(rs: SecureRegister): string[] {
  return [
    rs('git:discardFile', discardFile),
    rs('git:snapshot', gitSnapshot),
    rs('git:diffReview', gitDiffReview),
    rs('git:diffCached', gitDiffCached),
    rs('git:fileAtCommit', gitFileAtCommit),
    rs('git:applyHunk', (root: string, patchContent: string) =>
      applyPatch(gitExec, root, patchContent),
    ),
    rs('git:revertHunk', (root: string, patchContent: string) =>
      applyPatch(gitExec, root, patchContent, true),
    ),
    rs('git:stageHunk', (root: string, patchContent: string) =>
      stagePatch(gitExec, root, patchContent),
    ),
    rs('git:revertFile', gitRevertFile),
    rs('git:diffBetween', gitDiffBetween),
    rs('git:changedFilesBetween', gitChangedFilesBetween),
    rs('git:restoreSnapshot', gitRestoreSnapshot),
    rs('git:createSnapshot', gitCreateSnapshot),
    rs('git:dirtyCount', gitDirtyCount),
    rs('git:blame', gitBlame),
    rs('git:diffRaw', gitDiffRaw),
  ];
}

export function registerGitHandlers(_senderWindow: SenderWindow): string[] {
  void _senderWindow;
  const rs = buildSecureRegister();
  return [
    ...registerCoreGitChannels(rs),
    ...registerSnapshotGitChannels(rs),
    registerCheckpointChannel(rs),
  ];
}
