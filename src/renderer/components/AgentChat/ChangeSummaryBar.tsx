import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron';

const FILE_MODIFYING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'write_file', 'edit_file', 'multi_edit',
  'NotebookEdit', 'create_file',
]);

export interface ChangeTally {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
}

/** Extract a change tally from streaming blocks (uses unified AgentChatContentBlock). */
export function extractChangeTally(blocks: AgentChatContentBlock[]): ChangeTally {
  const fileSet = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const block of blocks) {
    if (block.kind !== 'tool_use') continue;
    if (!FILE_MODIFYING_TOOLS.has(block.tool)) continue;
    if (block.filePath) fileSet.add(block.filePath);
    if (block.editSummary) {
      linesAdded += block.editSummary.newLines;
      linesRemoved += block.editSummary.oldLines;
    }
  }

  return { filesChanged: Array.from(fileSet), linesAdded, linesRemoved };
}

/** Extract a change tally from persisted content blocks (AgentChatContentBlock[]). */
export function extractChangeTallyFromBlocks(blocks: AgentChatContentBlock[]): ChangeTally {
  const fileSet = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const block of blocks) {
    if (block.kind !== 'tool_use') continue;
    if (!FILE_MODIFYING_TOOLS.has(block.tool)) continue;
    if (block.filePath) fileSet.add(block.filePath);
    if (block.editSummary) {
      linesAdded += block.editSummary.newLines;
      linesRemoved += block.editSummary.oldLines;
    }
  }
  return { filesChanged: Array.from(fileSet), linesAdded, linesRemoved };
}

/** Returns true if the message has file-modifying tool blocks worth reviewing. */
export function hasFileChanges(blocks: AgentChatContentBlock[]): boolean {
  return blocks.some((b) => b.kind === 'tool_use' && FILE_MODIFYING_TOOLS.has(b.tool) && b.filePath);
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function FileIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function DiffIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}

/* ─── Bar variants ──────────────────────────────────────────────────────── */

export interface StreamingChangeSummaryBarProps {
  blocks: AgentChatContentBlock[];
  isStreaming: boolean;
}

