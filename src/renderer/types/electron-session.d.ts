/**
 * electron-session.d.ts — IPC type contract for session store CRUD (Wave 20).
 *
 * SessionCrudAPI is a separate namespace from the existing SessionsAPI
 * (electron-observability.d.ts) which handles file-persistence-only ops.
 * These channels talk directly to the in-memory/electron-store sessionStore.
 */

import type { IpcResult } from './electron-foundation';

// ─── Session type (structural mirror of src/main/session/session.ts) ──────────

export interface SessionCostRollup {
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SessionTelemetry {
  correlationIds: string[];
  telemetrySessionId: string;
}

/**
 * Structural mirror of Session from src/main/session/session.ts.
 * Kept in sync manually — both sides must match field for field.
 */
export interface SessionRecord {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  archivedAt?: string;
  projectRoot: string;
  worktreePath?: string;
  worktree: boolean;
  conversationThreadId?: string;
  tags: string[];
  layoutPresetId?: string;
  activeTerminalIds: string[];
  costRollup: SessionCostRollup;
  telemetry: SessionTelemetry;
}

// ─── Result shapes ────────────────────────────────────────────────────────────

export interface SessionListResult extends IpcResult {
  sessions?: SessionRecord[];
}

export interface SessionActiveResult extends IpcResult {
  sessionId?: string | null;
}

export interface SessionCreateResult extends IpcResult {
  session?: SessionRecord;
}

// ─── API interface ────────────────────────────────────────────────────────────

export interface SessionCrudAPI {
  /** List all sessions from sessionStore. */
  list: () => Promise<SessionListResult>;
  /** Return the active session id for this window (null if none). */
  active: () => Promise<SessionActiveResult>;
  /** Create a new session for projectRoot, upsert it, and return it. */
  create: (projectRoot: string) => Promise<SessionCreateResult>;
  /** Set the active session for this window. */
  activate: (sessionId: string) => Promise<IpcResult>;
  /** Archive a session by id (marks archivedAt). */
  archive: (sessionId: string) => Promise<IpcResult>;
  /** Delete a session by id. */
  delete: (sessionId: string) => Promise<IpcResult>;
  /** Open a dedicated chat BrowserWindow for the given session. */
  openChatWindow: (sessionId: string) => Promise<IpcResult & { windowId?: number }>;
  /** Subscribe to store mutation events. Returns cleanup fn. */
  onChanged: (callback: (sessions: SessionRecord[]) => void) => () => void;
}
