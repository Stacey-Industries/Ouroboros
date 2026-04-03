import { type ChildProcess, spawn } from 'child_process';
import path from 'path';
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import {
  ExitNotification,
  InitializedNotification,
  type InitializeParams,
  InitializeRequest,
  PublishDiagnosticsNotification,
  ShutdownRequest,
} from 'vscode-languageserver-protocol';

// vscode-languageserver-protocol ProtocolXxxType has extra generic params incompatible
// with vscode-jsonrpc's overloads. Use method strings to bypass overload resolution.
const LSP_INITIALIZE = InitializeRequest.type.method;
const LSP_INITIALIZED = InitializedNotification.type.method;
const LSP_PUBLISH_DIAGNOSTICS = PublishDiagnosticsNotification.type.method;
const LSP_SHUTDOWN = ShutdownRequest.type.method;
const LSP_EXIT = ExitNotification.type.method;

import log from './logger';
import {
  convertDiagnostics,
  filePathToUri,
  getServerCommand,
  serverKey,
  uriToFilePath,
} from './lspHelpers';
import { broadcastStatusChange, getMainWindow, servers, setMainWindow } from './lspState';
import type { LspActionResult, LspDiagnostic, LspServerInstance } from './lspTypes';
import { broadcastToWebClients } from './web/webServer';

const MAX_RESTART_ATTEMPTS = 3;
const RESTART_COOLDOWN_MS = 10_000;

function getExistingServerResult(key: string): LspActionResult | null {
  const existing = servers.get(key);
  if (!existing) {
    return null;
  }
  if (existing.status === 'running' || existing.status === 'starting') {
    return { success: true };
  }
  return null;
}

function spawnServerProcess(root: string, command: string, args: string[]): ChildProcess {
  return spawn(command, args, {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    shell: process.platform === 'win32',
  });
}

function createConnection(processHandle: ChildProcess): MessageConnection {
  if (!processHandle.stdout || !processHandle.stdin) {
    processHandle.kill();
    throw new Error('Failed to create stdio pipes for language server');
  }
  return createMessageConnection(
    new StreamMessageReader(processHandle.stdout),
    new StreamMessageWriter(processHandle.stdin),
  );
}

function createServerInstance(
  processHandle: ChildProcess,
  connection: MessageConnection,
  root: string,
  language: string,
): LspServerInstance {
  return {
    process: processHandle,
    connection,
    root,
    language,
    status: 'starting',
    documentVersions: new Map(),
    diagnosticsCache: new Map(),
    restartCount: 0,
    lastRestartTime: Date.now(),
  };
}

function canRestart(instance: LspServerInstance, now: number): boolean {
  return (
    instance.restartCount < MAX_RESTART_ATTEMPTS &&
    now - instance.lastRestartTime > RESTART_COOLDOWN_MS
  );
}

function recordRestart(
  root: string,
  language: string,
  previous: LspServerInstance,
  now: number,
): void {
  const restarted = servers.get(serverKey(root, language));
  if (restarted) {
    restarted.restartCount = previous.restartCount + 1;
    restarted.lastRestartTime = now;
  }
}

function scheduleRestart(root: string, language: string, previous: LspServerInstance): void {
  const now = Date.now();
  if (!canRestart(previous, now)) {
    return;
  }

  const nextAttempt = previous.restartCount + 1;
  log.info(`Auto-restarting ${language} server (attempt ${nextAttempt})`);
  setTimeout(() => {
    startServer(root, language)
      .then((result) => {
        if (result.success) {
          recordRestart(root, language, previous, now);
        }
      })
      .catch((error) => {
        log.error(`Auto-restart failed for ${language} server:`, error);
      });
  }, 1000 * nextAttempt);
}

function handleProcessExit(
  instance: LspServerInstance,
  key: string,
  code: number | null,
  signal: NodeJS.Signals | null,
): void {
  log.info(`Server ${instance.language} exited: code=${code}, signal=${signal}`);
  const wasRunning = instance.status === 'running';
  instance.status = 'stopped';
  servers.delete(key);
  broadcastStatusChange();

  if (wasRunning && code !== 0 && code !== null) {
    scheduleRestart(instance.root, instance.language, instance);
  }
}

function attachProcessListeners(instance: LspServerInstance, key: string): void {
  instance.process.on('error', (error) => {
    log.error(`Server ${instance.language} error:`, error.message);
    instance.status = 'error';
    broadcastStatusChange();
  });

  instance.process.on('exit', (code, signal) => {
    handleProcessExit(instance, key, code, signal);
  });

  instance.process.stderr?.on('data', (data: Buffer) => {
    log.error(`${instance.language} stderr:`, data.toString().trim());
  });
}

