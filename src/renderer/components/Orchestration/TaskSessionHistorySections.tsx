import React from 'react';
import type { TaskSessionRecord } from '../../types/electron';
import { badgeStyle, formatDateTime, panelStyle, resolveStatusTone } from './orchestrationUi';

export function SessionHistoryIntro(): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Session history</div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Inspect previous orchestration attempts and switch the detail view between saved sessions.
      </div>
    </div>
  );
}

export function SessionHistoryEmptyState(): React.ReactElement {
  return (
    <div className="rounded-lg border px-4 py-5 text-[13px]" style={{ ...panelStyle(), color: 'var(--text-muted)' }}>
      No orchestration sessions have been saved for the active project root yet.
    </div>
  );
}

export function SessionHistoryItem({ session, selected, onSelect }: { session: TaskSessionRecord; selected: boolean; onSelect: (sessionId: string) => void; }): React.ReactElement {
  const tone = resolveStatusTone(session.status);
  return (
    <button type="button" onClick={() => onSelect(session.id)} className="w-full rounded-lg border p-4 text-left transition-colors" style={{ borderColor: selected ? 'var(--accent)' : 'var(--border)', background: selected ? 'color-mix(in srgb, var(--accent) 7%, var(--bg-secondary))' : 'var(--bg-secondary)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }} title={session.request.goal}>{trimGoal(session.request.goal)}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span>{session.request.mode}</span>
            <span>{session.request.provider}</span>
            <span>{session.request.verificationProfile}</span>
            <span>{session.attempts.length} attempt{session.attempts.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <span style={badgeStyle(tone.background, tone.color)}>{session.status}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-[12px]">
        <HistoryMeta label="Updated" value={formatDateTime(session.updatedAt)} />
        <HistoryMeta label="Session" value={session.id} breakAll />
        <HistoryMeta label="Task" value={session.taskId} breakAll />
        <HistoryMeta label="Next action" value={session.nextSuggestedAction ?? '—'} />
      </div>
    </button>
  );
}

function HistoryMeta({ label, value, breakAll = false }: { label: string; value: string; breakAll?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${breakAll ? 'break-all' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function trimGoal(goal: string): string {
  const normalized = goal.trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}
