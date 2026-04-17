/**
 * researchSessionState.test.ts — Unit tests for per-session research state store.
 * Wave 30 Phase C.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  addEnhancedLibrary,
  clearSession,
  getEnhancedLibraries,
  getResearchMode,
  getSnapshot,
  resetAllForTests,
  setResearchMode,
} from './researchSessionState';

afterEach(() => {
  resetAllForTests();
});

describe('getResearchMode', () => {
  it('returns conservative for unknown session', () => {
    expect(getResearchMode('unknown-session')).toBe('conservative');
  });

  it('returns the mode that was set', () => {
    setResearchMode('s1', 'aggressive');
    expect(getResearchMode('s1')).toBe('aggressive');
  });

  it('returns off after setting off', () => {
    setResearchMode('s2', 'off');
    expect(getResearchMode('s2')).toBe('off');
  });
});

describe('setResearchMode', () => {
  it('can change mode multiple times', () => {
    setResearchMode('s3', 'off');
    setResearchMode('s3', 'aggressive');
    setResearchMode('s3', 'conservative');
    expect(getResearchMode('s3')).toBe('conservative');
  });

  it('isolates mode per session', () => {
    setResearchMode('a', 'off');
    setResearchMode('b', 'aggressive');
    expect(getResearchMode('a')).toBe('off');
    expect(getResearchMode('b')).toBe('aggressive');
  });
});

describe('getEnhancedLibraries', () => {
  it('returns empty set for unknown session', () => {
    expect(getEnhancedLibraries('unknown').size).toBe(0);
  });

  it('returns libraries after adding', () => {
    addEnhancedLibrary('s4', 'react');
    addEnhancedLibrary('s4', 'next');
    const libs = getEnhancedLibraries('s4');
    expect(libs.has('react')).toBe(true);
    expect(libs.has('next')).toBe(true);
    expect(libs.size).toBe(2);
  });

  it('deduplicates libraries', () => {
    addEnhancedLibrary('s5', 'zod');
    addEnhancedLibrary('s5', 'zod');
    expect(getEnhancedLibraries('s5').size).toBe(1);
  });
});

describe('getSnapshot', () => {
  it('returns conservative mode and empty set for new session', () => {
    const snap = getSnapshot('new-session');
    expect(snap.mode).toBe('conservative');
    expect(snap.enhancedLibraries.size).toBe(0);
  });

  it('reflects current mode and libraries', () => {
    setResearchMode('s6', 'aggressive');
    addEnhancedLibrary('s6', 'prisma');
    const snap = getSnapshot('s6');
    expect(snap.mode).toBe('aggressive');
    expect(snap.enhancedLibraries.has('prisma')).toBe(true);
  });
});

describe('clearSession', () => {
  it('removes session state — mode reverts to default', () => {
    setResearchMode('s7', 'off');
    clearSession('s7');
    expect(getResearchMode('s7')).toBe('conservative');
  });

  it('removes session state — libraries revert to empty', () => {
    addEnhancedLibrary('s8', 'drizzle');
    clearSession('s8');
    expect(getEnhancedLibraries('s8').size).toBe(0);
  });

  it('is a no-op for unknown sessions', () => {
    expect(() => clearSession('does-not-exist')).not.toThrow();
  });
});

describe('resetAllForTests', () => {
  it('clears all sessions', () => {
    setResearchMode('x', 'off');
    setResearchMode('y', 'aggressive');
    resetAllForTests();
    expect(getResearchMode('x')).toBe('conservative');
    expect(getResearchMode('y')).toBe('conservative');
  });
});
