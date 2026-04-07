/**
 * ChatCodeBlockParts.tsx — Sub-components for ChatCodeBlock.
 * Extracted to keep ChatCodeBlock.tsx under the 300-line limit.
 */
import React from 'react';

import type { DiffLine } from './useApplyCode';

/* ---------- Icons ---------- */

export function CopyIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function WrapIcon({ active }: { active: boolean }): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.5 }}
    >
      <path d="M3 6h18M3 12h15a3 3 0 010 6h-4" />
      <polyline points="16 16 14 18 16 20" />
    </svg>
  );
}

export function OpenFileIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/* ---------- ApplyDiffPreview ---------- */

function DiffLineList({ diffLines }: { diffLines: DiffLine[] }): React.ReactElement {
  return (
    <div
      className="overflow-auto"
      style={{
        maxHeight: '200px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        lineHeight: '1.5',
      }}
    >
      {diffLines.map((line, i) => {
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
              : 'var(--text-muted)';
        const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
        return (
          <div
            key={i}
            className="whitespace-pre px-3"
            style={{ backgroundColor: bgColor, color: textColor }}
          >
            {prefix} {line.text}
          </div>
        );
      })}
    </div>
  );
}

export function ApplyDiffPreview({
  diffLines,
  onAccept,
  onReject,
}: {
  diffLines: DiffLine[];
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  return (
    <div className="border-t border-border-semantic">
      <DiffLineList diffLines={diffLines} />
      <div className="flex items-center gap-1.5 border-t border-border-semantic px-3 py-1.5">
        <button
          onClick={onAccept}
          className="rounded border border-border-semantic px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--diff-add-bg)', color: 'var(--status-success)' }}
        >
          Accept
        </button>
        <button
          onClick={onReject}
          className="rounded border border-border-semantic px-2 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80"
          style={{ backgroundColor: 'var(--diff-del-bg)', color: 'var(--status-error)' }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}

/* ---------- FilePathBreadcrumb ---------- */

export function FilePathBreadcrumb({ filePath }: { filePath: string }): React.ReactElement {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return (
    <span className="ml-1.5 truncate text-[10px] text-text-semantic-muted opacity-70">
      {(parts.length > 3 ? ['...', ...parts.slice(-3)] : parts).join(' / ')}
    </span>
  );
}

/* ---------- CodeHeaderStatus ---------- */

export function CodeHeaderStatus({
  isApplied,
  canRevert,
  revert,
  status,
  errorMessage,
}: {
  isApplied: boolean;
  canRevert: boolean;
  revert: () => Promise<void>;
  status: string;
  errorMessage?: string;
}): React.ReactElement {
  return (
    <>
      {isApplied && (
        <span className="text-[10px] font-medium" style={{ color: 'var(--status-success)' }}>
          Applied
        </span>
      )}
      {isApplied && canRevert && (
        <button
          onClick={() => void revert()}
          className="text-[10px] underline transition-colors hover:opacity-80 text-text-semantic-muted"
        >
          Revert
        </button>
      )}
      {status === 'error' && errorMessage && (
        <span className="text-[10px] text-status-error">{errorMessage}</span>
      )}
    </>
  );
}

/* ---------- CodeHeaderToggles ---------- */

export function CodeHeaderToggles({
  showLineNumbers,
  setShowLineNumbers,
  wordWrap,
  setWordWrap,
}: {
  showLineNumbers: boolean;
  setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
  wordWrap: boolean;
  setWordWrap: React.Dispatch<React.SetStateAction<boolean>>;
}): React.ReactElement {
  return (
    <>
      <button
        onClick={() => setShowLineNumbers((value) => !value)}
        title={showLineNumbers ? 'Hide line numbers' : 'Show line numbers'}
        className={`rounded p-0.5 transition-colors hover:bg-surface-base ${showLineNumbers ? 'text-interactive-accent' : 'text-text-semantic-muted'}`}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h7" />
        </svg>
      </button>
      <button
        onClick={() => setWordWrap((value) => !value)}
        title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
        className="rounded p-0.5 transition-colors hover:bg-surface-base text-text-semantic-muted"
      >
        <WrapIcon active={wordWrap} />
      </button>
    </>
  );
}

/* ---------- CodeHeaderActions ---------- */

type CodeHeaderActionsProps = {
  showApply: boolean;
  filePath?: string;
  isApplied: boolean;
  status: string;
  apply: () => Promise<void>;
  handleOpenInEditor: () => void;
  copied: boolean;
  handleCopy: () => void;
};

function ApplyButton({
  show,
  apply,
}: {
  show: boolean;
  apply: () => Promise<void>;
}): React.ReactElement | null {
  if (!show) return null;
  return (
    <button
      onClick={() => void apply()}
      title="Apply to file"
      className="rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors hover:opacity-80 text-interactive-accent border border-border-semantic"
      style={{ backgroundColor: 'var(--interactive-accent-subtle)' }}
    >
      Apply
    </button>
  );
}

export function CodeHeaderActions(p: CodeHeaderActionsProps): React.ReactElement {
  const showApplyButton = p.showApply && !!p.filePath && !p.isApplied && p.status === 'idle';
  return (
    <>
      <ApplyButton show={showApplyButton} apply={p.apply} />
      {p.filePath && (
        <button
          onClick={p.handleOpenInEditor}
          title="Open in editor"
          className="rounded p-0.5 text-text-semantic-muted transition-colors hover:bg-surface-base hover:text-text-semantic-primary"
        >
          <OpenFileIcon />
        </button>
      )}
      <button
        onClick={p.handleCopy}
        title={p.copied ? 'Copied!' : 'Copy code'}
        className="rounded p-0.5 text-text-semantic-muted transition-colors hover:bg-surface-base hover:text-text-semantic-primary"
      >
        {p.copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      {p.copied && (
        <span className="text-[10px] font-medium" style={{ color: 'var(--status-success)' }}>
          Copied!
        </span>
      )}
    </>
  );
}
