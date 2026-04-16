/**
 * AgentProfilesSectionHelpers.test.tsx — Smoke tests for helper components/hooks.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import {
  Badge,
  ImportModal,
  ProfileRow,
  ProfileRowActions,
  useDefaultProfile,
  useProfileList,
} from './AgentProfilesSectionHelpers';

afterEach(cleanup);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROFILE: Profile = {
  id: 'p1',
  name: 'Reviewer',
  model: 'claude-opus-4-6',
  effort: 'high',
  permissionMode: 'plan',
  enabledTools: ['Read', 'Grep'],
  builtIn: true,
  createdAt: 0,
  updatedAt: 0,
};

const USER_PROFILE: Profile = {
  id: 'p2',
  name: 'Custom',
  effort: 'medium',
  permissionMode: 'normal',
  builtIn: false,
  createdAt: 1000,
  updatedAt: 1000,
};

function makeApi(profiles: Profile[] = [PROFILE, USER_PROFILE]): void {
  const listeners: Array<(p: Profile[]) => void> = [];
  Object.assign(window, {
    electronAPI: {
      profileCrud: {
        list: vi.fn().mockResolvedValue({ success: true, profiles }),
        onChanged: vi.fn().mockImplementation((cb: (p: Profile[]) => void) => {
          listeners.push(cb);
          return () => undefined;
        }),
        import: vi.fn().mockResolvedValue({ success: true, profile: USER_PROFILE }),
        getDefault: vi.fn().mockResolvedValue({ success: true, profileId: null }),
        setDefault: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  });
}

// ─── Badge ────────────────────────────────────────────────────────────────────

describe('Badge', () => {
  it('renders label text', () => {
    render(<Badge label="high" tone="neutral" />);
    expect(screen.getByText('high')).toBeTruthy();
  });

  it('renders without error for accent tone', () => {
    render(<Badge label="sonnet" tone="accent" />);
    expect(screen.getByText('sonnet')).toBeTruthy();
  });
});

// ─── ProfileRowActions ────────────────────────────────────────────────────────

describe('ProfileRowActions', () => {
  it('shows all action buttons', () => {
    render(
      <ProfileRowActions
        isBuiltIn={false}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Dup')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('hides Delete for built-in profiles', () => {
    render(
      <ProfileRowActions
        isBuiltIn={true}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.queryByText('Delete')).toBeNull();
  });

  it('calls onEdit when Edit is clicked', () => {
    const onEdit = vi.fn();
    render(
      <ProfileRowActions
        isBuiltIn={false}
        onEdit={onEdit}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('calls onDelete when Delete is clicked', () => {
    const onDelete = vi.fn();
    render(
      <ProfileRowActions
        isBuiltIn={false}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={onDelete}
        onExport={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

// ─── ProfileRow ───────────────────────────────────────────────────────────────

describe('ProfileRow', () => {
  it('renders profile name', () => {
    render(
      <ProfileRow
        profile={PROFILE}
        isLast={true}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('Reviewer')).toBeTruthy();
  });

  it('shows model badge (strips claude- prefix)', () => {
    render(
      <ProfileRow
        profile={PROFILE}
        isLast={true}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('opus-4-6')).toBeTruthy();
  });

  it('shows effort badge', () => {
    render(
      <ProfileRow
        profile={PROFILE}
        isLast={true}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('high')).toBeTruthy();
  });

  it('shows tool count badge', () => {
    render(
      <ProfileRow
        profile={PROFILE}
        isLast={true}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText('2 tools')).toBeTruthy();
  });
});

// ─── ImportModal ──────────────────────────────────────────────────────────────

describe('ImportModal', () => {
  it('renders title and textarea', () => {
    render(<ImportModal onImport={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Import Profile')).toBeTruthy();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<ImportModal onImport={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onImport with textarea content when Import is clicked', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined);
    render(<ImportModal onImport={onImport} onClose={vi.fn()} />);
    const ta = screen.getByRole('textbox');
    fireEvent.change(ta, { target: { value: '{"id":"x","name":"X"}' } });
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith('{"id":"x","name":"X"}');
    });
  });

  it('shows error message when onImport throws', async () => {
    const onImport = vi.fn().mockRejectedValue(new Error('Parse error'));
    render(<ImportModal onImport={onImport} onClose={vi.fn()} />);
    const ta = screen.getByRole('textbox');
    fireEvent.change(ta, { target: { value: 'bad json' } });
    fireEvent.click(screen.getByText('Import'));
    await waitFor(() => {
      expect(screen.getByText('Parse error')).toBeTruthy();
    });
  });
});

// ─── useProfileList ───────────────────────────────────────────────────────────

import { act, renderHook } from '@testing-library/react';

describe('useProfileList', () => {
  it('loads profiles on mount', async () => {
    makeApi();
    const { result } = renderHook(() => useProfileList());
    await act(async () => {});
    expect(result.current.profiles).toHaveLength(2);
  });
});

// ─── useDefaultProfile ────────────────────────────────────────────────────────

describe('useDefaultProfile', () => {
  it('fetches default profile id on mount', async () => {
    makeApi();
    const { result } = renderHook(() => useDefaultProfile('/project'));
    await act(async () => {});
    expect(result.current.defaultId).toBeNull();
  });

  it('returns null when projectRoot is empty', async () => {
    makeApi();
    const { result } = renderHook(() => useDefaultProfile(''));
    await act(async () => {});
    expect(result.current.defaultId).toBeNull();
  });
});
