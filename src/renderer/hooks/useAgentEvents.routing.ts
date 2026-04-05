/**
 * useAgentEvents.routing.ts — Event-type routing layer.
 *
 * Each function takes a HookPayload and dispatches to the appropriate
 * sub-module dispatcher. Returns true if the event was handled, false otherwise.
 * Extracted from useAgentEvents.ts to keep that file under the 300-line limit.
 */

import log from 'electron-log/renderer';
import type { Dispatch } from 'react';

import type { HookPayload } from '../types/electron';
import {
  dispatchElicitation,
  dispatchElicitationResult,
  dispatchUserPrompt,
} from './useAgentEvents.conversationDispatchers';
import type { AgentAction } from './useAgentEvents.helpers';
import { dispatchAgentEnd } from './useAgentEvents.helpers';
import { dispatchTaskCompleted, dispatchTaskCreated } from './useAgentEvents.taskDispatchers';
import {
  dispatchCompaction,
  dispatchNotification,
  dispatchPermissionEvent,
  dispatchStopFailure,
  dispatchToolUseFailed,
  dispatchWorkspaceEvent,
} from './useAgentEvents.workspaceDispatchers';

export function dispatchTaskOrConversationEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): boolean {
  switch (payload.type) {
    case 'task_created':
      dispatchTaskCreated(payload, dispatch);
      return true;
    case 'task_completed':
      dispatchTaskCompleted(payload, dispatch);
      return true;
    case 'user_prompt_submit':
      dispatchUserPrompt(payload, dispatch);
      return true;
    case 'elicitation':
      dispatchElicitation(payload, dispatch);
      return true;
    case 'elicitation_result':
      dispatchElicitationResult(payload, dispatch);
      return true;
    default:
      return false;
  }
}

function dispatchContextEvent(payload: HookPayload, dispatch: Dispatch<AgentAction>): boolean {
  switch (payload.type) {
    case 'pre_compact':
    case 'post_compact':
      dispatchCompaction(payload, dispatch);
      return true;
    case 'permission_request':
    case 'permission_denied':
      dispatchPermissionEvent(payload, dispatch);
      return true;
    case 'post_tool_use_failure':
      dispatchToolUseFailed(payload, dispatch);
      return true;
    case 'notification':
      dispatchNotification(payload, dispatch);
      return true;
    default:
      return false;
  }
}

function dispatchSessionLifecycleEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): boolean {
  switch (payload.type) {
    case 'stop_failure':
      dispatchStopFailure(payload, dispatch);
      return true;
    case 'session_end':
      dispatchAgentEnd(payload, dispatch);
      return true;
    case 'setup':
      log.info('[hook] setup event received, sessionId:', payload.sessionId);
      return true;
    case 'teammate_idle':
      log.info('[hook] teammate_idle event, sessionId:', payload.sessionId);
      return true;
    default:
      return false;
  }
}

function dispatchContextOrPermissionEvent(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): boolean {
  return (
    dispatchContextEvent(payload, dispatch) || dispatchSessionLifecycleEvent(payload, dispatch)
  );
}

export function dispatchFileSystemEvent(payload: HookPayload): boolean {
  switch (payload.type) {
    case 'cwd_changed':
    case 'file_changed':
    case 'worktree_create':
    case 'worktree_remove':
    case 'config_change':
      dispatchWorkspaceEvent(payload);
      return true;
    default:
      return false;
  }
}

export function dispatchNewEventTypes(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): boolean {
  return (
    dispatchTaskOrConversationEvent(payload, dispatch) ||
    dispatchContextOrPermissionEvent(payload, dispatch) ||
    dispatchFileSystemEvent(payload)
  );
}
