/**
 * lsp.ts — Language Server Protocol client manager for the main process.
 *
 * Spawns language servers as child processes, communicates via JSON-RPC over stdio,
 * and exposes LSP features (completion, hover, definition, diagnostics) to the renderer via IPC.
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { BrowserWindow } from 'electron'
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from 'vscode-jsonrpc/node'
import {
  InitializeRequest,
  InitializeParams,
  InitializedNotification,
  ShutdownRequest,
  ExitNotification,
  DidOpenTextDocumentNotification,
  DidChangeTextDocumentNotification,
  DidCloseTextDocumentNotification,
  CompletionRequest,
  HoverRequest,
  DefinitionRequest,
  PublishDiagnosticsNotification,
  TextDocumentSyncKind,
  CompletionItemKind,
  DiagnosticSeverity,
  type CompletionItem as LspCompletionItem,
  type Diagnostic,
  type Location,
  type MarkupContent,
  type CompletionList,
} from 'vscode-languageserver-protocol'
import { getConfigValue } from './config'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompletionItem {
  label: string
  kind: string
  detail?: string
  insertText?: string
  documentation?: string
}

export interface LspLocation {
  filePath: string
  line: number
  character: number
}

export interface LspDiagnostic {
  message: string
  severity: 'error' | 'warning' | 'info' | 'hint'
  range: { startLine: number; startChar: number; endLine: number; endChar: number }
}

type ServerStatus = 'starting' | 'running' | 'error' | 'stopped'

interface LspServerInstance {
  process: ChildProcess
  connection: MessageConnection
  root: string
  language: string
  status: ServerStatus
  /** Document version counters for didChange notifications */
  documentVersions: Map<string, number>
  /** Cached diagnostics per file URI */
  diagnosticsCache: Map<string, LspDiagnostic[]>
  /** Restart attempts for crash recovery */
  restartCount: number
  lastRestartTime: number
}

// ─── Default server commands by language ──────────────────────────────────────

const DEFAULT_SERVER_COMMANDS: Record<string, { command: string; args: string[] }> = {
  typescript: { command: 'typescript-language-server', args: ['--stdio'] },
  javascript: { command: 'typescript-language-server', args: ['--stdio'] },
  python: { command: 'pylsp', args: [] },
  rust: { command: 'rust-analyzer', args: [] },
  go: { command: 'gopls', args: ['serve'] },
  css: { command: 'vscode-css-language-server', args: ['--stdio'] },
  html: { command: 'vscode-html-language-server', args: ['--stdio'] },
  json: { command: 'vscode-json-language-server', args: ['--stdio'] },
}

// ─── State ────────────────────────────────────────────────────────────────────

/** Keyed by `${root}::${language}` */
const servers = new Map<string, LspServerInstance>()

/** BrowserWindow reference for sending diagnostics events */
let mainWindow: BrowserWindow | null = null

const MAX_RESTART_ATTEMPTS = 3
const RESTART_COOLDOWN_MS = 10_000

// ─── Helpers ──────────────────────────────────────────────────────────────────

function serverKey(root: string, language: string): string {
  return `${root}::${language}`
}

function filePathToUri(filePath: string): string {
  // Convert Windows paths: C:\foo\bar → file:///C:/foo/bar
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:/.test(normalized)) {
    return `file:///${normalized}`
  }
  return `file://${normalized}`
}

function uriToFilePath(uri: string): string {
  let p = uri.replace('file:///', '').replace('file://', '')
  // Decode percent-encoded characters
  p = decodeURIComponent(p)
  // On Windows, convert forward slashes back
  if (process.platform === 'win32') {
    p = p.replace(/\//g, '\\')
  }
  return p
}

function languageIdFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescriptreact',
    '.js': 'javascript',
    '.jsx': 'javascriptreact',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
    '.md': 'markdown',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'shellscript',
    '.bash': 'shellscript',
    '.sql': 'sql',
    '.xml': 'xml',
  }
  return map[ext] ?? 'plaintext'
}

