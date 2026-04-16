/**
 * SubagentStatusChip.tsx — Small status badge for subagent records.
 *
 * Displays running / completed / cancelled / failed with design-token colours.
 */

import React from 'react';

import type { SubagentRecord } from '../../types/electron';

type SubagentStatus = SubagentRecord['status'];

interface StatusSpec {
  label: string;
  className: string;
}

const STATUS_MAP: Record<SubagentStatus, StatusSpec> = {
  running: {
    label: 'running',
    className: 'bg-interactive-accent-subtle text-text-semantic-primary',
  },
  completed: {
    label: 'completed',
    className: 'bg-status-success-subtle text-status-success',
  },
  cancelled: {
    label: 'cancelled',
    className: 'bg-status-warning-subtle text-status-warning',
  },
  failed: {
    label: 'failed',
    className: 'bg-status-error-subtle text-status-error',
  },
};

interface SubagentStatusChipProps {
  status: SubagentStatus;
}

export function SubagentStatusChip({ status }: SubagentStatusChipProps): React.ReactElement {
  const spec = STATUS_MAP[status] ?? STATUS_MAP.failed;
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${spec.className}`}
      aria-label={`Status: ${spec.label}`}
    >
      {spec.label}
    </span>
  );
}
