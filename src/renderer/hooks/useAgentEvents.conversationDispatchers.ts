/**
 * useAgentEvents.conversationDispatchers.ts — Dispatch helpers for conversation events.
 *
 * Handles user_prompt_submit, elicitation, and elicitation_result hook events.
 */

import type { Dispatch } from 'react';

import type { ConversationTurn } from '../components/AgentMonitor/types';
import type { HookPayload } from '../types/electron';
import { getStringField } from './useAgentEvents.fieldHelpers';
import type { AgentAction } from './useAgentEvents.helpers';

function dispatchConversationTurn(
  turn: ConversationTurn,
  sessionId: string,
  dispatch: Dispatch<AgentAction>,
): void {
  dispatch({ type: 'CONVERSATION_TURN', sessionId, turn });
}

export function dispatchUserPrompt(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const content = getStringField(data, 'message', 'prompt') ?? '';
  dispatchConversationTurn(
    { type: 'prompt', content, timestamp: payload.timestamp },
    payload.sessionId,
    dispatch,
  );
}

export function dispatchElicitation(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const content = getStringField(data, 'message') ?? '';
  const question = getStringField(data, 'title');
  dispatchConversationTurn(
    { type: 'elicitation', content, timestamp: payload.timestamp, question },
    payload.sessionId,
    dispatch,
  );
}

export function dispatchElicitationResult(
  payload: HookPayload,
  dispatch: Dispatch<AgentAction>,
): void {
  const data = payload.data ?? {};
  const content = getStringField(data, 'result', 'response') ?? '';
  dispatchConversationTurn(
    { type: 'elicitation_result', content, timestamp: payload.timestamp },
    payload.sessionId,
    dispatch,
  );
}
