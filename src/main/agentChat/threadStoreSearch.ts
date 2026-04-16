/**
 * threadStoreSearch.ts — FTS5-backed full-text search over chat threads.
 *
 * Primary entry point: searchThreads(db, query, opts)
 *
 * FTS5 path:
 *   SELECT ... FROM thread_fts WHERE thread_fts MATCH ? ORDER BY rank LIMIT ?
 *   Uses FTS5 snippet() for highlighted context (~80 chars).
 *
 * Fallback path (when FTS5 unavailable):
 *   LIKE %query% over messages.content, joined to threads.
 *   Produces a manually-centered substring snippet.
 *   This is intentional — lower quality but always functional.
 */

import log from '../logger';
import type { Database } from '../storage/database';

// ── Types ────────────────────────────────────────────────────────────

export interface SearchResult {
  threadId: string;
  score: number;
  snippet: string;
  messageId?: string;
}

export interface SearchOptions {
  limit?: number;
  threadId?: string;
}

const DEFAULT_LIMIT = 20;
const SNIPPET_RADIUS = 40;

// ── FTS5 path ────────────────────────────────────────────────────────

interface FtsRow {
  threadId: string;
  snippet: string;
  rank: number;
}

/**
 * Escape special FTS5 query characters by wrapping tokens in double quotes.
 * FTS5 treats bare special chars (AND, OR, NOT, *, (, )) as syntax elements.
 */
function escapeFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`)
    .join(' ');
}

function searchFts(db: Database, query: string, opts: SearchOptions): SearchResult[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  try {
    let sql =
      `SELECT threadId, snippet(thread_fts, 1, '<b>', '</b>', '...', 10) AS snippet, rank ` +
      `FROM thread_fts WHERE thread_fts MATCH ?`;
    const params: unknown[] = [escapeFtsQuery(query)];

    if (opts.threadId) {
      sql += ' AND threadId = ?';
      params.push(opts.threadId);
    }
    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as FtsRow[];
    return rows.map((r, i) => ({
      threadId: r.threadId,
      score: -(r.rank ?? i),
      snippet: r.snippet ?? '',
    }));
  } catch (err) {
    log.warn('[threadSearch] FTS5 query failed:', err);
    return [];
  }
}

// ── LIKE fallback path ───────────────────────────────────────────────

interface LikeRow {
  id: string;
  threadId: string;
  content: string;
}

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, SNIPPET_RADIUS * 2);
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(content.length, idx + query.length + SNIPPET_RADIUS);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return `${prefix}${content.slice(start, end)}${suffix}`;
}

function searchLike(db: Database, query: string, opts: SearchOptions): SearchResult[] {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  try {
    let sql = `SELECT m.id, m.threadId, m.content FROM messages m WHERE m.content LIKE ?`;
    const params: unknown[] = [`%${query}%`];

    if (opts.threadId) {
      sql += ' AND m.threadId = ?';
      params.push(opts.threadId);
    }
    sql += ' ORDER BY m.createdAt DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as LikeRow[];
    return rows.map((r, i) => ({
      threadId: r.threadId,
      score: limit - i,
      snippet: buildSnippet(r.content, query),
      messageId: r.id,
    }));
  } catch (err) {
    log.warn('[threadSearch] LIKE fallback query failed:', err);
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────

function hasFtsTable(db: Database): boolean {
  try {
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='thread_fts'")
      .get();
    return row !== undefined;
  } catch {
    return false;
  }
}

/**
 * Search threads by full-text query.
 *
 * Uses FTS5 when the virtual table is present; falls back to LIKE otherwise.
 */
export function searchThreads(
  db: Database,
  query: string,
  opts: SearchOptions = {},
): SearchResult[] {
  if (!query.trim()) return [];
  if (hasFtsTable(db)) {
    return searchFts(db, query, opts);
  }
  // Fallback: LIKE search over message content (FTS5 unavailable)
  return searchLike(db, query, opts);
}
