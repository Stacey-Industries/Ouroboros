/**
 * channelCatalog.desktopOnly.ts — desktop-only capability channels.
 *
 * Wave 33a Phase C — capability catalog (desktop-only class).
 * These channels are BLOCKED for all mobile clients regardless of
 * their capability set. Fail-closed by design.
 */

import type { CatalogEntry } from './channelCatalog.always';

/**
 * Channels that are desktop-only — blocked for all mobile clients.
 *
 * Criteria: arbitrary filesystem writes/deletes outside project roots,
 * PTY spawning (arbitrary shell execution), process management,
 * config reset/import, app quit, window management, dialog pickers,
 * auth mutations that modify stored credentials, extension installs.
 */
export const DESKTOP_ONLY_CATALOG: Record<string, CatalogEntry> = {
  // ── AI inline (spawn-adjacent; require desktop Monaco editor) ───────────────
  'ai:generate-commit-message':     { class: 'desktop-only', timeoutClass: 'normal' },
  'ai:inline-completion':           { class: 'desktop-only', timeoutClass: 'normal' },
  'ai:inline-edit':                 { class: 'desktop-only', timeoutClass: 'normal' },
  'ai:streamInlineEdit':            { class: 'desktop-only', timeoutClass: 'long' },
  'ai:cancelInlineEditStream':      { class: 'desktop-only', timeoutClass: 'short' },

  // ── backgroundJobs:enqueue (long-running; poorly suited for mobile) ──────────
  // list, cancel, clearCompleted remain paired-read/write. enqueue is the only
  // method excluded from mobile because initiating heavy background work on a
  // mobile/paired device is undesirable without local resource visibility.
  'backgroundJobs:enqueue':         { class: 'desktop-only', timeoutClass: 'long' },

  // ── checkpoint:create + checkpoint:restore (git worktree ops) ─────────────────
  // checkpoint:list, delete, and onChange remain paired-read/write.
  'checkpoint:create':              { class: 'desktop-only', timeoutClass: 'long' },
  'checkpoint:restore':             { class: 'desktop-only', timeoutClass: 'long' },

  // ── embedding (requires full local codebase index) ────────────────────────────
  'embedding:reindex':              { class: 'desktop-only', timeoutClass: 'long' },
  'embedding:search':               { class: 'desktop-only', timeoutClass: 'normal' },
  'embedding:status':               { class: 'desktop-only', timeoutClass: 'short' },

  // ── graph:* (full codebase knowledge graph; requires local index) ─────────────
  // All graph channels are desktop-only. The index is built from the local
  // filesystem and requires the full project to be available on disk.
  'graph:detectChanges':            { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:getArchitecture':          { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:getBlastRadius':           { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:getCodeSnippet':           { class: 'desktop-only', timeoutClass: 'short' },
  'graph:getGraphSchema':           { class: 'desktop-only', timeoutClass: 'short' },
  'graph:getNeighbourhood':         { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:getStatus':                { class: 'desktop-only', timeoutClass: 'short' },
  'graph:queryGraph':               { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:reindex':                  { class: 'desktop-only', timeoutClass: 'long' },
  'graph:searchCode':               { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:searchGraph':              { class: 'desktop-only', timeoutClass: 'normal' },
  'graph:traceCallPath':            { class: 'desktop-only', timeoutClass: 'normal' },

  // ── observability:exportTrace (writes to arbitrary path) ──────────────────────
  'observability:exportTrace':      { class: 'desktop-only', timeoutClass: 'long' },

  // ── spec:scaffold (writes new spec files to disk) ─────────────────────────────
  'spec:scaffold':                  { class: 'desktop-only', timeoutClass: 'long' },

  // ── telemetry:queryEvents (developer debug feature — direct DB access) ─────────
  // queryOutcomes and queryTraces remain paired-read. queryEvents is excluded
  // because it exposes the raw telemetry DB to mobile clients.
  'telemetry:queryEvents':          { class: 'desktop-only', timeoutClass: 'normal' },

  // ── app lifecycle ────────────────────────────────────────────────────────────
  'app:clearCrashLogs':             { class: 'desktop-only', timeoutClass: 'normal' },
  'app:getCrashLogs':               { class: 'desktop-only', timeoutClass: 'normal' },
  'app:logError':                   { class: 'desktop-only', timeoutClass: 'short' },
  'app:notify':                     { class: 'desktop-only', timeoutClass: 'short' },
  'app:openCrashLogDir':            { class: 'desktop-only', timeoutClass: 'short' },
  'app:openExternal':               { class: 'desktop-only', timeoutClass: 'short' },
  'app:open-logs-folder':           { class: 'desktop-only', timeoutClass: 'short' },
  'app:rebuildAndRestart':          { class: 'desktop-only', timeoutClass: 'long' },
  'app:rebuildWeb':                 { class: 'desktop-only', timeoutClass: 'long' },
  'app:showStreamCompletionNotification': { class: 'desktop-only', timeoutClass: 'short' },

  // ── auth mutations (credential storage — desktop-only for security) ──────────
  'auth:cancelLogin':               { class: 'desktop-only', timeoutClass: 'normal' },
  'auth:importCliCreds':            { class: 'desktop-only', timeoutClass: 'normal' },
  'auth:logout':                    { class: 'desktop-only', timeoutClass: 'normal' },
  'auth:openExternal':              { class: 'desktop-only', timeoutClass: 'short' },
  'auth:setApiKey':                 { class: 'desktop-only', timeoutClass: 'normal' },
  'auth:startLogin':                { class: 'desktop-only', timeoutClass: 'long' },

  // ── config mutations (full config import/export/reset) ───────────────────────
  'config:export':                  { class: 'desktop-only', timeoutClass: 'normal' },
  'config:import':                  { class: 'desktop-only', timeoutClass: 'normal' },
  'config:openSettingsFile':        { class: 'desktop-only', timeoutClass: 'short' },
  'config:set':                     { class: 'desktop-only', timeoutClass: 'normal' },

  // ── dialog (native OS dialogs — desktop-only) ────────────────────────────────
  'dialog:saveFile':                { class: 'desktop-only', timeoutClass: 'normal' },
  'files:openFile':                 { class: 'desktop-only', timeoutClass: 'normal' },
  'files:selectFolder':             { class: 'desktop-only', timeoutClass: 'normal' },
  'files:showImageDialog':          { class: 'desktop-only', timeoutClass: 'normal' },

  // ── extensions (install/uninstall mutates disk outside project roots) ─────────
  'extensions:activate':            { class: 'desktop-only', timeoutClass: 'normal' },
  'extensions:commandExecuted':     { class: 'desktop-only', timeoutClass: 'normal' },
  'extensions:disable':             { class: 'desktop-only', timeoutClass: 'normal' },
  'extensions:enable':              { class: 'desktop-only', timeoutClass: 'normal' },
  'extensions:install':             { class: 'desktop-only', timeoutClass: 'long' },
  'extensions:openFolder':          { class: 'desktop-only', timeoutClass: 'short' },
  'extensions:uninstall':           { class: 'desktop-only', timeoutClass: 'normal' },

  // ── extensionStore (install — disk writes outside project roots) ─────────────
  'extensionStore:disableContributions': { class: 'desktop-only', timeoutClass: 'normal' },
  'extensionStore:enableContributions':  { class: 'desktop-only', timeoutClass: 'normal' },
  'extensionStore:install':              { class: 'desktop-only', timeoutClass: 'long' },
  'extensionStore:installMarketplace':   { class: 'desktop-only', timeoutClass: 'long' },
  'extensionStore:uninstall':            { class: 'desktop-only', timeoutClass: 'normal' },

  // ── files (destructive — arbitrary path ops) ─────────────────────────────────
  // files:delete and files:rename can target arbitrary paths outside project roots.
  'files:delete':                   { class: 'desktop-only', timeoutClass: 'normal' },
  'files:rename':                   { class: 'desktop-only', timeoutClass: 'normal' },

  // ── marketplace (install writes to global config outside project-root scope) ──
  // marketplace:install is desktop-only: it mutates ecosystem.systemPrompt and
  // theming.customTokens at the global level — not scoped to any project root.
  // A compromised paired device must not be able to persist prompt injections.
  'marketplace:install':            { class: 'desktop-only', timeoutClass: 'normal' },

  // ── platform ────────────────────────────────────────────────────────────────
  // platform:openCrashReportsDir opens a native folder picker — desktop-only by
  // nature; invoking it from a mobile WS client would be a no-op or odd behaviour.
  'platform:openCrashReportsDir':   { class: 'desktop-only', timeoutClass: 'short' },

  // ── PTY — shell execution (desktop-only: arbitrary code execution) ────────────
  'pty:spawn':                      { class: 'desktop-only', timeoutClass: 'normal' },
  'pty:spawnClaude':                { class: 'desktop-only', timeoutClass: 'long' },
  'pty:spawnCodex':                 { class: 'desktop-only', timeoutClass: 'long' },
  // pty:write/resize/kill send arbitrary stdin to an existing PTY session.
  // A paired device driving any open shell (bash, pwsh, cmd) is functional RCE.
  // Reclassified from paired-write per CRIT-1 / Wave 41 Phase A.
  'pty:kill':                       { class: 'desktop-only', timeoutClass: 'normal' },
  'pty:resize':                     { class: 'desktop-only', timeoutClass: 'normal' },
  'pty:write':                      { class: 'desktop-only', timeoutClass: 'normal' },

  // ── sessions (export writes arbitrary file path via dialog) ──────────────────
  'sessions:export':                { class: 'desktop-only', timeoutClass: 'normal' },

  // ── sessionCrud (opening new windows is desktop-only) ────────────────────────
  'sessionCrud:openChatWindow':     { class: 'desktop-only', timeoutClass: 'normal' },

  // ── shell (opens native shell / Finder / Explorer) ───────────────────────────
  'shell:openExtensionsFolder':     { class: 'desktop-only', timeoutClass: 'short' },
  'shell:showItemInFolder':         { class: 'desktop-only', timeoutClass: 'short' },

  // ── titlebar (desktop window chrome) ─────────────────────────────────────────
  'titlebar:setOverlayColors':      { class: 'desktop-only', timeoutClass: 'short' },

  // ── updater (installs a new app binary) ──────────────────────────────────────
  'updater:check':                  { class: 'desktop-only', timeoutClass: 'normal' },
  'updater:download':               { class: 'desktop-only', timeoutClass: 'long' },
  'updater:install':                { class: 'desktop-only', timeoutClass: 'long' },

  // ── window management (creates / closes / resizes OS windows) ────────────────
  'window:close':                   { class: 'desktop-only', timeoutClass: 'short' },
  'window:close-self':              { class: 'desktop-only', timeoutClass: 'short' },
  'window:focus':                   { class: 'desktop-only', timeoutClass: 'short' },
  'window:getProjectRoots':         { class: 'desktop-only', timeoutClass: 'short' },
  'window:getSelf':                 { class: 'desktop-only', timeoutClass: 'short' },
  'window:list':                    { class: 'desktop-only', timeoutClass: 'short' },
  'window:maximize-toggle':         { class: 'desktop-only', timeoutClass: 'short' },
  'window:minimize':                { class: 'desktop-only', timeoutClass: 'short' },
  'window:new':                     { class: 'desktop-only', timeoutClass: 'normal' },
  'window:setProjectRoot':          { class: 'desktop-only', timeoutClass: 'short' },
  'window:setProjectRoots':         { class: 'desktop-only', timeoutClass: 'short' },
  'window:toggle-devtools':         { class: 'desktop-only', timeoutClass: 'short' },
  'window:toggle-fullscreen':       { class: 'desktop-only', timeoutClass: 'short' },

  // ── workspace trust (modifies global trust store) ────────────────────────────
  'workspace:isTrusted':            { class: 'desktop-only', timeoutClass: 'short' },
  'workspace:trust':                { class: 'desktop-only', timeoutClass: 'short' },
  'workspace:trustLevel':           { class: 'desktop-only', timeoutClass: 'short' },
  'workspace:untrust':              { class: 'desktop-only', timeoutClass: 'short' },
};
