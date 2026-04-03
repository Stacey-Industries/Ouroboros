import { useCallback, useMemo, useState } from 'react';

import { parseUnifiedDiff } from './AgentChatDiffReviewParts';

/* ---------- Types ---------- */

export type HunkStatus = 'pending' | 'accepted' | 'rejected';

export interface DiffHunk {
  /** The raw diff text for this hunk (header + lines). */
  raw: string;
  /** Parsed header line, e.g. "@@ -1,4 +1,5 @@" */
  header: string;
  /** Starting line in the original file (1-based). */
  oldStart: number;
  /** Number of context + deleted lines in the original file. */
  oldCount: number;
  /** Starting line in the new file (1-based). */
  newStart: number;
  /** Number of context + added lines in the new file. */
  newCount: number;
}

export interface UseDiffBlockResult {
  hunks: DiffHunk[];
  hunkStatuses: Map<number, HunkStatus>;
  additions: number;
  deletions: number;
  acceptHunk: (index: number) => Promise<void>;
  rejectHunk: (index: number) => void;
  acceptAll: () => Promise<void>;
  rejectAll: () => void;
  applyError: string | null;
}

/* ---------- Hunk parsing ---------- */

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function splitIntoHunks(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: string[] = [];
  let meta: Omit<DiffHunk, 'raw'> | null = null;

  for (const line of diffText.split('\n')) {
    const m = line.match(HUNK_HEADER_RE);
    if (m) {
      if (meta !== null && current.length > 0) {
        hunks.push({ ...meta, raw: current.join('\n') });
      }
      meta = {
        header: line,
        oldStart: Number(m[1]),
        oldCount: m[2] !== undefined ? Number(m[2]) : 1,
        newStart: Number(m[3]),
        newCount: m[4] !== undefined ? Number(m[4]) : 1,
      };
      current = [line];
    } else if (meta !== null) {
      current.push(line);
    }
  }
  if (meta !== null && current.length > 0) {
    hunks.push({ ...meta, raw: current.join('\n') });
  }
  return hunks;
}

/* ---------- Patch application ---------- */

type HunkOp = { op: '+' | '-' | ' '; text: string };

function parseHunkOps(rawLines: string[]): HunkOp[] {
  const ops: HunkOp[] = [];
  for (const hl of rawLines) {
    if (hl.startsWith('+')) ops.push({ op: '+', text: hl.slice(1) });
    else if (hl.startsWith('-')) ops.push({ op: '-', text: hl.slice(1) });
    else if (hl.startsWith(' ')) ops.push({ op: ' ', text: hl.slice(1) });
  }
  return ops;
}

function verifyContextLines(result: string[], ops: HunkOp[], startIdx: number): boolean {
  let fileIdx = startIdx;
  for (const op of ops) {
    if (op.op !== ' ' && op.op !== '-') continue;
    if (fileIdx >= result.length || result[fileIdx] !== op.text) return false;
    fileIdx++;
  }
  return true;
}

function applyHunkToLines(fileLines: string[], hunk: DiffHunk): string[] | null {
  const result: string[] = [...fileLines];
  const ops = parseHunkOps(hunk.raw.split('\n').slice(1)); // skip header

  if (!verifyContextLines(result, ops, hunk.oldStart - 1)) return null;

  const deleteCount = ops.filter((o) => o.op === '-' || o.op === ' ').length;
  const insertLines = ops.filter((o) => o.op === '+' || o.op === ' ').map((o) => o.text);
  result.splice(hunk.oldStart - 1, deleteCount, ...insertLines);
  return result;
}

/* ---------- Hook ---------- */

function useDiffStats(diffText: string): { additions: number; deletions: number } {
  return useMemo(() => {
    const lines = parseUnifiedDiff(diffText);
    return {
      additions: lines.filter((l) => l.type === 'add').length,
      deletions: lines.filter((l) => l.type === 'del').length,
    };
  }, [diffText]);
}

type HunkActions = {
  applyHunks: (indices: number[]) => Promise<void>;
  rejectHunk: (index: number) => void;
  setHunkStatuses: React.Dispatch<React.SetStateAction<Map<number, HunkStatus>>>;
};

function useHunkActions(hunks: DiffHunk[], filePath: string, setHunkStatuses: HunkActions['setHunkStatuses']): { applyHunks: (indices: number[]) => Promise<void>; rejectHunk: (index: number) => void; applyError: string | null } {
  const [applyError, setApplyError] = useState<string | null>(null);

  const applyHunks = useCallback(async (indices: number[]): Promise<void> => {
    setApplyError(null);
    const readResult = await window.electronAPI.files.readFile(filePath);
    if (!readResult.success || readResult.content === undefined) {
      setApplyError('Could not read file: ' + (readResult.error ?? 'unknown error'));
      return;
    }
    let fileLines = readResult.content.split('\n');
    for (const idx of [...indices].sort((a, b) => b - a)) {
      const patched = applyHunkToLines(fileLines, hunks[idx]);
      if (patched === null) {
        setApplyError(`Conflict in hunk ${idx + 1} — file has changed since diff was generated`);
        return;
      }
      fileLines = patched;
    }
    const saveResult = await window.electronAPI.files.saveFile(filePath, fileLines.join('\n'));
    if (!saveResult.success) { setApplyError('Could not save file: ' + (saveResult.error ?? 'unknown error')); return; }
    setHunkStatuses((prev) => { const next = new Map(prev); for (const idx of indices) next.set(idx, 'accepted'); return next; });
  }, [filePath, hunks, setHunkStatuses]);

  const rejectHunk = useCallback((index: number) => {
    setHunkStatuses((prev) => { const next = new Map(prev); next.set(index, 'rejected'); return next; });
  }, [setHunkStatuses]);

  return { applyHunks, rejectHunk, applyError };
}

export function useDiffBlock(diffText: string, filePath: string): UseDiffBlockResult {
  const hunks = useMemo(() => splitIntoHunks(diffText), [diffText]);
  const [hunkStatuses, setHunkStatuses] = useState<Map<number, HunkStatus>>(
    () => new Map(hunks.map((_, i) => [i, 'pending' as HunkStatus])),
  );
  const { additions, deletions } = useDiffStats(diffText);
  const { applyHunks, rejectHunk, applyError } = useHunkActions(hunks, filePath, setHunkStatuses);

  const acceptHunk = useCallback((index: number) => applyHunks([index]), [applyHunks]);

  const acceptAll = useCallback(() => {
    const pending = hunks.map((_, i) => i).filter((i) => hunkStatuses.get(i) === 'pending');
    return applyHunks(pending);
  }, [hunks, hunkStatuses, applyHunks]);

  const rejectAll = useCallback(() => {
    setHunkStatuses((prev) => {
      const next = new Map(prev);
      for (const [k, v] of prev) { if (v === 'pending') next.set(k, 'rejected'); }
      return next;
    });
  }, []);

  return { hunks, hunkStatuses, additions, deletions, acceptHunk, rejectHunk, acceptAll, rejectAll, applyError };
}
