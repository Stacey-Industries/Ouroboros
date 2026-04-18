/**
 * pairingTickets.ts — In-memory short-lived pairing ticket store.
 *
 * Tickets are 6-digit zero-padded codes with a 60-second TTL.
 * They live in memory only — a process restart clears them (acceptable; user
 * generates a new code). No setInterval is used; cleanup runs lazily on each
 * issuance to avoid blocking process exit in tests.
 *
 * Wave 33a Phase A — data model + storage only; no IPC wiring.
 */

import crypto from 'crypto';

import type { PairingTicket } from './types';

const TICKET_TTL_MS = 60_000;
const CODE_MAX = 1_000_000; // exclusive upper bound → 000000–999999

const tickets = new Map<string, PairingTicket>();

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Issues a new 6-digit pairing ticket with a 60-second TTL.
 *
 * Lazily removes expired entries before generating the new code.
 * If a live ticket with the same code already exists, reissues from scratch
 * rather than creating a duplicate.
 */
export function issueTicket(): PairingTicket {
  cleanupExpired();
  const code = generateUniqueCode();
  const now = Date.now();
  const ticket: PairingTicket = {
    code,
    createdAt: now,
    expiresAt: now + TICKET_TTL_MS,
    consumed: false,
  };
  tickets.set(code, ticket);
  return ticket;
}

/**
 * Verifies and consumes a ticket by code using constant-time comparison.
 *
 * Returns the ticket if it is valid, unexpired, and unconsumed; marks it
 * consumed and returns it. Returns null otherwise.
 */
export function verifyAndConsume(code: string): PairingTicket | null {
  if (!code || typeof code !== 'string') return null;
  const stored = tickets.get(code);
  if (!stored) return null;
  if (!timingSafeCodeEqual(code, stored.code)) return null;
  if (Date.now() >= stored.expiresAt) {
    tickets.delete(code);
    return null;
  }
  if (stored.consumed) return null;
  stored.consumed = true;
  return stored;
}

/**
 * Removes all expired tickets from the in-memory map.
 * Called lazily from issueTicket() — never on a timer.
 */
export function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, ticket] of tickets) {
    if (now >= ticket.expiresAt) tickets.delete(key);
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Generates a zero-padded 6-digit code that has no live entry in the map. */
function generateUniqueCode(): string {
  let attempts = 0;
  while (attempts < 10) {
    const raw = crypto.randomInt(0, CODE_MAX);
    const code = String(raw).padStart(6, '0');
    if (!tickets.has(code)) return code;
    attempts++;
  }
  // Extremely unlikely; return whatever we have after 10 tries.
  return String(crypto.randomInt(0, CODE_MAX)).padStart(6, '0');
}

/**
 * Compares two ticket codes using crypto.timingSafeEqual to prevent
 * timing side-channel attacks. Both operands must be the same byte length
 * (6 ASCII digits are always equal length, but we guard regardless).
 */
function timingSafeCodeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
