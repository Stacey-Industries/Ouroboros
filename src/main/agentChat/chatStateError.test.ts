/**
 * chatStateError.test.ts — Smoke tests for the ChatStateError runtime class.
 */

import { describe, expect, it } from 'vitest';

import { ChatStateError } from './chatStateError';

describe('ChatStateError', () => {
  it('extends Error', () => {
    const err = new ChatStateError('unknown-turn', 'turn not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChatStateError);
  });

  it('sets name to ChatStateError', () => {
    const err = new ChatStateError('unknown-turn', 'turn not found');
    expect(err.name).toBe('ChatStateError');
  });

  it('carries kind discriminant', () => {
    const err = new ChatStateError('invalid-transition', 'bad state');
    expect(err.kind).toBe('invalid-transition');
  });

  it('carries message', () => {
    const err = new ChatStateError('malformed-event', 'bad payload');
    expect(err.message).toBe('bad payload');
  });

  it('carries details when provided', () => {
    const err = new ChatStateError('unknown-provider-session', 'no match', {
      session_id: 'abc123',
    });
    expect(err.details).toEqual({ session_id: 'abc123' });
  });

  it('defaults details to empty object', () => {
    const err = new ChatStateError('unknown-thread', 'no thread');
    expect(err.details).toEqual({});
  });

  it('is catchable as an Error', () => {
    const fn = (): void => {
      throw new ChatStateError('duplicate-provider-session-assignment', 'already assigned');
    };
    expect(fn).toThrowError('already assigned');
  });

  it('instanceof check works after throw/catch', () => {
    let caught: unknown;
    try {
      throw new ChatStateError('unknown-turn', 'test');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ChatStateError);
    expect((caught as ChatStateError).kind).toBe('unknown-turn');
  });
});
