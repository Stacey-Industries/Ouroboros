/**
 * PromptDiffView.test.tsx — jsdom smoke tests for Wave 37 Phase B diff pane.
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptDiffPayload } from './PromptDiffView';
import { PromptDiffView } from './PromptDiffView';

// ── Helpers ───────────────────────────────────────────────────────────────────

type DiffCallback = (payload: PromptDiffPayload) => void;

function makeElectronApi(onPromptDiff: (cb: DiffCallback) => () => void) {
  return {
    ecosystem: { onPromptDiff },
  };
}

afterEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PromptDiffView — heading', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: makeElectronApi(() => () => undefined),
    });
  });

  it('renders the section heading', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.getByText('Prompt Diff')).toBeDefined();
  });

  it('renders the description text', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.getByText(/unified diff/i)).toBeDefined();
  });
});

describe('PromptDiffView — empty state (no payload yet)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: makeElectronApi(() => () => undefined),
    });
  });

  it('shows the no-diff-yet message', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.getByText(/no prompt diff captured yet/i)).toBeDefined();
  });
});

describe('PromptDiffView — with diff payload', () => {
  const payload: PromptDiffPayload = {
    previousText: 'alpha\nbeta\ngamma',
    currentText: 'alpha\nDELTA\nEPSILON',
    linesAdded: 2,
    linesRemoved: 2,
  };

  beforeEach(() => {
    // Immediately invoke callback with the fixture payload
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: makeElectronApi((cb) => { cb(payload); return () => undefined; }),
    });
  });

  it('renders the stats line with added/removed counts', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.getByText('+2')).toBeDefined();
    // The minus sign may be an HTML entity — search by partial text
    expect(screen.getByText(/lines changed/i)).toBeDefined();
  });

  it('renders added lines with "+" prefix', async () => {
    await act(async () => { render(<PromptDiffView />); });
    const addedLines = screen.getAllByText(/^\+ /);
    expect(addedLines.length).toBeGreaterThan(0);
  });

  it('renders deleted lines with "-" prefix', async () => {
    await act(async () => { render(<PromptDiffView />); });
    const deletedLines = screen.getAllByText(/^- /);
    expect(deletedLines.length).toBeGreaterThan(0);
  });

  it('renders unchanged lines with two-space prefix', async () => {
    const { container } = await act(async () => render(<PromptDiffView />));
    // "alpha" is in both texts — rendered as a <span> whose textContent is "  alpha"
    const spans = Array.from(container.querySelectorAll('span'));
    const equalLine = spans.find((s) => s.textContent === '  alpha');
    expect(equalLine).toBeDefined();
  });

  it('does not render the empty-state message when payload is present', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.queryByText(/no prompt diff captured yet/i)).toBeNull();
  });
});

describe('PromptDiffView — electronAPI missing', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {},
    });
  });

  it('renders without crashing when ecosystem API is absent', async () => {
    await act(async () => { render(<PromptDiffView />); });
    expect(screen.getByText('Prompt Diff')).toBeDefined();
    expect(screen.getByText(/no prompt diff captured yet/i)).toBeDefined();
  });
});
