/**
 * @vitest-environment jsdom
 */
import type { LoadedRule, SkillExecutionRecord } from '@shared/types/ruleActivity';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { UseContextPreviewInput } from './useContextPreview';
import { BUILT_IN_TOOLS_COUNT, isToggleableKind, useContextPreview } from './useContextPreview';

const EMPTY_INPUT: UseContextPreviewInput = {
  effort: undefined,
  loadedRules: [],
  mentionLabels: [],
  model: undefined,
  pinnedFileNames: [],
  skillExecutions: [],
};

const RULE: LoadedRule = {
  filePath: '/project/.claude/rules/testing.md',
  globs: ['*.test.ts'],
  loadReason: 'glob match',
  loadedAt: 1000,
  memoryType: 'Project',
  name: 'testing',
};

const SKILL: SkillExecutionRecord = {
  agentId: 'agent-1',
  agentType: 'sonnet-implementer',
  completedAt: 2000,
  durationMs: 1000,
  skillName: 'implement-feature',
  startedAt: 1000,
  status: 'completed',
};

describe('useContextPreview', () => {
  it('returns empty items with zero-count totals when input is empty', () => {
    const { result } = renderHook(() => useContextPreview(EMPTY_INPUT));
    const { totals } = result.current;
    expect(totals.rules).toBe(0);
    expect(totals.skills).toBe(0);
    expect(totals.files).toBe(0);
    expect(totals.memory).toBe(0);
    expect(totals.system).toBe(0);
    // tools are always present (built-in list)
    expect(totals.tools).toBeGreaterThan(0);
  });

  it('includes tool items for every built-in tool', () => {
    const { result } = renderHook(() => useContextPreview(EMPTY_INPUT));
    const toolItems = result.current.items.filter((i) => i.kind === 'tool');
    expect(toolItems.length).toBe(BUILT_IN_TOOLS_COUNT);
    expect(toolItems.every((i) => i.estimatedTokens >= 1)).toBe(true);
  });

  it('maps loaded rules to rule items with correct fields', () => {
    const { result } = renderHook(() => useContextPreview({ ...EMPTY_INPUT, loadedRules: [RULE] }));
    const ruleItems = result.current.items.filter((i) => i.kind === 'rule');
    expect(ruleItems).toHaveLength(1);
    expect(ruleItems[0].label).toBe('testing');
    expect(ruleItems[0].detail).toBe('Project');
    expect(result.current.totals.rules).toBe(1);
  });

  it('maps skill executions to skill items', () => {
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, skillExecutions: [SKILL] }),
    );
    const skillItems = result.current.items.filter((i) => i.kind === 'skill');
    expect(skillItems).toHaveLength(1);
    expect(skillItems[0].label).toBe('implement-feature');
    expect(skillItems[0].detail).toBe('sonnet-implementer');
    expect(result.current.totals.skills).toBe(1);
  });

  it('maps pinned files to file items', () => {
    const pinned = [{ estimatedTokens: 400, name: 'README.md', path: '/project/README.md' }];
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, pinnedFileNames: pinned }),
    );
    const fileItems = result.current.items.filter((i) => i.kind === 'file');
    expect(fileItems).toHaveLength(1);
    expect(fileItems[0].label).toBe('README.md');
    expect(fileItems[0].estimatedTokens).toBe(400);
    expect(result.current.totals.files).toBe(1);
  });

  it('maps mention labels to mention-kind items', () => {
    const mentions = [{ estimatedTokens: 100, label: '@src/foo.ts' }];
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, mentionLabels: mentions }),
    );
    const mentionItems = result.current.items.filter((i) => i.kind === 'mention');
    expect(mentionItems).toHaveLength(1);
    expect(mentionItems[0].label).toBe('@src/foo.ts');
    expect(result.current.totals.mentions).toBe(1);
  });

  it('creates a system item when model is provided', () => {
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, effort: 'high', model: 'claude-sonnet-4-6' }),
    );
    const systemItems = result.current.items.filter((i) => i.kind === 'system');
    expect(systemItems).toHaveLength(1);
    expect(systemItems[0].label).toBe('claude-sonnet-4-6');
    expect(systemItems[0].detail).toBe('high');
    expect(result.current.totals.system).toBe(1);
  });

  it('omits system item when model is not provided', () => {
    const { result } = renderHook(() => useContextPreview(EMPTY_INPUT));
    const systemItems = result.current.items.filter((i) => i.kind === 'system');
    expect(systemItems).toHaveLength(0);
    expect(result.current.totals.system).toBe(0);
  });

  it('totalTokens is the sum of all item token estimates', () => {
    const input: UseContextPreviewInput = {
      ...EMPTY_INPUT,
      loadedRules: [RULE],
      model: 'claude-sonnet-4-6',
      pinnedFileNames: [{ estimatedTokens: 400, name: 'README.md', path: '/project/README.md' }],
      skillExecutions: [SKILL],
    };
    const { result } = renderHook(() => useContextPreview(input));
    const { items, totals } = result.current;
    const manualSum = items.reduce((s, i) => s + i.estimatedTokens, 0);
    expect(totals.totalTokens).toBe(manualSum);
  });

  it('totalItems matches items array length', () => {
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, loadedRules: [RULE], skillExecutions: [SKILL] }),
    );
    expect(result.current.totals.totalItems).toBe(result.current.items.length);
  });

  it('each item has a positive estimatedTokens value', () => {
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, loadedRules: [RULE], skillExecutions: [SKILL] }),
    );
    for (const item of result.current.items) {
      expect(item.estimatedTokens).toBeGreaterThan(0);
    }
  });

  it('all items default to enabled: true', () => {
    const input: UseContextPreviewInput = {
      ...EMPTY_INPUT,
      loadedRules: [RULE],
      skillExecutions: [SKILL],
      pinnedFileNames: [{ estimatedTokens: 400, name: 'README.md', path: '/project/README.md' }],
      mentionLabels: [{ estimatedTokens: 10, label: '@src/foo.ts' }],
    };
    const { result } = renderHook(() => useContextPreview(input));
    for (const item of result.current.items) {
      expect(item.enabled).toBe(true);
    }
  });

  it('isToggleableKind returns true for file, mention, and rule (Wave 62); false for managed kinds', () => {
    expect(isToggleableKind('file')).toBe(true);
    expect(isToggleableKind('mention')).toBe(true);
    expect(isToggleableKind('rule')).toBe(true);
    expect(isToggleableKind('skill')).toBe(false);
    expect(isToggleableKind('tool')).toBe(false);
    expect(isToggleableKind('system')).toBe(false);
    expect(isToggleableKind('memory')).toBe(false);
  });

  it('mention items have kind "mention", not "file"', () => {
    const mentions = [{ estimatedTokens: 50, label: '@utils/helpers.ts' }];
    const { result } = renderHook(() =>
      useContextPreview({ ...EMPTY_INPUT, mentionLabels: mentions }),
    );
    const mentionItems = result.current.items.filter((i) => i.kind === 'mention');
    expect(mentionItems).toHaveLength(1);
    expect(result.current.totals.mentions).toBe(1);
    expect(result.current.totals.files).toBe(0);
  });
});
