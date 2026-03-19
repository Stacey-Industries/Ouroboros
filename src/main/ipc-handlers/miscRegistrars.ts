import { app, type BrowserWindow, ipcMain, IpcMainInvokeEvent, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { getErrorMessage } from '../agentChat/utils'
import { addAlwaysAllowRule, respondToApproval } from '../approvalManager'
import {
  clearCostHistory,
  type CostEntry,
  getCostHistory,
  saveCostEntry,
} from '../costHistory'
import {
  didChange as lspDidChange,
  didClose as lspDidClose,
  didOpen as lspDidOpen,
  getCompletion as lspCompletion,
  getDefinition as lspDefinition,
  getDiagnostics as lspDiagnostics,
  getHover as lspHover,
  getRunningServers as lspGetStatus,
  setMainWindow as lspSetMainWindow,
  startServer as lspStart,
  stopServer as lspStop,
} from '../lsp'
import { subscribeToPerfMetrics, unsubscribeFromPerfMetrics } from '../perfMetrics'
import {
  getRecentSessionDetails,
  getSessionDetail,
  getUsageSummary,
  getWindowedUsage,
} from '../usageReader'
import {
  closeWindow,
  createWindow,
  focusWindow,
  getWindowInfos,
  setWindowProjectRoot,
} from '../windowManager'
import { readShellHistory, searchSymbols } from './miscSymbolSearch'
import { assertPathAllowed } from './pathSecurity'

type ChannelList = string[]
type IpcHandler = Parameters<typeof ipcMain.handle>[1]
type FailureResponse = { success: false; error: string }
type EmptySuccessResponse = { success: true }
type SuccessResponse<T extends object> = EmptySuccessResponse & T

interface AutoUpdaterLike {
  checkForUpdates(): Promise<unknown>
  downloadUpdate(): Promise<unknown>
  quitAndInstall(): void
}

const crashLogDir = path.join(app.getPath('userData'), 'crashes')
let autoUpdater: AutoUpdaterLike | null = null

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { autoUpdater: updater } = require('electron-updater') as {
    autoUpdater: AutoUpdaterLike
  }
  autoUpdater = updater
} catch {
  // Not installed - no-op.
}

function registerChannel(channels: ChannelList, channel: string, handler: IpcHandler): void {
  ipcMain.handle(channel, handler)
  channels.push(channel)
}

function ok(): EmptySuccessResponse
function ok<T extends object>(payload: T): SuccessResponse<T>
function ok(payload?: object): EmptySuccessResponse | SuccessResponse<object> {
  if (!payload) {
    return { success: true }
  }
  return { success: true, ...payload }
}

function fail(error: unknown): FailureResponse {
  return { success: false, error: getErrorMessage(error) }
}

async function runAction(action: () => Promise<unknown> | unknown): Promise<EmptySuccessResponse | FailureResponse> {
  try {
    await action()
    return ok()
  } catch (error) {
    return fail(error)
  }
}

async function runQuery<T extends object>(
  query: () => Promise<T> | T
): Promise<SuccessResponse<T> | FailureResponse> {
  try {
    return ok(await query())
  } catch (error) {
    return fail(error)
  }
}

function createUpdaterHandler(
  action: (updater: AutoUpdaterLike) => Promise<unknown> | unknown
): IpcHandler {
  return async () => {
    const updater = autoUpdater
    if (!updater) {
      return { success: false, error: 'electron-updater not installed' }
    }
    return runAction(() => action(updater))
  }
}

async function getCrashLogFiles(): Promise<string[]> {
  await fs.mkdir(crashLogDir, { recursive: true })
  const entries = await fs.readdir(crashLogDir)
  return entries.filter((entry) => entry.endsWith('.log'))
}

async function readCrashLog(fileName: string): Promise<{ name: string; content: string; mtime: number }> {
  const filePath = path.join(crashLogDir, fileName)
  const [content, stat] = await Promise.all([
    fs.readFile(filePath, 'utf-8'),
    fs.stat(filePath),
  ])
  return { name: fileName, content, mtime: stat.mtime.getTime() }
}

