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
 * Diff gutter — thin colored markers for added/modified/deleted lines.
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
        backgroundColor: 'var(--bg)',
        position: 'sticky',
        left: `${gutterWidth + foldGutterWidth}px`,
        zIndex: 2,
        borderRight: '1px solid var(--border-muted)',
        userSelect: 'none',
      }}
    >
      {rows.map((row) => {
        if (row.type === 'fold-placeholder') {
          return <div key={`dg-fp-${row.startLine}`} style={{ height: '1.6em' }} />;
        }
        return (
          <DiffGutterLine
            key={`dg-${row.index}`}
            index={row.index}
            kind={diffMap.get(row.index + 1)}
            diffGutterWidth={diffGutterWidth}
          />
        );
      })}
    </div>
  );
});

// ── Individual diff gutter line ──

interface DiffGutterLineProps {
  index: number;
  kind: DiffLineInfo['kind'] | undefined;
  diffGutterWidth: number;
}

function DiffGutterLine({
  index,
  kind,
  diffGutterWidth,
}: DiffGutterLineProps): React.ReactElement {
  if (!kind) {
    return <div key={`dg-${index}`} style={{ height: '1.6em' }} />;
  }

  if (kind === 'deleted') {
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
            borderTop: '5px solid #f85149',
            display: 'block',
          }}
        />
      </div>
    );
  }

  const color = kind === 'added' ? '#3fb950' : '#58a6ff';
  const tooltip = kind === 'added' ? 'Added line' : 'Modified line';

  return (
    <div
      title={tooltip}
      style={{
        height: '1.6em',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div
        style={{
          width: `${diffGutterWidth}px`,
          backgroundColor: color,
          borderRadius: '1px',
        }}
      />
    </div>
  );
}
