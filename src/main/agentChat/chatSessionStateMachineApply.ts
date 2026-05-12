/**
 * chatSessionStateMachineApply.ts — Event application logic for ChatSessionStateMachine.
 *
 * Extracted from chatSessionStateMachine.ts to stay under the 300-line / 40-line-per-function
 * ESLint limits. The two files form one logical unit — do not import this file directly
 * from outside the agentChat/ subsystem; import ChatSessionStateMachine instead.
 *
 * applyEvent is split into two halves (applyEventA / applyEventB) to keep each switch
 * arm block under complexity 10. applyEvent delegates based on the first letter of the type
 * so TypeScript exhaustiveness still covers the full union.
 */

import type {
  CanonicalChatEvent,
  MessageId,
  ToolUseId,
  TurnId,
} from '@shared/types/canonicalChatEvent';
import type { ChatStateDiff, ChatThreadStatus } from '@shared/types/chatStateDiff';

import type {
  ChatSessionStateMachine,
  QueueEntry,
  ToolCallInFlight,
} from './chatSessionStateMachine';

// ─── Half A: turn / text / tool-call events ───────────────────────────────────

function applyEventA(
  sm: ChatSessionStateMachine,
  event: CanonicalChatEvent,
): ChatStateDiff[] | null {
  switch (event.type) {
    case 'turn_submitted':
      return onTurnSubmitted(sm, event.turnId);
    case 'turn_started':
      return onTurnStarted(sm);
    case 'provider_session_assigned':
      return onProviderSessionAssigned(sm);
    case 'text_delta':
      return onTextDelta(sm, event.delta);
    case 'tool_call_started':
      return onToolCallStarted(sm, event.toolUseId, event.name);
    case 'tool_call_input_delta':
      return onToolCallInputDelta(sm, event.toolUseId, event.delta);
    case 'tool_call_completed':
      return onToolCallCompleted(sm, event.toolUseId);
    case 'tool_result_observed':
      return onToolResultObserved(sm, event.toolUseId, event.content);
    default:
      return null; // handled by half B
  }
}

// ─── Half B: permission / instructions / terminal / queue / commit events ─────

function applyEventB(sm: ChatSessionStateMachine, event: CanonicalChatEvent): ChatStateDiff[] {
  switch (event.type) {
    case 'tool_permission_requested':
      return onToolPermissionRequested(sm, event.toolUseId, event.request);
    case 'tool_permission_resolved':
      return onToolPermissionResolved(sm, event.toolUseId, event.decision);
    case 'instructions_loaded':
      return onInstructionsLoaded(sm, event.fileNames);
    case 'turn_completed':
      return onTurnCompleted(sm, event.finalText);
    case 'turn_failed':
      return onTurnFailed(sm, event.errorMessage);
    case 'turn_cancelled':
      return onTurnCancelled(sm);
    case 'queue_appended':
      return onQueueAppended(sm, event.queuedMessageId, event.content, event.ts);
    case 'message_committed':
      return onMessageCommitted(sm, event.messageId);
    default: {
      // applyEventA returns null for non-Half-A types, falling through here.
      // We can't use exhaustiveness narrowing because the union still includes
      // Half-A types statically.
      sm.throwInvalidTransition(event.type);
      return [];
    }
  }
}

// ─── Public dispatch entry ────────────────────────────────────────────────────

export function applyEvent(
  sm: ChatSessionStateMachine,
  event: CanonicalChatEvent,
): ChatStateDiff[] {
  return applyEventA(sm, event) ?? applyEventB(sm, event);
}

// ─── Handler implementations ──────────────────────────────────────────────────

function onTurnSubmitted(sm: ChatSessionStateMachine, turnId: TurnId): ChatStateDiff[] {
  sm.requireState('idle', 'turn_submitted');
  sm.activeTurnId = turnId;
  sm.accumulatedText = '';
  sm.toolCallsInFlight.clear();
  sm.toolResults.clear();
  sm.awaitingPermission.clear();
  return [sm.transition('submitting')];
}

function onTurnStarted(sm: ChatSessionStateMachine): ChatStateDiff[] {
  sm.requireState('submitting', 'turn_started');
  return []; // informational only; no state change
}

function onProviderSessionAssigned(sm: ChatSessionStateMachine): ChatStateDiff[] {
  sm.requireState('submitting', 'provider_session_assigned');
  return []; // informational only; no state change
}

function onTextDelta(sm: ChatSessionStateMachine, delta: string): ChatStateDiff[] {
  if (sm.status !== 'submitting' && sm.status !== 'streaming') {
    sm.throwInvalidTransition('text_delta');
  }
  const diffs: ChatStateDiff[] = [];
  if (sm.status === 'submitting') diffs.push(sm.transition('streaming'));
  sm.accumulatedText += delta;
  diffs.push({
    type: 'text_appended',
    threadId: sm.threadId,
    turnId: sm.activeTurnId as TurnId,
    delta,
    seq: sm.nextSeq(),
  });
  return diffs;
}

function onToolCallStarted(
  sm: ChatSessionStateMachine,
  toolUseId: ToolUseId,
  name: string,
): ChatStateDiff[] {
  sm.requireState('streaming', 'tool_call_started');
  const inFlight: ToolCallInFlight = { name, inputJson: '', startedAt: Date.now() };
  sm.toolCallsInFlight.set(toolUseId, inFlight);
  return [
    sm.transition('tool_running'),
    {
      type: 'tool_call_started',
      threadId: sm.threadId,
      turnId: sm.activeTurnId as TurnId,
      toolUseId,
      name,
      seq: sm.nextSeq(),
    },
  ];
}

