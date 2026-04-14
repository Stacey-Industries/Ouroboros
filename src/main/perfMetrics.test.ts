import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetAppMetrics = vi.fn(() => [])

vi.mock('electron', () => ({
  app: {
    getAppMetrics: mockGetAppMetrics,
    getPath: vi.fn(() => '/mock/path'),
    commandLine: { appendSwitch: vi.fn() },
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}))

vi.mock('mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindowMock {},
}))

vi.mock('./logger', () => ({
  default: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('./web/webServer', () => ({
  broadcastToWebClients: vi.fn(),
}))

// ─── Startup phase timing tests ───────────────────────────────────────────────

describe('startup timing', () => {
  let markStartup: typeof import('./perfMetrics').markStartup
  let getStartupTimings: typeof import('./perfMetrics').getStartupTimings
  let resetStartupTimings: typeof import('./perfMetrics').resetStartupTimings
  let logWarn: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./perfMetrics')
    markStartup = mod.markStartup
    getStartupTimings = mod.getStartupTimings
    resetStartupTimings = mod.resetStartupTimings
    resetStartupTimings()
    const logMod = await import('./logger')
    logWarn = logMod.default.warn as ReturnType<typeof vi.fn>
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStartupTimings()
  })

  it('adds a mark with a non-negative deltaMs', () => {
    markStartup('app-ready')
    const timings = getStartupTimings()
    expect(timings).toHaveLength(1)
    expect(timings[0].phase).toBe('app-ready')
    expect(timings[0].deltaMs).toBeGreaterThanOrEqual(0)
    expect(typeof timings[0].tsNs).toBe('bigint')
  })

  it('ignores a duplicate phase and warns', () => {
    markStartup('ipc-ready')
    markStartup('ipc-ready')
    expect(getStartupTimings()).toHaveLength(1)
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('ipc-ready'))
  })

  it('does not throw on duplicate phase', () => {
    expect(() => {
      markStartup('window-ready')
      markStartup('window-ready')
    }).not.toThrow()
  })

  it('returns marks sorted by tsNs ascending', () => {
    markStartup('app-ready')
    markStartup('ipc-ready')
    markStartup('services-ready')
    const timings = getStartupTimings()
    expect(timings).toHaveLength(3)
    const [first, second, third] = timings
    expect(second.tsNs).toBeGreaterThanOrEqual(first.tsNs)
    expect(third.tsNs).toBeGreaterThanOrEqual(second.tsNs)
  })

  it('returns a copy — mutating result does not affect internal state', () => {
    markStartup('app-ready')
    const first = getStartupTimings()
    first.push({ phase: 'first-render', tsNs: BigInt(0), deltaMs: 0 })
    const second = getStartupTimings()
    expect(second).toHaveLength(1)
  })

  it('clears all recorded marks after reset', () => {
    markStartup('app-ready')
    markStartup('window-ready')
    resetStartupTimings()
    expect(getStartupTimings()).toHaveLength(0)
  })

  it('allows re-marking the same phase after reset', () => {
    markStartup('app-ready')
    resetStartupTimings()
    markStartup('app-ready')
    expect(getStartupTimings()).toHaveLength(1)
  })

  it('produces monotonically increasing deltaMs across successive marks', () => {
    markStartup('app-ready')
    const start = Date.now()
    while (Date.now() - start < 2) { /* spin */ }
    markStartup('window-ready')
    const timings = getStartupTimings()
    expect(timings[1].deltaMs).toBeGreaterThanOrEqual(timings[0].deltaMs)
  })
})

