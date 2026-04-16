/**
 * approvalMemory.ts — Persistent per-user approval memory (allow/deny patterns).
 *
 * Persisted to electron-store under `approvalMemory`.
 * Each entry stores { hash, toolName, keyPreview } where:
 *   - hash = sha256(toolName + ':' + key).slice(0, 16) — used for deduplication & revocation
 *   - keyPreview = first 60 chars of the command/input key — for Settings display only
 *
 * Hazardous patterns listed in NEVER_AUTO_ALLOW bypass the whitelist entirely.
 */

import crypto from 'crypto';

import { getConfigValue, setConfigValue } from './config';
import log from './logger';
import { broadcastToWebClients } from './web/webServer';
import { getAllActiveWindows } from './windowManager';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemoryEntry {
  hash: string;
  toolName: string;
  keyPreview: string;
}

export interface ApprovalMemoryStore {
  alwaysAllow: MemoryEntry[];
  alwaysDeny: MemoryEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_PREVIEW_MAX = 60;

/**
 * Patterns that are NEVER auto-approved regardless of whitelist entries.
 * Applied to the commandKey via substring/regex checks.
 */
const NEVER_AUTO_ALLOW_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  /\bsudo\b/,
  /curl[^|]*\|[^|]*sh/,
  /wget[^|]*\|[^|]*sh/,
  /eval\s*\(/,
  /:\s*\(\s*\)\s*\{.*\}\s*;/,  // fork bomb pattern
  /mkfs\b/,
  /dd\s+.*of=\/dev\/(s|h|xv|nv)d/,
];

// ─── Hash & safety helpers ────────────────────────────────────────────────────

export function hashPattern(toolName: string, key: string): string {
  return crypto
    .createHash('sha256')
    .update(`${toolName}:${key}`)
    .digest('hex')
    .slice(0, 16);
}

function isHazardous(key: string): boolean {
  return NEVER_AUTO_ALLOW_PATTERNS.some((re) => re.test(key));
}

function getMemory(): ApprovalMemoryStore {
  const stored = getConfigValue('approvalMemory' as keyof import('./config').AppConfig);
  const mem = stored as ApprovalMemoryStore | undefined;
  return {
    alwaysAllow: mem?.alwaysAllow ?? [],
    alwaysDeny: mem?.alwaysDeny ?? [],
  };
}

function saveMemory(mem: ApprovalMemoryStore): void {
  setConfigValue('approvalMemory' as keyof import('./config').AppConfig, mem as never);
  broadcastMemoryChanged();
}

function broadcastMemoryChanged(): void {
  const windows = getAllActiveWindows();
  for (const win of windows) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.mainFrame.send('approval:memoryChanged');
      } catch {
        // Render frame disposed — skip
      }
    }
  }
  broadcastToWebClients('approval:memoryChanged', {});
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a (toolName, key) pair has a persisted decision.
 * Returns 'allow', 'deny', or null (no memory → prompt user).
 * Hazardous keys never return 'allow' even if whitelisted.
 */
export function check(toolName: string, key: string): 'allow' | 'deny' | null {
  if (isHazardous(key)) return null;

  const hash = hashPattern(toolName, key);
  const mem = getMemory();

  if (mem.alwaysAllow.some((e) => e.hash === hash)) return 'allow';
  if (mem.alwaysDeny.some((e) => e.hash === hash)) return 'deny';
  return null;
}

/**
 * Persist an "always allow" entry for this (toolName, key) pair.
 * No-op if already present. Hazardous keys are silently ignored.
 */
export function rememberAllow(toolName: string, key: string): void {
  if (isHazardous(key)) {
    log.warn(`[approvalMemory] hazardous key rejected from allow-list: ${toolName}`);
    return;
  }

  const hash = hashPattern(toolName, key);
  const mem = getMemory();

  if (mem.alwaysAllow.some((e) => e.hash === hash)) return;

  // Remove from deny list if present, then add to allow list
  const entry: MemoryEntry = {
    hash,
    toolName,
    keyPreview: key.slice(0, KEY_PREVIEW_MAX),
  };
  mem.alwaysDeny = mem.alwaysDeny.filter((e) => e.hash !== hash);
  mem.alwaysAllow.push(entry);
  saveMemory(mem);
  log.info(`[approvalMemory] remembered allow: ${toolName}:${hash}`);
}

/**
 * Persist an "always deny" entry for this (toolName, key) pair.
 * No-op if already present.
 */
export function rememberDeny(toolName: string, key: string): void {
  const hash = hashPattern(toolName, key);
  const mem = getMemory();

  if (mem.alwaysDeny.some((e) => e.hash === hash)) return;

  const entry: MemoryEntry = {
    hash,
    toolName,
    keyPreview: key.slice(0, KEY_PREVIEW_MAX),
  };
  mem.alwaysAllow = mem.alwaysAllow.filter((e) => e.hash !== hash);
  mem.alwaysDeny.push(entry);
  saveMemory(mem);
  log.info(`[approvalMemory] remembered deny: ${toolName}:${hash}`);
}

/**
 * Revoke a remembered entry by hash (called from Settings UI).
 */
export function forget(hash: string): void {
  const mem = getMemory();
  const prevTotal = mem.alwaysAllow.length + mem.alwaysDeny.length;
  mem.alwaysAllow = mem.alwaysAllow.filter((e) => e.hash !== hash);
  mem.alwaysDeny = mem.alwaysDeny.filter((e) => e.hash !== hash);
  const removed = prevTotal - mem.alwaysAllow.length - mem.alwaysDeny.length;
  if (removed > 0) {
    saveMemory(mem);
    log.info(`[approvalMemory] forgot hash: ${hash}`);
  }
}

/**
 * Return all stored entries for the Settings UI.
 */
export function listAll(): ApprovalMemoryStore {
  return getMemory();
}
