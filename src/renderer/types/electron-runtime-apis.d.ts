import type { PermissionContext } from '@shared/types/permissionContext';

import type {
  AppConfig,
  AppTheme,
  ClaudeCliSettings,
  CodexCliSettings,
  CodexModelOption,
  FileChangeEvent,
  HookPayload,
  IpcResult,
  ReadBinaryFileResult,
  ReadDirResult,
  ReadFileResult,
  SelectFolderResult,
} from './electron-foundation';

export type { PermissionContext };

export interface PtySpawnResult extends IpcResult {
  already?: boolean;
}

export interface PtyCwdResult extends IpcResult {
  cwd?: string;
}

export interface PtyStopRecordingResult extends IpcResult {
  filePath?: string;
  cancelled?: boolean;
}

export interface ActiveSessionInfo {
  id: string;
  cwd: string;
}

export interface ShellState {
  cwd: string;
  lastExitCode: number | null;
  lastCommand: string | null;
  isExecuting: boolean;
}

export interface PtyShellStateResult extends IpcResult {
  cwd?: string;
  lastExitCode?: number | null;
  lastCommand?: string | null;
  isExecuting?: boolean;
}

export interface PtyLinkedThreadResult extends IpcResult {
  threadId?: string | null;
}

export interface PtyLinkedSessionsResult extends IpcResult {
  sessionIds?: string[];
}

export interface PersistedSessionInfo {
  id: string;
  cwd: string;
  shellPath: string | null;
  cols: number;
  rows: number;
  createdAt: number;
  lastSeenAt: number;
}

export interface PtyAPI {
  spawn: (
    id: string,
    options?: { cwd?: string; cols?: number; rows?: number; startupCommand?: string },
  ) => Promise<PtySpawnResult>;
  spawnClaude: (
    id: string,
    options?: {
      cwd?: string;
      cols?: number;
      rows?: number;
      initialPrompt?: string;
      cliOverrides?: Partial<ClaudeCliSettings>;
      resumeMode?: string;
      /** Provider:model override (e.g. 'minimax:MiniMax-M2.7') */
      providerModel?: string;
    },
  ) => Promise<PtySpawnResult>;
  spawnCodex: (
    id: string,
    options?: {
      cwd?: string;
      cols?: number;
      rows?: number;
      initialPrompt?: string;
      cliOverrides?: Partial<CodexCliSettings>;
      resumeThreadId?: string;
    },
  ) => Promise<PtySpawnResult>;
  write: (id: string, data: string) => Promise<IpcResult>;
  resize: (id: string, cols: number, rows: number) => Promise<IpcResult>;
  kill: (id: string) => Promise<IpcResult>;
  getCwd: (id: string) => Promise<PtyCwdResult>;
  listSessions: () => Promise<ActiveSessionInfo[]>;
  startRecording: (id: string) => Promise<IpcResult>;
  stopRecording: (id: string) => Promise<PtyStopRecordingResult>;
  onData: (id: string, callback: (data: string) => void) => () => void;
  onExit: (
    id: string,
    callback: (result: { exitCode: number | null; signal: number | null }) => void,
  ) => () => void;
  onRecordingState: (id: string, callback: (state: { recording: boolean }) => void) => () => void;
  /**
   * Fires when the PtyHost utility process crashes and the session is lost.
   * Payload includes the reason, exit code, and recent scrollback captured
   * from `terminalOutputBuffer` before the host died.
   */
  onDisconnected: (
    id: string,
    callback: (info: { reason: string; exitCode: number; scrollback: string[] }) => void,
  ) => () => void;
  getShellState: (id: string) => Promise<PtyShellStateResult>;
  listPersistedSessions: () => Promise<PersistedSessionInfo[]>;
  restoreSession: (id: string) => Promise<IpcResult>;
  discardPersistedSessions: () => Promise<IpcResult>;
  /** Wave 21 Phase G — link a running terminal to a chat thread. */
  linkToThread: (sessionId: string, threadId: string) => Promise<IpcResult>;
  /** Wave 21 Phase G — get the thread ID linked to a terminal, or null. */
  getLinkedThread: (sessionId: string) => Promise<PtyLinkedThreadResult>;
  /** Wave 21 Phase G — get all session IDs linked to a thread. */
  getLinkedSessionIds: (threadId: string) => Promise<PtyLinkedSessionsResult>;
}

