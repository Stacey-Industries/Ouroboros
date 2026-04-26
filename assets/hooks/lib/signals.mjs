// signals.mjs — derived telemetry signals for Ouroboros hooks.
// Pure helpers: outcome normalization, path-sensitivity detection,
// prompt fingerprinting, and a per-session scratch-file mechanism for
// cross-event correlation (e.g. time-to-first-tool).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SCRATCH_DIR = join(homedir(), '.ouroboros', 'scratch');

// ─── Tool outcome normalization ───────────────────────────────────────────────
// Heuristic: scan the output for error markers. Each tool reports differently,
// so this is best-effort categorization. errorClass is null on success.

// Order matters — more specific patterns must come before more general ones
// (e.g. edit_match_failure before not_found, since the former contains
// "not found" as a substring).
const ERROR_PATTERNS = [
  { class: 'edit_match_failure', re: /\b(string\s+to\s+replace\s+not\s+found|old_string\s+not\s+found|no\s+match\s+found\s+in\s+file)\b/i },
  { class: 'rate_limit', re: /\b(rate[\s_-]?limit(ed)?|429|too\s+many\s+requests)\b/i },
  { class: 'auth', re: /\b(401|403|unauthorized|forbidden|invalid\s+(token|credential))\b/i },
  { class: 'timeout', re: /\b(time(d)?\s*out|deadline\s*exceeded)\b/i },
  { class: 'permission', re: /\b(permission\s+denied|EACCES|EPERM|operation\s+not\s+permitted)\b/i },
  { class: 'network', re: /\b(ECONNREFUSED|ENETUNREACH|ETIMEDOUT|getaddrinfo|EAI_AGAIN)\b/i },
  { class: 'lint_error', re: /\b\d+\s+problems?\s+\(\d+\s+errors?/i },
  { class: 'test_failure', re: /\b(\d+\s+failed|FAIL\s+|AssertionError|expect\(.+\)\.to)\b/i },
  { class: 'syntax_error', re: /\b(SyntaxError|unexpected\s+token|parse\s+error)\b/i },
  { class: 'type_error', re: /(TypeError|type\s+'.*'\s+is\s+not\s+assignable|TS\d{4}:)/i },
  { class: 'not_found', re: /\b(ENOENT|no\s+such\s+file|cannot\s+find)\b/i },
];

const GENERIC_ERROR_RE = /^(error|err|fail(ed|ure)?):\s/im;

export function normalizeOutcome(toolName, output) {
  const text = stringifyOutput(output);
  if (!text) return { success: true, errorClass: null };
  for (const { class: cls, re } of ERROR_PATTERNS) {
    if (re.test(text)) return { success: false, errorClass: cls };
  }
  if (GENERIC_ERROR_RE.test(text)) return { success: false, errorClass: 'generic' };
  return { success: true, errorClass: null };
}

function stringifyOutput(output) {
  if (output == null) return '';
  if (typeof output === 'string') return output;
  try { return JSON.stringify(output); } catch { return String(output); }
}

// ─── Path sensitivity ─────────────────────────────────────────────────────────
// Defensive flag for downstream redaction. Doesn't redact — just marks events
// that touched sensitive-looking paths so policy can decide later.

const SENSITIVE_PATTERNS = [
  /(^|[\\/])\.env(\.[^\\/]*)?$/i,
  /(^|[\\/])\.aws[\\/]/i,
  /(^|[\\/])\.ssh[\\/]/i,
  /(^|[\\/])\.gnupg[\\/]/i,
  /(^|[\\/])secrets?[\\/]/i,
  /(^|[\\/])credentials?(\.[^\\/]*)?$/i,
  /\.(key|pem|crt|p12|pfx|jks|keystore)$/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.pgpass$/i,
  /(^|[\\/])id_(rsa|ecdsa|ed25519|dsa)$/i,
];

export function detectSensitivePaths(toolName, input, output) {
  const candidates = [];
  if (input && typeof input === 'object') {
    for (const v of Object.values(input)) {
      if (typeof v === 'string') candidates.push(v);
    }
  }
  if (typeof output === 'string') candidates.push(output);
  for (const candidate of candidates) {
    for (const re of SENSITIVE_PATTERNS) {
      if (re.test(candidate)) return true;
    }
  }
  return false;
}

// ─── Prompt fingerprint ───────────────────────────────────────────────────────
// SHA-256 prefix + structural features. Lets cross-session "is this the same
// kind of prompt" analysis without storing the prompt text itself.

const FILE_EXT_RE = /[\w./\\-]+\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php|c|cpp|h|hpp|md|json|yml|yaml|toml|ini|sh|ps1|html|css|scss|sql)\b/gi;
const ERROR_HINT_RE = /(error|exception|fail(ed|ure)?|stack\s*trace|undefined|cannot|broke|broken)/i;
const CODE_FENCE_RE = /```/g;

export function fingerprintPrompt(prompt) {
  if (!prompt) return null;
  const text = String(prompt);
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
  const fileMatches = text.match(FILE_EXT_RE) ?? [];
  const codeFences = text.match(CODE_FENCE_RE) ?? [];
  return {
    hash,
    length: text.length,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    fileMentionCount: fileMatches.length,
    codeBlockCount: Math.floor(codeFences.length / 2),
    errorHintPresent: ERROR_HINT_RE.test(text),
    questionMarkCount: (text.match(/\?/g) ?? []).length,
    hasUrl: /https?:\/\//i.test(text),
  };
}

// ─── Scratch file mechanism ───────────────────────────────────────────────────
// Per-session scratchpad for cross-event correlation. Hook scripts are spawned
// per-event and have no shared memory — files at ~/.ouroboros/scratch/ bridge
// the gap. Best-effort; failures never break the calling hook.

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function scratchPath(sessionId, key) {
  return join(SCRATCH_DIR, `${slug(sessionId)}.${slug(key)}`);
}

export function writeScratch(sessionId, key, value) {
  try {
    mkdirSync(SCRATCH_DIR, { recursive: true });
    writeFileSync(scratchPath(sessionId, key), String(value), 'utf8');
    return true;
  } catch { return false; }
}

export function consumeScratch(sessionId, key) {
  const path = scratchPath(sessionId, key);
  try {
    if (!existsSync(path)) return null;
    const value = readFileSync(path, 'utf8');
    try { unlinkSync(path); } catch { /* may have been deleted */ }
    return value;
  } catch { return null; }
}
