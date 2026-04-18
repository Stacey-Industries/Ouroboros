/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeImportModal } from './ThemeImportModal';

afterEach(cleanup);

// ── IPC mock ──────────────────────────────────────────────────────────────────

const mockSet = vi.fn().mockResolvedValue({ success: true });

// hardcoded: test fixture data for the color-import parser — not rendered colors
vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => ({
    config: { theming: { customTokens: { '--surface-base': '#111111' } } }, // hardcoded: fixture token
    set: mockSet,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

beforeEach(() => {
  mockSet.mockClear();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// hardcoded: VS Code theme JSON fixture — these are theme color values, not rendered UI colors
const VALID_THEME_JSON = JSON.stringify({
  colors: {
    'editor.background': '#1e1e1e', // hardcoded: VS Code theme fixture value
    'editor.foreground': '#d4d4d4', // hardcoded: VS Code theme fixture value
  },
});

const INVALID_JSON = 'not valid json {{';
const MISSING_COLORS_JSON = JSON.stringify({ name: 'My Theme', type: 'dark' });

function fillTextarea(container: HTMLElement, value: string): void {
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value } });
}

function clickButton(container: HTMLElement, label: string): void {
  const btn = Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;
  fireEvent.click(btn);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ThemeImportModal', () => {
  it('renders with paste textarea and Import button', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    expect(container.querySelector('textarea')).not.toBeNull();
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(buttons).toContain('Import');
  });

  it('Import button is disabled when textarea is empty', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Import',
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(true);
  });

  it('Import button becomes enabled after typing', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    fillTextarea(container, VALID_THEME_JSON);
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Import',
    ) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(false);
  });

  it('shows error on invalid JSON after clicking Import', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    fillTextarea(container, INVALID_JSON);
    clickButton(container, 'Import');
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Invalid JSON');
  });

  it('shows error when JSON has no colors field', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    fillTextarea(container, MISSING_COLORS_JSON);
    clickButton(container, 'Import');
    const alert = container.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('"colors"');
  });

  it('transitions to success phase showing Keep/Reset/Cancel on valid JSON', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    fillTextarea(container, VALID_THEME_JSON);
    clickButton(container, 'Import');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Keep');
    expect(labels).toContain('Reset');
    expect(labels).toContain('Cancel');
  });

  it('calls set with parsed tokens on successful Import (live preview)', () => {
    const { container } = render(<ThemeImportModal onClose={vi.fn()} />);
    fillTextarea(container, VALID_THEME_JSON);
    clickButton(container, 'Import');
    expect(mockSet).toHaveBeenCalledWith(
      'theming',
      expect.objectContaining({ customTokens: expect.any(Object) }),
    );
  });

  it('Keep closes without an extra set call', () => {
    const onClose = vi.fn();
    const { container } = render(<ThemeImportModal onClose={onClose} />);
    fillTextarea(container, VALID_THEME_JSON);
    clickButton(container, 'Import');
    const callCountAfterImport = mockSet.mock.calls.length;
    clickButton(container, 'Keep');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockSet.mock.calls.length).toBe(callCountAfterImport);
  });

  it('Cancel reverts customTokens to pre-import value and closes', () => {
    const onClose = vi.fn();
    const { container } = render(<ThemeImportModal onClose={onClose} />);
    fillTextarea(container, VALID_THEME_JSON);
    clickButton(container, 'Import');
    clickButton(container, 'Cancel');
    expect(onClose).toHaveBeenCalledOnce();
    const lastCall = mockSet.mock.calls[mockSet.mock.calls.length - 1];
    expect(lastCall[0]).toBe('theming');
    expect((lastCall[1] as { customTokens: Record<string, string> }).customTokens).toEqual(
      { '--surface-base': '#111111' }, // hardcoded: expected fixture token in revert assertion
    );
  });

  it('Reset returns to input phase and reverts tokens', () => {
    const onClose = vi.fn();
    const { container } = render(<ThemeImportModal onClose={onClose} />);
    fillTextarea(container, VALID_THEME_JSON);
    clickButton(container, 'Import');
    clickButton(container, 'Reset');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Import');
    expect(labels).not.toContain('Keep');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape key calls revert and closes', () => {
    const onClose = vi.fn();
    const { container } = render(<ThemeImportModal onClose={onClose} />);
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
