import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
