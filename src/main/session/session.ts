import { randomUUID } from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SessionCostRollup {
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SessionTelemetry {
  correlationIds: string[];
  telemetrySessionId: string;
}

export interface Session {
  // Core identity
  id: string;
  createdAt: string;
  lastUsedAt: string;
  archivedAt?: string;

  // Project location
  projectRoot: string;
  worktreePath?: string;
  worktree: boolean;

  // Conversation linkage
  conversationThreadId?: string;

  // Window restore state
  tags: string[];
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };

  // Scaffolds for downstream waves
  /** Wave 17 populates */
  layoutPresetId?: string;
  /** Wave 26 populates */
  profileId?: string;
  activeTerminalIds: string[];
  /** Wave 25 populates */
  pinnedContext?: unknown[];
  costRollup: SessionCostRollup;
  telemetry: SessionTelemetry;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeSession(projectRoot: string): Session {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    lastUsedAt: now,
    projectRoot,
    worktree: false,
    tags: [],
    activeTerminalIds: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
  };
}
