/**
 * commandsManager.ts — CRUD for Claude Code command .md files.
 *
 * Writes to ~/.claude/commands/ (global) or {projectRoot}/.claude/commands/ (project).
 */

import type { ClaudeConfigScope } from '@shared/types/claudeConfig';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CLAUDE_DIR = '.claude';
const COMMANDS_DIR = 'commands';
const MD_EXT = '.md';

function resolveCommandsDir(
  scope: ClaudeConfigScope,
  projectRoot?: string,
): string {
  if (scope === 'global') {
    return path.join(os.homedir(), CLAUDE_DIR, COMMANDS_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return path.join(projectRoot, CLAUDE_DIR, COMMANDS_DIR);
}

function resolveCommandPath(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): string {
  const dir = resolveCommandsDir(scope, projectRoot);
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(dir, safeName + MD_EXT);
}

/** Create a new command file. Returns absolute path. */
export async function createCommand(
  scope: ClaudeConfigScope,
  name: string,
  content: string,
  projectRoot?: string,
): Promise<string> {
  const filePath = resolveCommandPath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir built from known constants + scope
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveCommandPath
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

/** Read a command file by scope + name. */
export async function readCommand(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<string> {
  const filePath = resolveCommandPath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveCommandPath
  return fs.readFile(filePath, 'utf8');
}

/** Update a command file's content. */
export async function updateCommand(
  scope: ClaudeConfigScope,
  name: string,
  content: string,
  projectRoot?: string,
): Promise<void> {
  const filePath = resolveCommandPath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveCommandPath
  await fs.writeFile(filePath, content, 'utf8');
}

/** Delete a command file. */
export async function deleteCommand(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<void> {
  const filePath = resolveCommandPath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveCommandPath
  await fs.unlink(filePath);
}
