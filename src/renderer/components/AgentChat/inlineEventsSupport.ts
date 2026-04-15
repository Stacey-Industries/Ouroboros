/**
 * inlineEventsSupport.ts — Pure helpers for interleaving agent events
 * inline in the chat message stream.
 *
 * An event is eligible to appear between message[i] and message[i+1] when:
 *   - event.type is in the session's inlineEventTypes array
 *   - event.timestamp falls between message[i].createdAt and message[i+1].createdAt
 *     (or after the last message, if it is the tail slot)
 */

import type { AgentSession, ToolCallEvent } from '../AgentMonitor/types';
import type { InlineEventCardData } from './InlineEventCard';

// ─── Build flat event list from agent sessions ────────────────────────────────

function toolCallToEvent(call: ToolCallEvent, sessionId: string): InlineEventCardData {
  return {
    id: `${sessionId}:${call.id}`,
    type: call.toolName === call.toolName ? 'pre_tool_use' : call.toolName,
    timestamp: call.timestamp,
    description: call.toolName,
  };
}

function collectEventsFromSession(
  session: AgentSession,
  allowedTypes: ReadonlySet<string>,
): InlineEventCardData[] {
  const result: InlineEventCardData[] = [];
  for (const call of session.toolCalls) {
    if (!allowedTypes.has('pre_tool_use')) continue;
    result.push(toolCallToEvent(call, session.id));
  }
  if (allowedTypes.has('session_start')) {
    result.push({
      id: `${session.id}:start`,
      type: 'session_start',
      timestamp: session.startedAt,
    });
  }
  if (session.completedAt !== undefined && allowedTypes.has('session_end')) {
    result.push({
      id: `${session.id}:end`,
      type: 'session_end',
      timestamp: session.completedAt,
    });
  }
  return result;
}

export function buildInlineEvents(
  agents: AgentSession[],
  inlineEventTypes: string[],
): InlineEventCardData[] {
  if (inlineEventTypes.length === 0) return [];
  const allowed = new Set(inlineEventTypes);
  const events: InlineEventCardData[] = [];
  for (const session of agents) {
    events.push(...collectEventsFromSession(session, allowed));
  }
  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

// ─── Slot events between messages ─────────────────────────────────────────────

export interface MessageTimestampSlot {
  after: number;
  before: number;
}

/** Returns events whose timestamp falls within [after, before). */
export function eventsInSlot(
  events: InlineEventCardData[],
  slot: MessageTimestampSlot,
): InlineEventCardData[] {
  return events.filter((e) => e.timestamp >= slot.after && e.timestamp < slot.before);
}
