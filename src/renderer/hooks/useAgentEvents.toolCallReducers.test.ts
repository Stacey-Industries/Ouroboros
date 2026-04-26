import { describe, expect, it } from 'vitest';

import type { AgentState } from './useAgentEvents.helpers';
import { initialAgentState } from './useAgentEvents.helpers';
import { finishToolCall, startToolCall } from './useAgentEvents.toolCallReducers';

describe('useAgentEvents.toolCallReducers', () => {
  describe('startToolCall', () => {
    it('adds a new tool call to a session', () => {
      const state: AgentState = {
        ...initialAgentState,
        sessions: [
          {
            id: 'session-1',
            taskLabel: 'Test',
            status: 'running',
            startedAt: 100,
            toolCalls: [],
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      };

      const action = {
        type: 'TOOL_START' as const,
        sessionId: 'session-1',
        toolCall: {
          id: 'tool-1',
          toolName: 'read',
          input: { path: '/file.ts' },
          timestamp: 200,
          status: 'pending' as const,
        },
      };

      const result = startToolCall(state, action);
      expect(result.sessions[0].toolCalls).toHaveLength(1);
      expect(result.sessions[0].toolCalls[0].id).toBe('tool-1');
    });

    it('updates existing tool call if already present', () => {
      const state: AgentState = {
        ...initialAgentState,
        sessions: [
          {
            id: 'session-1',
            taskLabel: 'Test',
            status: 'running',
            startedAt: 100,
            toolCalls: [
              {
                id: 'tool-1',
                toolName: 'read',
                input: { path: '/old.ts' },
                timestamp: 200,
                status: 'pending',
              },
            ],
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      };

      const action = {
        type: 'TOOL_START' as const,
        sessionId: 'session-1',
        toolCall: {
          id: 'tool-1',
          toolName: 'write',
          input: { path: '/new.ts' },
          timestamp: 250,
          status: 'pending' as const,
        },
      };

      const result = startToolCall(state, action);
      expect(result.sessions[0].toolCalls).toHaveLength(1);
      expect(result.sessions[0].toolCalls[0].toolName).toBe('write');
    });
  });

  describe('finishToolCall', () => {
    it('updates tool call status and output', () => {
      const state: AgentState = {
        ...initialAgentState,
        sessions: [
          {
            id: 'session-1',
            taskLabel: 'Test',
            status: 'running',
            startedAt: 100,
            toolCalls: [
              {
                id: 'tool-1',
                toolName: 'read',
                input: { path: '/file.ts' },
                timestamp: 200,
                status: 'pending',
              },
            ],
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      };

      const action = {
        type: 'TOOL_END' as const,
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        duration: 500,
        status: 'success' as const,
        output: 'file contents',
      };

      const result = finishToolCall(state, action);
      expect(result.sessions[0].toolCalls[0].status).toBe('success');
      expect(result.sessions[0].toolCalls[0].output).toBe('file contents');
      expect(result.sessions[0].toolCalls[0].duration).toBe(500);
    });

    it('does nothing if tool call not found', () => {
      const state: AgentState = {
        ...initialAgentState,
        sessions: [
          {
            id: 'session-1',
            taskLabel: 'Test',
            status: 'running',
            startedAt: 100,
            toolCalls: [],
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
      };

      const action = {
        type: 'TOOL_END' as const,
        sessionId: 'session-1',
        toolCallId: 'nonexistent',
        duration: 500,
        status: 'error' as const,
      };

      const result = finishToolCall(state, action);
      expect(result.sessions[0].toolCalls).toHaveLength(0);
    });
  });
});
