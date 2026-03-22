import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildCodexExecArgs,
  spawnCodexExecProcess,
  type CodexExecSpawnOptions,
  type CodexExecEvent,
} from './codexExecRunner'

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
  spawn: (..._args: unknown[]) => fakeChild,
}))

function defaultOptions(overrides?: Partial<CodexExecSpawnOptions>): CodexExecSpawnOptions {
  return {
    prompt: 'Review these changes',
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

describe('codexExecRunner', () => {
  beforeEach(() => {
    fakeChild = new FakeChildProcess()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('buildCodexExecArgs', () => {
    it('builds unix exec args without embedding the prompt', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })
      try {
        const result = buildCodexExecArgs(defaultOptions({ cliArgs: ['--model', 'gpt-5.4'] }))
        expect(result.command).toBe('codex')
        expect(result.args).toEqual(['exec', '--json', '--model', 'gpt-5.4', '-'])
        expect(result.args).not.toContain('Review these changes')
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })

    it('places resume after shared exec flags', () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'linux' })
      try {
        const result = buildCodexExecArgs(defaultOptions({
          cliArgs: ['--model', 'gpt-5.4', '--sandbox', 'workspace-write'],
          resumeThreadId: 'thread-123',
        }))
        expect(result.args).toEqual([
          'exec',
          '--json',
          '--model',
          'gpt-5.4',
          '--sandbox',
          'workspace-write',
          'resume',
          'thread-123',
          '-',
        ])
      } finally {
        Object.defineProperty(process, 'platform', { value: originalPlatform })
      }
    })
  })

  describe('spawnCodexExecProcess', () => {
    it('captures thread id, usage, and duration on success', async () => {
      const events: CodexExecEvent[] = []
      const handle = spawnCodexExecProcess(defaultOptions({ onEvent: (event) => events.push(event) }))

      sendStdout('{"type":"thread.started","thread_id":"thread-42"}\n')
      sendStdout('{"type":"turn.completed","usage":{"input_tokens":12,"cached_input_tokens":3,"output_tokens":7}}\n')
      closeProcess(0)

      const result = await handle.result
      expect(handle.threadId).toBe('thread-42')
      expect(result.threadId).toBe('thread-42')
      expect(result.usage).toEqual({ input_tokens: 12, cached_input_tokens: 3, output_tokens: 7 })
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
      expect(events).toHaveLength(2)
    })

    it('normalizes snake_case lifecycle events', async () => {
      const events: CodexExecEvent[] = []
      const handle = spawnCodexExecProcess(defaultOptions({ onEvent: (event) => events.push(event) }))

      sendStdout('{"type":"thread_started","thread_id":"thread-99"}\n')
      sendStdout('{"type":"turn_completed","usage":{"output_tokens":5}}\n')
      closeProcess(0)

      const result = await handle.result
      expect(result.threadId).toBe('thread-99')
      expect(events[0]?.type).toBe('thread.started')
      expect(events[1]?.type).toBe('turn.completed')
    })

    it('rejects when Codex emits a failure event even if the process exits cleanly', async () => {
      const handle = spawnCodexExecProcess(defaultOptions())

      sendStdout('{"type":"turn.failed","error":{"message":"Command failed"}}\n')
      closeProcess(0)

      await expect(handle.result).rejects.toThrow('Command failed')
    })

    it('rejects on non-zero exit code with stderr output', async () => {
      const handle = spawnCodexExecProcess(defaultOptions())

      sendStderr('Something went wrong')
      closeProcess(1)

      await expect(handle.result).rejects.toThrow('Codex exec exited with code 1: Something went wrong')
    })

    it('writes the prompt to stdin and closes it', () => {
      spawnCodexExecProcess(defaultOptions())

      expect(fakeChild.stdin.written).toEqual(['Review these changes'])
      expect(fakeChild.stdin.ended).toBe(true)
    })
  })
})
