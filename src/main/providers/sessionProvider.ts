/**
 * Wave 36 Phase A — SessionProvider interface.
 *
 * Distinct from `ModelProvider` in `src/main/providers.ts` (that type is the
 * Anthropic/OpenAI model catalog; this is the session-spawn abstraction).
 *
 * Implementations live in Phase B (claude), Phase C (codex), Phase D (gemini).
 * This file is interface + types only — no runtime code.
 */

export type SessionEventType =
  | 'stdout'
  | 'stderr'
  | 'tool-use'
  | 'completion'
  | 'error'
  | 'cost-update';

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  /** Narrowed per event type; see each adapter's header for the concrete shapes. */
  payload: unknown;
  /** Unix epoch in milliseconds. */
  at: number;
}

/**
 * Minimal subset of the profiles module that providers consume.
 * Deliberately loose — the profiles module may carry additional fields;
 * adapters must not require them.
 */
export interface ProfileSnapshot {
  id: string;
  model?: string;
  tools?: readonly string[];
  permissionMode?: 'allow' | 'deny' | 'prompt';
}

export interface SpawnOptions {
  prompt: string;
  projectPath: string;
  /** Pre-allocated by caller before spawn. */
  sessionId: string;
  resumeThreadId?: string;
  profile?: ProfileSnapshot;
}

export interface SessionHandle {
  id: string;
  providerId: string;
  ptySessionId: string;
  startedAt: number;
  status: 'starting' | 'ready' | 'closed';
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
  /** Resolved binary path, if found. */
  binary?: string;
  version?: string;
}

/**
 * Common interface for session-spawn adapters.
 *
 * Each provider wraps a CLI binary (claude / codex / gemini) and translates
 * its output stream to the common `SessionEvent` shape. Provider-specific
 * features (tool traces, thinking blocks, multimodal) are surfaced via
 * `payload`; they are not standardised across providers.
 */
export interface SessionProvider {
  readonly id: string;
  readonly label: string;
  readonly binary: string;

  /** Check whether the CLI binary is installed and executable. */
  checkAvailability(): Promise<AvailabilityResult>;

  /** Spawn a new CLI session and return a handle to it. */
  spawn(opts: SpawnOptions): Promise<SessionHandle>;

  /** Write user text into a running session (e.g. follow-up turns). */
  send(handle: SessionHandle, text: string): Promise<void>;

  /** Request cancellation of a running session. */
  cancel(handle: SessionHandle): Promise<void>;

  /**
   * Subscribe to session events.
   * Returns a cleanup function — call it to unsubscribe.
   */
  onEvent(handle: SessionHandle, cb: (e: SessionEvent) => void): () => void;
}
