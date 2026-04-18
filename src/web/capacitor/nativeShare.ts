/**
 * nativeShare.ts — native share sheet bridge.
 *
 * On native (Android/iOS): delegates to @capacitor/share.
 * On web: attempts navigator.share() if available, then falls back to
 * clipboard copy of url or text, returning true on success, false on failure.
 *
 * Phase G wires this to file-path and session-link share actions.
 * This file is the bridge layer only — no callers exist yet.
 */

import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

async function tryClipboardFallback(options: ShareOptions): Promise<boolean> {
  const content = options.url ?? options.text ?? '';
  if (!content) return false;
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

async function tryNavigatorShare(options: ShareOptions): Promise<boolean> {
  try {
    await navigator.share({ title: options.title, text: options.text, url: options.url });
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Open the platform share sheet with the given content.
 *
 * Native: @capacitor/share — opens the OS share sheet. Returns true.
 * Web (navigator.share available): delegates to the Web Share API. Returns true
 *   on success, false if the user cancels or the browser rejects the call.
 * Web (no navigator.share): copies url or text to clipboard. Returns true on
 *   success, false if the Clipboard API is unavailable or throws.
 *
 * @returns true if sharing (or clipboard copy) succeeded, false otherwise.
 */
export async function nativeShare(options: ShareOptions): Promise<boolean> {
  if (isNativePlatform()) {
    await Share.share(options);
    return true;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    return tryNavigatorShare(options);
  }

  return tryClipboardFallback(options);
}
