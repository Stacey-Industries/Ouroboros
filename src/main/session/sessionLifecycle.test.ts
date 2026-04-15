/**
 * sessionLifecycle.test.ts — Unit tests for session lifecycle telemetry emitters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the telemetry module before importing the module under test.
vi.mock('../telemetry', () => ({
  getTelemetryStore: vi.fn(),
}));

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getTelemetryStore } from '../telemetry';
import { makeSession } from './session';
import {
  emitSessionActivated,
  emitSessionArchived,
  emitSessionCreated,
} from './sessionLifecycle';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockStore() {
  return { record: vi.fn(), recordOutcome: vi.fn(), recordTrace: vi.fn(),
    queryEvents: vi.fn(), queryOutcomes: vi.fn(), queryTraces: vi.fn(),
    close: vi.fn() };
}

const mockGetTelemetryStore = vi.mocked(getTelemetryStore);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('emitSessionCreated', () => {
  let store: ReturnType<typeof makeMockStore>;

  beforeEach(() => {
    store = makeMockStore();
    mockGetTelemetryStore.mockReturnValue(store as never);
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('calls store.record with type session.created', () => {
    const session = makeSession('/projects/foo');
    emitSessionCreated(session);
    expect(store.record).toHaveBeenCalledOnce();
    const payload = store.record.mock.calls[0][0];
    expect(payload.type).toBe('session.created');
  });

  it('passes the session id as sessionId', () => {
    const session = makeSession('/projects/foo');
    emitSessionCreated(session);
    const payload = store.record.mock.calls[0][0];
    expect(payload.sessionId).toBe(session.id);
  });

  it('includes a correlationId string', () => {
    const session = makeSession('/projects/foo');
    emitSessionCreated(session);
    const payload = store.record.mock.calls[0][0];
    expect(typeof payload.correlationId).toBe('string');
    expect(payload.correlationId.length).toBeGreaterThan(0);
  });

  it('includes a numeric timestamp', () => {
    const session = makeSession('/projects/foo');
    emitSessionCreated(session);
    const payload = store.record.mock.calls[0][0];
    expect(typeof payload.timestamp).toBe('number');
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  it('includes projectRoot, worktree, and worktreePath in data', () => {
    const session = makeSession('/projects/bar');
    emitSessionCreated(session);
    const payload = store.record.mock.calls[0][0];
    expect(payload.data).toMatchObject({
      projectRoot: '/projects/bar',
      worktree: false,
      worktreePath: undefined,
    });
  });
});

describe('emitSessionActivated', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('records type session.activated', () => {
    const store = makeMockStore();
    mockGetTelemetryStore.mockReturnValue(store as never);
    const session = makeSession('/projects/foo');
    emitSessionActivated(session);
    expect(store.record.mock.calls[0][0].type).toBe('session.activated');
  });
});

describe('emitSessionArchived', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('records type session.archived', () => {
    const store = makeMockStore();
    mockGetTelemetryStore.mockReturnValue(store as never);
    const session = makeSession('/projects/foo');
    emitSessionArchived(session);
    expect(store.record.mock.calls[0][0].type).toBe('session.archived');
  });
});

describe('flag-off / no-store cases', () => {
  afterEach(() => { vi.clearAllMocks(); });

  it('is a safe no-op when getTelemetryStore returns null', () => {
    mockGetTelemetryStore.mockReturnValue(null);
    const session = makeSession('/projects/foo');
    expect(() => emitSessionCreated(session)).not.toThrow();
    expect(() => emitSessionActivated(session)).not.toThrow();
    expect(() => emitSessionArchived(session)).not.toThrow();
  });
});
