/**
 * channelCatalogCoverage.test.ts — guard that fails when IPC channels
 * registered in handler files are not listed in CHANNEL_CATALOG.
 *
 * Wave 33a Phase C (static list); Wave 41 Phase B (runtime-derived scan).
 *
 * Source of truth: tools/dump-ipc-channels.ts — scans src/main/ and
 * src/shared/ipc/ for IPC channel string literals. Any new
 * ipcMain.handle('x:y', ...) call is automatically reflected in the scan
 * result, so the hand-maintained HANDLER_REGISTRY_CHANNELS list is gone.
 *
 * If a new channel appears in the scan and is absent from the catalog,
 * the test fails with a clear list of unclassified channels. Add the
 * channel to the appropriate channelCatalog.*.ts sub-module before merging.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scanIpcChannels } from '../../../tools/dump-ipc-channels';
import { CATALOG_LOOKUP } from './channelCatalog';

// Resolve the repository root.
// This file lives at src/main/mobileAccess/ → three levels up is the repo root.
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

/**
 * Allowlist for channels that exist in handler / source files but
 * intentionally have no catalog entry.
 *
 * Three categories:
 *
 * A. Push-only event channels — emitted via webContents.send or
 *    broadcastToWebClients; never invoked by a JSON-RPC client.
 *
 * B. Dead channel constants — defined in shared/ipc/*.ts for
 *    preload/renderer type safety but have no live ipcMain.handle
 *    registration. Kept here so the scan can still flag them if a handler
 *    is accidentally (re-)added without a catalog entry.
 *
 * C. Legacy/internal strings — channel-shaped strings that appear in source
 *    for non-IPC reasons (menu events, WebSocket wire format).
 *
 * Keep this list minimal. Entries here bypass the gate entirely — any channel
 * that IS reachable from a mobile client must be in the catalog, not here.
 */
const UNCLASSIFIED_ALLOWLIST = new Set<string>([
  // ── A. Push-only event channels ───────────────────────────────────────────
  // Emitted by main process; never invokable by a renderer/client.
  'agentChat:stream',
  'agentChat:thread',
  'agentChat:message',
  'agentChat:event',
  'agentConflict:change',
  'app:navigateToPermalink',    // webContents.send push — notifications.ts / protocolHandler.ts
  'app:rebuilding',
  'app:startupWarning',          // webContents.send push — main.ts
  'approval:memoryChanged',      // webContents.send push — approvalMemory.ts
  'approval:request',
  'approval:resolved',
  'auth:loginEvent',
  'auth:stateChanged',
  'backgroundJobs:update',
  'checkpoint:change',
  'claudeMd:statusChange',       // webContents.send push — claudeMdGenerator.ts
  // compareProviders:event is push-only (main → renderer via webContents.send).
  // No ipcMain.handle exists; cannot be invoked by a client. Wave 41 Phase A.
  'compareProviders:event',
  'config:externalChange',       // webContents.send push — config.ts settings watcher
  'contextLayer:progress',
  // ecosystem:promptDiff is push-only — documented as such in ecosystemHandlers.ts.
  // No ipcMain.handle exists; cannot be invoked by a client. Wave 41 Phase A.
  'ecosystem:promptDiff',
  'extensionStore:contributionsChanged',
  'extensionStore:installed',
  'extensionStore:uninstalled',
  'extensions:notification',     // webContents.send push — extensionsApi.ts
  'files:change',
  'folderCrud:changed',
  'hooks:event',                  // webContents.send push — hooks.ts
  'ide:query',                    // webContents.send push — ideToolServer.ts reverse channel
  'auth:state-changed',           // broadcast push — tokenRefreshManager.ts (hyphenated form)
  'lsp:statusChange',             // webContents.send push — lspHandlers.ts
  'main:uncaughtException',       // webContents.send push — main.ts error handler
  'main:unhandledRejection',      // webContents.send push — main.ts error handler
  'menu:command-palette',         // webContents.send push — menu.ts
  'menu:new-terminal',            // webContents.send push — menu.ts
  'menu:open-chat-window-no-session', // webContents.send push — menu.ts
  'menu:open-folder',             // webContents.send push — menu.ts
  'menu:settings',                // webContents.send push — menu.ts
  'menu:toggle-side-chat',        // webContents.send push — menu.ts
  'pair:result',                  // WebSocket-level push in webServer.ts pairing flow
  'perf:indexer-completed',       // webContents.send push — perfMetrics.ts
  'perf:metrics',
  'pinnedContext:changed',
  'profileCrud:changed',
  'pty:data',
  'pty:exit',
  'pty:recordingState',
  'pty:disconnected',
  'rulesAndSkills:changed',
  'sessionCrud:changed',
  // sessionDispatch:status and sessionDispatch:notification are push-only events
  // broadcast from the dispatch runner — never invokable by a client.
  'sessionDispatch:status',
  'sessionDispatch:notification',
  'subagent:updated',
  'system2:indexProgress',
  'theme:changed',
  'updater:event',
  'workspaceReadList:changed',

  // ── B. Dead channel constants (no live ipcMain.handle registration) ────────
  // Defined in src/shared/ipc/orchestrationChannels.ts for type safety.
  // The full orchestration task system was removed as dead code (Wave ~35).
  // Only orchestration:previewContext and orchestration:buildContextPacket
  // remain wired (they ARE in the catalog).
  'orchestration:createTask',
  'orchestration:event',
  'orchestration:loadLatestSession',
  'orchestration:loadSession',
  'orchestration:loadSessions',
  'orchestration:pauseTask',
  'orchestration:provider',
  'orchestration:rerunVerification',
  'orchestration:resumeTask',
  'orchestration:session',
  'orchestration:startTask',
  'orchestration:state',
  'orchestration:updateSession',
  'orchestration:verification',

  // ── C. Legacy/internal ────────────────────────────────────────────────────
  'activeTheme',
  'node:fs',
  'node:path',
  'node:readline',
  'provider:model',
  'commands:list',    // listed in catalog under rulesAndSkills — alias
  'commands:read',
]);

