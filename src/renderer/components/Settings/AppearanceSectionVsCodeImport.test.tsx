/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppearanceSectionVsCodeImport } from './AppearanceSectionVsCodeImport';

afterEach(cleanup);

// ── Mocks ─────────────────────────────────────────────────────────────────────
// hardcoded: test fixture token values for the color-import feature — not rendered UI colors

const mockSet = vi.fn().mockResolvedValue({ success: true });

function makeUseConfig(customTokens: Record<string, string> = {}) {
  return {
    config: { theming: { customTokens } },
    set: mockSet,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  };
}

const useConfigMock = vi.fn();
vi.mock('../../hooks/useConfig', () => ({
  useConfig: () => useConfigMock(),
}));

vi.mock('./ThemeImportModal', () => ({
  ThemeImportModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="theme-import-modal">
      <button onClick={onClose} type="button">Close modal</button>
    </div>
  ),
}));

beforeEach(() => {
  mockSet.mockClear();
  useConfigMock.mockReturnValue(makeUseConfig());
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppearanceSectionVsCodeImport', () => {
  it('renders Import button and "No custom token overrides" when tokens are empty', () => {
    const { container } = render(<AppearanceSectionVsCodeImport />);
    expect(container.textContent).toContain('No custom token overrides active');
    const labels = Array.from(container.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toContain('Import VS Code theme');
  });

  it('shows override count when customTokens are present', () => {
    useConfigMock.mockReturnValue(
      makeUseConfig({ '--surface-base': '#1e1e1e', '--text-primary': '#d4d4d4' }), // hardcoded: fixture token data
    );
    const { container } = render(<AppearanceSectionVsCodeImport />);
    expect(container.textContent).toContain('2 custom tokens applied');
  });

  it('shows singular "token" when count is 1', () => {
    useConfigMock.mockReturnValue(makeUseConfig({ '--surface-base': '#1e1e1e' })); // hardcoded: fixture token data
    const { container } = render(<AppearanceSectionVsCodeImport />);
    expect(container.textContent).toContain('1 custom token applied');
    expect(container.textContent).not.toContain('1 custom tokens');
  });

  it('Reset overrides button is disabled when no tokens', () => {
    const { container } = render(<AppearanceSectionVsCodeImport />);
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset overrides',
    ) as HTMLButtonElement;
    expect(resetBtn).not.toBeNull();
    expect(resetBtn.disabled).toBe(true);
  });

  it('Reset overrides button is enabled when tokens exist', () => {
    useConfigMock.mockReturnValue(makeUseConfig({ '--surface-base': '#1e1e1e' })); // hardcoded: fixture token data
    const { container } = render(<AppearanceSectionVsCodeImport />);
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset overrides',
    ) as HTMLButtonElement;
    expect(resetBtn.disabled).toBe(false);
  });

  it('clicking Reset overrides calls set with empty customTokens', () => {
    useConfigMock.mockReturnValue(makeUseConfig({ '--surface-base': '#1e1e1e' })); // hardcoded: fixture token data
    const { container } = render(<AppearanceSectionVsCodeImport />);
    const resetBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Reset overrides',
    ) as HTMLButtonElement;
    fireEvent.click(resetBtn);
    expect(mockSet).toHaveBeenCalledWith('theming', expect.objectContaining({ customTokens: {} }));
  });

  it('clicking Import VS Code theme opens the modal', () => {
    const { container } = render(<AppearanceSectionVsCodeImport />);
    expect(container.querySelector('[data-testid="theme-import-modal"]')).toBeNull();
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Import VS Code theme',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    expect(container.querySelector('[data-testid="theme-import-modal"]')).not.toBeNull();
  });

  it('closing the modal hides it', () => {
    const { container } = render(<AppearanceSectionVsCodeImport />);
    const importBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Import VS Code theme',
    ) as HTMLButtonElement;
    fireEvent.click(importBtn);
    const closeBtn = container.querySelector(
      '[data-testid="theme-import-modal"] button',
    ) as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(container.querySelector('[data-testid="theme-import-modal"]')).toBeNull();
  });
});