export interface CodexAPI {
  listModels: () => Promise<CodexModelOption[]>;
  resolveThreadId: (args: { cwd: string; spawnedAfter: number }) => Promise<{
    success: boolean;
    threadId?: string;
    error?: string;
  }>;
}

export interface ConfigExportResult extends IpcResult {
  filePath?: string;
  cancelled?: boolean;
}

export interface ConfigImportResult extends IpcResult {
  config?: AppConfig;
  cancelled?: boolean;
}

export interface ConfigOpenFileResult extends IpcResult {
  filePath?: string;
}

export interface ConfigAPI {
  getAll: () => Promise<AppConfig>;
  get: <K extends keyof AppConfig>(key: K) => Promise<AppConfig[K]>;
  set: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => Promise<IpcResult>;
  export: () => Promise<ConfigExportResult>;
  import: () => Promise<ConfigImportResult>;
  openSettingsFile: () => Promise<ConfigOpenFileResult>;
  onExternalChange: (callback: (config: AppConfig) => void) => () => void;
}

export interface ShowImageDialogResult extends IpcResult {
  cancelled?: boolean;
  attachments?: import('@shared/types/agentChat').ImageAttachment[];
}

export interface SearchOptions {
  isRegex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  includeGlob?: string;
  excludeGlob?: string;
  maxResults?: number;
}

export interface SearchResultItem {
  filePath: string;
  line: number;
  column: number;
  lineContent: string;
  matchLength: number;
}

export interface SearchResultResponse extends IpcResult {
  results?: SearchResultItem[];
  truncated?: boolean;
}

export interface FilesAPI {
  writeFile: (filePath: string, data: Uint8Array) => Promise<IpcResult>;
  saveFile: (filePath: string, content: string) => Promise<IpcResult>;
  readFile: (filePath: string) => Promise<ReadFileResult>;
  readBinaryFile: (filePath: string) => Promise<ReadBinaryFileResult>;
  readDir: (dirPath: string) => Promise<ReadDirResult>;
  watchDir: (dirPath: string) => Promise<IpcResult>;
  unwatchDir: (dirPath: string) => Promise<IpcResult>;
  selectFolder: () => Promise<SelectFolderResult>;
  openFile: () => Promise<SelectFolderResult>;
  createFile: (filePath: string, content?: string) => Promise<IpcResult>;
  mkdir: (dirPath: string) => Promise<IpcResult>;
  rename: (oldPath: string, newPath: string) => Promise<IpcResult>;
  copyFile: (sourcePath: string, destPath: string) => Promise<IpcResult>;
  delete: (targetPath: string) => Promise<IpcResult>;
  softDelete: (targetPath: string) => Promise<IpcResult & { tempPath?: string }>;
  restoreDeleted: (tempPath: string, originalPath: string) => Promise<IpcResult>;
  showImageDialog: () => Promise<ShowImageDialogResult>;
  onFileChange: (callback: (change: FileChangeEvent) => void) => () => void;
  search: (root: string, query: string, options?: SearchOptions) => Promise<SearchResultResponse>;
}

export interface HooksAPI {
  onAgentEvent: (callback: (event: HookPayload) => void) => () => void;
  onToolCall: (callback: (event: HookPayload) => void) => () => void;
}

export interface ApprovalRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  sessionId: string;
  timestamp: number;
  permissionContext?: PermissionContext;
}

export interface ApprovalResolved {
  requestId: string;
  decision: 'approve' | 'reject';
}

export interface ApprovalMemoryEntry {
  hash: string;
  toolName: string;
  keyPreview: string;
}

