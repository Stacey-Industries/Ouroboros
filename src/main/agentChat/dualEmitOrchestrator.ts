/**
 * dualEmitOrchestrator.ts — Shadow-path façade for Wave 86 Phase 3+.
 *
 * Owns the IdentityRegistry, EventNormalizer, ChatStateBroadcaster, and
 * ChatPersistenceLayer for the NEW canonical state path. The existing bridge
 * (chatOrchestrationBridge.ts) continues to be the user-visible path; this
 * orchestrator runs in parallel as an observation layer.
 *
 * Three shadow taps (called from the existing runtime):
 *   onStreamJsonEvent — from claudeStreamJsonRunner / event handler
 *   onHookEvent       — from hooks.ts named pipe
 *   onCommand         — from chatOrchestrationBridge.ts sendMessage / cancel / editAndResend
 *
 * Phase 6: DiffComparator removed (dual-emit window closed). reportTerminal
 * is retained as a telemetry-only hook that records terminal status.
 *
 * Decision 3: bad events are swallowed with log.warn — the shadow path MUST NOT
 * kill the user-visible path.
 * Decision 6: all shadow errors are non-fatal; the existing bridge is unaffected.
 */

import type { ProviderSessionId, ThreadId, TurnId } from '@shared/types/canonicalChatEvent';

import log from '../logger';
import type { StreamJsonEvent } from '../orchestration/providers/streamJsonTypes';
import type { ChatPersistenceLayer } from './chatPersistenceLayer';
import type { ChatStateBroadcaster } from './chatStateBroadcaster';
import type { ChatCommandPayload, HookPayload } from './eventNormalizer';
import { EventNormalizer } from './eventNormalizer';
import { IdentityRegistry } from './identityRegistry';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DualEmitOrchestratorOptions {
  broadcaster: ChatStateBroadcaster;
  persistence: ChatPersistenceLayer;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export class DualEmitOrchestrator {
  readonly registry: IdentityRegistry;
  private readonly normalizer: EventNormalizer;
  private readonly broadcaster: ChatStateBroadcaster;
  private readonly persistence: ChatPersistenceLayer;

  /** Per-active-turn set of seen provider session IDs. */
  private readonly seenPsids = new Map<TurnId, Set<ProviderSessionId>>();

  constructor(opts: DualEmitOrchestratorOptions) {
    this.registry = new IdentityRegistry();
    this.normalizer = new EventNormalizer(this.registry);
    this.broadcaster = opts.broadcaster;
    this.persistence = opts.persistence;
  }

  // ─── Shadow tap 1: stream-json events ────────────────────────────────────────

  /**
   * Called for each NDJSON event emitted by the CLI subprocess.
   * turnId is the active turn assigned by the calling side.
   * Returns silently on any error — shadow path must not affect the user-visible path.
   */
  onStreamJsonEvent(raw: StreamJsonEvent, turnId: TurnId): void {
    try {
      const seen = this.getOrCreateSeenSet(turnId);
      const canonical = this.normalizer.fromStreamJson(raw, turnId, seen);
      if (!canonical) return;

      const events = Array.isArray(canonical) ? canonical : [canonical];
      for (const evt of events) {
        this.broadcaster.dispatch(evt);
        this.maybePersistAlias(evt.type === 'provider_session_assigned' ? evt : null, turnId);
      }
    } catch (err) {
      log.warn('[dualEmit] onStreamJsonEvent swallowed error', { turnId, err });
    }
  }

  // ─── Shadow tap 2: hook events ────────────────────────────────────────────────

  /**
   * Called for each hook payload from the named pipe.
   * Returns silently on any error — shadow path must not affect the user-visible path.
   */
  onHookEvent(raw: HookPayload): void {
    try {
      const canonical = this.normalizer.fromHookEvent(raw);
      if (!canonical) return;
      this.broadcaster.dispatch(canonical);
    } catch (err) {
      log.warn('[dualEmit] onHookEvent swallowed error', { hookType: raw.type, err });
    }
  }

  // ─── Shadow tap 3: command events ─────────────────────────────────────────────

  /**
   * Called when a sendMessage command is dispatched by the bridge.
   * Registers the turn in the IdentityRegistry and emits turn_submitted.
   */
  onCommand(cmd: ChatCommandPayload, turnId: TurnId): void {
    try {
      const threadId = cmd.threadId as ThreadId;
      this.registry.registerTurn(threadId, turnId);
      this.broadcaster.ensureThread(threadId);
      this.seenPsids.set(turnId, new Set());

      const evt = this.normalizer.fromCommand(cmd, turnId);
      this.broadcaster.dispatch(evt);

      this.persistence.insertAlias({
        threadId,
        turnId,
        createdAt: Date.now(),
      });
    } catch (err) {
      log.warn('[dualEmit] onCommand swallowed error', { turnId, err });
    }
  }

  // ─── Terminal telemetry ───────────────────────────────────────────────────────

  /**
   * Called by the existing bridge when a turn reaches a terminal state.
   * Phase 6: DiffComparator removed; this is now a telemetry-only log point.
   */
  reportTerminal(turnId: TurnId, bridgeStatus: 'completed' | 'failed' | 'cancelled'): void {
    try {
      log.info('[dualEmit] reportTerminal', { turnId, bridgeStatus });
    } catch (err) {
      log.warn('[dualEmit] reportTerminal swallowed error', { turnId, err });
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private getOrCreateSeenSet(turnId: TurnId): Set<ProviderSessionId> {
    if (!this.seenPsids.has(turnId)) {
      this.seenPsids.set(turnId, new Set());
    }
    return this.seenPsids.get(turnId) as Set<ProviderSessionId>;
  }

  private maybePersistAlias(
    evt: {
      type: 'provider_session_assigned';
      turnId: TurnId;
      providerSessionId: ProviderSessionId;
    } | null,
    turnId: TurnId,
  ): void {
    if (!evt) return;
    try {
      this.registry.assignProviderSession(turnId, evt.providerSessionId);
      this.persistence.assignProviderSessionToAlias(turnId, evt.providerSessionId);
    } catch (err) {
      log.warn('[dualEmit] maybePersistAlias swallowed error', { turnId, err });
    }
  }

}
