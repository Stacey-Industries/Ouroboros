/**
 * electron-memory.d.ts — Type contract for project memory IPC (Phase E, Wave 63).
 *
 * Channels:
 *   memory:list   — list MemoryEntry records for the given project root
 *   memory:read   — read the content of a single entry by id
 *
 * The watcher broadcasts 'memory:changed' when the memory directory changes;
 * onChanged subscribes to that push event and returns a teardown.
 */

export interface MemoryEntry {
  /** Filename without extension — stable id for memory:read. */
  id: string;
  /** Link text from the MEMORY.md bullet. */
  title: string;
  /** Trailing description after the em-dash on the bullet line. */
  description: string;
  /** Most recent ## section header above this bullet. */
  section: string;
  /** Absolute path to the linked .md file. */
  filePath: string;
  /** Whether the linked file actually exists on disk. */
  exists: boolean;
}

export interface MemoryListResult {
  success: boolean;
  entries?: MemoryEntry[];
  error?: string;
}

export interface MemoryReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

export interface MemoryWriteFrontmatter {
  description: string;
  type: MemoryType;
}

export interface MemoryWriteArgs {
  projectRoot?: string;
  id: string;
  content: string;
  frontmatter: MemoryWriteFrontmatter;
}

export interface MemoryWriteResult {
  success: boolean;
  id?: string;
  error?: string;
}

export interface MemoryDeleteArgs {
  projectRoot?: string;
  id: string;
}

export interface MemoryDeleteResult {
  success: boolean;
  error?: string;
}

export interface MemoryAPI {
  list: (projectRoot?: string) => Promise<MemoryListResult>;
  read: (args: { projectRoot?: string; id: string }) => Promise<MemoryReadResult>;
  write: (args: MemoryWriteArgs) => Promise<MemoryWriteResult>;
  delete: (args: MemoryDeleteArgs) => Promise<MemoryDeleteResult>;
  onChanged: (callback: () => void) => () => void;
}
