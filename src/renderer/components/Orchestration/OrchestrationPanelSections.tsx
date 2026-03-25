import React from 'react';
import type { TaskSessionRecord } from '../../types/electron';
import { badgeStyle, panelStyle, resolveStatusTone } from './orchestrationUi';
import {
  SessionMemoryLists,
  SessionMemorySummary,
  TaskStateBody,
} from './OrchestrationPanelSections.parts';

export type OrchestrationTab = 'overview' | 'context' | 'verification' | 'history';

export const ORCHESTRATION_TABS: Array<{ key: OrchestrationTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'context', label: 'Context' },
  { key: 'verification', label: 'Verification' },
  { key: 'history', label: 'History' },
];

export function NoProjectState({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <PanelFrame onClose={onClose} title="Orchestration" subtitle="Open a project folder to inspect orchestration state.">
      <div className="flex flex-1 items-center justify-center p-6 text-[13px]" style={{ color: 'var(--text-muted)' }}>
        No project root is currently active.
      </div>
    </PanelFrame>
  );
}

export function LoadingState(): React.ReactElement {
  return (
    <div className="flex h-full items-center justify-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
      Loading orchestration sessions…
    </div>
  );
}

export function PanelFrame({ onClose, title, subtitle, children }: { onClose: () => void; title: string; subtitle: string; children: React.ReactNode; }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', fontFamily: 'var(--font-ui)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div>
          <div className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      {children}
    </div>
  );
}

export function OrchestrationHeader(props: {
  projectRoot: string;
  sessionCount: number;
  verificationProfile: string;
  provider: string | null;
  status: string;
  refreshing: boolean;
  canResume: boolean;
  canRerunVerification: boolean;
  canPause: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onResumeLatest: () => void;
  onRerunVerification: () => void;
  onPauseActive: () => void;
  onCancelActive: () => void;
  onClose: () => void;
}): React.ReactElement {
  const tone = resolveStatusTone(props.status);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold" style={{ color: 'var(--text)' }}>Orchestration</span>
          <span style={badgeStyle(tone.background, tone.color)}>{props.status}</span>
          {props.provider ? <span style={badgeStyle('color-mix(in srgb, var(--accent) 12%, transparent)', 'var(--accent)')}>{props.provider}</span> : null}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
          <span>{props.projectRoot.replace(/\\/g, '/')}</span>
          <span>{props.sessionCount} session{props.sessionCount === 1 ? '' : 's'}</span>
          <span>{props.verificationProfile}</span>
        </div>
      </div>
      <HeaderActions {...props} />
    </div>
  );
}

function HeaderActions(props: {
  refreshing: boolean;
  canResume: boolean;
  canRerunVerification: boolean;
  canPause: boolean;
  canCancel: boolean;
  onRefresh: () => void;
  onResumeLatest: () => void;
  onRerunVerification: () => void;
  onPauseActive: () => void;
  onCancelActive: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <ActionButton label={props.refreshing ? 'Refreshing…' : 'Refresh'} onClick={props.onRefresh} />
      <ActionButton label="Resume latest" onClick={props.onResumeLatest} disabled={!props.canResume} />
      <ActionButton label="Rerun verification" onClick={props.onRerunVerification} disabled={!props.canRerunVerification} />
      <ActionButton label="Pause" onClick={props.onPauseActive} disabled={!props.canPause} />
      <ActionButton label="Cancel" onClick={props.onCancelActive} disabled={!props.canCancel} destructive />
      <CloseButton onClose={props.onClose} />
    </div>
  );
}

function ActionButton({ label, onClick, disabled = false, destructive = false }: { label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; }): React.ReactElement {
  return (
    <button type="button" onClick={onClick} className="rounded-md border px-3 py-1.5 text-[12px]" style={{ borderColor: destructive ? 'color-mix(in srgb, #ef4444 30%, var(--border))' : 'var(--border)', background: destructive ? 'color-mix(in srgb, #ef4444 10%, var(--bg-secondary))' : 'var(--bg-secondary)', color: destructive ? '#ef4444' : 'var(--text)' }} disabled={disabled}>
      {label}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }): React.ReactElement {
  return (
    <button type="button" onClick={onClose} aria-label="Close orchestration" style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', lineHeight: 1 }}>
      x
    </button>
  );
}

export function OrchestrationTabBar({ activeTab, onSelect }: { activeTab: OrchestrationTab; onSelect: (tab: OrchestrationTab) => void; }): React.ReactElement {
  return (
    <div className="flex" style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-secondary)' }}>
      {ORCHESTRATION_TABS.map((tab) => (
        <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className="flex items-center gap-1.5 px-4 py-2 text-[12px] transition-colors" style={{ background: 'none', border: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent', color: activeTab === tab.key ? 'var(--text)' : 'var(--text-muted)', fontWeight: activeTab === tab.key ? 600 : 400, cursor: 'pointer', marginBottom: '-1px', fontFamily: 'var(--font-ui)' }}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) {
    return null;
  }

  return (
    <div className="border-b px-5 py-3 text-[12px]" style={{ borderColor: 'color-mix(in srgb, #ef4444 25%, var(--border))', background: 'color-mix(in srgb, #ef4444 10%, var(--bg))', color: '#ef4444' }}>
      {message}
    </div>
  );
}

export function OverviewTabContent(props: {
  session: TaskSessionRecord | null;
  status: string;
  provider: string;
  verificationProfile: string;
  currentStep: string;
  actionMessage: string | null;
  actionError: string | null;
  latestResultMessage: string | null;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <TaskOverviewCard {...props} />
        <TaskStateCard {...props} />
      </div>
      <SessionMemoryCard session={props.session} />
    </div>
  );
}

function TaskOverviewCard(props: { session: TaskSessionRecord | null; status: string; provider: string; verificationProfile: string; currentStep: string; }): React.ReactElement {
  const tone = resolveStatusTone(props.status);
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle title="Active task" description="Current orchestration request, provider choice, and execution state." />
        <span style={badgeStyle(tone.background, tone.color)}>{props.status}</span>
      </div>
      <div className="mt-4 space-y-4">
        <KeyedBlock label="Goal" value={props.session?.request.goal ?? 'No orchestration task is selected.'} large multiline />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-[12px]">
          <SummaryCard label="Mode" value={props.session?.request.mode ?? '—'} />
          <SummaryCard label="Provider" value={props.provider} accent />
          <SummaryCard label="Verification profile" value={props.verificationProfile} />
          <SummaryCard label="Current step" value={props.currentStep} />
        </div>
      </div>
    </div>
  );
}

function TaskStateCard(props: { session: TaskSessionRecord | null; actionMessage: string | null; actionError: string | null; latestResultMessage: string | null; }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>Task state</div>
      <TaskStateBody {...props} />
    </div>
  );
}

export function SessionMemoryCard({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Current session memory</div>
      <SessionMemorySummary session={session} />
      <SessionMemoryLists session={session} />
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }): React.ReactElement {
  return (
    <div>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>{description}</div>
    </div>
  );
}

function SummaryCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }): React.ReactElement {
  return (
    <div className="rounded-md border p-3" style={panelStyle('var(--bg)')}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 font-medium" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

function KeyedBlock({ label, value, large = false, multiline = false }: { label: string; value: string; large?: boolean; multiline?: boolean }): React.ReactElement {
  return (
    <div className={large ? '' : 'rounded-md border px-3 py-2'} style={large ? undefined : panelStyle('var(--bg)')}>
      <div className={large ? 'text-[11px] uppercase tracking-wide' : ''} style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${multiline ? 'whitespace-pre-wrap' : ''} ${large ? 'text-[14px]' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

