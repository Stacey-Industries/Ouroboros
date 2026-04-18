/**
 * ChangelogDrawer.test.tsx — smoke tests for ChangelogDrawer.
 * Wave 38 Phase E.
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../types/electron';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSet = vi.fn();

vi.mock('../../hooks/useConfig', () => ({
  useConfig: vi.fn(),
}));

vi.mock('./useShouldShowChangelog', () => ({
  useShouldShowChangelog: vi.fn(),
}));

vi.mock('@renderer/generated/changelog', () => ({
  CHANGELOG: {
    '2.4.1': { version: '2.4.1', date: '2026-04-17', added: ['Ecosystem moat'] },
    '2.4.0': { version: '2.4.0', date: '2026-04-17', added: ['Multi-provider support'] },
  },
  VERSION_ORDER: ['2.4.1', '2.4.0'],
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChangelogDrawer', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders changelog entries when shouldShow is true', async () => {
    const { useConfig } = await import('../../hooks/useConfig');
    const { useShouldShowChangelog } = await import('./useShouldShowChangelog');

    vi.mocked(useConfig).mockReturnValue({
      config: { platform: { lastSeenVersion: '2.3.0' } } as unknown as AppConfig,
      isLoading: false,
      error: null,
      set: mockSet,
      refresh: vi.fn(),
    });

    vi.mocked(useShouldShowChangelog).mockReturnValue({
      shouldShow: true,
      currentVersion: '2.4.1',
      visibleVersions: ['2.4.1', '2.4.0'],
      moduleAbsent: false,
    });

    const { ChangelogDrawer } = await import('./ChangelogDrawer');
    render(<ChangelogDrawer />);

    await waitFor(() => expect(screen.getByText("What's new")).toBeDefined());
    expect(screen.getByText('Ecosystem moat')).toBeDefined();
    expect(screen.getByText('Multi-provider support')).toBeDefined();
  });

  it('Dismiss button calls set with currentVersion as lastSeenVersion', async () => {
    const { useConfig } = await import('../../hooks/useConfig');
    const { useShouldShowChangelog } = await import('./useShouldShowChangelog');

    vi.mocked(useConfig).mockReturnValue({
      config: { platform: { lastSeenVersion: '2.3.0' } } as unknown as AppConfig,
      isLoading: false,
      error: null,
      set: mockSet,
      refresh: vi.fn(),
    });

    vi.mocked(useShouldShowChangelog).mockReturnValue({
      shouldShow: true,
      currentVersion: '2.4.1',
      visibleVersions: ['2.4.1'],
      moduleAbsent: false,
    });

    const { ChangelogDrawer } = await import('./ChangelogDrawer');
    render(<ChangelogDrawer />);

    await waitFor(() => screen.getByRole('button', { name: /dismiss all/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss all/i }));

    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith(
        'platform',
        expect.objectContaining({ lastSeenVersion: '2.4.1' }),
      ),
    );
  });

  it('renders missing-module warning when moduleAbsent is true', async () => {
    const { useConfig } = await import('../../hooks/useConfig');
    const { useShouldShowChangelog } = await import('./useShouldShowChangelog');

    vi.mocked(useConfig).mockReturnValue({
      config: {} as unknown as AppConfig,
      isLoading: false,
      error: null,
      set: mockSet,
      refresh: vi.fn(),
    });

    vi.mocked(useShouldShowChangelog).mockReturnValue({
      shouldShow: false,
      currentVersion: null,
      visibleVersions: [],
      moduleAbsent: true,
    });

    const { ChangelogDrawer } = await import('./ChangelogDrawer');
    render(<ChangelogDrawer />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/npm run build:changelog/i)).toBeDefined();
  });

  it('renders nothing when shouldShow is false and module is present', async () => {
    const { useConfig } = await import('../../hooks/useConfig');
    const { useShouldShowChangelog } = await import('./useShouldShowChangelog');

    vi.mocked(useConfig).mockReturnValue({
      config: { platform: { lastSeenVersion: '2.4.1' } } as unknown as AppConfig,
      isLoading: false,
      error: null,
      set: mockSet,
      refresh: vi.fn(),
    });

    vi.mocked(useShouldShowChangelog).mockReturnValue({
      shouldShow: false,
      currentVersion: '2.4.1',
      visibleVersions: [],
      moduleAbsent: false,
    });

    const { ChangelogDrawer } = await import('./ChangelogDrawer');
    const { container } = render(<ChangelogDrawer />);

    expect(container.firstChild).toBeNull();
  });
});
