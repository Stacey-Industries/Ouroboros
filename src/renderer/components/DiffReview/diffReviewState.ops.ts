/**
 * diffReviewState.ops.ts - Async git operations for the diff review.
 * Handles per-hunk staging/reverting and bulk file operations.
 */

import log from 'electron-log/renderer';
import type { Dispatch } from 'react';

import type { FileDiff } from '../../types/electron';
import type { DiffReviewAction } from './diffReviewState';
import type { HunkDecision, ReviewFile } from './types';

type ReviewDispatch = Dispatch<DiffReviewAction>;

interface PendingHunkRef {
  fileIdx: number;
  hunkIdx: number;
  rawPatch: string;
}

export function toReviewFiles(apiFiles: FileDiff[], stagedPatches?: Set<string>): ReviewFile[] {
  return apiFiles.map((file) => ({
    filePath: file.filePath,
    relativePath: file.relativePath,
    status: file.status,
    oldPath: file.oldPath,
    hunks: file.hunks.map((hunk, index) => ({
      id: `${file.relativePath}:${index}`,
      header: hunk.header,
      oldStart: hunk.oldStart,
      oldCount: hunk.oldCount,
      newStart: hunk.newStart,
      newCount: hunk.newCount,
      lines: hunk.lines,
      rawPatch: hunk.rawPatch,
      decision: (stagedPatches?.has(hunk.rawPatch) ? 'accepted' : 'pending') as HunkDecision,
    })),
  }));
}

export function buildStagedPatchSet(cachedFiles: FileDiff[]): Set<string> {
  const set = new Set<string>();
  for (const file of cachedFiles) {
    for (const hunk of file.hunks) set.add(hunk.rawPatch);
  }
  return set;
}

export function getPendingEntriesForFile(file: ReviewFile, fileIdx: number): PendingHunkRef[] {
  return file.hunks.reduceRight<PendingHunkRef[]>((entries, hunk, hunkIdx) => {
    if (hunk.decision === 'pending') entries.push({ fileIdx, hunkIdx, rawPatch: hunk.rawPatch });
    return entries;
  }, []);
}

export function getPendingEntries(files: ReviewFile[]): PendingHunkRef[] {
  const entries: PendingHunkRef[] = [];
  for (let fileIdx = files.length - 1; fileIdx >= 0; fileIdx -= 1) {
    entries.push(...getPendingEntriesForFile(files[fileIdx], fileIdx));
  }
  return entries;
}

export async function revertPendingEntries(
  projectRoot: string,
  entries: PendingHunkRef[],
  dispatch: ReviewDispatch,
): Promise<void> {
  for (const entry of entries) {
    const result = await window.electronAPI.git.revertHunk(projectRoot, entry.rawPatch);
    if (!result.success) {
      log.warn(
        'Failed to revert hunk (file %d, hunk %d):',
        entry.fileIdx,
        entry.hunkIdx,
        result.error,
      );
      dispatch({
        type: 'SET_DECISION',
        fileIdx: entry.fileIdx,
        hunkIdx: entry.hunkIdx,
        decision: 'pending',
      });
    }
  }
}

async function stageFileEntries(
  projectRoot: string,
  fileEntries: PendingHunkRef[],
  file: ReviewFile,
  dispatch: ReviewDispatch,
): Promise<void> {
  const hasRejectedHunks = file.hunks.some((h) => h.decision === 'rejected');
  if (!hasRejectedHunks) {
    const result = await window.electronAPI.git.stage(projectRoot, file.filePath);
    if (result.success) return;
    log.warn(
      'git add failed for %s, falling back to per-hunk staging:',
      file.filePath,
      result.error,
    );
  }
  for (const entry of fileEntries) {
    const result = await window.electronAPI.git.stageHunk(projectRoot, entry.rawPatch);
    if (!result.success) {
      log.warn(
        'Failed to stage hunk (file %d, hunk %d):',
        entry.fileIdx,
        entry.hunkIdx,
        result.error,
      );
      dispatch({
        type: 'SET_DECISION',
        fileIdx: entry.fileIdx,
        hunkIdx: entry.hunkIdx,
        decision: 'pending',
      });
    }
  }
}

export async function stagePendingEntries(
  projectRoot: string,
  entries: PendingHunkRef[],
  files: ReviewFile[],
  dispatch: ReviewDispatch,
): Promise<void> {
  const byFile = new Map<number, PendingHunkRef[]>();
  for (const entry of entries) {
    let group = byFile.get(entry.fileIdx);
    if (!group) {
      group = [];
      byFile.set(entry.fileIdx, group);
    }
    group.push(entry);
  }
  for (const [fileIdx, fileEntries] of byFile) {
    await stageFileEntries(projectRoot, fileEntries, files[fileIdx], dispatch);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadReviewFiles(
  dispatch: ReviewDispatch,
  projectRoot: string,
  snapshotHash: string,
  filePaths?: string[],
): void {
  void Promise.all([
    window.electronAPI.git.diffReview(projectRoot, snapshotHash, filePaths),
    window.electronAPI.git.diffCached(projectRoot, snapshotHash, filePaths).catch(() => null),
  ])
    .then(([workingResult, cachedResult]) => {
      if (!workingResult.success || !workingResult.files) {
        dispatch({ type: 'ERROR', error: workingResult.error ?? 'Failed to load diff' });
        return;
      }
      const stagedPatches =
        cachedResult?.success && cachedResult.files
          ? buildStagedPatchSet(cachedResult.files)
          : undefined;
      dispatch({ type: 'LOADED', files: toReviewFiles(workingResult.files, stagedPatches) });
    })
    .catch((error) => {
      dispatch({ type: 'ERROR', error: getErrorMessage(error) });
    });
}
