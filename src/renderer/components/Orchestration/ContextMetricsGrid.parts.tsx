import React from 'react';

import type { TaskSessionRecord } from '../../types/electron';
import { badgeStyle, formatNumber, panelStyle } from './orchestrationUi';

export function ContextMetricsHeader({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  const packet = session?.contextPacket;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Selected context</div>
        <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Inspect which files and snippets were sent into orchestration and why they were chosen.
        </div>
      </div>
      {packet ? <span style={badgeStyle('color-mix(in srgb, var(--accent) 12%, transparent)', 'var(--accent)')}>Packet {packet.id}</span> : null}
    </div>
  );
}

export function ContextMetricsCards({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  const packet = session?.contextPacket;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Included files" value={String(packet?.files.length ?? 0)} />
      <MetricCard label="Omitted candidates" value={String(packet?.omittedCandidates.length ?? 0)} />
      <MetricCard label="Estimated bytes" value={formatNumber(packet?.budget.estimatedBytes)} />
      <MetricCard label="Estimated tokens" value={formatNumber(packet?.budget.estimatedTokens)} />
    </div>
  );
}

export function ContextBudgetNotes({ session }: { session: TaskSessionRecord | null }): React.ReactElement | null {
  const notes = session?.contextPacket?.budget.droppedContentNotes ?? [];
  if (notes.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="font-semibold" style={{ color: 'var(--text)' }}>Budget notes</div>
      <ul className="mt-2 space-y-1 pl-4" style={{ color: 'var(--text-muted)' }}>
        {notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
      </ul>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="rounded-md border p-3" style={panelStyle('var(--bg)')}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 text-[18px] font-semibold" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}
