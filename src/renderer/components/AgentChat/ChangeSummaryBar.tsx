import React, { useCallback, useMemo } from 'react';
import type { AgentChatContentBlock } from '../../types/electron';
import type { AssistantTurnBlock } from './useAgentChatStreaming';

const FILE_MODIFYING_TOOLS = new Set([
  'Write', 'Edit', 'MultiEdit', 'write_file', 'edit_file', 'multi_edit',
  'NotebookEdit', 'create_file',
]);

export interface ChangeTally {
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
}

/** Extract a change tally from streaming blocks. */
export function extractChangeTally(blocks: AssistantTurnBlock[]): ChangeTally {
  const fileSet = new Set<string>();
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const block of blocks) {
    if (block.kind !== 'tool_use') continue;
    const { tool } = block;
    if (!FILE_MODIFYING_TOOLS.has(tool.name)) continue;
    if (tool.filePath) fileSet.add(tool.filePath);
    if (tool.editSummary) {
      linesAdded += tool.editSummary.newLines;
      linesRemoved += tool.editSummary.oldLines;
    }
  }

  return { filesChanged: Array.from(fileSet), linesAdded, linesRemoved };
}

/** Extract a change tally from persisted content blocks (AgentChatContentBlock[]). */
export function extractChangeTallyFromBlocks(blocks: AgentChatContentBlock[]): ChangeTally {
  const fileSet = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'tool_use') continue;
    if (!FILE_MODIFYING_TOOLS.has(block.tool)) continue;
    if (block.filePath) fileSet.add(block.filePath);
  }
  // Persisted blocks don't carry editSummary — line counts will come from the DiffReview panel
  return { filesChanged: Array.from(fileSet), linesAdded: 0, linesRemoved: 0 };
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
  blocks: AssistantTurnBlock[];
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

/** Shows a "Review Changes" bar on completed assistant messages that made file changes. */
export function CompletedChangeSummaryBar({
  snapshotHash,
  projectRoot,
  sessionId,
  tally,
}: CompletedChangeSummaryBarProps): React.ReactElement {
  const openReview = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent('agent-ide:open-diff-review', {
        detail: { sessionId, snapshotHash, projectRoot },
      }),
    );
  }, [sessionId, snapshotHash, projectRoot]);

  return (
    <div
      className="flex items-center gap-3 rounded px-3 py-1.5 text-[11px] mt-2 cursor-pointer transition-colors duration-100"
      style={{
        backgroundColor: 'var(--bg-tertiary)',
        color: 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}
      onClick={openReview}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.color = 'var(--text)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.color = 'var(--text-muted)';
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openReview(); }}
    >
      <DiffIcon />

      {tally && tally.filesChanged.length > 0 ? (
        <>
          <span>
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
          <span style={{ color: 'var(--accent)' }}>Review Changes →</span>
        </>
      ) : (
        <span style={{ color: 'var(--accent)' }}>Review Changes →</span>
      )}
    </div>
  );
}
