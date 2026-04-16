/**
 * electron-session.d.ts — IPC type contract for session store CRUD (Wave 20).
 *
 * SessionCrudAPI is a separate namespace from the existing SessionsAPI
 * (electron-observability.d.ts) which handles file-persistence-only ops.
 * These channels talk directly to the in-memory/electron-store sessionStore.
 */

import type { IpcResult } from './electron-foundation';
import type { PinnedContextItem } from './electron-pinned-context';

// ─── AgentMonitor settings ────────────────────────────────────────────────────

export type AgentMonitorViewMode = 'verbose' | 'normal' | 'summary';

export interface AgentMonitorSettings {
  viewMode: AgentMonitorViewMode;
  inlineEventTypes: string[];
}

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
  /** Wave 21 Phase C — epoch ms when soft-deleted; absent when not deleted. */
  deletedAt?: number;
  /** Wave 21 Phase C — when true, session sorts to top in all sidebar views. */
  pinned?: boolean;
  projectRoot: string;
  worktreePath?: string;
  worktree: boolean;
  conversationThreadId?: string;
  tags: string[];
  layoutPresetId?: string;
  activeTerminalIds: string[];
  /** Wave 25 — pinned context items for this session */
  pinnedContext?: PinnedContextItem[];
  costRollup: SessionCostRollup;
  telemetry: SessionTelemetry;
  agentMonitorSettings?: AgentMonitorSettings;
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
  /** Archive a session by id (marks archivedAt and writes trash file). */
  archive: (sessionId: string) => Promise<IpcResult>;
  /** Restore an archived session from the trash directory. */
  restore: (sessionId: string) => Promise<IpcResult>;
  /** Delete a session by id. */
  delete: (sessionId: string) => Promise<IpcResult>;
  /** Open a dedicated chat BrowserWindow for the given session. */
  openChatWindow: (sessionId: string) => Promise<IpcResult & { windowId?: number }>;
  /** Update the agentMonitorSettings for a session. */
  updateAgentMonitorSettings: (
    sessionId: string,
    settings: AgentMonitorSettings,
  ) => Promise<IpcResult>;
  /** Wave 21 Phase C — toggle pinned state for a session. */
  pin: (sessionId: string, pinned: boolean) => Promise<IpcResult>;
  /** Wave 21 Phase C — soft-delete a session (sets deletedAt, 30-day grace). */
  softDelete: (sessionId: string) => Promise<IpcResult>;
  /** Wave 21 Phase C — restore a soft-deleted session (clears deletedAt). */
  restoreDeleted: (sessionId: string) => Promise<IpcResult>;
  /** Subscribe to store mutation events. Returns cleanup fn. */
  onChanged: (callback: (sessions: SessionRecord[]) => void) => () => void;
}
