/**
 * claudeMdGeneratorSupport.ts — Helpers for CLAUDE.md generation.
 *
 * Extracted from claudeMdGenerator.ts to stay under the 300-line limit.
 * Contains directory discovery, file listing, prompt building, Claude CLI
 * spawning, file writing, and git change detection.
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types (re-exported for the main module)
// ---------------------------------------------------------------------------

export interface ClaudeMdGenerationResult {
  dirPath: string;
  filePath: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  error?: string;
}

export interface ClaudeMdGenerationStatus {
  running: boolean;
  currentDir?: string;
  progress?: { completed: number; total: number };
  lastRun?: { timestamp: number; results: ClaudeMdGenerationResult[] };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_START_MARKER = '<!-- claude-md-auto:start -->';
const AUTO_END_MARKER = '<!-- claude-md-auto:end -->';
const MANUAL_PRESERVED_MARKER = '<!-- claude-md-manual:preserved -->';

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.claude', 'build', 'out']);

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const MAX_DEPTH = 3;
const CLAUDE_TIMEOUT_MS = 120_000;
const MAX_KEY_FILES = 5;
const KEY_FILE_HEAD_LINES = 50;
const MIN_FILE_COUNT = 3;
const KEY_FILE_MIN_LINES = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function toForwardSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// Directory discovery
// ---------------------------------------------------------------------------

export async function discoverDirectories(srcRoot: string, depth: number = 0): Promise<string[]> {
  if (depth > MAX_DEPTH) return [];

  let entries: import('fs').Dirent<string>[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- srcRoot from project directory discovery
    entries = (await fs.readdir(srcRoot, { withFileTypes: true })) as import('fs').Dirent<string>[];
  } catch {
    return [];
  }

  const dirs: string[] = [];
  let codeFileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        const childDir = path.join(srcRoot, entry.name);
        const childDirs = await discoverDirectories(childDir, depth + 1);
        dirs.push(...childDirs);
      }
    } else if (entry.isFile()) {
      if (CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        codeFileCount++;
      }
    }
  }

  if (codeFileCount >= MIN_FILE_COUNT) {
    dirs.push(srcRoot);
  }

  return dirs;
}

// ---------------------------------------------------------------------------
// File listing + key file excerpts
// ---------------------------------------------------------------------------

interface FileEntry {
  name: string;
  size: number;
  lines: number;
}

async function statAndReadFile(filePath: string, name: string): Promise<FileEntry | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from directory listing
    const stat = await fs.stat(filePath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from directory listing
    const content = await fs.readFile(filePath, 'utf-8');
    return { name, size: stat.size, lines: content.split('\n').length };
  } catch {
    return null;
  }
}

export async function buildFileListing(dirPath: string): Promise<FileEntry[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath from project directory listing
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: FileEntry[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    const result = await statAndReadFile(path.join(dirPath, entry.name), entry.name);
    if (result) files.push(result);
  }

  return files.sort((a, b) => b.lines - a.lines);
}

export async function readKeyFileExcerpts(
  dirPath: string,
  fileListing: FileEntry[],
): Promise<string> {
  const keyFiles = fileListing.filter((f) => f.lines >= KEY_FILE_MIN_LINES).slice(0, MAX_KEY_FILES);

  if (keyFiles.length === 0) return '';

  const excerpts: string[] = [];
  for (const file of keyFiles) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from directory listing
      const content = await fs.readFile(path.join(dirPath, file.name), 'utf-8');
      const lines = content.split('\n').slice(0, KEY_FILE_HEAD_LINES);
      excerpts.push(
        `### ${file.name} (first ${KEY_FILE_HEAD_LINES} lines of ${file.lines}):\n\`\`\`\n${lines.join('\n')}\n\`\`\``,
      );
    } catch {
      // Skip unreadable files
    }
  }

  return excerpts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Parent CLAUDE.md reader
// ---------------------------------------------------------------------------

export async function readParentClaudeMd(
  dirPath: string,
  projectRoot: string,
): Promise<string | null> {
  let current = path.dirname(dirPath);
  while (current.length >= projectRoot.length) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- candidate from ancestor directory walk
      return await fs.readFile(path.join(current, 'CLAUDE.md'), 'utf-8');
    } catch {
      // No CLAUDE.md here, go up
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPromptHeader(relPath: string, fileListStr: string): string {
  return `You are generating a CLAUDE.md file for a directory in a codebase.

## Directory
Path: ${relPath}/

## Files in this directory
${fileListStr}

`;
}

function buildPromptFooter(): string {
  return `## Instructions
Generate concise, useful CLAUDE.md content for this directory. Include:
1. A one-line summary of what this directory does
2. Key files and their roles (table format preferred)
3. Important patterns or conventions specific to this directory
4. Any gotchas or non-obvious behaviors
5. Dependencies and relationships with other parts of the codebase

Keep it practical and concise. No boilerplate. No generic advice.
Output ONLY the markdown content — no wrapping fences, no preamble.`;
}

export async function buildPrompt(dirPath: string, projectRoot: string): Promise<string> {
  const relPath = toForwardSlash(path.relative(projectRoot, dirPath));
  const fileListing = await buildFileListing(dirPath);
  const keyExcerpts = await readKeyFileExcerpts(dirPath, fileListing);
  const parentContent = await readParentClaudeMd(dirPath, projectRoot);

  const fileListStr = fileListing
    .map((f) => `  - ${f.name} (${f.lines} lines, ${Math.round(f.size / 1024)}KB)`)
    .join('\n');

  let prompt = buildPromptHeader(relPath, fileListStr);
  if (keyExcerpts) prompt += `## Key file excerpts\n${keyExcerpts}\n\n`;
  if (parentContent)
    prompt += `## Parent CLAUDE.md (for context)\n\`\`\`\n${parentContent.slice(0, 2000)}\n\`\`\`\n\n`;
  prompt += buildPromptFooter();

  return prompt;
}

// ---------------------------------------------------------------------------
// Claude CLI spawner
// ---------------------------------------------------------------------------

export function spawnClaude(prompt: string, model: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text', '--model', model];
    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: CLAUDE_TIMEOUT_MS,
      cwd: cwd || undefined,
      env: { ...process.env, OUROBOROS_INTERNAL: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => reject(new Error(`Failed to spawn claude: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
    });

    child.stdin.write(prompt);
    child.stdin.end();

    setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS / 1000}s`));
    }, CLAUDE_TIMEOUT_MS);
  });
}

// ---------------------------------------------------------------------------
// CLAUDE.md file writer
// ---------------------------------------------------------------------------

async function readExistingContent(filePath: string): Promise<string | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from project directory
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function writeContent(filePath: string, content: string): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- filePath from project directory
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function writeClaudeMd(
  filePath: string,
  generatedContent: string,
): Promise<'created' | 'updated'> {
  const existingContent = await readExistingContent(filePath);
  const autoBlock = `${AUTO_START_MARKER}\n${generatedContent}\n${AUTO_END_MARKER}`;

  if (existingContent === null) {
    await writeContent(filePath, autoBlock + '\n');
    return 'created';
  }

  const startIdx = existingContent.indexOf(AUTO_START_MARKER);
  const endIdx = existingContent.indexOf(AUTO_END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existingContent.slice(0, startIdx);
    const after = existingContent.slice(endIdx + AUTO_END_MARKER.length);
    await writeContent(filePath, before + autoBlock + after);
    return 'updated';
  }

  await writeContent(filePath, `${autoBlock}\n\n${MANUAL_PRESERVED_MARKER}\n${existingContent}`);
  return 'updated';
}

// ---------------------------------------------------------------------------
// Git change detection
// ---------------------------------------------------------------------------

export async function getChangedDirectories(projectRoot: string): Promise<Set<string>> {
  return new Promise((resolve) => {
    const child = spawn('git', ['status', '--porcelain', '-u'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(new Set()));
    child.on('close', () => {
      const dirs = new Set<string>();
      for (const line of stdout.split('\n').filter(Boolean)) {
        const filePath = line.slice(3).trim();
        if (filePath) dirs.add(path.join(projectRoot, path.dirname(filePath)));
      }
      resolve(dirs);
    });
  });
}
