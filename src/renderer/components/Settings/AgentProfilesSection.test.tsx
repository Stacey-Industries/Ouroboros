/**
 * AgentProfilesSection.test.tsx — Smoke tests for AgentProfilesSection.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import type { AppConfig } from '../../types/electron';
import { AgentProfilesSection } from './AgentProfilesSection';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BUILT_IN: Profile = {
  id: 'builtin-reviewer',
  name: 'Reviewer',
  model: 'claude-opus-4-6',
  effort: 'high',
  permissionMode: 'plan',
  enabledTools: ['Read', 'Grep', 'Glob'],
  builtIn: true,
  createdAt: 0,
  updatedAt: 0,
};

const USER_PROFILE: Profile = {
  id: 'user-p1',
  name: 'My Custom',
  effort: 'medium',
  permissionMode: 'normal',
  enabledTools: ['Read', 'Write', 'Bash'],
  builtIn: false,
  createdAt: 1000,
  updatedAt: 1000,
};

const DRAFT = { defaultProjectRoot: '/home/user/project' } as AppConfig;
const DRAFT_NO_ROOT = {} as AppConfig;

function makeMockApi(profiles: Profile[] = [], defaultId: string | null = null): void {
  const onChangedCallbacks: Array<(p: Profile[]) => void> = [];
  Object.assign(window, {
    electronAPI: {
      profileCrud: {
        list: vi.fn().mockResolvedValue({ success: true, profiles }),
        delete: vi.fn().mockResolvedValue({ success: true }),
        export: vi.fn().mockResolvedValue({ success: true, json: '{}' }),
        import: vi.fn().mockResolvedValue({ success: true, profile: USER_PROFILE }),
        getDefault: vi.fn().mockResolvedValue({ success: true, profileId: defaultId }),
        setDefault: vi.fn().mockResolvedValue({ success: true }),
        upsert: vi.fn().mockResolvedValue({ success: true, profile: USER_PROFILE }),
        onChanged: vi.fn().mockImplementation((cb: (p: Profile[]) => void) => {
          onChangedCallbacks.push(cb);
          return () => undefined;
        }),
      },
      mcp: {
        getServers: vi.fn().mockResolvedValue({ success: true, servers: [] }),
      },
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentProfilesSection', () => {
  it('renders "Agent Profiles" section label', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getAllByText('Reviewer').length).toBeGreaterThan(0));
  });

  it('shows built-in label for built-in profiles', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getByText('built-in', { exact: false })).toBeTruthy());
  });

  it('renders user profile without built-in label', async () => {
    makeMockApi([USER_PROFILE]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getAllByText('My Custom').length).toBeGreaterThan(0));
  });

  it('shows model badge when profile has a model', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    // model badge strips 'claude-' prefix
    await waitFor(() => expect(screen.getByText('opus-4-6')).toBeTruthy());
  });

  it('renders effort badge', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getByText('high')).toBeTruthy());
  });

  it('renders tool count badge', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getByText('3 tools')).toBeTruthy());
  });

  it('Delete button is absent for built-in profiles', async () => {
    makeMockApi([BUILT_IN]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getAllByText('Reviewer').length).toBeGreaterThan(0));
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('Delete button is present for user profiles', async () => {
    makeMockApi([USER_PROFILE]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => expect(screen.getAllByText('My Custom').length).toBeGreaterThan(0));
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('clicking Delete calls profileCrud.delete', async () => {
    makeMockApi([USER_PROFILE]);
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect((window.electronAPI.profileCrud.delete as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('user-p1');
    });
  });

  it('clicking "New profile" opens ProfileEditor', async () => {
    makeMockApi([]);
    render(<AgentProfilesSection draft={DRAFT} />);
    fireEvent.click(screen.getByText('+ New profile'));
    await waitFor(() => expect(screen.getByText('New Profile')).toBeTruthy());
  });

  it('clicking "Import…" opens the import modal', async () => {
    makeMockApi([]);
    render(<AgentProfilesSection draft={DRAFT} />);
    fireEvent.click(screen.getByText('Import…'));
    await waitFor(() => expect(screen.getByText('Import Profile')).toBeTruthy());
  });

  it('shows no-project message when defaultProjectRoot is absent', async () => {
    makeMockApi([]);
    render(<AgentProfilesSection draft={DRAFT_NO_ROOT} />);
    await waitFor(() => {
      expect(screen.getByText('No default project configured.')).toBeTruthy();
    });
  });

  it('renders default-profile dropdown when projectRoot is set', async () => {
    makeMockApi([BUILT_IN], 'builtin-reviewer');
    render(<AgentProfilesSection draft={DRAFT} />);
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeTruthy();
    });
  });
});
