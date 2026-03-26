/**
 * commandsDiscovery.ts — Discover Claude Code command files from native locations.
 *
 * Scans ~/.claude/commands/ (global → /user:*) and {projectRoot}/.claude/commands/ (project → /project:*).
 * No YAML frontmatter — files are plain markdown templates with $ARGUMENTS substitution.
 */

import type { CommandDefinition } from '@shared/types/claudeConfig';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const COMMANDS_DIR = 'commands';
const CLAUDE_DIR = '.claude';
const MD_EXT = '.md';
const DESC_MAX_LEN = 80;

function extractDescription(body: string): string {
  const lines = body.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.length > DESC_MAX_LEN
        ? trimmed.slice(0, DESC_MAX_LEN) + '...'
        : trimmed;
    }
  }
  return '';
}

async function listMdFiles(dirPath: string): Promise<string[]> {
  try {
    const resolvedDir = path.resolve(dirPath);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dirPath is built from known base dirs (homedir, projectRoot)
    const entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(MD_EXT))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

async function parseCommandFile(
  filePath: string,
  fileName: string,
  scope: 'user' | 'project',
): Promise<CommandDefinition | null> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path built from readdir entry
    const body = await fs.readFile(filePath, 'utf8');
    const id = fileName.replace(MD_EXT, '');
    return {
      id,
      name: id,
      scope,
      filePath,
      body,
      description: extractDescription(body),
    };
  } catch {
    return null;
  }
}

async function discoverFromDir(
  dirPath: string,
  scope: 'user' | 'project',
): Promise<CommandDefinition[]> {
  const fileNames = await listMdFiles(dirPath);
  const results = await Promise.all(
    fileNames.map((name) =>
      parseCommandFile(path.join(dirPath, name), name, scope),
    ),
  );
  return results.filter((r): r is CommandDefinition => r !== null);
}

/** Discover all global (/user:*) commands from ~/.claude/commands/. */
export async function discoverGlobalCommands(): Promise<CommandDefinition[]> {
  const dir = path.join(os.homedir(), CLAUDE_DIR, COMMANDS_DIR);
  return discoverFromDir(dir, 'user');
}

/** Discover all project (/project:*) commands from {projectRoot}/.claude/commands/. */
export async function discoverProjectCommands(
  projectRoot: string,
): Promise<CommandDefinition[]> {
  const dir = path.join(projectRoot, CLAUDE_DIR, COMMANDS_DIR);
  return discoverFromDir(dir, 'project');
}

/** Discover commands from both global and project scopes. */
export async function discoverCommands(
  projectRoot?: string,
): Promise<CommandDefinition[]> {
  const globalCmds = discoverGlobalCommands();
  const projectCmds = projectRoot
    ? discoverProjectCommands(projectRoot)
    : Promise.resolve([]);
  const [global, project] = await Promise.all([globalCmds, projectCmds]);
  return [...global, ...project];
}
