/**
 * webPreloadApisExtended.ts — electronAPI namespace builders (third part).
 * Covers: ecosystem, research, marketplace additions, agentChat additions,
 * agentConflict, system2, router, workspace, backgroundJobs.
 *
 * Mirrors Electron preload; all calls route through the WS transport.
 * Desktop-only decisions documented in docs/mobile-scope.md.
 */

import { desktopOnlyStub } from './webPreloadApis';
import type { WebSocketTransport } from './webPreloadTransport';

// ─── Ecosystem API ────────────────────────────────────────────────────────────

export function buildEcosystemApi(t: WebSocketTransport) {
  return {
    onPromptDiff: (cb: (payload: unknown) => void) =>
      t.on('ecosystem:promptDiff', cb as (v: unknown) => void),
    exportUsage: (opts: unknown) => t.invoke('ecosystem:exportUsage', opts),
    lastExportInfo: () => t.invoke('ecosystem:lastExportInfo'),
  };
}

// ─── Marketplace additions API ────────────────────────────────────────────────
// install is desktop-only (reclassified per CRIT-2 / Wave 41 Phase A).
// listBundles and revokedIds are already in read catalog; mirrored here.

export function buildMarketplaceApi(t: WebSocketTransport) {
  return {
    listBundles: () => t.invoke('marketplace:listBundles'),
    install: desktopOnlyStub('marketplace:install'),
    revokedIds: () => t.invoke('marketplace:revokedIds'),
  };
}

// ─── Research API ─────────────────────────────────────────────────────────────
// research:invoke is stubbed — it's an LLM call with cost.
// Dashboard metrics and session-mode controls are mirrored.

export function buildResearchApi(t: WebSocketTransport) {
  return {
    // Stubbed: LLM call with cost — not available in web mode.
    invoke: async (_input: unknown) => ({
      success: false as const,
      error: 'research:invoke: Not available in web mode.',
    }),
    getSessionMode: (sessionId: string) =>
      t.invoke('research:getSessionMode', sessionId),
    setSessionMode: (sessionId: string, mode: string) =>
      t.invoke('research:setSessionMode', sessionId, mode),
    getGlobalDefault: () => t.invoke('research:getGlobalDefault'),
    setGlobalDefault: (globalEnabled: boolean, defaultMode: string) =>
      t.invoke('research:setGlobalDefault', globalEnabled, defaultMode),
    getDashboardMetrics: (range: '7d' | '30d' | 'all') =>
      t.invoke('research:getDashboardMetrics', range),
  };
}

// ─── AgentChat additions ──────────────────────────────────────────────────────
// Methods missing from the existing buildAgentChatApi in webPreloadApisSupplemental.ts.

export function buildAgentChatExtApi(t: WebSocketTransport) {
  return {
    getThreadTags: (threadId: string) =>
      t.invoke('agentChat:getThreadTags', threadId),
    setThreadTags: (threadId: string, tags: string[]) =>
      t.invoke('agentChat:setThreadTags', threadId, tags),
    searchThreads: (payload: unknown) =>
      t.invoke('agentChat:searchThreads', payload),
    getThreadCostRollup: (request: unknown) =>
      t.invoke('agentChat:getThreadCostRollup', request),
    pinThread: (threadId: string, pinned: boolean) =>
      t.invoke('agentChat:pinThread', threadId, pinned),
    softDeleteThread: (threadId: string) =>
      t.invoke('agentChat:softDeleteThread', threadId),
    restoreDeletedThread: (threadId: string) =>
      t.invoke('agentChat:restoreDeletedThread', threadId),
    exportThread: (threadId: string, format: string) =>
      t.invoke('agentChat:exportThread', threadId, format),
    importThread: (content: string, format: string) =>
      t.invoke('agentChat:importThread', content, format),
  };
}

// ─── Agent Conflict API ───────────────────────────────────────────────────────

export function buildAgentConflictApi(t: WebSocketTransport) {
  return {
    getReports: (projectRoot?: string) =>
      t.invoke('agentConflict:getReports', projectRoot),
    dismiss: (sessionA: string, sessionB: string) =>
      t.invoke('agentConflict:dismiss', sessionA, sessionB),
    onChange: (cb: (snapshot: unknown) => void) =>
      t.on('agentConflict:changed', cb as (v: unknown) => void),
  };
}

// ─── System2 API ──────────────────────────────────────────────────────────────
// Push-event only — mobile can display background indexing progress.

export function buildSystem2Api(t: WebSocketTransport) {
  return {
    onIndexProgress: (cb: (event: unknown) => void) =>
      t.on('system2:indexProgress', cb as (v: unknown) => void),
  };
}

// ─── Router API ───────────────────────────────────────────────────────────────

