/**
 * TaskList.tsx — Compact nested task checklist for agent sessions.
 */

import React, { memo, useMemo } from 'react';

import type { AgentTask } from './types';

interface TaskListProps {
  tasks: AgentTask[] | undefined;
}

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

interface TaskItemProps {
  task: AgentTask;
  depth: number;
}

const TaskItem = memo(function TaskItem({ task, depth }: TaskItemProps): React.ReactElement<unknown> {
  const icon = taskStatusIcon(task.status);
  const indentPx = depth * 12;
  return (
    <div
      className="flex items-center gap-1.5 py-0.5 text-[11px] leading-snug"
      style={{ paddingLeft: `${indentPx}px` }}
    >
      <span className="shrink-0 font-mono text-[10px]" style={{ color: icon.color }}>
        {icon.char}
      </span>
      <span className="truncate text-text-semantic-secondary" title={task.description}>
        {truncate(task.description, 80)}
      </span>
    </div>
  );
});

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

export const TaskList = memo(function TaskList({ tasks }: TaskListProps): React.ReactElement<unknown> | null {
  const flat = useMemo(() => buildTaskTree(tasks ?? []), [tasks]);
  if (flat.length === 0) return null;

  return (
    <div className="px-3 pb-2">
      <span className="text-[10px] font-medium text-text-semantic-faint uppercase tracking-wide block mb-0.5">
        Tasks
      </span>
      {flat.map(({ task, depth }) => (
        <TaskItem key={task.id} task={task} depth={depth} />
      ))}
    </div>
  );
});
