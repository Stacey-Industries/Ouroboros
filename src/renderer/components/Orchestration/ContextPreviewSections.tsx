import React from 'react';

import type { ContextSnippet, RankedContextFile, TaskResult, TaskSessionRecord } from '../../types/electron';
import { ContextMetricsGrid } from './ContextMetricsGrid';
import { badgeStyle, formatPath, panelStyle } from './orchestrationUi';

export function ContextMetricsSection({ session }: { session: TaskSessionRecord | null }): React.ReactElement<any> {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <ContextMetricsGrid session={session} />
    </div>
  );
}

export function ContextFileList({ session }: { session: TaskSessionRecord | null }): React.ReactElement<any> {
  const files = session?.contextPacket?.files ?? [];
  if (files.length === 0) {
    return <EmptyCard message="No context packet has been stored for this session yet." />;
  }

  return <div className="space-y-4">{files.map((file) => <ContextFileCard key={file.filePath} file={file} />)}</div>;
}

function ContextFileCard({ file }: { file: RankedContextFile }): React.ReactElement<any> {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <ContextFileHeader file={file} />
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <ReasonList reasons={file.reasons} />
        <SnippetList snippets={file.snippets} />
      </div>
      {file.truncationNotes.length ? <TruncationNotes file={file} /> : null}
    </div>
  );
}

function ContextFileHeader({ file }: { file: RankedContextFile }): React.ReactElement<any> {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--text)' }} title={file.filePath}>{formatPath(file.filePath)}</div>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span style={badgeStyle('color-mix(in srgb, var(--accent) 12%, transparent)', 'var(--accent)')}>{file.confidence}</span>
          <span>Score {file.score.toFixed(2)}</span>
          <span>{file.snippets.length} snippet{file.snippets.length === 1 ? '' : 's'}</span>
        </div>
      </div>
      {file.truncationNotes.length ? <span style={badgeStyle('color-mix(in srgb, #f59e0b 14%, transparent)', '#f59e0b')}>{file.truncationNotes.length} note{file.truncationNotes.length === 1 ? '' : 's'}</span> : null}
    </div>
  );
}

function ReasonList({ reasons }: { reasons: RankedContextFile['reasons'] }): React.ReactElement<any> {
  return (
    <div>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Why it was selected</div>
      <div className="mt-2 space-y-2">{reasons.map((reason, index) => <ReasonCard key={`${reason.kind}-${index}`} kind={reason.kind} weight={reason.weight} detail={reason.detail} />)}</div>
    </div>
  );
}

function ReasonCard({ kind, weight, detail }: { kind: string; weight: number; detail: string }): React.ReactElement<any> {
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="flex flex-wrap items-center gap-2">
        <span style={badgeStyle('color-mix(in srgb, var(--accent) 10%, transparent)', 'var(--accent)')}>{kind}</span>
        <span style={{ color: 'var(--text-muted)' }}>Weight {weight.toFixed(2)}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{detail}</div>
    </div>
  );
}

function SnippetList({ snippets }: { snippets: ContextSnippet[] }): React.ReactElement<any> {
  return (
    <div>
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Selected snippets</div>
      <div className="mt-2 space-y-2">{snippets.map((snippet, index) => <SnippetCard key={`${snippet.label}-${snippet.range.startLine}-${index}`} snippet={snippet} />)}</div>
    </div>
  );
}

function SnippetCard({ snippet }: { snippet: ContextSnippet }): React.ReactElement<any> {
  return (
    <div className="rounded-md border px-3 py-2" style={panelStyle()}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        <span>{snippet.label}</span>
        <span style={badgeStyle('color-mix(in srgb, var(--accent) 12%, transparent)', 'var(--accent)')}>{snippet.source}</span>
        <span>{snippet.range.startLine}–{snippet.range.endLine}</span>
      </div>
      {snippet.content ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md p-3 text-[12px]" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)' }}>{snippet.content}</pre> : null}
    </div>
  );
}

function TruncationNotes({ file }: { file: RankedContextFile }): React.ReactElement<any> {
  return (
    <div className="mt-4">
      <div className="text-[12px] font-semibold" style={{ color: 'var(--text)' }}>Truncation notes</div>
      <div className="mt-2 space-y-2">
        {file.truncationNotes.map((note, index) => (
          <div key={`${note.reason}-${index}`} className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
            <span style={badgeStyle('color-mix(in srgb, #f59e0b 12%, transparent)', '#f59e0b')}>{note.reason}</span>
            <div className="mt-1" style={{ color: 'var(--text)' }}>{note.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContextSidebar({ session, latestResult }: { session: TaskSessionRecord | null; latestResult: TaskResult | null }): React.ReactElement<any> {
  const packet = session?.contextPacket;
  return (
    <div className="space-y-4">
      <FileSummaryCard title="Changed files considered" items={packet?.repoFacts.gitDiff.changedFiles ?? []} emptyMessage="No git diff summary was attached to the context packet." renderMeta={(file) => <><span>{file.status}</span><span>+{file.additions}</span><span>-{file.deletions}</span></>} />
      <FileSummaryCard title="Proposed file changes" items={latestResult?.diffSummary?.files ?? []} emptyMessage="No diff summary is available for the selected session yet." renderMeta={(file) => <><span>+{file.additions}</span><span>-{file.deletions}</span>{file.risk ? <span>Risk {file.risk}</span> : null}</>} renderSummary={(file) => file.summary ? <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{file.summary}</div> : null} />
      <OmittedFilesCard session={session} />
    </div>
  );
}

function FileSummaryCard<T extends { filePath: string }>({ title, items, emptyMessage, renderMeta, renderSummary }: { title: string; items: T[]; emptyMessage: string; renderMeta: (item: T) => React.ReactNode; renderSummary?: (item: T) => React.ReactNode; }): React.ReactElement<any> {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
      <div className="mt-2 space-y-2">
        {items.length ? items.map((item) => <FileSummaryItem key={item.filePath} item={item} renderMeta={renderMeta} renderSummary={renderSummary} />) : <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{emptyMessage}</div>}
      </div>
    </div>
  );
}

function FileSummaryItem<T extends { filePath: string }>({ item, renderMeta, renderSummary }: { item: T; renderMeta: (item: T) => React.ReactNode; renderSummary?: (item: T) => React.ReactNode; }): React.ReactElement<any> {
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="truncate font-medium" style={{ color: 'var(--text)' }} title={item.filePath}>{formatPath(item.filePath)}</div>
      <div className="mt-1 flex flex-wrap gap-3" style={{ color: 'var(--text-muted)' }}>{renderMeta(item)}</div>
      {renderSummary?.(item)}
    </div>
  );
}

function OmittedFilesCard({ session }: { session: TaskSessionRecord | null }): React.ReactElement<any> {
  const items = session?.contextPacket?.omittedCandidates ?? [];
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>Omitted files</div>
      <div className="mt-2 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item.filePath} className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
            <div className="truncate font-medium" style={{ color: 'var(--text)' }} title={item.filePath}>{formatPath(item.filePath)}</div>
            <div className="mt-1" style={{ color: 'var(--text-muted)' }}>{item.reason}</div>
          </div>
        )) : <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Nothing was explicitly omitted from the saved context packet.</div>}
      </div>
    </div>
  );
}

function EmptyCard({ message }: { message: string }): React.ReactElement<any> {
  return <div className="rounded-lg border p-4 text-[13px]" style={{ ...panelStyle(), color: 'var(--text-muted)' }}>{message}</div>;
}
