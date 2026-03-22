import { type ChildProcess, spawn } from 'child_process'

export interface CodexUsage {
  input_tokens?: number
  cached_input_tokens?: number
  output_tokens?: number
}

export interface CodexThreadStartedEvent {
  type: 'thread.started'
  thread_id: string
}

export interface CodexTurnStartedEvent {
  type: 'turn.started'
}

export interface CodexTurnCompletedEvent {
  type: 'turn.completed'
  usage?: CodexUsage
}

export interface CodexTurnFailedEvent {
  type: 'turn.failed'
  error?: {
    message?: string
  }
}

export interface CodexErrorEvent {
  type: 'error'
  message?: string
}

export interface CodexAgentMessageItem {
  id: string
  type: 'agent_message'
  text?: string
}

export interface CodexCommandExecutionItem {
  id: string
  type: 'command_execution'
  command?: string
  aggregated_output?: string
  exit_code?: number | null
  status?: string
}

export interface CodexFileChange {
  path?: string
  kind?: string
}

export interface CodexFileChangeItem {
  id: string
  type: 'file_change'
  changes?: CodexFileChange[]
  status?: string
}

export interface CodexItemError {
  id: string
  type: 'error'
  message?: string
}

export interface CodexUnknownItem {
  id: string
  type: string
  [key: string]: unknown
}

export type CodexItem =
  | CodexAgentMessageItem
  | CodexCommandExecutionItem
  | CodexFileChangeItem
  | CodexItemError
  | CodexUnknownItem

export interface CodexItemStartedEvent {
  type: 'item.started'
  item: CodexItem
}

export interface CodexItemCompletedEvent {
  type: 'item.completed'
  item: CodexItem
}

export type CodexExecEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexTurnCompletedEvent
  | CodexTurnFailedEvent
  | CodexErrorEvent
  | CodexItemStartedEvent
  | CodexItemCompletedEvent
  | ({ type: string; [key: string]: unknown })

export interface CodexExecSpawnOptions {
  prompt: string
  cwd: string
  cliArgs?: string[]
  env?: Record<string, string>
  imagePaths?: string[]
  onEvent?: (event: CodexExecEvent) => void
  resumeThreadId?: string
}

export interface CodexExecResult {
  threadId: string | null
  usage?: CodexUsage
  durationMs: number
}

export interface CodexExecProcessHandle {
  result: Promise<CodexExecResult>
  kill: () => void
  pid?: number
  readonly threadId: string | null
}

export interface CodexExecArgs {
  command: string
  args: string[]
}

const MAX_BUFFER_BYTES = 100 * 1024 * 1024

function normalizeEventType(type: string): string {
  switch (type) {
    case 'thread_started':
      return 'thread.started'
    case 'turn_started':
      return 'turn.started'
    case 'turn_completed':
      return 'turn.completed'
    case 'turn_failed':
      return 'turn.failed'
    case 'item_started':
      return 'item.started'
    case 'item_completed':
      return 'item.completed'
    default:
      return type
  }
}

function escapePowerShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "''")}'`
}

export function buildCodexExecArgs(options: CodexExecSpawnOptions): CodexExecArgs {
  const imageArgs = (options.imagePaths ?? []).flatMap((imagePath) => ['--image', imagePath])
  const cliArgs = options.cliArgs ?? []

  const codexArgs = options.resumeThreadId
    // `codex exec` accepts shared exec flags before the `resume` subcommand.
    // Flags like `--sandbox` are rejected when placed after `resume`.
    ? ['exec', '--json', ...cliArgs, 'resume', ...imageArgs, options.resumeThreadId, '-']
    : ['exec', '--json', ...cliArgs, ...imageArgs, '-']

  if (process.platform === 'win32') {
    const escaped = ['codex', ...codexArgs].map(escapePowerShellArg).join(' ')
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    }
  }

  return {
    command: 'codex',
    args: codexArgs,
  }
}

function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>
}

