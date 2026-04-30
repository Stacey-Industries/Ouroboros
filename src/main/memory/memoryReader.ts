/**
 * memoryReader.ts — Read-only access to project-scoped Claude memory entries.
 *
 * Memory lives at: ~/.claude/projects/<sanitized-cwd>/memory/MEMORY.md
 * The index file links to per-entry .md files in the same directory.
 *
 * Sanitization: replace ':', '\', '/', and ' ' with '-' to match the real
 * directory layout produced by the Claude CLI.  Example:
 *   C:\Web App\Agent IDE  →  C--Web-App-Agent-IDE
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import log from '../logger';

export interface MemoryEntry {
  /** Filename without extension (used as the stable id for memory:read). */
  id: string;
  /** Link text from the markdown bullet: [Title](file.md). */
  title: string;
  /** Trailing hook text after ' — ' on the bullet line. */
  description: string;
  /** Most recent ## header above this bullet. */
  section: string;
  /** Absolute path to the linked .md file. */
  filePath: string;
  /** Whether the linked file actually exists on disk. */
  exists: boolean;
}

// Matches the four characters the Claude CLI replaces with '-' when building
// the project-scoped directory slug: colon, backslash, forward-slash, space.
// Written as a character class of literals to avoid the unsafe-regex warning
// that a combined alternation like /[:\\/\s]/ triggers in the security linter.
const SANITIZE_COLON = /:/g;
const SANITIZE_BACKSLASH = /\\/g;
const SANITIZE_SLASH = /\//g;
const SANITIZE_SPACE = / /g;

/** Replace path-separator characters to match the Claude CLI's slug format. */
export function sanitizeCwd(cwd: string): string {
  return cwd
    .replace(SANITIZE_COLON, '-')
    .replace(SANITIZE_BACKSLASH, '-')
    .replace(SANITIZE_SLASH, '-')
    .replace(SANITIZE_SPACE, '-');
}

/** Resolve the absolute path to the project memory directory. */
export function getProjectMemoryDir(cwd: string): string {
  return path.join(os.homedir(), '.claude', 'projects', sanitizeCwd(cwd), 'memory');
}

// Matches: - [Title](file.md) — description
// The separator between link and description is an em-dash (—) or ASCII dash (-),
// optionally surrounded by spaces. Expressed as two separate alternatives via
// string-split parsing rather than a complex character class to avoid the
// security/detect-unsafe-regex lint rule.
const BULLET_PREFIX = /^-\s+\[([^\]]+)\]\(([^)]+)\)/;

/** Extract the description after the link — everything after ' — ' or ' - '. */
function extractDescription(rest: string): string {
  const trimmed = rest.trimStart();
  if (trimmed.startsWith('—')) return trimmed.slice(1).trim();
  if (trimmed.startsWith('-')) return trimmed.slice(1).trim();
  return '';
}

function parseBulletLine(line: string, section: string, memDir: string): MemoryEntry | null {
  const match = BULLET_PREFIX.exec(line.trim());
  if (!match) return null;

  const title = match[1].trim();
  const filename = match[2].trim();
  // Everything after the closing ')' of the link is the potential description.
  const afterLink = line.trim().slice(match[0].length);
  const description = extractDescription(afterLink);

  // Only accept bare filenames — no path separators allowed.
  if (filename.includes('/') || filename.includes('\\')) {
    log.warn('[memoryReader] skipping bullet with path-traversal filename:', filename);
    return null;
  }

  const id = path.basename(filename, path.extname(filename));
  const filePath = path.join(memDir, filename);

  let exists = false;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from memDir + validated basename
    exists = fs.existsSync(filePath);
  } catch {
    exists = false;
  }

  return { id, title, description, section, filePath, exists };
}

/** Parse MEMORY.md content into MemoryEntry records. */
function parseMemoryIndex(content: string, memDir: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  let currentSection = '';

  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();

    if (line.startsWith('## ')) {
      currentSection = line.slice(3).trim();
      continue;
    }

    if (!line.startsWith('-')) continue;

    const entry = parseBulletLine(line, currentSection, memDir);
    if (entry) {
      entries.push(entry);
    } else if (line.includes('](')) {
      // Looked like a link-bullet but failed to parse — warn and skip.
      log.warn('[memoryReader] skipping malformed bullet line:', line.slice(0, 80));
    }
  }

  return entries;
}

/**
 * Read and parse the MEMORY.md index for the given project cwd.
 * Returns [] if the file or directory does not exist.
 */
export async function listMemoryEntries(cwd: string): Promise<MemoryEntry[]> {
  const memDir = getProjectMemoryDir(cwd);
  const indexPath = path.join(memDir, 'MEMORY.md');

  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from os.homedir() + sanitized cwd
    content = await fs.promises.readFile(indexPath, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    log.warn('[memoryReader] unexpected error reading MEMORY.md:', err);
    return [];
  }

  return parseMemoryIndex(content, memDir);
}

/**
 * Read the content of a single memory entry identified by its id (filename
 * without extension).  Returns null if the file does not exist.
 *
 * Path security: resolves the target and validates it stays inside memDir.
 */
export async function readMemoryEntry(
  cwd: string,
  id: string,
): Promise<{ content: string } | null> {
  const memDir = getProjectMemoryDir(cwd);

  // id must not contain path separators or traversal sequences.
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    log.warn('[memoryReader] rejecting traversal id:', id);
    return null;
  }

  const candidate = path.join(memDir, `${id}.md`);
  const resolved = path.resolve(candidate);
  const resolvedDir = path.resolve(memDir);

  const normResolved = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  const normDir = process.platform === 'win32' ? resolvedDir.toLowerCase() : resolvedDir;

  if (!normResolved.startsWith(normDir + path.sep)) {
    log.warn('[memoryReader] path traversal rejected for id:', id);
    return null;
  }

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path validated to stay within memDir above
    const content = await fs.promises.readFile(resolved, 'utf8');
    return { content };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return null;
    log.warn('[memoryReader] unexpected error reading entry:', id, err);
    return null;
  }
}
