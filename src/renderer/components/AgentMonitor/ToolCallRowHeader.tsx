/**
 * ToolCallRowHeader.tsx — Clickable header for a tool call row.
 */

import React, { memo } from 'react';

import { fileOpLabel, formatDurationShort, toolAbbr, toolColor } from './feedHelpers';
import { ErrorIcon, RowChevron, SpinnerIcon, SuccessIcon } from './FeedIcons';
import type { ToolCallEvent } from './types';
import { useElapsedSeconds } from './useElapsedSeconds';

interface ToolCallRowHeaderProps {
  call: ToolCallEvent;
  expanded: boolean;
  isExpandable: boolean;
  onToggle: (id: string) => void;
}

const STATUS_ICON_MAP: Record<string, React.FC> = {
  pending: SpinnerIcon,
  success: SuccessIcon,
  error: ErrorIcon,
};

function RowButtonStyle(isExpandable: boolean): React.CSSProperties {
  return {
    minHeight: '28px',
    background: 'transparent',
    cursor: isExpandable ? 'pointer' : 'default',
    border: 'none',
    outline: 'none',
  };
}

function RowContents({
  call,
  expanded,
  isExpandable,
  color,
  fileLabel,
  isPending,
  elapsedSec,
}: {
  call: ToolCallEvent;
  expanded: boolean;
  isExpandable: boolean;
  color: string;
  fileLabel: string | null;
  isPending: boolean;
  elapsedSec: number;
}): React.ReactElement<any> {
  const StatusIcon = STATUS_ICON_MAP[call.status];
  return (
    <>
      <ChevronSlot open={expanded} visible={isExpandable} />
      <ToolBadge color={color} toolName={call.toolName} />
      <ToolLabel call={call} fileLabel={fileLabel} isPending={isPending} />
      <DurationSlot call={call} elapsedSec={elapsedSec} isPending={isPending} />
      <span className="shrink-0 mt-0.5">{StatusIcon && <StatusIcon />}</span>
    </>
  );
}

export const ToolCallRowHeader = memo(function ToolCallRowHeader({
  call,
  expanded,
  isExpandable,
  onToggle,
}: ToolCallRowHeaderProps): React.ReactElement<any> {
  const color = toolColor(call.toolName);
  const isPending = call.status === 'pending';
  const elapsedSec = useElapsedSeconds(call.timestamp, isPending);
  const fileLabel = fileOpLabel(call.toolName, call.input);

  return (
    <button
      className="w-full flex items-start gap-2 px-3 py-1.5 text-left transition-colors"
      style={RowButtonStyle(isExpandable)}
      onMouseEnter={(e) => {
        if (isExpandable)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-raised)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      onClick={() => {
        if (isExpandable) onToggle(call.id);
      }}
      aria-expanded={isExpandable ? expanded : undefined}
    >
      <RowContents
        call={call}
        expanded={expanded}
        isExpandable={isExpandable}
        color={color}
        fileLabel={fileLabel}
        isPending={isPending}
        elapsedSec={elapsedSec}
      />
    </button>
  );
});

// ─── Tiny sub-slots ───────────────────────────────────────────────────────────

function ChevronSlot({ open, visible }: { open: boolean; visible: boolean }): React.ReactElement<any> {
  return (
    <span
      className="shrink-0 mt-0.5 text-text-semantic-faint"
      style={{ opacity: visible ? 1 : 0.3, width: '10px' }}
    >
      <RowChevron open={open} />
    </span>
  );
}

function ToolBadge({ color, toolName }: { color: string; toolName: string }): React.ReactElement<any> {
  return (
    <span
      className="shrink-0 mt-0.5 inline-flex items-center justify-center rounded text-[10px] font-bold leading-none"
      style={{
        width: '20px',
        height: '16px',
        color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
      title={toolName}
    >
      {toolAbbr(toolName)}
    </span>
  );
}

function ToolLabel({
  call,
  fileLabel,
  isPending,
}: {
  call: ToolCallEvent;
  fileLabel: string | null;
  isPending: boolean;
}): React.ReactElement<any> {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
      <span className="text-[11px] font-medium leading-none text-text-semantic-muted">
        {call.toolName}
      </span>
      <span
        className="text-[11px] leading-snug truncate selectable"
        style={{
          color: fileLabel && isPending ? 'var(--interactive-accent)' : 'var(--text-faint)',
          fontStyle: fileLabel && isPending ? 'italic' : 'normal',
        }}
        title={call.input}
      >
        {fileLabel ?? call.input}
      </span>
    </div>
  );
}

function DurationSlot({
  call,
  elapsedSec,
  isPending,
}: {
  call: ToolCallEvent;
  elapsedSec: number;
  isPending: boolean;
}): React.ReactElement<any> {
  return (
    <>
      {call.duration !== undefined && (
        <span
          className="shrink-0 text-[10px] tabular-nums mt-0.5"
          style={{ color: 'var(--text-faint)' }}
        >
          {formatDurationShort(call.duration)}
        </span>
      )}
      {isPending && elapsedSec > 0 && (
        <span
          className="shrink-0 text-[10px] tabular-nums mt-0.5"
          style={{ color: 'var(--interactive-accent)', opacity: 0.8 }}
        >
          {elapsedSec}s
        </span>
      )}
    </>
  );
}
