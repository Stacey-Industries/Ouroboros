/**
 * correctionStore.test.ts — Unit tests for CorrectionStore.
 * Wave 29.5 Phase H (H4) + Wave 30 Phase E.
 *
 * Covers: add to session, dedupe same library, clearSession wipes,
 * independent sessions isolated, empty session returns empty Set.
 *
 * Phase E: getLibraries(sessionId) is the consumer-facing accessor used by
 * preToolResearchOrchestrator to merge correction libraries into
 * TriggerContext.sessionFlags.enhancedLibraries at evaluate time (pull approach).
 * No new helper was needed — getLibraries already exposes the right API.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { buildCorrectionStore, type CorrectionStore } from './correctionStore';

describe('CorrectionStore', () => {
  let store: CorrectionStore;

  beforeEach(() => {
    store = buildCorrectionStore();
  });

  it('returns empty Set for unknown session', () => {
    const libs = store.getLibraries('no-such-session');
    expect(libs.size).toBe(0);
  });

  it('noteCorrection adds the library to the session set', () => {
    store.noteCorrection('sess-1', 'Zod');
    const libs = store.getLibraries('sess-1');
    expect(libs.has('Zod')).toBe(true);
    expect(libs.size).toBe(1);
  });

  it('deduplicates the same library within a session', () => {
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-1', 'Zod');
    expect(store.getLibraries('sess-1').size).toBe(1);
  });

  it('accumulates multiple distinct libraries for a session', () => {
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-1', 'React');
    store.noteCorrection('sess-1', 'Prisma');
    const libs = store.getLibraries('sess-1');
    expect(libs.size).toBe(3);
    expect(libs.has('Zod')).toBe(true);
    expect(libs.has('React')).toBe(true);
    expect(libs.has('Prisma')).toBe(true);
  });

  it('clearSession removes all libraries for that session', () => {
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-1', 'React');
    store.clearSession('sess-1');
    expect(store.getLibraries('sess-1').size).toBe(0);
  });

  it('clearSession does not affect other sessions', () => {
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-2', 'React');
    store.clearSession('sess-1');
    expect(store.getLibraries('sess-1').size).toBe(0);
    expect(store.getLibraries('sess-2').has('React')).toBe(true);
  });

  it('independent sessions are isolated from each other', () => {
    store.noteCorrection('sess-A', 'TypeScript');
    store.noteCorrection('sess-B', 'Vite');
    expect(store.getLibraries('sess-A').has('Vite')).toBe(false);
    expect(store.getLibraries('sess-B').has('TypeScript')).toBe(false);
  });

  it('clearSession on unknown session is a no-op', () => {
    expect(() => store.clearSession('ghost-session')).not.toThrow();
  });

  it('_resetForTests clears all sessions', () => {
    store.noteCorrection('sess-1', 'Zod');
    store.noteCorrection('sess-2', 'React');
    store._resetForTests();
    expect(store.getLibraries('sess-1').size).toBe(0);
    expect(store.getLibraries('sess-2').size).toBe(0);
  });
});

// ─── Wave 30 Phase E — getLibraries as consumer-facing accessor ───────────────

describe('CorrectionStore.getLibraries — Phase E consumer-facing API', () => {
  let store: CorrectionStore;

  beforeEach(() => {
    store = buildCorrectionStore();
  });

  it('returns ReadonlySet-compatible value for unknown session (empty set)', () => {
    const libs = store.getLibraries('unknown-session-e');
    // Must be iterable and have a size of 0 — satisfies ReadonlySet contract
    expect(libs.size).toBe(0);
    expect([...libs]).toEqual([]);
  });

  it('returns correct set for a session with corrections (Phase E bridge input)', () => {
    store.noteCorrection('sess-e', 'zod');
    store.noteCorrection('sess-e', 'react-query');
    const libs = store.getLibraries('sess-e');
    expect(libs.size).toBe(2);
    expect(libs.has('zod')).toBe(true);
    expect(libs.has('react-query')).toBe(true);
  });

  it('no cross-session leakage when multiple sessions have corrections', () => {
    store.noteCorrection('sess-e-a', 'zod');
    store.noteCorrection('sess-e-b', 'react-query');
    // Each session only sees its own corrections
    expect(store.getLibraries('sess-e-a').has('react-query')).toBe(false);
    expect(store.getLibraries('sess-e-b').has('zod')).toBe(false);
  });
});