function createInitializeParams(root: string): InitializeParams {
  return {
    processId: process.pid,
    rootUri: filePathToUri(root),
    rootPath: root,
    capabilities: {
      textDocument: {
        completion: {
          completionItem: {
            snippetSupport: false,
            documentationFormat: ['plaintext', 'markdown'],
          },
        },
        hover: {
          contentFormat: ['plaintext', 'markdown'],
        },
        definition: {},
        publishDiagnostics: {
          relatedInformation: false,
        },
        synchronization: {
          didSave: true,
          willSave: false,
          willSaveWaitUntil: false,
          dynamicRegistration: false,
        },
      },
      workspace: {
        workspaceFolders: true,
      },
    },
    workspaceFolders: [{ uri: filePathToUri(root), name: path.basename(root) }],
  };
}

function pushDiagnostics(filePath: string, diagnostics: LspDiagnostic[]): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send('lsp:diagnostics:push', { filePath, diagnostics });
  }
  broadcastToWebClients('lsp:diagnostics:push', { filePath, diagnostics });
}

function registerDiagnosticsListener(instance: LspServerInstance): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance.connection.onNotification(LSP_PUBLISH_DIAGNOSTICS, (params: any) => {
    const filePath = uriToFilePath(params.uri);
    const diagnostics = convertDiagnostics(params.diagnostics);
    instance.diagnosticsCache.set(params.uri, diagnostics);
    pushDiagnostics(filePath, diagnostics);
  });
}

async function initializeConnection(instance: LspServerInstance): Promise<void> {
  instance.connection.listen();
  await instance.connection.sendRequest(
    LSP_INITIALIZE,
    createInitializeParams(instance.root),
  );
  instance.connection.sendNotification(LSP_INITIALIZED, {});
  registerDiagnosticsListener(instance);
}

async function attemptGracefulShutdown(instance: LspServerInstance): Promise<void> {
  if (instance.status !== 'running') {
    return;
  }

  try {
    await Promise.race([
      instance.connection.sendRequest(LSP_SHUTDOWN),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), 5000);
      }),
    ]);
    instance.connection.sendNotification(LSP_EXIT);
  } catch {
    // Ignore and fall through to forced cleanup.
  }
}

function forceKill(instance: LspServerInstance): void {
  try {
    instance.process.kill('SIGKILL');
  } catch {
    // Best effort cleanup.
  }
}

export async function startServer(root: string, language: string): Promise<LspActionResult> {
  const key = serverKey(root, language);
  const existing = getExistingServerResult(key);
  if (existing) {
    return existing;
  }

  const command = getServerCommand(language);
  if (!command) {
    return { success: false, error: `No language server configured for "${language}"` };
  }

  let processHandle: ReturnType<typeof spawnServerProcess> | undefined;
  try {
    processHandle = spawnServerProcess(root, command.command, command.args);
    const connection = createConnection(processHandle);
    const instance = createServerInstance(processHandle, connection, root, language);
    servers.set(key, instance);
    attachProcessListeners(instance, key);
    await initializeConnection(instance);
    instance.status = 'running';
    broadcastStatusChange();
    log.info(`Server ${language} started for ${root}`);
    return { success: true };
  } catch (error) {
    servers.delete(key);
    // Kill orphaned process + connection to prevent fd leak
    if (processHandle) {
      try { processHandle.kill(); } catch { /* already dead */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to start ${language} server:`, message);
    return { success: false, error: message };
  }
}

export async function stopServer(root: string, language: string): Promise<LspActionResult> {
  const key = serverKey(root, language);
  const instance = servers.get(key);
  if (!instance) {
    return { success: true };
  }

  try {
    await attemptGracefulShutdown(instance);
    instance.connection.dispose();
    instance.process.kill();
    instance.status = 'stopped';
    servers.delete(key);
    broadcastStatusChange();
    return { success: true };
  } catch (error) {
    forceKill(instance);
    servers.delete(key);
    broadcastStatusChange();
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopAllServers(): Promise<void> {
  const stopPromises = Array.from(servers.values()).map((instance) =>
    stopServer(instance.root, instance.language).catch((error) => {
      log.error(`Failed to stop ${instance.language} server:`, error);
    }),
  );
  await Promise.all(stopPromises);
}

export { setMainWindow };
