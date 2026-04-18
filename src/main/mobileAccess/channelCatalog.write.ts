/**
 * channelCatalog.write.ts — paired-write capability channels.
 *
 * Wave 33a Phase C — capability catalog (paired-write class).
 * These channels are permitted for authenticated paired devices that
 * have the 'paired-write' capability.
 */

import type { CatalogEntry } from './channelCatalog.always';

/**
 * Channels that require 'paired-write' capability.
 * Mutations that are scoped to known project roots: chat, checkpoints,
 * layout persistence, worktree operations, file writes under project roots.
 */
export const WRITE_CATALOG: Record<string, CatalogEntry> = {
  // ── compareProviders (write) ────────────────────────────────────────────────
  'compareProviders:start':           { class: 'paired-write', timeoutClass: 'long' },
  'compareProviders:cancel':          { class: 'paired-write', timeoutClass: 'short' },

  // ── agentChat (write) ───────────────────────────────────────────────────────
  'agentChat:addMessageReaction':   { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:branchThread':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:cancelByThreadId':     { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:cancelTask':           { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:createMemory':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:createThread':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:deleteMemory':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:deleteThread':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:exportThread':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:forkThread':           { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:importThread':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:mergeSideChat':        { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:reRunFromMessage':     { class: 'paired-write', timeoutClass: 'long' },
  'agentChat:removeMessageReaction':{ class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:renameBranch':         { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:revertToSnapshot':     { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:sendMessage':          { class: 'paired-write', timeoutClass: 'long' },
  'agentChat:setMessageCollapsed':  { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:setThreadTags':        { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:softDeleteThread':     { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:pinThread':            { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:restoreDeletedThread': { class: 'paired-write', timeoutClass: 'normal' },
  'agentChat:updateMemory':         { class: 'paired-write', timeoutClass: 'normal' },

  // ── agentConflict (write) ───────────────────────────────────────────────────
  'agentConflict:dismiss':          { class: 'paired-write', timeoutClass: 'normal' },

  // ── approval (write) ────────────────────────────────────────────────────────
  'approval:alwaysAllow':           { class: 'paired-write', timeoutClass: 'normal' },
  'approval:forget':                { class: 'paired-write', timeoutClass: 'normal' },
  'approval:remember':              { class: 'paired-write', timeoutClass: 'normal' },
  'approval:respond':               { class: 'paired-write', timeoutClass: 'normal' },

  // ── backgroundJobs (write) ──────────────────────────────────────────────────
  'backgroundJobs:cancel':          { class: 'paired-write', timeoutClass: 'normal' },
  'backgroundJobs:clearCompleted':  { class: 'paired-write', timeoutClass: 'normal' },
  'backgroundJobs:enqueue':         { class: 'paired-write', timeoutClass: 'long' },

  // ── checkpoint (write) ──────────────────────────────────────────────────────
  'checkpoint:create':              { class: 'paired-write', timeoutClass: 'long' },
  'checkpoint:delete':              { class: 'paired-write', timeoutClass: 'normal' },
  'checkpoint:restore':             { class: 'paired-write', timeoutClass: 'long' },

  // ── claudeMd (write) ────────────────────────────────────────────────────────
  'claudeMd:generate':              { class: 'paired-write', timeoutClass: 'long' },
  'claudeMd:generateForDir':        { class: 'paired-write', timeoutClass: 'long' },

  // ── claudeSettings (write) ──────────────────────────────────────────────────
  'claudeSettings:writeKey':        { class: 'paired-write', timeoutClass: 'normal' },

  // ── codemode (write) ────────────────────────────────────────────────────────
  'codemode:disable':               { class: 'paired-write', timeoutClass: 'normal' },
  'codemode:enable':                { class: 'paired-write', timeoutClass: 'normal' },
  'codemode:status':                { class: 'paired-write', timeoutClass: 'short' },

  // ── commands (write) ────────────────────────────────────────────────────────
  'commands:create':                { class: 'paired-write', timeoutClass: 'normal' },
  'commands:delete':                { class: 'paired-write', timeoutClass: 'normal' },
  'commands:update':                { class: 'paired-write', timeoutClass: 'normal' },

  // ── context (write) ─────────────────────────────────────────────────────────
  'context:generate':               { class: 'paired-write', timeoutClass: 'long' },

  // ── cost (write) ────────────────────────────────────────────────────────────
  'cost:addEntry':                  { class: 'paired-write', timeoutClass: 'normal' },
  'cost:clearHistory':              { class: 'paired-write', timeoutClass: 'normal' },

  // ── embedding (write) ───────────────────────────────────────────────────────
  'embedding:reindex':              { class: 'paired-write', timeoutClass: 'long' },

  // ── files (write — project-root-scoped) ─────────────────────────────────────
  // Note: pathSecurity.ts enforces project-root restriction at the handler level.
  // files:saveFile and files:writeFile are paired-write (not desktop-only) because
  // they go through assertPathAllowed before touching disk.
  'files:copyFile':                 { class: 'paired-write', timeoutClass: 'normal' },
  'files:createFile':               { class: 'paired-write', timeoutClass: 'normal' },
  'files:mkdir':                    { class: 'paired-write', timeoutClass: 'normal' },
  'files:restoreDeleted':           { class: 'paired-write', timeoutClass: 'normal' },
  'files:saveFile':                 { class: 'paired-write', timeoutClass: 'normal' },
  'files:softDelete':               { class: 'paired-write', timeoutClass: 'normal' },
  'files:watchDir':                 { class: 'paired-write', timeoutClass: 'normal' },
  'files:unwatchDir':               { class: 'paired-write', timeoutClass: 'normal' },
  'files:writeFile':                { class: 'paired-write', timeoutClass: 'normal' },

  // ── folderCrud (write) ──────────────────────────────────────────────────────
  'folderCrud:addSession':          { class: 'paired-write', timeoutClass: 'normal' },
  'folderCrud:create':              { class: 'paired-write', timeoutClass: 'normal' },
  'folderCrud:delete':              { class: 'paired-write', timeoutClass: 'normal' },
  'folderCrud:moveSession':         { class: 'paired-write', timeoutClass: 'normal' },
  'folderCrud:removeSession':       { class: 'paired-write', timeoutClass: 'normal' },
  'folderCrud:rename':              { class: 'paired-write', timeoutClass: 'normal' },

  // ── git (write) ─────────────────────────────────────────────────────────────
  'git:applyHunk':                  { class: 'paired-write', timeoutClass: 'normal' },
  'git:checkpoint':                 { class: 'paired-write', timeoutClass: 'normal' },
  'git:checkout':                   { class: 'paired-write', timeoutClass: 'normal' },
  'git:commit':                     { class: 'paired-write', timeoutClass: 'normal' },
  'git:createSnapshot':             { class: 'paired-write', timeoutClass: 'normal' },
  'git:discardFile':                { class: 'paired-write', timeoutClass: 'normal' },
  'git:restoreSnapshot':            { class: 'paired-write', timeoutClass: 'normal' },
  'git:revertFile':                 { class: 'paired-write', timeoutClass: 'normal' },
  'git:revertHunk':                 { class: 'paired-write', timeoutClass: 'normal' },
  'git:stage':                      { class: 'paired-write', timeoutClass: 'normal' },
  'git:stageAll':                   { class: 'paired-write', timeoutClass: 'normal' },
  'git:stageHunk':                  { class: 'paired-write', timeoutClass: 'normal' },
  'git:unstage':                    { class: 'paired-write', timeoutClass: 'normal' },
  'git:unstageAll':                 { class: 'paired-write', timeoutClass: 'normal' },
  'git:worktreeAdd':                { class: 'paired-write', timeoutClass: 'normal' },
  'git:worktreeRemove':             { class: 'paired-write', timeoutClass: 'normal' },

  // ── graph (write) ───────────────────────────────────────────────────────────
  // graph:reindex mutates the graph index but is scoped to known project roots.
  'graph:reindex':                  { class: 'paired-write', timeoutClass: 'long' },
  'graph:detectChanges':            { class: 'paired-write', timeoutClass: 'normal' },

  // ── hooks (write) ───────────────────────────────────────────────────────────
  'hooks:addHook':                  { class: 'paired-write', timeoutClass: 'normal' },
  'hooks:removeHook':               { class: 'paired-write', timeoutClass: 'normal' },

  // ── ideTools (write) ────────────────────────────────────────────────────────
  'ideTools:respond':               { class: 'paired-write', timeoutClass: 'normal' },

  // ── layout (write) ──────────────────────────────────────────────────────────
  'layout:deleteCustomLayout':      { class: 'paired-write', timeoutClass: 'normal' },
  'layout:promoteToGlobal':         { class: 'paired-write', timeoutClass: 'normal' },
  'layout:setCustomLayout':         { class: 'paired-write', timeoutClass: 'normal' },

  // ── lsp (write) ─────────────────────────────────────────────────────────────
  'lsp:didChange':                  { class: 'paired-write', timeoutClass: 'normal' },
  'lsp:didClose':                   { class: 'paired-write', timeoutClass: 'normal' },
  'lsp:didOpen':                    { class: 'paired-write', timeoutClass: 'normal' },
  'lsp:start':                      { class: 'paired-write', timeoutClass: 'normal' },
  'lsp:stop':                       { class: 'paired-write', timeoutClass: 'normal' },

  // ── mcp (write) ─────────────────────────────────────────────────────────────
  'mcp:addServer':                  { class: 'paired-write', timeoutClass: 'normal' },
  'mcp:removeServer':               { class: 'paired-write', timeoutClass: 'normal' },
  'mcp:toggleServer':               { class: 'paired-write', timeoutClass: 'normal' },
  'mcp:updateServer':               { class: 'paired-write', timeoutClass: 'normal' },

  // ── mcpStore (write) ────────────────────────────────────────────────────────
  'mcpStore:install':               { class: 'paired-write', timeoutClass: 'long' },

  // ── mobileAccess (write — desktop-facing pairing management) ────────────────
  'mobileAccess:generatePairingCode': { class: 'paired-write', timeoutClass: 'short' },
  'mobileAccess:revokePairedDevice':  { class: 'paired-write', timeoutClass: 'normal' },

  // ── orchestration (write) ───────────────────────────────────────────────────
  'orchestration:buildContextPacket': { class: 'paired-write', timeoutClass: 'long' },
  'orchestration:previewContext':     { class: 'paired-write', timeoutClass: 'normal' },

  // ── pinnedContext (write) ────────────────────────────────────────────────────
  'pinnedContext:add':              { class: 'paired-write', timeoutClass: 'normal' },
  'pinnedContext:dismiss':          { class: 'paired-write', timeoutClass: 'normal' },
  'pinnedContext:remove':           { class: 'paired-write', timeoutClass: 'normal' },

  // ── profileCrud (write) ─────────────────────────────────────────────────────
  'profileCrud:delete':             { class: 'paired-write', timeoutClass: 'normal' },
  'profileCrud:import':             { class: 'paired-write', timeoutClass: 'normal' },
  'profileCrud:setDefault':         { class: 'paired-write', timeoutClass: 'normal' },
  'profileCrud:upsert':             { class: 'paired-write', timeoutClass: 'normal' },

  // ── pty (write — non-spawn) ──────────────────────────────────────────────────
  // pty:write/resize/kill are paired-write: they affect running terminals
  // but do not spawn new ones. pty:spawn itself is desktop-only.
  'pty:discardPersistedSessions':   { class: 'paired-write', timeoutClass: 'normal' },
  'pty:kill':                       { class: 'paired-write', timeoutClass: 'normal' },
  'pty:linkToThread':               { class: 'paired-write', timeoutClass: 'normal' },
  'pty:resize':                     { class: 'paired-write', timeoutClass: 'normal' },
  'pty:restoreSession':             { class: 'paired-write', timeoutClass: 'normal' },
  'pty:startRecording':             { class: 'paired-write', timeoutClass: 'normal' },
  'pty:stopRecording':              { class: 'paired-write', timeoutClass: 'normal' },
  'pty:write':                      { class: 'paired-write', timeoutClass: 'normal' },

  // ── research (write) ────────────────────────────────────────────────────────
  'research:invoke':                { class: 'paired-write', timeoutClass: 'long' },
  'research:setGlobalDefault':      { class: 'paired-write', timeoutClass: 'normal' },
  'research:setSessionMode':        { class: 'paired-write', timeoutClass: 'normal' },

  // ── rulesAndSkills (write) ──────────────────────────────────────────────────
  'rules:create':                   { class: 'paired-write', timeoutClass: 'normal' },
  'rulesAndSkills:startWatcher':    { class: 'paired-write', timeoutClass: 'normal' },
  'rulesDir:create':                { class: 'paired-write', timeoutClass: 'normal' },
  'rulesDir:delete':                { class: 'paired-write', timeoutClass: 'normal' },
  'rulesDir:update':                { class: 'paired-write', timeoutClass: 'normal' },

  // ── sessionCrud (write) ─────────────────────────────────────────────────────
  'sessionCrud:activate':           { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:archive':            { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:create':             { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:delete':             { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:pin':                { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:restore':            { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:restoreDeleted':     { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:setMcpOverrides':    { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:setProfile':         { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:setToolOverrides':   { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:softDelete':         { class: 'paired-write', timeoutClass: 'normal' },
  'sessionCrud:updateAgentMonitorSettings': { class: 'paired-write', timeoutClass: 'normal' },

  // ── sessions (write) ────────────────────────────────────────────────────────
  'sessions:cancelDispatchJob':     { class: 'paired-write', timeoutClass: 'short' },
  'sessions:delete':                { class: 'paired-write', timeoutClass: 'normal' },
  'sessions:dispatchTask':          { class: 'paired-write', timeoutClass: 'long' },
  'sessions:save':                  { class: 'paired-write', timeoutClass: 'normal' },

  // ── spec (write) ────────────────────────────────────────────────────────────
  'spec:scaffold':                  { class: 'paired-write', timeoutClass: 'long' },

  // ── subagent (write) ────────────────────────────────────────────────────────
  'subagent:cancel':                { class: 'paired-write', timeoutClass: 'normal' },

  // ── telemetry (write) ───────────────────────────────────────────────────────
  'telemetry:record':               { class: 'paired-write', timeoutClass: 'normal' },

  // ── theme (write) ───────────────────────────────────────────────────────────
  'theme:set':                      { class: 'paired-write', timeoutClass: 'short' },

  // ── workspaceReadList (write) ────────────────────────────────────────────────
  'workspaceReadList:add':          { class: 'paired-write', timeoutClass: 'normal' },
  'workspaceReadList:remove':       { class: 'paired-write', timeoutClass: 'normal' },
};
