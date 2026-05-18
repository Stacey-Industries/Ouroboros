/**
 * @vitest-environment jsdom
 *
 * ProjectTerminalsContext.test.tsx — Wave 94 Phase B
 *
 * Contracts verified:
 *  - useProjectTerminalsContext() inside the provider returns the handles
 *    produced by useProjectTerminals for the given activeProjectPath.
 *  - useProjectTerminalsContext() outside the provider returns the fallback
 *    empty handles (does not throw).
 *  - Provider re-renders when activeProjectPath changes.
 */

import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { UseProjectTerminalsReturn } from '../hooks/useProjectTerminals';
import { EMPTY_SLOT_HANDLE } from '../hooks/useProjectTerminals';
import { ProjectTerminalsProvider, useProjectTerminalsContext } from './ProjectTerminalsContext';

// ---------------------------------------------------------------------------
// Mock useProjectTerminals so this test stays pure-context
// ---------------------------------------------------------------------------

const mockPrimary = { ...EMPTY_SLOT_HANDLE, activeSessionId: 'primary-mock' };
const mockSecondary = { ...EMPTY_SLOT_HANDLE, activeSessionId: 'secondary-mock' };
let lastPath: string | null = null;

vi.mock('../hooks/useProjectTerminals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useProjectTerminals')>();
  return {
    ...actual,
    useProjectTerminals: (path: string | null): UseProjectTerminalsReturn => {
      lastPath = path;
      if (!path) return { primary: actual.EMPTY_SLOT_HANDLE, secondary: actual.EMPTY_SLOT_HANDLE };
      return { primary: mockPrimary, secondary: mockSecondary };
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper(path: string | null) {
  return function Wrapper({ children }: { children: React.ReactNode }): React.ReactElement {
    return <ProjectTerminalsProvider activeProjectPath={path}>{children}</ProjectTerminalsProvider>;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useProjectTerminalsContext', () => {
  it('returns empty handles when called outside the provider (no throw)', () => {
    const { result } = renderHook(() => useProjectTerminalsContext());
    expect(result.current.primary.sessions).toEqual([]);
    expect(result.current.secondary.sessions).toEqual([]);
    expect(result.current.primary.activeSessionId).toBeNull();
  });

  it('returns handles from useProjectTerminals when inside the provider with a path', () => {
    const { result } = renderHook(() => useProjectTerminalsContext(), {
      wrapper: makeWrapper('/proj/a'),
    });
    expect(result.current.primary.activeSessionId).toBe('primary-mock');
    expect(result.current.secondary.activeSessionId).toBe('secondary-mock');
  });

  it('passes activeProjectPath to useProjectTerminals', () => {
    renderHook(() => useProjectTerminalsContext(), { wrapper: makeWrapper('/proj/test') });
    expect(lastPath).toBe('/proj/test');
  });

  it('returns empty handles when provider activeProjectPath is null', () => {
    const { result } = renderHook(() => useProjectTerminalsContext(), {
      wrapper: makeWrapper(null),
    });
    expect(result.current.primary.activeSessionId).toBeNull();
    expect(result.current.secondary.activeSessionId).toBeNull();
  });

  it('re-exposes updated handles when activeProjectPath changes', () => {
    let currentPath: string | null = '/proj/a';
    const DynamicWrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
      <ProjectTerminalsProvider activeProjectPath={currentPath}>
        {children}
      </ProjectTerminalsProvider>
    );

    const { result, rerender } = renderHook(() => useProjectTerminalsContext(), {
      wrapper: DynamicWrapper,
    });
    expect(result.current.primary.activeSessionId).toBe('primary-mock');

    currentPath = null;
    rerender();
    expect(result.current.primary.activeSessionId).toBeNull();
  });
});