function completionKindToString(kind?: number): string {
  if (kind === undefined) return 'text'
  const map: Record<number, string> = {
    [CompletionItemKind.Text]: 'text',
    [CompletionItemKind.Method]: 'method',
    [CompletionItemKind.Function]: 'function',
    [CompletionItemKind.Constructor]: 'constructor',
    [CompletionItemKind.Field]: 'field',
    [CompletionItemKind.Variable]: 'variable',
    [CompletionItemKind.Class]: 'class',
    [CompletionItemKind.Interface]: 'interface',
    [CompletionItemKind.Module]: 'module',
    [CompletionItemKind.Property]: 'property',
    [CompletionItemKind.Unit]: 'unit',
    [CompletionItemKind.Value]: 'value',
    [CompletionItemKind.Enum]: 'enum',
    [CompletionItemKind.Keyword]: 'keyword',
    [CompletionItemKind.Snippet]: 'snippet',
    [CompletionItemKind.Color]: 'color',
    [CompletionItemKind.File]: 'file',
    [CompletionItemKind.Reference]: 'reference',
    [CompletionItemKind.Folder]: 'folder',
    [CompletionItemKind.EnumMember]: 'enumMember',
    [CompletionItemKind.Constant]: 'constant',
    [CompletionItemKind.Struct]: 'struct',
    [CompletionItemKind.Event]: 'event',
    [CompletionItemKind.Operator]: 'operator',
    [CompletionItemKind.TypeParameter]: 'typeParameter',
  }
  return map[kind] ?? 'text'
}

function severityToString(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case DiagnosticSeverity.Error: return 'error'
    case DiagnosticSeverity.Warning: return 'warning'
    case DiagnosticSeverity.Information: return 'info'
    case DiagnosticSeverity.Hint: return 'hint'
    default: return 'info'
  }
}

function extractDocumentation(item: LspCompletionItem): string | undefined {
  if (!item.documentation) return undefined
  if (typeof item.documentation === 'string') return item.documentation
  return (item.documentation as MarkupContent).value
}

function convertDiagnostics(diagnostics: Diagnostic[]): LspDiagnostic[] {
  return diagnostics.map((d) => ({
    message: d.message,
    severity: severityToString(d.severity),
    range: {
      startLine: d.range.start.line,
      startChar: d.range.start.character,
      endLine: d.range.end.line,
      endChar: d.range.end.character,
    },
  }))
}

// ─── Server commands resolution ───────────────────────────────────────────────

function getServerCommand(language: string): { command: string; args: string[] } | null {
  // Check user-configured custom servers first
  const customServers = getConfigValue('lspServers') as Record<string, string> | undefined
  if (customServers && customServers[language]) {
    const parts = customServers[language].split(/\s+/)
    return { command: parts[0], args: parts.slice(1) }
  }

  return DEFAULT_SERVER_COMMANDS[language] ?? null
}

