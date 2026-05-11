/**
 * chatStateBroadcaster.ts — Owns the Map of per-thread state machines and fans
 * out diffs to subscribed renderer windows via IPC.
 *
 * Phase 1: one subscriber per thread is sufficient (multi-window fan-out is Phase 4).
 * No SQLite writes in Phase 1 — in-memory only.
 *
 * See spec §4.4 and waveplan-86.md Phase 1 scope.
 */

import { diffChannel, snapshotChannel } from '@shared/ipc/chatStateChannels';
import type { CanonicalChatEvent, ThreadId } from '@shared/types/canonicalChatEvent';
import type { ChatStateDiff, ChatStateSnapshot } from '@shared/types/chatStateDiff';
import type { WebContents } from 'electron';

import log from '../logger';
import { ChatSessionStateMachine } from './chatSessionStateMachine';
import { ChatStateError } from './chatStateError';

// ─── Broadcaster ──────────────────────────────────────────────────────────────

export class ChatStateBroadcaster {
  /** One state machine per thread. */
  private readonly machines = new Map<ThreadId, ChatSessionStateMachine>();

  /** Per-thread subscriber set. Phase 1: one subscriber per thread. */
  private readonly subscribers = new Map<ThreadId, Set<WebContents>>();

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Dispatch a canonical event to the appropriate thread's state machine,
   * then fan out the resulting diffs to all subscribed renderer windows.
   */
  dispatch(event: CanonicalChatEvent): void {
    const machine = this.getOrCreateMachine(event.threadId);
    let diffs: ChatStateDiff[];
    try {
      diffs = machine.dispatch(event);
    } catch (err) {
      log.error('[chatStateBroadcaster] dispatch threw', { threadId: event.threadId, err });
      throw err; // Decision 3 — re-throw; caller surfaces the banner
    }
    this.fanOut(event.threadId, diffs);
  }

  /**
   * Subscribe a renderer window to diffs for a thread.
   * Immediately sends the current snapshot to the new subscriber.
   * Returns an unsubscribe function.
   */
  subscribe(threadId: ThreadId, webContents: WebContents): () => void {
    if (!this.subscribers.has(threadId)) {
      this.subscribers.set(threadId, new Set());
    }
    this.subscribers.get(threadId)?.add(webContents);

    // Send current snapshot immediately so the renderer can hydrate.
    const snap = this.snapshot(threadId);
    this.sendSafe(webContents, snapshotChannel(threadId), snap);

    log.info('[chatStateBroadcaster] subscribed', { threadId });

    return () => {
      this.subscribers.get(threadId)?.delete(webContents);
      log.info('[chatStateBroadcaster] unsubscribed', { threadId });
    };
  }

  /**
   * Return a snapshot of the current state for a thread.
   * Throws ChatStateError (unknown-thread) if the thread has never been seen.
   */
  snapshot(threadId: ThreadId): ChatStateSnapshot {
    const machine = this.machines.get(threadId);
    if (!machine) {
      throw new ChatStateError(
        'unknown-thread',
        `ChatStateBroadcaster.snapshot: unknown threadId ${threadId}`,
        { threadId },
      );
    }
    return machine.snapshot();
  }

  /**
   * Ensure a state machine exists for the thread; create one if not.
   * Called at turn-submit time (when the IPC handler registers the turn).
   */
  ensureThread(threadId: ThreadId): void {
    this.getOrCreateMachine(threadId);
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  private getOrCreateMachine(threadId: ThreadId): ChatSessionStateMachine {
    if (!this.machines.has(threadId)) {
      this.machines.set(threadId, new ChatSessionStateMachine(threadId));
      log.info('[chatStateBroadcaster] created state machine', { threadId });
    }
    return this.machines.get(threadId) as ChatSessionStateMachine;
  }

  private fanOut(threadId: ThreadId, diffs: ChatStateDiff[]): void {
    if (diffs.length === 0) return;
    const subs = this.subscribers.get(threadId);
    if (!subs || subs.size === 0) return;
    for (const diff of diffs) {
      for (const wc of subs) {
        this.sendSafe(wc, diffChannel(threadId), diff);
      }
    }
  }

  private sendSafe(wc: WebContents, channel: string, payload: unknown): void {
    try {
      if (!wc.isDestroyed()) {
        wc.send(channel, payload);
      }
    } catch (err) {
      log.warn('[chatStateBroadcaster] sendSafe failed', { channel, err });
    }
  }
}
