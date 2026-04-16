/**
 * session.test.ts — Unit tests for session primitive and makeSession factory.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../profiles/profileStore', () => ({
  getProfileStore: vi.fn(() => null),
}));

import { makeSession, type Session } from './session';

// ─── UUID format helper ───────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('makeSession', () => {
  it('produces a valid v4 UUID as id', () => {
    const s = makeSession('/projects/foo');
    expect(s.id).toMatch(UUID_RE);
  });

  it('produces unique ids on successive calls', () => {
    const a = makeSession('/projects/foo');
    const b = makeSession('/projects/foo');
    expect(a.id).not.toBe(b.id);
  });

  it('sets createdAt to a valid ISO timestamp', () => {
    const s = makeSession('/projects/foo');
    expect(s.createdAt).toMatch(ISO_RE);
  });

  it('sets lastUsedAt equal to createdAt', () => {
    const s = makeSession('/projects/foo');
    expect(s.lastUsedAt).toBe(s.createdAt);
  });

  it('sets worktree to false by default', () => {
    const s = makeSession('/projects/foo');
    expect(s.worktree).toBe(false);
  });

  it('stores the provided projectRoot', () => {
    const s = makeSession('/projects/my-app');
    expect(s.projectRoot).toBe('/projects/my-app');
  });

  it('initialises tags as empty array', () => {
    const s = makeSession('/projects/foo');
    expect(s.tags).toEqual([]);
  });

  it('initialises activeTerminalIds as empty array', () => {
    const s = makeSession('/projects/foo');
    expect(s.activeTerminalIds).toEqual([]);
  });

  it('initialises costRollup with all zeros', () => {
    const s = makeSession('/projects/foo');
    expect(s.costRollup).toEqual({ totalUsd: 0, inputTokens: 0, outputTokens: 0 });
  });

  it('initialises telemetry.correlationIds as empty array', () => {
    const s = makeSession('/projects/foo');
    expect(s.telemetry.correlationIds).toEqual([]);
  });

  it('sets telemetry.telemetrySessionId equal to session id', () => {
    const s = makeSession('/projects/foo');
    expect(s.telemetry.telemetrySessionId).toBe(s.id);
  });

  it('leaves optional fields undefined', () => {
    const s = makeSession('/projects/foo');
    expect(s.archivedAt).toBeUndefined();
    expect(s.worktreePath).toBeUndefined();
    expect(s.conversationThreadId).toBeUndefined();
    expect(s.bounds).toBeUndefined();
    expect(s.layoutPresetId).toBeUndefined();
    expect(s.profileId).toBeUndefined();
  });

  it('accepts empty string projectRoot', () => {
    const s = makeSession('');
    expect(s.projectRoot).toBe('');
    expect(s.id).toMatch(UUID_RE);
  });

  it('shape satisfies the Session interface', () => {
    const s: Session = makeSession('/projects/foo');
    expect(typeof s.id).toBe('string');
    expect(typeof s.createdAt).toBe('string');
    expect(typeof s.lastUsedAt).toBe('string');
    expect(typeof s.worktree).toBe('boolean');
  });
});
