/**
 * Wave 36 Phase D — GeminiSessionProvider unit tests.
 *
 * Mocks all external dependencies so no real processes are created.
 * Tests assert availability check, spawn args, event translation, cancel,
 * send no-op, and onEvent unsubscribe.
 */

import { EventEmitter } from 'events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before module imports
// ---------------------------------------------------------------------------

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('../logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import type { ExecFileException } from 'child_process'
import { execFile, spawn } from 'child_process'

import { GeminiSessionProvider } from './geminiSessionProvider'
import type { SessionHandle, SpawnOptions } from './sessionProvider'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseOpts: SpawnOptions = {
  prompt: 'Explain recursion',
  projectPath: '/tmp/gemini-proj',
  sessionId: 'gemini-test-1',
}

const baseHandle: SessionHandle = {
  id: 'gemini-test-1',
  providerId: 'gemini',
  ptySessionId: 'gemini-test-1',
  startedAt: Date.now(),
  status: 'starting',
}

// ---------------------------------------------------------------------------
// Mock child process factory
// ---------------------------------------------------------------------------

interface MockProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
}

function makeMockProcess(): MockProcess {
  const proc = new EventEmitter() as MockProcess
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.pid = 99999
  proc.kill = vi.fn()
  return proc
}

function setupMockSpawn(proc: MockProcess): void {
  vi.mocked(spawn).mockReturnValue(proc as ReturnType<typeof spawn>)
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

describe('GeminiSessionProvider identity', () => {
  it('has the correct id, label, and binary', () => {
    const p = new GeminiSessionProvider()
    expect(p.id).toBe('gemini')
    expect(p.label).toBe('Gemini (Google)')
    expect(p.binary).toBe('gemini')
  })
})

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

describe('checkAvailability', () => {
  it('returns available:true with version when gemini --version exits 0', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: null, stdout: string, stderr: string) => void)(null, 'gemini 0.1.5\n', '')
      return {} as ReturnType<typeof execFile>
    })
    const result = await new GeminiSessionProvider().checkAvailability()
    expect(result.available).toBe(true)
    expect(result.version).toBe('gemini 0.1.5')
    expect(result.binary).toBe('gemini')
  })

  it('returns available:false with reason when execFile errors (CLI not installed)', async () => {
    const fakeErr = Object.assign(new Error('spawn gemini ENOENT'), {
      code: 'ENOENT',
    }) as ExecFileException
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      ;(cb as (err: ExecFileException) => void)(fakeErr)
      return {} as ReturnType<typeof execFile>
    })
    const result = await new GeminiSessionProvider().checkAvailability()
    expect(result.available).toBe(false)
    expect(result.reason).toMatch(/ENOENT/)
  })
})

// ---------------------------------------------------------------------------
// spawn
// ---------------------------------------------------------------------------

describe('spawn', () => {
  it('calls spawn with gemini binary and --prompt + --yolo flags', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    await new GeminiSessionProvider().spawn(baseOpts)

    expect(spawn).toHaveBeenCalledWith(
      'gemini',
      ['--prompt', 'Explain recursion', '--yolo'],
      expect.objectContaining({ cwd: '/tmp/gemini-proj' }),
    )
  })

  it('returns a SessionHandle with correct shape', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const handle = await new GeminiSessionProvider().spawn(baseOpts)
    expect(handle.id).toBe('gemini-test-1')
    expect(handle.providerId).toBe('gemini')
    expect(handle.ptySessionId).toBe('gemini-test-1')
    expect(handle.status).toBe('starting')
  })
})

// ---------------------------------------------------------------------------
// send (no-op)
// ---------------------------------------------------------------------------

describe('send', () => {
  it('is a no-op and resolves without error', async () => {
    await expect(
      new GeminiSessionProvider().send(baseHandle, 'follow-up text'),
    ).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

describe('cancel', () => {
  it('calls kill(SIGTERM) on the underlying process', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    await provider.cancel(handle)

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('does not throw when no active session exists', async () => {
    const staleHandle: SessionHandle = { ...baseHandle, id: 'no-such-session' }
    await expect(new GeminiSessionProvider().cancel(staleHandle)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// onEvent — event translation
// ---------------------------------------------------------------------------

describe('onEvent', () => {
  it('translates NDJSON line with text field to stdout event', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.stdout.emit('data', Buffer.from('{"text":"Hello from Gemini"}\n'))

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stdout',
        sessionId: 'gemini-test-1',
        payload: 'Hello from Gemini',
      }),
    )
  })

  it('translates NDJSON line with content field to stdout event', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.stdout.emit('data', Buffer.from('{"content":"Gemini response content"}\n'))

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stdout',
        sessionId: 'gemini-test-1',
        payload: 'Gemini response content',
      }),
    )
  })

  it('falls back to stdout with raw text for non-JSON lines', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.stdout.emit('data', Buffer.from('plain text output from gemini\n'))

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stdout',
        sessionId: 'gemini-test-1',
        payload: 'plain text output from gemini',
      }),
    )
  })

  it('translates JSON with error field to error event', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.stdout.emit('data', Buffer.from('{"error":"API key invalid"}\n'))

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        sessionId: 'gemini-test-1',
      }),
    )
  })

  it('emits stderr data as stderr events', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.stderr.emit('data', Buffer.from('some warning from gemini\n'))

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'stderr',
        sessionId: 'gemini-test-1',
        payload: 'some warning from gemini',
      }),
    )
  })

  it('emits completion event on process close with exit code 0', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.emit('close', 0)

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'completion',
        sessionId: 'gemini-test-1',
        payload: expect.objectContaining({ exitCode: 0 }),
      }),
    )
  })

  it('emits error then completion on non-zero exit', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    provider.onEvent(handle, cb)

    proc.emit('close', 1)

    const types = vi.mocked(cb).mock.calls.map((c) => (c[0] as { type: string }).type)
    expect(types).toContain('error')
    expect(types).toContain('completion')
  })

  it('cleanup function unsubscribes the listener', async () => {
    const proc = makeMockProcess()
    setupMockSpawn(proc)

    const provider = new GeminiSessionProvider()
    const handle = await provider.spawn(baseOpts)
    const cb = vi.fn()
    const unsubscribe = provider.onEvent(handle, cb)

    unsubscribe()
    proc.stdout.emit('data', Buffer.from('{"text":"after unsubscribe"}\n'))

    expect(cb).not.toHaveBeenCalled()
  })

  it('returns a no-op cleanup when session is not found', () => {
    const staleHandle: SessionHandle = { ...baseHandle, id: 'ghost-session' }
    const unsubscribe = new GeminiSessionProvider().onEvent(staleHandle, vi.fn())
    expect(() => unsubscribe()).not.toThrow()
  })
})
