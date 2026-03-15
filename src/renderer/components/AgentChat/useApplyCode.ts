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

/**
 * Computes a simple line-based diff between two strings.
 * Produces add/del/context lines for visual preview.
 */
function computeLineDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff for reasonable-sized content
  const maxLen = Math.max(oldLines.length, newLines.length);

  // For files under 2000 lines, use a basic O(n*m) LCS approach
  // For larger files, fall back to a line-by-line comparison
  if (maxLen > 2000) {
    // Simple sequential comparison for large files
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

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  const diffItems: DiffLine[] = [];
  let i = m;
  let j = n;

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
 * Hook for applying code blocks to files.
 *
 * Reads the target file, computes a diff preview, and allows accepting
 * (writing the new content) or rejecting (discarding the diff).
 * After acceptance, a 30-second revert window is available.
 */
export function useApplyCode(
  code: string,
  _language: string,
  filePath?: string,
): UseApplyCodeResult {
  const [status, setStatus] = useState<ApplyCodeStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [canRevert, setCanRevert] = useState(false);

  const originalContentRef = useRef<string | null>(null);
  const revertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up revert timer on unmount
  useEffect(() => {
    return () => {
      if (revertTimerRef.current) clearTimeout(revertTimerRef.current);
    };
  }, []);

  const apply = useCallback(async () => {
    if (!filePath) {
      setStatus('error');
      setErrorMessage('No file path specified. Cannot apply code without a target file.');
      return;
    }

    try {
      const api = (window as any).electronAPI?.files;
      if (!api?.readFile) {
        setStatus('error');
        setErrorMessage('File API not available.');
        return;
      }

      const result = await api.readFile(filePath);
      if (!result.success) {
        // File might not exist yet - treat code as entirely new
        originalContentRef.current = '';
        const newLines = code.split('\n');
        setDiffLines(newLines.map((line, idx) => ({ type: 'add' as const, text: line, lineNo: idx + 1 })));
        setStatus('previewing');
        return;
      }

      const currentContent = result.content ?? '';
      originalContentRef.current = currentContent;

      const diff = computeLineDiff(currentContent, code);
      setDiffLines(diff);
      setStatus('previewing');
      setErrorMessage(null);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to read file for diff.');
    }
  }, [code, filePath]);

  const accept = useCallback(async () => {
    if (!filePath) return;

    try {
      const api = (window as any).electronAPI?.files;
      if (!api?.saveFile) {
        setStatus('error');
        setErrorMessage('File save API not available.');
        return;
      }

      const result = await api.saveFile(filePath, code);
      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error ?? 'Failed to save file.');
        return;
      }

      setStatus('applied');
      setDiffLines([]);
      setErrorMessage(null);
      setCanRevert(true);

      // Clear any existing revert timer
      if (revertTimerRef.current) {
        clearTimeout(revertTimerRef.current);
      }

      // Allow revert for 30 seconds
      revertTimerRef.current = setTimeout(() => {
        setCanRevert(false);
        originalContentRef.current = null;
        revertTimerRef.current = null;
      }, 30_000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to write file.');
    }
  }, [code, filePath]);

  const reject = useCallback(() => {
    setStatus('idle');
    setDiffLines([]);
    setErrorMessage(null);
  }, []);

  const revert = useCallback(async () => {
    if (!filePath || originalContentRef.current === null) return;

    try {
      const api = (window as any).electronAPI?.files;
      if (!api?.saveFile) {
        setStatus('error');
        setErrorMessage('File save API not available.');
        return;
      }

      const result = await api.saveFile(filePath, originalContentRef.current);
      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error ?? 'Failed to revert file.');
        return;
      }

      setStatus('idle');
      setCanRevert(false);
      setDiffLines([]);
      setErrorMessage(null);
      originalContentRef.current = null;

      if (revertTimerRef.current) {
        clearTimeout(revertTimerRef.current);
        revertTimerRef.current = null;
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to revert file.');
    }
  }, [filePath]);

  return { status, errorMessage, diffLines, apply, accept, reject, revert, canRevert };
}
