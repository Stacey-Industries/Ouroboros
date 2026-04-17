/**
 * ResearchModeToggle.test.tsx — Unit tests for Wave 30 Phase G tri-state
 * research mode segmented control.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResearchModeToggle } from './ResearchModeToggle';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockGetSessionMode = vi.fn();
const mockSetSessionMode = vi.fn();
const mockGetGlobalDefault = vi.fn();

beforeEach(() => {
  mockGetSessionMode.mockResolvedValue({ success: true, mode: 'conservative' });
  mockSetSessionMode.mockResolvedValue({ success: true });
  mockGetGlobalDefault.mockResolvedValue({
    success: true,
    globalEnabled: false,
    defaultMode: 'conservative',
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = {
    research: {
      getSessionMode: mockGetSessionMode,
      setSessionMode: mockSetSessionMode,
      getGlobalDefault: mockGetGlobalDefault,
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
});

// ─── Render helpers ───────────────────────────────────────────────────────────

function getButtons(): HTMLElement[] {
  return screen.getAllByRole('radio');
}

function getButtonByLabel(label: string): HTMLElement {
  return screen.getByRole('radio', { name: label });
}

// ─── Tests: structure ─────────────────────────────────────────────────────────

describe('ResearchModeToggle — structure', () => {
  it('renders a radiogroup container', () => {
    render(<ResearchModeToggle sessionId="sess-1" />);
    expect(screen.getByRole('radiogroup', { name: /research mode/i })).toBeTruthy();
  });

  it('renders exactly three mode buttons', () => {
    render(<ResearchModeToggle sessionId="sess-1" />);
    expect(getButtons()).toHaveLength(3);
  });

  it('renders Off, Conservative, and Aggressive buttons', () => {
    render(<ResearchModeToggle sessionId="sess-1" />);
    expect(getButtonByLabel('Off')).toBeTruthy();
    expect(getButtonByLabel('Conservative')).toBeTruthy();
    expect(getButtonByLabel('Aggressive')).toBeTruthy();
  });
});

// ─── Tests: hydration from session ────────────────────────────────────────────

describe('ResearchModeToggle — hydration from session', () => {
  it('calls getSessionMode with the provided sessionId on mount', async () => {
    render(<ResearchModeToggle sessionId="sess-42" />);
    await waitFor(() => expect(mockGetSessionMode).toHaveBeenCalledWith('sess-42'));
  });

  it('marks the returned mode as aria-checked=true', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'aggressive' });
    render(<ResearchModeToggle sessionId="sess-1" />);
    await waitFor(() => {
      const btn = getButtonByLabel('Aggressive') as HTMLButtonElement;
      expect(btn.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('marks other modes as aria-checked=false when aggressive is active', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'aggressive' });
    render(<ResearchModeToggle sessionId="sess-1" />);
    await waitFor(() => {
      expect(getButtonByLabel('Off').getAttribute('aria-checked')).toBe('false');
      expect(getButtonByLabel('Conservative').getAttribute('aria-checked')).toBe('false');
    });
  });
});

// ─── Tests: hydration without session (global default) ────────────────────────

describe('ResearchModeToggle — no sessionId uses global default', () => {
  it('calls getGlobalDefault when sessionId is null', async () => {
    render(<ResearchModeToggle sessionId={null} />);
    await waitFor(() => expect(mockGetGlobalDefault).toHaveBeenCalled());
    expect(mockGetSessionMode).not.toHaveBeenCalled();
  });

  it('reflects global defaultMode in the active button', async () => {
    mockGetGlobalDefault.mockResolvedValue({
      success: true,
      globalEnabled: true,
      defaultMode: 'off',
    });
    render(<ResearchModeToggle sessionId={null} />);
    await waitFor(() => {
      expect(getButtonByLabel('Off').getAttribute('aria-checked')).toBe('true');
    });
  });
});

// ─── Tests: click fires IPC ───────────────────────────────────────────────────

describe('ResearchModeToggle — click interactions', () => {
  it('calls setSessionMode with the clicked mode', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'conservative' });
    render(<ResearchModeToggle sessionId="sess-1" />);
    await waitFor(() => expect(mockGetSessionMode).toHaveBeenCalled());

    fireEvent.click(getButtonByLabel('Aggressive'));
    expect(mockSetSessionMode).toHaveBeenCalledWith('sess-1', 'aggressive');
  });

  it('updates aria-checked immediately on click (optimistic)', async () => {
    mockGetSessionMode.mockResolvedValue({ success: true, mode: 'conservative' });
    render(<ResearchModeToggle sessionId="sess-1" />);
    await waitFor(() => expect(mockGetSessionMode).toHaveBeenCalled());

    fireEvent.click(getButtonByLabel('Off'));
    expect(getButtonByLabel('Off').getAttribute('aria-checked')).toBe('true');
    expect(getButtonByLabel('Conservative').getAttribute('aria-checked')).toBe('false');
  });

  it('does NOT call setSessionMode when sessionId is null', async () => {
    render(<ResearchModeToggle sessionId={null} />);
    await waitFor(() => expect(mockGetGlobalDefault).toHaveBeenCalled());

    fireEvent.click(getButtonByLabel('Aggressive'));
    expect(mockSetSessionMode).not.toHaveBeenCalled();
  });
});