function tryParseEvent(line: string): CodexExecEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      const normalizedType = normalizeEventType(parsed.type)
      if (normalizedType !== parsed.type) {
        return {
          ...(parsed as Record<string, unknown>),
          type: normalizedType,
        } as CodexExecEvent
      }
      return parsed as CodexExecEvent
    }
    console.warn('[codex-exec] parsed JSON lacks "type" field:', trimmed.slice(0, 120))
    return null
  } catch {
    console.warn('[codex-exec] malformed line:', trimmed.slice(0, 120))
    return null
  }
}

export function spawnCodexExecProcess(options: CodexExecSpawnOptions): CodexExecProcessHandle {
  const { command, args } = buildCodexExecArgs(options)
  const startedAt = Date.now()

  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  if (child.stdin) {
    child.stdin.write(options.prompt)
    child.stdin.end()
  }

  let threadId: string | null = null
  let lastUsage: CodexUsage | undefined
  let failureMessage: string | null = null
  let sawFailureEvent = false
  let stderrBuf = ''
  let stdoutBuf = ''

  const handle: CodexExecProcessHandle = {
    result: null as unknown as Promise<CodexExecResult>,
    kill: () => {
      try {
        if (process.platform === 'win32') {
          if (child.pid) {
            try {
              require('child_process').execSync(
                `taskkill /T /F /PID ${child.pid}`,
                { stdio: 'ignore', timeout: 5000 },
              )
            } catch {
              // ignore
            }
          }
          try { child.kill() } catch { /* ignore */ }
        } else {
          child.kill('SIGTERM')
        }
      } catch {
        // ignore
      }
    },
    pid: child.pid,
    get threadId() {
      return threadId
    },
  }

  handle.result = new Promise<CodexExecResult>((resolve, reject) => {
    const processEvent = (event: CodexExecEvent): void => {
      if (event.type === 'thread.started') {
        const threadStarted = event as CodexThreadStartedEvent
        if (typeof threadStarted.thread_id === 'string') {
          threadId = threadStarted.thread_id
        }
      } else if (event.type === 'turn.completed') {
        const turnCompleted = event as CodexTurnCompletedEvent
        if (turnCompleted.usage) {
          lastUsage = turnCompleted.usage
        }
      } else if (event.type === 'error') {
        const errorEvent = event as CodexErrorEvent
        sawFailureEvent = true
        failureMessage = errorEvent.message ?? failureMessage
      } else if (event.type === 'turn.failed') {
        const turnFailed = event as CodexTurnFailedEvent
        sawFailureEvent = true
        failureMessage = turnFailed.error?.message ?? failureMessage
      } else if (event.type === 'item.completed') {
        const completed = event as CodexItemCompletedEvent
        if (completed.item.type === 'error') {
          const itemError = completed.item as CodexItemError
          sawFailureEvent = true
          failureMessage = itemError.message ?? failureMessage
        }
      }

      options.onEvent?.(event)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()

      if (stdoutBuf.length > MAX_BUFFER_BYTES) {
        reject(new Error('Codex exec stdout buffer exceeded maximum allowed size (100 MB). Process killed.'))
        try { child.kill() } catch { /* ignore */ }
        return
      }

      let newlineIdx: number
      while ((newlineIdx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, newlineIdx)
        stdoutBuf = stdoutBuf.slice(newlineIdx + 1)

        const event = tryParseEvent(line)
        if (event) processEvent(event)
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()
      if (stderrBuf.length > MAX_BUFFER_BYTES) {
        stderrBuf = stderrBuf.slice(-MAX_BUFFER_BYTES)
      }
    })

    child.on('close', (code) => {
      if (stdoutBuf.trim()) {
        const event = tryParseEvent(stdoutBuf)
        if (event) processEvent(event)
        stdoutBuf = ''
      }

      if (code === 0 || code === null) {
        if (sawFailureEvent || failureMessage) {
          reject(new Error(failureMessage ?? 'Codex exec reported a failure event.'))
          return
        }
        resolve({
          threadId,
          usage: lastUsage,
          durationMs: Date.now() - startedAt,
        })
        return
      }

      const stderrMessage = stderrBuf.trim()
      const reason = failureMessage ?? stderrMessage ?? `Codex exited with code ${code}`
      reject(new Error(`Codex exec exited with code ${code}: ${reason}`))
    })

    child.on('error', (error) => reject(error))
  })

  return handle
}
