/**
 * threadImport.ts — Pure import functions for chat threads.
 *
 * All functions are pure (no Electron imports) — they take serialized string
 * input, validate it, and return typed objects with freshly generated IDs.
 * New IDs are generated to avoid collisions with existing data.
 *
 * Formats:
 *   - JSON: reverse of exportToJson (threadExport.ts)
 *   - Transcript: parses the markdown-style `## [role] at <time>` format
 */

import { randomUUID } from 'crypto';

import type { AgentChatMessageRecord, AgentChatThreadRecord } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportedThread {
  thread: AgentChatThreadRecord;
  messages: AgentChatMessageRecord[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): number {
  return Date.now();
}

function newId(): string {
  return randomUUID();
}

function makeBlankThread(id: string, title: string, ts: number): AgentChatThreadRecord {
  return {
    version: 1,
    id,
    workspaceRoot: '',
    createdAt: ts,
    updatedAt: ts,
    title,
    status: 'idle',
    messages: [],
    tags: [],
  };
}

// ─── JSON import ──────────────────────────────────────────────────────────────

function isValidRole(role: unknown): role is 'user' | 'assistant' | 'system' | 'status' {
  return role === 'user' || role === 'assistant' || role === 'system' || role === 'status';
}

function parseJsonMessages(
  raw: unknown[],
  threadId: string,
  ts: number,
): AgentChatMessageRecord[] {
  return raw
    .filter(
      (m): m is Record<string, unknown> =>
        m !== null && typeof m === 'object' && !Array.isArray(m),
    )
    .filter((m) => isValidRole(m.role) && typeof m.content === 'string')
    .map((m) => {
      const createdAt =
        typeof m.createdAt === 'string' ? Date.parse(m.createdAt) || ts : ts;
      const record: AgentChatMessageRecord = {
        id: newId(),
        threadId,
        role: m.role as AgentChatMessageRecord['role'],
        content: m.content as string,
        createdAt,
      };
      if (Array.isArray(m.blocks) && m.blocks.length > 0) {
        record.blocks = m.blocks as AgentChatMessageRecord['blocks'];
      }
      return record;
    });
}

interface ParsedJsonTop {
  threadObj: Record<string, unknown>;
  messagesRaw: unknown[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function parseJsonTopLevel(json: string): ParsedJsonTop | null {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!isPlainObject(parsed)) return null;
  const obj = parsed;
  if (!isPlainObject(obj.thread)) return null;
  const threadObj = obj.thread;
  if (typeof threadObj.id !== 'string' || !threadObj.id) return null;
  if (!Array.isArray(obj.messages)) return null;
  return { threadObj, messagesRaw: obj.messages as unknown[] };
}

function buildImportedThread(
  threadObj: Record<string, unknown>,
  ts: number,
): AgentChatThreadRecord {
  const threadId = newId();
  const title =
    typeof threadObj.title === 'string' && threadObj.title ? threadObj.title : threadObj.id;
  const createdAt =
    typeof threadObj.createdAt === 'string' ? Date.parse(threadObj.createdAt) || ts : ts;
  const tags = Array.isArray(threadObj.tags)
    ? (threadObj.tags as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];
  const thread = makeBlankThread(threadId, title as string, createdAt);
  thread.tags = tags;
  thread.workspaceRoot =
    typeof threadObj.workspaceRoot === 'string' ? threadObj.workspaceRoot : '';
  return thread;
}

export function importFromJson(json: string): ImportedThread | null {
  const top = parseJsonTopLevel(json);
  if (!top) return null;
  const ts = now();
  const thread = buildImportedThread(top.threadObj, ts);
  const messages = parseJsonMessages(top.messagesRaw, thread.id, ts);
  return { thread, messages };
}

// ─── Transcript import ────────────────────────────────────────────────────────

const ROLE_HEADER_RE = /^##\s+\[(user|assistant)\]\s+at\s+(.*)$/;

interface TranscriptSegment {
  role: 'user' | 'assistant';
  lines: string[];
}

function parseTranscriptSegments(text: string): TranscriptSegment[] {
  const lines = text.split('\n');
  const segments: TranscriptSegment[] = [];
  let current: TranscriptSegment | null = null;

  for (const line of lines) {
    const match = ROLE_HEADER_RE.exec(line);
    if (match) {
      if (current) segments.push(current);
      current = { role: match[1] as 'user' | 'assistant', lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) segments.push(current);
  return segments;
}

export function importFromTranscript(text: string): ImportedThread | null {
  const segments = parseTranscriptSegments(text);
  if (segments.length === 0) return null;

  const ts = now();
  const threadId = newId();
  const thread = makeBlankThread(threadId, 'Imported Transcript', ts);

  const messages: AgentChatMessageRecord[] = segments.map((seg, i) => ({
    id: newId(),
    threadId,
    role: seg.role,
    content: seg.lines.join('\n').trim(),
    createdAt: ts + i,
  }));

  return { thread, messages };
}
