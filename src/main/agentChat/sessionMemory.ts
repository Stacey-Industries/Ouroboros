import type { SessionMemoryEntry } from '@shared/types/agentChat';
import { createHash, randomUUID } from 'crypto';
import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

import log from '../logger';

export type { SessionMemoryEntry };

const MAX_ENTRIES = 200;
const MIN_CONFIDENCE = 0.2;
const DECAY_AMOUNT = 0.05;
const DECAY_FLOOR = 0.1;
const RELEVANCE_FLOOR = 0.3;
const MAX_MEMORY_TOKENS = 2000;
const CHARS_PER_TOKEN = 3.5;

function memoryPath(workspaceRoot: string): string {
  const hash = createHash('sha1').update(workspaceRoot).digest('hex');
  return path.join(app.getPath('userData'), 'agent-chat', 'memory', `${hash}.json`);
}

async function readFile(workspaceRoot: string): Promise<SessionMemoryEntry[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from SHA1 hash of workspaceRoot
    const data = await fs.readFile(memoryPath(workspaceRoot), 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeFile(workspaceRoot: string, entries: SessionMemoryEntry[]): Promise<void> {
  try {
    const filePath = memoryPath(workspaceRoot);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from SHA1 hash of workspaceRoot
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from SHA1 hash of workspaceRoot
    await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8');
  } catch (error) {
    log.warn('write failed:', error);
  }
}

function scoreEntry(entry: SessionMemoryEntry, contextFiles: string[]): number {
  const normalized = new Set(contextFiles.map((f) => f.toLowerCase().replace(/\\/g, '/')));
  let fileOverlap = 0;
  for (const rf of entry.relevantFiles) {
    const norm = rf.toLowerCase().replace(/\\/g, '/');
    for (const cf of normalized) {
      if (cf.includes(norm) || norm.includes(cf)) {
        fileOverlap++;
        break;
      }
    }
  }
  const age = Date.now() - new Date(entry.timestamp).getTime();
  const recency = Math.max(0, 5 - age / (1000 * 60 * 60 * 24));
  return fileOverlap * 10 + recency + entry.confidence * 3;
}

export const sessionMemoryStore = {
  async loadMemories(workspaceRoot: string): Promise<SessionMemoryEntry[]> {
    return (await readFile(workspaceRoot)).filter((e) => !e.supersededBy);
  },

  async saveMemories(workspaceRoot: string, entries: SessionMemoryEntry[]): Promise<void> {
    const existing = await readFile(workspaceRoot);
    await writeFile(workspaceRoot, [...existing, ...entries]);
  },

  async decayUnused(workspaceRoot: string, usedIds: string[]): Promise<void> {
    const entries = await readFile(workspaceRoot);
    const usedSet = new Set(usedIds);
    let changed = false;
    for (const entry of entries) {
      if (!usedSet.has(entry.id) && entry.confidence > DECAY_FLOOR) {
        entry.confidence = Math.max(DECAY_FLOOR, entry.confidence - DECAY_AMOUNT);
        changed = true;
      }
    }
    if (changed) await writeFile(workspaceRoot, entries);
  },

  async prune(workspaceRoot: string): Promise<void> {
    let entries = await readFile(workspaceRoot);
    entries = entries.filter((e) => e.confidence >= MIN_CONFIDENCE && !e.supersededBy);
    entries.sort((a, b) => b.confidence - a.confidence);
    if (entries.length > MAX_ENTRIES) entries = entries.slice(0, MAX_ENTRIES);
    await writeFile(workspaceRoot, entries);
  },

  async getRelevantMemories(
    workspaceRoot: string,
    contextFiles: string[],
    maxTokens = MAX_MEMORY_TOKENS,
  ): Promise<SessionMemoryEntry[]> {
    const entries = await readFile(workspaceRoot);
    const cap = Math.min(maxTokens, MAX_MEMORY_TOKENS);
    const candidates = entries
      .filter((e) => e.confidence >= RELEVANCE_FLOOR && !e.supersededBy)
      .map((e) => ({ entry: e, score: scoreEntry(e, contextFiles) }))
      .sort((a, b) => b.score - a.score);

    const result: SessionMemoryEntry[] = [];
    let totalTokens = 0;
    for (const { entry } of candidates) {
      const tokens = Math.ceil(entry.content.length / CHARS_PER_TOKEN);
      if (totalTokens + tokens > cap) break;
      result.push(entry);
      totalTokens += tokens;
    }
    return result;
  },

  createEntry(
    sessionId: string,
    partial: Omit<SessionMemoryEntry, 'id' | 'timestamp' | 'sessionId' | 'confidence'>,
  ): SessionMemoryEntry {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      sessionId,
      confidence: 1.0,
      ...partial,
    };
  },

  async updateEntry(
    workspaceRoot: string,
    id: string,
    updates: Partial<Pick<SessionMemoryEntry, 'content' | 'type' | 'relevantFiles'>>,
  ): Promise<SessionMemoryEntry | null> {
    const entries = await readFile(workspaceRoot);
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    if (typeof updates.content === 'string') entry.content = updates.content;
    if (typeof updates.type === 'string') entry.type = updates.type;
    if (Array.isArray(updates.relevantFiles)) entry.relevantFiles = updates.relevantFiles;
    await writeFile(workspaceRoot, entries);
    return entry;
  },

  async deleteEntry(workspaceRoot: string, id: string): Promise<boolean> {
    const entries = await readFile(workspaceRoot);
    const filtered = entries.filter((e) => e.id !== id);
    if (filtered.length === entries.length) return false;
    await writeFile(workspaceRoot, filtered);
    return true;
  },
};
