import { app, type BrowserWindow, ipcMain, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import { addAlwaysAllowRule, respondToApproval } from '../approvalManager'
import {
  clearCostHistory,
  getCostHistory,
  saveCostEntry,
  type CostEntry,
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

async function runAction(action: () => Promise<void> | void): Promise<EmptySuccessResponse | FailureResponse> {
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
  action: (updater: AutoUpdaterLike) => Promise<void> | void
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
      fs.unlink(path.join(crashLogDir, fileName)).catch(() => {})
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
  }))
  registerChannel(channels, 'app:logError', async (_event, source: string, message: string, stack?: string) =>
    runAction(() => writeCrashLog(source, message, stack))
  )
}

export function registerPerfHandlers(channels: ChannelList): void {
  registerChannel(channels, 'perf:ping', () => ok({ ts: Date.now() }))
}

export function registerShellHistoryHandlers(channels: ChannelList): void {
  registerChannel(channels, 'shellHistory:read', async () => runQuery(async () => ({ commands: await readShellHistory() })))
}

export function registerSymbolHandlers(channels: ChannelList): void {
  registerChannel(channels, 'symbol:search', async (_event, root: string) => runQuery(async () => ({ symbols: await searchSymbols(root) })))
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

  registerChannel(channels, 'lsp:start', async (_event, root: string, language: string) => lspStart(root, language))
  registerChannel(channels, 'lsp:stop', async (_event, root: string, language: string) => lspStop(root, language))
  registerChannel(channels, 'lsp:completion', async (_event, opts: { root: string; filePath: string; line: number; character: number }) => lspCompletion(opts.root, opts.filePath, opts.line, opts.character))
  registerChannel(channels, 'lsp:hover', async (_event, opts: { root: string; filePath: string; line: number; character: number }) => lspHover(opts.root, opts.filePath, opts.line, opts.character))
  registerChannel(channels, 'lsp:definition', async (_event, opts: { root: string; filePath: string; line: number; character: number }) => lspDefinition(opts.root, opts.filePath, opts.line, opts.character))
  registerChannel(channels, 'lsp:diagnostics', async (_event, root: string, filePath: string) => lspDiagnostics(root, filePath))
  registerChannel(channels, 'lsp:didOpen', async (_event, root: string, filePath: string, content: string) => lspDidOpen(root, filePath, content))
  registerChannel(channels, 'lsp:didChange', async (_event, root: string, filePath: string, content: string) => lspDidChange(root, filePath, content))
  registerChannel(channels, 'lsp:didClose', async (_event, root: string, filePath: string) => lspDidClose(root, filePath))
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
