import React, { useCallback, useState } from 'react';

import { useProject } from '../../contexts/ProjectContext';
import type { DiffLine } from './AgentChatDiffPreviewSupport';
import { loadDiffPatch, parseDiffLines } from './AgentChatDiffPreviewSupport';

export interface AgentChatDiffPreviewProps {
  filePath: string;
}

function CopyIcon(): React.ReactElement {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M3 11V3a1 1 0 011-1h8" />
    </svg>
  );
}

function ExternalIcon(): React.ReactElement {
  return (
    <svg
      className="h-3 w-3"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 3H3v10h10V9" />
      <path d="M10 2h4v4" />
      <path d="M14 2L7 9" />
    </svg>
  );
}

function renderHeaderLine(line: DiffLine, index: number): React.ReactElement {
  return (
    <tr key={index}>
      <td
        colSpan={3}
        className="select-text px-2 py-0.5 text-text-semantic-muted bg-surface-raised font-semibold"
      >
        {line.text}
      </td>
    </tr>
  );
}

function renderHunkLine(line: DiffLine, index: number): React.ReactElement {
  return (
    <tr key={index}>
      <td
        colSpan={3}
        className="select-text px-2 py-0.5 text-interactive-accent"
        style={{ backgroundColor: 'var(--interactive-accent-subtle)' }}
      >
        {line.text}
      </td>
    </tr>
  );
}

function renderChangeLine(line: DiffLine, index: number): React.ReactElement {
  const bgColor =
    line.type === 'add'
      ? 'var(--diff-add-bg)'
      : 'var(--diff-del-bg)';
  const textColor = line.type === 'add' ? 'var(--status-success)' : 'var(--status-error)';
  const prefix = line.type === 'add' ? '+' : '-';
  return (
    <tr key={index} style={{ backgroundColor: bgColor }}>
      <td
        className="select-none px-1 text-right text-text-semantic-muted"
        style={{ minWidth: '2.5em', opacity: 0.5, userSelect: 'none' }}
      >
        {line.oldLineNo ?? ''}
      </td>
      <td
        className="select-none px-1 text-right text-text-semantic-muted"
        style={{
          minWidth: '2.5em',
          opacity: 0.5,
          userSelect: 'none',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {line.newLineNo ?? ''}
      </td>
      <td className="select-text whitespace-pre px-2" style={{ color: textColor }}>
        {prefix}
        {line.text}
      </td>
    </tr>
  );
}

function renderDiffLine(line: DiffLine, index: number): React.ReactElement {
  if (line.type === 'header') return renderHeaderLine(line, index);
  if (line.type === 'hunk') return renderHunkLine(line, index);
  return renderChangeLine(line, index);
}

function DiffTable({ diffLines }: { diffLines: DiffLine[] }): React.ReactElement {
  return (
    <div
      className="mt-1.5 overflow-auto rounded border border-border-semantic bg-surface-base"
      style={{
        maxHeight: '300px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
      }}
    >
      <table className="w-full border-collapse">
        <tbody>{diffLines.map(renderDiffLine)}</tbody>
      </table>
    </div>
  );
}

const DIFF_CTRL_BTN =
  'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 border border-border-semantic';

type DiffControlsProps = {
  loading: boolean;
  expanded: boolean;
  diffLines: DiffLine[] | null;
  copied: boolean;
  onFetch: () => void;
  onOpen: () => void;
  onCopy: () => void;
};

function DiffControls(props: DiffControlsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={props.onFetch}
        disabled={props.loading}
        className={`${DIFF_CTRL_BTN} text-interactive-accent`}
        style={{ backgroundColor: 'var(--interactive-accent-subtle)' }}
      >
        {props.loading ? 'Loading...' : props.expanded ? 'Hide Changes' : 'View Changes'}
      </button>
      <button
        onClick={props.onOpen}
        className={`${DIFF_CTRL_BTN} text-text-semantic-muted`}
        title="Open in Editor"
      >
        <ExternalIcon />
        Open
      </button>
      {props.diffLines !== null && (
        <button
          onClick={props.onCopy}
          className={`${DIFF_CTRL_BTN} text-text-semantic-muted`}
          title="Copy Diff"
        >
          <CopyIcon />
          {props.copied ? 'Copied!' : 'Copy Diff'}
        </button>
      )}
    </div>
  );
}

function DiffError({ error }: { error: string }): React.ReactElement {
  return (
    <div
      className="mt-1 rounded px-2 py-1 text-[10px] text-status-error"
      style={{ backgroundColor: 'var(--status-error-subtle)' }}
    >
      {error}
    </div>
  );
}

function useDiffFetch(filePath: string) {
  const { projectRoot, projectRoots } = useProject();
  const [diffLines, setDiffLines] = useState<DiffLine[] | null>(null);
  const [rawPatch, setRawPatch] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchDiff = useCallback(async () => {
    if (diffLines !== null) {
      setExpanded((prev) => !prev);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadDiffPatch(projectRoot, projectRoots, filePath);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRawPatch(result.patch ?? '');
      setDiffLines(parseDiffLines(result.patch ?? ''));
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch diff');
    } finally {
      setLoading(false);
    }
  }, [diffLines, filePath, projectRoot, projectRoots]);
  return { loading, expanded, diffLines, rawPatch, error, fetchDiff };
}

function useDiffPreview(filePath: string) {
  const { loading, expanded, diffLines, rawPatch, error, fetchDiff } = useDiffFetch(filePath);
  const [copied, setCopied] = useState(false);
  const handleOpenInEditor = useCallback(() => {
    window.dispatchEvent(new CustomEvent('agent-ide:open-file', { detail: { filePath } }));
  }, [filePath]);
  const handleCopyDiff = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawPatch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard write failed silently. */
    }
  }, [rawPatch]);
  return {
    loading,
    expanded,
    diffLines,
    copied,
    error,
    fetchDiff,
    handleOpenInEditor,
    handleCopyDiff,
  };
}

export function AgentChatDiffPreview({ filePath }: AgentChatDiffPreviewProps): React.ReactElement {
  const {
    loading,
    expanded,
    diffLines,
    copied,
    error,
    fetchDiff,
    handleOpenInEditor,
    handleCopyDiff,
  } = useDiffPreview(filePath);
  return (
    <div className="mt-1.5">
      <DiffControls
        loading={loading}
        expanded={expanded}
        diffLines={diffLines}
        copied={copied}
        onFetch={fetchDiff}
        onOpen={handleOpenInEditor}
        onCopy={handleCopyDiff}
      />
      {error && <DiffError error={error} />}
      {expanded && diffLines && diffLines.length > 0 && <DiffTable diffLines={diffLines} />}
    </div>
  );
}
