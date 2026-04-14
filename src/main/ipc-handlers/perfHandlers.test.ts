/**
 * perfHandlers.test.ts — Smoke tests for perf IPC handler registration.
 *
 * Verifies that registerPerfHandlers wires the expected channels and that
 * perf:markFirstRender triggers logging + JSONL persistence side effects.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockHandle = vi.fn()
const mockSubscribe = vi.fn(() => ({ success: true }))
const mockUnsubscribe = vi.fn(() => ({ success: true }))
const mockMarkStartup = vi.fn()
const mockFormatSummary = vi.fn(() => 'app-ready=10ms first-render=200ms')
const mockGetStartupTimings = vi.fn(() => [])
const mockGetLatestPerfMetrics = vi.fn(() => null)
const mockAppendRecord = vi.fn()
const mockLogInfo = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
    getVersion: vi.fn(() => '1.0.0'),
    commandLine: { appendSwitch: vi.fn() },
  },
  ipcMain: { handle: mockHandle, on: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
}))

vi.mock('mica-electron', () => ({
  MicaBrowserWindow: class MicaBrowserWindowMock {},
}))

vi.mock('../logger', () => ({
  default: { info: mockLogInfo, warn: vi.fn(), error: vi.fn() },
}))

vi.mock('../perfMetrics', () => ({
  markStartup: mockMarkStartup,
  formatStartupSummary: mockFormatSummary,
  getStartupTimings: mockGetStartupTimings,
  getLatestPerfMetrics: mockGetLatestPerfMetrics,
  subscribeToPerfMetrics: mockSubscribe,
  unsubscribeFromPerfMetrics: mockUnsubscribe,
}))

vi.mock('../perfStartupLog', () => ({
  appendStartupRecord: mockAppendRecord,
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Capture all ipcMain.handle registrations, return a lookup by channel name. */
function captureHandlers(): Record<string, Parameters<typeof mockHandle>[1]> {
  const map: Record<string, Parameters<typeof mockHandle>[1]> = {}
  mockHandle.mockImplementation((channel: string, handler: Parameters<typeof mockHandle>[1]) => {
    // eslint-disable-next-line security/detect-object-injection -- channel comes from ipcMain.handle call inside the module under test, not user input
    map[channel] = handler
  })
  return map
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('registerPerfHandlers', () => {
  let handlers: Record<string, Parameters<typeof mockHandle>[1]>

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()

    // Re-apply mock implementation after resetModules
    mockHandle.mockImplementation((channel: string, handler: Parameters<typeof mockHandle>[1]) => {
      // eslint-disable-next-line security/detect-object-injection -- channel is an IPC channel name from module under test, not user input
      handlers[channel] = handler
    })
    handlers = {}

    // Re-capture after module reload
    const mod = await import('./perfHandlers')
    handlers = captureHandlers()
    const channels: string[] = []
    mod.registerPerfHandlers(channels)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('registers all 6 expected channels', () => {
    const channels: string[] = []
    mockHandle.mockImplementation((ch: string) => channels.push(ch))

    // Fresh import after resetModules in beforeEach
    import('./perfHandlers').then((mod) => {
      mod.registerPerfHandlers(channels)
    })

    // Verify by checking the handler map keys from captureHandlers
    expect(Object.keys(handlers)).toEqual(
      expect.arrayContaining([
        'perf:ping',
        'perf:subscribe',
        'perf:unsubscribe',
        'perf:markFirstRender',
        'perf:getStartupTimings',
        'perf:getRuntimeMetrics',
      ]),
    )
  })

  it('perf:ping returns { success: true, ts: number }', () => {
    const result = handlers['perf:ping']?.({} as never, ...([] as never[]))
    expect(result).toMatchObject({ success: true })
    expect(typeof (result as { ts: number }).ts).toBe('number')
  })

  it('perf:markFirstRender calls markStartup, logs summary, and appends record', () => {
    mockFormatSummary.mockReturnValue('app-ready=10ms first-render=200ms')
    handlers['perf:markFirstRender']?.({} as never, ...([] as never[]))

    expect(mockMarkStartup).toHaveBeenCalledWith('first-render')
    expect(mockLogInfo).toHaveBeenCalledWith('[perf] startup:', 'app-ready=10ms first-render=200ms')
    expect(mockAppendRecord).toHaveBeenCalledWith(mockGetStartupTimings())
    expect(handlers['perf:markFirstRender']?.({} as never, ...([] as never[]))).toMatchObject({ success: true })
  })

  it('perf:markFirstRender does NOT log when summary is empty', () => {
    mockFormatSummary.mockReturnValue('')
    vi.clearAllMocks()
    handlers['perf:markFirstRender']?.({} as never, ...([] as never[]))

    expect(mockLogInfo).not.toHaveBeenCalled()
    expect(mockAppendRecord).toHaveBeenCalledTimes(1)
  })

  it('perf:getStartupTimings returns timings array', () => {
    const marks = [{ phase: 'app-ready' as const, tsNs: BigInt(0), deltaMs: 0 }]
    mockGetStartupTimings.mockReturnValue(marks as never)
    const result = handlers['perf:getStartupTimings']?.({} as never, ...([] as never[]))
    expect(result).toMatchObject({ success: true, timings: marks })
  })

  it('perf:getRuntimeMetrics returns null when no sample yet', () => {
    mockGetLatestPerfMetrics.mockReturnValue(null as never)
    const result = handlers['perf:getRuntimeMetrics']?.({} as never, ...([] as never[]))
    expect(result).toMatchObject({ success: true, metrics: null })
  })

  it('perf:getRuntimeMetrics returns sample when available', () => {
    const sample = { timestamp: Date.now(), memory: {}, processes: [] }
    mockGetLatestPerfMetrics.mockReturnValue(sample as never)
    const result = handlers['perf:getRuntimeMetrics']?.({} as never, ...([] as never[]))
    expect(result).toMatchObject({ success: true, metrics: sample })
  })
})
