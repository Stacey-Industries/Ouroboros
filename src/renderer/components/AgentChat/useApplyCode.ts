import { useCallback, useEffect, useRef, useState } from 'react';

export type ApplyCodeStatus = 'idle' | 'previewing' | 'applied' | 'error';

export interface DiffLine {
  type: 'add' | 'del' | 'context';
  text: string;
  lineNo?: number;
}

export interface UseApplyCodeResult {
  status: ApplyCodeStatus;
  errorMessage: string | null;
  diffLines: DiffLine[];
  apply: () => Promise<void>;
  accept: () => Promise<void>;
  reject: () => void;
  revert: () => Promise<void>;
  canRevert: boolean;
}

/** Sequential diff for large files — O(n) comparison. */
function computeSequentialDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];
  const minLen = Math.min(oldLines.length, newLines.length);
  for (let i = 0; i < minLen; i++) {
    if (oldLines[i] === newLines[i]) {
      result.push({ type: 'context', text: oldLines[i], lineNo: i + 1 });
    } else {
      result.push({ type: 'del', text: oldLines[i], lineNo: i + 1 });
      result.push({ type: 'add', text: newLines[i], lineNo: i + 1 });
    }
  }
  for (let i = minLen; i < oldLines.length; i++) {
    result.push({ type: 'del', text: oldLines[i], lineNo: i + 1 });
  }
  for (let i = minLen; i < newLines.length; i++) {
    result.push({ type: 'add', text: newLines[i], lineNo: i + 1 });
  }
  return result;
}

/** Build LCS table for line-based diff. */
function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Backtrack through LCS table to produce diff lines. */
function backtrackLcs(oldLines: string[], newLines: string[], dp: number[][]): DiffLine[] {
  const diffItems: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffItems.push({ type: 'context', text: oldLines[i - 1], lineNo: i });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffItems.push({ type: 'add', text: newLines[j - 1], lineNo: j });
      j--;
    } else {
      diffItems.push({ type: 'del', text: oldLines[i - 1], lineNo: i });
      i--;
    }
  }
  diffItems.reverse();
  return diffItems;
}

/**
 * Computes a simple line-based diff between two strings.
 * Produces add/del/context lines for visual preview.
 */
function computeLineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const maxLen = Math.max(oldLines.length, newLines.length);
  if (maxLen > 2000) {
    return computeSequentialDiff(oldLines, newLines);
  }
  const dp = buildLcsTable(oldLines, newLines);
  return backtrackLcs(oldLines, newLines, dp);
}

interface FilesApi {
  readFile?: (path: string) => Promise<{ success: boolean; content?: string }>;
  saveFile?: (path: string, content: string) => Promise<{ success: boolean; error?: string }>;
}

function getFilesApi(): FilesApi | undefined {
  return (window as unknown as { electronAPI?: { files?: FilesApi } }).electronAPI?.files;
}

