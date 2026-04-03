/**
 * useAgentEvents.workspaceDispatchers.ts — Dispatch helpers for workspace,
 * compaction, permission, and inline tool-failure hook events.
 */

import type { Dispatch } from 'react';

import type { PermissionEvent } from '../components/AgentMonitor/types';
import type { HookPayload } from '../types/electron';
import { getNumberField, getStringField } from './useAgentEvents.fieldHelpers';
import type { AgentAction } from './useAgentEvents.helpers';
import { dispatchAgentEnd } from './useAgentEvents.helpers';

export function dispatchCompaction(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const tokenCount = getNumberField(data, 'token_count', 'tokens');
  if (payload.type === 'pre_compact') {
    dispatch({ type: 'PRE_COMPACT', sessionId: payload.sessionId, tokenCount });
  } else {
    dispatch({ type: 'POST_COMPACT', sessionId: payload.sessionId, tokenCount, timestamp: payload.timestamp });
  }
}

export function dispatchPermissionEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const eventType: PermissionEvent['type'] =
    payload.type === 'permission_denied' ? 'denied' : 'request';
  const event: PermissionEvent = {
    type: eventType,
    permissionType: getStringField(data, 'permission_type'),
    toolName: getStringField(data, 'tool_name'),
    timestamp: payload.timestamp,
    reason: getStringField(data, 'reason'),
  };
  dispatch({ type: 'PERMISSION_EVENT', sessionId: payload.sessionId, event });
}

export function dispatchWorkspaceEvent(
  payload: HookPayload,
): void {
  if (payload.type === 'file_changed') {
    window.dispatchEvent(new CustomEvent('agent-ide:file-changed'));
    return;
  }
  if (payload.type === 'cwd_changed') {
    const newCwd = payload.data?.['cwd'] ?? payload.data?.['new_cwd'];
    window.dispatchEvent(new CustomEvent('agent-ide:cwd-changed', { detail: { cwd: newCwd } }));
    return;
  }
  console.warn('[workspace-event] unhandled type:', payload.type);
}

export function dispatchToolUseFailed(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const outputError = (payload.output as Record<string, unknown> | undefined)?.['error'];
  dispatch({
    type: 'TOOL_END',
    sessionId: payload.sessionId,
    toolCallId: payload.toolCallId,
    toolName: payload.toolName,
    duration: 0,
    status: 'error',
    output: payload.error ?? (outputError as string | undefined) ?? 'Tool failed',
  });
}

export function dispatchNotification(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const message = (payload.data?.['message'] ?? payload.data?.['text'] ?? 'Notification') as string;
  dispatch({ type: 'NOTIFICATION', sessionId: payload.sessionId, message });
}

export function dispatchStopFailure(payload: HookPayload, dispatch: Dispatch<AgentAction>): void {
  const error = payload.error ?? (payload.data?.['error'] as string | undefined) ?? 'Session stop failed';
  dispatchAgentEnd({ ...payload, error }, dispatch);
}
