/**
 * inflightRegistry.ts — Server-side registry of resumable in-flight RPC calls.
 *
 * Wave 33a Phase E.
 *
 * Keyed by opaque resumeToken (256-bit base64url). Each entry tracks the
 * device that owns the call and a live send function. On disconnect the
 * send target is detached to a no-op. On reconnect it is reattached.
 *
 * TTL: configurable via mobileAccess.resumeTtlSec (default 300 s).
 * Cleanup is lazy — runs on each register() call, not on a schedule.
 */

import crypto from 'crypto';

import { getConfigValue } from '../config';
import log from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SendFn = (msg: unknown) => void;

interface InflightEntry {
  deviceId: string;
  channel: string;
  send: SendFn;
  createdAt: number;
  cleanupTimer: NodeJS.Timeout;
}

// ─── State ────────────────────────────────────────────────────────────────────

const registry = new Map<string, InflightEntry>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTtlMs(): number {
  const cfg = getConfigValue('mobileAccess') as { resumeTtlSec?: number } | undefined;
  const secs = cfg?.resumeTtlSec ?? 300;
  return secs * 1000;
}

function makeToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function noop(): void { /* no-op send on detach */ }

function scheduleCleanup(token: string, ttlMs: number): NodeJS.Timeout {
  return setTimeout(() => {
    const entry = registry.get(token);
    if (!entry) return;
    log.warn(`[inflightRegistry] TTL expired for token ${token.slice(0, 8)}…`);
    try {
      entry.send({ id: token, error: 'resume-timeout' });
    } catch { /* send may throw if target is gone */ }
    registry.delete(token);
  }, ttlMs);
}

function evictExpired(): void {
  const now = Date.now();
  const ttlMs = getTtlMs();
  for (const [token, entry] of registry) {
    if (now - entry.createdAt > ttlMs) {
      clearTimeout(entry.cleanupTimer);
      registry.delete(token);
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register a new resumable in-flight call.
 * Returns an opaque resumeToken that the caller must send to the client.
 */
export function register(opts: { deviceId: string; channel: string }): string {
  evictExpired();
  const token = makeToken();
  const ttlMs = getTtlMs();
  const timer = scheduleCleanup(token, ttlMs);
  const entry: InflightEntry = {
    deviceId: opts.deviceId,
    channel: opts.channel,
    send: noop,
    createdAt: Date.now(),
    cleanupTimer: timer,
  };
  registry.set(token, entry);
  log.info(`[inflightRegistry] registered token ${token.slice(0, 8)}… channel=${opts.channel}`);
  return token;
}

/**
 * Update the live send target for a token.
 * Called immediately after register() with the current WS send function.
 */
export function setSendTarget(token: string, send: SendFn): void {
  const entry = registry.get(token);
  if (!entry) return;
  entry.send = send;
}

/**
 * Clear the send target on disconnect — handler keeps running.
 */
export function detach(token: string): void {
  const entry = registry.get(token);
  if (!entry) return;
  entry.send = noop;
  log.info(`[inflightRegistry] detached token ${token.slice(0, 8)}…`);
}

/**
 * Reattach a send target when the same device reconnects.
 * Returns true if successful; false if token unknown or deviceId mismatch.
 */
export function reattach(token: string, deviceId: string, send: SendFn): boolean {
  const entry = registry.get(token);
  if (!entry) return false;
  if (entry.deviceId !== deviceId) {
    log.warn(`[inflightRegistry] reattach rejected — deviceId mismatch for ${token.slice(0, 8)}…`);
    return false;
  }
  entry.send = send;
  log.info(`[inflightRegistry] reattached token ${token.slice(0, 8)}… device=${deviceId}`);
  return true;
}

/**
 * Mark a call as resolved — remove from registry and cancel TTL timer.
 */
export function resolve(token: string): void {
  const entry = registry.get(token);
  if (!entry) return;
  clearTimeout(entry.cleanupTimer);
  registry.delete(token);
  log.info(`[inflightRegistry] resolved token ${token.slice(0, 8)}…`);
}

/**
 * Get the current send function for a token, or null if not found.
 */
export function getSend(token: string): SendFn | null {
  return registry.get(token)?.send ?? null;
}

/**
 * Returns all tokens currently registered for a deviceId.
 * Used on disconnect to detach all in-flight calls for that device.
 */
export function getTokensForDevice(deviceId: string): string[] {
  const tokens: string[] = [];
  for (const [token, entry] of registry) {
    if (entry.deviceId === deviceId) tokens.push(token);
  }
  return tokens;
}

/** For testing — returns current registry size. */
export function registrySize(): number { return registry.size; }

/** For testing — clears the entire registry without firing TTL callbacks. */
export function clearRegistry(): void {
  for (const entry of registry.values()) clearTimeout(entry.cleanupTimer);
  registry.clear();
}
