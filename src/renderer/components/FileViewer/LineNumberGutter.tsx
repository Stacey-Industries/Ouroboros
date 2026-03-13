import React, { memo } from 'react';
import type { CodeRow } from './codeViewTypes';

export interface LineNumberGutterProps {
  rows: CodeRow[];
  gutterWidth: number;
}

/**
 * Line number gutter — sticky left column showing 1-based line numbers.
 */
export const LineNumberGutter = memo(function LineNumberGutter({
  rows,
  gutterWidth,
}: LineNumberGutterProps): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: `${gutterWidth}px`,
        paddingTop: '16px',
        paddingBottom: '16px',
        textAlign: 'right',
        paddingRight: '4px',
        color: 'var(--text-faint)',
        backgroundColor: 'var(--bg)',
        position: 'sticky',
        left: 0,
        zIndex: 2,
        userSelect: 'none',
      }}
    >
      {rows.map((row) =>
        row.type === 'line' ? (
          <div key={`ln-${row.index}`} style={{ height: '1.6em' }}>
            {row.index + 1}
          </div>
        ) : (
          <div key={`fp-ln-${row.startLine}`} style={{ height: '1.6em' }} />
        )
      )}
    </div>
  );
});
