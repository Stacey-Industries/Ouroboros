import { randomUUID } from 'node:crypto';

import type { PinnedContextItem } from '@shared/types/pinnedContext';

import { getProfileStore } from '../profiles/profileStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type AgentMonitorViewMode = 'verbose' | 'normal' | 'summary';

export interface AgentMonitorSettings {
  viewMode: AgentMonitorViewMode;
  inlineEventTypes: string[];
}

export const DEFAULT_AGENT_MONITOR_SETTINGS: AgentMonitorSettings = {
  viewMode: 'normal',
  inlineEventTypes: [],
};

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
  /** Wave 21 Phase C — epoch ms when this session was soft-deleted (30-day grace). */
  deletedAt?: number;
  /** Wave 21 Phase C — pinned sessions sort to top of sidebar in all views. */
  pinned?: boolean;

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
  /** Wave 26 Phase D — per-session tool whitelist override (null = use profile/global default). */
  toolOverrides?: string[];
  /** Wave 26 Phase D — per-session MCP server override (null = use profile/global default). */
  mcpServerOverrides?: string[];
  activeTerminalIds: string[];
  /** Wave 25 — pinned context items for this session */
  pinnedContext: PinnedContextItem[];
  costRollup: SessionCostRollup;
  telemetry: SessionTelemetry;
  /** Wave 20 Phase C — AgentMonitor view mode + inline event preferences */
  agentMonitorSettings?: AgentMonitorSettings;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function makeSession(projectRoot: string): Session {
  const id = randomUUID();
  const now = new Date().toISOString();
  const profileStore = getProfileStore();
  const defaultProfileId = profileStore?.getDefaultProfile(projectRoot) ?? undefined;
  return {
    id,
    createdAt: now,
    lastUsedAt: now,
    projectRoot,
    worktree: false,
    pinned: false,
    tags: [],
    activeTerminalIds: [],
    pinnedContext: [],
    costRollup: { totalUsd: 0, inputTokens: 0, outputTokens: 0 },
    telemetry: { correlationIds: [], telemetrySessionId: id },
    agentMonitorSettings: { ...DEFAULT_AGENT_MONITOR_SETTINGS },
    profileId: defaultProfileId,
  };
}
