/**
 * webPreloadApisSessionCrud.ts — Session/folder/layout/profile/pinned-context/
 * subagent/checkpoint/workspace-read-list API builders for web preload.
 *
 * Exports: buildSessionCrudApi, buildFolderCrudApi, buildPinnedContextApi,
 *          buildProfileCrudApi, buildLayoutApi, buildSubagentApi,
 *          buildCheckpointApi, buildWorkspaceReadListApi.
 *
 * All namespaces are "Mirror" per docs/mobile-scope.md — they route through
 * the WS transport exactly like their Electron preload counterparts.
 */

import type { WebSocketTransport } from './webPreloadTransport';

// ─── Session CRUD API ─────────────────────────────────────────────────────────

export function buildSessionCrudApi(t: WebSocketTransport) {
  return {
    list: () => t.invoke('sessionCrud:list'),
    active: () => t.invoke('sessionCrud:active'),
    create: (projectRoot: string) => t.invoke('sessionCrud:create', projectRoot),
    activate: (sessionId: string) => t.invoke('sessionCrud:activate', sessionId),
    archive: (sessionId: string) => t.invoke('sessionCrud:archive', sessionId),
    restore: (sessionId: string) => t.invoke('sessionCrud:restore', sessionId),
    delete: (sessionId: string) => t.invoke('sessionCrud:delete', sessionId),
    // openChatWindow opens a native BrowserWindow — desktop-only stub on web
    openChatWindow: async () => ({
      success: false as const,
      error: 'sessionCrud:openChatWindow: This feature is only available in the desktop app.',
    }),
    updateAgentMonitorSettings: (sessionId: string, settings: unknown) =>
      t.invoke('sessionCrud:updateAgentMonitorSettings', sessionId, settings),
    pin: (sessionId: string, pinned: boolean) =>
      t.invoke('sessionCrud:pin', sessionId, pinned),
    softDelete: (sessionId: string) => t.invoke('sessionCrud:softDelete', sessionId),
    restoreDeleted: (sessionId: string) => t.invoke('sessionCrud:restoreDeleted', sessionId),
    setProfile: (sessionId: string, profileId: string) =>
      t.invoke('sessionCrud:setProfile', sessionId, profileId),
    setToolOverrides: (sessionId: string, toolOverrides: string[]) =>
      t.invoke('sessionCrud:setToolOverrides', sessionId, toolOverrides),
    setMcpOverrides: (sessionId: string, mcpServerOverrides: string[]) =>
      t.invoke('sessionCrud:setMcpOverrides', sessionId, mcpServerOverrides),
    onChanged: (cb: (sessions: unknown) => void) =>
      t.on('sessionCrud:changed', cb as (v: unknown) => void),
  };
}

// ─── Folder CRUD API ──────────────────────────────────────────────────────────

export function buildFolderCrudApi(t: WebSocketTransport) {
  return {
    list: () => t.invoke('folderCrud:list'),
    create: (name: string) => t.invoke('folderCrud:create', name),
    rename: (id: string, name: string) => t.invoke('folderCrud:rename', id, name),
    delete: (id: string) => t.invoke('folderCrud:delete', id),
    addSession: (folderId: string, sessionId: string) =>
      t.invoke('folderCrud:addSession', folderId, sessionId),
    removeSession: (folderId: string, sessionId: string) =>
      t.invoke('folderCrud:removeSession', folderId, sessionId),
    moveSession: (fromId: string | null, toId: string | null, sessionId: string) =>
      t.invoke('folderCrud:moveSession', fromId, toId, sessionId),
    onChanged: (cb: (folders: unknown) => void) =>
      t.on('folderCrud:changed', cb as (v: unknown) => void),
  };
}

// ─── Pinned Context API ───────────────────────────────────────────────────────

export function buildPinnedContextApi(t: WebSocketTransport) {
  return {
    add: (sessionId: string, item: unknown) =>
      t.invoke('pinnedContext:add', sessionId, item),
    remove: (sessionId: string, itemId: string) =>
      t.invoke('pinnedContext:remove', sessionId, itemId),
    dismiss: (sessionId: string, itemId: string) =>
      t.invoke('pinnedContext:dismiss', sessionId, itemId),
    list: (sessionId: string, includeDismissed?: boolean) =>
      t.invoke('pinnedContext:list', sessionId, includeDismissed),
    onChanged: (cb: (payload: unknown) => void) =>
      t.on('pinnedContext:changed', cb as (v: unknown) => void),
  };
}

