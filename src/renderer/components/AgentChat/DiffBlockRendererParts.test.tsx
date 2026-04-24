/**
 * DiffBlockRendererParts.test.tsx — Smoke tests for extracted diff row components.
 */
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ContextCollapser, ContextRow, DiffRow, HunkLines } from './DiffBlockRendererParts';

vi.mock('./AgentChatDiffReviewParts', () => ({
  parseUnifiedDiff: (raw: string) => {
    // Minimal parser stub: return one add line and one remove line
    const lines: Array<{ type: string; text: string; oldLineNo?: number; newLineNo?: number }> = [];
    for (const l of raw.split('\n')) {
      if (l.startsWith('+') && !l.startsWith('+++'))
        lines.push({ type: 'add', text: l.slice(1), newLineNo: 1 });
      else if (l.startsWith('-') && !l.startsWith('---'))
        lines.push({ type: 'remove', text: l.slice(1), oldLineNo: 1 });
      else if (l.startsWith('@'))
        lines.push({ type: 'hunk', text: l });
      else if (l.trim())
        lines.push({ type: 'context', text: l, oldLineNo: 1, newLineNo: 1 });
    }
    return lines;
  },
  DiffBadge: () => null,
}));

// ── ContextCollapser ───────────────────────────────────────────────────────────

describe('ContextCollapser', () => {
  it('renders the unchanged line count and a button', () => {
    const onExpand = vi.fn();
    render(
      <table>
        <tbody>
          <ContextCollapser count={12} onExpand={onExpand} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/Show 12 unchanged lines/)).toBeTruthy();
  });
});

// ── ContextRow ─────────────────────────────────────────────────────────────────

describe('ContextRow', () => {
  it('renders context line text', () => {
    const line = { type: 'context' as const, text: 'hello world', oldLineNo: 3, newLineNo: 3 };
    render(
      <table>
        <tbody>
          <ContextRow ci={0} l={line} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/hello world/)).toBeTruthy();
  });
});

// ── DiffRow ────────────────────────────────────────────────────────────────────

describe('DiffRow', () => {
  it('renders an add line with + prefix', () => {
    const line = { type: 'add' as const, text: 'new line', newLineNo: 5 };
    render(
      <table>
        <tbody>
          <DiffRow lineIdx={0} line={line} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/\+new line/)).toBeTruthy();
  });

  it('renders a remove line with - prefix', () => {
    const line = { type: 'remove' as const, text: 'old line', oldLineNo: 4 };
    render(
      <table>
        <tbody>
          <DiffRow lineIdx={1} line={line} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/-old line/)).toBeTruthy();
  });
});

// ── HunkLines ──────────────────────────────────────────────────────────────────

describe('HunkLines', () => {
  it('renders add and remove rows from raw hunk text', () => {
    const hunkRaw = '+added line\n-removed line';
    render(
      <table>
        <tbody>
          <HunkLines hunkRaw={hunkRaw} />
        </tbody>
      </table>,
    );
    expect(screen.getByText(/\+added line/)).toBeTruthy();
    expect(screen.getByText(/-removed line/)).toBeTruthy();
  });
});
