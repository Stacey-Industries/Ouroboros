// ---------------------------------------------------------------------------
// Stream-JSON process runner for Claude Code
// Spawns `claude -p --output-format stream-json` and parses NDJSON output.
// ---------------------------------------------------------------------------

import { type ChildProcess, spawn } from 'child_process'

import type {
  StreamJsonEvent,
  StreamJsonProcessHandle,
  StreamJsonResultEvent,
  StreamJsonSpawnOptions,
} from './streamJsonTypes'

// ---- Arg builder (exported for testability) --------------------------------

export interface StreamJsonArgs {
  command: string
  args: string[]
}

export function buildStreamJsonArgs(options: StreamJsonSpawnOptions): StreamJsonArgs {
  const cliArgs: string[] = [
    '-p',
    '--verbose',
    '--output-format',
    'stream-json',
  ]

  if (options.model) {
    cliArgs.push('--model', options.model)
  }
  if (options.permissionMode) {
    cliArgs.push('--permission-mode', options.permissionMode)
  }
  if (options.dangerouslySkipPermissions) {
    cliArgs.push('--dangerously-skip-permissions')
  }
  if (options.continueSession) {
    cliArgs.push('--continue')
  }
  if (options.resumeSessionId) {
    cliArgs.push('--resume', options.resumeSessionId)
  }

  // Only cap turns for 'low' effort (quick lookup queries).
  // All other effort levels run without --max-turns, matching Claude Code CLI
  // behavior: the model decides when it's done.
  if (options.effort === 'low') {
    cliArgs.push('--max-turns', '5')
  }

  // Prompt is piped via stdin (not passed as a positional arg) to avoid
  // shell-escaping issues and command-line length limits on Windows.

  if (process.platform === 'win32') {
    // Security: use single-quote escaping for each argument to prevent
    // command injection through PowerShell metacharacters. Single-quoted
    // strings in PowerShell are literal — no variable expansion or
    // subexpression evaluation.
    const escaped = ['claude', ...cliArgs]
      .map((a) => `'${a.replace(/'/g, "''")}'`)
      .join(' ')
    return {
      command: 'powershell.exe',
      args: ['-NoLogo', '-Command', `& ${escaped}`],
    }
  }

  return { command: 'claude', args: cliArgs }
}

// ---- Env builder (self-contained, no pty import) ---------------------------

function buildProcessEnv(extraEnv?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    ...extraEnv,
  } as Record<string, string>
}

// ---- Buffer size limit (security: prevent OOM from runaway output) ----------
//
// A broken or malicious Claude Code process could send unlimited data and
// exhaust the IDE's memory.  Cap the accumulated buffer at 100 MB.
const MAX_BUFFER_BYTES = 100 * 1024 * 1024

// ---- NDJSON line parser ----------------------------------------------------

function tryParseEvent(line: string): StreamJsonEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as StreamJsonEvent
    }
    console.warn('[stream-json] parsed JSON lacks "type" field:', trimmed.slice(0, 120))
    return null
  } catch {
    console.warn('[stream-json] malformed line:', trimmed.slice(0, 120))
    return null
  }
}

// ---- Main export -----------------------------------------------------------

export function spawnStreamJsonProcess(options: StreamJsonSpawnOptions): StreamJsonProcessHandle {
  const { command, args } = buildStreamJsonArgs(options)

  const child: ChildProcess = spawn(command, args, {
    cwd: options.cwd,
    env: buildProcessEnv(options.env),
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  // Write prompt to stdin and close it so claude reads it from stdin
  if (child.stdin) {
    child.stdin.write(options.prompt)
    child.stdin.end()
  }

  let sessionId: string | null = null
  let resultEvent: StreamJsonResultEvent | null = null
  let stderrBuf = ''
  let stdoutBuf = ''

  // We expose a mutable handle so `sessionId` can be updated after init.
  const handle: StreamJsonProcessHandle = {
    result: null as unknown as Promise<StreamJsonResultEvent>, // assigned below
    kill: () => {
      try {
        if (process.platform === 'win32') {
          // On Windows, child.kill() only kills the immediate PowerShell wrapper.
          // Use taskkill /T /F FIRST to force-kill the entire process tree
          // (including the actual claude process), then child.kill() as cleanup.
          // Order matters: taskkill is the reliable kill; child.kill() just
          // ensures Node's internal state is consistent.
          if (child.pid) {
            try {
              require('child_process').execSync(
                `taskkill /T /F /PID ${child.pid}`,
                { stdio: 'ignore', timeout: 5000 },
              )
            } catch {
              // Process may already be dead — ignore.
            }
          }
          try { child.kill() } catch { /* already dead */ }
        } else {
          child.kill('SIGTERM')
        }
      } catch {
        // Process may already be dead — ignore.
      }
    },
    pid: child.pid,
    get sessionId() {
      return sessionId
    },
  }

  handle.result = new Promise<StreamJsonResultEvent>((resolve, reject) => {
    // --- stdout: NDJSON line parser ---
    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()

      // Security: prevent unbounded memory growth from a runaway process.
      if (stdoutBuf.length > MAX_BUFFER_BYTES) {
        console.error(`[stream-json] stdout buffer exceeded ${MAX_BUFFER_BYTES} bytes — killing process`)
        reject(new Error('Stream buffer exceeded maximum allowed size (100 MB). Process killed.'))
        try { child.kill() } catch { /* already dead */ }
        return
      }

      let newlineIdx: number
      while ((newlineIdx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, newlineIdx)
        stdoutBuf = stdoutBuf.slice(newlineIdx + 1)

        const event = tryParseEvent(line)
        if (!event) continue

        // Capture session_id from init event
        if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
          sessionId = event.session_id
        }

        // Capture result event
        if (event.type === 'result') {
          resultEvent = event as StreamJsonResultEvent
        }

        options.onEvent?.(event)
      }
    })

    // --- stderr: accumulate for error reporting ---
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString()

      // Security: cap stderr buffer too to prevent OOM from verbose error output.
      if (stderrBuf.length > MAX_BUFFER_BYTES) {
        stderrBuf = stderrBuf.slice(-MAX_BUFFER_BYTES)
      }
    })

    // --- Process close ---
    child.on('close', (code) => {
      // Flush any remaining partial line in stdout buffer
      if (stdoutBuf.trim()) {
        const event = tryParseEvent(stdoutBuf)
        if (event) {
          if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
            sessionId = event.session_id
          }
          if (event.type === 'result') {
            resultEvent = event as StreamJsonResultEvent
          }
          options.onEvent?.(event)
        }
        stdoutBuf = ''
      }

      if (resultEvent) {
        resolve(resultEvent)
        return
      }

      if (code === 0 || code === null) {
        // Clean exit with no explicit result event — synthesize one
        resolve({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: '',
          session_id: sessionId ?? undefined,
        })
      } else {
        reject(new Error(`Claude Code exited with code ${code}: ${stderrBuf.trim()}`))
      }
    })

    child.on('error', (err) => {
      reject(err)
    })
  })

  return handle
}
