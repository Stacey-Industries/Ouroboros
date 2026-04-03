/**
 * TimelineTooltip.tsx — Hover tooltip for timeline bars.
 */

import React, { memo } from 'react';

import { formatDurationShort } from './timelineHelpers';
import type { ToolCallEvent } from './types';

export interface TooltipData {
  toolName: string;
  status: ToolCallEvent['status'];
  duration?: number;
  startOffsetMs: number;
  x: number;
  y: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'In progress', color: 'var(--interactive-accent)' },
  success: { label: 'Success', color: 'var(--status-success)' },
  error: { label: 'Error', color: 'var(--status-error)' },
};

export const Tooltip = memo(function Tooltip({ data }: { data: TooltipData }): React.ReactElement<unknown> {
  const { label: statusLabel, color: statusColor } = STATUS_MAP[data.status] ?? STATUS_MAP.error;

  return (
    <div
      className="bg-surface-panel border border-border-semantic text-text-semantic-primary"
      style={{
        position: 'fixed',
        left: data.x + 8,
        top: data.y - 8,
        zIndex: 9999,
        pointerEvents: 'none',
        borderRadius: '4px',
        padding: '5px 8px',
        fontSize: '11px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '200px',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '2px' }}>{data.toolName}</div>
      <div className="text-text-semantic-faint">
        Start: +{formatDurationShort(data.startOffsetMs)}
      </div>
      {data.duration !== undefined && (
        <div className="text-text-semantic-faint">
          Duration: {formatDurationShort(data.duration)}
        </div>
      )}
      <div style={{ color: statusColor, marginTop: '2px' }}>{statusLabel}</div>
    </div>
  );
});
