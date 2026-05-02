/**
 * memoryWriter.ts — Write and delete operations for project memory entries.
 *
 * Atomic write pattern: write to <id>.md.tmp, then fs.rename to <id>.md.
 * A failed rename leaves the .tmp file but never corrupts the original.
 *
 * MEMORY.md index patching: description changes update the bullet's hook text;
 * file is read → patched → written atomically via the same temp-rename pattern.
 */

import fs from 'fs';
import path from 'path';

import log from '../logger';
import { getProjectMemoryDir, readMemoryEntry } from './memoryReader';

export type MemoryType = 'user' | 'feedback' | 'project' | 'reference';

const VALID_TYPES: ReadonlySet<string> = new Set(['user', 'feedback', 'project', 'reference']);

export interface WriteFrontmatter {
  description: string;
  type: MemoryType;
}

interface WriteResult {
  success: true;
  id: string;
}

interface WriteError {
  success: false;
  error: string;
}

function validateId(id: string): string | null {
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    return 'id contains path-traversal characters';
  }
  return null;
}

function resolveEntryPath(memDir: string, id: string): string | null {
  const candidate = path.join(memDir, `${id}.md`);
  const resolved = path.resolve(candidate);
  const resolvedDir = path.resolve(memDir);
  const norm = (p: string): string =>
    process.platform === 'win32' ? p.toLowerCase() : p;
  if (!norm(resolved).startsWith(norm(resolvedDir) + path.sep)) return null;
  return resolved;
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path validated to stay within memDir by caller
  await fs.promises.writeFile(tmpPath, content, 'utf8');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- tmpPath is tmpPath derived from validated filePath
  await fs.promises.rename(tmpPath, filePath);
}

function buildEntryContent(id: string, frontmatter: WriteFrontmatter, content: string): string {
  return `---\nname: ${id}\ndescription: ${frontmatter.description}\ntype: ${frontmatter.type}\n---\n\n${content}`;
}

/** Replace the description hook text on the MEMORY.md bullet for this id. */
function patchIndexLine(indexContent: string, id: string, description: string): string {
  const lines = indexContent.split('\n');
  const patched = lines.map((line) => {
    const trimmed = line.trimEnd();
    // Match: - [Title](id.md) — old description
    if (!trimmed.startsWith('-')) return line;
    if (!trimmed.includes(`](${id}.md)`)) return line;
    // Rebuild: preserve the link part, replace trailing description
    const linkEnd = trimmed.indexOf(')');
    if (linkEnd < 0) return line;
    const linkPart = trimmed.slice(0, linkEnd + 1);
    return description ? `${linkPart} — ${description}` : linkPart;
  });
  return patched.join('\n');
}

async function updateIndexDescription(
  memDir: string,
  id: string,
  description: string,
): Promise<void> {
  const indexPath = path.join(memDir, 'MEMORY.md');
  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- indexPath is memDir + 'MEMORY.md'
    content = await fs.promises.readFile(indexPath, 'utf8');
  } catch {
    return; // no index yet — nothing to patch
  }
  const patched = patchIndexLine(content, id, description);
  if (patched === content) return;
  await atomicWrite(indexPath, patched);
}

/**
 * Atomically rewrite a memory entry file and optionally patch the MEMORY.md
 * index if the description changed.
 */
export async function writeMemoryEntry(
  cwd: string,
  id: string,
  content: string,
  frontmatter: WriteFrontmatter,
): Promise<WriteResult | WriteError> {
  const idErr = validateId(id);
  if (idErr) return { success: false, error: idErr };

  if (!VALID_TYPES.has(frontmatter.type)) {
    return { success: false, error: `invalid type: ${frontmatter.type}` };
  }

  const memDir = getProjectMemoryDir(cwd);
  const entryPath = resolveEntryPath(memDir, id);
  if (!entryPath) return { success: false, error: 'path traversal detected' };

  const entryContent = buildEntryContent(id, frontmatter, content);
  try {
    await atomicWrite(entryPath, entryContent);
    await updateIndexDescription(memDir, id, frontmatter.description);
    return { success: true, id };
  } catch (err) {
    log.warn('[memoryWriter] write failed for id:', id, err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function removeIndexEntry(memDir: string, id: string): Promise<void> {
  const indexPath = path.join(memDir, 'MEMORY.md');
  let content: string;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- indexPath is memDir + 'MEMORY.md'
    content = await fs.promises.readFile(indexPath, 'utf8');
  } catch {
    return;
  }
  const filtered = content
    .split('\n')
    .filter((line) => !line.trim().startsWith('-') || !line.includes(`](${id}.md)`))
    .join('\n');
  if (filtered === content) return;
  await atomicWrite(indexPath, filtered);
}

/**
 * Delete a memory entry file and remove its MEMORY.md index line.
 * Idempotent: if the file is already absent, returns success.
 */
export async function deleteMemoryEntry(
  cwd: string,
  id: string,
): Promise<{ success: true } | WriteError> {
  const idErr = validateId(id);
  if (idErr) return { success: false, error: idErr };

  const memDir = getProjectMemoryDir(cwd);
  const entryPath = resolveEntryPath(memDir, id);
  if (!entryPath) return { success: false, error: 'path traversal detected' };

  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- entryPath validated to stay within memDir
    await fs.promises.unlink(entryPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      log.warn('[memoryWriter] delete failed for id:', id, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
    // ENOENT = already absent; idempotent success
  }

  try {
    await removeIndexEntry(memDir, id);
  } catch (err) {
    log.warn('[memoryWriter] index patch failed after delete for id:', id, err);
    // Don't fail the delete; orphan index entry is cosmetically wrong but not data-loss
  }

  return { success: true };
}

// Re-export readMemoryEntry so memory.ts can import from one place.
export { readMemoryEntry };
