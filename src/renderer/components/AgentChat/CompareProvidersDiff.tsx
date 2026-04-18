/**
 * CompareProvidersDiff.tsx — Wave 36 Phase F
 *
 * Renders a per-word diff between two provider outputs.
 * Uses the inline wordDiff utility — no new deps.
 */

import React, { useMemo } from 'react';

import { wordDiff } from './wordDiff';

// ─── Styles ───────────────────────────────────────────────────────────────────

const CONTAINER_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  fontFamily: 'var(--font-editor, monospace)',
  fontSize: '13px',
  lineHeight: '1.6',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
};

const TOKEN_STYLES: Record<'equal' | 'insert' | 'delete', React.CSSProperties> = {
  equal: {},
  insert: {
    backgroundColor: 'var(--diff-add-bg)',
    borderBottom: '1px solid var(--diff-add-border)',
    borderRadius: '2px',
  },
  delete: {
    backgroundColor: 'var(--diff-del-bg)',
    borderBottom: '1px solid var(--diff-del-border)',
    textDecoration: 'line-through',
    borderRadius: '2px',
  },
};

// ─── Legend ───────────────────────────────────────────────────────────────────

const HEADER_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: '16px',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: '12px',
  flexShrink: 0,
};

interface DiffLegendProps { labelA: string; labelB: string }

function DiffLegend({ labelA, labelB }: DiffLegendProps): React.ReactElement {
  return (
    <div style={HEADER_STYLE}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ ...TOKEN_STYLES.delete, padding: '1px 4px' }}>{labelA} only</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ ...TOKEN_STYLES.insert, padding: '1px 4px' }}>{labelB} only</span>
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CompareProvidersDiffProps {
  textA: string;
  textB: string;
  labelA: string;
  labelB: string;
}

export function CompareProvidersDiff({
  textA,
  textB,
  labelA,
  labelB,
}: CompareProvidersDiffProps): React.ReactElement {
  const tokens = useMemo(() => wordDiff(textA, textB), [textA, textB]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <DiffLegend labelA={labelA} labelB={labelB} />
      <div style={CONTAINER_STYLE}>
        {tokens.length === 0 && (
          <span className="text-text-semantic-muted">No output to diff yet.</span>
        )}
        {tokens.map((token, i) => (
          <span
            key={i}
            style={token.kind === 'equal' ? undefined : TOKEN_STYLES[token.kind]}
          >
            {token.text}
          </span>
        ))}
      </div>
    </div>
  );
}
