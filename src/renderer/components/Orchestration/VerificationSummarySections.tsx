import React from 'react';

import type { ProviderProgressEvent, VerificationSummary } from '../../types/electron';
import { badgeStyle, panelStyle, resolveStatusTone } from './orchestrationUi';
import {
  ProviderDetails,
  ProviderStatusHeader,
  VerificationOverviewGrid,
  VerificationStatusHeader,
} from './VerificationSummarySections.parts';

export function ProviderActivityCard({ providerEvent }: { providerEvent: ProviderProgressEvent | null }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <ProviderStatusHeader providerEvent={providerEvent} />
      <ProviderDetails providerEvent={providerEvent} />
    </div>
  );
}

export function VerificationOverviewCard({ summary }: { summary: VerificationSummary | null }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <VerificationStatusHeader summary={summary} />
      <VerificationOverviewGrid summary={summary} />
    </div>
  );
}

export function VerificationStepsCard({ summary }: { summary: VerificationSummary | null }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Verification steps</div>
      <div className="mt-3 space-y-3">{summary?.commandResults.length ? summary.commandResults.map((result) => <StepResultCard key={result.stepId} result={result} />) : <EmptyMessage message="No verification commands have been recorded yet." />}</div>
    </div>
  );
}

function StepResultCard({ result }: { result: NonNullable<VerificationSummary['commandResults']>[number] }): React.ReactElement {
  const tone = resolveStatusTone(result.status);
  return (
    <div className="rounded-md border p-3 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium" style={{ color: 'var(--text)' }}>{result.stepId}</div>
        <span style={badgeStyle(tone.background, tone.color)}>{result.status}</span>
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <KeyValue label="Exit code" value={typeof result.exitCode === 'number' ? String(result.exitCode) : '—'} />
        <KeyValue label="Duration" value={typeof result.durationMs === 'number' ? `${result.durationMs} ms` : '—'} />
      </div>
      {result.stdout ? <CollapsibleOutput title="stdout" content={result.stdout} /> : null}
      {result.stderr ? <CollapsibleOutput title="stderr" content={result.stderr} /> : null}
    </div>
  );
}

function CollapsibleOutput({ title, content }: { title: string; content: string }): React.ReactElement {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer select-none" style={{ color: 'var(--text)' }}>{title}</summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md p-3 text-[11px]" style={{ background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{content}</pre>
    </details>
  );
}

export function VerificationIssuesCard({ summary }: { summary: VerificationSummary | null }): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Issues</div>
      <div className="mt-3 space-y-2">{summary?.issues.length ? summary.issues.map((issue, index) => <IssueCard key={`${issue.filePath ?? 'issue'}-${index}`} issue={issue} />) : <EmptyMessage message="No verification issues are attached to this session." />}</div>
    </div>
  );
}

function IssueCard({ issue }: { issue: NonNullable<VerificationSummary['issues']>[number] }): React.ReactElement {
  const tone = resolveStatusTone(issue.severity === 'error' ? 'failed' : issue.severity === 'warning' ? 'running' : 'pending');
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="flex flex-wrap items-center gap-2">
        <span style={badgeStyle(tone.background, tone.color)}>{issue.severity}</span>
        {issue.filePath ? <span style={{ color: 'var(--text-muted)' }}>{issue.filePath.replace(/\\/g, '/')}</span> : null}
      </div>
      <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{issue.message}</div>
    </div>
  );
}

function KeyValue({ label, value, breakAll = false, multiline = false }: { label: string; value: string; breakAll?: boolean; multiline?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`mt-1 ${breakAll ? 'break-all' : ''} ${multiline ? 'whitespace-pre-wrap' : ''}`} style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  );
}

function EmptyMessage({ message }: { message: string }): React.ReactElement {
  return <div className="rounded-md border px-3 py-4 text-[12px]" style={{ ...panelStyle('var(--bg)'), color: 'var(--text-muted)' }}>{message}</div>;
}