export interface ApprovalMemoryStore {
  alwaysAllow: ApprovalMemoryEntry[];
  alwaysDeny: ApprovalMemoryEntry[];
}

export interface ApprovalListMemoryResult extends IpcResult {
  entries?: ApprovalMemoryStore;
}

export interface ApprovalAPI {
  respond: (
    requestId: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ) => Promise<IpcResult>;
  alwaysAllow: (sessionId: string, toolName: string) => Promise<IpcResult>;
  /** Wave 26 Phase E — persist a per-user allow/deny decision for a (toolName, key) pair. */
  remember: (toolName: string, key: string, decision: 'allow' | 'deny') => Promise<IpcResult>;
  /** Wave 26 Phase E — list all remembered allow/deny entries (for Settings UI). */
  listMemory: () => Promise<ApprovalListMemoryResult>;
  /** Wave 26 Phase E — revoke a remembered entry by hash. */
  forget: (hash: string) => Promise<IpcResult>;
  onRequest: (callback: (request: ApprovalRequest) => void) => () => void;
  onResolved: (callback: (resolved: ApprovalResolved) => void) => () => void;
  /** Wave 26 Phase E — fires when the approval memory store changes. */
  onMemoryChanged: (callback: () => void) => () => void;
}

export type MenuEvent =
  | 'menu:open-folder'
  | 'menu:new-terminal'
  | 'menu:command-palette'
  | 'menu:settings';

export interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  force?: boolean;
}

export interface NotifyResult extends IpcResult {
  skipped?: boolean;
}

export interface StreamCompletionNotifyOptions {
  title: string;
  body: string;
  threadId?: string;
}

export interface SystemInfo {
  electron: string;
  chrome: string;
  node: string;
}

export interface AppAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<NodeJS.Platform>;
  getSystemInfo: () => SystemInfo;
  openExternal: (url: string) => Promise<IpcResult>;
  setTitleBarOverlay: (color: string, symbolColor: string) => Promise<IpcResult>;
  notify: (options: NotifyOptions) => Promise<NotifyResult>;
  /** Wave 22 Phase E — desktop notification on chat stream completion (unfocused-only). */
  showStreamCompletionNotification: (
    options: StreamCompletionNotifyOptions,
  ) => Promise<IpcResult>;
  rebuildAndRestart: () => Promise<IpcResult>;
  rebuildWeb: () => Promise<IpcResult>;
  onMenuEvent: (callback: (event: MenuEvent) => void) => () => void;
  /** Custom window controls (frame: false on Windows) */
  minimizeWindow: () => Promise<IpcResult>;
  toggleMaximizeWindow: () => Promise<IpcResult>;
  closeWindow: () => Promise<IpcResult>;

  /** Window and app actions */
  newWindow: () => Promise<IpcResult>;
  toggleFullscreen: () => Promise<IpcResult>;
  toggleDevTools: () => Promise<IpcResult>;
  openLogsFolder: () => Promise<IpcResult>;
  zoomIn: () => Promise<IpcResult>;
  zoomOut: () => Promise<IpcResult>;
  zoomReset: () => Promise<IpcResult>;
  /** Subscribe to startup failure notifications for critical services */
  onStartupWarning: (callback: (payload: { name: string; message: string }) => void) => () => void;
  /** Subscribe to thread:// permalink navigation events from main. */
  onNavigateToPermalink: (callback: (payload: { threadId: string; messageId?: string }) => void) => () => void;
  /** Wave 29 Phase B — open a native save dialog and write content to the chosen path. */
  saveFileDialog: (defaultName: string, content: string) => Promise<IpcResult & { cancelled?: boolean; filePath?: string }>;
}

export interface ShellAPI {
  showItemInFolder: (fullPath: string) => Promise<IpcResult>;
  openExtensionsFolder: () => Promise<IpcResult>;
}

export interface ThemeAPI {
  get: () => Promise<AppTheme>;
  set: (theme: AppTheme) => Promise<IpcResult>;
  onChange: (callback: (theme: AppTheme) => void) => () => void;
}
