/**
 * ProfileEditor.test.tsx — Smoke tests for the ProfileEditor component.
 *
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Profile } from '../../types/electron';
import { ProfileEditor } from './ProfileEditor';

afterEach(cleanup);

// ─── Minimal electronAPI stub ─────────────────────────────────────────────────

function mockUpsert(profile: Profile): void {
  Object.assign(window, {
    electronAPI: {
      profileCrud: {
        upsert: vi.fn().mockResolvedValue({ success: true, profile }),
      },
      mcp: {
        getServers: vi.fn().mockResolvedValue({ success: true, servers: [] }),
      },
    },
  });
}

const BASE_PROFILE: Profile = {
  id: 'test-id',
  name: 'Test Profile',
  effort: 'medium',
  permissionMode: 'normal',
  builtIn: false,
  createdAt: 1000,
  updatedAt: 1000,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProfileEditor', () => {
  it('renders in create mode with empty name', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('New Profile')).toBeTruthy();
    const nameInput = screen.getByPlaceholderText('Profile name') as HTMLInputElement;
    expect(nameInput.value).toBe('');
  });

  it('renders in edit mode with pre-filled name', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={BASE_PROFILE} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(`Edit "${BASE_PROFILE.name}"`)).toBeTruthy();
    const nameInput = screen.getByPlaceholderText('Profile name') as HTMLInputElement;
    expect(nameInput.value).toBe('Test Profile');
  });

  it('Save button is disabled when name is empty', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const saveBtn = screen.getByText('Save profile').closest('button') as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('calls onCancel when cancel button is clicked', () => {
    mockUpsert(BASE_PROFILE);
    const onCancel = vi.fn();
    render(<ProfileEditor profile={null} onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('calls onSave with saved profile after successful upsert', async () => {
    const saved = { ...BASE_PROFILE, name: 'My Profile' };
    Object.assign(window, {
      electronAPI: {
        profileCrud: {
          upsert: vi.fn().mockResolvedValue({ success: true, profile: saved }),
        },
        mcp: {
          getServers: vi.fn().mockResolvedValue({ success: true, servers: [] }),
        },
      },
    });
    const onSave = vi.fn();
    render(<ProfileEditor profile={null} onSave={onSave} onCancel={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('Profile name');
    fireEvent.change(nameInput, { target: { value: 'My Profile' } });
    fireEvent.click(screen.getByText('Save profile'));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(saved);
    });
  });

  it('shows error message when upsert fails', async () => {
    Object.assign(window, {
      electronAPI: {
        profileCrud: {
          upsert: vi.fn().mockResolvedValue({ success: false, error: 'Cap reached' }),
        },
        mcp: {
          getServers: vi.fn().mockResolvedValue({ success: true, servers: [] }),
        },
      },
    });
    render(<ProfileEditor profile={null} onSave={vi.fn()} onCancel={vi.fn()} />);
    const nameInput = screen.getByPlaceholderText('Profile name');
    fireEvent.change(nameInput, { target: { value: 'Overflow' } });
    fireEvent.click(screen.getByText('Save profile'));
    await waitFor(() => {
      expect(screen.getByText('Cap reached')).toBeTruthy();
    });
  });

  it('renders effort segmented control', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={BASE_PROFILE} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('renders permission mode segmented control', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={BASE_PROFILE} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Normal')).toBeTruthy();
    expect(screen.getByText('Plan')).toBeTruthy();
    expect(screen.getByText('Bypass')).toBeTruthy();
  });

  it('renders tools checklist with all tools', () => {
    mockUpsert(BASE_PROFILE);
    render(<ProfileEditor profile={BASE_PROFILE} onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText('Write')).toBeTruthy();
    expect(screen.getByText('Bash')).toBeTruthy();
  });
});
