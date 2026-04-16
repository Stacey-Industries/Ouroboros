/**
 * electron-workspace-read-list.d.ts — IPC type contract for workspace read-lists (Wave 25 Phase E).
 *
 * Stored as { [projectRoot: string]: string[] } under config key `workspaceReadLists`.
 * Files in a project's list are auto-pinned as stub PinnedContextItems when a
 * session is created or activated for that project root.
 */

import type { IpcResult } from './electron-foundation';

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface WorkspaceReadListResult extends IpcResult {
  files?: string[];
}

export interface WorkspaceReadListChangedPayload {
  projectRoot: string;
  files: string[];
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface WorkspaceReadListAPI {
  /** Get the read-list for a project root. */
  get(projectRoot: string): Promise<WorkspaceReadListResult>;

  /** Add a file to the read-list for a project root. Returns the updated list. */
  add(projectRoot: string, filePath: string): Promise<WorkspaceReadListResult>;

  /** Remove a file from the read-list for a project root. Returns the updated list. */
  remove(projectRoot: string, filePath: string): Promise<WorkspaceReadListResult>;

  /**
   * Subscribe to read-list mutation events. Fires on add/remove.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onChanged(callback: (payload: WorkspaceReadListChangedPayload) => void): () => void;
}
