/**
 * promptDiffScheduler.test.ts — Unit tests for Wave 37 Phase B scheduler.
 *
 * Covers: first system/init event triggers diff check, non-system events are
 * ignored, duplicate sessions are not checked twice, changed result pushes IPC,
 * unchanged result does not push IPC.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./promptDiff', () => ({
  checkPromptChanged: vi.fn(),
}))

vi.mock('./ptyAgentBridge', () => ({
  subscribeSessionEvents: vi.fn(),
}))

vi.mock('./windowManager', () => ({
  getAllActiveWindows: vi.fn(),
}))

vi.mock('./logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { checkPromptChanged } from './promptDiff'
import {
  clearPromptDiffSession,
  watchSessionForPromptDiff,
} from './promptDiffScheduler'
import { subscribeSessionEvents } from './ptyAgentBridge'
import { getAllActiveWindows } from './windowManager'

// ── Helpers ───────────────────────────────────────────────────────────────────

type EventCallback = (event: Record<string, unknown>) => void

const mockSubscribe = subscribeSessionEvents as unknown as ReturnType<typeof vi.fn>
const mockCheckPrompt = checkPromptChanged as unknown as ReturnType<typeof vi.fn>
const mockGetWindows = getAllActiveWindows as unknown as ReturnType<typeof vi.fn>

function captureSubscriber(): { emit: EventCallback; cleanup: ReturnType<typeof vi.fn> } {
  let captured: EventCallback | null = null
  const cleanup = vi.fn()
  mockSubscribe.mockImplementationOnce((_id: string, cb: EventCallback) => {
    captured = cb
    return cleanup
  })
  return {
    emit: (event) => { captured?.(event) },
    cleanup,
  }
}

function makeFakeWindow(): { webContents: { send: ReturnType<typeof vi.fn> }; isDestroyed: () => boolean } {
  return { webContents: { send: vi.fn() }, isDestroyed: () => false }
}

function systemInitEvent(promptText: string): Record<string, unknown> {
  return { type: 'system', subtype: 'init', system_prompt: promptText }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('watchSessionForPromptDiff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mockSubscribe implementation queue so stale mockImplementationOnce
    // calls from prior tests (e.g. the "no re-watch" test's second captureSubscriber)
    // do not pollute subsequent tests.
    mockSubscribe.mockReset()
    // Default: no windows
    mockGetWindows.mockReturnValue([])
    // Default: no change
    mockCheckPrompt.mockResolvedValue({ changed: false })
  })

  it('subscribes to session events on first watch', () => {
    captureSubscriber()
    watchSessionForPromptDiff('session-1')
    expect(mockSubscribe).toHaveBeenCalledWith('session-1', expect.any(Function))
  })

  it('ignores non-system events and does not call checkPromptChanged', async () => {
    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-2')

    emit({ type: 'assistant', content: [] })
    emit({ type: 'result', is_error: false })

    await Promise.resolve()
    expect(mockCheckPrompt).not.toHaveBeenCalled()
  })

  it('calls checkPromptChanged when first system/init event arrives', async () => {
    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-3')

    emit(systemInitEvent('The system prompt text'))

    await vi.waitFor(() => expect(mockCheckPrompt).toHaveBeenCalledOnce())
  })

  it('does not fire twice for the same session (deduplication)', async () => {
    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-4')

    emit(systemInitEvent('prompt text'))
    emit(systemInitEvent('prompt text again'))

    await vi.waitFor(() => expect(mockCheckPrompt).toHaveBeenCalledOnce())
    expect(mockCheckPrompt).toHaveBeenCalledOnce()
  })

  it('does not re-watch a session already in the checked set', async () => {
    // First watch + fire
    const sub1 = captureSubscriber()
    watchSessionForPromptDiff('session-5')
    sub1.emit(systemInitEvent('prompt'))
    await vi.waitFor(() => expect(mockCheckPrompt).toHaveBeenCalledOnce())

    // Second watch should be a no-op
    mockCheckPrompt.mockClear()
    captureSubscriber()
    watchSessionForPromptDiff('session-5')
    // subscribeSessionEvents should NOT have been called again
    expect(mockSubscribe).toHaveBeenCalledTimes(1)
  })

  it('sends ecosystem:promptDiff to windows when changed:true', async () => {
    const win = makeFakeWindow()
    mockGetWindows.mockReturnValue([win])
    mockCheckPrompt.mockResolvedValue({
      changed: true,
      previousText: 'old prompt\nline b\nline c',
      currentText: 'new prompt\nline x\nline y',
      linesAdded: 3,
      linesRemoved: 3,
    })

    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-6')
    emit(systemInitEvent('new prompt\nline x\nline y'))

    await vi.waitFor(() => expect(win.webContents.send).toHaveBeenCalled())
    expect(win.webContents.send).toHaveBeenCalledWith(
      'ecosystem:promptDiff',
      expect.objectContaining({ linesAdded: 3, linesRemoved: 3 }),
    )
  })

  it('does not send IPC when changed:false', async () => {
    const win = makeFakeWindow()
    mockGetWindows.mockReturnValue([win])
    mockCheckPrompt.mockResolvedValue({ changed: false })

    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-7')
    emit(systemInitEvent('unchanged prompt'))

    await vi.waitFor(() => expect(mockCheckPrompt).toHaveBeenCalled())
    expect(win.webContents.send).not.toHaveBeenCalled()
  })

  it('skips destroyed windows when broadcasting', async () => {
    const liveWin = makeFakeWindow()
    const deadWin = { webContents: { send: vi.fn() }, isDestroyed: () => true }
    mockGetWindows.mockReturnValue([deadWin, liveWin])
    mockCheckPrompt.mockResolvedValue({
      changed: true,
      previousText: 'a\nb\nc',
      currentText: 'x\ny\nz',
      linesAdded: 3,
      linesRemoved: 3,
    })

    const { emit } = captureSubscriber()
    watchSessionForPromptDiff('session-8')
    emit(systemInitEvent('x\ny\nz'))

    await vi.waitFor(() => expect(liveWin.webContents.send).toHaveBeenCalled())
    expect(deadWin.webContents.send).not.toHaveBeenCalled()
  })
})

describe('clearPromptDiffSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe.mockReset()
    mockGetWindows.mockReturnValue([])
    mockCheckPrompt.mockResolvedValue({ changed: false })
  })

  it('removes session from checked set so it can be re-watched', async () => {
    mockCheckPrompt.mockResolvedValue({ changed: false })

    // Populate the checked set
    const sub1 = captureSubscriber()
    watchSessionForPromptDiff('session-clear')
    sub1.emit(systemInitEvent('text'))
    await vi.waitFor(() => expect(mockCheckPrompt).toHaveBeenCalledOnce())
    mockCheckPrompt.mockClear()

    // Clear and re-watch — subscribe should be called again
    clearPromptDiffSession('session-clear')
    captureSubscriber()
    watchSessionForPromptDiff('session-clear')
    expect(mockSubscribe).toHaveBeenCalledTimes(2)
  })
})
