/**
 * ToolCallRow.tsx — Expandable tool call row showing header + output.
 */

import React, { memo } from 'react';
import type { ToolCallEvent } from './types';
import { ToolCallRowHeader } from './ToolCallRowHeader';

interface ToolCallRowProps {
  call: ToolCallEvent;
  expanded: boolean;
  onToggle: (id: string) => void;
}

export const ToolCallRow = memo(function ToolCallRow({
  call,
  expanded,
  onToggle,
}: ToolCallRowProps): React.ReactElement {
  const hasOutput = call.output !== undefined && call.output.length > 0;
  const isExpandable = hasOutput || call.status !== 'pending';

  return (
    <div>
      <ToolCallRowHeader
        call={call}
        expanded={expanded}
        isExpandable={isExpandable}
        onToggle={onToggle}
      />
      {expanded && hasOutput && <ExpandedOutput call={call} />}
      {expanded && !hasOutput && call.status !== 'pending' && <EmptyOutput />}
    </div>
  );
});

// ─── Output panels ────────────────────────────────────────────────────────────

function ExpandedOutput({ call }: { call: ToolCallEvent }): React.ReactElement {
  return (
    <div
      className="mx-3 mb-2 ml-8 rounded overflow-hidden"
      style={{
        border: '1px solid var(--border-muted)',
        background: 'color-mix(in srgb, var(--bg) 80%, var(--bg-tertiary))',
      }}
    >
      <div
        className="overflow-y-auto overflow-x-auto p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all selectable"
        style={{
          maxHeight: '200px',
          fontFamily: 'var(--font-mono)',
          color: call.status === 'error' ? 'var(--error)' : 'var(--text)',
        }}
      >
        {call.output}
      </div>
    </div>
  );
}

function EmptyOutput(): React.ReactElement {
  return (
    <div
      className="mx-3 mb-2 ml-8 px-2 py-1.5 rounded text-[10px] italic"
      style={{
        color: 'var(--text-faint)',
        background: 'color-mix(in srgb, var(--bg) 80%, var(--bg-tertiary))',
        border: '1px solid var(--border-muted)',
      }}
    >
      No output captured.
    </div>
  );
}
