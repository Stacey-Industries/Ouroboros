import React from 'react';

import type { TaskResult, TaskSessionRecord } from '../../types/electron';
import { formatPath, panelStyle } from './orchestrationUi';

function FileSummaryItem<T extends { filePath: string }>({
  item,
  renderMeta,
  renderSummary,
}: {
  item: T;
  renderMeta: (item: T) => React.ReactNode;
  renderSummary?: (item: T) => React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]" style={panelStyle('var(--bg)')}>
      <div className="truncate font-medium" style={{ color: 'var(--text)' }} title={item.filePath}>
        {formatPath(item.filePath)}
      </div>
      <div className="mt-1 flex flex-wrap gap-3" style={{ color: 'var(--text-muted)' }}>
        {renderMeta(item)}
      </div>
      {renderSummary?.(item)}
    </div>
  );
}

function FileSummaryCard<T extends { filePath: string }>({
  title,
  items,
  emptyMessage,
  renderMeta,
  renderSummary,
}: {
  title: string;
  items: T[];
  emptyMessage: string;
  renderMeta: (item: T) => React.ReactNode;
  renderSummary?: (item: T) => React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
        {title}
      </div>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.map((item) => (
            <FileSummaryItem
              key={item.filePath}
              item={item}
              renderMeta={renderMeta}
              renderSummary={renderSummary}
            />
          ))
        ) : (
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function OmittedFilesCard({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  const items = session?.contextPacket?.omittedCandidates ?? [];
  return (
    <div className="rounded-lg border p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
        Omitted files
      </div>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.filePath}
              className="rounded-md border px-3 py-2 text-[12px]"
              style={panelStyle('var(--bg)')}
            >
              <div
                className="truncate font-medium"
                style={{ color: 'var(--text)' }}
                title={item.filePath}
              >
                {formatPath(item.filePath)}
              </div>
              <div className="mt-1" style={{ color: 'var(--text-muted)' }}>
                {item.reason}
              </div>
            </div>
          ))
        ) : (
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Nothing was explicitly omitted from the saved context packet.
          </div>
        )}
      </div>
    </div>
  );
}

function ChangedFilesCard({ session }: { session: TaskSessionRecord | null }): React.ReactElement {
  return (
    <FileSummaryCard
      title="Changed files considered"
      items={session?.contextPacket?.repoFacts.gitDiff.changedFiles ?? []}
      emptyMessage="No git diff summary was attached to the context packet."
      renderMeta={(file) => (
        <>
          <span>{file.status}</span>
          <span>+{file.additions}</span>
          <span>-{file.deletions}</span>
        </>
      )}
    />
  );
}

function ProposedFilesCard({
  latestResult,
}: {
  latestResult: TaskResult | null;
}): React.ReactElement {
  return (
    <FileSummaryCard
      title="Proposed file changes"
      items={latestResult?.diffSummary?.files ?? []}
      emptyMessage="No diff summary is available for the selected session yet."
      renderMeta={(file) => (
        <>
          <span>+{file.additions}</span>
          <span>-{file.deletions}</span>
          {file.risk ? <span>Risk {file.risk}</span> : null}
        </>
      )}
      renderSummary={(file) =>
        file.summary ? (
          <div className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--text)' }}>
            {file.summary}
          </div>
        ) : null
      }
    />
  );
}

export function ContextSidebar({
  session,
  latestResult,
}: {
  session: TaskSessionRecord | null;
  latestResult: TaskResult | null;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <ChangedFilesCard session={session} />
      <ProposedFilesCard latestResult={latestResult} />
      <OmittedFilesCard session={session} />
    </div>
  );
}
