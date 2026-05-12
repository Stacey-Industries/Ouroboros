/**
 * chatOrchestrationSingletons.test.ts — Smoke tests for the shared singletons
 * module used by both chatStateNewPath.ts and the DualEmitOrchestrator startup.
 *
 * Key acceptance criteria:
 *   - registry, normalizer, broadcaster are stable references (same object on
 *     repeated import)
 *   - getPersistence() returns the same instance on repeated calls (lazy singleton)
 *   - clearPersistenceForTest() resets the cached instance
 *   - setDbPathForTest() injects a path so require('./threadStore') is never called
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../storage/database', () => ({
  openDatabase: vi.fn(() => ({ _tag: 'mock-db' })),
}));

vi.mock('./chatPersistenceLayer', () => ({
  ChatPersistenceLayer: vi.fn(function (this: { _tag: string }) {
    this._tag = 'persistence';
  }),
}));

vi.mock('./chatStateBroadcaster', () => ({
  ChatStateBroadcaster: vi.fn(function (this: { _tag: string }) {
    this._tag = 'broadcaster';
  }),
}));

vi.mock('./eventNormalizer', () => ({
  EventNormalizer: vi.fn(function (this: { _tag: string }) {
    this._tag = 'normalizer';
  }),
}));

vi.mock('./identityRegistry', () => ({
  IdentityRegistry: vi.fn(function (this: { _tag: string }) {
    this._tag = 'registry';
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('chatOrchestrationSingletons', () => {
  // Import once — module-level singletons are stable across tests in the same file.
  // We use setDbPathForTest to avoid require('./threadStore') touching app.getPath.
  let mod: typeof import('./chatOrchestrationSingletons');

  beforeEach(async () => {
    mod = await import('./chatOrchestrationSingletons');
    // Inject a fake db path so getPersistence() never calls require('./threadStore').
    mod.setDbPathForTest('/tmp/test-threads/threads.db');
  });

  afterEach(() => {
    mod.clearDbPathOverrideForTest();
  });

  it('exports registry, normalizer, broadcaster as defined objects', () => {
    expect(mod.registry).toBeDefined();
    expect(mod.normalizer).toBeDefined();
    expect(mod.broadcaster).toBeDefined();
  });

  it('registry and normalizer are distinct objects', () => {
    expect(mod.registry).not.toBe(mod.normalizer);
    expect(mod.registry).not.toBe(mod.broadcaster);
  });

  it('getPersistence returns same instance on repeated calls', () => {
    const first = mod.getPersistence();
    const second = mod.getPersistence();
    expect(first).toBe(second);
  });

  it('clearPersistenceForTest resets the cached instance', () => {
    const first = mod.getPersistence();
    mod.clearPersistenceForTest();
    const second = mod.getPersistence();
    expect(first).not.toBe(second);
  });
});
