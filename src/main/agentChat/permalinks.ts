/**
 * permalinks.ts — thread:// URL scheme for deep-linking to threads/messages.
 *
 * Format: `thread://<threadId>#msg=<messageId>`
 *
 * Both threadId and messageId are URL-encoded so that IDs containing
 * reserved characters round-trip through build → parse without loss.
 *
 * parsePermalink is lenient: returns null for any input that cannot be
 * unambiguously decoded into a thread id.
 */

export interface ParsedPermalink {
  threadId: string;
  messageId?: string;
}

const SCHEME = 'thread://';

export function buildPermalink(threadId: string, messageId?: string): string {
  const id = encodeURIComponent(threadId);
  if (!messageId) return `${SCHEME}${id}`;
  return `${SCHEME}${id}#msg=${encodeURIComponent(messageId)}`;
}

export function parsePermalink(url: string): ParsedPermalink | null {
  if (typeof url !== 'string' || !url.startsWith(SCHEME)) return null;
  const body = url.slice(SCHEME.length);
  if (!body) return null;

  const hashIdx = body.indexOf('#');
  const rawThreadId = hashIdx === -1 ? body : body.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? '' : body.slice(hashIdx + 1);

  const threadId = safeDecode(rawThreadId);
  if (!threadId) return null;

  const messageId = extractMessageId(fragment);
  return messageId ? { threadId, messageId } : { threadId };
}

function extractMessageId(fragment: string): string | undefined {
  if (!fragment.startsWith('msg=')) return undefined;
  const raw = fragment.slice(4);
  if (!raw) return undefined;
  return safeDecode(raw);
}

function safeDecode(s: string): string | undefined {
  try {
    const decoded = decodeURIComponent(s);
    return decoded.length > 0 ? decoded : undefined;
  } catch {
    return undefined;
  }
}
