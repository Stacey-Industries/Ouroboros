/**
 * Wave 36 Phase B — Claude SessionProvider adapter.
 *
 * Thin facade over the existing PTY machinery. Does NOT rewrite spawn logic —
 * delegates to `spawnAgentPty` / `writeToPty` / `killPty` unchanged.
 *
 * Intentionally NOT translated to the common SessionEvent shape:
 * - Tool-call traces: surfaced as raw StreamJsonEvent in payload.
 * - Thinking blocks: passed through as payload.
 * - Cost telemetry: emitted as 'cost-update' when result carries total_cost_usd.
 * - Resume semantics: delegated to ptyAgent (--resume flag).
 *
 * The only allowed modification to existing files in this phase was adding
 * `subscribeSessionEvents` to ptyAgentBridge.ts.
 */

import { execFile } from 'child_process'

import log from '../logger'
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes'
import { killPty, writeToPty } from '../pty'
import type { AgentPtyOptions } from '../ptyAgent'
import { spawnAgentPty } from '../ptyAgent'
import { subscribeSessionEvents } from '../ptyAgentBridge'
import { getAllActiveWindows } from '../windowManager'
import type {
  AvailabilityResult,
  SessionEvent,
  SessionHandle,
  SessionProvider,
  SpawnOptions,
} from './sessionProvider'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWindow(): Electron.BrowserWindow {
  const wins = getAllActiveWindows().filter((w) => !w.isDestroyed())
  const win = wins[0]
  if (!win) throw new Error('ClaudeSessionProvider: no active BrowserWindow')
  return win
}

function toAgentPtyOptions(opts: SpawnOptions): AgentPtyOptions {
  return {
    prompt: opts.prompt,
    cwd: opts.projectPath,
    model: opts.profile?.model,
    permissionMode: opts.profile?.permissionMode,
    resumeSessionId: opts.resumeThreadId,
  }
}

function translateEvent(raw: StreamJsonEvent, sessionId: string): SessionEvent {
  if (raw.type === 'result' && !raw.is_error && raw.total_cost_usd !== undefined) {
    return {
      type: 'cost-update',
      sessionId,
      payload: { costUsd: raw.total_cost_usd, raw },
      at: Date.now(),
    }
  }
  if (raw.type === 'result') {
    return {
      type: raw.is_error ? 'error' : 'completion',
      sessionId,
      payload: raw,
      at: Date.now(),
    }
  }
  if (raw.type === 'assistant') {
    return { type: 'stdout', sessionId, payload: raw, at: Date.now() }
  }
  return { type: 'stdout', sessionId, payload: raw, at: Date.now() }
}

// ---------------------------------------------------------------------------
// ClaudeSessionProvider
// ---------------------------------------------------------------------------

export class ClaudeSessionProvider implements SessionProvider {
  readonly id = 'claude'
  readonly label = 'Claude (Anthropic)'
  readonly binary = 'claude'

  checkAvailability(): Promise<AvailabilityResult> {
    return new Promise((resolve) => {
      // eslint-disable-next-line security/detect-non-literal-require
      execFile('claude', ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ available: false, reason: err.message })
          return
        }
        const version = stdout.trim().split('\n')[0] ?? ''
        resolve({ available: true, binary: 'claude', version })
      })
    })
  }

  async spawn(opts: SpawnOptions): Promise<SessionHandle> {
    const win = resolveWindow()
    const ptyOpts = toAgentPtyOptions(opts)
    const raw = await spawnAgentPty(opts.sessionId, win, ptyOpts)
    if (!raw.success || !raw.sessionId) {
      throw new Error(raw.error ?? 'ClaudeSessionProvider: spawn failed')
    }
    log.info(`[ClaudeSessionProvider] spawned session ${raw.sessionId}`)
    return {
      id: opts.sessionId,
      providerId: this.id,
      ptySessionId: raw.sessionId,
      startedAt: Date.now(),
      status: 'starting',
    }
  }

  async send(handle: SessionHandle, text: string): Promise<void> {
    const result = writeToPty(handle.ptySessionId, text)
    if (!result.success) {
      throw new Error(result.error ?? 'ClaudeSessionProvider: write failed')
    }
  }

  async cancel(handle: SessionHandle): Promise<void> {
    const result = await killPty(handle.ptySessionId)
    if (!result.success) {
      log.warn(`[ClaudeSessionProvider] cancel failed for ${handle.ptySessionId}:`, result.error)
    }
  }

  onEvent(handle: SessionHandle, cb: (e: SessionEvent) => void): () => void {
    const { ptySessionId } = handle
    return subscribeSessionEvents(ptySessionId, (raw: StreamJsonEvent) => {
      cb(translateEvent(raw, handle.id))
    })
  }
}
