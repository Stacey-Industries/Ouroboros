import { describe, expect, it, vi } from 'vitest';

import type { HookPayload } from '../types/electron';
import {
  dispatchElicitation,
  dispatchElicitationResult,
  dispatchUserPrompt,
} from './useAgentEvents.conversationDispatchers';

function makePayload(overrides: Partial<HookPayload> = {}): HookPayload {
  return {
    type: 'user_prompt_submit',
    sessionId: 'sess-1',
    timestamp: 2000,
    ...overrides,
  };
}

describe('dispatchUserPrompt', () => {
  it('dispatches CONVERSATION_TURN with type prompt', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(
      makePayload({ data: { message: 'Hello agent' } }),
      dispatch,
    );
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('CONVERSATION_TURN');
    expect(action.turn.type).toBe('prompt');
    expect(action.turn.content).toBe('Hello agent');
  });

  it('falls back to prompt field', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(makePayload({ data: { prompt: 'Alt prompt' } }), dispatch);
    expect(dispatch.mock.calls[0][0].turn.content).toBe('Alt prompt');
  });

  it('uses empty string when no content found', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(makePayload({ data: {} }), dispatch);
    expect(dispatch.mock.calls[0][0].turn.content).toBe('');
  });
});

describe('dispatchElicitation', () => {
  it('dispatches CONVERSATION_TURN with type elicitation', () => {
    const dispatch = vi.fn();
    dispatchElicitation(
      makePayload({
        type: 'elicitation',
        data: { message: 'What directory?', title: 'Select directory' },
      }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.turn.type).toBe('elicitation');
    expect(action.turn.content).toBe('What directory?');
    expect(action.turn.question).toBe('Select directory');
  });
});

describe('dispatchElicitationResult', () => {
  it('dispatches CONVERSATION_TURN with type elicitation_result', () => {
    const dispatch = vi.fn();
    dispatchElicitationResult(
      makePayload({
        type: 'elicitation_result',
        data: { result: '/home/user/project' },
      }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.turn.type).toBe('elicitation_result');
    expect(action.turn.content).toBe('/home/user/project');
  });

  it('falls back to response field', () => {
    const dispatch = vi.fn();
    dispatchElicitationResult(
      makePayload({ data: { response: 'yes' } }),
      dispatch,
    );
    expect(dispatch.mock.calls[0][0].turn.content).toBe('yes');
  });
});

// ─── Null / undefined data payloads ──────────────────────────────────────────

describe('null data payload handling', () => {
  it('dispatchUserPrompt handles undefined data gracefully', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(makePayload({ type: 'user_prompt_submit', data: undefined }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('CONVERSATION_TURN');
    expect(action.turn.content).toBe('');
  });

  it('dispatchElicitation handles undefined data gracefully', () => {
    const dispatch = vi.fn();
    dispatchElicitation(makePayload({ type: 'elicitation', data: undefined }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.turn.type).toBe('elicitation');
    expect(action.turn.content).toBe('');
    expect(action.turn.question).toBeUndefined();
  });

  it('dispatchElicitationResult handles undefined data gracefully', () => {
    const dispatch = vi.fn();
    dispatchElicitationResult(makePayload({ type: 'elicitation_result', data: undefined }), dispatch);
    expect(dispatch).toHaveBeenCalledOnce();
    const action = dispatch.mock.calls[0][0];
    expect(action.turn.type).toBe('elicitation_result');
    expect(action.turn.content).toBe('');
  });

  it('dispatchUserPrompt preserves sessionId and timestamp', () => {
    const dispatch = vi.fn();
    dispatchUserPrompt(
      makePayload({ type: 'user_prompt_submit', sessionId: 'my-sess', timestamp: 9999, data: undefined }),
      dispatch,
    );
    const action = dispatch.mock.calls[0][0];
    expect(action.sessionId).toBe('my-sess');
    expect(action.turn.timestamp).toBe(9999);
  });
});
