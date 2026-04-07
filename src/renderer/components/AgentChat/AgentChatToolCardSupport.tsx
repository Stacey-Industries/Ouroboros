/**
 * AgentChatToolCardSupport.tsx — Tool icons and sub-components for AgentChatToolCard.
 * Extracted to keep AgentChatToolCard.tsx under the 300-line limit.
 */
import React from 'react';

import { AgentChatDiffPreview } from './AgentChatDiffPreview';
import { formatToolActivity } from './agentChatFormatters';
import { TOOL_ICON_BUILDERS } from './AgentChatToolIcons';

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

type ToolHeaderProps = {
  name: string;
  status: 'running' | 'complete' | 'error';
  headerDetail: string | null;
  editSummary?: { oldLines: number; newLines: number };
  duration?: number;
  collapsed: boolean;
  onToggle: () => void;
  ChevronIconComponent: React.ComponentType<{ collapsed: boolean }>;
};

function ToolHeaderMeta({
  editSummary,
  duration,
}: Pick<ToolHeaderProps, 'editSummary' | 'duration'>): React.ReactElement {
  return (
    <>
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
    </>
  );
}

export function ToolHeader(props: ToolHeaderProps): React.ReactElement {
  return (
    <button
      onClick={props.onToggle}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-100 hover:opacity-80"
    >
      <ToolIcon name={props.name} />
      {props.status === 'running' ? <SpinnerIcon /> : <CheckIcon />}
      <span
        className="shrink-0 text-text-semantic-primary"
        style={{ fontFamily: 'var(--font-ui)' }}
      >
        {formatToolActivity(props.name)}
      </span>
      {props.headerDetail && (
        <span className="min-w-0 truncate text-[10px] ml-0.5 text-text-semantic-muted">
          {props.headerDetail}
        </span>
      )}
      <ToolHeaderMeta editSummary={props.editSummary} duration={props.duration} />
      <span className="flex-1" />
      <props.ChevronIconComponent collapsed={props.collapsed} />
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
            backgroundColor: 'var(--status-error-subtle)',
            border: '1px solid var(--diff-del-border)',
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
  toolOutput?: string;
}): boolean {
  return Boolean(
    args.filePath ||
    args.displaySummary ||
    args.editSummary ||
    args.showDiffPreview ||
    args.errorOutput ||
    args.toolOutput,
  );
}

interface ToolDetailsProps {
  filePath?: string;
  displaySummary: string | null;
  editSummary?: { oldLines: number; newLines: number };
  showDiffPreview: boolean;
  errorOutput?: string;
  /** General tool result output (from stream-json tool_result). */
  toolOutput?: string;
  status: 'running' | 'complete' | 'error';
  errorExpanded: boolean;
  onToggleErrorExpanded: () => void;
  ChevronIconComponent: React.ComponentType<{ collapsed: boolean }>;
}

function ToolOutputPreview({ output }: { output: string }): React.ReactElement {
  return (
    <pre
      className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded p-1.5 bg-surface-base text-text-semantic-muted"
      style={{ fontSize: '10px' }}
    >
      {output}
    </pre>
  );
}

function ToolDetailsContent(props: ToolDetailsProps): React.ReactElement {
  const hasContent = hasToolDetailsContent(props);
  return (
    <>
      {props.filePath && (
        <div className="truncate">
          <span className="text-text-semantic-faint">path </span>
          <span className="text-text-semantic-primary">{props.filePath}</span>
        </div>
      )}
      {props.displaySummary && (
        <pre
          className="max-h-[120px] overflow-auto whitespace-pre-wrap rounded p-1.5 bg-surface-base text-text-semantic-primary"
          style={{ fontSize: '10px' }}
        >
          {props.displaySummary}
        </pre>
      )}
      {props.editSummary && <ToolEditSummary editSummary={props.editSummary} />}
      {props.showDiffPreview && props.filePath && (
        <AgentChatDiffPreview filePath={props.filePath} />
      )}
      {props.toolOutput && <ToolOutputPreview output={props.toolOutput} />}
      {!hasContent && <ToolEmptyState status={props.status} />}
      {props.errorOutput && (
        <ToolErrorOutput
          errorOutput={props.errorOutput}
          errorExpanded={props.errorExpanded}
          onToggleErrorExpanded={props.onToggleErrorExpanded}
          ChevronIconComponent={props.ChevronIconComponent}
        />
      )}
    </>
  );
}

export function ToolDetails(props: ToolDetailsProps): React.ReactElement {
  return (
    <div
      className="space-y-1 border-t border-border-semantic px-2.5 py-2 text-[11px] text-text-semantic-muted"
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      <ToolDetailsContent {...props} />
    </div>
  );
}
