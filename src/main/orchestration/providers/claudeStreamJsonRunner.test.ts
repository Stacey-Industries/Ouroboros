import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildStreamJsonArgs, spawnStreamJsonProcess } from './claudeStreamJsonRunner'
import type { StreamJsonEvent, StreamJsonSpawnOptions } from './streamJsonTypes'

class FakeStdin {
  written: string[] = []
  ended = false

  write(data: string) {
    this.written.push(data)
    return true
  }

  end() {
    this.ended = true
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = new FakeStdin()
  pid = 12345
  killed = false
  _killSignal: string | undefined

  kill(signal?: string) {
    this.killed = true
    this._killSignal = signal
  }
}

let fakeChild: FakeChildProcess

vi.mock('child_process', () => ({
  spawn: () => fakeChild,
}))

function defaultOptions(overrides?: Partial<StreamJsonSpawnOptions>): StreamJsonSpawnOptions {
  return {
    prompt: 'Hello world',
    cwd: '/tmp/test',
    ...overrides,
  }
}

function sendStdout(data: string) {
  fakeChild.stdout.emit('data', Buffer.from(data))
}

function sendStderr(data: string) {
  fakeChild.stderr.emit('data', Buffer.from(data))
}

function closeProcess(code: number | null) {
  fakeChild.emit('close', code)
}

function withLinuxPlatform<T>(fn: () => T): T {
  const originalPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: 'linux' })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  }
}

function registerUnixArgTests(): void {
  it('returns correct args for Unix (prompt not in args)', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions())
      expect(result.command).toBe('claude')
      expect(result.args).toContain('-p')
      expect(result.args).toContain('--verbose')
      expect(result.args).toContain('--output-format')
      expect(result.args).toContain('stream-json')
      expect(result.args).not.toContain('Hello world')
    })
  })

  it('includes --model when specified', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions({ model: 'opus' }))
      const idx = result.args.indexOf('--model')
      expect(idx).toBeGreaterThan(-1)
      expect(result.args[idx + 1]).toBe('opus')
    })
  })

  it('includes --continue when specified', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions({ continueSession: true }))
      expect(result.args).toContain('--continue')
    })
  })

  it('includes --permission-mode when specified', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions({ permissionMode: 'plan' }))
      const idx = result.args.indexOf('--permission-mode')
      expect(idx).toBeGreaterThan(-1)
      expect(result.args[idx + 1]).toBe('plan')
    })
  })
}

function registerWindowsArgTests(): void {
  it('returns correct args for Windows (prompt not in args)', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      const result = buildStreamJsonArgs(defaultOptions())
      expect(result.command).toBe('powershell.exe')
      expect(result.args[0]).toBe('-NoLogo')
      expect(result.args[1]).toBe('-Command')
      expect(result.args[2]).toContain('claude')
      expect(result.args[2]).toContain('stream-json')
      expect(result.args[2]).not.toContain('Hello world')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })
}

function registerResumeArgTests(): void {
  it('includes --resume when resumeSessionId specified', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions({ resumeSessionId: 'abc-123' }))
      const idx = result.args.indexOf('--resume')
      expect(idx).toBeGreaterThan(-1)
      expect(result.args[idx + 1]).toBe('abc-123')
    })
  })

  it('includes --dangerously-skip-permissions when specified', () => {
    withLinuxPlatform(() => {
      const result = buildStreamJsonArgs(defaultOptions({ dangerouslySkipPermissions: true }))
      expect(result.args).toContain('--dangerously-skip-permissions')
    })
  })
}

function registerArgTests(): void {
  registerUnixArgTests()
  registerWindowsArgTests()
  registerResumeArgTests()
}