export function buildRouterApi(t: WebSocketTransport) {
  return {
    getStats: () => t.invoke('router:getStats'),
  };
}

// ─── Workspace API ────────────────────────────────────────────────────────────
// Trust read queries are mirrored. Trust mutations (trust/untrust) are stubbed
// — they should require physical desktop presence per docs/mobile-scope.md.

export function buildWorkspaceApi(t: WebSocketTransport) {
  return {
    isTrusted: (path: string) => t.invoke('workspace:isTrusted', path),
    trustLevel: (roots: string[]) => t.invoke('workspace:trustLevel', roots),
    // trust/untrust modify the global trust store — stub on mobile.
    trust: async (_path: string) => ({
      success: false as const,
      error: 'workspace:trust: This feature is only available in the desktop app.',
    }),
    untrust: async (_path: string) => ({
      success: false as const,
      error: 'workspace:untrust: This feature is only available in the desktop app.',
    }),
  };
}

// ─── Background Jobs API ──────────────────────────────────────────────────────
// enqueue is desktop-only (long-running jobs poorly suited for mobile).
// list, cancel, clearCompleted, and onUpdate are mirrored.

export function buildBackgroundJobsApi(t: WebSocketTransport) {
  return {
    // enqueue is desktop-only per docs/mobile-scope.md.
    enqueue: desktopOnlyStub('backgroundJobs:enqueue'),
    cancel: (jobId: string) => t.invoke('backgroundJobs:cancel', jobId),
    list: (projectRoot?: string) => t.invoke('backgroundJobs:list', projectRoot),
    clearCompleted: () => t.invoke('backgroundJobs:clearCompleted'),
    onUpdate: (cb: (update: unknown) => void) =>
      t.on('backgroundJobs:update', cb as (v: unknown) => void),
  };
}

// ─── AI API (desktop-only stubs) ─────────────────────────────────────────────
// All ai:* channels require the desktop Monaco editor — desktop-only.

export function buildAiApi() {
  return {
    generateCommitMessage: desktopOnlyStub('ai:generate-commit-message'),
    inlineCompletion: desktopOnlyStub('ai:inline-completion'),
    inlineEdit: desktopOnlyStub('ai:inline-edit'),
  };
}

// ─── AI Stream API (desktop-only stubs) ──────────────────────────────────────

export function buildAiStreamApi() {
  return {
    startInlineEdit: desktopOnlyStub('ai:streamInlineEdit'),
    cancelInlineEdit: desktopOnlyStub('ai:cancelInlineEditStream'),
    onStream: (_requestId: string, _cb: (event: unknown) => void) => () => {},
  };
}

// ─── Embedding API (desktop-only stubs) ──────────────────────────────────────
// Requires local codebase index; not available in web mode.

export function buildEmbeddingApi() {
  return {
    search: desktopOnlyStub('embedding:search'),
    getStatus: desktopOnlyStub('embedding:status'),
    getIndexStatus: desktopOnlyStub('embedding:status'),
    reindex: desktopOnlyStub('embedding:reindex'),
  };
}

// ─── Telemetry API (desktop-only stubs for queryEvents) ──────────────────────
// telemetry:queryEvents is a developer debug feature — desktop-only.
// telemetry:record and telemetry:queryOutcomes/queryTraces remain available.

export function buildTelemetryApi(t: WebSocketTransport) {
  return {
    // queryEvents is desktop-only (direct DB access, developer debug feature).
    queryEvents: desktopOnlyStub('telemetry:queryEvents'),
    queryOutcomes: (opts: unknown) => t.invoke('telemetry:queryOutcomes', opts),
    queryTraces: (opts: unknown) => t.invoke('telemetry:queryTraces', opts),
    record: (event: unknown) => t.invoke('telemetry:record', event),
  };
}

// ─── Observability API (partial desktop-only) ─────────────────────────────────
// exportTrace writes to an arbitrary path — desktop-only.

export function buildObservabilityApi() {
  return {
    exportTrace: desktopOnlyStub('observability:exportTrace'),
  };
}

// ─── Graph API (desktop-only stubs) ──────────────────────────────────────────
// Full codebase graph requires local index — not available in web mode.

export function buildGraphApi() {
  return {
    searchGraph: desktopOnlyStub('graph:searchGraph'),
    getArchitecture: desktopOnlyStub('graph:getArchitecture'),
    getStatus: desktopOnlyStub('graph:getStatus'),
    getNeighbourhood: desktopOnlyStub('graph:getNeighbourhood'),
    getBlastRadius: desktopOnlyStub('graph:getBlastRadius'),
  };
}

// ─── Spec API (desktop-only stub) ────────────────────────────────────────────

export function buildSpecApi() {
  return {
    scaffold: desktopOnlyStub('spec:scaffold'),
  };
}
