/**
 * AgentChatToolCardSupport.tsx — Tool icons and sub-components for AgentChatToolCard.
 * Extracted to keep AgentChatToolCard.tsx under the 300-line limit.
 */
import React from 'react';

import { AgentChatDiffPreview } from './AgentChatDiffPreview';
import { formatToolActivity } from './agentChatFormatters';

type IconBuilder = { names: Set<string>; render: () => React.ReactElement };

export const TOOL_ICON_BUILDERS: IconBuilder[] = [
  {
    names: new Set(['Read', 'read_file']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 5.5h4M5 8h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['Edit', 'edit_file', 'MultiEdit', 'multi_edit']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M8.5 2l3 3-7.5 7.5H1v-3L8.5 2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['Write', 'write_file', 'create_file']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M4 1.5h6.5a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-8l1.5-2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7 5v4M5 7h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['Bash', 'execute_command']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <rect
          x="1"
          y="2"
          width="12"
          height="10"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.5 5.5l2 1.5-2 1.5M7 9h3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['Grep', 'search_files']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <circle
          cx="6"
          cy="6"
          r="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.5 9.5l3 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['Glob', 'find_files']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M1.5 3.5a1 1 0 011-1h3l1.5 1.5h5a1 1 0 011 1v6a1 1 0 01-1 1h-9.5a1 1 0 01-1-1v-6.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="8"
          cy="7.5"
          r="2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['WebSearch']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <circle
          cx="7"
          cy="7"
          r="5.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M1.5 7h11M7 1.5c-2 2-2 9 0 11M7 1.5c2 2 2 9 0 11"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['WebFetch']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M7 2v7M4 6l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 10v1.5a1 1 0 001 1h8a1 1 0 001-1V10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['TodoWrite']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <rect
          x="2"
          y="1.5"
          width="10"
          height="11"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 5l1 1 2-2M4.5 9h5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    names: new Set(['NotebookEdit']),
    render: () => (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <rect
          x="2.5"
          y="1"
          width="9"
          height="12"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 1v12M5 4.5h5M5 7.5h5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

/* ---------- Sub-components ---------- */

function SpinnerIcon(): React.ReactElement {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-interactive-accent"
      viewBox="0 0 16 16"
      fill="none"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="32"
        strokeDashoffset="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon(): React.ReactElement {
  return (
    <svg className="h-3.5 w-3.5 text-interactive-accent" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToolIcon({ name }: { name: string }): React.ReactElement {
  return (
    TOOL_ICON_BUILDERS.find((entry) => entry.names.has(name))?.render() ?? (
      <svg
        className="h-3.5 w-3.5 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M9.5 1.5a4 4 0 00-4.5 4.5L1.5 9.5 4 12l3.5-3.5a4 4 0 004.5-4.5L9.5 6.5 7 4l2.5-2.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  );
}

export function ToolHeader({
  name,
  status,
  headerDetail,
  editSummary,
  duration,
  collapsed,
  onToggle,
  ChevronIconComponent,
}: {
  name: string;
  status: 'running' | 'complete' | 'error';
  headerDetail: string | null;
  editSummary?: { oldLines: number; newLines: number };
  duration?: number;
  collapsed: boolean;
  onToggle: () => void;
  ChevronIconComponent: React.ComponentType<{ collapsed: boolean }>;
}): React.ReactElement {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80"
    >
      <ToolIcon name={name} />
      {status === 'running' ? <SpinnerIcon /> : <CheckIcon />}
      <span
        className="shrink-0 text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        {formatToolActivity(name)}
      </span>
      {headerDetail && (
        <span className="min-w-0 truncate text-[10px] ml-0.5 text-text-semantic-muted">
          {headerDetail}
        </span>
      )}
      {editSummary && (
        <span className="shrink-0 text-[10px] text-text-semantic-muted">
          <span style={{ color: 'var(--status-error)' }}>-{editSummary.oldLines}</span>
          {' / '}
          <span style={{ color: 'var(--status-success)' }}>+{editSummary.newLines}</span>
        </span>
      )}
      {duration != null && (
        <span className="shrink-0 text-[10px] text-text-semantic-muted">
          {duration < 1 ? `${Math.round(duration * 1000)}ms` : `${duration.toFixed(1)}s`}
        </span>
      )}
      <span className="flex-1" />
      <ChevronIconComponent collapsed={collapsed} />
    </button>
  );
}

export function ToolEmptyState({
  status,
}: {
  status: 'running' | 'complete' | 'error';
}): React.ReactElement {
  return (
    <div className="text-text-semantic-faint">
      {status === 'running' ? 'Running...' : 'Completed'}
    </div>
  );
}

export function ToolEditSummary({
  editSummary,
}: {
  editSummary: { oldLines: number; newLines: number };
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'var(--status-error)' }}>
        -{editSummary.oldLines} line{editSummary.oldLines === 1 ? '' : 's'}
      </span>
      <span style={{ color: 'var(--status-success)' }}>
        +{editSummary.newLines} line{editSummary.newLines === 1 ? '' : 's'}
      </span>
    </div>
  );
}

export function ToolErrorOutput({
  errorOutput,
  errorExpanded,
  onToggleErrorExpanded,
  ChevronIconComponent,
}: {
  errorOutput: string;
  errorExpanded: boolean;
  onToggleErrorExpanded: () => void;
  ChevronIconComponent: React.ComponentType<{ collapsed: boolean }>;
}): React.ReactElement {
  return (
    <div>
      <button
        onClick={onToggleErrorExpanded}
        className="flex items-center gap-1 text-[10px] font-medium text-status-error transition-colors hover:opacity-80"
      >
        <ChevronIconComponent collapsed={!errorExpanded} />
        Error Output
      </button>
      {errorExpanded && (
        <pre
          className="mt-1 max-h-[200px] overflow-auto whitespace-pre-wrap rounded p-2 text-[10px] text-status-error"
          style={{
            backgroundColor: 'rgba(248, 81, 73, 0.06)',
            border: '1px solid rgba(248, 81, 73, 0.2)',
          }}
        >
          {errorOutput}
        </pre>
      )}
    </div>
  );
}

export function hasToolDetailsContent(args: {
  filePath?: string;
  displaySummary?: string | null;
  editSummary?: { oldLines: number; newLines: number };
  showDiffPreview?: boolean;
  errorOutput?: string;
}): boolean {
  return Boolean(
    args.filePath ||
    args.displaySummary ||
    args.editSummary ||
    args.showDiffPreview ||
    args.errorOutput,
  );
}

interface ToolDetailsProps {
  filePath?: string;
  displaySummary: string | null;
  editSummary?: { oldLines: number; newLines: number };
  showDiffPreview: boolean;
  errorOutput?: string;
  status: 'running' | 'complete' | 'error';
  errorExpanded: boolean;
  onToggleErrorExpanded: () => void;
  ChevronIconComponent: React.ComponentType<{ collapsed: boolean }>;
}

export function ToolDetails({
  filePath,
  displaySummary,
  editSummary,
  showDiffPreview,
  errorOutput,
  status,
  errorExpanded,
  onToggleErrorExpanded,
  ChevronIconComponent,
}: ToolDetailsProps): React.ReactElement {
  const hasContent = hasToolDetailsContent({
    filePath,
    displaySummary,
    editSummary,
    showDiffPreview,
    errorOutput,
  });
  return (
    <div
      className="space-y-1 border-t border-border-semantic px-2.5 py-2 text-[11px] text-text-semantic-muted"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {filePath && (
        <div className="truncate">
          <span className="text-text-semantic-faint">path </span>
          <span className="text-text-semantic-primary">{filePath}</span>
        </div>
      )}
      {displaySummary && (
        <pre
          className="max-h-[120px] overflow-auto whitespace-pre-wrap rounded p-1.5 bg-surface-base text-text-semantic-primary"
          style={{ fontSize: '10px' }}
        >
          {displaySummary}
        </pre>
      )}
      {editSummary && <ToolEditSummary editSummary={editSummary} />}
      {showDiffPreview && filePath && <AgentChatDiffPreview filePath={filePath} />}
      {!hasContent && <ToolEmptyState status={status} />}
      {errorOutput && (
        <ToolErrorOutput
          errorOutput={errorOutput}
          errorExpanded={errorExpanded}
          onToggleErrorExpanded={onToggleErrorExpanded}
          ChevronIconComponent={ChevronIconComponent}
        />
      )}
    </div>
  );
}
