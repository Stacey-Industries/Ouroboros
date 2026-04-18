/**
 * Wave 36 Phase B — ClaudeSessionProvider unit tests.
 *
 * Mocks all external dependencies so no real processes or PTY sessions are
 * created.  Tests assert delegation only — no behavior changes to existing
 * machinery are verified here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before module imports
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../pty', () => ({
  writeToPty: vi.fn(),
  killPty: vi.fn(),
}))

vi.mock('../ptyAgent', () => ({
  spawnAgentPty: vi.fn(),
}))

vi.mock('../ptyAgentBridge', () => ({
  subscribeSessionEvents: vi.fn(),
}))

vi.mock('../windowManager', () => ({
  getAllActiveWindows: vi.fn(),
}))

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { ExecFileException } from 'child_process'
import { execFile } from 'child_process'

import { killPty, writeToPty } from '../pty'
import { spawnAgentPty } from '../ptyAgent'
import { subscribeSessionEvents } from '../ptyAgentBridge'
import { getAllActiveWindows } from '../windowManager'
import { ClaudeSessionProvider } from './claudeSessionProvider'
import type { SessionHandle, SpawnOptions } from './sessionProvider'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockWin = { id: 1, isDestroyed: () => false } as unknown as Electron.BrowserWindow

const baseOpts: SpawnOptions = {
  prompt: 'Hello',
  projectPath: '/tmp/proj',
  sessionId: 'test-session-1',
}

const baseHandle: SessionHandle = {
  id: 'test-session-1',
  providerId: 'claude',
  ptySessionId: 'test-session-1',
  startedAt: Date.now(),
  status: 'starting',
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAllActiveWindows).mockReturnValue([mockWin])
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeSessionProvider identity', () => {
  it('has the correct id, label, and binary', () => {
    const p = new ClaudeSessionProvider()
    expect(p.id).toBe('claude')
    expect(p.label).toBe('Claude (Anthropic)')
    expect(p.binary).toBe('claude')
  })
})

describe('checkAvailability', () => {
  it('returns available:true with version when claude --version succeeds', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: null, stdout: string, stderr: string) => void)(null, 'claude 1.2.3\n', '')
      return {} as ReturnType<typeof execFile>
    })
    const result = await new ClaudeSessionProvider().checkAvailability()
    expect(result.available).toBe(true)
    expect(result.version).toBe('claude 1.2.3')
    expect(result.binary).toBe('claude')
  })

  it('returns available:false with reason when execFile errors', async () => {
    const fakeErr = Object.assign(new Error('not found'), { code: 'ENOENT' }) as ExecFileException
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: ExecFileException) => void)(fakeErr)
      return {} as ReturnType<typeof execFile>
    })
    const result = await new ClaudeSessionProvider().checkAvailability()
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(/not found/)
  })
})

describe('spawn', () => {
  it('delegates to spawnAgentPty and returns a SessionHandle', async () => {
    vi.mocked(spawnAgentPty).mockReturnValue({
      success: true,
      sessionId: 'test-session-1',
    })
    const handle = await new ClaudeSessionProvider().spawn(baseOpts)
    expect(spawnAgentPty).toHaveBeenCalledWith('test-session-1', mockWin, expect.objectContaining({
      prompt: 'Hello',
      cwd: '/tmp/proj',
    }))
    expect(handle.id).toBe('test-session-1')
    expect(handle.providerId).toBe('claude')
    expect(handle.ptySessionId).toBe('test-session-1')
    expect(handle.status).toBe('starting')
  })

  it('throws when spawnAgentPty reports failure', async () => {
    vi.mocked(spawnAgentPty).mockReturnValue({ success: false, error: 'boom' })
    await expect(new ClaudeSessionProvider().spawn(baseOpts)).rejects.toThrow('boom')
  })

  it('translates profile fields into ptyAgent options', async () => {
    vi.mocked(spawnAgentPty).mockReturnValue({ success: true, sessionId: 'test-session-1' })
    const opts: SpawnOptions = {
      ...baseOpts,
      resumeThreadId: 'prev-thread',
      profile: { id: 'p1', model: 'claude-opus-4-5', permissionMode: 'allow' },
    }
    await new ClaudeSessionProvider().spawn(opts)
    expect(spawnAgentPty).toHaveBeenCalledWith('test-session-1', mockWin, expect.objectContaining({
      model: 'claude-opus-4-5',
      permissionMode: 'allow',
      resumeSessionId: 'prev-thread',
    }))
  })

  it('throws when no active window is available', async () => {
    vi.mocked(getAllActiveWindows).mockReturnValue([])
    await expect(new ClaudeSessionProvider().spawn(baseOpts)).rejects.toThrow('no active BrowserWindow')
  })
})

describe('send', () => {
  it('delegates to writeToPty', async () => {
    vi.mocked(writeToPty).mockReturnValue({ success: true })
    await new ClaudeSessionProvider().send(baseHandle, 'hello\n')
    expect(writeToPty).toHaveBeenCalledWith('test-session-1', 'hello\n')
  })

  it('throws when writeToPty fails', async () => {
    vi.mocked(writeToPty).mockReturnValue({ success: false, error: 'write error' })
    await expect(new ClaudeSessionProvider().send(baseHandle, 'x')).rejects.toThrow('write error')
  })
})

describe('cancel', () => {
  it('delegates to killPty', async () => {
    vi.mocked(killPty).mockResolvedValue({ success: true })
    await new ClaudeSessionProvider().cancel(baseHandle)
    expect(killPty).toHaveBeenCalledWith('test-session-1')
  })

  it('does not throw when killPty fails (logs a warning only)', async () => {
    vi.mocked(killPty).mockResolvedValue({ success: false, error: 'already dead' })
    await expect(new ClaudeSessionProvider().cancel(baseHandle)).resolves.toBeUndefined()
  })
})

describe('onEvent', () => {
  it('subscribes via subscribeSessionEvents and returns the cleanup function', () => {
    const cleanup = vi.fn()
    vi.mocked(subscribeSessionEvents).mockReturnValue(cleanup)
    const cb = vi.fn()
    const unsubscribe = new ClaudeSessionProvider().onEvent(baseHandle, cb)
    expect(subscribeSessionEvents).toHaveBeenCalledWith('test-session-1', expect.any(Function))
    expect(unsubscribe).toBe(cleanup)
  })

  it('translates a result event to a completion SessionEvent', () => {
    let captured: ((raw: unknown) => void) | null = null
    vi.mocked(subscribeSessionEvents).mockImplementation((_sid, innerCb) => {
      captured = innerCb as (raw: unknown) => void
      return () => undefined
    })
    const cb = vi.fn()
    new ClaudeSessionProvider().onEvent(baseHandle, cb)
    captured?.({
      type: 'result', subtype: 'success', is_error: false,
      result: 'done', session_id: 'test-session-1',
    })
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'completion',
      sessionId: 'test-session-1',
    }))
  })

  it('translates a result event with cost to a cost-update SessionEvent', () => {
    let captured: ((raw: unknown) => void) | null = null
    vi.mocked(subscribeSessionEvents).mockImplementation((_sid, innerCb) => {
      captured = innerCb as (raw: unknown) => void
      return () => undefined
    })
    const cb = vi.fn()
    new ClaudeSessionProvider().onEvent(baseHandle, cb)
    captured?.({
      type: 'result', subtype: 'success', is_error: false,
      result: 'done', total_cost_usd: 0.005, session_id: 'test-session-1',
    })
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({
      type: 'cost-update',
      sessionId: 'test-session-1',
    }))
  })

  it('translates an assistant event to a stdout SessionEvent', () => {
    let captured: ((raw: unknown) => void) | null = null
    vi.mocked(subscribeSessionEvents).mockImplementation((_sid, innerCb) => {
      captured = innerCb as (raw: unknown) => void
      return () => undefined
    })
    const cb = vi.fn()
    new ClaudeSessionProvider().onEvent(baseHandle, cb)
    captured?.({ type: 'assistant', message: { role: 'assistant', content: [] } })
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'stdout' }))
  })

  it('cleanup function unsubscribes the listener', () => {
    const cleanup = vi.fn()
    vi.mocked(subscribeSessionEvents).mockReturnValue(cleanup)
    const unsubscribe = new ClaudeSessionProvider().onEvent(baseHandle, vi.fn())
    unsubscribe()
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
