/**
 * utilityProcessHost.ts — Generic lifecycle wrapper around
 * Electron.utilityProcess.fork() with typed IPC, request/response correlation,
 * crash detection, and graceful shutdown.
 *
 * Used by PtyHost (Wave 3B Phase 1+), ExtensionHost (Phase 5+), and McpHost
 * (Phase 7+). Each consumer parameterizes the message types.
 *
 * The host process owns the child lifecycle. The child must:
 *   1. Listen for messages on `process.parentPort.on('message', ...)`
 *   2. Send messages via `process.parentPort.postMessage(...)`
 *   3. Tag responses with the same `requestId` they received
 */

import type { MessageEvent, UtilityProcess } from 'electron';
import { utilityProcess } from 'electron';

import log from './logger';

// ── Configuration ──

export interface UtilityProcessHostOptions {
  /** Absolute path to the entry-point JS file (e.g. out/main/ptyHostMain.js) */
  modulePath: string;
  /** Friendly label for logging */
  name: string;
  /** Optional env vars passed to the child */
  env?: Record<string, string>;
  /** Auto-restart on unexpected exit (default: false) */
  autoRestart?: boolean;
  /**
   * Called when the child exits unexpectedly (not from kill()).
   * Fires BEFORE auto-restart (if enabled), so the consumer can capture
   * pre-crash state for recovery (e.g. notify renderer of disconnected sessions).
   */
  onCrash?: (exitCode: number) => void;
}

// ── Pending request bookkeeping ──

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 10_000;

// ── Generic host ──

export class UtilityProcessHost<TRequest extends { type: string }, TOutbound extends { type: string }> {
  private readonly options: UtilityProcessHostOptions;
  private child: UtilityProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private eventHandlers = new Set<(event: TOutbound) => void>();
  private requestCounter = 0;
  private isShuttingDown = false;

  constructor(options: UtilityProcessHostOptions) {
    this.options = options;
  }

  // ── Lifecycle ──

  fork(): void {
    if (this.child) return;
    this.isShuttingDown = false;
    const child = utilityProcess.fork(this.options.modulePath, [], {
      env: { ...process.env, ...(this.options.env ?? {}) },
      serviceName: this.options.name,
    });
    child.on('message', (msg: unknown) => this.handleMessage(msg));
    child.on('exit', (code: number) => this.handleExit(code));
    this.child = child;
    log.info(`[${this.options.name}] forked (pid ${child.pid ?? '?'})`);
  }

  async kill(): Promise<void> {
    this.isShuttingDown = true;
    if (!this.child) return;
    try {
      this.child.kill();
    } catch (err) {
      log.warn(`[${this.options.name}] kill error:`, err);
    }
    this.child = null;
    this.rejectAllPending(new Error(`${this.options.name} killed`));
  }

  get alive(): boolean {
    return this.child !== null;
  }

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  // ── Messaging ──

  /** Fire-and-forget message (no response expected). */
  send(message: TRequest): void {
    if (!this.child) {
      log.warn(`[${this.options.name}] send before fork: ${message.type}`);
      return;
    }
    this.child.postMessage(message);
  }

  /**
   * Request/response with correlation. The request must include a `requestId`
   * field; the response must echo the same `requestId`.
   */
  request<TRes>(message: TRequest & { requestId: string }): Promise<TRes> {
    if (!this.child) {
      return Promise.reject(new Error(`${this.options.name} not started`));
    }
    return new Promise<TRes>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(message.requestId);
        reject(new Error(`${this.options.name} request ${message.type} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(message.requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutId,
      });
      this.child!.postMessage(message);
    });
  }

  /** Generate a unique request ID. */
  nextRequestId(): string {
    this.requestCounter += 1;
    return `${Date.now().toString(36)}-${this.requestCounter}`;
  }

  /** Subscribe to push events (messages without `requestId`). */
  onEvent(handler: (event: TOutbound) => void): () => void {
    this.eventHandlers.add(handler);
    return () => { this.eventHandlers.delete(handler); };
  }

  // ── Internal ──

  private handleMessage(rawMsg: unknown): void {
    const msg = (rawMsg as MessageEvent | undefined)?.data ?? rawMsg;
    if (typeof msg !== 'object' || msg === null) return;
    const m = msg as Record<string, unknown>;
    if (typeof m.requestId === 'string' && this.pending.has(m.requestId)) {
      this.resolveRequest(m as { requestId: string; type: string });
      return;
    }
    for (const handler of this.eventHandlers) {
      handler(msg as TOutbound);
    }
  }

  private resolveRequest(msg: { requestId: string; type: string }): void {
    const pending = this.pending.get(msg.requestId);
    if (!pending) return;
    this.pending.delete(msg.requestId);
    clearTimeout(pending.timeoutId);
    if (msg.type === 'error') {
      const errMsg = (msg as unknown as { message?: string }).message ?? 'unknown';
      pending.reject(new Error(errMsg));
    } else {
      pending.resolve(msg);
    }
  }

  private handleExit(code: number): void {
    log.warn(`[${this.options.name}] exit code=${code} shuttingDown=${this.isShuttingDown}`);
    this.child = null;
    this.rejectAllPending(new Error(`${this.options.name} exited (code ${code})`));
    if (this.isShuttingDown) return;
    // Unexpected crash — notify consumer before any auto-restart
    if (this.options.onCrash) {
      try { this.options.onCrash(code); } catch (err) {
        log.warn(`[${this.options.name}] onCrash handler threw:`, err);
      }
    }
    if (this.options.autoRestart) {
      log.info(`[${this.options.name}] auto-restarting`);
      this.fork();
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(err);
    }
    this.pending.clear();
  }
}
