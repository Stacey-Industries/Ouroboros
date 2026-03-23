/**
 * chatOrchestrationBridgeGit.ts — Git snapshot and revert helpers for the orchestration bridge.
 *
 * Extracted from chatOrchestrationBridge.ts to keep file line counts under the ESLint limit.
 */

import { execFile } from 'child_process';
import { unlink } from 'fs/promises';
import { join } from 'path';

import type { ActiveStreamContext } from './chatOrchestrationBridgeTypes';
import type { AgentChatThreadStore } from './threadStore';
import type { AgentChatRevertResult } from './types';
import { getErrorMessage } from './utils';

// ---------------------------------------------------------------------------
// Git exec helpers
// ---------------------------------------------------------------------------

export function gitExecSimple(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

export function captureHeadHash(cwd: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd, timeout: 5000 }, (err, stdout) => {
      resolve(err ? undefined : stdout.trim() || undefined);
    });
  });
}

// ---------------------------------------------------------------------------
// Revert logic
// ---------------------------------------------------------------------------

function classifyDiffLines(lines: string[]): { filesToRestore: string[]; filesToRemove: string[] } {
  const filesToRestore: string[] = [];
  const filesToRemove: string[] = [];
  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0];
    const filePath = parts[1];
    if (status === 'A') {
      filesToRemove.push(filePath);
    } else if (status === 'M' || status === 'D') {
      filesToRestore.push(filePath);
    } else if (status.startsWith('R')) {
      filesToRestore.push(filePath);
      const newPath = parts[2];
      if (newPath) filesToRemove.push(newPath);
    }
  }
  return { filesToRestore, filesToRemove };
}

async function removeRevertedFiles(workspaceRoot: string, filesToRemove: string[]): Promise<void> {
  const results = await Promise.allSettled(
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path constructed from git diff output within workspace
    filesToRemove.map((f) => unlink(join(workspaceRoot, f))),
  );
  for (let i = 0; i < results.length; i++) {
    // eslint-disable-next-line security/detect-object-injection -- numeric indices into local arrays
    if (results[i].status === 'rejected')
      console.warn(`[agentChat] revert: failed to remove added file ${filesToRemove[i]}`);
  }
}

async function executeGitRevert(
  workspaceRoot: string,
  snapshotHash: string,
): Promise<{ revertedFiles: string[] }> {
  const diffOutput = await gitExecSimple(['diff', '--name-status', snapshotHash], workspaceRoot);
  if (!diffOutput.trim()) return { revertedFiles: [] };
  const { filesToRestore, filesToRemove } = classifyDiffLines(diffOutput.trim().split('\n'));
  const BATCH_SIZE = 50;
  for (let i = 0; i < filesToRestore.length; i += BATCH_SIZE) {
    await gitExecSimple(
      ['checkout', snapshotHash, '--', ...filesToRestore.slice(i, i + BATCH_SIZE)],
      workspaceRoot,
    );
  }
  await removeRevertedFiles(workspaceRoot, filesToRemove);
  return { revertedFiles: [...filesToRestore, ...filesToRemove] };
}

export async function revertToSnapshotWithBridge(
  threadStore: AgentChatThreadStore,
  activeSends: Map<string, ActiveStreamContext>,
  threadId: string,
  messageId: string,
): Promise<AgentChatRevertResult> {
  const thread = await threadStore.loadThread(threadId);
  if (!thread) return { success: false, error: 'Thread not found.' };
  const message = thread.messages.find((m) => m.id === messageId);
  if (!message) return { success: false, error: 'Message not found.' };
  const snapshotHash = message.orchestration?.preSnapshotHash;
  if (!snapshotHash)
    return {
      success: false,
      error: 'No snapshot was captured before this agent turn. Revert is unavailable.',
    };
  for (const [, ctx] of activeSends) {
    if (ctx.threadId === threadId)
      return { success: false, error: 'Cannot revert while the agent is still working.' };
  }
  try {
    const { revertedFiles } = await executeGitRevert(thread.workspaceRoot, snapshotHash);
    return { success: true, revertedFiles, restoredToHash: snapshotHash };
  } catch (error) {
    return { success: false, error: `Revert failed: ${getErrorMessage(error)}` };
  }
}
