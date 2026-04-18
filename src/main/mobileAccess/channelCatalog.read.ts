/**
 * channelCatalog.read.ts — paired-read capability channels.
 *
 * Wave 33a Phase C — capability catalog (paired-read class).
 * These channels are permitted for any authenticated paired device.
 */

import type { CatalogEntry } from './channelCatalog.always';

/**
 * Channels that require 'paired-read' capability.
 * Safe for any authenticated mobile client — read-only operations
 * scoped to project roots, diagnostics, status queries, and metadata.
 */
export const READ_CATALOG: Record<string, CatalogEntry> = {
  // ── compareProviders (subscription) ────────────────────────────────────────
  'compareProviders:event':           { class: 'paired-read', timeoutClass: 'short' },

  // ── agentChat (read) ────────────────────────────────────────────────────────
  'agentChat:getBufferedChunks':    { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getGlobalCostRollup':  { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getLinkedDetails':     { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getLinkedTerminal':    { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getLinkedTerminals':   { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getMessageReactions':  { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getThreadCostRollup':  { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:getThreadTags':        { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:listBranches':         { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:listMemories':         { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:listThreads':          { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:loadThread':           { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:resumeLatestThread':   { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:searchThreads':        { class: 'paired-read', timeoutClass: 'normal' },
  'agentChat:status':               { class: 'paired-read', timeoutClass: 'short' },
  'pty:shellState':                 { class: 'paired-read', timeoutClass: 'short' },

  // ── agentConflict ───────────────────────────────────────────────────────────
  'agentConflict:getReports':       { class: 'paired-read', timeoutClass: 'normal' },

  // ── approval (read) ─────────────────────────────────────────────────────────
  'approval:listMemory':            { class: 'paired-read', timeoutClass: 'short' },

  // ── auth (read) ─────────────────────────────────────────────────────────────
  'auth:getStates':                 { class: 'paired-read', timeoutClass: 'short' },
  'auth:detectCliCreds':            { class: 'paired-read', timeoutClass: 'normal' },

  // ── backgroundJobs (read) ───────────────────────────────────────────────────
  'backgroundJobs:list':            { class: 'paired-read', timeoutClass: 'short' },

  // ── checkpoint (read) ───────────────────────────────────────────────────────
  'checkpoint:list':                { class: 'paired-read', timeoutClass: 'normal' },

  // ── claudeMd (read) ─────────────────────────────────────────────────────────
  'claudeMd:getStatus':             { class: 'paired-read', timeoutClass: 'short' },

  // ── claudeSettings (read) ───────────────────────────────────────────────────
  'claudeSettings:read':            { class: 'paired-read', timeoutClass: 'short' },
  'claudeSettings:readKey':         { class: 'paired-read', timeoutClass: 'short' },

  // ── codex ───────────────────────────────────────────────────────────────────
  'codex:listModels':               { class: 'paired-read', timeoutClass: 'short' },
  'codex:resolveThreadId':          { class: 'paired-read', timeoutClass: 'normal' },

  // ── context ─────────────────────────────────────────────────────────────────
  'context:getRankerDashboard':     { class: 'paired-read', timeoutClass: 'short' },
  'context:scan':                   { class: 'paired-read', timeoutClass: 'normal' },

  // ── cost ────────────────────────────────────────────────────────────────────
  'cost:getHistory':                { class: 'paired-read', timeoutClass: 'normal' },

  // ── embedding (read) ────────────────────────────────────────────────────────
  'embedding:search':               { class: 'paired-read', timeoutClass: 'normal' },
  'embedding:status':               { class: 'paired-read', timeoutClass: 'short' },

  // ── extensionStore (read) ───────────────────────────────────────────────────
  'extensionStore:getDetails':            { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:getIconThemeContributions':    { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:getInstalled':          { class: 'paired-read', timeoutClass: 'short' },
  'extensionStore:getMarketplaceDetails': { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:getProductIconThemeContributions': { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:getThemeContributions': { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:search':               { class: 'paired-read', timeoutClass: 'normal' },
  'extensionStore:searchMarketplace':    { class: 'paired-read', timeoutClass: 'normal' },

  // ── extensions (read) ───────────────────────────────────────────────────────
  'extensions:getLog':              { class: 'paired-read', timeoutClass: 'normal' },
  'extensions:list':                { class: 'paired-read', timeoutClass: 'short' },

  // ── files (read) ────────────────────────────────────────────────────────────
  'files:readBinaryFile':           { class: 'paired-read', timeoutClass: 'normal' },
  'files:readDir':                  { class: 'paired-read', timeoutClass: 'normal' },
  'files:readFile':                 { class: 'paired-read', timeoutClass: 'normal' },
  'files:search':                   { class: 'paired-read', timeoutClass: 'normal' },

  // ── folderCrud (read) ───────────────────────────────────────────────────────
  'folderCrud:list':                { class: 'paired-read', timeoutClass: 'short' },

  // ── git (read) ──────────────────────────────────────────────────────────────
  'git:blame':                      { class: 'paired-read', timeoutClass: 'normal' },
  'git:branch':                     { class: 'paired-read', timeoutClass: 'normal' },
  'git:branches':                   { class: 'paired-read', timeoutClass: 'normal' },
  'git:changedFilesBetween':        { class: 'paired-read', timeoutClass: 'normal' },
  'git:diff':                       { class: 'paired-read', timeoutClass: 'normal' },
  'git:diffBetween':                { class: 'paired-read', timeoutClass: 'normal' },
  'git:diffCached':                 { class: 'paired-read', timeoutClass: 'normal' },
  'git:diffRaw':                    { class: 'paired-read', timeoutClass: 'normal' },
  'git:diffReview':                 { class: 'paired-read', timeoutClass: 'normal' },
  'git:dirtyCount':                 { class: 'paired-read', timeoutClass: 'normal' },
  'git:fileAtCommit':               { class: 'paired-read', timeoutClass: 'normal' },
  'git:isRepo':                     { class: 'paired-read', timeoutClass: 'normal' },
  'git:log':                        { class: 'paired-read', timeoutClass: 'normal' },
  'git:show':                       { class: 'paired-read', timeoutClass: 'normal' },
  'git:snapshot':                   { class: 'paired-read', timeoutClass: 'normal' },
  'git:status':                     { class: 'paired-read', timeoutClass: 'normal' },
  'git:statusDetailed':             { class: 'paired-read', timeoutClass: 'normal' },
  'git:worktreeList':               { class: 'paired-read', timeoutClass: 'normal' },

  // ── graph (read) ────────────────────────────────────────────────────────────
  'graph:getArchitecture':          { class: 'paired-read', timeoutClass: 'normal' },
  'graph:getBlastRadius':           { class: 'paired-read', timeoutClass: 'normal' },
  'graph:getCodeSnippet':           { class: 'paired-read', timeoutClass: 'short' },
  'graph:getGraphSchema':           { class: 'paired-read', timeoutClass: 'short' },
  'graph:getNeighbourhood':         { class: 'paired-read', timeoutClass: 'normal' },
  'graph:getStatus':                { class: 'paired-read', timeoutClass: 'short' },
  'graph:queryGraph':               { class: 'paired-read', timeoutClass: 'normal' },
  'graph:searchCode':               { class: 'paired-read', timeoutClass: 'normal' },
  'graph:searchGraph':              { class: 'paired-read', timeoutClass: 'normal' },
  'graph:traceCallPath':            { class: 'paired-read', timeoutClass: 'normal' },

  // ── hooks (read) ────────────────────────────────────────────────────────────
  'hooks:getConfig':                { class: 'paired-read', timeoutClass: 'short' },

  // ── ideTools (read) ─────────────────────────────────────────────────────────
  'ideTools:getAddress':            { class: 'paired-read', timeoutClass: 'short' },

  // ── layout (read) ───────────────────────────────────────────────────────────
  'layout:getCustomLayout':         { class: 'paired-read', timeoutClass: 'short' },

  // ── lsp (read) ──────────────────────────────────────────────────────────────
  'lsp:completion':                 { class: 'paired-read', timeoutClass: 'normal' },
  'lsp:definition':                 { class: 'paired-read', timeoutClass: 'normal' },
  'lsp:diagnostics':                { class: 'paired-read', timeoutClass: 'normal' },
  'lsp:getStatus':                  { class: 'paired-read', timeoutClass: 'short' },
  'lsp:hover':                      { class: 'paired-read', timeoutClass: 'normal' },

  // ── mcp (read) ──────────────────────────────────────────────────────────────
  'mcp:getServers':                 { class: 'paired-read', timeoutClass: 'short' },

  // ── mcpStore (read) ─────────────────────────────────────────────────────────
  'mcpStore:getDetails':            { class: 'paired-read', timeoutClass: 'normal' },
  'mcpStore:getInstalled':          { class: 'paired-read', timeoutClass: 'short' },
  'mcpStore:search':                { class: 'paired-read', timeoutClass: 'normal' },
  'mcpStore:searchNpm':             { class: 'paired-read', timeoutClass: 'normal' },

  // ── mobileAccess (read) ─────────────────────────────────────────────────────
  'mobileAccess:listPairedDevices': { class: 'paired-read', timeoutClass: 'short' },

  // ── observability (read) ────────────────────────────────────────────────────
  'observability:exportTrace':      { class: 'paired-read', timeoutClass: 'long' },

  // ── perf (read) ─────────────────────────────────────────────────────────────
  'perf:getRuntimeMetrics':         { class: 'paired-read', timeoutClass: 'short' },
  'perf:getStartupHistory':         { class: 'paired-read', timeoutClass: 'short' },
  'perf:getStartupTimings':         { class: 'paired-read', timeoutClass: 'short' },
  'perf:mark':                      { class: 'paired-read', timeoutClass: 'short' },
  'perf:markFirstRender':           { class: 'paired-read', timeoutClass: 'short' },
  'perf:subscribe':                 { class: 'paired-read', timeoutClass: 'short' },
  'perf:unsubscribe':               { class: 'paired-read', timeoutClass: 'short' },

  // ── pinnedContext (read) ─────────────────────────────────────────────────────
  'pinnedContext:list':             { class: 'paired-read', timeoutClass: 'short' },

  // ── profileCrud (read) ──────────────────────────────────────────────────────
  'profileCrud:estimate':           { class: 'paired-read', timeoutClass: 'short' },
  'profileCrud:export':             { class: 'paired-read', timeoutClass: 'short' },
  'profileCrud:getDefault':         { class: 'paired-read', timeoutClass: 'short' },
  'profileCrud:lint':               { class: 'paired-read', timeoutClass: 'short' },
  'profileCrud:list':               { class: 'paired-read', timeoutClass: 'short' },

  // ── pty (read) ──────────────────────────────────────────────────────────────
  'pty:getCwd':                     { class: 'paired-read', timeoutClass: 'short' },
  'pty:getLinkedSessionIds':        { class: 'paired-read', timeoutClass: 'short' },
  'pty:getLinkedThread':            { class: 'paired-read', timeoutClass: 'short' },
  'pty:listPersistedSessions':      { class: 'paired-read', timeoutClass: 'short' },
  'pty:listSessions':               { class: 'paired-read', timeoutClass: 'short' },

  // ── research (read) ─────────────────────────────────────────────────────────
  'research:getDashboardMetrics':   { class: 'paired-read', timeoutClass: 'normal' },
  'research:getGlobalDefault':      { class: 'paired-read', timeoutClass: 'short' },
  'research:getSessionMode':        { class: 'paired-read', timeoutClass: 'short' },
  'research:getSessionOutcomes':    { class: 'paired-read', timeoutClass: 'normal' },

  // ── router (read) ───────────────────────────────────────────────────────────
  'router:getStats':                { class: 'paired-read', timeoutClass: 'short' },

  // ── rulesAndSkills (read) ───────────────────────────────────────────────────
  'rules:list':                     { class: 'paired-read', timeoutClass: 'short' },
  'rules:read':                     { class: 'paired-read', timeoutClass: 'short' },
  'rulesDir:list':                  { class: 'paired-read', timeoutClass: 'short' },
  'rulesDir:read':                  { class: 'paired-read', timeoutClass: 'short' },

  // ── sessionCrud (read) ──────────────────────────────────────────────────────
  'sessionCrud:active':             { class: 'paired-read', timeoutClass: 'short' },
  'sessionCrud:list':               { class: 'paired-read', timeoutClass: 'short' },

  // ── sessions (read) ─────────────────────────────────────────────────────────
  'sessions:getSystemPrompt':       { class: 'paired-read', timeoutClass: 'short' },
  'sessions:listDispatchJobs':      { class: 'paired-read', timeoutClass: 'short' },
  'sessions:load':                  { class: 'paired-read', timeoutClass: 'normal' },

  // ── shellHistory (read) ─────────────────────────────────────────────────────
  'shellHistory:read':              { class: 'paired-read', timeoutClass: 'normal' },

  // ── subagent (read) ─────────────────────────────────────────────────────────
  'subagent:costRollup':            { class: 'paired-read', timeoutClass: 'normal' },
  'subagent:get':                   { class: 'paired-read', timeoutClass: 'normal' },
  'subagent:list':                  { class: 'paired-read', timeoutClass: 'normal' },
  'subagent:liveCount':             { class: 'paired-read', timeoutClass: 'short' },

  // ── symbol (read) ───────────────────────────────────────────────────────────
  'symbol:search':                  { class: 'paired-read', timeoutClass: 'normal' },

  // ── telemetry (read) ────────────────────────────────────────────────────────
  'telemetry:queryEvents':          { class: 'paired-read', timeoutClass: 'normal' },
  'telemetry:queryOutcomes':        { class: 'paired-read', timeoutClass: 'normal' },
  'telemetry:queryTraces':          { class: 'paired-read', timeoutClass: 'normal' },

  // ── usage (read) ────────────────────────────────────────────────────────────
  'usage:getRecentSessions':        { class: 'paired-read', timeoutClass: 'normal' },
  'usage:getSessionDetail':         { class: 'paired-read', timeoutClass: 'normal' },
  'usage:getSummary':               { class: 'paired-read', timeoutClass: 'normal' },
  'usage:getUsageWindowSnapshot':   { class: 'paired-read', timeoutClass: 'short' },
  'usage:getWindowedUsage':         { class: 'paired-read', timeoutClass: 'normal' },

  // ── workspaceReadList (read) ─────────────────────────────────────────────────
  'workspaceReadList:get':          { class: 'paired-read', timeoutClass: 'short' },
};
