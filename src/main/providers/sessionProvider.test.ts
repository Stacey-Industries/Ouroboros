/**
 * Wave 36 Phase A — sessionProvider smoke tests.
 *
 * These tests verify the type shapes compile and that a concrete object
 * satisfies the `SessionProvider` interface. No runtime logic to unit-test
 * (the file is types-only); the `satisfies` constraints act as the spec.
 */

import { describe, expect, it, vi } from 'vitest';

import type {
  AvailabilityResult,
  ProfileSnapshot,
  SessionEvent,
  SessionEventType,
  SessionHandle,
  SessionProvider,
  SpawnOptions,
} from './sessionProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandle(overrides: Partial<SessionHandle> = {}): SessionHandle {
  return {
    id: 'h-1',
    providerId: 'claude',
    ptySessionId: 'pty-1',
    startedAt: Date.now(),
    status: 'starting',
    ...overrides,
  };
}

function makeEvent(type: SessionEventType = 'stdout'): SessionEvent {
  return { type, sessionId: 's-1', payload: null, at: Date.now() };
}

// ---------------------------------------------------------------------------
// Type-shape smoke tests
// ---------------------------------------------------------------------------

describe('SessionEventType', () => {
  it('covers all expected literals', () => {
    const types: SessionEventType[] = [
      'stdout',
      'stderr',
      'tool-use',
      'completion',
      'error',
      'cost-update',
    ];
    expect(types).toHaveLength(6);
  });
});

describe('SessionEvent', () => {
  it('constructs with required fields', () => {
    const ev = makeEvent('completion');
    expect(ev.type).toBe('completion');
    expect(typeof ev.sessionId).toBe('string');
    expect(typeof ev.at).toBe('number');
  });
});

describe('SessionHandle', () => {
  it('accepts all status values', () => {
    const statuses: SessionHandle['status'][] = ['starting', 'ready', 'closed'];
    for (const status of statuses) {
      const h = makeHandle({ status });
      expect(h.status).toBe(status);
    }
  });
});

describe('SpawnOptions', () => {
  it('compiles with required fields only', () => {
    const opts: SpawnOptions = {
      prompt: 'hello',
      projectPath: '/tmp/proj',
      sessionId: 's-1',
    };
    expect(opts.prompt).toBe('hello');
    expect(opts.resumeThreadId).toBeUndefined();
    expect(opts.profile).toBeUndefined();
  });

  it('accepts optional fields', () => {
    const profile: ProfileSnapshot = {
      id: 'p-1',
      model: 'sonnet',
      tools: ['read', 'write'],
      permissionMode: 'allow',
    };
    const opts: SpawnOptions = {
      prompt: 'hello',
      projectPath: '/tmp/proj',
      sessionId: 's-1',
      resumeThreadId: 'thread-abc',
      profile,
    };
    expect(opts.profile?.permissionMode).toBe('allow');
  });
});

describe('AvailabilityResult', () => {
  it('compiles with available=true and no optional fields', () => {
    const r: AvailabilityResult = { available: true };
    expect(r.available).toBe(true);
  });

  it('compiles with all optional fields', () => {
    const r: AvailabilityResult = {
      available: false,
      reason: 'not installed',
      binary: '/usr/bin/claude',
      version: '1.0.0',
    };
    expect(r.reason).toBe('not installed');
  });
});

describe('SessionProvider interface (mock satisfies)', () => {
  it('accepts a conforming mock object', async () => {
    const handle = makeHandle({ status: 'ready' });

    const provider = {
      id: 'claude',
      label: 'Claude Code',
      binary: 'claude',
      checkAvailability: vi.fn().mockResolvedValue({
        available: true,
        binary: '/usr/bin/claude',
        version: '1.2.3',
      }),
      spawn: vi.fn().mockResolvedValue(handle),
      send: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      onEvent: vi.fn().mockReturnValue(() => undefined),
    } satisfies SessionProvider;

    const avail = await provider.checkAvailability();
    expect(avail.available).toBe(true);

    const spawnedHandle = await provider.spawn({
      prompt: 'test',
      projectPath: '/tmp',
      sessionId: 's-1',
    });
    expect(spawnedHandle.status).toBe('ready');

    await provider.send(handle, 'follow-up');
    expect(provider.send).toHaveBeenCalledWith(handle, 'follow-up');

    await provider.cancel(handle);
    expect(provider.cancel).toHaveBeenCalledWith(handle);

    const cb = vi.fn();
    const unsub = provider.onEvent(handle, cb);
    expect(typeof unsub).toBe('function');
  });
});
