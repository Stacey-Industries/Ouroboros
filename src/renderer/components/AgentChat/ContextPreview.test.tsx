/**
 * @vitest-environment jsdom
 *
 * ContextPreview.test.tsx — Smoke tests for the ContextPreview component.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextPreviewModel } from '../../hooks/useContextPreview';
import { ContextPreview } from './ContextPreview';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPTY_MODEL: ContextPreviewModel = {
  items: [],
  totals: {
    files: 0,
    memory: 0,
    rules: 0,
    skills: 0,
    system: 0,
    tools: 0,
    totalItems: 0,
    totalTokens: 0,
  },
};

const MODEL_WITH_ITEMS: ContextPreviewModel = {
  items: [
    { detail: 'Project', estimatedTokens: 12, id: 'rule:testing', kind: 'rule', label: 'testing' },
    { detail: 'sonnet-implementer', estimatedTokens: 4, id: 'skill:impl:1000', kind: 'skill', label: 'implement-feature' },
    { detail: '/project/README.md', estimatedTokens: 400, id: 'file:/project/README.md', kind: 'file', label: 'README.md' },
    { estimatedTokens: 1, id: 'tool:Bash', kind: 'tool', label: 'Bash' },
  ],
  totals: {
    files: 1,
    memory: 0,
    rules: 1,
    skills: 1,
    system: 0,
    tools: 1,
    totalItems: 4,
    totalTokens: 417,
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContextPreview', () => {
  it('renders the strip toggle button', () => {
    render(<ContextPreview model={EMPTY_MODEL} isOpen={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId('context-preview-toggle')).toBeDefined();
  });

  it('does not render the popover when isOpen is false', () => {
    render(<ContextPreview model={EMPTY_MODEL} isOpen={false} onToggle={vi.fn()} />);
    expect(screen.queryByTestId('context-preview-popover')).toBeNull();
  });

  it('renders the popover when isOpen is true', () => {
    render(<ContextPreview model={EMPTY_MODEL} isOpen={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId('context-preview-popover')).toBeDefined();
  });

  it('popover has role="dialog"', () => {
    render(<ContextPreview model={EMPTY_MODEL} isOpen={true} onToggle={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('calls onToggle when strip is clicked', () => {
    const onToggle = vi.fn();
    render(<ContextPreview model={EMPTY_MODEL} isOpen={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('context-preview-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('calls onToggle when popover close button is clicked', () => {
    const onToggle = vi.fn();
    render(<ContextPreview model={EMPTY_MODEL} isOpen={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByLabelText('Close context preview'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders all 6 tabs when popover is open', () => {
    render(<ContextPreview model={MODEL_WITH_ITEMS} isOpen={true} onToggle={vi.fn()} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(6);
    // textContent includes the count badge (e.g. "Rules1"), so use startsWith
    const labels = tabs.map((t) => t.textContent?.trim() ?? '');
    expect(labels.some((l) => l.startsWith('Rules'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Skills'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Memory'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Files'))).toBe(true);
    expect(labels.some((l) => l.startsWith('Tools'))).toBe(true);
    expect(labels.some((l) => l.startsWith('System'))).toBe(true);
  });

  it('shows Rules tab content by default', () => {
    render(<ContextPreview model={MODEL_WITH_ITEMS} isOpen={true} onToggle={vi.fn()} />);
    expect(screen.getByText('testing')).toBeDefined();
  });

  it('switches tabs on click and shows relevant items', () => {
    render(<ContextPreview model={MODEL_WITH_ITEMS} isOpen={true} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Files/i }));
    expect(screen.getByText('README.md')).toBeDefined();
  });

  it('shows empty message on Memory tab (not yet wired)', () => {
    render(<ContextPreview model={MODEL_WITH_ITEMS} isOpen={true} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: /Memory/i }));
    expect(screen.getByText(/not yet wired/i)).toBeDefined();
  });

  it('strip shows item summary from model totals', () => {
    render(<ContextPreview model={MODEL_WITH_ITEMS} isOpen={false} onToggle={vi.fn()} />);
    const toggle = screen.getByTestId('context-preview-toggle');
    expect(toggle.textContent).toMatch(/rule/i);
    expect(toggle.textContent).toMatch(/file/i);
  });
});