async function getCrashLogs(): Promise<Array<{ name: string; content: string; mtime: number }>> {
  const logFiles = await getCrashLogFiles()
  const logs = await Promise.all(
    logFiles.map(async (fileName) => {
      try {
        return await readCrashLog(fileName)
      } catch {
        return null
      }
    })
  )
  return logs.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

async function clearCrashLogs(): Promise<void> {
  const logFiles = await getCrashLogFiles()
  await Promise.all(
    logFiles.map((fileName) =>
      fs.unlink(path.join(crashLogDir, fileName)).catch((error) => { console.error('[crash] Failed to delete crash log file:', fileName, error) })
    )
  )
}

async function writeCrashLog(source: string, message: string, stack?: string): Promise<void> {
  await fs.mkdir(crashLogDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(crashLogDir, `crash-${timestamp}.log`)
  const content = [
    `Source: ${source}`,
    `Timestamp: ${new Date().toISOString()}`,
    `App version: ${app.getVersion()}`,
    `Platform: ${process.platform} ${process.arch}`,
    '',
    message,
    ...(stack ? ['', 'Stack:', stack] : []),
  ].join('\n')
  await fs.writeFile(filePath, content, 'utf-8')
}

async function registerExtensionTask<T>(
  task: (extensions: typeof import('../extensions')) => Promise<T> | T
): Promise<T | FailureResponse> {
  try {
    const extensions = await import('../extensions')
    return await task(extensions)
  } catch (error) {
    return fail(error)
  }
}

export function registerUpdaterHandlers(channels: ChannelList): void {
  registerChannel(channels, 'updater:check', createUpdaterHandler((updater) => updater.checkForUpdates()))
  registerChannel(channels, 'updater:download', createUpdaterHandler((updater) => updater.downloadUpdate()))
  registerChannel(channels, 'updater:install', createUpdaterHandler((updater) => updater.quitAndInstall()))
}

export function registerCostHandlers(channels: ChannelList): void {
  registerChannel(channels, 'cost:addEntry', async (_event, entry: CostEntry) => runAction(() => saveCostEntry(entry)))
  registerChannel(channels, 'cost:getHistory', async () => runQuery(async () => ({ entries: await getCostHistory() })))
  registerChannel(channels, 'cost:clearHistory', async () => runAction(clearCostHistory))
}

export function registerUsageHandlers(channels: ChannelList): void {
  registerChannel(channels, 'usage:getSummary', async (_event, options?: { projectFilter?: string; since?: number; maxSessions?: number }) =>
    runQuery(async () => ({ summary: await getUsageSummary(options) }))
  )
  registerChannel(channels, 'usage:getSessionDetail', async (_event, sessionId: string) => runQuery(async () => ({ detail: await getSessionDetail(sessionId) })))
  registerChannel(channels, 'usage:getRecentSessions', async (_event, count?: number) => runQuery(async () => ({ sessions: await getRecentSessionDetails(count ?? 3) })))
  registerChannel(channels, 'usage:getWindowedUsage', async () => runQuery(async () => ({ windowed: await getWindowedUsage() })))
}

export function registerCrashLogHandlers(channels: ChannelList): void {
  registerChannel(channels, 'app:getCrashLogs', async () =>
    runQuery(async () => {
      const logs = await getCrashLogs()
      logs.sort((left, right) => right.mtime - left.mtime)
      return { logs }
    })
  )
  registerChannel(channels, 'app:clearCrashLogs', async () => runAction(clearCrashLogs))
  registerChannel(channels, 'app:openCrashLogDir', async () => runAction(async () => {
    await fs.mkdir(crashLogDir, { recursive: true })
    await shell.openPath(crashLogDir)
    return ok()
  }))
  registerChannel(channels, 'app:logError', async (_event, source: string, message: string, stack?: string) =>
    runAction(() => writeCrashLog(source, message, stack))
  )
}

export function registerPerfHandlers(channels: ChannelList): void {
  registerChannel(channels, 'perf:ping', () => ok({ ts: Date.now() }))
  registerChannel(channels, 'perf:subscribe', (event) => subscribeToPerfMetrics(event))
  registerChannel(channels, 'perf:unsubscribe', (event) => unsubscribeFromPerfMetrics(event))
}

export function registerShellHistoryHandlers(channels: ChannelList): void {
  registerChannel(channels, 'shellHistory:read', async () => runQuery(async () => ({ commands: await readShellHistory() })))
}

export function registerSymbolHandlers(channels: ChannelList): void {
  registerChannel(channels, 'symbol:search', async (event: IpcMainInvokeEvent, root: string) => {
    const denied = assertPathAllowed(event, root)
    if (denied) return denied
    return runQuery(async () => ({ symbols: await searchSymbols(root) }))
  })
}

export function registerWindowHandlers(channels: ChannelList): void {
  registerChannel(channels, 'window:new', (_event, projectRoot?: string) => runQuery(() => {
    const newWindow = createWindow(projectRoot)
    if (projectRoot) {
      setWindowProjectRoot(newWindow.id, projectRoot)
    }
    return { windowId: newWindow.id }
  }))
  registerChannel(channels, 'window:list', async () => runQuery(() => ({ windows: getWindowInfos() })))
  registerChannel(channels, 'window:focus', async (_event, windowId: number) => runAction(() => focusWindow(windowId)))
  registerChannel(channels, 'window:close', async (_event, windowId: number) => runAction(() => closeWindow(windowId)))
}

export function registerExtensionHandlers(channels: ChannelList): void {
  registerChannel(channels, 'extensions:list', async () => registerExtensionTask((extensions) => ok({ extensions: extensions.listExtensions() })))
  registerChannel(channels, 'extensions:enable', async (_event, name: string) => registerExtensionTask((extensions) => extensions.enableExtension(name)))
  registerChannel(channels, 'extensions:disable', async (_event, name: string) => registerExtensionTask((extensions) => extensions.disableExtension(name)))
  registerChannel(channels, 'extensions:install', async (_event, sourcePath: string) => registerExtensionTask((extensions) => extensions.installExtension(sourcePath)))
  registerChannel(channels, 'extensions:uninstall', async (_event, name: string) => registerExtensionTask((extensions) => extensions.uninstallExtension(name)))
  registerChannel(channels, 'extensions:getLog', async (_event, name: string) => registerExtensionTask((extensions) => extensions.getExtensionLog(name)))
  registerChannel(channels, 'extensions:openFolder', async () => registerExtensionTask(async (extensions) => {
    const extensionsPath = extensions.getExtensionsDirPath()
    await fs.mkdir(extensionsPath, { recursive: true })
    await shell.openPath(extensionsPath)
    return ok()
  }))
  registerChannel(channels, 'extensions:activate', async (_event, name: string) => registerExtensionTask((extensions) => extensions.forceActivateExtension(name)))
  registerChannel(channels, 'extensions:commandExecuted', async (_event, commandId: string) => registerExtensionTask(async (extensions) => {
    await extensions.dispatchCommandEvent(commandId)
    return ok()
  }))
}

export function registerLspHandlers(channels: ChannelList, win: BrowserWindow): void {
  lspSetMainWindow(win)

  registerChannel(channels, 'lsp:start', async (event: IpcMainInvokeEvent, root: string, language: string) => {
    const denied = assertPathAllowed(event, root)
    if (denied) return denied
    return lspStart(root, language)
  })
  registerChannel(channels, 'lsp:stop', async (event: IpcMainInvokeEvent, root: string, language: string) => {
    const denied = assertPathAllowed(event, root)
    if (denied) return denied
    return lspStop(root, language)
  })
  registerChannel(channels, 'lsp:completion', async (event: IpcMainInvokeEvent, opts: { root: string; filePath: string; line: number; character: number }) => {
    const deniedRoot = assertPathAllowed(event, opts.root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, opts.filePath)
    if (deniedFile) return deniedFile
    return lspCompletion(opts.root, opts.filePath, opts.line, opts.character)
  })
  registerChannel(channels, 'lsp:hover', async (event: IpcMainInvokeEvent, opts: { root: string; filePath: string; line: number; character: number }) => {
    const deniedRoot = assertPathAllowed(event, opts.root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, opts.filePath)
    if (deniedFile) return deniedFile
    return lspHover(opts.root, opts.filePath, opts.line, opts.character)
  })
  registerChannel(channels, 'lsp:definition', async (event: IpcMainInvokeEvent, opts: { root: string; filePath: string; line: number; character: number }) => {
    const deniedRoot = assertPathAllowed(event, opts.root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, opts.filePath)
    if (deniedFile) return deniedFile
    return lspDefinition(opts.root, opts.filePath, opts.line, opts.character)
  })
  registerChannel(channels, 'lsp:diagnostics', async (event: IpcMainInvokeEvent, root: string, filePath: string) => {
    const deniedRoot = assertPathAllowed(event, root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, filePath)
    if (deniedFile) return deniedFile
    return lspDiagnostics(root, filePath)
  })
  registerChannel(channels, 'lsp:didOpen', async (event: IpcMainInvokeEvent, root: string, filePath: string, content: string) => {
    const deniedRoot = assertPathAllowed(event, root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, filePath)
    if (deniedFile) return deniedFile
    return lspDidOpen(root, filePath, content)
  })
  registerChannel(channels, 'lsp:didChange', async (event: IpcMainInvokeEvent, root: string, filePath: string, content: string) => {
    const deniedRoot = assertPathAllowed(event, root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, filePath)
    if (deniedFile) return deniedFile
    return lspDidChange(root, filePath, content)
  })
  registerChannel(channels, 'lsp:didClose', async (event: IpcMainInvokeEvent, root: string, filePath: string) => {
    const deniedRoot = assertPathAllowed(event, root)
    if (deniedRoot) return deniedRoot
    const deniedFile = assertPathAllowed(event, filePath)
    if (deniedFile) return deniedFile
    return lspDidClose(root, filePath)
  })
  registerChannel(channels, 'lsp:getStatus', async () => ok({ servers: lspGetStatus() }))
}

export function registerApprovalHandlers(channels: ChannelList): void {
  registerChannel(channels, 'approval:respond', async (_event, requestId: string, decision: 'approve' | 'reject', reason?: string) =>
    runQuery(() => {
      const written = respondToApproval(requestId, { decision, reason })
      return { error: written ? undefined : 'Failed to write response file' }
    }).then((result) => {
      if (!result.success) {
        return result
      }
      return { success: result.error === undefined, error: result.error }
    })
  )
  registerChannel(channels, 'approval:alwaysAllow', async (_event, sessionId: string, toolName: string) =>
    runAction(() => addAlwaysAllowRule(sessionId, toolName))
  )
}

export function registerGraphHandlers(channels: ChannelList): void {
  registerChannel(channels, 'graph:getStatus', async () => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph controller not initialized' }
    return { success: true as const, status: ctrl.getStatus() }
  })

  registerChannel(channels, 'graph:reindex', async () => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph controller not initialized' }
    const context = ctrl.getGraphToolContext()
    if (!context) return { success: false as const, error: 'Graph not ready' }

    const result = await context.pipeline.index({
      projectRoot: context.projectRoot,
      projectName: context.projectName,
      incremental: false,
    })
    return { success: result.success, result }
  })

  registerChannel(channels, 'graph:searchGraph', async (_event, query: string, limit?: number) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, results: ctrl.searchGraph(query, limit) }
  })

  registerChannel(channels, 'graph:queryGraph', async (_event, query: string) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, results: ctrl.queryGraph(query) }
  })

  registerChannel(channels, 'graph:traceCallPath', async (_event, fromId: string, toId: string, maxDepth?: number) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, result: ctrl.traceCallPath(fromId, toId, maxDepth) }
  })

  registerChannel(channels, 'graph:getArchitecture', async (_event, aspects?: string[]) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, architecture: ctrl.getArchitecture(aspects) }
  })

  registerChannel(channels, 'graph:getCodeSnippet', async (_event, symbolId: string) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, snippet: await ctrl.getCodeSnippet(symbolId) }
  })

  registerChannel(channels, 'graph:detectChanges', async () => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, changes: await ctrl.detectChanges() }
  })

  registerChannel(channels, 'graph:searchCode', async (_event, pattern: string, opts?: { fileGlob?: string; maxResults?: number }) => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, results: await ctrl.searchCode(pattern, opts) }
  })

  registerChannel(channels, 'graph:getGraphSchema', async () => {
    const { getGraphController } = await import('../codebaseGraph/graphController')
    const ctrl = getGraphController()
    if (!ctrl) return { success: false as const, error: 'Graph not initialized' }
    return { success: true as const, schema: ctrl.getGraphSchema() }
  })
}
