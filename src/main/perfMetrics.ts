/**
 * perfMetrics.ts — Real performance metrics collection.
 *
 * Collects Node.js memory usage and Electron app metrics,
 * then broadcasts to subscribed renderer windows every 5 seconds.
 * Also provides startup phase marking for cold-start instrumentation.
 */

import { app, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import log from './logger'
import { broadcastToWebClients } from './web/webServer'

// ─── Startup phase timing ────────────────────────────────────────────────────

export type StartupPhase =
  | 'app-ready'
  | 'window-ready'
  | 'ipc-ready'
  | 'services-ready'
  | 'renderer-bundle-loaded'
  | 'react-root-created'
  | 'first-render'

export interface StartupMark {
  phase: StartupPhase
  tsNs: bigint
  deltaMs: number
}

const baseNs: bigint = process.hrtime.bigint()
let marks: StartupMark[] = []

export function markStartup(phase: StartupPhase): void {
  const already = marks.find((m) => m.phase === phase)
  if (already) {
    log.warn(`[perf] markStartup: phase "${phase}" already marked — ignoring duplicate`)
    return
  }
  const tsNs = process.hrtime.bigint()
  const deltaMs = Number(tsNs - baseNs) / 1_000_000
  marks.push({ phase, tsNs, deltaMs })
}

export function getStartupTimings(): StartupMark[] {
  return [...marks].sort((a, b) => (a.tsNs < b.tsNs ? -1 : a.tsNs > b.tsNs ? 1 : 0))
}

export function resetStartupTimings(): void {
  marks = []
}

export function formatStartupSummary(): string {
  const sorted = getStartupTimings()
  if (sorted.length < 2) return ''
  return sorted.map((m) => `${m.phase}=${Math.round(m.deltaMs)}ms`).join(' ')
}

// ─── Latest runtime metrics snapshot ────────────────────────────────────────

type RuntimeMetrics = ReturnType<typeof collectMetrics>
let latestMetrics: RuntimeMetrics | null = null

export function getLatestPerfMetrics(): RuntimeMetrics | null {
  return latestMetrics
}

interface PerfMetricsOptions {
  getActiveWindows: () => BrowserWindow[]
}

const subscriberIds = new Set<number>()
let options: PerfMetricsOptions | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

export function initializePerfMetrics(opts: PerfMetricsOptions): void {
  options = opts
}

function collectMetrics() {
  const mem = process.memoryUsage()
  const appMetrics = app.getAppMetrics()

  return {
    timestamp: Date.now(),
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
    },
    processes: appMetrics.map((m) => ({
      pid: m.pid,
      type: m.type,
      cpu: {
        percentCPUUsage: m.cpu.percentCPUUsage,
        idleWakeupsPerSecond: m.cpu.idleWakeupsPerSecond,
      },
      memory: {
        workingSetSize: m.memory.workingSetSize,
        peakWorkingSetSize: m.memory.peakWorkingSetSize,
      },
    })),
  }
}

function broadcast(): void {
  if (subscriberIds.size === 0 || !options) return

  const metrics = collectMetrics()
  latestMetrics = metrics
  const windows = options.getActiveWindows()

  for (const win of windows) {
    try {
      if (subscriberIds.has(win.webContents.id) && !win.isDestroyed()) {
        win.webContents.send('perf:metrics', metrics)
      }
    } catch {
      // Window may have been destroyed between check and send
    }
  }
  broadcastToWebClients('perf:metrics', metrics)
}

export function startPerfMetrics(): void {
  if (intervalId) return
  intervalId = setInterval(broadcast, 5000)
}

export function stopPerfMetrics(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function subscribeToPerfMetrics(event: IpcMainInvokeEvent): { success: true } {
  subscriberIds.add(event.sender.id)
  if (subscriberIds.size === 1) {
    startPerfMetrics()
  }
  return { success: true }
}

export function unsubscribeFromPerfMetrics(event: IpcMainInvokeEvent): { success: true } {
  subscriberIds.delete(event.sender.id)
  if (subscriberIds.size === 0) {
    stopPerfMetrics()
  }
  return { success: true }
}

export function cleanupPerfSubscriber(webContentsId: number): void {
  subscriberIds.delete(webContentsId)
  if (subscriberIds.size === 0) {
    stopPerfMetrics()
  }
}

export function clearPerfSubscribers(): void {
  subscriberIds.clear()
}
