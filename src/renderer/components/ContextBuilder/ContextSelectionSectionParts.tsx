import React from 'react';

import type { RankedContextFile } from '../../types/electron';
import { Badge, cardStyle, CodeLine, configListStyle } from './ContextBuilderPrimitives';
import type { ContextSelectionIntent, ContextSelectionModel } from './useContextSelectionModel';

const selectionGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '8px',
};

const fileListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const fileRowStyle: React.CSSProperties = {
  ...cardStyle,
  marginBottom: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

const fileHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
};

const pathStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  color: 'var(--text)',
  wordBreak: 'break-word',
};

const metaTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  lineHeight: 1.5,
};

const miniActionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
};

const miniButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: '11px',
};

const snippetListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
};

function ManualControlsBadges({ summary }: { summary: ContextSelectionModel['summary'] }): React.ReactElement {
  return (
    <div style={configListStyle}>
      <Badge color="var(--interactive-accent)" label={`${summary.userSelectedCount} selected`} />
      <Badge color="var(--palette-purple)" label={`${summary.pinnedCount} pinned`} />
      <Badge color="var(--status-success)" label={`${summary.includedCount} included`} />
      <Badge color="var(--status-warning)" label={`${summary.excludedCount} excluded`} />
    </div>
  );
}

function BudgetCardBody({ budget }: { budget: ContextSelectionModel['budget'] }): React.ReactElement {
  if (!budget) return <div style={metaTextStyle}>No orchestration preview budget yet.</div>;
  return (
    <div style={metaTextStyle}>
      <div>{formatBudgetRow('Estimated bytes', budget.estimatedBytes)}</div>
      <div>{formatBudgetRow('Estimated tokens', budget.estimatedTokens)}</div>
      <div>{formatBudgetRow('Byte limit', budget.byteLimit)}</div>
      <div>{formatBudgetRow('Token limit', budget.tokenLimit)}</div>
    </div>
  );
}

