import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import {
  ExitNotification,
  InitializeRequest,
  InitializedNotification,
  PublishDiagnosticsNotification,
  ShutdownRequest,
  type InitializeParams,
} from 'vscode-languageserver-protocol'
import {
  convertDiagnostics,
  filePathToUri,
  getServerCommand,
  serverKey,
  uriToFilePath,
} from './lspHelpers'
import {
  broadcastStatusChange,
  getMainWindow,
  servers,
  setMainWindow,
} from './lspState'
import type { LspActionResult, LspDiagnostic, LspServerInstance } from './lspTypes'

const MAX_RESTART_ATTEMPTS = 3
const RESTART_COOLDOWN_MS = 10_000

function getExistingServerResult(key: string): LspActionResult | null {
  const existing = servers.get(key)
  if (!existing) {
    return null
  }
  if (existing.status === 'running' || existing.status === 'starting') {
    return { success: true }
  }
  return null
}

function spawnServerProcess(
  root: string,
  command: string,
  args: string[]
): ChildProcess {
  return spawn(command, args, {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    shell: process.platform === 'win32',
  })
}

function createConnection(processHandle: ChildProcess): MessageConnection {
  if (!processHandle.stdout || !processHandle.stdin) {
    processHandle.kill()
    throw new Error('Failed to create stdio pipes for language server')
  }
  return createMessageConnection(
    new StreamMessageReader(processHandle.stdout),
    new StreamMessageWriter(processHandle.stdin)
  )
}

function createServerInstance(
  processHandle: ChildProcess,
  connection: MessageConnection,
  root: string,
  language: string
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
  }
}

function canRestart(instance: LspServerInstance, now: number): boolean {
  return (
    instance.restartCount < MAX_RESTART_ATTEMPTS &&
    now - instance.lastRestartTime > RESTART_COOLDOWN_MS
  )
}

function recordRestart(root: string, language: string, previous: LspServerInstance, now: number): void {
  const restarted = servers.get(serverKey(root, language))
  if (restarted) {
    restarted.restartCount = previous.restartCount + 1
    restarted.lastRestartTime = now
  }
}

function scheduleRestart(root: string, language: string, previous: LspServerInstance): void {
  const now = Date.now()
  if (!canRestart(previous, now)) {
    return
  }

  const nextAttempt = previous.restartCount + 1
  console.log(`[LSP] Auto-restarting ${language} server (attempt ${nextAttempt})`)
  setTimeout(() => {
    startServer(root, language)
      .then((result) => {
        if (result.success) {
          recordRestart(root, language, previous, now)
        }
      })
      .catch((error) => { console.error(`[LSP] Auto-restart failed for ${language} server:`, error) })
  }, 1000 * nextAttempt)
}

function handleProcessExit(
  instance: LspServerInstance,
  key: string,
  code: number | null,
  signal: NodeJS.Signals | null
): void {
  console.log(`[LSP] Server ${instance.language} exited: code=${code}, signal=${signal}`)
  const wasRunning = instance.status === 'running'
  instance.status = 'stopped'
  servers.delete(key)
  broadcastStatusChange()

  if (wasRunning && code !== 0 && code !== null) {
    scheduleRestart(instance.root, instance.language, instance)
  }
}

function attachProcessListeners(instance: LspServerInstance, key: string): void {
  instance.process.on('error', (error) => {
    console.error(`[LSP] Server ${instance.language} error:`, error.message)
    instance.status = 'error'
    broadcastStatusChange()
  })

  instance.process.on('exit', (code, signal) => {
    handleProcessExit(instance, key, code, signal)
  })

  instance.process.stderr?.on('data', (data: Buffer) => {
    console.error(`[LSP] ${instance.language} stderr:`, data.toString().trim())
  })
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
  }
}

function pushDiagnostics(filePath: string, diagnostics: LspDiagnostic[]): void {
  const window = getMainWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('lsp:diagnostics:push', { filePath, diagnostics })
  }
}

function registerDiagnosticsListener(instance: LspServerInstance): void {
  instance.connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
    const filePath = uriToFilePath(params.uri)
    const diagnostics = convertDiagnostics(params.diagnostics)
    instance.diagnosticsCache.set(params.uri, diagnostics)
    pushDiagnostics(filePath, diagnostics)
  })
}

async function initializeConnection(instance: LspServerInstance): Promise<void> {
  instance.connection.listen()
  await instance.connection.sendRequest(
    InitializeRequest.type,
    createInitializeParams(instance.root)
  )
  instance.connection.sendNotification(InitializedNotification.type, {})
  registerDiagnosticsListener(instance)
}

async function attemptGracefulShutdown(instance: LspServerInstance): Promise<void> {
  if (instance.status !== 'running') {
    return
  }

  try {
    await Promise.race([
      instance.connection.sendRequest(ShutdownRequest.type),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
      }),
    ])
    instance.connection.sendNotification(ExitNotification.type)
  } catch {
    // Ignore and fall through to forced cleanup.
  }
}

function forceKill(instance: LspServerInstance): void {
  try {
    instance.process.kill('SIGKILL')
  } catch {
    // Best effort cleanup.
  }
}

export async function startServer(root: string, language: string): Promise<LspActionResult> {
  const key = serverKey(root, language)
  const existing = getExistingServerResult(key)
  if (existing) {
    return existing
  }

  const command = getServerCommand(language)
  if (!command) {
    return { success: false, error: `No language server configured for "${language}"` }
  }

  try {
    const processHandle = spawnServerProcess(root, command.command, command.args)
    const connection = createConnection(processHandle)
    const instance = createServerInstance(processHandle, connection, root, language)
    servers.set(key, instance)
    attachProcessListeners(instance, key)
    await initializeConnection(instance)
    instance.status = 'running'
    broadcastStatusChange()
    console.log(`[LSP] Server ${language} started for ${root}`)
    return { success: true }
  } catch (error) {
    servers.delete(key)
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[LSP] Failed to start ${language} server:`, message)
    return { success: false, error: message }
  }
}

export async function stopServer(root: string, language: string): Promise<LspActionResult> {
  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance) {
    return { success: true }
  }

  try {
    await attemptGracefulShutdown(instance)
    instance.connection.dispose()
    instance.process.kill()
    instance.status = 'stopped'
    servers.delete(key)
    broadcastStatusChange()
    return { success: true }
  } catch (error) {
    forceKill(instance)
    servers.delete(key)
    broadcastStatusChange()
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function stopAllServers(): Promise<void> {
  const stopPromises = Array.from(servers.values()).map((instance) =>
    stopServer(instance.root, instance.language).catch((error) => { console.error(`[LSP] Failed to stop ${instance.language} server:`, error) })
  )
  await Promise.all(stopPromises)
}

export { setMainWindow }
