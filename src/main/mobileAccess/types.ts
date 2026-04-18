/**
 * types.ts — Core type definitions for the mobileAccess module.
 *
 * Wave 33a Phase A — data model only; no IPC wiring.
 */

/**
 * Access class for an IPC channel when called from a mobile client.
 * - 'always'        — permitted unconditionally (health, pings)
 * - 'paired-read'   — permitted for any authenticated paired device (file reads, git status)
 * - 'paired-write'  — permitted for authenticated paired devices with write capability
 * - 'desktop-only'  — blocked for all mobile clients (file:delete, pty:spawn, etc.)
 */
export type Capability = 'always' | 'paired-read' | 'paired-write' | 'desktop-only';

/**
 * Timeout class for a channel call from a mobile client.
 * - 'short'  — 10 s  (health pings, config reads)
 * - 'normal' — 30 s  (most reads/writes, git ops)
 * - 'long'   — 120 s (streaming chat, spec scaffold, retrain)
 */
export type TimeoutClass = 'short' | 'normal' | 'long';

/** A mobile device that has completed the pairing flow. */
export interface PairedDevice {
  /** UUID identifying this device registration. */
  id: string;
  /** User-chosen label (e.g. "Cole's iPhone 14"). */
  label: string;
  /** SHA-256 of the refresh token, encoded as base64url. Never store the raw token. */
  refreshTokenHash: string;
  /** Client-provided device fingerprint (used to detect MITM on host/port change). */
  fingerprint: string;
  /** IPC capability classes this device is allowed to invoke. */
  capabilities: string[];
  /** ISO 8601 timestamp of when the device was paired. */
  issuedAt: string;
  /** ISO 8601 timestamp of the device's most recent authenticated request. */
  lastSeenAt: string;
}

/** Short-lived single-use ticket used during the initial pairing handshake. */
export interface PairingTicket {
  /** 6-digit zero-padded numeric code shown to the user. */
  code: string;
  /** Unix epoch ms when the ticket was created. */
  createdAt: number;
  /** Unix epoch ms after which the ticket is invalid. */
  expiresAt: number;
  /** True once the mobile client has redeemed this ticket. */
  consumed: boolean;
}

/**
 * Payload encoded in the QR code displayed by the pairing flow.
 * v=1 is the first wire version — increment if the shape changes.
 */
export interface QrPayload {
  v: 1;
  /** Desktop hostname or IP the mobile client should connect to. */
  host: string;
  /** TCP port the web server is listening on. */
  port: number;
  /** The 6-digit pairing code (zero-padded). */
  code: string;
  /** Desktop device fingerprint for MITM detection. */
  fingerprint: string;
}