export function SelectionSummary({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  const { budget, summary } = contextSelection;
  return (
    <div style={selectionGridStyle}>
      <SummaryCard title="Manual controls" body={<ManualControlsBadges summary={summary} />} />
      <SummaryCard title="Preview status" body={
        <div style={configListStyle}>
          <Badge label={`${summary.previewCount} previewed`} />
          <Badge color="var(--text-muted)" label={`${summary.omittedCount} omitted`} />
        </div>
      } />
      <SummaryCard title="Budget" body={<BudgetCardBody budget={budget} />} />
    </div>
  );
}

function SelectionGroupCard({ group, contextSelection }: { group: { key: string; label: string; files: string[] }; contextSelection: ContextSelectionModel }): React.ReactElement {
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '10px' }}>{group.label}</div>
      <div style={fileListStyle}>
        {group.files.map((filePath) => (
          <div key={filePath} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={pathStyle}>{filePath}</span>
            <div style={miniActionRowStyle}>
              <MiniActionButton label="Open" onClick={() => contextSelection.handleOpenFile(filePath)} />
              <MiniActionButton label="Remove" onClick={() => contextSelection.removeFile(group.key, filePath)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SelectionGroups({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  const populatedGroups = contextSelection.selectionGroups.filter((g) => g.files.length > 0);
  if (populatedGroups.length === 0) return <div style={metaTextStyle}>No manual selection controls applied yet.</div>;
  return (
    <div style={selectionGridStyle}>
      {populatedGroups.map((group) => <SelectionGroupCard key={group.key} group={group} contextSelection={contextSelection} />)}
    </div>
  );
}

function PreviewFileActions({ file, cs }: { file: RankedContextFile; cs: ContextSelectionModel }): React.ReactElement {
  return (
    <div style={miniActionRowStyle}>
      <MiniActionButton label="Open" onClick={() => cs.handleOpenFile(file.filePath)} />
      <MiniActionButton label={cs.isPinned(file.filePath) ? 'Unpin' : 'Pin'} onClick={() => cs.togglePinned(file.filePath)} />
      <MiniActionButton label={cs.isIncluded(file.filePath) ? 'Undo Include' : 'Include'} onClick={() => cs.toggleIncluded(file.filePath)} />
      <MiniActionButton label={cs.isExcluded(file.filePath) ? 'Undo Exclude' : 'Exclude'} onClick={() => cs.toggleExcluded(file.filePath)} />
    </div>
  );
}

function PreviewFileRow({ file, cs }: { file: RankedContextFile; cs: ContextSelectionModel }): React.ReactElement {
  return (
    <div style={fileRowStyle}>
      <div style={fileHeaderStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          <span style={pathStyle}>{file.filePath}</span>
          <div style={configListStyle}>
            <Badge label={`${Math.round(file.score)} score`} />
            <Badge color={getConfidenceColor(file.confidence)} label={file.confidence} />
            {cs.isPinned(file.filePath) && <Badge color="var(--palette-purple)" label="Pinned" />}
            {cs.isIncluded(file.filePath) && <Badge color="var(--status-success)" label="Included" />}
            {cs.isExcluded(file.filePath) && <Badge color="var(--status-warning)" label="Excluded" />}
          </div>
        </div>
        <PreviewFileActions file={file} cs={cs} />
      </div>
      <ReasonList detailTitle="Why this file was selected" details={file.reasons.map((r) => `${r.kind}: ${r.detail}`)} />
      <SnippetSummary labels={file.snippets.map((s) => `${s.label} (${s.range.startLine}-${s.range.endLine})`)} />
      <ReasonList detailTitle="Notes" details={file.truncationNotes.map((n) => `${n.reason}: ${n.detail}`)} emptyLabel="No truncation notes." />
    </div>
  );
}

export function PreviewFiles({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  if (contextSelection.previewFiles.length === 0) {
    return <div style={metaTextStyle}>Preview a context packet to inspect why files and snippets were selected.</div>;
  }
  return (
    <div style={fileListStyle}>
      {contextSelection.previewFiles.map((file) => <PreviewFileRow key={file.filePath} file={file} cs={contextSelection} />)}
    </div>
  );
}

export function OmittedCandidates({
  contextSelection,
}: {
  contextSelection: ContextSelectionModel;
}): React.ReactElement {
  if (contextSelection.omittedCandidates.length === 0) {
    return <div style={metaTextStyle}>No omitted candidates for this preview.</div>;
  }

  return (
    <div style={fileListStyle}>
      {contextSelection.omittedCandidates.map((candidate) => (
        <div
          key={`${candidate.filePath}:${candidate.reason}`}
          style={{ ...cardStyle, marginBottom: 0 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={pathStyle}>{candidate.filePath}</span>
            <CodeLine>{candidate.reason}</CodeLine>
          </div>
        </div>
      ))}
    </div>
  );
}

export function getPickerCopy(intent: ContextSelectionIntent | null): {
  actionLabel: string;
  label: string;
  placeholder: string;
  prefix: string;
} {
  if (intent === 'pin') {
    return {
      actionLabel: 'pin',
      label: 'Pin File Into Context',
      placeholder: 'Search files to pin into context...',
      prefix: '@',
    };
  }

  if (intent === 'exclude') {
    return {
      actionLabel: 'exclude',
      label: 'Exclude File From Context',
      placeholder: 'Search files to exclude from context...',
      prefix: '!',
    };
  }

  return {
    actionLabel: 'include',
    label: 'Include File In Context',
    placeholder: 'Search files to include in context...',
    prefix: '+',
  };
}

function SummaryCard({
  body,
  title,
}: {
  body: React.ReactNode;
  title: string;
}): React.ReactElement {
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
        {title}
      </div>
      {body}
    </div>
  );
}

function ReasonList({
  detailTitle,
  details,
  emptyLabel = 'No details.',
}: {
  detailTitle: string;
  details: string[];
  emptyLabel?: string;
}): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{detailTitle}</div>
      {details.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {details.map((detail) => (
            <div key={detail} style={metaTextStyle}>
              {detail}
            </div>
          ))}
        </div>
      ) : (
        <div style={metaTextStyle}>{emptyLabel}</div>
      )}
    </div>
  );
}

function SnippetSummary({ labels }: { labels: string[] }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
        Selected snippets
      </div>
      {labels.length > 0 ? (
        <div style={snippetListStyle}>
          {labels.map((label) => (
            <Badge key={label} color="var(--surface-hover)" label={label} />
          ))}
        </div>
      ) : (
        <div style={metaTextStyle}>This preview currently uses the full file.</div>
      )}
    </div>
  );
}

function MiniActionButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button onClick={onClick} style={miniButtonStyle}>
      {label}
    </button>
  );
}

function getConfidenceColor(confidence: string): string {
  if (confidence === 'high') {
    return 'var(--status-success)';
  }
  if (confidence === 'medium') {
    return 'var(--status-warning)';
  }
  return 'var(--text-muted)';
}

function formatBudgetRow(label: string, value: number | undefined): string {
  return `${label}: ${value == null ? 'n/a' : value.toLocaleString()}`;
}
