/**
 * electron-folder.d.ts — IPC type contract for session folder CRUD (Wave 21 Phase D).
 *
 * Structural mirror of SessionFolder from src/main/session/folderStore.ts.
 */

import type { IpcResult } from './electron-foundation';

// ─── SessionFolder ────────────────────────────────────────────────────────────

export interface SessionFolder {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
  order: number;
}

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface FolderListResult extends IpcResult {
  folders?: SessionFolder[];
}

export interface FolderCreateResult extends IpcResult {
  folder?: SessionFolder;
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface FolderCrudAPI {
  /** List all folders. */
  list: () => Promise<FolderListResult>;
  /** Create a new folder with the given name. Returns the new folder. */
  create: (name: string) => Promise<FolderCreateResult>;
  /** Rename a folder by id. */
  rename: (id: string, name: string) => Promise<IpcResult>;
  /** Delete a folder by id (sessions become uncategorized). */
  delete: (id: string) => Promise<IpcResult>;
  /** Add a session to a folder. */
  addSession: (folderId: string, sessionId: string) => Promise<IpcResult>;
  /** Remove a session from a folder. */
  removeSession: (folderId: string, sessionId: string) => Promise<IpcResult>;
  /**
   * Move a session between folders.
   * Pass null for fromId to move from "uncategorized".
   * Pass null for toId to move to "uncategorized".
   */
  moveSession: (
    fromId: string | null,
    toId: string | null,
    sessionId: string,
  ) => Promise<IpcResult>;
  /** Subscribe to folder store mutations. Returns cleanup fn. */
  onChanged: (callback: (folders: SessionFolder[]) => void) => () => void;
}