function toErrorString(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function buildNewFileDiff(code: string): DiffLine[] {
  return code.split('\n').map((line, idx) => ({ type: 'add' as const, text: line, lineNo: idx + 1 }));
}

interface ApplyCodeState {
  status: ApplyCodeStatus;
  errorMessage: string | null;
  diffLines: DiffLine[];
  canRevert: boolean;
}

interface ApplyCodeRefs {
  originalContentRef: React.MutableRefObject<string | null>;
  revertTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
}

function useApplyCodeState(): ApplyCodeState & ApplyCodeRefs & {
  setStatus: (s: ApplyCodeStatus) => void;
  setErrorMessage: (e: string | null) => void;
  setDiffLines: (d: DiffLine[]) => void;
  setCanRevert: (c: boolean) => void;
} {
  const [status, setStatus] = useState<ApplyCodeStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [canRevert, setCanRevert] = useState(false);
  const originalContentRef = useRef<string | null>(null);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const timerRef = revertTimerRef;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return { status, errorMessage, diffLines, canRevert, originalContentRef, revertTimerRef, setStatus, setErrorMessage, setDiffLines, setCanRevert };
}

function useApplyAction(code: string, filePath: string | undefined, state: ReturnType<typeof useApplyCodeState>): () => Promise<void> {
  const { originalContentRef } = state;
  return useCallback(async () => {
    if (!filePath) {
      state.setStatus('error');
      state.setErrorMessage('No file path specified. Cannot apply code without a target file.');
      return;
    }
    try {
      const api = getFilesApi();
      if (!api?.readFile) { state.setStatus('error'); state.setErrorMessage('File API not available.'); return; }
      const result = await api.readFile(filePath);
      if (!result.success) {
        // eslint-disable-next-line react-compiler/react-compiler
        originalContentRef.current = '';
        state.setDiffLines(buildNewFileDiff(code));
        state.setStatus('previewing');
        return;
      }
      const currentContent = result.content ?? '';
      originalContentRef.current = currentContent;
      state.setDiffLines(computeLineDiff(currentContent, code));
      state.setStatus('previewing');
      state.setErrorMessage(null);
    } catch (err) {
      state.setStatus('error');
      state.setErrorMessage(toErrorString(err, 'Failed to read file for diff.'));
    }
  }, [code, filePath, originalContentRef, state]);
}

function useAcceptAction(code: string, filePath: string | undefined, state: ReturnType<typeof useApplyCodeState>): () => Promise<void> {
  const { revertTimerRef, originalContentRef } = state;
  return useCallback(async () => {
    if (!filePath) return;
    try {
      const api = getFilesApi();
      if (!api?.saveFile) { state.setStatus('error'); state.setErrorMessage('File save API not available.'); return; }
      const result = await api.saveFile(filePath, code);
      if (!result.success) { state.setStatus('error'); state.setErrorMessage(result.error ?? 'Failed to save file.'); return; }
      state.setStatus('applied');
      state.setDiffLines([]);
      state.setErrorMessage(null);
      state.setCanRevert(true);
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
      revertTimerRef.current = setTimeout(() => {
        state.setCanRevert(false);
        // eslint-disable-next-line react-compiler/react-compiler
        originalContentRef.current = null;
        revertTimerRef.current = null;
      }, 30_000);
    } catch (err) {
      state.setStatus('error');
      state.setErrorMessage(toErrorString(err, 'Failed to write file.'));
    }
  }, [code, filePath, originalContentRef, revertTimerRef, state]);
}

function useRevertAction(filePath: string | undefined, state: ReturnType<typeof useApplyCodeState>): () => Promise<void> {
  const { originalContentRef, revertTimerRef } = state;
  return useCallback(async () => {
    if (!filePath || originalContentRef.current === null) return;
    try {
      const api = getFilesApi();
      if (!api?.saveFile) { state.setStatus('error'); state.setErrorMessage('File save API not available.'); return; }
      const result = await api.saveFile(filePath, originalContentRef.current);
      if (!result.success) { state.setStatus('error'); state.setErrorMessage(result.error ?? 'Failed to revert file.'); return; }
      state.setStatus('idle');
      state.setCanRevert(false);
      state.setDiffLines([]);
      state.setErrorMessage(null);
      // eslint-disable-next-line react-compiler/react-compiler
      originalContentRef.current = null;
      if (revertTimerRef.current) { clearTimeout(revertTimerRef.current); revertTimerRef.current = null; }
    } catch (err) {
      state.setStatus('error');
      state.setErrorMessage(toErrorString(err, 'Failed to revert file.'));
    }
  }, [filePath, originalContentRef, revertTimerRef, state]);
}

/**
 * Hook for applying code blocks to files.
 */
export function useApplyCode(code: string, _language: string, filePath?: string): UseApplyCodeResult {
  const state = useApplyCodeState();
  const apply = useApplyAction(code, filePath, state);
  const accept = useAcceptAction(code, filePath, state);
  const revert = useRevertAction(filePath, state);
  const reject = useCallback(() => {
    state.setStatus('idle');
    state.setDiffLines([]);
    state.setErrorMessage(null);
  }, [state]);

  return { status: state.status, errorMessage: state.errorMessage, diffLines: state.diffLines, apply, accept, reject, revert, canRevert: state.canRevert };
}
