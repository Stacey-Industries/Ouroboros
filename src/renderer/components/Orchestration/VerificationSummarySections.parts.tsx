import React from 'react';

import type { ProviderProgressEvent, VerificationSummary } from '../../types/electron';
import { badgeStyle, formatDateTime, panelStyle, resolveStatusTone } from './orchestrationUi';

function pickString(fallback: string, ...values: Array<string | null | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.length > 0) ?? fallback;
}

export function ProviderStatusHeader({ providerEvent }: { providerEvent: ProviderProgressEvent | null }): React.ReactElement<any> {
  const tone = resolveStatusTone(providerEvent?.status ?? 'queued');
  return (
    <div className="flex items-start justify-between gap-3">
      <SectionIntro title="Provider activity" description="Latest execution state emitted by the provider adapter." />
      <span style={badgeStyle(tone.background, tone.color)}>{providerEvent?.status ?? 'idle'}</span>
    </div>
  );
}

export function ProviderDetails({ providerEvent }: { providerEvent: ProviderProgressEvent | null }): React.ReactElement<any> {
  return (
    <div className="mt-4 space-y-3 text-[12px]">
      <KeyValue label="Message" value={providerEvent?.message ?? 'No provider progress has been emitted yet.'} multiline />
      <div className="grid gap-3 md:grid-cols-2">
        <KeyValue label="Provider" value={providerEvent?.provider ?? '—'} />
        <KeyValue label="Updated" value={formatDateTime(providerEvent?.timestamp)} />
      </div>
      {providerEvent?.session ? <ProviderSessionGrid providerEvent={providerEvent} /> : null}
    </div>
  );
}

function ProviderSessionGrid({ providerEvent }: { providerEvent: ProviderProgressEvent }): React.ReactElement<any> {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <KeyValue label="Provider session" value={providerEvent.session?.sessionId ?? '—'} breakAll />
      <KeyValue label="Request ID" value={providerEvent.session?.requestId ?? '—'} breakAll />
      <KeyValue label="External task" value={providerEvent.session?.externalTaskId ?? '—'} breakAll />
    </div>
  );
}

export function VerificationStatusHeader({ summary }: { summary: VerificationSummary | null }): React.ReactElement<any> {
  const tone = resolveStatusTone(summary?.status ?? 'pending');
  return (
    <div className="flex items-start justify-between gap-3">
      <SectionIntro title="Verification summary" description="Command, diagnostics, and issue results captured for this orchestration session." />
      <span style={badgeStyle(tone.background, tone.color)}>{summary?.status ?? 'pending'}</span>
    </div>
  );
}

function buildVerificationTimingItems(summary: VerificationSummary | null): Array<{ label: string; value: string }> {
  return [
    { label: 'Profile', value: pickString('—', summary?.profile) },
    { label: 'Started', value: formatDateTime(summary?.startedAt) },
    { label: 'Duration', value: formatDuration(summary) },
  ];
}

function buildVerificationResultItems(summary: VerificationSummary | null): Array<{ label: string; value: string }> {
  return [
    { label: 'Issues', value: String(summary?.issues.length ?? 0) },
    { label: 'Commands', value: String(summary?.commandResults.length ?? 0) },
    { label: 'Approval needed', value: summary?.requiredApproval ? 'Yes' : 'No' },
  ];
}

export function VerificationOverviewGrid({ summary }: { summary: VerificationSummary | null }): React.ReactElement<any> {
  const items = [
    ...buildVerificationTimingItems(summary),
    ...buildVerificationResultItems(summary),
  ];
  return (
    <>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3 text-[12px]">
        {items.map((item) => <KeyValue key={item.label} label={item.label} value={item.value} />)}
      </div>
      <div className="mt-4 rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>Summary</div>
        <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{summary?.summary ?? 'No verification run has been recorded yet.'}</div>
      </div>
    </>
  );
}

function SectionIntro({ title, description }: { title: string; description: string }): React.ReactElement<any> {
  return (
    <div>
      <div className="text-[14px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>{description}</div>
    </div>
  );
}

function KeyValue({ label, value, breakAll = false, multiline = false }: { label: string; value: string; breakAll?: boolean; multiline?: boolean }): React.ReactElement<any> {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${breakAll ? 'break-all' : ''} ${multiline ? 'whitespace-pre-wrap' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function formatDuration(summary: VerificationSummary | null): string {
  if (!summary?.completedAt) {
    return '—';
  }

  const durationMs = Math.max(0, summary.completedAt - summary.startedAt);
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
}