describe('formatStartupSummary', () => {
  let formatStartupSummary: typeof import('./perfMetrics').formatStartupSummary
  let markStartup: typeof import('./perfMetrics').markStartup
  let resetStartupTimings: typeof import('./perfMetrics').resetStartupTimings

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./perfMetrics')
    formatStartupSummary = mod.formatStartupSummary
    markStartup = mod.markStartup
    resetStartupTimings = mod.resetStartupTimings
    resetStartupTimings()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetStartupTimings()
  })

  it('returns empty string when no marks recorded', () => {
    expect(formatStartupSummary()).toBe('')
  })

  it('returns empty string when only 1 mark is present', () => {
    markStartup('app-ready')
    expect(formatStartupSummary()).toBe('')
  })

  it('formats all 7 phases as space-separated key=value pairs', () => {
    markStartup('app-ready')
    markStartup('window-ready')
    markStartup('ipc-ready')
    markStartup('services-ready')
    markStartup('renderer-bundle-loaded')
    markStartup('react-root-created')
    markStartup('first-render')
    const summary = formatStartupSummary()
    expect(summary).toMatch(/app-ready=\d+ms/)
    expect(summary).toMatch(/window-ready=\d+ms/)
    expect(summary).toMatch(/ipc-ready=\d+ms/)
    expect(summary).toMatch(/services-ready=\d+ms/)
    expect(summary).toMatch(/renderer-bundle-loaded=\d+ms/)
    expect(summary).toMatch(/react-root-created=\d+ms/)
    expect(summary).toMatch(/first-render=\d+ms/)
    // 7 entries separated by spaces → 6 spaces
    expect(summary.split(' ')).toHaveLength(7)
  })
})

describe('getLatestPerfMetrics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetAppMetrics.mockReturnValue([])
  })

  it('returns null when no broadcast has occurred yet', async () => {
    const mod = await import('./perfMetrics')
    expect(mod.getLatestPerfMetrics()).toBeNull()
  })

  it('returns the most recent sample after a broadcast fires', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation(
      (cb: () => void) => { cb(); return 99 as never; },
    )

    const mod = await import('./perfMetrics')
    mod.initializePerfMetrics({ getActiveWindows: () => [] })
    mod.subscribeToPerfMetrics({ sender: { id: 42 } } as never)

    const sample = mod.getLatestPerfMetrics()
    expect(sample).not.toBeNull()
    expect(sample).toHaveProperty('timestamp')
    expect(sample).toHaveProperty('memory')
    expect(sample).toHaveProperty('processes')

    mod.clearPerfSubscribers()
    mod.stopPerfMetrics()
    setIntervalSpy.mockRestore()
  })
})

describe('perfMetrics', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockGetAppMetrics.mockReturnValue([])
  })

  it('starts the metrics interval on subscribe and stops it on unsubscribe', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as never)
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined)
    const send = vi.fn()

    const perfMetrics = await import('./perfMetrics')
    perfMetrics.initializePerfMetrics({
      getActiveWindows: () => [
        { isDestroyed: () => false, webContents: { id: 7, send } as unknown as WebContents } as unknown as BrowserWindow,
      ],
    })

    expect(setIntervalSpy).not.toHaveBeenCalled()

    expect(perfMetrics.subscribeToPerfMetrics({ sender: { id: 7 } } as unknown as IpcMainInvokeEvent)).toEqual({ success: true })
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    expect(perfMetrics.unsubscribeFromPerfMetrics({ sender: { id: 7 } } as unknown as IpcMainInvokeEvent)).toEqual({ success: true })
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

    perfMetrics.clearPerfSubscribers()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })

  it('removes destroyed senders without affecting unrelated subscribers', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as never)
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined)

    const perfMetrics = await import('./perfMetrics')
    perfMetrics.initializePerfMetrics({ getActiveWindows: () => [] })

    perfMetrics.subscribeToPerfMetrics({ sender: { id: 11 } } as unknown as IpcMainInvokeEvent)
    perfMetrics.subscribeToPerfMetrics({ sender: { id: 12 } } as unknown as IpcMainInvokeEvent)

    perfMetrics.cleanupPerfSubscriber(11)
    expect(clearIntervalSpy).not.toHaveBeenCalled()

    perfMetrics.cleanupPerfSubscriber(12)
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1)

    perfMetrics.clearPerfSubscribers()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
  })
})
