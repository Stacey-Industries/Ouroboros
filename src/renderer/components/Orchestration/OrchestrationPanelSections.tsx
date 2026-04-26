import React from 'react';

import type { TaskSessionRecord } from '../../types/electron';
import {
  SessionMemoryLists,
  SessionMemorySummary,
  TaskStateBody,
} from './OrchestrationPanelSections.parts';
export {
  ErrorBanner,
  LoadingState,
  NoProjectState,
  ORCHESTRATION_TABS,
  OrchestrationHeader,
  OrchestrationTabBar,
  PanelFrame,
} from './OrchestrationPanelSections.shell';
import { badgeStyle, panelStyle, resolveStatusTone } from './orchestrationUi';

export type OrchestrationTab = 'overview' | 'context' | 'verification' | 'history';

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

function TaskOverviewCard(props: {
  session: TaskSessionRecord | null;
  status: string;
  provider: string;
  verificationProfile: string;
  currentStep: string;
}): React.ReactElement {
  const tone = resolveStatusTone(props.status);
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionTitle
          title="Active task"
          description="Current orchestration request, provider choice, and execution state."
        />
        <span style={badgeStyle(tone.background, tone.color)}>{props.status}</span>
      </div>
      <div className="mt-4 space-y-4">
        <KeyedBlock
          label="Goal"
          value={props.session?.request.goal ?? 'No orchestration task is selected.'}
          large
          multiline
        />
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

function TaskStateCard(props: {
  session: TaskSessionRecord | null;
  actionMessage: string | null;
  actionError: string | null;
  latestResultMessage: string | null;
}): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
        Task state
      </div>
      <TaskStateBody {...props} />
    </div>
  );
}

export function SessionMemoryCard({
  session,
}: {
  session: TaskSessionRecord | null;
}): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
        Current session memory
      </div>
      <SessionMemorySummary session={session} />
      <SessionMemoryLists session={session} />
    </div>
  );
}

function SectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <div>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        {description}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-md border p-3" style={panelStyle('var(--bg)')}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mt-1 font-medium" style={{ color: accent ? 'var(--accent)' : 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}

function KeyedBlock({
  label,
  value,
  large = false,
  multiline = false,
}: {
  label: string;
  value: string;
  large?: boolean;
  multiline?: boolean;
}): React.ReactElement {
  return (
    <div
      className={large ? '' : 'rounded-md border px-3 py-2'}
      style={large ? undefined : panelStyle('var(--bg)')}
    >
      <div
        className={large ? 'text-[11px] uppercase tracking-wide' : ''}
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </div>
      <div
        className={`mt-1 ${multiline ? 'whitespace-pre-wrap' : ''} ${large ? 'text-[14px]' : ''}`}
        style={{ color: 'var(--text)' }}
      >
        {value}
      </div>
    </div>
  );
}
