/**
 * rulesDirectoryManager.ts — CRUD for .claude/rules/*.md files.
 *
 * Writes to ~/.claude/rules/ (global) or {projectRoot}/.claude/rules/ (project).
 */

import type { ClaudeConfigScope, RuleDefinition } from '@shared/types/claudeConfig';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const CLAUDE_DIR = '.claude';
const RULES_DIR = 'rules';
const MD_EXT = '.md';
const DESC_MAX_LEN = 80;

function resolveRulesDir(
  scope: ClaudeConfigScope,
  projectRoot?: string,
): string {
  if (scope === 'global') {
    return path.join(os.homedir(), CLAUDE_DIR, RULES_DIR);
  }
  if (!projectRoot) throw new Error('projectRoot required for project scope');
  return path.join(projectRoot, CLAUDE_DIR, RULES_DIR);
}

function resolveRulePath(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): string {
  const dir = resolveRulesDir(scope, projectRoot);
  const safeName = path.basename(name).replace(/[^a-zA-Z0-9_-]/g, '-');
  return path.join(dir, safeName + MD_EXT);
}

function extractDescription(content: string): string {
  const firstLine = content
    .split('\n')
    .find((line) => line.trim().length > 0);
  if (!firstLine) return '';
  const trimmed = firstLine.trim();
  return trimmed.length > DESC_MAX_LEN
    ? trimmed.slice(0, DESC_MAX_LEN)
    : trimmed;
}

async function scanDir(
  dirPath: string,
  scope: ClaudeConfigScope,
): Promise<RuleDefinition[]> {
  let entries: string[];
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir from resolveRulesDir
    entries = await fs.readdir(dirPath);
  } catch {
    return [];
  }

  const results: RuleDefinition[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(MD_EXT)) continue;
    const filePath = path.join(dirPath, entry);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from readdir entry
      const content = await fs.readFile(filePath, 'utf8');
      results.push({
        id: entry.replace(/\.md$/i, ''),
        scope,
        filePath,
        content,
        description: extractDescription(content),
      });
    } catch {
      // skip unreadable files
    }
  }
  return results;
}

/** Discover all rule .md files from global and/or project scopes. */
export async function discoverRuleFiles(
  projectRoot?: string,
): Promise<RuleDefinition[]> {
  const globalDir = resolveRulesDir('global');
  const globalRules = await scanDir(globalDir, 'global');

  if (!projectRoot) return globalRules;

  const projectDir = resolveRulesDir('project', projectRoot);
  const projectRules = await scanDir(projectDir, 'project');
  return [...globalRules, ...projectRules];
}

/** Create a new rule file. Returns absolute path. */
export async function createRuleFile(
  scope: ClaudeConfigScope,
  name: string,
  content: string,
  projectRoot?: string,
): Promise<string> {
  const filePath = resolveRulePath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dir built from known constants + scope
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveRulePath
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

/** Read a rule file by scope + name. */
export async function readRuleFile(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<string> {
  const filePath = resolveRulePath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveRulePath
  return fs.readFile(filePath, 'utf8');
}

/** Update a rule file's content. */
export async function updateRuleFile(
  scope: ClaudeConfigScope,
  name: string,
  content: string,
  projectRoot?: string,
): Promise<void> {
  const filePath = resolveRulePath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveRulePath
  await fs.writeFile(filePath, content, 'utf8');
}

/** Delete a rule file. */
export async function deleteRuleFile(
  scope: ClaudeConfigScope,
  name: string,
  projectRoot?: string,
): Promise<void> {
  const filePath = resolveRulePath(scope, name, projectRoot);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from resolveRulePath
  await fs.unlink(filePath);
}
