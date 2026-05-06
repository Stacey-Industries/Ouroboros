/**
 * @vitest-environment jsdom
 *
 * Smoke tests for `useFilesystemRules` — the no-session fallback that surfaces
 * non-disabled rule files as `LoadedRule[]` for the chat composer's context
 * popover. The hook is small but the mapping shape matters because consumers
 * count by `memoryType`.
 */

import type { RuleDefinition } from '@shared/types/claudeConfig';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFilesystemRules } from './ComposerContextPreview.fsRules';

interface MockApi {
  listRuleFiles: ReturnType<typeof vi.fn>;
  onChanged?: ReturnType<typeof vi.fn>;
}

function makeRule(over: Partial<RuleDefinition>): RuleDefinition {
  return {
    id: 'sample',
    scope: 'project',
    filePath: '/proj/.claude/rules/sample.md',
    content: '',
    description: '',
    ...over,
  };
}

function installApi(ruleFiles: RuleDefinition[]): MockApi {
  const onChangedCallbacks: Array<() => void> = [];
  const api: MockApi = {
    listRuleFiles: vi.fn().mockResolvedValue({ success: true, ruleFiles }),
    onChanged: vi.fn().mockImplementation((cb: () => void) => {
      onChangedCallbacks.push(cb);
      return () => {
        const i = onChangedCallbacks.indexOf(cb);
        if (i >= 0) onChangedCallbacks.splice(i, 1);
      };
    }),
  };
  (window as unknown as { electronAPI?: unknown }).electronAPI = {
    rulesAndSkills: api,
  };
  return api;
}

describe('useFilesystemRules', () => {
  beforeEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when the IPC is unavailable', () => {
    const { result } = renderHook(() => useFilesystemRules('/proj'));
    expect(result.current).toEqual([]);
  });

  it('maps non-disabled rule files into LoadedRule shape', async () => {
    installApi([
      makeRule({ id: 'a', scope: 'project', filePath: '/proj/.claude/rules/a.md' }),
      makeRule({ id: 'b', scope: 'global', filePath: '/u/.claude/rules/b.md' }),
      makeRule({ id: 'c', scope: 'project', disabled: true }),
    ]);
    const { result } = renderHook(() => useFilesystemRules('/proj'));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current[0]).toEqual({
      filePath: '/proj/.claude/rules/a.md',
      name: 'a',
      memoryType: 'Project',
      loadReason: 'baseline',
      loadedAt: 0,
    });
    expect(result.current[1]).toEqual({
      filePath: '/u/.claude/rules/b.md',
      name: 'b',
      memoryType: 'User',
      loadReason: 'baseline',
      loadedAt: 0,
    });
  });

  it('refetches when the watcher fires onChanged', async () => {
    const api = installApi([makeRule({ id: 'a' })]);
    const { result } = renderHook(() => useFilesystemRules('/proj'));
    await waitFor(() => expect(result.current).toHaveLength(1));
    api.listRuleFiles.mockResolvedValueOnce({
      success: true,
      ruleFiles: [
        makeRule({ id: 'a' }),
        makeRule({ id: 'b', filePath: '/proj/.claude/rules/b.md' }),
      ],
    });
    const cb = api.onChanged?.mock.calls[0]?.[0] as (() => void) | undefined;
    expect(cb).toBeTypeOf('function');
    act(() => cb?.());
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('refetches when projectRoot changes', async () => {
    const api = installApi([makeRule({ id: 'a' })]);
    const { rerender } = renderHook(
      ({ root }: { root: string | null }) => useFilesystemRules(root),
      {
        initialProps: { root: '/proj-1' },
      },
    );
    await waitFor(() => expect(api.listRuleFiles).toHaveBeenCalledWith('/proj-1'));
    rerender({ root: '/proj-2' });
    await waitFor(() => expect(api.listRuleFiles).toHaveBeenCalledWith('/proj-2'));
  });
});
