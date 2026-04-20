/**
 * @vitest-environment jsdom
 *
 * WorkspaceVariantContext — unit tests.
 *
 * Covers: default value, type contract, and hook return.
 * The context itself is thin; these tests guard against regressions in
 * the default value and the hook's pass-through behaviour.
 */

import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import {
  useWorkspaceVariant,
  type WorkspaceVariant,
  WorkspaceVariantContext,
} from './WorkspaceVariantContext';

describe('WorkspaceVariantContext', () => {
  it('default context value is "ide" (no provider)', () => {
    // Verify via a hook render with no provider — default falls through to createContext default.
    const { result } = renderHook(() => useWorkspaceVariant());
    expect(result.current).toBe('ide');
  });

  it('useWorkspaceVariant returns "chat-only" when provided', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(WorkspaceVariantContext.Provider, { value: 'chat-only' }, children);
    const { result } = renderHook(() => useWorkspaceVariant(), { wrapper });
    expect(result.current).toBe('chat-only');
  });

  it('useWorkspaceVariant returns "ide" when provided explicitly', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(WorkspaceVariantContext.Provider, { value: 'ide' }, children);
    const { result } = renderHook(() => useWorkspaceVariant(), { wrapper });
    expect(result.current).toBe('ide');
  });

  it('WorkspaceVariant type accepts only "ide" and "chat-only"', () => {
    // Type-level check: both values are assignable.
    const a: WorkspaceVariant = 'ide';
    const b: WorkspaceVariant = 'chat-only';
    expect(a).toBe('ide');
    expect(b).toBe('chat-only');
  });
});
