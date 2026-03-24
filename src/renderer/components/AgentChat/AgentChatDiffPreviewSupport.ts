/**
 * AgentChatDiffPreviewSupport.ts — Parsing helpers for AgentChatDiffPreview.
 * Extracted to keep AgentChatDiffPreview.tsx under the 300-line limit.
 */

export interface DiffLine {
  type: 'header' | 'hunk' | 'add' | 'del' | 'context';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export function parseDiffLines(patch: string): DiffLine[] {
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++')
    ) {
      result.push({ type: 'header', text: raw });
      continue;
    }
    const hunkMatch = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      result.push({ type: 'hunk', text: raw });
      continue;
    }
    if (raw.startsWith('+')) {
      result.push({ type: 'add', text: raw.slice(1), newLineNo: newLine++ });
    } else if (raw.startsWith('-')) {
      result.push({ type: 'del', text: raw.slice(1), oldLineNo: oldLine++ });
    } else if (raw.startsWith(' ')) {
      result.push({
        type: 'context',
        text: raw.slice(1),
        oldLineNo: oldLine++,
        newLineNo: newLine++,
      });
    }
  }

  return result;
}

export function resolveProjectRoot(
  projectRoots: string[],
  projectRoot: string | null,
  filePath: string,
): string | null {
  if (projectRoot && filePath.startsWith(projectRoot)) return projectRoot;
  const candidate = projectRoots.find((root) => filePath.startsWith(root));
  return candidate ?? projectRoot ?? null;
}

export async function loadDiffPatch(
  projectRoot: string | null,
  projectRoots: string[],
  filePath: string,
): Promise<{ error?: string; patch?: string }> {
  const resolvedProjectRoot = resolveProjectRoot(projectRoots, projectRoot, filePath);
  if (!resolvedProjectRoot) return { error: 'Unable to resolve the project root for this file' };
  const result = await window.electronAPI.git.diffRaw(resolvedProjectRoot, filePath);
  if (!result.success) return { error: result.error ?? 'Failed to get diff' };
  const patch = result.patch ?? '';
  if (!patch.trim()) return { error: 'No changes detected (file may not be tracked by git)' };
  return { patch };
}