// ─── Core operations ──────────────────────────────────────────────────────────

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export async function startServer(
  root: string,
  language: string
): Promise<{ success: boolean; error?: string }> {
  const key = serverKey(root, language)

  if (servers.has(key)) {
    const existing = servers.get(key)!
    if (existing.status === 'running' || existing.status === 'starting') {
      return { success: true }
    }
  }

  const serverConfig = getServerCommand(language)
  if (!serverConfig) {
    return { success: false, error: `No language server configured for "${language}"` }
  }

  try {
    const proc = spawn(serverConfig.command, serverConfig.args, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: process.platform === 'win32',
    })

    if (!proc.stdout || !proc.stdin) {
      proc.kill()
      return { success: false, error: 'Failed to create stdio pipes for language server' }
    }

    const connection = createMessageConnection(
      new StreamMessageReader(proc.stdout),
      new StreamMessageWriter(proc.stdin)
    )

    const instance: LspServerInstance = {
      process: proc,
      connection,
      root,
      language,
      status: 'starting',
      documentVersions: new Map(),
      diagnosticsCache: new Map(),
      restartCount: 0,
      lastRestartTime: Date.now(),
    }

    servers.set(key, instance)

    // Handle process errors and crashes
    proc.on('error', (err) => {
      console.error(`[LSP] Server ${language} error:`, err.message)
      instance.status = 'error'
      broadcastStatusChange()
    })

    proc.on('exit', (code, signal) => {
      console.log(`[LSP] Server ${language} exited: code=${code}, signal=${signal}`)
      const wasRunning = instance.status === 'running'
      instance.status = 'stopped'
      servers.delete(key)
      broadcastStatusChange()

      // Auto-restart on unexpected crash
      if (wasRunning && code !== 0 && code !== null) {
        const now = Date.now()
        if (
          instance.restartCount < MAX_RESTART_ATTEMPTS &&
          now - instance.lastRestartTime > RESTART_COOLDOWN_MS
        ) {
          console.log(`[LSP] Auto-restarting ${language} server (attempt ${instance.restartCount + 1})`)
          setTimeout(() => {
            startServer(root, language).then((result) => {
              if (result.success) {
                const newInstance = servers.get(key)
                if (newInstance) {
                  newInstance.restartCount = instance.restartCount + 1
                  newInstance.lastRestartTime = now
                }
              }
            }).catch(() => {})
          }, 1000 * (instance.restartCount + 1)) // Exponential-ish backoff
        }
      }
    })

    // Capture stderr for debugging
    proc.stderr?.on('data', (data: Buffer) => {
      console.error(`[LSP] ${language} stderr:`, data.toString().trim())
    })

    // Start the connection
    connection.listen()

    // Send initialize request
    const initParams: InitializeParams = {
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
      workspaceFolders: [
        { uri: filePathToUri(root), name: path.basename(root) },
      ],
    }

    await connection.sendRequest(InitializeRequest.type, initParams)
    connection.sendNotification(InitializedNotification.type, {})

    // Listen for diagnostics
    connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
      const filePath = uriToFilePath(params.uri)
      const converted = convertDiagnostics(params.diagnostics)
      instance.diagnosticsCache.set(params.uri, converted)

      // Forward to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('lsp:diagnostics', {
          filePath,
          diagnostics: converted,
        })
      }
    })

    instance.status = 'running'
    broadcastStatusChange()
    console.log(`[LSP] Server ${language} started for ${root}`)

    return { success: true }
  } catch (err) {
    servers.delete(key)
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[LSP] Failed to start ${language} server:`, message)
    return { success: false, error: message }
  }
}

export async function stopServer(
  root: string,
  language: string
): Promise<{ success: boolean; error?: string }> {
  const key = serverKey(root, language)
  const instance = servers.get(key)

  if (!instance) {
    return { success: true } // Already stopped
  }

  try {
    if (instance.status === 'running') {
      // Graceful shutdown
      try {
        await Promise.race([
          instance.connection.sendRequest(ShutdownRequest.type),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 5000)),
        ])
        instance.connection.sendNotification(ExitNotification.type)
      } catch {
        // If graceful shutdown fails, force kill
      }
    }

    instance.connection.dispose()
    instance.process.kill()
    instance.status = 'stopped'
    servers.delete(key)
    broadcastStatusChange()

    return { success: true }
  } catch (err) {
    // Force cleanup
    try { instance.process.kill('SIGKILL') } catch { /* ignore */ }
    servers.delete(key)
    broadcastStatusChange()
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function stopAllServers(): Promise<void> {
  const stopPromises = Array.from(servers.entries()).map(([, instance]) =>
    stopServer(instance.root, instance.language).catch(() => {})
  )
  await Promise.all(stopPromises)
}

// ─── Document synchronization ─────────────────────────────────────────────────

export async function didOpen(
  root: string,
  filePath: string,
  content: string
): Promise<void> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') return

  const uri = filePathToUri(filePath)
  instance.documentVersions.set(uri, 1)

  instance.connection.sendNotification(DidOpenTextDocumentNotification.type, {
    textDocument: {
      uri,
      languageId: languageIdFromPath(filePath),
      version: 1,
      text: content,
    },
  })
}

export async function didChange(
  root: string,
  filePath: string,
  content: string
): Promise<void> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') return

  const uri = filePathToUri(filePath)
  const version = (instance.documentVersions.get(uri) ?? 0) + 1
  instance.documentVersions.set(uri, version)

  instance.connection.sendNotification(DidChangeTextDocumentNotification.type, {
    textDocument: { uri, version },
    contentChanges: [{ text: content }], // Full sync
  })
}

export async function didClose(
  root: string,
  filePath: string
): Promise<void> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') return

  const uri = filePathToUri(filePath)
  instance.documentVersions.delete(uri)

  instance.connection.sendNotification(DidCloseTextDocumentNotification.type, {
    textDocument: { uri },
  })
}

// ─── LSP features ─────────────────────────────────────────────────────────────

export async function getCompletion(
  root: string,
  filePath: string,
  line: number,
  character: number
): Promise<{ success: boolean; items?: CompletionItem[]; error?: string }> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return { success: false, error: 'No language server for this file type' }

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') {
    return { success: false, error: `Language server for ${language} is not running` }
  }

  try {
    const result = await instance.connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    })

    if (!result) return { success: true, items: [] }

    const items: LspCompletionItem[] = Array.isArray(result)
      ? result
      : (result as CompletionList).items

    const converted: CompletionItem[] = items.map((item) => ({
      label: item.label,
      kind: completionKindToString(item.kind),
      detail: item.detail,
      insertText: item.insertText ?? item.label,
      documentation: extractDocumentation(item),
    }))

    return { success: true, items: converted }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function getHover(
  root: string,
  filePath: string,
  line: number,
  character: number
): Promise<{ success: boolean; contents?: string; error?: string }> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return { success: false, error: 'No language server for this file type' }

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') {
    return { success: false, error: `Language server for ${language} is not running` }
  }

  try {
    const result = await instance.connection.sendRequest(HoverRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    })

    if (!result) return { success: true, contents: '' }

    let contents = ''
    if (typeof result.contents === 'string') {
      contents = result.contents
    } else if ('value' in result.contents) {
      contents = (result.contents as MarkupContent).value
    } else if (Array.isArray(result.contents)) {
      contents = result.contents
        .map((c) => (typeof c === 'string' ? c : c.value))
        .join('\n\n')
    }

    return { success: true, contents }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export async function getDefinition(
  root: string,
  filePath: string,
  line: number,
  character: number
): Promise<{ success: boolean; location?: LspLocation; error?: string }> {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return { success: false, error: 'No language server for this file type' }

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') {
    return { success: false, error: `Language server for ${language} is not running` }
  }

  try {
    const result = await instance.connection.sendRequest(DefinitionRequest.type, {
      textDocument: { uri: filePathToUri(filePath) },
      position: { line, character },
    })

    if (!result) return { success: true }

    // Result can be Location | Location[] | LocationLink[]
    let location: Location | undefined
    if (Array.isArray(result)) {
      if (result.length > 0) {
        const first = result[0]
        if ('targetUri' in first) {
          // LocationLink
          location = { uri: first.targetUri, range: first.targetRange }
        } else {
          location = first as Location
        }
      }
    } else {
      location = result as Location
    }

    if (!location) return { success: true }

    return {
      success: true,
      location: {
        filePath: uriToFilePath(location.uri),
        line: location.range.start.line,
        character: location.range.start.character,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

export function getDiagnostics(
  root: string,
  filePath: string
): { success: boolean; diagnostics?: LspDiagnostic[]; error?: string } {
  const language = detectLanguageForFile(root, filePath)
  if (!language) return { success: false, error: 'No language server for this file type' }

  const key = serverKey(root, language)
  const instance = servers.get(key)
  if (!instance || instance.status !== 'running') {
    return { success: false, error: `Language server for ${language} is not running` }
  }

  const uri = filePathToUri(filePath)
  const diagnostics = instance.diagnosticsCache.get(uri) ?? []
  return { success: true, diagnostics }
}

// ─── Status ───────────────────────────────────────────────────────────────────

export interface LspServerStatus {
  root: string
  language: string
  status: ServerStatus
}

export function getRunningServers(): LspServerStatus[] {
  return Array.from(servers.values()).map((s) => ({
    root: s.root,
    language: s.language,
    status: s.status,
  }))
}

function broadcastStatusChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('lsp:statusChange', getRunningServers())
  }
}

// ─── Language detection ───────────────────────────────────────────────────────

function detectLanguageForFile(root: string, filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase()
  const extToLang: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.rs': 'rust',
    '.go': 'go',
    '.css': 'css',
    '.html': 'html',
    '.json': 'json',
  }
  const language = extToLang[ext]
  if (!language) return null

  // Check if we have a server for this language
  const key = serverKey(root, language)
  if (servers.has(key)) return language

  // Also check if typescript server handles javascript
  if (language === 'javascript') {
    const tsKey = serverKey(root, 'typescript')
    if (servers.has(tsKey)) return 'typescript'
  }

  return language
}