function registerParseSpawnTests(): void {
  it('parses init event and captures sessionId', async () => {
    const events: StreamJsonEvent[] = []
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))

    sendStdout('{"type":"system","subtype":"init","session_id":"sess-42"}\n')
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"done"}\n')
    closeProcess(0)

    const result = await handle.result
    expect(handle.sessionId).toBe('sess-42')
    expect(events[0]).toEqual({ type: 'system', subtype: 'init', session_id: 'sess-42' })
    expect(result.subtype).toBe('success')
  })

  it('parses assistant event with text content', async () => {
    const events: StreamJsonEvent[] = []
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))
    const assistantEvent = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] } }
    sendStdout(JSON.stringify(assistantEvent) + '\n')
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"done"}\n')
    closeProcess(0)

    await handle.result
    expect(events[0]).toMatchObject({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hello!' }] } })
  })

  it('parses assistant event with tool_use content', async () => {
    const events: StreamJsonEvent[] = []
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))
    const toolEvent = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'read_file', input: { path: '/foo' } }] } }
    sendStdout(JSON.stringify(toolEvent) + '\n')
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":""}\n')
    closeProcess(0)

    await handle.result
    expect(events[0]).toMatchObject({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'read_file' }] } })
  })
}

function registerResultSpawnTests(): void {
  it('resolves result promise on success result event', async () => {
    const handle = spawnStreamJsonProcess(defaultOptions())
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"All done","duration_ms":1234}\n')
    closeProcess(0)
    const result = await handle.result
    expect(result.type).toBe('result')
    expect(result.subtype).toBe('success')
    expect(result.is_error).toBe(false)
    expect(result.result).toBe('All done')
    expect(result.duration_ms).toBe(1234)
  })

  it('rejects on non-zero exit code with stderr output', async () => {
    const handle = spawnStreamJsonProcess(defaultOptions())
    sendStderr('Something went wrong')
    closeProcess(1)
    await expect(handle.result).rejects.toThrow('Claude Code exited with code 1: Something went wrong')
  })

  it('synthesizes success result on clean exit without result event', async () => {
    const handle = spawnStreamJsonProcess(defaultOptions())
    sendStdout('{"type":"system","subtype":"init","session_id":"s2"}\n')
    closeProcess(0)
    const result = await handle.result
    expect(result.type).toBe('result')
    expect(result.subtype).toBe('success')
    expect(result.is_error).toBe(false)
    expect(result.session_id).toBe('s2')
  })
}

function registerStreamSpawnTests(): void {
  it('skips malformed JSON lines without crashing', async () => {
    const events: StreamJsonEvent[] = []
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))
    sendStdout('not json at all\n')
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":"ok"}\n')
    closeProcess(0)
    const result = await handle.result
    expect(result.result).toBe('ok')
    expect(events).toHaveLength(1)
    expect(warnSpy).toHaveBeenCalled()
  })

  it('handles partial lines split across chunks', async () => {
    const events: StreamJsonEvent[] = []
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))
    sendStdout('{"type":"system","sub')
    sendStdout('type":"init","session_id":"s1"}\n')
    sendStdout('{"type":"result","subtype":"success","is_error":false,"result":""}\n')
    closeProcess(0)
    await handle.result
    expect(handle.sessionId).toBe('s1')
    expect(events).toHaveLength(2)
  })

  it('skips blank lines', async () => {
    const events: StreamJsonEvent[] = []
    const handle = spawnStreamJsonProcess(defaultOptions({ onEvent: (e) => events.push(e) }))
    sendStdout('\n\n{"type":"result","subtype":"success","is_error":false,"result":"ok"}\n\n')
    closeProcess(0)
    await handle.result
    expect(events).toHaveLength(1)
  })
}

function registerProcessSpawnTests(): void {
  it('kill() terminates the child process', () => {
    const handle = spawnStreamJsonProcess(defaultOptions())
    expect(fakeChild.killed).toBe(false)
    handle.kill()
    expect(fakeChild.killed).toBe(true)
  })

  it('exposes pid from child process', () => {
    const handle = spawnStreamJsonProcess(defaultOptions())
    expect(handle.pid).toBe(12345)
  })

  it('writes prompt to stdin and closes it', () => {
    spawnStreamJsonProcess(defaultOptions({ prompt: 'Test prompt with "quotes" and $vars' }))
    expect(fakeChild.stdin.written).toEqual(['Test prompt with "quotes" and $vars'])
    expect(fakeChild.stdin.ended).toBe(true)
  })
}

function registerSpawnTests(): void {
  registerParseSpawnTests()
  registerResultSpawnTests()
  registerStreamSpawnTests()
  registerProcessSpawnTests()
}

describe('claudeStreamJsonRunner', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildStreamJsonArgs', registerArgTests)
  describe('spawnStreamJsonProcess', registerSpawnTests)
})
