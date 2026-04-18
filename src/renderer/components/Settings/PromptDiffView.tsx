/**
 * PromptDiffView.tsx — Settings pane that renders a unified per-line diff
 * of the system prompt between CLI versions.
 *
 * Wave 37 Phase B. Reachable from the toast "View diff" action or the
 * Settings → "Prompt Diff" tab. Uses design tokens only — no hardcoded colors.
 * NEVER logs or displays raw prompt text in log calls.
 */

import React, { useEffect, useState } from 'react';

import {
  claudeSectionHeaderTextStyle,
  claudeSectionRootStyle,
} from './claudeSectionContentStyles';
import type { DiffLine } from './lineDiff';
import { lineDiff } from './lineDiff';
import { SectionLabel } from './settingsStyles';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PromptDiffPayload {
  previousText: string;
  currentText: string;
  linesAdded: number;
  linesRemoved: number;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  marginTop: '16px',
  borderRadius: '6px',
  border: '1px solid var(--border-semantic)',
  overflow: 'hidden',
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  lineHeight: '1.6',
};

const emptyStyle: React.CSSProperties = {
  marginTop: '12px',
  fontSize: '13px',
  color: 'var(--text-semantic-muted)',
  fontStyle: 'italic',
};

const statsStyle: React.CSSProperties = {
  marginTop: '8px',
  fontSize: '12px',
  color: 'var(--text-semantic-secondary)',
};

function lineStyle(kind: DiffLine['kind']): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'block',
    padding: '1px 12px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };
  if (kind === 'insert') {
    return { ...base, background: 'var(--diff-add-bg)', color: 'var(--text-semantic-primary)' };
  }
  if (kind === 'delete') {
    return { ...base, background: 'var(--diff-del-bg)', color: 'var(--text-semantic-primary)' };
  }
  return { ...base, background: 'transparent', color: 'var(--text-semantic-secondary)' };
}

function prefixFor(kind: DiffLine['kind']): string {
  if (kind === 'insert') return '+ ';
  if (kind === 'delete') return '- ';
  return '  ';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DiffLineRow({ line }: { line: DiffLine }): React.ReactElement {
  return (
    <span style={lineStyle(line.kind)}>
      {prefixFor(line.kind)}{line.text}
    </span>
  );
}

function DiffStats({ payload }: { payload: PromptDiffPayload }): React.ReactElement {
  return (
    <p style={statsStyle}>
      <span style={{ color: 'var(--status-success)' }}>+{payload.linesAdded}</span>
      {' / '}
      <span style={{ color: 'var(--status-error)' }}>&minus;{payload.linesRemoved}</span>
      {' lines changed'}
    </p>
  );
}

function DiffBody({ payload }: { payload: PromptDiffPayload }): React.ReactElement {
  const lines = lineDiff(payload.previousText, payload.currentText);
  return (
    <div style={containerStyle}>
      <code style={{ display: 'block' }}>
        {lines.map((line, idx) => (
          // index key is stable here — the diff output is deterministic for a given payload
           
          <DiffLineRow key={idx} line={line} />
        ))}
      </code>
    </div>
  );
}

function PaneHeader(): React.ReactElement {
  return (
    <div>
      <SectionLabel>Prompt Diff</SectionLabel>
      <p className="text-text-semantic-muted" style={claudeSectionHeaderTextStyle}>
        Unified diff of the Claude Code system prompt between CLI versions.
        Captured automatically when a new session starts after a CLI upgrade.
      </p>
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function usePromptDiffPayload(): PromptDiffPayload | null {
  const [payload, setPayload] = useState<PromptDiffPayload | null>(null);

  useEffect(() => {
    if (!window.electronAPI?.ecosystem?.onPromptDiff) return undefined;
    return window.electronAPI.ecosystem.onPromptDiff((p) => setPayload(p));
  }, []);

  return payload;
}

// ── PromptDiffView ────────────────────────────────────────────────────────────

export function PromptDiffView(): React.ReactElement {
  const payload = usePromptDiffPayload();

  return (
    <div style={claudeSectionRootStyle}>
      <PaneHeader />
      {!payload && (
        <p style={emptyStyle}>
          No prompt diff captured yet. Upgrade the Claude CLI and start a new session to
          see changes here.
        </p>
      )}
      {payload && (
        <div>
          <DiffStats payload={payload} />
          <DiffBody payload={payload} />
        </div>
      )}
    </div>
  );
}
