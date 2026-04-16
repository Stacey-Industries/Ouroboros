/**
 * ComposerProfile.test.tsx — Smoke tests for the ComposerProfile pill.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import { ComposerProfile, PROFILE_SWITCHED_EVENT } from './ComposerProfile';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROFILES: Profile[] = [
  {
    id: 'builtin-reviewer',
    name: 'Reviewer',
    effort: 'high',
    permissionMode: 'plan',
    builtIn: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'user-p1',
    name: 'My Custom',
    effort: 'medium',
    permissionMode: 'normal',
    builtIn: false,
    createdAt: 1000,
    updatedAt: 1000,
  },
];

function setupApi(profiles: Profile[] = PROFILES): void {
  const listeners: Array<(p: Profile[]) => void> = [];
  Object.assign(window, {
    electronAPI: {
      profileCrud: {
        list: vi.fn().mockResolvedValue({ success: true, profiles }),
        onChanged: vi.fn().mockImplementation((cb: (p: Profile[]) => void) => {
          listeners.push(cb);
          return () => undefined;
        }),
      },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ComposerProfile', () => {
  it('shows "No profile" when activeProfileId is null', () => {
    setupApi();
    render(<ComposerProfile activeProfileId={null} onSwitch={vi.fn()} />);
    expect(screen.getByText('No profile')).toBeTruthy();
  });

  it('shows active profile name when a profile is selected', async () => {
    setupApi();
    render(<ComposerProfile activeProfileId="builtin-reviewer" onSwitch={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('Reviewer')).toBeTruthy());
  });

  it('opens dropdown on pill click', async () => {
    setupApi();
    render(<ComposerProfile activeProfileId={null} onSwitch={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch active profile/i }));
    // Both profiles should be listed in the dropdown
    await waitFor(() => expect(screen.getByText('Reviewer')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('My Custom')).toBeTruthy());
  });

  it('calls onSwitch with the selected profile id', async () => {
    setupApi();
    const onSwitch = vi.fn();
    render(<ComposerProfile activeProfileId="builtin-reviewer" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch active profile/i }));
    await waitFor(() => screen.getByText('My Custom'));
    // Click the second profile in dropdown
    const items = screen.getAllByText('My Custom');
    fireEvent.click(items[0]);
    expect(onSwitch).toHaveBeenCalledWith('user-p1');
  });

  it('does not call onSwitch when clicking the already-active profile', async () => {
    setupApi();
    const onSwitch = vi.fn();
    render(<ComposerProfile activeProfileId="builtin-reviewer" onSwitch={onSwitch} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch active profile/i }));
    await waitFor(() => screen.getAllByText('Reviewer'));
    // The first 'Reviewer' in the dropdown is the active item
    const items = screen.getAllByText('Reviewer');
    fireEvent.click(items[items.length - 1]);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('dispatches profile-switched DOM event on switch', async () => {
    setupApi();
    const events: CustomEvent[] = [];
    window.addEventListener(PROFILE_SWITCHED_EVENT, (e) => events.push(e as CustomEvent));

    render(<ComposerProfile activeProfileId="builtin-reviewer" onSwitch={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Switch active profile/i }));
    await waitFor(() => screen.getByText('My Custom'));
    fireEvent.click(screen.getByText('My Custom'));

    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({
      oldProfileId: 'builtin-reviewer',
      newProfileId: 'user-p1',
    });
  });

  it('closes dropdown on outside click', async () => {
    setupApi();
    render(
      <div>
        <div data-testid="outside">outside</div>
        <ComposerProfile activeProfileId={null} onSwitch={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Switch active profile/i }));
    await waitFor(() => screen.getByText('Reviewer'));
    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryAllByText('Reviewer').length).toBe(0));
  });
});
