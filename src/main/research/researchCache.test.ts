/**
 * researchCache.test.ts — Unit tests for ResearchCache and helpers.
 *
 * Uses an in-memory SQLite path (:memory: via tmp file) so tests are
 * hermetic and don't touch the real userData directory.
 */

import type { ResearchArtifact } from '@shared/types/research';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  cacheKey,
  ResearchCache,
  resetResearchCacheForTests,
  ttlForLibrary,
} from './researchCache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `research-cache-test-${Date.now()}-${Math.random()}.db`);
}

function makeArtifact(overrides: Partial<ResearchArtifact> = {}): ResearchArtifact {
  return {
    id: 'test-uuid',
    topic: 'app router data fetching',
    library: 'next',
    version: '15.2.0',
    sources: [{ url: 'https://nextjs.org/docs', title: 'Next.js Docs' }],
    summary: 'Use fetch() in Server Components for data fetching.',
    relevantSnippets: [{ content: 'async function Page() {}', source: 'nextjs.org' }],
    confidenceHint: 'high',
    correlationId: 'test-uuid',
    createdAt: Date.now(),
    cached: false,
    ...overrides,
  };
}

// ─── cacheKey ─────────────────────────────────────────────────────────────────

describe('cacheKey', () => {
  it('produces lib::topic when no version provided', () => {
    expect(cacheKey('React', 'hooks overview')).toBe('react::hooks overview');
  });

  it('normalises version range to MAJOR.MINOR prefix', () => {
    expect(cacheKey('next', 'routing', '^15.2.0')).toBe('next@15.2::routing');
    expect(cacheKey('next', 'routing', '~15.2.1')).toBe('next@15.2::routing');
    expect(cacheKey('next', 'routing', '15.2.0')).toBe('next@15.2::routing');
  });

  it('two ranges resolving to same MAJOR.MINOR produce the same key', () => {
    const k1 = cacheKey('next', 'app router', '^15.2');
    const k2 = cacheKey('next', 'app router', '15.2.0');
    expect(k1).toBe(k2);
  });

  it('lowercases library and topic', () => {
    expect(cacheKey('Next.JS', 'App Router')).toBe('next.js::app router');
  });
});

// ─── ttlForLibrary ────────────────────────────────────────────────────────────

describe('ttlForLibrary', () => {
  const H = 60 * 60 * 1000;
  const D = 24 * H;

  it('returns 48 h for next', () => expect(ttlForLibrary('next')).toBe(48 * H));
  it('returns 48 h for react', () => expect(ttlForLibrary('react')).toBe(48 * H));
  it('returns 48 h for shadcn', () => expect(ttlForLibrary('shadcn')).toBe(48 * H));
  it('returns 7 d for prisma', () => expect(ttlForLibrary('prisma')).toBe(7 * D));
  it('returns 7 d for tailwindcss', () => expect(ttlForLibrary('tailwindcss')).toBe(7 * D));
  it('returns 30 d for lodash', () => expect(ttlForLibrary('lodash')).toBe(30 * D));
  it('returns 30 d for express', () => expect(ttlForLibrary('express')).toBe(30 * D));
  it('returns 90 d for node', () => expect(ttlForLibrary('node')).toBe(90 * D));
  it('returns 90 d for @types/node prefix', () => expect(ttlForLibrary('@types/node')).toBe(90 * D));
  it('returns 90 d for node: prefix', () => expect(ttlForLibrary('node:fs')).toBe(90 * D));
  it('returns 90 d for mdn: prefix', () => expect(ttlForLibrary('mdn:fetch')).toBe(90 * D));
  it('returns 7 d (default) for unknown library', () => {
    expect(ttlForLibrary('some-unknown-lib')).toBe(7 * D);
  });
});

// ─── ResearchCache ────────────────────────────────────────────────────────────

describe('ResearchCache', () => {
  let cache: ResearchCache;
  let dbPath: string;

  beforeEach(() => {
    resetResearchCacheForTests();
    dbPath = tmpDbPath();
    cache = new ResearchCache(dbPath);
  });

  afterEach(() => {
    cache.close();
    resetResearchCacheForTests();
  });

  it('returns null for a missing key', () => {
    expect(cache.get('missing::key')).toBeNull();
  });

  it('stores and retrieves an artifact', () => {
    const artifact = makeArtifact();
    const key = cacheKey('next', 'app router data fetching', '15.2.0');
    cache.put(key, artifact, ttlForLibrary('next'));
    const result = cache.get(key);
    expect(result).not.toBeNull();
    expect(result?.topic).toBe('app router data fetching');
    expect(result?.confidenceHint).toBe('high');
  });

  it('returns null when TTL is expired', () => {
    const artifact = makeArtifact({ createdAt: Date.now() - 1000 });
    const key = 'next::expired';
    cache.put(key, artifact, 500); // 500 ms TTL — already expired
    expect(cache.get(key)).toBeNull();
  });

  it('returns artifact when TTL is not yet expired', () => {
    const artifact = makeArtifact();
    const key = 'next::fresh';
    cache.put(key, artifact, 60_000); // 60 s TTL
    expect(cache.get(key)).not.toBeNull();
  });

  it('purgeExpired removes expired rows and returns count', () => {
    const expired = makeArtifact({ createdAt: Date.now() - 2000 });
    const fresh = makeArtifact();
    cache.put('lib::expired', expired, 100); // expired immediately
    cache.put('lib::fresh', fresh, 60_000);
    const purged = cache.purgeExpired();
    expect(purged).toBe(1);
    expect(cache.get('lib::expired')).toBeNull();
    expect(cache.get('lib::fresh')).not.toBeNull();
  });

  it('upserts on repeated put for same key', () => {
    const key = 'next::upsert';
    cache.put(key, makeArtifact({ summary: 'first' }), 60_000);
    cache.put(key, makeArtifact({ summary: 'second' }), 60_000);
    expect(cache.get(key)?.summary).toBe('second');
  });

  it('purgeExpired returns 0 when nothing is expired', () => {
    cache.put('lib::fresh', makeArtifact(), 60_000);
    expect(cache.purgeExpired()).toBe(0);
  });
});
