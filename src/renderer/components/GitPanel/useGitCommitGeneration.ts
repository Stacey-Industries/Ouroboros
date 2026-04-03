/**
 * useGitCommitGeneration — AI-powered commit message generation.
 *
 * Fetches staged diff + recent commits, calls ai.generateCommitMessage IPC.
 */
import { useCallback, useState } from 'react';

function fileDiffsToText(
  files: Array<{ relativePath: string; hunks: Array<{ rawPatch: string }> }>,
): string {
  return files
    .map((f) => `--- ${f.relativePath}\n${f.hunks.map((h) => h.rawPatch).join('\n')}`)
    .join('\n\n');
}

async function fetchDiffAndCommits(
  root: string,
): Promise<{ diff: string; recent?: string }> {
  const [diffRes, logRes] = await Promise.all([
    window.electronAPI.git.diffCached(root, 'HEAD'),
    window.electronAPI.git.log(root, '', 0),
  ]);
  const diff = diffRes.success && diffRes.files ? fileDiffsToText(diffRes.files) : '';
  const recent = logRes.success && logRes.commits
    ? logRes.commits.slice(0, 5).map((c) => c.message).join('\n')
    : undefined;
  return { diff, recent };
}

export function useGenerateCommitMessage(
  projectRoot: string | null,
  stagedCount: number,
  setCommitMessage: (msg: string) => void,
  setError: (err: string | null) => void,
): { isGenerating: boolean; handleGenerateCommitMessage: () => Promise<void> } {
  const [isGenerating, setIsGenerating] = useState(false);

  const generate = useCallback(async () => {
    if (!projectRoot || stagedCount === 0) return;
    setIsGenerating(true);
    try {
      const { diff, recent } = await fetchDiffAndCommits(projectRoot);
      if (!diff) { setError('No staged diff found'); return; }
      const result = await window.electronAPI.ai.generateCommitMessage({ diff, recentCommits: recent });
      if (result.success && result.message) setCommitMessage(result.message);
      else if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [projectRoot, stagedCount, setCommitMessage, setError]);

  return { isGenerating, handleGenerateCommitMessage: generate };
}
