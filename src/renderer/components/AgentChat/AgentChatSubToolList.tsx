/**
 * AgentChatSubToolList.tsx — Compact list of subagent tool calls nested inside
 * an Agent tool card. Shows tool name, status, file path, and input summary.
 */
import type { AgentChatSubToolActivity } from '@shared/types/agentChat';
import React from 'react';

import { formatToolActivity } from './agentChatFormatters';
import { TOOL_ICON_BUILDERS } from './AgentChatToolIcons';

/* ---------- Helpers ---------- */

function shortenPath(filePath: string): string {
  const segments = filePath.replace(/\\/g, '/').split('/');
  return segments.length > 2 ? segments.slice(-2).join('/') : filePath;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}

/* ---------- Sub-components ---------- */

function SubToolStatusIcon({ status }: { status: AgentChatSubToolActivity['status'] }): React.ReactElement {
  if (status === 'running') {
    return (
      <svg
        className="h-3 w-3 shrink-0 animate-spin text-interactive-accent"
        viewBox="0 0 16 16"
        fill="none"
      >
        <circle
          cx="8" cy="8" r="6.5"
          stroke="currentColor" strokeWidth="1.5"
          strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round"
        />
      </svg>
    );
  }

  if (status === 'error') {
    return (
      <svg className="h-3 w-3 shrink-0 text-status-error" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 4l8 8M12 4l-8 8"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg className="h-3 w-3 shrink-0 text-interactive-accent" viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 8.5L6.5 11.5L12.5 4.5"
        stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function SubToolIcon({ name }: { name: string }): React.ReactElement {
  return (
    TOOL_ICON_BUILDERS.find((entry) => entry.names.has(name))?.render() ?? (
      <svg
        className="h-3 w-3 shrink-0 text-text-semantic-muted"
        viewBox="0 0 14 14"
        fill="none"
      >
        <path
          d="M9.5 1.5a4 4 0 00-4.5 4.5L1.5 9.5 4 12l3.5-3.5a4 4 0 004.5-4.5L9.5 6.5 7 4l2.5-2.5z"
          stroke="currentColor" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    )
  );
}

function SubToolDetail({ subTool }: { subTool: AgentChatSubToolActivity }): React.ReactElement | null {
  const detail = subTool.filePath
    ? shortenPath(subTool.filePath)
    : subTool.inputSummary
      ? truncate(subTool.inputSummary, 60)
      : null;

  if (!detail && !subTool.editSummary) return null;

  return (
    <>
      {detail && (
        <span className="min-w-0 truncate text-text-semantic-muted">{detail}</span>
      )}
      {subTool.editSummary && (
        <span className="shrink-0 text-text-semantic-muted">
          <span style={{ color: 'var(--status-error)' }}>-{subTool.editSummary.oldLines}</span>
          {' / '}
          <span style={{ color: 'var(--status-success)' }}>+{subTool.editSummary.newLines}</span>
        </span>
      )}
    </>
  );
}

function SubToolItem({ subTool }: { subTool: AgentChatSubToolActivity }): React.ReactElement {
  return (
    <div className="ml-1 flex items-center gap-1.5 text-[10px] leading-tight">
      <SubToolIcon name={subTool.name} />
      <SubToolStatusIcon status={subTool.status} />
      <span className="shrink-0 text-text-semantic-primary">
        {formatToolActivity(subTool.name)}
      </span>
      <SubToolDetail subTool={subTool} />
    </div>
  );
}

/* ---------- Exported component ---------- */

export const AgentChatSubToolList = React.memo(function AgentChatSubToolList({
  subTools,
}: {
  subTools: AgentChatSubToolActivity[];
}): React.ReactElement | null {
  if (subTools.length === 0) return null;

  return (
    <div className="border-t border-border-semantic px-2.5 py-1.5 space-y-0.5">
      {subTools.map((st) => (
        <SubToolItem key={st.subToolId} subTool={st} />
      ))}
    </div>
  );
});
