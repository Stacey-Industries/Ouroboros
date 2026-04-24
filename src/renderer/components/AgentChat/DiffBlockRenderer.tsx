/**
 * DiffBlockRenderer.tsx — Rich unified diff display with per-hunk accept/reject.
 * Replaces the bare <pre> stub in AgentChatBlockRenderer for 'diff' blocks.
 */
import React, { useState } from 'react';

import type { AgentChatContentBlock } from '../../types/electron';
import { DiffBadge } from './AgentChatDiffReviewParts';
import { HunkLines } from './DiffBlockRendererParts';
import type { DiffHunk, HunkStatus } from './useDiffBlock';
import { useDiffBlock } from './useDiffBlock';

/* ---------- Sub-components ---------- */

function HunkStatusBadge({ status }: { status: HunkStatus }): React.ReactElement {
  if (status === 'accepted')
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'var(--diff-add-bg)', color: 'var(--status-success)' }}
      >
        Applied ✓
      </span>
    );
  if (status === 'rejected')
    return (
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
        style={{ backgroundColor: 'var(--diff-del-bg)', color: 'var(--status-error)' }}
      >
        Rejected
      </span>
    );
  return <></>;
}

interface HunkActionsProps {
  onAccept: () => void;
  onReject: () => void;
}

function HunkActions({ onAccept, onReject }: HunkActionsProps): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-1 pl-2">
      <button
        onClick={onAccept}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-add-bg)',
          color: 'var(--status-success)',
          border: '1px solid var(--diff-add-border)',
        }}
      >
        Accept
      </button>
      <button
        onClick={onReject}
        className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-del-bg)',
          color: 'var(--status-error)',
          border: '1px solid var(--diff-del-border)',
        }}
      >
        Reject
      </button>
    </div>
  );
}

/* ---------- Single hunk row ---------- */

interface HunkRowProps {
  hunk: DiffHunk;
  index: number;
  status: HunkStatus;
  onAccept: () => void;
  onReject: () => void;
}

function HunkRow({ hunk, index, status, onAccept, onReject }: HunkRowProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const dimmed = status === 'rejected';

  return (
    <div
      className="group relative"
      style={{ opacity: dimmed ? 0.5 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <table
            className="w-full border-collapse"
            style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.5' }}
          >
            <tbody>
              <HunkLines hunkRaw={hunk.raw} />
            </tbody>
          </table>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
          <HunkStatusBadge status={status} />
          {hovered && status === 'pending' && (
            <HunkActions onAccept={onAccept} onReject={onReject} />
          )}
        </div>
      </div>
      {index > 0 && <div className="border-t border-border-semantic" />}
    </div>
  );
}

/* ---------- Header ---------- */

interface DiffHeaderProps {
  filePath: string;
  additions: number;
  deletions: number;
  pendingCount: number;
  onAcceptAll: () => void;
  onRejectAll: () => void;
}

function DiffHeaderBulkActions({
  onAcceptAll,
  onRejectAll,
}: {
  onAcceptAll: () => void;
  onRejectAll: () => void;
}): React.ReactElement {
  return (
    <>
      <button
        onClick={onAcceptAll}
        className="rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-add-bg)',
          color: 'var(--status-success)',
          border: '1px solid var(--diff-add-border)',
        }}
      >
        Accept All
      </button>
      <button
        onClick={onRejectAll}
        className="rounded px-2 py-0.5 text-[10px] font-medium hover:opacity-80"
        style={{
          backgroundColor: 'var(--diff-del-bg)',
          color: 'var(--status-error)',
          border: '1px solid var(--diff-del-border)',
        }}
      >
        Reject All
      </button>
    </>
  );
}

function DiffHeader({
  filePath,
  additions,
  deletions,
  pendingCount,
  onAcceptAll,
  onRejectAll,
}: DiffHeaderProps): React.ReactElement {
  const shortPath = filePath.replace(/\\/g, '/').split('/').slice(-3).join('/');
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-semantic px-3 py-2">
      <span
        className="truncate font-medium text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
      >
        {shortPath}
      </span>
      <DiffBadge additions={additions} deletions={deletions} />
      <span className="flex-1" />
      {pendingCount > 0 && (
        <DiffHeaderBulkActions onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} />
      )}
    </div>
  );
}

/* ---------- Main export ---------- */

interface DiffBlockRendererProps {
  block: AgentChatContentBlock & { kind: 'diff' };
}

function HunkList({
  hunks,
  hunkStatuses,
  rawHunks,
  acceptHunk,
  rejectHunk,
}: {
  hunks: DiffHunk[];
  hunkStatuses: Map<number, HunkStatus>;
  rawHunks: string;
  acceptHunk: (i: number) => void;
  rejectHunk: (i: number) => void;
}): React.ReactElement {
  if (hunks.length === 0)
    return (
      <pre
        className="whitespace-pre-wrap px-3 py-2 text-[11px] text-text-semantic-muted"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {rawHunks}
      </pre>
    );
  return (
    <>
      {hunks.map((hunk, i) => (
        <HunkRow
          key={i}
          hunk={hunk}
          index={i}
          status={hunkStatuses.get(i) ?? 'pending'}
          onAccept={() => acceptHunk(i)}
          onReject={() => rejectHunk(i)}
        />
      ))}
    </>
  );
}

export function DiffBlockRenderer({ block }: DiffBlockRendererProps): React.ReactElement | null {
  const { hunks, hunkStatuses, additions, deletions, acceptHunk, rejectHunk, acceptAll, rejectAll, applyError } = useDiffBlock(block.hunks ?? '', block.filePath ?? '');
  if (!block.hunks) return null;
  const pendingCount = [...hunkStatuses.values()].filter((s) => s === 'pending').length;
  return (
    <div className="my-1.5 overflow-hidden rounded-md border border-border-semantic bg-surface-raised text-xs">
      <DiffHeader filePath={block.filePath} additions={additions} deletions={deletions} pendingCount={pendingCount} onAcceptAll={acceptAll} onRejectAll={rejectAll} />
      {applyError && (
        <div className="border-b border-border-semantic bg-status-error-subtle px-3 py-1.5 text-[11px] text-status-error">
          {applyError}
        </div>
      )}
      <div className="max-h-[500px] overflow-y-auto">
        <HunkList hunks={hunks} hunkStatuses={hunkStatuses} rawHunks={block.hunks} acceptHunk={acceptHunk} rejectHunk={rejectHunk} />
      </div>
    </div>
  );
}
