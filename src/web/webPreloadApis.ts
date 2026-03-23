/**
 * webPreloadApis.ts — electronAPI namespace builders (first half).
 * Exports: desktopOnlyStub, desktopOnlyNoop, buildPtyApis, buildCoreApis.
 * Second half of APIs lives in webPreloadApisSupplemental.ts.
 */

import type { WebSocketTransport } from './webPreloadTransport';

// ─── Desktop-Only Stubs ──────────────────────────────────────────────────────

const DESKTOP_ONLY_ERROR = 'This feature is only available in the desktop app.';

export function desktopOnlyStub(channel: string) {
  return async () => ({
    success: false,
    cancelled: true,
    error: `${channel}: ${DESKTOP_ONLY_ERROR}`,
  });
}

export function desktopOnlyNoop() {
  return async () => ({ success: true });
}

// ─── PTY + Codex APIs ────────────────────────────────────────────────────────

export function buildPtyApis(t: WebSocketTransport) {
  const ptyAPI = {
    spawn: (id: string, options: unknown) => t.invoke('pty:spawn', id, options),
    spawnClaude: (id: string, options: unknown) => t.invoke('pty:spawnClaude', id, options),
    spawnCodex: (id: string, options: unknown) => t.invoke('pty:spawnCodex', id, options),
    write: (id: string, data: string) => t.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => t.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => t.invoke('pty:kill', id),
    getCwd: (id: string) => t.invoke('pty:getCwd', id),
    startRecording: (id: string) => t.invoke('pty:startRecording', id),
    stopRecording: (id: string) => t.invoke('pty:stopRecording', id),
    listSessions: () => t.invoke('pty:listSessions'),
    onData: (id: string, cb: (data: string) => void) =>
      t.on(`pty:data:${id}`, cb as (v: unknown) => void),
    onExit: (
      id: string,
      cb: (result: { exitCode: number | null; signal: number | null }) => void,
    ) => t.on(`pty:exit:${id}`, cb as (v: unknown) => void),
    onRecordingState: (id: string, cb: (state: { recording: boolean }) => void) =>
      t.on(`pty:recordingState:${id}`, cb as (v: unknown) => void),
  };
  const codexAPI = { listModels: () => t.invoke('codex:listModels') };
  return { ptyAPI, codexAPI };
}

// ─── Config API ──────────────────────────────────────────────────────────────

export function buildConfigApi(t: WebSocketTransport) {
  return {
    getAll: () => t.invoke('config:getAll'),
    get: (key: string) => t.invoke('config:get', key),
    set: (key: string, value: unknown) => t.invoke('config:set', key, value),
    export: desktopOnlyStub('config:export'),
    import: desktopOnlyStub('config:import'),
    openSettingsFile: desktopOnlyStub('config:openSettingsFile'),
    onExternalChange: (cb: (config: unknown) => void) => t.on('config:externalChange', cb),
  };
}

// ─── Files API ───────────────────────────────────────────────────────────────

export function buildFilesApi(t: WebSocketTransport) {
  return {
    writeFile: (filePath: string, data: string) => t.invoke('files:writeFile', filePath, data),
    saveFile: (filePath: string, content: string) => t.invoke('files:saveFile', filePath, content),
    readFile: (filePath: string) => t.invoke('files:readFile', filePath),
    readBinaryFile: (filePath: string) => t.invoke('files:readBinaryFile', filePath),
    readDir: (dirPath: string) => t.invoke('files:readDir', dirPath),
    watchDir: (dirPath: string) => t.invoke('files:watchDir', dirPath),
    unwatchDir: (dirPath: string) => t.invoke('files:unwatchDir', dirPath),
    selectFolder: desktopOnlyStub('files:selectFolder'),
    createFile: (filePath: string, content?: string) =>
      t.invoke('files:createFile', filePath, content),
    mkdir: (dirPath: string) => t.invoke('files:mkdir', dirPath),
    rename: (oldPath: string, newPath: string) => t.invoke('files:rename', oldPath, newPath),
    copyFile: (src: string, dest: string) => t.invoke('files:copyFile', src, dest),
    delete: (targetPath: string) => t.invoke('files:delete', targetPath),
    softDelete: (targetPath: string) => t.invoke('files:softDelete', targetPath),
    restoreDeleted: (tempPath: string, originalPath: string) =>
      t.invoke('files:restoreDeleted', tempPath, originalPath),
    showImageDialog: desktopOnlyStub('files:showImageDialog'),
    onFileChange: (cb: (change: unknown) => void) => t.on('files:change', cb),
  };
}

// ─── Hooks API ───────────────────────────────────────────────────────────────

export function buildHooksApi(t: WebSocketTransport) {
  return {
    onAgentEvent: (cb: (payload: unknown) => void) => t.on('hooks:event', cb),
    onToolCall: (cb: (payload: unknown) => void) => {
      return t.on('hooks:event', (payload: unknown) => {
        const p = payload as { type?: string };
        if (p.type === 'pre_tool_use' || p.type === 'post_tool_use') cb(payload);
      });
    },
  };
}

/** @deprecated Use buildConfigApi / buildFilesApi / buildHooksApi directly */
export function buildDataApis(t: WebSocketTransport) {
  return {
    configAPI: buildConfigApi(t),
    filesAPI: buildFilesApi(t),
    hooksAPI: buildHooksApi(t),
  };
}

// ─── App API ─────────────────────────────────────────────────────────────────

const MENU_EVENTS = [
  'menu:open-folder',
  'menu:new-terminal',
  'menu:command-palette',
  'menu:settings',
];

