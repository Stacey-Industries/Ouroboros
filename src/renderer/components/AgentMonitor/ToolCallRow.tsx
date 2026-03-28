/**
 * ToolCallRow.tsx — Expandable tool call row showing header + output.
 */

import React, { memo } from 'react';

import { ToolCallRowHeader } from './ToolCallRowHeader';
import type { SubToolCallEvent, ToolCallEvent } from './types';

interface ToolCallRowProps {
  call: ToolCallEvent;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function ExpandedSection({ call }: { call: ToolCallEvent }): React.ReactElement | null {
  const hasOutput = call.output !== undefined && call.output.length > 0;
  const hasSubTools = call.subTools !== undefined && call.subTools.length > 0;
  if (hasOutput) return <ExpandedOutput call={call} />;
  if (hasSubTools) return <SubToolList subTools={call.subTools!} />;
  if (call.status !== 'pending') return <EmptyOutput />;
  return null;
}

export const ToolCallRow = memo(function ToolCallRow({
  call,
  expanded,
  onToggle,
}: ToolCallRowProps): React.ReactElement {
  const hasOutput = call.output !== undefined && call.output.length > 0;
  const isExpandable = hasOutput || call.subTools?.length || call.status !== 'pending';
  return (
    <div>
      <ToolCallRowHeader call={call} expanded={expanded} isExpandable={!!isExpandable} onToggle={onToggle} />
      {expanded && <ExpandedSection call={call} />}
    </div>
  );
});

// ─── Output panels ────────────────────────────────────────────────────────────

function ExpandedOutput({ call }: { call: ToolCallEvent }): React.ReactElement {
  return (
    <div
      className="mx-3 mb-2 ml-8 rounded overflow-hidden"
      style={{
        border: '1px solid var(--border-subtle)',
        background: 'color-mix(in srgb, var(--surface-base) 80%, var(--surface-raised))',
      }}
    >
      <div
        className="overflow-y-auto overflow-x-auto p-2 text-[11px] leading-relaxed whitespace-pre-wrap break-all selectable"
        style={{
          maxHeight: '200px',
          fontFamily: 'var(--font-mono)',
          color: call.status === 'error' ? 'var(--status-error)' : 'var(--text-primary)',
        }}
      >
        {call.output}
      </div>
    </div>
  );
}

function SubToolRow({ sub }: { sub: SubToolCallEvent }): React.ReactElement {
  const icon = sub.status === 'pending' ? '◌' : sub.status === 'success' ? '✓' : '✗';
  const color = sub.status === 'success' ? 'var(--status-success)' : sub.status === 'error' ? 'var(--status-error)' : 'var(--text-faint)';
  return (
    <div className="flex items-center gap-1.5 text-[10px]" style={{ fontFamily: 'var(--font-mono)' }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-text-semantic-primary">{sub.toolName}</span>
      {sub.input && <span className="truncate text-text-semantic-muted">{sub.input}</span>}
    </div>
  );
}

function SubToolList({ subTools }: { subTools: SubToolCallEvent[] }): React.ReactElement {
  return (
    <div
      className="mx-3 mb-2 ml-8 rounded px-2 py-1.5 space-y-0.5"
      style={{ background: 'color-mix(in srgb, var(--surface-base) 80%, var(--surface-raised))', border: '1px solid var(--border-subtle)' }}
    >
      {subTools.map((sub) => <SubToolRow key={sub.id} sub={sub} />)}
    </div>
  );
}

function EmptyOutput(): React.ReactElement {
  return (
    <div
      className="mx-3 mb-2 ml-8 px-2 py-1.5 rounded text-[10px] italic"
      style={{
        color: 'var(--text-faint)',
        background: 'color-mix(in srgb, var(--surface-base) 80%, var(--surface-raised))',
        border: '1px solid var(--border-subtle)',
      }}
    >
      No output captured.
    </div>
  );
}
