/**
 * AgentChatPlanBlockParts.tsx — Icon and status sub-components for AgentChatPlanBlock.
 * Extracted to keep AgentChatPlanBlock.tsx under the 300-line limit.
 */
import React from 'react';

import type { PlanStep } from './AgentChatPlanBlock';

function PendingIcon(): React.ReactElement {
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
      <circle cx="12" cy="12" r="10" opacity="0.3" />
    </svg>
  );
}

function RunningSpinner(): React.ReactElement {
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
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function CompleteIcon(): React.ReactElement {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="16 10 10.5 15.5 8 13" />
    </svg>
  );
}

function FailedIcon(): React.ReactElement {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function ChevronIcon({ expanded }: { expanded: boolean }): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-transform duration-150"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function StatusIcon({ status }: { status: PlanStep['status'] }): React.ReactElement {
  if (status === 'pending')
    return (
      <span className="text-text-semantic-muted">
        <PendingIcon />
      </span>
    );
  if (status === 'running')
    return (
      <span className="text-interactive-accent">
        <RunningSpinner />
      </span>
    );
  if (status === 'complete')
    return (
      <span style={{ color: 'var(--status-success)' }}>
        <CompleteIcon />
      </span>
    );
  return (
    <span style={{ color: 'var(--status-error)' }}>
      <FailedIcon />
    </span>
  );
}