/** Shows a live tally of file changes during agent streaming. */
export function StreamingChangeSummaryBar({
  blocks,
  isStreaming,
}: StreamingChangeSummaryBarProps): React.ReactElement | null {
  const tally = useMemo(() => extractChangeTally(blocks), [blocks]);

  if (tally.filesChanged.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 rounded px-3 py-1.5 text-[11px] mt-2 ml-7"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Pulsing dot while streaming */}
      {isStreaming && (
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: 'var(--accent)',
            animation: 'agent-chat-tally-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}

      <span className="flex items-center gap-1">
        <FileIcon />
        {tally.filesChanged.length} file{tally.filesChanged.length !== 1 ? 's' : ''} changed
      </span>

      {(tally.linesAdded > 0 || tally.linesRemoved > 0) && (
        <span className="flex items-center gap-1.5">
          {tally.linesAdded > 0 && (
            <span style={{ color: 'var(--success, #3fb950)' }}>+{tally.linesAdded}</span>
          )}
          {tally.linesRemoved > 0 && (
            <span style={{ color: 'var(--error, #f85149)' }}>-{tally.linesRemoved}</span>
          )}
        </span>
      )}
    </div>
  );
}

export interface CompletedChangeSummaryBarProps {
  /** The pre-snapshot hash from the assistant message's orchestration link. */
  snapshotHash: string;
  /** The thread's workspace root (project directory). */
  projectRoot: string;
  /** A unique ID for this review session (typically the message ID). */
  sessionId: string;
  /** Change tally from persisted message blocks (optional — shows inline stats). */
  tally?: ChangeTally;
}

/* ─── Chevron ────────────────────────────────────────────────────────────── */

function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      className={`h-3 w-3 shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

/* ─── Inline diff for a single file ──────────────────────────────────────── */

interface DiffLine {
  prefix: string;
  content: string;
  type: 'add' | 'remove' | 'context' | 'header';
}

function parsePatchLines(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      lines.push({ prefix: '', content: raw, type: 'header' });
    } else if (raw.startsWith('+')) {
      lines.push({ prefix: '+', content: raw.slice(1), type: 'add' });
    } else if (raw.startsWith('-')) {
      lines.push({ prefix: '-', content: raw.slice(1), type: 'remove' });
    } else {
      lines.push({ prefix: ' ', content: raw.startsWith(' ') ? raw.slice(1) : raw, type: 'context' });
    }
  }
  return lines;
}

const diffLineColors: Record<DiffLine['type'], React.CSSProperties> = {
  add: { backgroundColor: 'rgba(63, 185, 80, 0.1)', color: 'var(--success, #3fb950)' },
  remove: { backgroundColor: 'rgba(248, 81, 73, 0.1)', color: 'var(--error, #f85149)' },
  context: { color: 'var(--text-muted)' },
  header: { color: 'var(--accent)', fontWeight: 600 },
};

function InlineDiffViewer({ filePath, projectRoot }: { filePath: string; projectRoot: string }): React.ReactElement {
  const [patch, setPatch] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const result = await window.electronAPI.git.diffRaw(projectRoot, filePath);
        if (active) setPatch(result.patch ?? '');
      } catch {
        if (active) setPatch('');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [filePath, projectRoot]);

  if (loading) {
    return <div className="px-3 py-2 text-[10px] italic" style={{ color: 'var(--text-faint)' }}>Loading diff...</div>;
  }

  if (!patch) {
    return <div className="px-3 py-2 text-[10px] italic" style={{ color: 'var(--text-faint)' }}>No changes (file matches HEAD)</div>;
  }

  const lines = parsePatchLines(patch);

  return (
    <div
      className="overflow-auto text-[11px] leading-[1.5]"
      style={{ maxHeight: '300px', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border-muted)' }}
    >
      {lines.map((line, i) => (
        <div key={i} className="px-3 py-0" style={diffLineColors[line.type]}>
          <span className="select-none opacity-40 inline-block w-3">{line.prefix}</span>
          {line.content}
        </div>
      ))}
    </div>
  );
}

/* ─── File row in expanded list ──────────────────────────────────────────── */

function shortenPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return parts.join('/');
  return `.../${parts.slice(-3).join('/')}`;
}

function FileChangeRow({
  filePath,
  isSelected,
  onClick,
}: {
  filePath: string;
  isSelected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1 text-[11px] text-left transition-colors"
      style={{
        backgroundColor: isSelected ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
        color: isSelected ? 'var(--text)' : 'var(--text-muted)',
        borderBottom: '1px solid var(--border-muted)',
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        border: 'none',
      }}
    >
      <FileIcon />
      <span className="truncate">{shortenPath(filePath)}</span>
      <svg
        className={`ml-auto h-3 w-3 shrink-0 transition-transform duration-150 ${isSelected ? 'rotate-90' : ''}`}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.5 }}
      >
        <path d="M6 4l4 4-4 4" />
      </svg>
    </button>
  );
}

/* ─── CompletedChangeSummaryBar (enhanced with expandable file list) ────── */

/** Shows a "Review Changes" bar on completed assistant messages that made file changes. */
export function CompletedChangeSummaryBar({
  snapshotHash,
  projectRoot,
  sessionId,
  tally,
}: CompletedChangeSummaryBarProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const openFullReview = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-diff-review', {
        detail: { sessionId, snapshotHash, projectRoot },
      }),
    );
  }, [sessionId, snapshotHash, projectRoot]);

  const fileCount = tally?.filesChanged.length ?? 0;

  return (
    <div
      className="rounded mt-2 overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {/* Expand toggle (only when we have files) */}
        {fileCount > 0 && (
          <button
            onClick={() => { setExpanded(!expanded); if (expanded) setSelectedFile(null); }}
            className="flex items-center gap-1 shrink-0"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        )}

        <DiffIcon />

        {fileCount > 0 ? (
          <span>
            {fileCount} file{fileCount !== 1 ? 's' : ''} changed
          </span>
        ) : (
          <span>Changes</span>
        )}

        {tally && (tally.linesAdded > 0 || tally.linesRemoved > 0) && (
          <span className="flex items-center gap-1.5">
            {tally.linesAdded > 0 && (
              <span style={{ color: 'var(--success, #3fb950)' }}>+{tally.linesAdded}</span>
            )}
            {tally.linesRemoved > 0 && (
              <span style={{ color: 'var(--error, #f85149)' }}>-{tally.linesRemoved}</span>
            )}
          </span>
        )}

        <button
          onClick={openFullReview}
          className="ml-auto shrink-0 text-[10px] font-medium"
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0 }}
        >
          Full Review →
        </button>
      </div>

      {/* Expanded file list */}
      {expanded && tally && tally.filesChanged.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {tally.filesChanged.map((file) => (
            <React.Fragment key={file}>
              <FileChangeRow
                filePath={file}
                isSelected={selectedFile === file}
                onClick={() => setSelectedFile(selectedFile === file ? null : file)}
              />
              {selectedFile === file && (
                <InlineDiffViewer filePath={file} projectRoot={projectRoot} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
