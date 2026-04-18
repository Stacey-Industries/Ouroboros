/**
 * Wave 36 Phase C — CodexSessionProvider unit tests.
 *
 * Mocks all external dependencies so no real processes are created.
 * Tests assert delegation and event translation only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before module imports
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../orchestration/providers/codexExecRunner', () => ({
  spawnCodexExecProcess: vi.fn(),
}))

vi.mock('../config', () => ({
  getConfigValue: vi.fn(),
}))

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { ExecFileException } from 'child_process'
import { execFile } from 'child_process'

import { getConfigValue } from '../config'
import type { CodexExecEvent } from '../orchestration/providers/codexExecRunner'
import { spawnCodexExecProcess } from '../orchestration/providers/codexExecRunner'
import { CodexSessionProvider } from './codexSessionProvider'
import type { SessionHandle, SpawnOptions } from './sessionProvider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOpts: SpawnOptions = {
  prompt: 'Write a hello world function',
  projectPath: '/tmp/proj',
  sessionId: 'codex-test-1',
}

const baseHandle: SessionHandle = {
  id: 'codex-test-1',
  providerId: 'codex',
  ptySessionId: 'codex-test-1',
  startedAt: Date.now(),
  status: 'starting',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockExecHandle {
  kill: ReturnType<typeof vi.fn>
  pid: number
  threadId: string | null
  result: Promise<{ threadId: string | null; usage?: undefined; durationMs: number }>
  resolveResult: (v: { threadId: string | null; usage?: undefined; durationMs: number }) => void
  rejectResult: (err: Error) => void
  capturedOnEvent: ((e: CodexExecEvent) => void) | undefined
}

function makeMockHandle(): MockExecHandle {
  let resolveResult!: (v: { threadId: string | null; usage?: undefined; durationMs: number }) => void
  let rejectResult!: (err: Error) => void
  const result = new Promise<{ threadId: string | null; usage?: undefined; durationMs: number }>(
    (res, rej) => {
      resolveResult = res
      rejectResult = rej
    },
  )
  const handle: MockExecHandle = {
    kill: vi.fn(),
    pid: 12345,
    threadId: null,
    result,
    resolveResult,
    rejectResult,
    capturedOnEvent: undefined,
  }
  return handle
}

function setupMockExec(handle: MockExecHandle): void {
  vi.mocked(spawnCodexExecProcess).mockImplementation((opts) => {
    handle.capturedOnEvent = opts.onEvent
    return {
      kill: handle.kill as unknown as () => void,
      pid: handle.pid,
      get threadId() {
        return handle.threadId
      },
      result: handle.result,
    }
  })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getConfigValue).mockReturnValue({ model: '', reasoningEffort: 'medium' } as ReturnType<
    typeof getConfigValue
  >)
})

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

describe('CodexSessionProvider identity', () => {
  it('has the correct id, label, and binary', () => {
    const p = new CodexSessionProvider()
    expect(p.id).toBe('codex')
    expect(p.label).toBe('Codex (OpenAI)')
    expect(p.binary).toBe('codex')
  })
})

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

describe('checkAvailability', () => {
  it('returns available:true with version when codex --version succeeds', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: null, stdout: string, stderr: string) => void)(null, 'codex 0.9.1\n', '')
      return {} as ReturnType<typeof execFile>
    })
    const result = await new CodexSessionProvider().checkAvailability()
    expect(result.available).toBe(true)
    expect(result.version).toBe('codex 0.9.1')
    expect(result.binary).toBe('codex')
  })

  it('returns available:false with reason when execFile errors', async () => {
    const fakeErr = Object.assign(new Error('not found'), {
      code: 'ENOENT',
    }) as ExecFileException
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: ExecFileException) => void)(fakeErr)
      return {} as ReturnType<typeof execFile>
    })
    const result = await new CodexSessionProvider().checkAvailability()
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(/not found/)
  })
})

// ---------------------------------------------------------------------------
// spawn
// ---------------------------------------------------------------------------

describe('spawn', () => {
  it('delegates to spawnCodexExecProcess and returns a SessionHandle', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    // Prevent unhandled rejection from the background result chain
    handle.result.catch(() => undefined)

    const result = await new CodexSessionProvider().spawn(baseOpts)
    expect(spawnCodexExecProcess).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Write a hello world function',
        cwd: '/tmp/proj',
      }),
    )
    expect(result.id).toBe('codex-test-1')
    expect(result.providerId).toBe('codex')
    expect(result.status).toBe('starting')
  })

  it('passes resumeThreadId to the exec process', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const opts: SpawnOptions = { ...baseOpts, resumeThreadId: 'thread-abc' }
    await new CodexSessionProvider().spawn(opts)
    expect(spawnCodexExecProcess).toHaveBeenCalledWith(
      expect.objectContaining({ resumeThreadId: 'thread-abc' }),
    )
  })

  it('passes model from config as a cliArg when set', async () => {
    vi.mocked(getConfigValue).mockReturnValue({ model: 'gpt-5.4', reasoningEffort: 'medium' } as ReturnType<
      typeof getConfigValue
    >)
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    await new CodexSessionProvider().spawn(baseOpts)
    expect(spawnCodexExecProcess).toHaveBeenCalledWith(
      expect.objectContaining({ cliArgs: ['--model', 'gpt-5.4'] }),
    )
  })
})

// ---------------------------------------------------------------------------
// send
// ---------------------------------------------------------------------------

describe('send', () => {
  it('is a no-op and resolves without error', async () => {
    await expect(
      new CodexSessionProvider().send(baseHandle, 'follow-up text'),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('calls kill on the underlying process handle', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    await provider.cancel(sessionHandle)
    expect(handle.kill).toHaveBeenCalledOnce()
  })

  it('does not throw when no active session exists', async () => {
    const staleHandle: SessionHandle = { ...baseHandle, id: 'no-such-session' }
    await expect(new CodexSessionProvider().cancel(staleHandle)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// onEvent — event translation
// ---------------------------------------------------------------------------

describe('onEvent', () => {
  it('translates a turn.completed event with usage to cost-update', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({
      type: 'turn.completed',
      usage: { input_tokens: 100, output_tokens: 50, cached_input_tokens: 10 },
    })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cost-update',
        sessionId: 'codex-test-1',
        payload: expect.objectContaining({ inputTokens: 100, outputTokens: 50 }),
      }),
    )
  })

  it('translates a turn.completed event without usage to completion', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({ type: 'turn.completed' })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'completion', sessionId: 'codex-test-1' }),
    )
  })

  it('translates an agent_message item.completed to stdout', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({
      type: 'item.completed',
      item: { id: 'i1', type: 'agent_message', text: 'Hello world' },
    })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stdout', sessionId: 'codex-test-1', payload: 'Hello world' }),
    )
  })

  it('translates a command_execution item.completed to tool-use', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({
      type: 'item.completed',
      item: { id: 'i2', type: 'command_execution', command: 'ls -la', exit_code: 0, status: 'done' },
    })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool-use', sessionId: 'codex-test-1' }),
    )
  })

  it('translates turn.failed to error', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({
      type: 'turn.failed',
      error: { message: 'rate limit exceeded' },
    })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        sessionId: 'codex-test-1',
        payload: expect.objectContaining({ message: 'rate limit exceeded' }),
      }),
    )
  })

  it('emits unrecognized event types as stdout (nothing dropped)', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({ type: 'some.future.event', data: 42 })

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stdout', sessionId: 'codex-test-1' }),
    )
  })

  it('silently skips thread.started, turn.started, item.started (no callback fired)', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(sessionHandle, cb)

    handle.capturedOnEvent?.({ type: 'thread.started', thread_id: 'tid-1' })
    handle.capturedOnEvent?.({ type: 'turn.started' })
    handle.capturedOnEvent?.({
      type: 'item.started',
      item: { id: 'i3', type: 'command_execution', command: 'ls' },
    })

    expect(cb).not.toHaveBeenCalled()
  })

  it('cleanup function unsubscribes the listener', async () => {
    const handle = makeMockHandle()
    setupMockExec(handle)
    handle.result.catch(() => undefined)

    const provider = new CodexSessionProvider()
    const sessionHandle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    const unsubscribe = provider.onEvent(sessionHandle, cb)

    unsubscribe()
    handle.capturedOnEvent?.({ type: 'turn.completed' })
    expect(cb).not.toHaveBeenCalled()
  })

  it('returns a no-op cleanup when session is not found', () => {
    const staleHandle: SessionHandle = { ...baseHandle, id: 'ghost-session' }
    const unsubscribe = new CodexSessionProvider().onEvent(staleHandle, vi.fn())
    expect(() => unsubscribe()).not.toThrow()
  })
})
