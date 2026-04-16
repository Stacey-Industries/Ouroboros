/**
 * researchCache.ts — SQLite-backed research artifact cache (Wave 25 Phase B).
 *
 * Database: {userData}/research-cache.db
 * Table: research_cache(key, library, topic, version, artifact, createdAt, ttlMs)
 *
 * Uses the shared storage/database.ts helpers — no hand-rolled DB access.
 */

import type { ResearchArtifact } from '@shared/types/research';

import type { Database } from '../storage/database';
import {
  getSchemaVersion,
  openDatabase,
  runTransaction,
  setSchemaVersion,
} from '../storage/database';

// ─── TTL matrix ───────────────────────────────────────────────────────────────

const MS_H = 60 * 60 * 1000;
const MS_D = 24 * MS_H;

const HIGH_VELOCITY_LIBS = new Set([
  'next', 'next.js', 'react', 'vercel-ai-sdk', '@ai-sdk', 'shadcn', 'shadcn-ui',
]);
const MID_LIBS = new Set(['prisma', 'tailwind', 'tailwindcss']);
const STABLE_LIBS = new Set(['lodash', 'express']);

const SYSTEM_PREFIXES = ['@types/node', 'node:', 'mdn:'];

/**
 * Returns the recommended TTL in milliseconds for a given library name.
 *
 * Tiers:
 *   High-velocity (Next.js, React, Vercel AI SDK, shadcn) → 48 h
 *   Mid (Prisma, Tailwind)                                 → 7 d
 *   Stable (Lodash, Express)                               → 30 d
 *   System (Node.js, web standards)                        → 90 d
 *   Everything else                                        → 7 d
 */
export function ttlForLibrary(library: string): number {
  const key = library.toLowerCase().trim();
  if (SYSTEM_PREFIXES.some((p) => key.startsWith(p)) || key === 'node') {
    return 90 * MS_D;
  }
  if (HIGH_VELOCITY_LIBS.has(key)) return 48 * MS_H;
  if (MID_LIBS.has(key)) return 7 * MS_D;
  if (STABLE_LIBS.has(key)) return 30 * MS_D;
  return 7 * MS_D; // mid-tier default
}

// ─── Cache key ────────────────────────────────────────────────────────────────

/**
 * Normalises a (library, topic, version) triple into a stable string key.
 *
 * Version range resolution: strips SemVer operators and keeps only the
 * MAJOR.MINOR prefix so that "next@^15.2", "next@~15.2.0", and
 * "next@15.2.0" all map to "next@15.2::topic".
 */
export function cacheKey(library: string, topic: string, version?: string): string {
  const lib = library.toLowerCase().trim();
  const top = topic.toLowerCase().trim();
  if (!version) return `${lib}::${top}`;
  const stripped = version.replace(/^[\^~>=<*]+/, '').trim();
  const parts = stripped.split('.');
  const normalized = parts.slice(0, 2).join('.');
  return `${lib}@${normalized}::${top}`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function ensureSchema(db: Database): void {
  if (getSchemaVersion(db) >= 1) return;
  runTransaction(db, () => {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS research_cache (
        key       TEXT PRIMARY KEY,
        library   TEXT NOT NULL DEFAULT '',
        topic     TEXT NOT NULL DEFAULT '',
        version   TEXT NOT NULL DEFAULT '',
        artifact  TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        ttlMs     INTEGER NOT NULL
      )
    `).run();
    db.prepare('CREATE INDEX IF NOT EXISTS idx_rc_createdAt ON research_cache(createdAt)').run();
    setSchemaVersion(db, 1);
  });
}

// ─── ResearchCache class ──────────────────────────────────────────────────────

export class ResearchCache {
  private db: Database;

  constructor(dbPath: string) {
    this.db = openDatabase(dbPath);
    ensureSchema(this.db);
  }

  get(key: string): ResearchArtifact | null {
    const row = this.db
      .prepare('SELECT artifact, createdAt, ttlMs FROM research_cache WHERE key = ?')
      .get(key) as { artifact: string; createdAt: number; ttlMs: number } | undefined;
    if (!row) return null;
    if (Date.now() > row.createdAt + row.ttlMs) return null;
    try {
      return JSON.parse(row.artifact) as ResearchArtifact;
    } catch {
      return null;
    }
  }

  put(key: string, artifact: ResearchArtifact, ttlMs: number): void {
    this.db
      .prepare(`
        INSERT OR REPLACE INTO research_cache
          (key, library, topic, version, artifact, createdAt, ttlMs)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        key,
        artifact.library ?? '',
        artifact.topic,
        artifact.version ?? '',
        JSON.stringify(artifact),
        artifact.createdAt,
        ttlMs,
      );
  }

  purgeExpired(): number {
    const now = Date.now();
    const result = this.db
      .prepare('DELETE FROM research_cache WHERE (createdAt + ttlMs) < ?')
      .run(now);
    return result.changes;
  }

  close(): void {
    try { this.db.close(); } catch { /* already closed */ }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _cache: ResearchCache | null = null;

export function getResearchCache(dbPath: string): ResearchCache {
  if (!_cache) _cache = new ResearchCache(dbPath);
  return _cache;
}

export function resetResearchCacheForTests(): void {
  if (_cache) { _cache.close(); _cache = null; }
}
