import React, { memo } from 'react';

import type { DiffLineInfo } from '../../types/electron';
import type { CodeRow } from './codeViewTypes';

export interface DiffGutterProps {
  rows: CodeRow[];
  diffMap: Map<number, DiffLineInfo['kind']>;
  gutterWidth: number;
  foldGutterWidth: number;
  diffGutterWidth: number;
}

/**
 * Diff gutter â€” thin colored markers for added/modified/deleted lines.
 */
export const DiffGutter = memo(function DiffGutter({
  rows,
  diffMap,
  gutterWidth,
  foldGutterWidth,
  diffGutterWidth,
}: DiffGutterProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: `${diffGutterWidth}px`,
        paddingTop: '16px',
        paddingBottom: '16px',
        backgroundColor: 'var(--surface-base)',
        position: 'sticky',
        left: `${gutterWidth + foldGutterWidth}px`,
        zIndex: 2,
        borderRight: '1px solid var(--border-subtle)',
        userSelect: 'none',
      }}
    >
      {rows.map((row) =>
        row.type === 'fold-placeholder' ? (
          <div key={`dg-fp-${row.startLine}`} style={{ height: '1.6em' }} />
        ) : (
          <DiffGutterLine
            key={`dg-${row.index}`}
            index={row.index}
            kind={diffMap.get(row.index + 1)}
            diffGutterWidth={diffGutterWidth}
          />
        ),
      )}
    </div>
  );
});

interface DiffGutterLineProps {
  index: number;
  kind: DiffLineInfo['kind'] | undefined;
  diffGutterWidth: number;
}

function DiffGutterLine({ index, kind, diffGutterWidth }: DiffGutterLineProps): React.ReactElement {
  if (!kind) return <DiffSpacer index={index} />;
  if (kind === 'deleted') return <DeletedDiffMarker />;
  return <ChangedDiffMarker kind={kind} diffGutterWidth={diffGutterWidth} />;
}

function DiffSpacer({ index }: { index: number }): React.ReactElement {
  return <div style={{ height: '1.6em' }} data-line={index} />;
}

function DeletedDiffMarker(): React.ReactElement {
  return (
    <div
      title="Line(s) deleted after this line"
      style={{
        height: '1.6em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          width: 0,
          height: 0,
          borderLeft: '3px solid transparent',
          borderRight: '3px solid transparent',
          borderTop: '5px solid var(--status-error)',
          display: 'block',
        }}
      />
    </div>
  );
}

function ChangedDiffMarker({
  kind,
  diffGutterWidth,
}: {
  kind: Exclude<DiffLineInfo['kind'], 'deleted'>;
  diffGutterWidth: number;
}): React.ReactElement {
  const marker = getChangedDiffMarker(kind);

  return (
    <div
      title={marker.tooltip}
      style={{
        height: '1.6em',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          width: `${diffGutterWidth}px`,
          backgroundColor: marker.color,
          borderRadius: '1px',
        }}
      />
    </div>
  );
}

function getChangedDiffMarker(kind: Exclude<DiffLineInfo['kind'], 'deleted'>): {
  color: string;
  tooltip: string;
} {
  return kind === 'added'
    ? { color: 'var(--status-success)', tooltip: 'Added line' }
    : { color: 'var(--interactive-accent)', tooltip: 'Modified line' };
}
