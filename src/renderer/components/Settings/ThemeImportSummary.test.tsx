/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { VsCodeThemeImportResult } from '../../themes/vsCodeImport';
import { ThemeImportSummary } from './ThemeImportSummary';

afterEach(cleanup);

// hardcoded: test fixture data for the color-import parser — not rendered colors
const makeResult = (overrides: Partial<VsCodeThemeImportResult> = {}): VsCodeThemeImportResult => ({
  tokens: { '--surface-base': '#1e1e1e' }, // hardcoded: fixture token data
  appliedKeys: ['editor.background'],
  unsupportedKeys: [],
  warnings: [],
  ...overrides,
});

describe('ThemeImportSummary', () => {
  it('renders applied count and total', () => {
    const result = makeResult({
      appliedKeys: ['editor.background', 'editor.foreground'],
      unsupportedKeys: ['editor.unknown'],
    });
    const { container } = render(<ThemeImportSummary result={result} />);
    const text = container.textContent ?? '';
    expect(text).toContain('2');
    expect(text).toContain('3');
    expect(text).toContain('1');
  });

  it('hides unsupported section when there are none', () => {
    const { container } = render(<ThemeImportSummary result={makeResult()} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBe(0);
  });

  it('shows unsupported toggle button when keys exist', () => {
    const result = makeResult({ unsupportedKeys: ['foo.bar', 'baz.qux'] });
    const { container } = render(<ThemeImportSummary result={result} />);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('2 unsupported keys');
  });

  it('expands unsupported list on toggle click', () => {
    const result = makeResult({ unsupportedKeys: ['foo.bar'] });
    const { container } = render(<ThemeImportSummary result={result} />);
    const btn = container.querySelector('button') as HTMLButtonElement;
    fireEvent.click(btn);
    const items = container.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe('foo.bar');
  });

  it('renders warnings when present', () => {
    const result = makeResult({ warnings: ['alpha stripped from #ff0000ff'] }); // hardcoded: warning string fixture
    const { container } = render(<ThemeImportSummary result={result} />);
    expect(container.textContent).toContain('alpha stripped');
  });

  it('renders nothing extra when no warnings and no unsupported', () => {
    const result = makeResult({ warnings: [], unsupportedKeys: [] });
    const { container } = render(<ThemeImportSummary result={result} />);
    expect(container.querySelectorAll('button').length).toBe(0);
    expect(container.querySelectorAll('li').length).toBe(0);
  });
});
