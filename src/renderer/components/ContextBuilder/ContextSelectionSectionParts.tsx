import React from 'react';
import {
  Badge,
  CodeLine,
  cardStyle,
  configListStyle,
} from './ContextBuilderPrimitives';
import type {
  ContextSelectionIntent,
  ContextSelectionModel,
} from './useContextSelectionModel';

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

export function SelectionSummary({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  const { budget, summary } = contextSelection;

  return (
    <div style={selectionGridStyle}>
      <SummaryCard
        title="Manual controls"
        body={(
          <div style={configListStyle}>
            <Badge color="#0ea5e9" label={`${summary.userSelectedCount} selected`} />
            <Badge color="#8b5cf6" label={`${summary.pinnedCount} pinned`} />
            <Badge color="#22c55e" label={`${summary.includedCount} included`} />
            <Badge color="#f97316" label={`${summary.excludedCount} excluded`} />
          </div>
        )}
      />
      <SummaryCard
        title="Preview status"
        body={(
          <div style={configListStyle}>
            <Badge label={`${summary.previewCount} previewed`} />
            <Badge color="#64748b" label={`${summary.omittedCount} omitted`} />
          </div>
        )}
      />
      <SummaryCard
        title="Budget"
        body={budget ? (
          <div style={metaTextStyle}>
            <div>{formatBudgetRow('Estimated bytes', budget.estimatedBytes)}</div>
            <div>{formatBudgetRow('Estimated tokens', budget.estimatedTokens)}</div>
            <div>{formatBudgetRow('Byte limit', budget.byteLimit)}</div>
            <div>{formatBudgetRow('Token limit', budget.tokenLimit)}</div>
          </div>
        ) : (
          <div style={metaTextStyle}>No orchestration preview budget yet.</div>
        )}
      />
    </div>
  );
}

export function SelectionGroups({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  const populatedGroups = contextSelection.selectionGroups.filter((group) => group.files.length > 0);

  if (populatedGroups.length === 0) {
    return <div style={metaTextStyle}>No manual selection controls applied yet.</div>;
  }

  return (
    <div style={selectionGridStyle}>
      {populatedGroups.map((group) => (
        <div key={group.key} style={{ ...cardStyle, marginBottom: 0 }}>
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
      ))}
    </div>
  );
}

export function PreviewFiles({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  if (contextSelection.previewFiles.length === 0) {
    return <div style={metaTextStyle}>Preview a context packet to inspect why files and snippets were selected.</div>;
  }

  return (
    <div style={fileListStyle}>
      {contextSelection.previewFiles.map((file) => (
        <div key={file.filePath} style={fileRowStyle}>
          <div style={fileHeaderStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
              <span style={pathStyle}>{file.filePath}</span>
              <div style={configListStyle}>
                <Badge label={`${Math.round(file.score)} score`} />
                <Badge color={getConfidenceColor(file.confidence)} label={file.confidence} />
                {contextSelection.isPinned(file.filePath) && <Badge color="#8b5cf6" label="Pinned" />}
                {contextSelection.isIncluded(file.filePath) && <Badge color="#22c55e" label="Included" />}
                {contextSelection.isExcluded(file.filePath) && <Badge color="#f97316" label="Excluded" />}
              </div>
            </div>
            <div style={miniActionRowStyle}>
              <MiniActionButton label="Open" onClick={() => contextSelection.handleOpenFile(file.filePath)} />
              <MiniActionButton label={contextSelection.isPinned(file.filePath) ? 'Unpin' : 'Pin'} onClick={() => contextSelection.togglePinned(file.filePath)} />
              <MiniActionButton label={contextSelection.isIncluded(file.filePath) ? 'Undo Include' : 'Include'} onClick={() => contextSelection.toggleIncluded(file.filePath)} />
              <MiniActionButton label={contextSelection.isExcluded(file.filePath) ? 'Undo Exclude' : 'Exclude'} onClick={() => contextSelection.toggleExcluded(file.filePath)} />
            </div>
          </div>
          <ReasonList detailTitle="Why this file was selected" details={file.reasons.map((reason) => `${reason.kind}: ${reason.detail}`)} />
          <SnippetSummary labels={file.snippets.map((snippet) => `${snippet.label} (${snippet.range.startLine}-${snippet.range.endLine})`)} />
          <ReasonList detailTitle="Notes" details={file.truncationNotes.map((note) => `${note.reason}: ${note.detail}`)} emptyLabel="No truncation notes." />
        </div>
      ))}
    </div>
  );
}

export function OmittedCandidates({ contextSelection }: { contextSelection: ContextSelectionModel }): React.ReactElement {
  if (contextSelection.omittedCandidates.length === 0) {
    return <div style={metaTextStyle}>No omitted candidates for this preview.</div>;
  }

  return (
    <div style={fileListStyle}>
      {contextSelection.omittedCandidates.map((candidate) => (
        <div key={`${candidate.filePath}:${candidate.reason}`} style={{ ...cardStyle, marginBottom: 0 }}>
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

function SummaryCard({ body, title }: { body: React.ReactNode; title: string }): React.ReactElement {
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>{title}</div>
      {body}
    </div>
  );
}

function ReasonList({ detailTitle, details, emptyLabel = 'No details.' }: { detailTitle: string; details: string[]; emptyLabel?: string }): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>{detailTitle}</div>
      {details.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {details.map((detail) => (
            <div key={detail} style={metaTextStyle}>{detail}</div>
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
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Selected snippets</div>
      {labels.length > 0 ? (
        <div style={snippetListStyle}>
          {labels.map((label) => (
            <Badge key={label} color="#334155" label={label} />
          ))}
        </div>
      ) : (
        <div style={metaTextStyle}>This preview currently uses the full file.</div>
      )}
    </div>
  );
}

function MiniActionButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  return (
    <button onClick={onClick} style={miniButtonStyle}>
      {label}
    </button>
  );
}

function getConfidenceColor(confidence: string): string {
  if (confidence === 'high') {
    return '#22c55e';
  }
  if (confidence === 'medium') {
    return '#f59e0b';
  }
  return '#64748b';
}

function formatBudgetRow(label: string, value: number | undefined): string {
  return `${label}: ${value == null ? 'n/a' : value.toLocaleString()}`;
}
