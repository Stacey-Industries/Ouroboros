/**
 * useAgentEvents.taskDispatchers.ts — Dispatch helpers for task lifecycle events.
 *
 * Handles task_created and task_completed hook events.
 */

import type { Dispatch } from 'react';

import type { HookPayload } from '../types/electron';
import { getStringField } from './useAgentEvents.fieldHelpers';
import type { AgentAction } from './useAgentEvents.helpers';

export function dispatchTaskCreated(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const taskId = getStringField(data, 'task_id', 'id');
  if (!taskId) return;

  const description = getStringField(data, 'description', 'message') ?? '';
  const parentTaskId = getStringField(data, 'parent_task_id');
  const rawStatus = data['status'];
  const status = rawStatus === 'in_progress' || rawStatus === 'completed' || rawStatus === 'error'
    ? rawStatus
    : 'pending' as const;

  dispatch({
    type: 'TASK_CREATED',
    sessionId: payload.sessionId,
    task: {
      id: taskId,
      description,
      status,
      parentTaskId,
      createdAt: payload.timestamp,
    },
  });
}

export function dispatchTaskCompleted(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const taskId = getStringField(data, 'task_id', 'id');
  if (!taskId) return;

  dispatch({
    type: 'TASK_COMPLETED',
    sessionId: payload.sessionId,
    taskId,
    timestamp: payload.timestamp,
  });
}
