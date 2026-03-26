/**
 * perfMetrics.ts — Real performance metrics collection.
 *
 * Collects Node.js memory usage and Electron app metrics,
 * then broadcasts to subscribed renderer windows every 5 seconds.
 */

import { app, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

import { broadcastToWebClients } from './web/webServer'

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