export function buildAppApi(t: WebSocketTransport) {
  return {
    getVersion: () => t.invoke('app:getVersion'),
    getPlatform: () => t.invoke('app:getPlatform'),
    openExternal: (url: string) => {
      window.open(url, '_blank');
      return Promise.resolve({ success: true });
    },
    setTitleBarOverlay: desktopOnlyNoop(),
    notify: (options: unknown) => t.invoke('app:notify', options),
    rebuildWeb: () => t.invoke('app:rebuildWeb'),
    onMenuEvent: (cb: (event: string) => void) => {
      const cleanups = MENU_EVENTS.map((e) => t.on(e, () => cb(e)));
      return () => cleanups.forEach((c) => c());
    },
    minimizeWindow: desktopOnlyNoop(),
    toggleMaximizeWindow: desktopOnlyNoop(),
    closeWindow: desktopOnlyNoop(),
    newWindow: desktopOnlyNoop(),
    toggleFullscreen: desktopOnlyNoop(),
    toggleDevTools: desktopOnlyNoop(),
    openLogsFolder: desktopOnlyNoop(),
    zoomIn: async () => {
      document.body.style.zoom = String(parseFloat(document.body.style.zoom || '1') + 0.1);
      return { success: true };
    },
    zoomOut: async () => {
      const cur = parseFloat(document.body.style.zoom || '1');
      document.body.style.zoom = String(Math.max(0.5, cur - 0.1));
      return { success: true };
    },
    zoomReset: async () => {
      document.body.style.zoom = '1';
      return { success: true };
    },
  };
}

// ─── Shell + Theme APIs ───────────────────────────────────────────────────────

export function buildShellThemeApis(t: WebSocketTransport) {
  const shellAPI = {
    showItemInFolder: desktopOnlyNoop(),
    openExtensionsFolder: desktopOnlyNoop(),
  };
  const themeAPI = {
    get: () => t.invoke('theme:get'),
    set: (theme: string) => t.invoke('theme:set', theme),
    onChange: (cb: (theme: unknown) => void) => t.on('theme:changed', cb),
  };
  return { shellAPI, themeAPI };
}

/** @deprecated Use buildAppApi / buildShellThemeApis directly */
export function buildAppApis(t: WebSocketTransport) {
  return { appAPI: buildAppApi(t), ...buildShellThemeApis(t) };
}

// ─── Git API ─────────────────────────────────────────────────────────────────

function buildGitReadApi(t: WebSocketTransport) {
  return {
    isRepo: (root: string) => t.invoke('git:isRepo', root),
    status: (root: string) => t.invoke('git:status', root),
    branch: (root: string) => t.invoke('git:branch', root),
    diff: (root: string, filePath: string) => t.invoke('git:diff', root, filePath),
    diffRaw: (root: string, filePath: string) => t.invoke('git:diffRaw', root, filePath),
    blame: (root: string, filePath: string) => t.invoke('git:blame', root, filePath),
    log: (root: string, filePath?: string, offset?: number) =>
      t.invoke('git:log', root, filePath, offset ?? 0),
    show: (root: string, hash: string, filePath: string) =>
      t.invoke('git:show', root, hash, filePath),
    branches: (root: string) => t.invoke('git:branches', root),
    statusDetailed: (root: string) => t.invoke('git:statusDetailed', root),
    diffReview: (root: string, commitHash?: string, filePaths?: string[]) =>
      t.invoke('git:diffReview', root, commitHash, filePaths),
    diffCached: (root: string, commitHash: string, filePaths?: string[]) =>
      t.invoke('git:diffCached', root, commitHash, filePaths),
    fileAtCommit: (root: string, commitHash: string, filePath: string) =>
      t.invoke('git:fileAtCommit', root, commitHash, filePath),
    diffBetween: (root: string, fromHash: string, toHash: string) =>
      t.invoke('git:diffBetween', root, fromHash, toHash),
    changedFilesBetween: (root: string, fromHash: string, toHash: string) =>
      t.invoke('git:changedFilesBetween', root, fromHash, toHash),
    dirtyCount: (root: string) => t.invoke('git:dirtyCount', root),
  };
}

function buildGitWriteApi(t: WebSocketTransport) {
  return {
    checkout: (root: string, branch: string) => t.invoke('git:checkout', root, branch),
    stage: (root: string, filePath: string) => t.invoke('git:stage', root, filePath),
    unstage: (root: string, filePath: string) => t.invoke('git:unstage', root, filePath),
    stageAll: (root: string) => t.invoke('git:stageAll', root),
    unstageAll: (root: string) => t.invoke('git:unstageAll', root),
    commit: (root: string, message: string) => t.invoke('git:commit', root, message),
    discardFile: (root: string, filePath: string) => t.invoke('git:discardFile', root, filePath),
    snapshot: (root: string) => t.invoke('git:snapshot', root),
    applyHunk: (root: string, patchContent: string) =>
      t.invoke('git:applyHunk', root, patchContent),
    revertHunk: (root: string, patchContent: string) =>
      t.invoke('git:revertHunk', root, patchContent),
    stageHunk: (root: string, patchContent: string) =>
      t.invoke('git:stageHunk', root, patchContent),
    revertFile: (root: string, commitHash: string, filePath: string) =>
      t.invoke('git:revertFile', root, commitHash, filePath),
    restoreSnapshot: (root: string, commitHash: string) =>
      t.invoke('git:restoreSnapshot', root, commitHash),
    createSnapshot: (root: string, label?: string) => t.invoke('git:createSnapshot', root, label),
  };
}

export function buildGitApi(t: WebSocketTransport) {
  return { ...buildGitReadApi(t), ...buildGitWriteApi(t) };
}
