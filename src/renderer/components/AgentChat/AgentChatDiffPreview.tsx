import React, { useState, useCallback } from 'react';

export interface AgentChatDiffPreviewProps {
  filePath: string;
}

interface DiffLine {
  type: 'header' | 'hunk' | 'add' | 'del' | 'context';
  text: string;
  oldLineNo?: number;
  newLineNo?: number;
}

function parseDiffLines(patch: string): DiffLine[] {
  const rawLines = patch.split('\n');
  const result: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of rawLines) {
    if (raw.startsWith('diff --git') || raw.startsWith('index ') || raw.startsWith('---') || raw.startsWith('+++')) {
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
      result.push({ type: 'add', text: raw.slice(1), newLineNo: newLine });
      newLine++;
    } else if (raw.startsWith('-')) {
      result.push({ type: 'del', text: raw.slice(1), oldLineNo: oldLine });
      oldLine++;
    } else if (raw.startsWith(' ')) {
      result.push({ type: 'context', text: raw.slice(1), oldLineNo: oldLine, newLineNo: newLine });
      oldLine++;
      newLine++;
    }
    // Skip 'No newline at end of file' marker and empty trailing lines
  }

  return result;
}

function CopyIcon(): React.ReactElement {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M3 11V3a1 1 0 011-1h8" />
    </svg>
  );
}

function ExternalIcon(): React.ReactElement {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3H3v10h10V9" />
      <path d="M10 2h4v4" />
      <path d="M14 2L7 9" />
    </svg>
  );
}

export function AgentChatDiffPreview({ filePath }: AgentChatDiffPreviewProps): React.ReactElement {
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [rawPatch, setRawPatch] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchDiff = useCallback(async () => {
    if (diffLines !== null) {
      setExpanded((prev) => !prev);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const api = (window as unknown as { electronAPI: { git: { diffRaw: (root: string, filePath: string) => Promise<{ success: boolean; patch?: string; error?: string }> } } }).electronAPI;

      // Derive project root from file path - walk up to find .git
      // For simplicity, use the first segment that looks like a project root
      // In practice, the renderer usually knows the project root from context
      const projectRoot = await getProjectRoot();
      const result = await api.git.diffRaw(projectRoot, filePath);

      if (!result.success) {
        setError(result.error ?? 'Failed to get diff');
        setLoading(false);
        return;
      }

      const patch = result.patch ?? '';
      if (!patch.trim()) {
        setError('No changes detected (file may not be tracked by git)');
        setLoading(false);
        return;
      }

      setRawPatch(patch);
      setDiffLines(parseDiffLines(patch));
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch diff');
    } finally {
      setLoading(false);
    }
  }, [diffLines, filePath]);

  const handleOpenInEditor = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-file', { detail: { filePath } })
    );
  }, [filePath]);

  const handleCopyDiff = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawPatch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  }, [rawPatch]);

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={fetchDiff}
          disabled={loading}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{
            backgroundColor: 'rgba(100, 100, 255, 0.1)',
            color: 'var(--accent)',
            border: '1px solid var(--border)',
          }}
        >
          {loading ? 'Loading...' : expanded ? 'Hide Changes' : 'View Changes'}
        </button>

        <button
          onClick={handleOpenInEditor}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
          title="Open in Editor"
        >
          <ExternalIcon />
          Open
        </button>

        {diffLines !== null && (
          <button
            onClick={handleCopyDiff}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
            style={{
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}
            title="Copy Diff"
          >
            <CopyIcon />
            {copied ? 'Copied!' : 'Copy Diff'}
          </button>
        )}
      </div>

      {error && (
        <div
          className="mt-1 rounded px-2 py-1 text-[10px]"
          style={{ color: 'var(--error, #f85149)', backgroundColor: 'rgba(248, 81, 73, 0.08)' }}
        >
          {error}
        </div>
      )}

      {expanded && diffLines && diffLines.length > 0 && (
        <div
          className="mt-1.5 overflow-auto rounded border"
          style={{
            maxHeight: '300px',
            borderColor: 'var(--border)',
            backgroundColor: 'var(--bg)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            lineHeight: '1.5',
          }}
        >
          <table className="w-full border-collapse">
            <tbody>
              {diffLines.map((line, i) => {
                if (line.type === 'header') {
                  return (
                    <tr key={i}>
                      <td
                        colSpan={3}
                        className="px-2 py-0.5 select-text"
                        style={{
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-tertiary)',
                          fontWeight: 600,
                        }}
                      >
                        {line.text}
                      </td>
                    </tr>
                  );
                }

                if (line.type === 'hunk') {
                  return (
                    <tr key={i}>
                      <td
                        colSpan={3}
                        className="px-2 py-0.5 select-text"
                        style={{
                          color: 'var(--accent)',
                          backgroundColor: 'rgba(100, 100, 255, 0.06)',
                        }}
                      >
                        {line.text}
                      </td>
                    </tr>
                  );
                }

                const bgColor =
                  line.type === 'add'
                    ? 'var(--diff-add-bg, rgba(46, 160, 67, 0.15))'
                    : line.type === 'del'
                      ? 'var(--diff-del-bg, rgba(248, 81, 73, 0.15))'
                      : 'transparent';

                const textColor =
                  line.type === 'add'
                    ? 'var(--diff-add, #2ea043)'
                    : line.type === 'del'
                      ? 'var(--diff-del, #f85149)'
                      : 'var(--text)';

                const prefix =
                  line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';

                return (
                  <tr key={i} style={{ backgroundColor: bgColor }}>
                    <td
                      className="select-none px-1 text-right"
                      style={{
                        color: 'var(--text-muted)',
                        minWidth: '2.5em',
                        opacity: 0.5,
                        userSelect: 'none',
                      }}
                    >
                      {line.oldLineNo ?? ''}
                    </td>
                    <td
                      className="select-none px-1 text-right"
                      style={{
                        color: 'var(--text-muted)',
                        minWidth: '2.5em',
                        opacity: 0.5,
                        userSelect: 'none',
                        borderRight: '1px solid var(--border)',
                      }}
                    >
                      {line.newLineNo ?? ''}
                    </td>
                    <td
                      className="whitespace-pre px-2 select-text"
                      style={{ color: textColor }}
                    >
                      {prefix}{line.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Retrieve the project root from the DOM-based project context or fallback. */
function getProjectRoot(): Promise<string> {
  // The project root is typically stored in a DOM data attribute or context.
  // Try reading from the common pattern used in this app.
  const el = document.querySelector('[data-project-root]');
  if (el) {
    return Promise.resolve(el.getAttribute('data-project-root')!);
  }

  // Fallback: try to derive from the file path by finding a common workspace root
  // In Electron apps, we can ask the config for the project root
  const api = (window as unknown as { electronAPI: { config: { get: (key: string) => Promise<unknown> } } }).electronAPI;
  return api.config.get('projectRoot') as Promise<string>;
}
