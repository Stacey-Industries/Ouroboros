import * as fs from 'fs/promises';
import * as path from 'path';

import { hashThreadId, normalizeThreadRecord } from './threadStoreSupport';
import type { AgentChatThreadRecord } from './types';

const TITLE_MAX_LENGTH = 60;

/**
 * Returns true if a line is decorative formatting noise that shouldn't
 * be used as a thread title — e.g. insight box headers/footers, fenced
 * code markers, or lines made mostly of box-drawing characters.
 */
function isDecorativeLine(line: string): boolean {
  // Backtick-wrapped decorative lines: `★ Insight ─────────`
  if (/^`[^`]*`$/.test(line) && /[─═━\-★]{3,}/.test(line)) return true;
  // Lines that are entirely box-drawing / decorative chars
  if (/^[─═━\-*★│┃|+\s]+$/.test(line) && line.length > 2) return true;
  // Fenced code block markers
  if (/^```/.test(line)) return true;
  return false;
}

function summarizeForTitle(assistantContent: string): string {
  const trimmed = assistantContent.trim();
  if (!trimmed) return '';

  // Find the first meaningful line, skipping decorative formatting
  const lines = trimmed.split(/\r?\n/);
  let meaningful = '';
  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) continue;
    if (isDecorativeLine(stripped)) continue;
    meaningful = stripped;
    break;
  }
  if (!meaningful) meaningful = trimmed;

  // Extract the first sentence (up to period, exclamation, or question mark followed by space or end)
  const sentenceMatch = meaningful.match(/^(.+?[.!?])(?:\s|$)/);
  const firstSentence = sentenceMatch ? sentenceMatch[1].trim() : '';

  if (firstSentence && firstSentence.length <= TITLE_MAX_LENGTH) {
    return firstSentence;
  }

  // Fall back to first N chars
  const slice = meaningful.slice(0, TITLE_MAX_LENGTH).trimEnd();
  // Try to break at a word boundary
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > TITLE_MAX_LENGTH * 0.5) {
    return `${slice.slice(0, lastSpace)}\u2026`;
  }
  return `${slice}\u2026`;
}

export interface AgentChatThreadStoreRuntimeOptions {
  maxThreads: number;
  now: () => number;
  threadsDir: string;
}

export class AgentChatThreadStoreRuntime {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: AgentChatThreadStoreRuntimeOptions) {}

  getStorageDirectory(): string {
    return this.options.threadsDir;
  }

  async readThread(threadId: string): Promise<AgentChatThreadRecord | null> {
    return this.readThreadFile(this.getThreadFilePath(threadId));
  }

  async loadAllThreads(): Promise<AgentChatThreadRecord[]> {
    await this.ensureThreadsDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- threadsDir is from internal config
    const entries = await fs.readdir(this.options.threadsDir);
    const threads = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => this.readThreadFile(path.join(this.options.threadsDir, entry))),
    );

    return threads
      .filter((thread): thread is AgentChatThreadRecord => thread !== null)
      .sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
        if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
        return left.id.localeCompare(right.id);
      });
  }

  async writeThread(thread: AgentChatThreadRecord): Promise<AgentChatThreadRecord> {
    const normalizedThread = normalizeThreadRecord(thread, this.options.now);
    await this.ensureThreadsDir();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from hashed thread ID
    await fs.writeFile(
      this.getThreadFilePath(normalizedThread.id),
      JSON.stringify(normalizedThread, null, 2),
      'utf-8',
    );
    await this.pruneOldThreads();
    return normalizedThread;
  }

  async requireThread(threadId: string): Promise<AgentChatThreadRecord> {
    const thread = await this.readThread(threadId);
    if (!thread) throw new Error(`Chat thread not found: ${threadId}`);
    return thread;
  }

  async deleteThread(threadId: string): Promise<boolean> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from hashed thread ID
      await fs.unlink(this.getThreadFilePath(threadId));
      return true;
    } catch {
      return false;
    }
  }

  async updateTitleFromResponse(
    threadId: string,
    assistantContent: string,
  ): Promise<AgentChatThreadRecord | null> {
    const thread = await this.readThread(threadId);
    if (!thread) return null;

    // Only update if the current title looks like it was derived from the first user message
    // (i.e. don't override a manually-set or already-updated title)
    const firstUserMessage = thread.messages.find((m) => m.role === 'user');
    if (!firstUserMessage) return null;

    const currentTitleMatchesUserMessage =
      thread.title === firstUserMessage.content.trim() ||
      thread.title ===
        firstUserMessage.content
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) ||
      (firstUserMessage.content.trim().length > 79 &&
        thread.title ===
          `${firstUserMessage.content
            .split(/\r?\n/)
            .map((l) => l.trim())
            .find((l) => l.length > 0)
            ?.slice(0, 79)
            .trimEnd()}\u2026`);

    if (!currentTitleMatchesUserMessage) return null;

    const newTitle = summarizeForTitle(assistantContent);
    if (!newTitle || newTitle === thread.title) return null;

    return this.writeThread({ ...thread, title: newTitle, updatedAt: this.options.now() });
  }

  runMutation<T>(action: () => Promise<T>): Promise<T> {
    const nextOperation = this.mutationQueue.then(action, action);
    this.mutationQueue = nextOperation.then(
      () => undefined,
      () => undefined,
    );
    return nextOperation;
  }

  private async ensureThreadsDir(): Promise<void> {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- threadsDir is from internal config
    await fs.mkdir(this.options.threadsDir, { recursive: true });
  }

  private getThreadFilePath(threadId: string): string {
    return path.join(this.options.threadsDir, `${hashThreadId(threadId)}.json`);
  }

  private async readThreadFile(filePath: string): Promise<AgentChatThreadRecord | null> {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath derived from hashed thread ID
      const raw = await fs.readFile(filePath, 'utf-8');
      return normalizeThreadRecord(JSON.parse(raw) as AgentChatThreadRecord, this.options.now);
    } catch {
      return null;
    }
  }

  private async pruneOldThreads(): Promise<void> {
    if (this.options.maxThreads <= 0) return;

    const threads = await this.loadAllThreads();
    if (threads.length <= this.options.maxThreads) return;

    await Promise.all(
      threads
        .slice(this.options.maxThreads)
        .map((thread) =>
          // eslint-disable-next-line security/detect-non-literal-fs-filename -- path derived from hashed thread ID
          fs.unlink(this.getThreadFilePath(thread.id)).catch((error) => {
            console.error('[agentChat] Failed to delete excess thread file:', thread.id, error);
          }),
        ),
    );
  }
}