// ─── Profile CRUD API ─────────────────────────────────────────────────────────

export function buildProfileCrudApi(t: WebSocketTransport) {
  return {
    list: () => t.invoke('profileCrud:list'),
    upsert: (profile: unknown) => t.invoke('profileCrud:upsert', profile),
    delete: (profileId: string) => t.invoke('profileCrud:delete', profileId),
    setDefault: (projectRoot: string, profileId: string) =>
      t.invoke('profileCrud:setDefault', projectRoot, profileId),
    getDefault: (projectRoot: string) => t.invoke('profileCrud:getDefault', projectRoot),
    export: (profileId: string) => t.invoke('profileCrud:export', profileId),
    import: (json: string) => t.invoke('profileCrud:import', json),
    estimate: (args: { profileId: string; contextTokens: number }) =>
      t.invoke('profileCrud:estimate', args),
    lint: (args: { profile: unknown }) => t.invoke('profileCrud:lint', args),
    onChanged: (cb: (profiles: unknown) => void) =>
      t.on('profileCrud:changed', cb as (v: unknown) => void),
  };
}

// ─── Layout API ───────────────────────────────────────────────────────────────

export function buildLayoutApi(t: WebSocketTransport) {
  return {
    getCustomLayout: (sessionId: string) =>
      t.invoke('layout:getCustomLayout', sessionId),
    setCustomLayout: (sessionId: string, tree: unknown) =>
      t.invoke('layout:setCustomLayout', sessionId, tree),
    deleteCustomLayout: (sessionId: string) =>
      t.invoke('layout:deleteCustomLayout', sessionId),
    promoteToGlobal: (name: string, tree: unknown) =>
      t.invoke('layout:promoteToGlobal', name, tree),
  };
}

// ─── Subagent API ─────────────────────────────────────────────────────────────

export function buildSubagentApi(t: WebSocketTransport) {
  return {
    list: (args: { parentSessionId: string }) => t.invoke('subagent:list', args),
    get: (args: { subagentId: string }) => t.invoke('subagent:get', args),
    liveCount: (args: { parentSessionId: string }) => t.invoke('subagent:liveCount', args),
    costRollup: (args: { parentSessionId: string }) => t.invoke('subagent:costRollup', args),
    cancel: (args: { subagentId: string }) => t.invoke('subagent:cancel', args),
    onUpdated: (cb: (event: unknown) => void) =>
      t.on('subagent:updated', cb as (v: unknown) => void),
  };
}

// ─── Checkpoint API ───────────────────────────────────────────────────────────
// checkpoint:list, delete, onChange are mirrored; create and restore are
// desktop-only (git worktree operations) — documented in docs/mobile-scope.md.

export function buildCheckpointApi(t: WebSocketTransport) {
  return {
    list: (request: unknown) => t.invoke('checkpoint:list', request),
    // create and restore involve git worktree operations — not available in web.
    create: async () => ({
      success: false as const,
      error: 'checkpoint:create: This feature is only available in the desktop app.',
    }),
    restore: async () => ({
      success: false as const,
      error: 'checkpoint:restore: This feature is only available in the desktop app.',
    }),
    delete: (checkpointId: string) => t.invoke('checkpoint:delete', checkpointId),
    onChange: (cb: (threadId: string) => void) =>
      t.on('checkpoint:changed', cb as (v: unknown) => void),
  };
}

// ─── Workspace Read List API ──────────────────────────────────────────────────

export function buildWorkspaceReadListApi(t: WebSocketTransport) {
  return {
    get: (projectRoot: string) => t.invoke('workspaceReadList:get', projectRoot),
    add: (projectRoot: string, filePath: string) =>
      t.invoke('workspaceReadList:add', projectRoot, filePath),
    remove: (projectRoot: string, filePath: string) =>
      t.invoke('workspaceReadList:remove', projectRoot, filePath),
    onChanged: (cb: (payload: unknown) => void) =>
      t.on('workspaceReadList:changed', cb as (v: unknown) => void),
  };
}
