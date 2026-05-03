/**
 * @vitest-environment jsdom
 *
 * Smoke tests for extracted hooks. Behavior is also covered indirectly by
 * LexicalChatComposer.test.tsx (which mounts the hooks in their integrated
 * setting); these tests verify the exports load and produce stable references
 * for memo correctness.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCyclePermissionCallback,
  useMentionSearch,
  useSendCallback,
} from './lexicalComposerHooks';

describe('lexicalComposerHooks', () => {
  it('useSendCallback returns a function that invokes onSubmit', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSendCallback(onSubmit));
    result.current();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('useSendCallback returns a stable reference when onSubmit identity is unchanged', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(() => useSendCallback(onSubmit));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('useCyclePermissionCallback no-ops when chatOverrides is undefined', () => {
    const { result } = renderHook(() => useCyclePermissionCallback({}));
    expect(() => result.current()).not.toThrow();
  });

  it('useCyclePermissionCallback no-ops when onChatOverridesChange is undefined', () => {
    const { result } = renderHook(() =>
      useCyclePermissionCallback({
        chatOverrides: { model: 'sonnet', permissionMode: 'default' } as never,
      }),
    );
    expect(() => result.current()).not.toThrow();
  });

  it('useMentionSearch returns a callable function with empty allFiles', async () => {
    const { result } = renderHook(() => useMentionSearch([], [], undefined));
    const items = await result.current('@', 'foo');
    expect(Array.isArray(items)).toBe(true);
  });

  it('useMentionSearch is memoized — same reference across re-renders with same inputs', () => {
    const allFiles: never[] = [];
    const mentions: never[] = [];
    const { result, rerender } = renderHook(() => useMentionSearch(allFiles, mentions, undefined));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
