/**
 * TimelineTooltip.tsx — Hover tooltip for timeline bars.
 */

import React, { memo } from 'react';
import type { ToolCallEvent } from './types';
import { formatDurationShort } from './timelineHelpers';

export interface TooltipData {
  toolName: string;
  status: ToolCallEvent['status'];
  duration?: number;
  startOffsetMs: number;
  x: number;
  y: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'In progress', color: 'var(--accent)' },
  success: { label: 'Success', color: 'var(--success)' },
  error: { label: 'Error', color: 'var(--error)' },
};

export const Tooltip = memo(function Tooltip({ data }: { data: TooltipData }): React.ReactElement {
  const { label: statusLabel, color: statusColor } = STATUS_MAP[data.status] ?? STATUS_MAP.error;

  return (
    <div
      style={{
        position: 'fixed',
        left: data.x + 8,
        top: data.y - 8,
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        padding: '5px 8px',
        fontSize: '11px',
        color: 'var(--text)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxWidth: '200px',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '2px' }}>{data.toolName}</div>
      <div style={{ color: 'var(--text-faint)' }}>
        Start: +{formatDurationShort(data.startOffsetMs)}
      </div>
      {data.duration !== undefined && (
        <div style={{ color: 'var(--text-faint)' }}>
          Duration: {formatDurationShort(data.duration)}
        </div>
      )}
      <div style={{ color: statusColor, marginTop: '2px' }}>{statusLabel}</div>
    </div>
  );
});
