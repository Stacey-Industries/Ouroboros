/**
 * deepLinks.ts — Deep-link bridge for the ouroboros://pair scheme.
 *
 * Parses incoming deep links from the native App plugin and from URL query
 * parameters (for browser-mode or QR-scanner prefill). All parsing is pure
 * and unit-testable without Capacitor mocks.
 *
 * Wave 33b Phase E.
 */

import { isNative } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PairingLinkPayload {
  host: string;
  port: string;
  code: string;
  fingerprint: string;
}

// ─── Parsing helpers (pure — no Capacitor dependency) ────────────────────────

const PAIRING_SCHEME = 'ouroboros:';
const PAIRING_HOST = 'pair';
const REQUIRED_FIELDS = ['host', 'port', 'code', 'fingerprint'] as const;

function extractFromParams(params: URLSearchParams): PairingLinkPayload | null {
  const host = params.get('host');
  const port = params.get('port');
  const code = params.get('code');
  const fingerprint = params.get('fingerprint');
  if (!host || !port || !code || !fingerprint) return null;
  return { host, port, code, fingerprint };
}

/**
 * Parses `ouroboros://pair?host=X&port=Y&code=Z&fingerprint=F`.
 * Returns null on any missing field or scheme/host mismatch.
 */
export function parsePairingUrl(url: string): PairingLinkPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== PAIRING_SCHEME) return null;
  if (parsed.hostname !== PAIRING_HOST) return null;
  return extractFromParams(parsed.searchParams);
}

/**
 * Parses `?host=&port=&code=&fingerprint=` from a standard query string.
 * Used for browser-mode deep links and form prefill from URL params.
 */
export function readPairingQueryParams(search: string): PairingLinkPayload | null {
  const params = new URLSearchParams(search);
  const hasAny = REQUIRED_FIELDS.some((f) => params.has(f));
  if (!hasAny) return null;
  return extractFromParams(params);
}

// ─── Native listener ──────────────────────────────────────────────────────────

type CleanupFn = () => void;

/**
 * On native platforms, subscribes to `App.addListener('appUrlOpen', ...)`.
 * Parses the URL and calls `onPair` when the scheme matches.
 * Returns a cleanup function that removes the listener.
 *
 * On web/browser, returns a no-op cleanup immediately.
 */
export async function initDeepLinkListener(
  onPair: (p: PairingLinkPayload) => void,
): Promise<CleanupFn> {
  if (!isNative()) return () => undefined;

  // Dynamic import keeps @capacitor/app out of the web bundle at build time
  // while still being intercepted by vitest's vi.mock in tests.
  const { App } = await import('@capacitor/app');

  const handle = await App.addListener('appUrlOpen', (event: { url: string }) => {
    const payload = parsePairingUrl(event.url);
    if (payload) onPair(payload);
  });

  return () => { void handle.remove(); };
}
