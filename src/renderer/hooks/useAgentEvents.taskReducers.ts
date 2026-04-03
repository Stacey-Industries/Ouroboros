/**
 * useAgentEvents.taskReducers.ts — Reducer cases for task lifecycle events.
 *
 * Handles TASK_CREATED and TASK_COMPLETED actions, which map to
 * TaskCreated / TaskCompleted Claude Code hook events.
 */

import type { AgentTask } from '../components/AgentMonitor/types';
import type { AgentState } from './useAgentEvents.helpers';
import { updateSession } from './useAgentEvents.session-utils';

export interface TaskCreatedAction {
  type: 'TASK_CREATED';
  sessionId: string;
  task: AgentTask;
}

export interface TaskCompletedAction {
  type: 'TASK_COMPLETED';
  sessionId: string;
  taskId: string;
  timestamp: number;
}

export function reduceTaskCreated(state: AgentState, action: TaskCreatedAction): AgentState {
  return updateSession(state, action.sessionId, (session) => ({
    ...session,
    tasks: [...(session.tasks ?? []), action.task],
  }));
}

export function reduceTaskCompleted(state: AgentState, action: TaskCompletedAction): AgentState {
  return updateSession(state, action.sessionId, (session) => {
    const tasks = (session.tasks ?? []).map((task) =>
      task.id === action.taskId
        ? { ...task, status: 'completed' as const, completedAt: action.timestamp }
        : task,
    );
    return { ...session, tasks };
  });
}