function onToolCallInputDelta(
  sm: ChatSessionStateMachine,
  toolUseId: ToolUseId,
  delta: string,
): ChatStateDiff[] {
  sm.requireState('tool_running', 'tool_call_input_delta');
  const inFlight = sm.toolCallsInFlight.get(toolUseId);
  if (inFlight) inFlight.inputJson += delta;
  return [
    { type: 'tool_call_input_delta', threadId: sm.threadId, toolUseId, delta, seq: sm.nextSeq() },
  ];
}

function onToolCallCompleted(sm: ChatSessionStateMachine, toolUseId: ToolUseId): ChatStateDiff[] {
  sm.requireState('tool_running', 'tool_call_completed');
  const finalInput = sm.toolCallsInFlight.get(toolUseId)?.inputJson ?? '';
  return [
    sm.transition('streaming'),
    {
      type: 'tool_call_completed',
      threadId: sm.threadId,
      toolUseId,
      finalInput,
      seq: sm.nextSeq(),
    },
  ];
}

function onToolResultObserved(
  sm: ChatSessionStateMachine,
  toolUseId: ToolUseId,
  content: string,
): ChatStateDiff[] {
  // Accepted in both streaming (rare) and tool_running (normal CLI sequence:
  // user event with tool_result arrives while the machine is still tool_running).
  // When in tool_running, receiving the result transitions back to streaming —
  // the tool phase is complete and Claude continues generating.
  if (sm.status !== 'streaming' && sm.status !== 'tool_running') {
    sm.throwInvalidTransition('tool_result_observed');
  }
  const wasToolRunning = sm.status === 'tool_running';
  sm.toolResults.set(toolUseId, content);
  const diffs: import('@shared/types/chatStateDiff').ChatStateDiff[] = [];
  if (wasToolRunning) {
    sm.status = 'streaming';
    diffs.push({
      type: 'status_changed',
      threadId: sm.threadId,
      status: 'streaming',
      seq: sm.nextSeq(),
    });
  }
  diffs.push({
    type: 'tool_result_observed',
    threadId: sm.threadId,
    toolUseId,
    content,
    seq: sm.nextSeq(),
  });
  return diffs;
}

function onToolPermissionRequested(
  sm: ChatSessionStateMachine,
  toolUseId: ToolUseId,
  request: string,
): ChatStateDiff[] {
  sm.requireState('tool_running', 'tool_permission_requested');
  sm.awaitingPermission.add(toolUseId);
  return [
    {
      type: 'tool_permission_requested',
      threadId: sm.threadId,
      toolUseId,
      request,
      seq: sm.nextSeq(),
    },
  ];
}

function onToolPermissionResolved(
  sm: ChatSessionStateMachine,
  toolUseId: ToolUseId,
  decision: 'allow' | 'deny',
): ChatStateDiff[] {
  sm.requireState('tool_running', 'tool_permission_resolved');
  sm.awaitingPermission.delete(toolUseId);
  return [
    {
      type: 'tool_permission_resolved',
      threadId: sm.threadId,
      toolUseId,
      decision,
      seq: sm.nextSeq(),
    },
  ];
}

function onInstructionsLoaded(sm: ChatSessionStateMachine, fileNames: string[]): ChatStateDiff[] {
  // Accepted in any state (spec §4.5 — informational).
  return [
    {
      type: 'instructions_loaded',
      threadId: sm.threadId,
      instructions: fileNames,
      seq: sm.nextSeq(),
    },
  ];
}

function onTurnCompleted(sm: ChatSessionStateMachine, finalText: string): ChatStateDiff[] {
  if (sm.status !== 'streaming' && sm.status !== 'tool_running') {
    sm.throwInvalidTransition('turn_completed');
  }
  return [
    sm.transition('completing'),
    {
      type: 'turn_completed',
      threadId: sm.threadId,
      turnId: sm.activeTurnId as TurnId,
      finalText,
      seq: sm.nextSeq(),
    },
  ];
}

function onTurnFailed(sm: ChatSessionStateMachine, errorMessage: string): ChatStateDiff[] {
  const valid: ChatThreadStatus[] = ['streaming', 'tool_running', 'submitting'];
  if (!valid.includes(sm.status)) sm.throwInvalidTransition('turn_failed');
  return [
    sm.transition('completing'),
    {
      type: 'turn_failed',
      threadId: sm.threadId,
      turnId: sm.activeTurnId as TurnId,
      errorMessage,
      seq: sm.nextSeq(),
    },
  ];
}

function onTurnCancelled(sm: ChatSessionStateMachine): ChatStateDiff[] {
  if (sm.status === 'idle' || sm.status === 'completing')
    sm.throwInvalidTransition('turn_cancelled');
  return [
    sm.transition('completing'),
    {
      type: 'turn_cancelled',
      threadId: sm.threadId,
      turnId: sm.activeTurnId as TurnId,
      seq: sm.nextSeq(),
    },
  ];
}

function onQueueAppended(
  sm: ChatSessionStateMachine,
  id: MessageId,
  content: string,
  addedAt: number,
): ChatStateDiff[] {
  if (sm.status === 'completing') sm.throwInvalidTransition('queue_appended');
  const entry: QueueEntry = { id, content, addedAt };
  sm.queue.push(entry);
  return [
    {
      type: 'queue_appended',
      threadId: sm.threadId,
      queuedMessageId: id,
      content,
      seq: sm.nextSeq(),
    },
  ];
}

function onMessageCommitted(sm: ChatSessionStateMachine, messageId: MessageId): ChatStateDiff[] {
  sm.requireState('completing', 'message_committed');
  const diffs: ChatStateDiff[] = [
    { type: 'message_committed', threadId: sm.threadId, messageId, seq: sm.nextSeq() },
    sm.transition('idle'),
  ];
  sm.activeTurnId = undefined;
  return diffs;
}
