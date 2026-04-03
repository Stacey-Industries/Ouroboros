/**
 * TaskList.test.ts — Unit tests for TaskList component helpers.
 */

import { describe, expect, it } from 'vitest';

import type { AgentTask } from './types';

// ─── Inline the helpers under test (pure functions) ───────────────────────────

function taskStatusIcon(status: AgentTask['status']): { char: string; color: string } {
  switch (status) {
    case 'pending':
      return { char: '○', color: 'var(--text-faint)' };
    case 'in_progress':
      return { char: '◑', color: 'var(--interactive-accent)' };
    case 'completed':
      return { char: '●', color: 'var(--status-success)' };
    case 'error':
      return { char: '✕', color: 'var(--status-error)' };
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

interface TaskTreeItem {
  task: AgentTask;
  depth: number;
}

function buildTaskTree(tasks: AgentTask[]): TaskTreeItem[] {
  const roots = tasks.filter((t) => !t.parentTaskId);
  const children = tasks.filter((t) => !!t.parentTaskId);
  const result: TaskTreeItem[] = [];
  for (const root of roots) {
    result.push({ task: root, depth: 0 });
    const kids = children.filter((c) => c.parentTaskId === root.id);
    for (const kid of kids) {
      result.push({ task: kid, depth: 1 });
    }
  }
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('taskStatusIcon', () => {
  it('returns ○ for pending', () => {
    expect(taskStatusIcon('pending').char).toBe('○');
  });

  it('returns ◑ for in_progress', () => {
    expect(taskStatusIcon('in_progress').char).toBe('◑');
  });

  it('returns ● for completed', () => {
    expect(taskStatusIcon('completed').char).toBe('●');
  });

  it('returns ✕ for error', () => {
    expect(taskStatusIcon('error').char).toBe('✕');
  });

  it('uses accent color for in_progress', () => {
    expect(taskStatusIcon('in_progress').color).toBe('var(--interactive-accent)');
  });

  it('uses success color for completed', () => {
    expect(taskStatusIcon('completed').color).toBe('var(--status-success)');
  });

  it('uses error color for error', () => {
    expect(taskStatusIcon('error').color).toBe('var(--status-error)');
  });
});

describe('truncate', () => {
  it('returns text unchanged when within limit', () => {
    expect(truncate('short', 80)).toBe('short');
  });

  it('truncates and appends ellipsis when over limit', () => {
    const long = 'a'.repeat(90);
    const result = truncate(long, 80);
    expect(result).toHaveLength(81); // 80 chars + ellipsis char
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns text exactly at limit unchanged', () => {
    const exact = 'a'.repeat(80);
    expect(truncate(exact, 80)).toBe(exact);
  });
});

describe('buildTaskTree', () => {
  const makeTask = (id: string, parentTaskId?: string): AgentTask => ({
    id,
    description: `Task ${id}`,
    status: 'pending',
    createdAt: Date.now(),
    parentTaskId,
  });

  it('returns empty array for empty input', () => {
    expect(buildTaskTree([])).toEqual([]);
  });

  it('places root tasks at depth 0', () => {
    const tasks = [makeTask('a'), makeTask('b')];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[1].depth).toBe(0);
  });

  it('places child tasks at depth 1 after their parent', () => {
    const tasks = [makeTask('a'), makeTask('b', 'a')];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(2);
    expect(tree[0].task.id).toBe('a');
    expect(tree[0].depth).toBe(0);
    expect(tree[1].task.id).toBe('b');
    expect(tree[1].depth).toBe(1);
  });

  it('groups multiple children under their parent', () => {
    const tasks = [makeTask('root'), makeTask('c1', 'root'), makeTask('c2', 'root')];
    const tree = buildTaskTree(tasks);
    expect(tree).toHaveLength(3);
    expect(tree[0].task.id).toBe('root');
    expect(tree[1].task.id).toBe('c1');
    expect(tree[2].task.id).toBe('c2');
  });

  it('ignores orphaned children with no matching parent', () => {
    const tasks = [makeTask('orphan', 'nonexistent')];
    const tree = buildTaskTree(tasks);
    // orphan has parentTaskId set but no matching root — it's excluded from roots
    // and never appended as a child
    expect(tree).toHaveLength(0);
  });
});
