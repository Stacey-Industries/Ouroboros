/**
 * @vitest-environment jsdom
 *
 * ContextPreviewRuleSubTabs.test.tsx — Wave 62 smoke tests for the
 * User/Project sub-tab UI inside the Rules main tab.
 *
 * Covers:
 *   - RuleGroupSubTabs renders both User and Project tabs with their counts
 *   - Active sub-tab carries aria-selected=true; inactive carries false
 *   - Clicking a sub-tab fires onSelect with the right group
 *   - filterItemsForActiveTab passes through non-rule kinds untouched
 *   - filterItemsForActiveTab filters rule items by group
 *   - buildRuleGroupCounts counts rule items only and treats missing group as 'project'
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ContextItem } from '../../hooks/useContextPreview';
import {
  buildRuleGroupCounts,
  filterItemsForActiveTab,
  RuleGroupSubTabs,
} from './ContextPreviewRuleSubTabs';

afterEach(cleanup);

const baseRule = {
  detail: 'User',
  enabled: true,
  estimatedTokens: 10,
  kind: 'rule' as const,
  label: 'r',
};

describe('RuleGroupSubTabs', () => {
  it('renders both User and Project tabs with their counts', () => {
    render(
      <RuleGroupSubTabs
        active="user"
        counts={{ user: 3, project: 5 }}
        onSelect={() => undefined}
      />,
    );
    const userTab = screen.getByRole('tab', { name: /user/i });
    const projectTab = screen.getByRole('tab', { name: /project/i });
    expect(userTab.textContent).toContain('3');
    expect(projectTab.textContent).toContain('5');
  });

  it('marks the active sub-tab with aria-selected=true', () => {
    render(
      <RuleGroupSubTabs
        active="project"
        counts={{ user: 1, project: 1 }}
        onSelect={() => undefined}
      />,
    );
    expect(screen.getByRole('tab', { name: /user/i }).getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('tab', { name: /project/i }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('fires onSelect with the right group when a sub-tab is clicked', () => {
    const onSelect = vi.fn();
    render(<RuleGroupSubTabs active="user" counts={{ user: 1, project: 1 }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: /project/i }));
    expect(onSelect).toHaveBeenCalledWith('project');
  });
});

describe('filterItemsForActiveTab', () => {
  it('passes non-rule kinds through unchanged', () => {
    const items: ContextItem[] = [
      { ...baseRule, id: 'r1', group: 'user' },
      { detail: 'x', enabled: true, estimatedTokens: 1, id: 'f1', kind: 'file', label: 'f' },
    ];
    const result = filterItemsForActiveTab(items, 'file', 'user');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f1');
  });

  it('filters rule items by group', () => {
    const items: ContextItem[] = [
      { ...baseRule, id: 'rU', group: 'user' },
      { ...baseRule, id: 'rP', group: 'project' },
    ];
    expect(filterItemsForActiveTab(items, 'rule', 'user').map((i) => i.id)).toEqual(['rU']);
    expect(filterItemsForActiveTab(items, 'rule', 'project').map((i) => i.id)).toEqual(['rP']);
  });

  it('treats a rule item with missing group as project-scoped', () => {
    const items: ContextItem[] = [{ ...baseRule, id: 'rNoGroup' }];
    expect(filterItemsForActiveTab(items, 'rule', 'project').map((i) => i.id)).toEqual([
      'rNoGroup',
    ]);
    expect(filterItemsForActiveTab(items, 'rule', 'user')).toEqual([]);
  });
});

describe('buildRuleGroupCounts', () => {
  it('counts rule items only, ignoring other kinds', () => {
    const items: ContextItem[] = [
      { ...baseRule, id: 'r1', group: 'user' },
      { ...baseRule, id: 'r2', group: 'project' },
      { ...baseRule, id: 'r3', group: 'project' },
      { detail: 'x', enabled: true, estimatedTokens: 1, id: 'f1', kind: 'file', label: 'f' },
    ];
    expect(buildRuleGroupCounts(items)).toEqual({ user: 1, project: 2 });
  });

  it('treats a rule item with missing group as project-scoped in the count', () => {
    const items: ContextItem[] = [
      { ...baseRule, id: 'r1', group: 'user' },
      { ...baseRule, id: 'r2' },
    ];
    expect(buildRuleGroupCounts(items)).toEqual({ user: 1, project: 1 });
  });
});
