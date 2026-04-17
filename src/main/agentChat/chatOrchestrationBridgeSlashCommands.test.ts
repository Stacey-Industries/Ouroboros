/**
 * chatOrchestrationBridgeSlashCommands.test.ts — Unit tests for the slash-command dispatcher.
 * Wave 30 Phase C.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { getResearchMode, resetAllForTests } from '../research/researchSessionState';
import { dispatchSlashCommand } from './chatOrchestrationBridgeSlashCommands';

afterEach(() => {
  resetAllForTests();
});

const ctx = { sessionId: 'test-session' };

describe('dispatchSlashCommand — non-slash messages', () => {
  it('returns null for plain text', () => {
    expect(dispatchSlashCommand('hello world', ctx)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(dispatchSlashCommand('', ctx)).toBeNull();
  });

  it('returns null for message with slash not at start', () => {
    expect(dispatchSlashCommand('use /research off later', ctx)).toBeNull();
  });
});

describe('dispatchSlashCommand — unknown slash commands', () => {
  it('returns null for unrecognised command', () => {
    expect(dispatchSlashCommand('/unknown something', ctx)).toBeNull();
  });

  it('returns null for /research with unknown subcommand', () => {
    expect(dispatchSlashCommand('/research foobar', ctx)).toBeNull();
  });

  it('returns null for /research with no subcommand', () => {
    expect(dispatchSlashCommand('/research', ctx)).toBeNull();
  });
});

describe('dispatchSlashCommand — /research off', () => {
  it('returns a success result', () => {
    const result = dispatchSlashCommand('/research off', ctx);
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
  });

  it('result carries slashCommandReply', () => {
    const result = dispatchSlashCommand('/research off', ctx) as unknown as Record<string, unknown>;
    expect(typeof result?.slashCommandReply).toBe('string');
    expect(result.slashCommandReply).toMatch(/disabled/i);
  });

  it('updates session state to off', () => {
    dispatchSlashCommand('/research off', ctx);
    expect(getResearchMode('test-session')).toBe('off');
  });
});

describe('dispatchSlashCommand — /research on', () => {
  it('returns a success result', () => {
    const result = dispatchSlashCommand('/research on', ctx);
    expect(result?.success).toBe(true);
  });

  it('sets mode to conservative', () => {
    dispatchSlashCommand('/research on', ctx);
    expect(getResearchMode('test-session')).toBe('conservative');
  });
});

describe('dispatchSlashCommand — /research aggressive', () => {
  it('returns a success result', () => {
    const result = dispatchSlashCommand('/research aggressive', ctx);
    expect(result?.success).toBe(true);
  });

  it('sets mode to aggressive', () => {
    dispatchSlashCommand('/research aggressive', ctx);
    expect(getResearchMode('test-session')).toBe('aggressive');
  });
});

describe('dispatchSlashCommand — /research status', () => {
  it('returns a success result', () => {
    const result = dispatchSlashCommand('/research status', ctx);
    expect(result?.success).toBe(true);
  });

  it('reply contains current mode', () => {
    dispatchSlashCommand('/research aggressive', ctx);
    const result = dispatchSlashCommand('/research status', ctx) as unknown as Record<string, unknown>;
    expect(result?.slashCommandReply).toMatch(/aggressive/i);
  });

  it('does not mutate session mode', () => {
    dispatchSlashCommand('/research off', ctx);
    dispatchSlashCommand('/research status', ctx);
    expect(getResearchMode('test-session')).toBe('off');
  });
});

describe('dispatchSlashCommand — session isolation', () => {
  it('changes to one session do not affect another', () => {
    dispatchSlashCommand('/research off', { sessionId: 'session-a' });
    dispatchSlashCommand('/research aggressive', { sessionId: 'session-b' });
    expect(getResearchMode('session-a')).toBe('off');
    expect(getResearchMode('session-b')).toBe('aggressive');
  });
});
