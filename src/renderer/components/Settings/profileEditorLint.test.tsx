/**
 * profileEditorLint.test.tsx — Tests for useProfileLint hook and LintWarnings component.
 *
 * Wave 26 Phase D.
 * @vitest-environment jsdom
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Profile, ProfileLintItem } from '../../types/electron';
import { LintWarnings, useProfileLint } from './profileEditorLint';

// ─── Mock electronAPI ─────────────────────────────────────────────────────────

const mockLint = vi.fn();

function stubElectronApi(lints: ProfileLintItem[]): void {
  // Assign directly to avoid replacing the window object.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).electronAPI = {
    profileCrud: {
      lint: mockLint.mockResolvedValue({ success: true, lints }),
    },
  };
}

beforeEach(() => {
  mockLint.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).electronAPI;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return { id: 'p1', name: 'Test', createdAt: 0, updatedAt: 0, ...overrides };
}

/** Minimal wrapper to exercise the useProfileLint hook. */
function LintHookConsumer({
  draft,
  onLints,
}: {
  draft: Partial<Profile>;
  onLints: (l: ProfileLintItem[]) => void;
}): React.ReactElement {
  const lints = useProfileLint(draft);
  onLints(lints);
  return <LintWarnings lints={lints} />;
}

// ─── useProfileLint ───────────────────────────────────────────────────────────

describe('useProfileLint — debounce', () => {
  it('does not call lint before the 300 ms debounce fires', () => {
    stubElectronApi([]);
    const onLints = vi.fn();
    render(<LintHookConsumer draft={makeProfile()} onLints={onLints} />);
    expect(mockLint).not.toHaveBeenCalled();
  });

  it('calls profileCrud.lint after 300 ms', async () => {
    stubElectronApi([]);
    render(<LintHookConsumer draft={makeProfile()} onLints={() => undefined} />);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(mockLint).toHaveBeenCalledOnce();
    expect(mockLint).toHaveBeenCalledWith({ profile: expect.objectContaining({ id: 'p1' }) });
  });

  it('skips the API call when id or name is missing', async () => {
    stubElectronApi([]);
    render(<LintHookConsumer draft={{ name: '' }} onLints={() => undefined} />);
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(mockLint).not.toHaveBeenCalled();
  });
});

describe('useProfileLint — results', () => {
  it('returns lints received from the API', async () => {
    const lints: ProfileLintItem[] = [
      { severity: 'warn', message: 'Scaffolder without Write/Edit is incoherent' },
    ];
    stubElectronApi(lints);
    const captured: ProfileLintItem[][] = [];
    render(
      <LintHookConsumer
        draft={makeProfile()}
        onLints={(l) => { captured.push(l); }}
      />,
    );
    // Fire debounce then flush all pending microtasks/promises.
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => { await Promise.resolve(); });
    expect(captured.some((c) => c.length > 0)).toBe(true);
    const last = captured[captured.length - 1];
    expect(last[0].severity).toBe('warn');
    expect(last[0].message).toMatch(/Scaffolder/);
  });

  it('returns empty array when API returns no lints', async () => {
    stubElectronApi([]);
    const captured: ProfileLintItem[][] = [];
    render(
      <LintHookConsumer draft={makeProfile()} onLints={(l) => { captured.push(l); }} />,
    );
    await act(async () => { vi.advanceTimersByTime(300); });
    await act(async () => { await Promise.resolve(); });
    expect(mockLint).toHaveBeenCalled();
    const last = captured[captured.length - 1];
    expect(last).toHaveLength(0);
  });
});

// ─── LintWarnings ─────────────────────────────────────────────────────────────

describe('LintWarnings — rendering', () => {
  it('renders nothing when lints array is empty', () => {
    const { container } = render(<LintWarnings lints={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a warning message with "Warning:" prefix', () => {
    render(
      <LintWarnings
        lints={[{ severity: 'warn', message: 'Agent cannot act.' }]}
      />,
    );
    expect(screen.getByText(/Warning:.*Agent cannot act/i)).toBeTruthy();
  });

  it('renders an error message with "Error:" prefix', () => {
    render(
      <LintWarnings
        lints={[{ severity: 'error', message: 'bypass + Bash is high-risk.' }]}
      />,
    );
    expect(screen.getByText(/Error:.*bypass/i)).toBeTruthy();
  });

  it('renders multiple lint items', () => {
    const lints: ProfileLintItem[] = [
      { severity: 'warn', message: 'First warning.' },
      { severity: 'error', message: 'Fatal error.' },
    ];
    render(<LintWarnings lints={lints} />);
    expect(screen.getByText(/Warning:.*First warning/i)).toBeTruthy();
    expect(screen.getByText(/Error:.*Fatal error/i)).toBeTruthy();
  });

  it('applies error CSS class for error severity', () => {
    const { container } = render(
      <LintWarnings lints={[{ severity: 'error', message: 'Bad.' }]} />,
    );
    const el = container.querySelector('.text-status-error');
    expect(el).toBeTruthy();
  });

  it('applies warning CSS class for warn severity', () => {
    const { container } = render(
      <LintWarnings lints={[{ severity: 'warn', message: 'Meh.' }]} />,
    );
    const el = container.querySelector('.text-status-warning');
    expect(el).toBeTruthy();
  });
});
