/**
 * @vitest-environment jsdom
 *
 * AgentChatComposerSection.helpers.test.ts — smoke tests for extracted hooks.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useActiveProfile,
  useComposerToggleState,
  useSessionData,
} from './AgentChatComposerSection.helpers';

// ── Mock electronAPI ──────────────────────────────────────────────────────────

const mockSessionList = vi.fn();
const mockSessionOnChanged = vi.fn();
const mockSessionSetProfile = vi.fn();
const mockProfileList = vi.fn();

function installApi(): void {
  Object.defineProperty(window, 'electronAPI', {
    value: {
      sessionCrud: {
        list: mockSessionList,
        onChanged: mockSessionOnChanged,
        setProfile: mockSessionSetProfile,
      },
      profileCrud: {
        list: mockProfileList,
      },
    },
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  installApi();
  mockSessionList.mockResolvedValue({ success: true, sessions: [] });
  mockSessionOnChanged.mockReturnValue(() => undefined); // returns unsubscribe noop
  mockSessionSetProfile.mockResolvedValue({ success: true });
  mockProfileList.mockResolvedValue({ success: true, profiles: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── useComposerToggleState ────────────────────────────────────────────────────

describe('useComposerToggleState', () => {
  it('starts with both panels closed', () => {
    const { result } = renderHook(() => useComposerToggleState(undefined, undefined, undefined));
    expect(result.current.showTools).toBe(false);
    expect(result.current.showMcp).toBe(false);
  });

  it('setShowTools toggles the tools panel', () => {
    const { result } = renderHook(() => useComposerToggleState(undefined, undefined, undefined));
    act(() => result.current.setShowTools(true));
    expect(result.current.showTools).toBe(true);
  });

  it('setShowMcp toggles the mcp panel', () => {
    const { result } = renderHook(() => useComposerToggleState(undefined, undefined, undefined));
    act(() => result.current.setShowMcp(true));
    expect(result.current.showMcp).toBe(true);
  });

  it('calls onChatOverridesChange when toolOverrides changes', () => {
    const onChatOverridesChange = vi.fn();
    const chatOverrides = {
      model: 'opus[1m]',
      effort: 'medium',
      permissionMode: 'default' as const,
    };
    const tools1 = ['read'];
    const tools2 = ['read', 'write'];
    const { rerender } = renderHook(
      ({ overrides }: { overrides: string[] }) =>
        useComposerToggleState(overrides, chatOverrides, onChatOverridesChange),
      { initialProps: { overrides: tools1 } },
    );
    rerender({ overrides: tools2 });
    expect(onChatOverridesChange).toHaveBeenCalledWith({ ...chatOverrides, toolOverrides: tools2 });
  });

  it('does not call onChatOverridesChange a second time when toolOverrides ref is unchanged', () => {
    const onChatOverridesChange = vi.fn();
    const chatOverrides = {
      model: 'opus[1m]',
      effort: 'medium',
      permissionMode: 'default' as const,
    };
    const tools = ['read'];
    const { rerender } = renderHook(
      ({ overrides }: { overrides: string[] }) =>
        useComposerToggleState(overrides, chatOverrides, onChatOverridesChange),
      { initialProps: { overrides: tools } },
    );
    const callCountAfterMount = onChatOverridesChange.mock.calls.length;
    // Re-render with the same array reference — dep hasn't changed, no extra call
    rerender({ overrides: tools });
    expect(onChatOverridesChange).toHaveBeenCalledTimes(callCountAfterMount);
  });
});

// ── useSessionData ────────────────────────────────────────────────────────────

describe('useSessionData', () => {
  it('returns null profileId when no session exists', async () => {
    const { result } = renderHook(() => useSessionData(null, undefined, undefined));
    await act(async () => {
      /* flush effects */
    });
    expect(result.current.profileId).toBeNull();
  });

  it('loads session profile when sessionId is provided', async () => {
    mockSessionList.mockResolvedValue({
      success: true,
      sessions: [{ id: 'sess-1', profileId: 'prof-A', toolOverrides: ['read'] }],
    });
    const { result } = renderHook(() => useSessionData('sess-1', undefined, undefined));
    await act(async () => {
      /* flush promise */
    });
    expect(result.current.profileId).toBe('prof-A');
    expect(result.current.toolOverrides).toEqual(['read']);
  });

  it('setProfileId calls sessionCrud.setProfile', async () => {
    mockSessionList.mockResolvedValue({
      success: true,
      sessions: [{ id: 'sess-1', profileId: null }],
    });
    const { result } = renderHook(() => useSessionData('sess-1', undefined, undefined));
    await act(async () => {
      /* flush */
    });
    await act(async () => {
      result.current.setProfileId('prof-B');
    });
    expect(mockSessionSetProfile).toHaveBeenCalledWith('sess-1', 'prof-B');
  });

  it('returns chatOverrides profileId as fallback when no session profile', async () => {
    const chatOverrides = {
      model: 'opus[1m]',
      effort: 'medium',
      permissionMode: 'default' as const,
      profileId: 'override-prof',
    };
    const { result } = renderHook(() => useSessionData(null, chatOverrides, undefined));
    await act(async () => {
      /* flush */
    });
    expect(result.current.profileId).toBe('override-prof');
  });
});

// ── useActiveProfile ──────────────────────────────────────────────────────────

describe('useActiveProfile', () => {
  it('returns null when profileId is null', async () => {
    const { result } = renderHook(() => useActiveProfile(null));
    await act(async () => {
      /* flush */
    });
    expect(result.current).toBeNull();
  });

  it('returns the matching profile when found', async () => {
    const profile = { id: 'prof-1', name: 'Dev Profile', effort: 'high' };
    mockProfileList.mockResolvedValue({ success: true, profiles: [profile] });
    const { result } = renderHook(() => useActiveProfile('prof-1'));
    await act(async () => {
      /* flush */
    });
    expect(result.current).toMatchObject({ id: 'prof-1', name: 'Dev Profile' });
  });

  it('returns null when profileId does not match any profile', async () => {
    mockProfileList.mockResolvedValue({
      success: true,
      profiles: [{ id: 'other', name: 'Other' }],
    });
    const { result } = renderHook(() => useActiveProfile('unknown-id'));
    await act(async () => {
      /* flush */
    });
    expect(result.current).toBeNull();
  });
});