describe('channel catalog coverage', () => {
  // Run the scan once for all tests in this describe block.
  const scannedChannels = scanIpcChannels(PROJECT_ROOT);

  it('every scanned channel is either catalogued or allowlisted', () => {
    const unclassified = scannedChannels.filter(
      (ch) => !CATALOG_LOOKUP.has(ch) && !UNCLASSIFIED_ALLOWLIST.has(ch),
    );

    if (unclassified.length > 0) {
      const list = unclassified.map((ch) => `  - ${ch}`).join('\n');
      throw new Error(
        `${unclassified.length} channel(s) are missing from CHANNEL_CATALOG.\n` +
        `Add them to the appropriate channelCatalog.*.ts sub-module:\n${list}`,
      );
    }

    expect(unclassified).toHaveLength(0);
  });

  it('no channel appears in both catalog and allowlist (allowlist stays clean)', () => {
    const overlap = scannedChannels.filter(
      (ch) => CATALOG_LOOKUP.has(ch) && UNCLASSIFIED_ALLOWLIST.has(ch),
    );
    expect(overlap, `Channels in both catalog and allowlist: ${overlap.join(', ')}`).toHaveLength(0);
  });

  it('every catalog entry appears in the scanned source (no phantom entries)', () => {
    const scannedSet = new Set(scannedChannels);
    const phantoms = Array.from(CATALOG_LOOKUP.keys()).filter(
      (ch) => !scannedSet.has(ch) && !UNCLASSIFIED_ALLOWLIST.has(ch),
    );

    if (phantoms.length > 0) {
      const list = phantoms.map((ch) => `  - ${ch}`).join('\n');
      throw new Error(
        `${phantoms.length} catalog entry/entries have no matching source string.\n` +
        `These are likely phantom entries — remove them from the catalog:\n${list}`,
      );
    }

    expect(phantoms).toHaveLength(0);
  });

  it('canonical security-sensitive channels are desktop-only', () => {
    expect(CATALOG_LOOKUP.get('pty:spawn')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('files:delete')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('files:rename')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('window:new')?.class).toBe('desktop-only');
  });

  // Wave 41 Phase A — CRIT-1 reclassification assertions
  it('pty:write/resize/kill are NOT in the write catalog (CRIT-1)', () => {
    expect(CATALOG_LOOKUP.get('pty:write')?.class).not.toBe('paired-write');
    expect(CATALOG_LOOKUP.get('pty:resize')?.class).not.toBe('paired-write');
    expect(CATALOG_LOOKUP.get('pty:kill')?.class).not.toBe('paired-write');
  });

  it('pty:write/resize/kill ARE desktop-only (CRIT-1)', () => {
    expect(CATALOG_LOOKUP.get('pty:write')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('pty:resize')?.class).toBe('desktop-only');
    expect(CATALOG_LOOKUP.get('pty:kill')?.class).toBe('desktop-only');
  });

  it('marketplace:install is desktop-only (CRIT-2)', () => {
    expect(CATALOG_LOOKUP.get('marketplace:install')?.class).toBe('desktop-only');
  });

  it('no phantom catalog entries (every catalog entry has a handler)', () => {
    // app:getSystemInfo is implemented in the preload without ipcMain.handle —
    // it must NOT be in the catalog. Verify it is absent.
    expect(CATALOG_LOOKUP.has('app:getSystemInfo')).toBe(false);
  });
});
