import React from 'react';
import type { TaskSessionRecord } from '../../types/electron';
import { badgeStyle, formatDateTime, panelStyle, resolveStatusTone } from './orchestrationUi';

function pickString(fallback: string, ...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? fallback;
}

export function TaskStateBody(props: { session: TaskSessionRecord | null; actionMessage: string | null; actionError: string | null; latestResultMessage: string | null; }): React.ReactElement {
  return (
    <div className="mt-3 space-y-3 text-[12px]">
      <SelectedContextCard session={props.session} />
      <LatestMessageCard session={props.session} actionMessage={props.actionMessage} latestResultMessage={props.latestResultMessage} />
      <TaskActionErrorCard actionError={props.actionError} />
    </div>
  );
}

function SelectedContextCard({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  return <KeyedBlock label="Selected context" value={`${session?.contextPacket?.files.length ?? 0} file(s) in packet ${session?.contextPacket?.id ?? '—'}`} />;
}

function LatestMessageCard({ session, actionMessage, latestResultMessage }: { session: TaskSessionRecord | null; actionMessage: string | null; latestResultMessage: string | null; }): React.ReactElement {
  return <KeyedBlock label="Latest message" value={actionMessage ?? latestResultMessage ?? session?.latestResult?.message ?? 'No status message has been recorded.'} multiline />;
}

function TaskActionErrorCard({ actionError }: { actionError: string | null }): React.ReactElement | null {
  if (!actionError) {
    return null;
  }

  return <div className="rounded-md border px-3 py-2 text-[12px]" style={{ borderColor: 'color-mix(in srgb, #ef4444 35%, var(--border))', background: 'color-mix(in srgb, #ef4444 10%, var(--bg))', color: '#ef4444' }}>{actionError}</div>;
}

function buildSessionIdentityItems(session: TaskSessionRecord | null): Array<{ label: string; value: string; breakAll?: boolean }> {
  return [
    { label: 'Session ID', value: pickString('—', session?.id), breakAll: true },
    { label: 'Provider session', value: pickString('—', session?.providerSession?.sessionId), breakAll: true },
    { label: 'Request ID', value: pickString('—', session?.providerSession?.requestId), breakAll: true },
  ];
}

function buildSessionRuntimeItems(
  session: TaskSessionRecord | null,
  latestAttempt: TaskSessionRecord['attempts'][number] | undefined,
): Array<{ label: string; value: string; breakAll?: boolean }> {
  return [
    { label: 'Last context packet', value: pickString('—', session?.contextPacket?.id, latestAttempt?.contextPacketId), breakAll: true },
    { label: 'Attempts', value: String(session?.attempts.length ?? 0) },
    { label: 'Updated', value: formatDateTime(session?.updatedAt) },
  ];
}

export function SessionMemorySummary({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  const latestAttempt = session?.attempts.at(-1);
  const items = [
    ...buildSessionIdentityItems(session),
    ...buildSessionRuntimeItems(session, latestAttempt),
  ];
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-[12px]">
      {items.map((item) => <KeyValue key={item.label} label={item.label} value={item.value} breakAll={item.breakAll} />)}
    </div>
  );
}

export function SessionMemoryLists({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <IssueListCard issues={session?.unresolvedIssues ?? []} />
      <AttemptListCard attempts={session?.attempts ?? []} />
    </div>
  );
}

function IssueListCard({ issues }: { issues: string[] }): React.ReactElement {
  return (
    <div className="rounded-md border p-3" style={panelStyle('var(--bg)')}>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Unresolved issues</div>
      <div className="mt-2 space-y-2">{issues.length ? issues.map((issue, index) => <div key={`${issue}-${index}`} className="rounded-md border px-3 py-2 text-[12px]" style={{ ...panelStyle(), color: 'var(--text)' }}>{issue}</div>) : <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No unresolved issues are saved for this session.</div>}</div>
    </div>
  );
}

function AttemptListCard({ attempts }: { attempts: TaskSessionRecord['attempts'] }): React.ReactElement {
  return (
    <div className="rounded-md border p-3" style={panelStyle('var(--bg)')}>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Attempt timeline</div>
      <div className="mt-2 space-y-2">{attempts.length ? attempts.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} />) : <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No attempt timeline is available yet.</div>}</div>
    </div>
  );
}

function AttemptCard({ attempt }: { attempt: TaskSessionRecord['attempts'][number] }): React.ReactElement {
  const tone = resolveStatusTone(attempt.status);
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle()}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium" style={{ color: 'var(--text)' }}>{attempt.id}</div>
        <span style={badgeStyle(tone.background, tone.color)}>{attempt.status}</span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2" style={{ color: 'var(--text-muted)' }}>
        <div>Started {formatDateTime(attempt.startedAt)}</div>
        <div>Completed {formatDateTime(attempt.completedAt)}</div>
      </div>
      {attempt.resultMessage ? <div className="mt-2 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{attempt.resultMessage}</div> : null}
    </div>
  );
}

function KeyedBlock({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }): React.ReactElement {
  return (
    <div className="rounded-md border px-3 py-2" style={panelStyle('var(--bg)')}>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${multiline ? 'whitespace-pre-wrap' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function KeyValue({ label, value, breakAll = false }: { label: string; value: string; breakAll?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${breakAll ? 'break-all' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}
